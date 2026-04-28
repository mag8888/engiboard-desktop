# EngiBoard Desktop — macOS

Нативное macOS приложение на Tauri. Обёртка над HTML/JS интерфейсом с нативными возможностями.

## Быстрый старт (1 команда)

```bash
cd engiboard-desktop
bash setup.sh
```

Скрипт сам установит Rust, Tauri CLI и запустит приложение.

---

## Что умеет desktop-версия

| Функция | Описание |
|---|---|
| **⌘⇧4** | Захват скриншота (глобальный хоткей, работает когда app свёрнут) |
| **⌘⇧E** | Показать / скрыть EngiBoard |
| **⌘⇧A** | Открыть редактор аннотаций |
| **System Tray** | Иконка в меню-баре, всегда доступен |
| **Ctrl+V** | Вставить скриншот из буфера в задачу |
| **macOS titlebar** | Нативный overlay с traffic lights |

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
