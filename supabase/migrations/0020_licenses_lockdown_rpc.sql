-- 0020_licenses_lockdown_rpc.sql — фикс security-warnings от Supabase
-- линтера для миграции 0019.
--
-- 1) license_can_activate имела mutable search_path, что разрешает
--    атаку с подменой PATH-а (SECURITY DEFINER функция без жёсткого
--    PATH-а может вызвать `licenses` из другой схемы). Фиксируем
--    'public, pg_temp'.
-- 2) RPC висел открыто для anon/authenticated через
--    /rest/v1/rpc/license_can_activate — снаружи можно было перебирать
--    пары (license_id, fingerprint). Edge Function ходит через
--    service_role и обходит GRANT, поэтому revoke её не ломает.

create or replace function public.license_can_activate(
  p_license_id   uuid,
  p_fingerprint  text
) returns table (ok boolean, reason text, license public.licenses)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.licenses;
  used integer;
begin
  select * into l from public.licenses where id = p_license_id for update;
  if not found then
    return query select false, 'license_not_found'::text, null::public.licenses;
    return;
  end if;
  if l.status <> 'active' then
    return query select false, l.status::text, l;
    return;
  end if;
  if l.expires_at < now() then
    return query select false, 'expired'::text, l;
    return;
  end if;
  if exists (
    select 1 from public.license_sessions
    where license_id = p_license_id and machine_fingerprint = p_fingerprint
  ) then
    return query select true, 'reactivate'::text, l;
    return;
  end if;
  select count(*) into used from public.license_sessions
  where license_id = p_license_id
    and last_heartbeat_at > now() - interval '30 days';
  if used >= l.seats then
    return query select false, 'no_free_seats'::text, l;
    return;
  end if;
  return query select true, 'new_seat'::text, l;
end $$;

revoke execute on function public.license_can_activate(uuid, text) from public, anon, authenticated;
