# EngiBoard — User Guide

Engineering task tracker with screenshots, annotations, and team workflows. This guide walks through every feature shipped in **v0.1.23**.

---

## 1. Installation

### macOS (Apple Silicon / Intel)

1. Download `EngiBoard_X.Y.Z_aarch64.dmg` (M1/M2/M3/M4) or `_x64.dmg` (Intel) from [Releases](https://github.com/mag8888/engiboard-desktop/releases).
2. Open DMG → drag EngiBoard to `/Applications`.
3. **First launch:** macOS may show "App is damaged" — fix with:
   ```bash
   xattr -cr /Applications/EngiBoard.app
   open /Applications/EngiBoard.app
   ```
4. Allow Screen Recording permission when prompted (System Settings → Privacy & Security → Screen Recording → ✓ EngiBoard).

### Windows

1. Download `EngiBoard_X.Y.Z_x64-setup.exe` (NSIS installer) or `_x64_en-US.msi`.
2. SmartScreen will warn — click "More info" → "Run anyway".
3. Install, launch.

---

## 2. Sign in

Click **"Sign in with Google"** on the login screen. Browser opens for OAuth, then deep-link `engiboard://oauth/callback` brings you back.

Demo mode: click **"Try demo"** for instant access with 24 sample tasks across 3 projects.

---

## 3. Capturing screenshots

### Global hotkey ⌘⇧G (Cmd+Shift+G)
Works even when EngiBoard is hidden. Hides app momentarily, shows custom transparent overlay, drag to select rectangle.

### Paste mode
After capture, your cursor changes — click any task slot (BEFORE / AFTER) or any image inside slideshow to drop the screenshot.

### Drag-drop
Drag any image file from Finder/Explorer onto:
- A task's BEFORE/AFTER slot — fills shot1/shot2
- A slideshow image — adds to extra screenshots (`t.shots[]`)

### Annotation editor
After capture, the editor opens automatically with:
- **Arrow** (A): drag for arrow with arrowhead
- **Rectangle** (R): drag to draw box
- **Pen** (P): freehand
- **Text** (T): click + type (16px white with subtle background)
- **Blur** (B): drag to mask sensitive area
- **Highlight** (H): semi-transparent yellow

Save with ⌘S or **Save** button → returns annotated screenshot to the original task slot.

---

## 4. Tasks

### Create
Type in the inline `+ Type new task and press Enter…` row inside any project group.

Quick shortcut: **⌘N** focuses the new-task input.

### Status (8 levels)
Click the colored pill to choose:

| # | Status | Color | When |
|---|---|---|---|
| 0 | Info | gray | Reference / context |
| 1 | Done | green | Completed |
| 2 | Not Relevant | gray | Out of scope |
| 3 | Review | violet | Pending review |
| 4 | Info Required | cyan | Need more info |
| 5 | Problem | red | Blocked / issue |
| 6 | In Progress | orange | Being worked |
| 7 | Upcoming | cyan | Planned |

### Edit name / notes
Click the title to edit inline (`contenteditable`). Click outside to save.

### Reorder
Hover row → drag handle (`⋮⋮`) appears at left → drag up/down within the same project.

### Resize row height
Drag the bottom edge of any row up/down.

### Time tracking ⏱
Click `⏱ start` in row meta → starts timer (red pulsing dot). Click again to stop — adds elapsed minutes to `t.timeMin`. Persists across reloads.

### Slideshow ▶
Click `▶ slideshow` to open presentation mode for a task. Inside:
- ← / → navigate between BEFORE / AFTER / extra screenshots
- Click image to enter lightbox (zoom + pin comments)
- Drop image files / click `+ 📷 Add` to add more screenshots
- Right sidebar: chat panel scoped to this task

### Pin comments (lightbox)
Inside lightbox, click anywhere on the image → drops a numbered pin → write a comment in the right panel. Pins persist per `{task_id}:{shot_index}`.

---

## 5. Bulk operations (v0.1.23+)

Click **☑ Select** in filters bar → enters multi-select mode:

- Each row gets a checkbox
- Drag-reorder is disabled (avoids accidents)
- Selected rows get a glowing accent border
- Sticky cyan **bulk-bar** appears at top with live count
- Quick-set status: ✅ Done / ⚠ Problem / 🟠 In progress
- 🗑 Delete (with confirm dialog)
- Cancel exits select mode

Use case: at end of week, ⌘A select all, mark Done.

---

## 6. Filters & search

| Chip | What |
|---|---|
| All | Default |
| Problems | Status = Problem (red) |
| In progress | Status = In Progress (orange) |
| Done | Status = Done (green) |
| This week | Tasks in current week |
| `⊟ Collapse all` | Hides all project bodies |
| `⊞ Expand all` | Restores all |
| `📄 PDF` | Export current view to PDF |
| `📥 CSV` | Bulk-import tasks |
| `☑ Select` | Multi-select mode |

Search input: filters by task title (case-insensitive substring).

Project collapse state persists in `localStorage` per session.

---

## 7. PDF export (v0.1.15+)

Click **📄 PDF** to generate report:

- **Cover page**: project name, date, task count, status breakdown with colored dots
- **Per-task page**:
  - Status side-bar (color matches task status)
  - Breadcrumb: project code · week · N/total · ⏱ time tracked
  - Title (multi-line)
  - Status pill (top-right)
  - BEFORE + AFTER images (75mm tall, side by side)
  - Extra screenshots from `t.shots[]` (paginated 2-up)
  - Comments list

Filename: `engiboard_{code}_{date}.pdf`.

Honors current project + active filter chip.

---

## 8. CSV import (v0.1.17+)

Click **📥 CSV** → file picker → select CSV.

### Format
First row = header. Required: `title`. Optional: `project`, `status`, `week`, `notes`.

### Status aliases
`info` (or 0) · `done` (1) · `not_relevant` (2) · `review` (3) · `info_required` (4) · `problem` (5) · `in_progress`/`progress` (6) · `upcoming` (7).

### Example
```csv
title,project,status,week,notes
"Replace V-belt",CL-12,done,26W17,torque verified at 42 Nm
"Bearing #7 alignment",CL-12,problem,26W17,
"Calibrate robot arm",WS-3,progress,26W18,
```

Toast: `✓ Imported 3 tasks (0 skipped)`.

---

## 9. Slack integration (v0.1.20+)

In **Profile → Integrations · Slack webhook**:

1. Get webhook URL from Slack: *Apps → Incoming Webhooks → Add to Slack*.
2. Paste URL, click **Save**.
3. **Send test** → check Slack channel.

Auto-fires when a task moves to **Done** or **Problem**. Format:
```
✅ *Task title* — Done
[Project: Conveyor Line #12 · CL-12] [Week: 26W17]
EngiBoard
```

---

## 10. Customization

### Dark mode (v0.1.16+)
- Toggle in sidebar (sun/moon icon)
- Keyboard: **⌘⇧T** (Cmd+Shift+T)
- Initial: localStorage → `prefers-color-scheme` → light

### Localization (v0.1.19+)
- Toggle in sidebar (Language · ru/en)
- Auto-detect from `navigator.language` on first launch

### Keyboard shortcuts (v0.1.21+)

Customize the 4 main shortcuts in **Sidebar → Shortcuts**:

| Action | Default | How to change |
|---|---|---|
| Toggle sidebar | ⌘B | Click ✏️ → press combo → save |
| Search tasks | ⌘F | Same |
| New task | ⌘N | Same |
| Toggle dark mode | ⌘⇧T | Same |

Conflict detection: can't bind same combo to two actions. Esc to cancel.

Reset to defaults: button at section header.

---

## 11. Sidebar sections

| Section | Purpose |
|---|---|
| Dashboard | Project overview with progress bars |
| **Projects** ★ | Main view: tasks grouped by project |
| Chats | All chats from all tasks, latest first |
| Shortcuts | Reference + customize keybindings |
| Profile | Account, stats, integrations, sign out |

Sidebar collapse: **⌘B** (200px ↔ 54px icons-only).

---

## 12. Data persistence

Currently all data lives in `localStorage` per device. **No cloud sync yet** (Sprint S2 deferred — see [`supabase/ARCHITECTURE_DECISION.md`](../supabase/ARCHITECTURE_DECISION.md)).

Storage keys:
- `eb_account` — current user email
- `eb_collapsed_projects` — collapsed project IDs
- `eb_dark_mode` — theme
- `eb_lang` — language
- `eb_shortcuts` — custom keybindings
- `eb_timers` — per-task time tracking
- `eb_slack_webhook` — Slack URL

Supabase client is initialized but doesn't currently sync — graceful no-op until Sprint S4 architectural decision.

---

## 13. Troubleshooting

### macOS: "App is damaged" on first launch
Run `xattr -cr /Applications/EngiBoard.app` then re-open.

### Screen Recording permission keeps re-asking
Each unsigned build is a "new app" for macOS TCC. Run `tccutil reset All com.engiboard.desktop` to start fresh.

### Sniper overlay grabs the EngiBoard window instead of the area
Restart the app. If persistent, file an issue — this is a known issue with macOS Sequoia + apps using `macos-private-api`.

### Windows SmartScreen warning
Code signing not yet (Sprint S1). Click "More info" → "Run anyway". Will go away in v1.0 with EV cert.

---

## 14. Keyboard shortcuts reference

### Global
| Combo | Action |
|---|---|
| ⌘⇧G | Capture screenshot |
| ⌘⇧E | Show / hide EngiBoard |
| ⌘⇧A | Open annotation editor |

### In-app (customizable)
| Combo | Action |
|---|---|
| ⌘B | Toggle sidebar |
| ⌘F | Focus search |
| ⌘N | Focus new task |
| ⌘⇧T | Toggle dark mode |
| Esc | Close modal / lightbox / paste mode / cancel |

### Slideshow
| Combo | Action |
|---|---|
| ← | Previous slide |
| → | Next slide |
| Esc | Close slideshow |

### Task editing
| Combo | Action |
|---|---|
| Click title | Edit inline |
| Enter | Confirm new task |
| Drag handle | Reorder |
| Drag bottom edge | Resize height |

---

## 15. Feedback

GitHub Issues: https://github.com/mag8888/engiboard-desktop/issues

Direct contact: aleksey.stepikin@gmail.com

---

*Last updated: 2026-05-03 · For v0.1.23 / v0.1.24*
