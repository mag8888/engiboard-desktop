# EngiBoard — план защиты дистрибутива

Версия документа: 2026-06-08.
Цель: сделать так, чтобы скопированный EXE/DMG на другом ноуте не работал, без рабочего ключа от сервера приложение блокировалось, а пользовательские файлы оставались под контролем.

---

## 1. Модель угроз

Реальные сценарии, от которых защищаемся:

| ID | Сценарий | Кто | Что теряем |
|---|---|---|---|
| T1 | Пользователь делится бинарём с другом, друг логинится своим email | случайный шер | потерянный платный seat |
| T2 | Пользователь даёт другу свой логин/пароль | сознательный шер | revenue loss, мультиаккаунт |
| T3 | Пират извлекает `dist/` из EXE, гоняет в браузере, заходит без сервера | продвинутый юзер | репутация, утечка кода |
| T4 | Пират подменяет `dist/index.html`, отключает проверки лицензии | атакующий | бесплатное использование |
| T5 | Атакующий получает доступ к файлам чужой задачи через прямую ссылку на Supabase Storage | злоумышленник | утечка PII заказчиков |
| T6 | Сотрудник тестера копирует EXE на другой ноут после увольнения | внутренний | утечка ноу-хау |

Чего НЕ защищаем (явно вне scope):
- Скриншоты экрана / съёмка с телефона — не победить.
- Реверс Rust-стороны через IDA/Ghidra на enterprise-уровне — слишком дорого для соло-стартапа.
- Watermark в скриншотах с user-id — отдельная фича, не security.

---

## 2. Текущий уровень защиты (что уже есть)

- Supabase Auth (email + пароль) — нет анонимного доступа.
- RLS на основных таблицах (миграции 0014-0018: `public_token`, `role_check`, `task_hidden`, `task_pinned`).
- Public-link токен — короткий, только read.
- Tauri 2 sandbox + `assetProtocol.scope: ["**"]` — широко, надо сузить.

Дыры:
- `withGlobalTauri: true` — все Tauri-команды видны из window.\_\_TAURI\_\_, можно дёргать из любого JS.
- `devtools` feature включён даже в release — пират открывает DevTools и читает state.
- Любой залогиненный пользователь может одновременно сидеть с 10 машин — нет ограничения seats.
- Supabase Storage bucket `task-screenshots` — нужно подтвердить, что RLS строго проверяет `auth.uid() = task.owner_id`.
- `dist/index.html` — 350+ КБ читабельного JS, легко вытащить.

---

## 3. Архитектура решения

### 3.1 Главный принцип

**Без свежего токена с сервера приложение не работает.** Локально хранится JWT с коротким TTL (например, 24 часа). Каждый час клиент пишет heartbeat серверу и получает новый JWT. Три неудачных heartbeat подряд → app переходит в read-only, через 7 дней без сети → полная блокировка с экраном "Connect to internet to reactivate".

### 3.2 Сущности

```
users (Supabase Auth — есть)
  id

licenses                   <-- новое
  id (uuid, pk)
  user_id (fk users)
  seats (int, default 1)
  plan (text: 'trial' | 'pro' | 'team')
  expires_at (timestamptz)
  created_at, updated_at

license_sessions           <-- новое
  id (uuid, pk)
  license_id (fk licenses)
  user_id (fk users)
  machine_fingerprint (text)  -- хэш UUID+hostname+CPU id
  machine_label (text)        -- "Aleksey MacBook Pro" для UI
  last_heartbeat_at (timestamptz)
  jwt_issued_at (timestamptz)
  created_at
  
  UNIQUE (license_id, machine_fingerprint)
```

### 3.3 Поток

```
[первый запуск EXE]
  → клиент собирает machine_fingerprint (Rust side)
  → клиент POST /functions/v1/license-activate
       {license_key, machine_fingerprint, machine_label}
  → сервер:
      ✓ ищет license по key
      ✓ проверяет: count(sessions where license_id = ...) < license.seats
      ✓ создаёт license_session
      ✓ возвращает JWT { license_id, session_id, exp: +24h }
  → клиент сохраняет JWT в OS keychain (через `keyring` crate)
  → стартует app

[каждый час, тикер в Rust]
  → POST /functions/v1/license-heartbeat
       Authorization: Bearer <JWT>
       body: { machine_fingerprint }
  → сервер:
      ✓ валидирует JWT
      ✓ сверяет fingerprint с тем, что в session
      ✓ обновляет last_heartbeat_at
      ✓ выдаёт новый JWT с продлённым exp
  → клиент перезаписывает JWT в keychain

[ошибка heartbeat — нет сети]
  → tolerate 3 промаха (3 часа)
  → потом UI-баннер "Reconnecting…", приложение деградирует в read-only
  → через 7 дней без heartbeat → JWT в keychain удаляется, экран блокировки

[вторая машина с тем же ключом]
  → POST /license-activate
  → сервер видит: sessions count = seats → 403
  → пользователь видит: "License already used on machine 'Aleksey MacBook Pro'. Deactivate it first via account.engiboard.com"
```

### 3.4 Machine fingerprint

Собирается на Rust-стороне (НЕ в JS):

- macOS: `system_profiler SPHardwareDataType | grep 'Hardware UUID'`
- Windows: `wmic csproduct get uuid`
- Linux: `/etc/machine-id`
- Дополнительно: хэш `hostname + первый MAC адрес сетевой карты + arch`

Хэш: SHA-256. Сохраняется в keychain рядом с JWT.

### 3.5 Защита файлов

- Supabase Storage bucket `task-screenshots` — RLS policy:
  ```sql
  CREATE POLICY "task_screenshots_owner_only" ON storage.objects
    FOR ALL USING (
      bucket_id = 'task-screenshots'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM tasks WHERE owner_id = auth.uid()
                                     OR id IN (SELECT task_id FROM task_members WHERE user_id = auth.uid())
      )
    );
  ```
- Подписанные URL (signed URLs) с TTL 10 минут вместо публичных.
- При revoke лицензии — сервер мог бы инвалидировать сессии, тогда signed-URL отказывает.

### 3.6 Анти-реверс на клиенте

Это поднимает планку, но не стена:

1. **Devtools off в release** — `Cargo.toml` убрать `"devtools"` из features.
2. **withGlobalTauri off** — `tauri.conf.json` → `false`. Все вызовы Tauri-команд только через инвоки внутри одного контекста.
3. **Минификация** — terser/esbuild на этапе билда, имена функций → `_a`, `_b`.
4. **Чувствительная логика — в Rust** — fingerprint, JWT validate, тикер heartbeat, decrypt cache.
5. **Локальный кеш скриншотов шифруется AES-256-GCM** ключом, выведенным из JWT. Без JWT → кеш мусор.
6. **CSP затянуть** — сейчас `"csp": null`, поставить:
   ```
   default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data: https:;
   ```
7. **Code signing** — Apple Developer ID ($99/год) + Windows EV cert ($300+/год). Без подписи OS будет ругаться при запуске.

### 3.7 Что НЕ внедряем

| Идея | Почему нет |
|---|---|
| Полная привязка ключа к 1 железке навсегда | UX-кошмар: пользователи меняют ноуты, переустанавливают ОС |
| Online-only без offline grace | EngiBoard для строек, там сеть нестабильная |
| Watermark в скриншотах с user_id | Отдельная фича, не security задача |
| Запутывание Rust ядра через obfuscation tools | Дорого, ROI низкий |
| Custom kernel-level anti-debug | Соло-стартап, не Adobe |

---

## 4. Фазы реализации

### Phase 1 — Quick wins (1 час, без бэкенд-изменений)

- [ ] `Cargo.toml`: убрать `"devtools"` из release-features
- [ ] `tauri.conf.json`: `withGlobalTauri: false`
- [ ] `tauri.conf.json`: CSP включить
- [ ] `tauri.conf.json`: `assetProtocol.scope` сузить с `["**"]` до `["dist/*", "$APPDATA/*"]`
- [ ] Build-шаг: minify dist/index.html и editor.html через terser

Эффект: T3 (DevTools-расковыривание) затруднён, T4 (подмена JS) сложнее.

### Phase 2 — License server (1 день)

- [ ] Миграция `0019_licenses.sql` (таблицы licenses + license_sessions + индексы)
- [ ] Supabase Edge Function `license-activate` (POST)
- [ ] Supabase Edge Function `license-heartbeat` (POST)
- [ ] Supabase Edge Function `license-deactivate` (POST, для UI account.engiboard.com)
- [ ] Tauri Rust: `keyring` crate для хранения JWT
- [ ] Tauri Rust: command `get_machine_fingerprint()`
- [ ] Tauri Rust: command `activate_license(key)` + `validate_license()` + heartbeat-тикер
- [ ] dist: новый экран `license-gate.html` показывается до основного UI
- [ ] dist: интеграция в index.html — проверка JWT на старте

Эффект: T1, T2, T6 закрыты. Без сервера приложение бесполезно.

### Phase 3 — File security (0.5 дня)

- [ ] Аудит RLS на `storage.objects` для bucket `task-screenshots`
- [ ] Переход с публичных URL на signed-URL (TTL 10 минут)
- [ ] Шифрование локального кеша через ключ, выведенный из JWT

Эффект: T5 закрыт.

### Phase 4 — Distribution (1 день, требует расходов)

- [ ] Apple Developer ID — подпись DMG
- [ ] Windows code-signing certificate — подпись MSI/NSIS
- [ ] Notarization у Apple
- [ ] Auto-update через signed releases

Эффект: T4 заметно сложнее, OS-предупреждения исчезают, доверие.

---

## 5. UX-сценарии

### 5.1 Первый запуск
1. Запустил EXE
2. Экран "EngiBoard — введите ключ активации" + поле + кнопка Activate
3. Активирует → JWT в keychain → главный UI
4. Получает email "EngiBoard активирован на машине '<machine_label>'"

### 5.2 Смена ноута
1. На старом ноуте: Profile → Devices → Deactivate this machine
2. На новом ноуте: запуск EXE → ввод того же ключа → активация

Если старый ноут потерян/недоступен:
1. account.engiboard.com → Devices → Force-deactivate → confirm by email
2. После этого можно активировать на новом

### 5.3 Истёкла подписка
1. Heartbeat возвращает 403
2. Клиент показывает баннер "Subscription expired. Read-only mode for 7 days, then full lock."
3. После 7 дней — экран блокировки с CTA "Renew"

### 5.4 Нет интернета
1. Клиент пытается heartbeat → fail
2. После 3 фейлов (3 часа) — баннер "Offline mode — синхронизация остановлена, продолжаем работать локально"
3. После 7 дней — full lock с экраном "Connect to internet"

### 5.5 Пиратская копия
1. Скопировали EXE на другой ноут без ключа
2. На старте — экран ввода ключа
3. Без ключа дальше не пройти

Если ключ украли тоже:
1. Активация на 2-м ноуте → сервер видит занятый seat → 403
2. На 1-м ноуте пользователь видит "Active sessions: 2 / 1 → forced sign-out on other devices?"

---

## 6. Стоимость и риски

| Риск | Mitigation |
|---|---|
| Сервер лицензий лёг — никто не может работать | JWT с 24-часовым TTL даёт окно на починку; heartbeat терпит 3 промаха |
| Пользователь на стройке без сети 2 недели | 7-дневный grace; настраиваемый через план "field-pro" с 30 днями |
| Code signing $400+/год | Учли в стоимости плана `pro` |
| Поддержка "разблокируйте мне аккаунт" — лишний support load | account.engiboard.com с self-service deactivate |
| Ложноположительный лок при смене железа (новый SSD, replacement MAC) | machine_fingerprint включает 3 фактора, замена одного не блокирует |

---

## 7. Что делаем СЕЙЧАС

1. **Phase 1 целиком** — применяю в этом коммите.
2. **Phase 2 миграция** — пишу SQL, не применяю до подтверждения.
3. **Phase 2 Edge Functions + Rust** — пишу скелет, не деплою.
4. **Phase 3-4** — план зафиксирован, время реализации согласовываем.

---

## 8. Открытые вопросы для решения

- [ ] Сколько seats в дефолтном плане (Pro)? 1 или 2 (личный + рабочий)?
- [ ] Trial — как раздаём ключи: email-капча → 14 дней, или manual?
- [ ] account.engiboard.com — отдельный SPA или встроенный экран в EngiBoard?
- [ ] Какой grace при offline: 7 дней или 30?
- [ ] Подписка месячная / годовая / lifetime — какие планы продаём?
