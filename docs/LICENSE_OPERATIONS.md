# EngiBoard — License operations

Что делать как оператор системы лицензий. Все команды выполняются в Supabase Dashboard → SQL Editor.

---

## 0. Однократная настройка (DO ONCE)

### 0.1 Прописать JWT-секрет в Supabase env

Edge Functions подписывают eb-license-jwt этим секретом. Без него используется дефолт `dev-only-change-me` (НЕБЕЗОПАСНО).

1. Supabase Dashboard → Project Settings → Edge Functions → Environment variables
2. Add new: `LICENSE_JWT_SECRET` = (значение ниже, сгенерировано локально)

Сгенерированное значение для этой инсталляции:
```
tw+cYPZ6pXfq/CB/9iglG+5IPOLLlm35L+/mpyNnapndty8NkmPXsKGeqS6ajOKR
```

> ВНИМАНИЕ: если потеряешь — все выданные JWT станут невалидными после первой ротации. Все пользователи должны будут пере-активировать. Сохрани в 1Password / Bitwarden.

После добавления переменной — Edge Functions нужно ре-задеплоить, чтобы они подтянули новое значение. Это произойдёт автоматически при следующем `mcp deploy_edge_function`, или нажми в Dashboard "Redeploy".

### 0.2 Включить gate на клиенте

В `dist/index.html` найти строку:
```js
const LICENSE_GATE_ENABLED = false;
```
Сменить на `true`, поднять версию до v0.2.0, сделать релиз. С этого момента ВСЕМ новым клиентам приложение покажет экран активации.

До включения: все коммитимые версии (v0.1.16x) работают без проверки. Это нужный буфер чтобы успеть выдать ключи DB-тестеру и себе.

---

## 1. Создать лицензию (Issue a license)

```sql
-- Создать ключ для конкретного user_id (берётся из auth.users)
insert into public.licenses (user_id, key, plan, seats, expires_at)
values (
  '00000000-0000-0000-0000-000000000000',     -- ← реальный auth.users.id
  'EB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  'pro',                                       -- 'trial' | 'pro' | 'team' | 'field-pro' | 'internal'
  2,                                           -- seats
  now() + interval '1 year'                    -- срок действия
)
returning key, expires_at;
```

Вернётся что-то вроде:
```
key                    | expires_at
EB-A3F2B1C4D5E6F7A8    | 2027-06-08 ...
```

Этот key пересылаешь пользователю (email, мессенджер). На своём ноуте он:
1. Запускает EngiBoard, логинится email+пароль
2. Видит экран активации
3. Вставляет ключ → клик Activate

### Быстрые шаблоны

**Trial (14 дней, 1 seat):**
```sql
insert into public.licenses (user_id, key, plan, seats, expires_at)
values (
  (select id from auth.users where email = 'tester@example.com'),
  'EB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  'trial', 1, now() + interval '14 days'
) returning key;
```

**Internal (для себя — infinite seats, годовой):**
```sql
insert into public.licenses (user_id, key, plan, seats, expires_at)
values (
  (select id from auth.users where email = 'xqrmedia@gmail.com'),
  'EB-INTERNAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  'internal', 99, now() + interval '5 years'
) returning key;
```

**Field-Pro (30-дневный offline grace):**
```sql
insert into public.licenses (user_id, key, plan, seats, expires_at)
values (
  (select id from auth.users where email = 'engineer@example.com'),
  'EB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  'field-pro', 2, now() + interval '1 year'
) returning key;
```

---

## 2. Посмотреть устройства пользователя

```sql
select
  l.key,
  l.plan,
  l.seats,
  l.status,
  l.expires_at,
  s.machine_label,
  s.os,
  s.app_version,
  s.last_heartbeat_at,
  age(now(), s.last_heartbeat_at) as offline_for
from public.licenses l
left join public.license_sessions s on s.license_id = l.id
where l.user_id = (select id from auth.users where email = 'user@example.com')
order by l.created_at desc, s.last_heartbeat_at desc;
```

---

## 3. Деактивировать устройство (освободить seat)

```sql
-- Удалить конкретную сессию по machine_label
delete from public.license_sessions
where license_id = (select id from public.licenses where key = 'EB-XXXX')
  and machine_label = 'Aleksey MacBook Pro';

-- Или: удалить все сессии этой лицензии (полный сброс)
delete from public.license_sessions
where license_id = (select id from public.licenses where key = 'EB-XXXX');
```

---

## 4. Продлить лицензию

```sql
update public.licenses
set expires_at = now() + interval '1 year',
    updated_at = now()
where key = 'EB-XXXX';
```

---

## 5. Заблокировать / разблокировать

```sql
-- Suspend (пользователь увидит "license_suspended" при следующем heartbeat)
update public.licenses set status = 'suspended', updated_at = now() where key = 'EB-XXXX';

-- Revoke (необратимо, лучше удалить)
update public.licenses set status = 'revoked', updated_at = now() where key = 'EB-XXXX';

-- Активировать обратно
update public.licenses set status = 'active', updated_at = now() where key = 'EB-XXXX';
```

---

## 6. Статистика

**Сколько активных пользователей за последние 7 дней:**
```sql
select count(distinct user_id) as active_users
from public.license_sessions
where last_heartbeat_at > now() - interval '7 days';
```

**Распределение по планам:**
```sql
select plan, count(*) from public.licenses where status = 'active' group by plan;
```

**Лицензии истекающие в ближайшие 30 дней (для писем-напоминаний):**
```sql
select l.key, u.email, l.expires_at
from public.licenses l
join auth.users u on u.id = l.user_id
where l.status = 'active'
  and l.expires_at < now() + interval '30 days'
  and l.expires_at > now()
order by l.expires_at;
```

**Заброшенные сессии (heartbeat > 30 дней назад — место занято впустую):**
```sql
select l.key, s.machine_label, s.last_heartbeat_at
from public.license_sessions s
join public.licenses l on l.id = s.license_id
where s.last_heartbeat_at < now() - interval '30 days';
```

Их можно подчищать раз в месяц одной командой:
```sql
delete from public.license_sessions
where last_heartbeat_at < now() - interval '30 days';
```

---

## 7. Что видит пользователь при разных проблемах

| Сервер вернул | UI пишет |
|---|---|
| `license_not_found` | "This license key does not exist." |
| `license_belongs_to_other_user` | "This key belongs to a different EngiBoard account." |
| `expired` | "This license has expired. Renew it in your account." |
| `suspended` | "This license is suspended. Contact support." |
| `revoked` | "This license was revoked." |
| `no_free_seats` | "No free seats on this license. Deactivate the key on another device first." |
| `fingerprint_mismatch` | "Activation failed: fingerprint_mismatch" (показывается raw) |
| `no_jwt` / `bad_jwt` | "Your session expired. Sign in again." |
| `network: …` | "No internet connection. Try again in a moment." |

---

## 8. Аварийный режим — выключить gate

Если что-то критически сломалось на проде (пол-юзеров не могут активировать):

1. В репо: `dist/index.html` → `const LICENSE_GATE_ENABLED = false;`
2. Push commit, тегнуть `v0.2.X-patch`
3. CI собирает новые билды без гейта, пользователи обновляются (auto-update — TBD)

Альтернатива без релиза: выдать "internal"-ключ всем пострадавшим (см. §1).

---

## 9. Edge Functions — где смотреть логи

Supabase Dashboard → Edge Functions → license-activate / license-heartbeat → Logs.

Что искать в случае инцидента:
- `rpc_failed` — поломалась функция `license_can_activate` (миграция 0019 не применена?)
- `session_upsert_failed` — нарушение UNIQUE по `(license_id, fingerprint)` или RLS
- 500 без сообщения — нет `LICENSE_JWT_SECRET` env-var (см. §0.1)

---

## 10. Checklist первой выкатки v0.2.0

- [ ] `LICENSE_JWT_SECRET` в Supabase env (§0.1)
- [ ] Создать internal-ключ себе (`xqrmedia@gmail.com`)
- [ ] Создать internal-ключ DB
- [ ] Передать ключи в защищённом канале (1Password / Signal)
- [ ] В `dist/index.html` поставить `LICENSE_GATE_ENABLED = true`
- [ ] Поднять версию до `v0.2.0` в Cargo.toml и tauri.conf.json
- [ ] Тег `v0.2.0`, push, CI собирает релиз
- [ ] Локально активировать на своём ноуте — убедиться что работает
- [ ] DB активирует — убедиться что у него работает
- [ ] Только после этого приглашать новых тестеров
