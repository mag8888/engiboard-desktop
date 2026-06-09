-- 0019_licenses.sql — License gate (Phase 2 из docs/SECURITY_PLAN.md).
--
-- ВНИМАНИЕ: не применять без согласования с Алексеем. Эта миграция
-- вводит обязательную проверку лицензии на старте приложения. До тех
-- пор пока соответствующие Edge Functions (license-activate /
-- license-heartbeat) не задеплоены, миграция должна оставаться только
-- в репозитории.
--
-- Что вводим:
-- 1. Таблица `licenses` — план + seats + дата истечения, привязана к
--    user_id (Supabase auth).
-- 2. Таблица `license_sessions` — машино-сессии (fingerprint, последний
--    heartbeat); UNIQUE по (license_id, machine_fingerprint) — одна
--    машина = одна строка, не плодим.
-- 3. RPC `license_can_activate(p_license_id, p_fingerprint)` — проверка
--    свободного seat без race-condition (FOR UPDATE).
-- 4. RLS — пользователь видит только свои лицензии и сессии. Сами
--    Edge Functions ходят под service_role и обходят RLS.

create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  key          text not null unique, -- человекочитаемый ключ "EB-XXXX-YYYY-ZZZZ"
  plan         text not null default 'trial'
                  check (plan in ('trial','pro','team','field-pro')),
  seats        integer not null default 1 check (seats >= 1),
  status       text not null default 'active'
                  check (status in ('active','suspended','revoked','expired')),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists licenses_user_id_idx on public.licenses(user_id);
create index if not exists licenses_key_idx on public.licenses(key);
create index if not exists licenses_status_idx on public.licenses(status);

create table if not exists public.license_sessions (
  id                   uuid primary key default gen_random_uuid(),
  license_id           uuid not null references public.licenses(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  machine_fingerprint  text not null,
  machine_label        text,                     -- "Aleksey MacBook Pro"
  os                   text,                     -- 'macos' / 'windows' / 'linux'
  app_version          text,                     -- "0.1.159"
  last_heartbeat_at    timestamptz not null default now(),
  jwt_issued_at        timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (license_id, machine_fingerprint)
);

create index if not exists license_sessions_license_idx on public.license_sessions(license_id);
create index if not exists license_sessions_user_idx on public.license_sessions(user_id);
create index if not exists license_sessions_heartbeat_idx on public.license_sessions(last_heartbeat_at);

-- RPC: безопасная активация нового seat — блокирует строку license, считает
-- активные сессии, отказывает если seats заняты. Вызывать из Edge Function.
create or replace function public.license_can_activate(
  p_license_id   uuid,
  p_fingerprint  text
) returns table (ok boolean, reason text, license public.licenses)
language plpgsql security definer as $$
declare
  l public.licenses;
  used integer;
begin
  -- блокируем строку license, чтобы между двумя одновременными активациями
  -- не выдать seats на одного больше
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
  -- если такая машина уже зарегистрирована — переактивация ОК
  if exists (
    select 1 from public.license_sessions
    where license_id = p_license_id and machine_fingerprint = p_fingerprint
  ) then
    return query select true, 'reactivate'::text, l;
    return;
  end if;
  -- активных сессий < seats? Считаем активными те, где heartbeat был
  -- в течение последних 7 дней — старше считается отключённой и место освобождается.
  select count(*) into used from public.license_sessions
  where license_id = p_license_id
    and last_heartbeat_at > now() - interval '7 days';
  if used >= l.seats then
    return query select false, 'no_free_seats'::text, l;
    return;
  end if;
  return query select true, 'new_seat'::text, l;
end $$;

-- RLS
alter table public.licenses enable row level security;
alter table public.license_sessions enable row level security;

create policy "licenses_owner_select" on public.licenses
  for select using (auth.uid() = user_id);

create policy "licenses_owner_update_seats_label" on public.licenses
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "license_sessions_owner_select" on public.license_sessions
  for select using (auth.uid() = user_id);

create policy "license_sessions_owner_delete" on public.license_sessions
  for delete using (auth.uid() = user_id);

-- Comment для документации в БД
comment on table public.licenses is
  'EngiBoard license records — gated EXE access. See docs/SECURITY_PLAN.md.';
comment on table public.license_sessions is
  'Per-machine sessions bound to a license. UNIQUE on (license_id, machine_fingerprint).';
