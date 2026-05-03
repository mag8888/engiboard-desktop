# Supabase setup для EngiBoard

Sprint **S2 P0-3**: переход с localStorage на Supabase для синхронизации между устройствами.

Проект: `gselxucvcomqlfyogidz` ([dashboard](https://supabase.com/dashboard/project/gselxucvcomqlfyogidz))
Auth: Google OAuth (уже настроен в v0.1.6).

## Что создаётся

| | |
|---|---|
| **5 таблиц** | `profiles`, `projects`, `tasks`, `comments`, `image_comments` |
| **RLS политики** | Каждый юзер видит только свои данные (v1) |
| **Storage** | Bucket `screenshots`, 10MB лимит, private (signed URLs) |
| **Trigger** | Авто-создание profile при signup |

## Применение миграций

### Вариант A — через Supabase Dashboard (просто)

1. Открыть [SQL Editor](https://supabase.com/dashboard/project/gselxucvcomqlfyogidz/sql/new)
2. Скопировать содержимое `migrations/0001_initial_schema.sql` → Run
3. То же для `0002_rls_policies.sql`
4. То же для `0003_storage.sql`
5. Проверить: `Database → Tables` должны быть 5 таблиц

### Вариант B — через Supabase CLI (для воспроизводимости)

```bash
# 1. Установить CLI
brew install supabase/tap/supabase

# 2. Залогиниться
supabase login

# 3. Залинковать проект
cd ~/Downloads/engiboard-desktop
supabase link --project-ref gselxucvcomqlfyogidz

# 4. Применить миграции
supabase db push
```

### Вариант C — через psql (для CI/scripted)

```bash
export SUPABASE_DB_URL="postgresql://postgres.gselxucvcomqlfyogidz:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_initial_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_rls_policies.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_storage.sql
```

## Проверка после миграций

```sql
-- В SQL Editor
select schemaname, tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
  order by tablename;
-- Должно вывести 5 таблиц с rowsecurity = true

select id, name, public from storage.buckets where id = 'screenshots';
-- Должно вернуть одну строку, public = false
```

## Откат миграции (если что-то пошло не так)

```sql
drop table if exists public.image_comments cascade;
drop table if exists public.comments cascade;
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
drop table if exists public.profiles cascade;
delete from storage.buckets where id = 'screenshots';
```

## Что дальше (план в коде)

После миграций я могу подключить JS клиент:
- Шаг 2: `db.js` wrapper над Supabase JS client (CRUD для всех таблиц)
- Шаг 3: Заменить `TASKS = [...]` массив на `await db.tasks.list(projectId)`
- Шаг 4: Заменить `localStorage.setItem('eb_tasks', ...)` на upserts
- Шаг 5: Заменить inline base64 в `shot1`/`shot2` на Storage URLs
- Шаг 6: Тест двух-устройственной синхронизации

## Не входит в S2 (будущие миграции)

- `0004_project_members.sql` — Sprint S4 P1-4 sharing
- `0005_realtime.sql` — Sprint S4 P1-3 (включит REPLICA IDENTITY на comments + Realtime)
- `0006_archived_at.sql` — soft delete

---

🔒 **Service role key никогда не коммитим.** Используем только anon key в клиенте.
