# send-invite (Supabase Edge Function)

Отправляет приглашение по почте с технического домена через [Resend](https://resend.com). Клиент вызывает её сразу после успешного INSERT в `project_invites`.

## Быстрая настройка (10 минут)

### 1. Зарегистрируй Resend (бесплатно)

- Зайди на https://resend.com → Sign up
- Free tier: **100 писем/день, 3000/месяц** — этого хватит на старте
- Дашборд → **API Keys** → Create API Key → скопируй значение `re_xxxxxxxx`

Для начала Resend позволяет отправлять с их домена `onboarding@resend.dev` — не нужна верификация DNS. Позже можно подключить свой домен (`invites@engiboard.com`) через Resend → Domains.

### 2. Установи Supabase CLI (если ещё нет)

```bash
brew install supabase/tap/supabase   # macOS
# или
npm install -g supabase              # любая ОС
```

### 3. Залогинься и привяжи проект

```bash
cd /Users/alex/Documents/Brain/Brain/02_ПРОЕКТЫ/Скриншоттер/engiboard-desktop
supabase login                       # откроет браузер для авторизации
supabase link --project-ref gselxucvcomqlfyogidz
```

(project-ref берётся из Cloud Sync · Supabase в Profile приложения)

### 4. Положи Resend API key как секрет

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
```

Опционально — кастомный From-адрес (после того как добавишь свой домен в Resend):

```bash
supabase secrets set INVITE_FROM_EMAIL="EngiBoard <invites@yourdomain.com>"
```

### 5. Задеплой функцию

```bash
supabase functions deploy send-invite --no-verify-jwt
```

Флаг `--no-verify-jwt` — потому что клиент сам передаёт авторизацию через Supabase SDK; функция не требует отдельной JWT-проверки на этом уровне.

### 6. Проверь

В приложении, в Profile → Team:
1. Переключись на **cloud-проект** (не demo)
2. Введи свой email → Add
3. Должно прийти настоящее письмо от `onboarding@resend.dev` с темой "X invited you to..."

Если письмо не пришло — проверь логи:

```bash
supabase functions logs send-invite --tail
```

## Тест локально (опционально)

```bash
# В одном терминале
supabase functions serve send-invite --env-file .env.local --no-verify-jwt

# .env.local:
# RESEND_API_KEY=re_xxxxxxxx

# В другом терминале
curl -X POST http://localhost:54321/functions/v1/send-invite \
  -H "Content-Type: application/json" \
  -d '{"to":"you@example.com","inviter_name":"Alex","project_name":"Test","link":"engiboard://invite/abc123"}'
```

## Fallback

Если функция не задеплоена или Resend упал — клиент автоматически откатывается на старый `mailto:` (открывает почтовый клиент на машине пользователя). То есть приглашения работают в любом случае, просто менее удобно для получателя.
