# Changelog

All notable changes per release are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/).

---

## [v0.1.43] — 2026-05-06 — Editor + presentation + chat re-enabled

### Reverted (was over-restricted in v0.1.41)
- **Editor c инструментами разметки вернули в скоуп** — спринт 1.4 ТЗ
  ("Базовые визуальные аннотации поверх скриншотов: стрелки, текст").
  Раньше клиент жаловался: "сам скриншоттер с инструментами не появляется"
  — потому что я по ошибке закрыл его OOS-модалкой. Возвращён.
- **Режим презентации** — спринт 1.4 ТЗ ("Сборка Режима презентации").
- **Мини-чат внутри карточки задачи** — спринт 1.4 ТЗ ("Интеграция мини-чата
  непосредственно внутрь карточки задачи").

### Capture flow now matches the spec
```
Capture button / ⇧⌘5
  → sniper overlay (dim + crosshair)
  → выделить регион
  → editor открывается с инструментами (стрелки, прямоугольники, текст,
     маркер, blur, dimension, freehand, comment)
  → юзер размечает картинку
  → Save → screenshot-ready → paste-mode → click BEFORE/AFTER slot
  → готово
```

### Still locked behind OOS modal (Stage 2)
- ⇄ BEFORE/AFTER compare wipe (не упомянуто в Этапе 1 ТЗ)
- 🔑 Sign in with Google (cloud sync — Этап 2)
- 📄 PDF export · 📥 CSV import · ☑ Bulk select · ⏱ Timer
- ⌨ Shortcuts page · ✉ Invite by email · 🔌 Slack webhook · ↕ Drag-reorder

---

## [v0.1.42] — 2026-05-06 — Capture flow fix

### Fixed
- **Capture открывал главное окно вместо overlay-сниппера** (clean install).
  AppleScript-трюк `set visible of process to false/true` гонщился с
  `WebviewWindowBuilder` — main возвращался поверх ещё-не-созданного sniper.
  Удалили AppleScript полностью: только `main_win.hide()` → 200мс пауза →
  создаём sniper window, при ошибке возвращаем main.
- `sniper_done` (cancel из sniper) теперь надёжно возвращает main window
  через `show()` + `set_focus()` — раньше при отмене пользователь оставался
  без видимого окна.

---

## [v0.1.41] — 2026-05-06 — Stage-1-strict (narrowed: capture-only)

### Changed
- Сборка строго на минимуме Этапа 1: работает **только скриншоттер +
  вставка картинки в задачу**. Аннотации, презентация, compare и
  встроенный чат закрыты модалкой «в финальной отладке, выйдет в v0.1.42»
  — UI остаётся видимым для обсуждения дизайна.
- **Capture больше не открывает editor** — после выделения области
  скрин эмитится напрямую в main как `screenshot-ready`, дальше
  обычный paste-mode: пользователь кликает на BEFORE/AFTER слот
  и картинка вставляется. Один путь, без промежуточных окон.

### Locked behind OOS modal (на этой сборке)
- 🖍 Редактор аннотаций (клик по скрину в задаче · кнопка из lightbox)
- ▶ Режим презентации (кнопка `▶ Presentation` · клик по строке задачи)
- ⇄ BEFORE/AFTER compare wipe
- 💬 Чат внутри карточки задачи (input · send button · клик по сообщению)
- 🔑 Sign in with Google · только Demo-режим в Этапе 1

### What stays usable
- Login → Demo · просмотр и переключение проектов · создание проекта ·
  создание/редактирование/удаление задач · смена статуса · ⇧⌘5 capture →
  paste-mode → клик на BEFORE/AFTER слот → готово · light/dark · RU/EN.

---

## [v0.1.40] — 2026-05-06 — Stage-1-strict build

### Changed
- **Сборка теперь строго соответствует Этапу 1 договора.** UI полностью
  на месте (клиент видит весь дизайн), но клик по функциям, запланированным
  на Этап 2, открывает модалку «Функция пока недоступна» с указанием релиза.

### Out-of-scope (под модалкой)
- 📄 PDF-экспорт отчётов · chip в шапке списка
- 📥 CSV-импорт задач · chip в шапке списка
- ☑ Bulk-select / массовые действия
- ⏱ Учёт времени по задачам (timer button в строках)
- ⌨ Настройка горячих клавиш (sidebar item Shortcuts)
- ✉ Приглашение в проект по email + удаление участников (project picker)
- 🔌 Slack-уведомления о статусах (profile → Integrations)
- ↕ Drag-reorder задач между неделями/проектами

### Stays in Stage 1
- Login (Google OAuth + Demo) · создание проектов и задач · статусы ·
  скриншот через capture/paste/drop · аннотации в editor (11 инструментов) ·
  inline-чат в задаче · полный чат в режиме презентации ·
  BEFORE/AFTER compare wipe · light/dark theme · RU/EN · project picker.

---

## [v0.1.39] — 2026-05-06

### Fixed (client v0.1.38 round-trip — 6 critical bugs)
- **Project picker не переключал проект** — `updateHeader()` обращался к удалённому
  `psName`/`psMeta` (старый proj-switch до v0.1.27). TypeError рвал `selectProject()`
  на середине: picker закрывался, но `render()` не вызывался, контент не обновлялся.
  Удалили легаси-обращения, header теперь обновляется через `updateProjPickerLabel`.
- **Status pill не открывал меню** — `toggleStMenu()` искал `.st-wrap`, который
  переименован в `.tc-status` в v0.1.31. Меню не появлялось вообще, поэтому
  "невозможно присвоить тип таски". Селектор расширен на оба варианта.
- **Editor "EngiBoard Annotate" пустое окно** — переиспользование старого окна
  через `get_webview_window("editor")` могло наткнуться на полусдохший webview.
  Теперь окно всегда `close()` + `recreate`. Убран `always_on_top` (мешал закрыть).
  `load-image` event ретраится 3× (800/700/900мс) с дедупом по hash в editor.html.
- **Capture region захватывался "левее" рамки** — sniper отдавал window-relative
  `clientX/Y`, а на Windows borderless+transparent окне Aero добавляет невидимый
  фрейм → реальная позиция != (0,0). Перешли на абсолютные `screenX/Y`.
- **Save из slideshow не привязывался к таске** — кнопка `+ 📷 Add` запускала
  капчер без контекста, скриншот падал в paste-mode и требовал второй клик.
  Добавлен флаг `pendingPresentAttach` — после save сразу `addShotToPresentTask()`.
- **Чат рассинхронизировался между slideshow и task row** — `sendPresChat`
  обновлял только slideshow, а `sendInlineChat` дёргал innerHTML панели в строке.
  Когда юзер закрывал презентацию → видел старый чат; писал новое → внезапно
  всплывали сообщения "из презентации". Добавлена `syncTaskRowChat()`, которая
  обновляет inline-панель строки после `sendPresChat` и при `closePresent`.

### Internal
- Bumped Cargo + tauri.conf.json to 0.1.39.

---

## [v0.1.21] — 2026-05-03

### Added
- **P2-2 Customizable keyboard shortcuts** — 4 editable bindings (toggle sidebar, search, new task, dark mode).
  - Click ✏️ button → press combo → saves automatically
  - Esc cancels capture mode
  - Conflict detection (can't bind same combo twice)
  - "Reset to defaults" button
  - Persisted in `localStorage 'eb_shortcuts'`
- 🎉 **Sprint S6 (Polish) closed** — all 6 P2 tasks shipped

---

## [v0.1.20] — 2026-05-03

### Added
- **P2-1 Slack webhook integration** — incoming webhook URL in profile settings
  - Auto-fires on task transitions to **Done** (✅) or **Problem** (⚠️)
  - Test button + Save / Clear in profile section
  - JSON payload with status color, project, week, footer
  - CORS fallback to `no-cors` if browser blocks

---

## [v0.1.19] — 2026-05-03

### Added
- **P2-4 Localization RU / EN** (lite version)
  - 30+ UI strings translated
  - Auto-detect from `navigator.language`
  - Toggle in sidebar bottom (above Dark mode)
  - Persisted in `localStorage 'eb_lang'`
  - `T(key)` helper + `[data-t]` / `[data-t-ph]` attribute system
  - All 8 status names localized (Info → Инфо, Done → Готово, …)

---

## [v0.1.18] — 2026-05-03

### Added
- **P2-6 Time tracking per task**
  - `⏱ start` / `⏱ Xh Ym · stop` chip in task row
  - Pulsing red dot when timer running (1.4s ease-in-out)
  - Persisted in `localStorage 'eb_timers'`
  - Auto-update of running labels every 30s (no full re-render)
  - Time included in PDF export breadcrumb (`⏱ 1h 23m`)

---

## [v0.1.17] — 2026-05-03

### Added
- **P2-5 CSV import** — bulk task creation
  - 📥 CSV chip in filters bar
  - Header-driven: `title` (required) + `project` / `status` / `week` / `notes` (optional)
  - 8 status name aliases (`info` / `done` / `problem` / `progress` / `0..7`)
  - Quoted fields with commas + escaped quotes supported
  - Toast: `✓ Imported N tasks (M skipped)`

---

## [v0.1.16] — 2026-05-03

### Added
- **P2-3 Dark mode** — full theme switch
  - CSS vars flipped via `body.dark-mode` class
  - 60+ hardcoded `#fff` / `#FAFBFC` migrated to `var(--surf)` / `var(--bg)`
  - Sun/moon icon in sidebar
  - Keyboard shortcut `⌘⇧T` (Ctrl+Shift+T on Win/Linux)
  - Initial state from `localStorage` → `prefers-color-scheme` → light

---

## [v0.1.15] — 2026-05-03

### Added
- **P1-5 PDF export** of task report
  - 📄 PDF chip in filters bar
  - Cover page: title + project + status breakdown with colored dots
  - Per-task page: status side-bar, breadcrumb, before/after images (75mm), extra screenshots paginated 2-up, comments list
  - Honors current project + active filter chip
  - Filename: `engiboard_{code}_{date}.pdf`
- jsPDF 2.5.1 via CDN

---

## [v0.1.14] — 2026-05-03

### Added
- **P1-2 Multi-screenshot per task** — full UI for multiple screenshots
  - `+ 📷 Add` button in slideshow
  - Drag-drop image files onto slide → adds to `t.shots[]`
  - Click on slide in paste-mode (after capture) inserts directly
  - Row label updates: `▶ slideshow · N` if total shots > 2
  - Reuses `t.shots[]` infrastructure shipped in v0.1.12

---

## [v0.1.13] — 2026-05-03 — Sprint S0.5 Demo Polish

### Changed
7 fixes from demo session 2026-05-01 (Anton + Dmitry):
- **DM-1**: Chat panel moved from right to left (after sidebar, slide from left)
- **DM-2**: Removed duplicate username display in chat (avatar shows initials)
- **DM-3**: Compact status + week — single 110px column instead of 80+130px
- **DM-4**: Project collapse state persists in localStorage; new ⊟ Collapse all / ⊞ Expand all chips
- **DM-5**: Removed `.chat-ic` from task rows — chat now only via preview/slideshow
- **DM-6**: Implemented chat panel inside preview mode (320px sidebar in slideshow)
- **DM-7**: Tidied fonts — rounded all fractional `.5px` to integers

---

## [v0.1.12] — 2026-04-29

### Added
- ▶ slideshow button in task row, full-screen presentation mode
- Lightbox with pin comments (B-17): click on image → drop pin → write comment
- Multi-screenshot backend: `t.shots[]` array (UI shipped in v0.1.14)

---

## [v0.1.11] — 2026-04-29

### Removed
- Project switcher from titlebar (cleanup)

---

## [v0.1.10] — 2026-04-28

### Added
- Per-project inline `+ Add task` input within each project group

---

## [v0.1.9] — 2026-04-28

### Removed
- Tasks/Dashboard top buttons from titlebar (clean titlebar)

---

## [v0.1.0..v0.1.8] — 2026-04-22 → 2026-04-28

Sprint 0 baseline:
- v0.1.0: First release with native screencapture
- v0.1.3: Custom sniper.html overlay (M5+Sequoia compat)
- v0.1.6: Deep-link OAuth (engiboard://) for Google sign-in
- See `docs/EngiBoard_Context.md` §5 for full version history

---

## [Unreleased / Deferred]

- **S1 Distribution Trust** (Apple Developer + Windows Code Signing) — skipped per user 2026-05-03
- **S2 Real Supabase persistence** — deferred, see `supabase/ARCHITECTURE_DECISION.md`
- **S3 P1-1 Auto-update** — blocked on S1
- **S4 Collaboration** (Real-time chat, project sharing) — blocked on S2
- **S7 Tech Debt** (modularize, tests, telemetry) — pending
- **S8 Launch v1.0** — pending all above
