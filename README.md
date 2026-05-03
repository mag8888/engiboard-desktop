# EngiBoard Desktop

Нативное desktop-приложение на Tauri 2 (Rust backend + HTML/CSS/JS frontend) для трекинга инженерных задач со скриншотами и аннотациями.

**Текущий релиз:** [v0.1.23](https://github.com/mag8888/engiboard-desktop/releases/tag/v0.1.23)
**Платформы:** macOS Apple Silicon · macOS Intel · Windows x64

📖 [User Guide](./docs/USER_GUIDE.md) · 📋 [CHANGELOG](./CHANGELOG.md) · 🔒 [Privacy](./docs/PRIVACY.md) · 📜 [Terms](./docs/TERMS.md) · 🏗 [Architecture decision](./supabase/ARCHITECTURE_DECISION.md)

## Быстрый старт (одна команда)

```bash
cd engiboard-desktop
bash setup.sh
```

Скрипт устанавливает Rust + Tauri CLI и запускает приложение.

---

## Скачать готовый билд

[Releases](https://github.com/mag8888/engiboard-desktop/releases) — 4 артефакта на каждый тег:
- `EngiBoard_X.Y.Z_aarch64.dmg` — Mac Apple Silicon
- `EngiBoard_X.Y.Z_x64.dmg` — Mac Intel
- `EngiBoard_X.Y.Z_x64-setup.exe` — Windows installer
- `EngiBoard_X.Y.Z_x64_en-US.msi` — Windows MSI

---

## Возможности (v0.1.21)

### Захват и работа со скриншотами
| | |
|---|---|
| **⌘⇧G** | Глобальный хоткей — захват области экрана |
| **⌘⇧E** | Показать / скрыть приложение |
| **⌘⇧A** | Редактор аннотаций |
| **Ctrl+V / drag-drop** | Вставка / drag из Finder в слот скриншота |
| **+ 📷 Add** в slideshow | Добавить произвольное число screenshots в задачу |
| **Annotation editor** | arrow / rect / pen / text / blur / highlight tools |

### Задачи
- 8 статусов с цветами (Info / Done / Not Relevant / Review / Info Required / Problem / In Progress / Upcoming)
- Группировка по проектам со сворачиванием (`⊟ Collapse all` / `⊞ Expand all`)
- Фильтры (All / Problems / In progress / Done / This week)
- Поиск по названиям задач
- Drag-to-reorder + resize высоты
- Inline editing (contenteditable)
- Per-task таймер `⏱ Xh Ym` с pulsing-индикатором

### Чат и комментарии
- Чат-панель в slideshow (lightbox с pin-комментариями)
- Coordinate-based pins на скриншотах
- Real-time чат через Supabase — будущее (Sprint S4, заблокировано S2)

### Презентация / экспорт
- ▶ Slideshow per task (multi-screenshot, навигация ←→)
- 📄 PDF export (cover + per-task pages, before/after, comments)
- 📥 CSV import (header-driven bulk task creation)
- Slack webhook на статус Done/Problem (настраивается в Profile)

### Кастомизация
- 🌙 Dark mode (`⌘⇧T` / sidebar toggle / prefers-color-scheme)
- 🌐 RU / EN локализация (auto-detect из navigator.language)
- ✏️ Customizable shortcuts (toggle sidebar, search, new task, dark mode)

### Auth
- Google OAuth через Supabase + deep-link `engiboard://oauth/callback`
- Demo accounts для быстрого старта

---

## Ручная установка

### 1. Предварительные требования

```bash
# Xcode Command Line Tools
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Tauri CLI
cargo install tauri-cli --version "^2" --locked
```

### 2. Dev режим (быстро, без сборки)

```bash
cd engiboard-desktop
cargo tauri dev
```

Приложение откроется через ~30-60 сек (первая компиляция Rust).

### 3. Release сборка

```bash
cargo tauri build
```

Результат:
- `src-tauri/target/release/bundle/macos/EngiBoard.app`
- `src-tauri/target/release/bundle/dmg/EngiBoard_*.dmg`

### 4. Установка в /Applications

```bash
cp -r src-tauri/target/release/bundle/macos/EngiBoard.app /Applications/
open /Applications/EngiBoard.app
```

---

## Структура проекта

```
engiboard-desktop/
├── index.html          ← главный интерфейс (task list)
├── editor.html         ← редактор скриншотов
├── setup.sh            ← автоматическая установка
├── README.md
└── src-tauri/
    ├── Cargo.toml      ← Rust зависимости
    ├── tauri.conf.json ← конфигурация окна, bundle
    ├── build.rs
    ├── capabilities/
    │   └── default.json  ← разрешения (clipboard, shortcuts, etc.)
    ├── icons/
    │   ├── icon.png      ← tray icon
    │   ├── icon.icns     ← macOS app icon
    │   ├── 32x32.png
    │   ├── 128x128.png
    │   └── 128x128@2x.png
    └── src/
        └── main.rs     ← Rust backend (shortcuts, tray, commands)
```

---

## Кастомизация окна

В `src-tauri/tauri.conf.json`:

```json
"windows": [{
  "width": 1440,
  "height": 900,
  "titleBarStyle": "Overlay",    // ← скрытый titlebar, traffic lights поверх
  "hiddenTitle": true,
  "trafficLightPosition": { "x": 14, "y": 13 }
}]
```

---

## Добавить новый хоткей

В `src-tauri/src/main.rs`:

```rust
handle.global_shortcut().register(Shortcut::new(
    Some(Modifiers::SUPER | Modifiers::SHIFT),
    Code::KeyN,  // ⌘⇧N
))?;
```

И в handler:
```rust
if shortcut.key == Code::KeyN {
    // действие
}
```

---

## Вставка скриншота через Tauri clipboard

В JS (уже интегрировано в index.html):

```js
const { readImage } = window.__TAURI__.clipboardManager;
const img = await readImage();
const rgba = await img.rgba();
// img.width, img.height → размеры
// rgba → Uint8Array с RGBA пикселями
```

---

## Иконки

Для правильного `.icns` (на Mac):

```bash
cargo tauri icon src-tauri/icons/icon_1024.png
```

Это сгенерирует все размеры автоматически.

---

## Известные нюансы

**`titleBarStyle: Overlay`** — traffic lights рисуются поверх контента. Добавь паддинг в CSS:
```css
.titlebar { padding-top: env(titlebar-area-height, 38px); }
```
*Уже учтено в `index.html`.*

**Первая сборка** — занимает 3-8 минут (компиляция Rust + Tauri). Последующие — секунды.

**Подпись кода** — для распространения через App Store нужен Apple Developer ID. Для личного использования подпись не нужна.
