## [v0.1.187] — 2026-07-23 — Meeting 2026-07-17 P1 batch (bugs 1-4)

Задачи со встречи с Дмитрием 2026-07-17 (docs/MEETING_2026-07-17_TASKS.md), P1-баги, по порядку:

- Fix (#1, native): захват экрана работал только на ОДНОМ мониторе — оверлей
  sniper открывался на текущем дисплее (`current_monitor`), выделить область на
  втором было нельзя. Теперь оверлей растягивается на весь виртуальный рабочий
  стол (объединение ВСЕХ мониторов через `available_monitors()`). Захват уже
  работал в глобальных координатах, так что полноэкранный оверлей + существующая
  математика `screenX/clientX` из sniper.html снимают корректно с любого экрана.

- Fix (#2): создание/клик проекта с Dashboard не уводил на вкладку проекта.
  Приложение держит две системы вида — старую (`curView/setView`) и секционную
  (`currentSection/setSection`: Dashboard/Favorites поверх tasks-body).
  `switchProject` трогал только старую, поэтому смена проекта из пикера/карточки
  меняла данные, но пользователь оставался на Dashboard. Теперь с любой не-Projects
  секции жёстко уводим на Projects. Regression R15.

- Fix (#3): клик по группе клиента в пикере проектов закрывал весь пикер.
  `toggleClientGroup` синхронно перерисовывал `#ppList` во время всплытия клика,
  старый target отсоединялся от DOM, и обработчик «клик снаружи» видел
  `closest('#projPicker')===null` → закрывал. Останавливаем всплытие. Regression R16.

- Fix (#4): строку в list-view нельзя было ужать обратно — только растянуть.
  Высота задавалась как `min-height` (минимум), а у `.row-resized` чат терял
  `max-height`, так что контент чата превышал минимум и «меньше не делалось».
  Теперь изменённая строка получает ФИКСИРОВАННУЮ высоту (height+min-height),
  чат скроллится внутри; двойной клик по ручке — сброс к исходному размеру;
  transition гасится на время drag (без «резины»). Regression R17.

- Fix (#5): экспорт в Excel — (а) колонка чата выгружала только СЧЁТЧИК
  сообщений; теперь весь чат текстом («Автор: текст» по строкам, перенос,
  строка тянется под содержимое). (б) картинки «плавали» — был oneCellAnchor
  (свободный объект у угла ячейки); теперь twoCellAnchor editAs="oneCell" в
  пределах своей ячейки (натуральный размер, двигается/удаляется с ячейкой).
  Regression R18.

- Fix (#6): экспорт в PDF «по аналогии с Excel». Был карточный список со
  счётчиком комментариев; теперь настоящая ТАБЛИЦА (landscape A4) с теми же
  колонками, полным чатом (перенос) и before/after картинками внутри ячеек,
  с сеткой и переносом на страницы. Regression R19.

- Fix (#7): «+Add screenshot» в презентации не давал понять, куда вставится, и
  экстра-слоты (2+) вообще не сохранялись (assignShotToSlot знал только 0/1).
  Теперь: полоса миниатюр всегда с «+»-плиткой (добавить в явный слот); нижняя
  кнопка целится в первый свободный слот и подписывает куда («→ BEFORE/AFTER/#N»);
  captureScreenshot принимает любой слот; assignShotToSlot пишет экстры в t.shots.
  Regression R20.

Regression-набор: 20 проверок (R1-R20) зелёные локально; CI гоняет на каждый push.

## [v0.1.186] — 2026-07-10 — Comment bubble opens + real WKWebView repaint on project create

- Fix (editor): a pin-comment was "just a circle with a number" — clicking it
  never opened the bubble. Root cause: the click bubbled to the `paper` mousedown
  handler; with the default Select tool it hit-tested `annotations` (pins live in
  `comments`), missed, and called `renderAll()` — which rebuilds every pin, so the
  pending `click` never reached the pin's handler. `.cpin`/`.cbbl` added to the
  handler's early-return guard. Verified: pin node survives mousedown, bubble
  opens with text + Edit/Delete, second click toggles closed, and the Comment tool
  no longer starts a new comment when clicking an existing pin.

- Fix (#18, real fix): new project still didn't paint until you clicked. The Rust
  `flush_repaint` command (native 1px window resize-bump — the WKWebView compositor
  flush that always lands) has existed since v0.1.105 but was NEVER invoked from
  JS. `_focusNewProjectBoard` now calls it. Verified: creating a project invokes
  exactly `flush_repaint`; no-op in the browser.

## [v0.1.185] — 2026-07-10 — New-project repaint + week moves

- Fix (#18 follow-up): new project sometimes did not paint until you clicked
  (WKWebView compositor). `createNewProject` now focuses the new board's
  add-task input (`_focusNewProjectBoard`) — a real input focus WebKit repaints
  on, and the cursor is ready for the first task. Verified at DOM level in Chrome;
  WKWebView repaint to confirm on the next Mac build.

- Fix (weeks): moving tasks to/from a newly-created week.
  - "Move to week…" now lists manually-created (empty) weeks via `_manualWeeks`,
    not just weeks that already have tasks — the new week was missing.
  - An empty week's whole "+ Add task" area is now a large drag drop-target
    (its header alone is a ~37px line, easy to miss). `_rowAtPoint` excludes the
    add-rows; `_mDragMove`/`_mDragUp` resolve `.eb-addrow-emptywk` to the week
    header. Verified: move-via-menu + drag-into-empty-week work; no reorder
    regression (within / to-end / between / header / 15-op stress all clean).

## [v0.1.184g] — 2026-07-07 — Fix: Drive-link kebab did not toggle closed

The Drive split-button kebab stopped propagation, so the outside-click closer
never fired and a second click just rebuilt the menu (looked stuck open).
`openDriveLinkMenu` now toggles: a second click on the same link's dots closes it
(stores data-taskId/data-linkId to compare). Verified in-browser.

## [v0.1.184f] — 2026-07-07 — Projects navigation + closed-week lock

Closes the projects cluster from the DEBUG sheet.

### #10 — how to get to All projects after choosing one
Restored an "All projects" entry at the top of the project picker
(`selectProject('all')`), hidden while searching.

### #12 — switching tabs stranded you in All-projects; keep position
Favorites forces All-projects scope, which used to persist after returning to
the Projects tab. Now the real project is remembered (`_projectBeforeFavorites` /
`_allByFavorites`) and restored on return — while a deliberate "All projects"
pick from the picker is left untouched. Verified: real project restored, Dashboard
round-trip keeps the project, deliberate All-projects stays All.

### #14 — add an engineer when creating a project
New "Engineer (email, optional)" field in the create dialog (comma-separate for
several) → `project.members[]`. Wired to Enter/Esc and cleared on close.

### #18 — new project not visible until refresh
`createNewProject` now calls `renderProjPicker()` after creating (both cloud and
local paths) so the dropdown shows the new project immediately.

### #17 — lock editing when a week is closed
Tasks in a complete week get a `.wk-locked` row class: status, assignee, inline
name, chat input, drag handle, arrows, resize, kebab, archive and the per-week
add row are `pointer-events:none`; the right-click task menu bails with a "reopen
the week to edit" toast. Viewing (Presentation, links, screenshots) stays live.

Verified in-browser for all five; no console errors. Root `index.html` mirrored.

## [v0.1.184e] — 2026-07-07 — Resizable-row chat height + emoji/tools left-click only

### #4 — chat panel should grow when a task ROW is stretched taller
In the compact list view the chat was capped at `max-height:56px` regardless of
row height, so dragging a row taller left empty space. Rows with a manual height
(`t.h`) now get a `.row-resized` class; CSS drops the cap for those so the chat
fills the extra height (`max-height:none; flex:1`).

### #6 — emoji (and every tool) placed on BOTH mouse buttons
The editor's `paper` mousedown handler didn't check `e.button`, so a RIGHT-click
ran the active tool (dropping an emoji / starting a shape) AND opened the browser
context menu. Added `if(e.button !== 0) return;` — only the left button
places/draws; right-click is left for the context menu.

Verified in-browser: resized row grows chat 56px→151px (shows all messages);
right-click with emoji/rect tool places nothing, left-click places. Root
`index.html`/`editor.html` mirrored.

## [v0.1.184d] — 2026-07-07 — Week headers, per-week add-task, remove Compare

Batch (part 1 of the QA list).

### Week not shown in header / week name disappears under a filter
`render()` dropped the week folder chrome whenever `weekKeys.length <= 1` — so a
project whose tasks all sit in ONE real week, or a filtered view that leaves one
week, rendered flat with no week label. Now the chrome is dropped ONLY when there
are no real weeks (everything Unscheduled); a single real week keeps its header.

### Add a task in EVERY week (not just the list bottom)
Each open week now renders its own "+ Add task to <week>…" input.
`renderEmptyRowForProject(projId, week)` + `createTaskFor(..., week)` file the new
task straight into that week (local + cloud `week_tag`). `wireUpEmptyInput` reads
`data-week`. Complete (closed) weeks get no add row.

### Removed Before/After Compare mode (client request)
Dropped the row "Compare" button, the `#compare` modal, `openCompare`/
`closeCompare`, the Esc handler branch and the `compareLabel`/`hasBoth` locals.
Presentation mode covers side-by-side viewing.

Verified in-browser: single-week header shows; header persists under a status
filter that leaves one week; per-week input files the task into the right week;
zero Compare buttons; no console errors. Root `index.html` mirrored.

## [v0.1.184c] — 2026-07-07 — Fix: fresh-capture pin-comments were lost at PASTE time (before any reopen)

Follow-up to v0.1.184. That fix restored comments on reopen, but a comment added
during the FIRST capture never reached storage: the fresh screenshot goes through
paste-mode (`enterPasteMode` → click a slot → `assignShotToSlot`), which carried
only the flat image. The editor's pin-comments were dropped the moment the shot
landed in BEFORE/AFTER — so there was nothing to restore later.

- `enterPasteMode(dataUrl, ann, cmt)` now carries the editor's vectors alongside
  the pending image (`pendingScreenshotAnn` / `pendingScreenshotCmt`).
- `_persistPastedVectors(t, slotIdx)` writes them into `annBySlot`/`cmtBySlot`
  and to the cloud (annotations JSONB `_cmt`, same as the editor-save path).
  Called from both paste-assign sites (`piClick`, the `.pi` click handler) and
  from the present-mode BEFORE/AFTER capture.
- `exitPasteMode` clears the carried vectors.

Verified in-browser: fresh capture with a comment → paste into BEFORE →
`cmtBySlot[0]` holds the comment text; reopen path already feeds that back to the
editor (v0.1.184). Root `index.html` mirrored.

## [v0.1.184b] — 2026-07-07 — Fix batch: drag-to-week, screenshot slots, delete picture, PDF layout

Five bugs from the client's screenshot batch.

### Bug 5 — task can't be dragged to another week / kebab dead after a failed move
Root cause: the drag ended ONLY on a document `mouseup`. Released outside the
window (common when dragging toward a week header — WKWebView drops the mouseup),
the once:true `_mDragUp` never fired, so `_mDragId`, the mousemove listener and
the `.dragging` class stayed live. The next click's mouseup then triggered that
stale `_mDragUp`, which ran a drop + render() and swallowed the click meant for
the kebab.
- Single side-effect-free `_endDrag()` teardown, used everywhere.
- Global capture `mousedown` + `window blur` flush a stuck drag so it can't eat
  the next interaction (kebab now always opens; no spurious move).
- Edge auto-scroll while dragging (`_startDragScroll`) so a task CAN be dropped
  on a week that is scrolled off-screen.
- Verified in-browser: stuck-drag → kebab opens, no spurious move; off-screen
  week reachable; normal drag-to-week still commits.

### Bugs 2 & 3 — "+Add screenshot" replaced BEFORE/AFTER; target depended on what was open before
`addShotToPresentTask(dataUrl, slot)` now takes an EXPLICIT slot. Only the desktop
capture round-trip passes the slot it stashed for THIS cycle (then clears it);
drop/paste always append. `captureScreenshot` resets `pendingPresentAttach`/
`pendingPresentSlot` at the start of every capture. Kills the leak where a stale
slot from an abandoned targeted capture made the next paste/drop overwrite a slot.
"+Add screenshot" now always ADDS a new shot.

### Bug 4 — unable to delete a picture
`deletePresentShot(taskId, slotIdx)` + an on-image trash button (hover, top-right)
on BEFORE / AFTER / extra viewers. Registers an undo so ⌘Z restores the removed
image (addresses "not possible to restore the old image"). `.pres-del` style,
`ICON_TRASH_SM`.

### Bug 1 — PDF: "one task per sheet is way too much / shall be more compact"
Compact (several tasks per page with before/after thumbnails) was already the
default but hidden behind a "Detailed (one task per page)" checkbox that the
client had toggled on. Replaced with explicit **Layout** radios — Compact
(recommended) selected by default, Detailed clearly opt-in. Date-range and
task-type filters were already present.

Verified in-browser: append vs explicit-slot, delete + ⌘Z restore, drag recovery,
auto-scroll, PDF dialog defaults. Root `index.html`/`editor.html` mirrored.

## [v0.1.184] — 2026-07-07 — Fix: pin-comments now survive reopen (edit/delete + thumbnail badge)

Client bug: "Comments are not saved and cannot be reopened, even when editing."

### Root cause
`editor.html applyPayload` (the desktop/Tauri load path) named its params
`annotations`/`comments`, which SHADOWED the module-level state arrays, then
wrote the restored data to `window.comments` — a property `renderAll()` never
reads. So on desktop every saved pin-comment was lost on reopen. (The web
postMessage path assigned the lexical vars correctly, which is why it worked in
the browser but not in the app.)

### Fixes
- `dist/editor.html` — `applyPayload` restores into the real lexical `comments`
  + `commentCount` (resumes numbering from the highest pin). Vector annotations
  are baked into the slot image on save, so they are intentionally NOT
  re-overlaid (would double every mark against the baked background).
- `dist/editor.html` — comment bubble gains **Edit** (was Delete-only): a pin's
  text can now be changed, not just removed. `editCmt`/`saveCmtEdit`/
  `closeCmtEdit`/`onCmtEditKey` + shared `cmtViewHtml`.
- `dist/index.html` — `renderPic` shows a **comment-count badge** on a slot
  thumbnail when it has saved pins, so it is visible that comments were stored
  (pins are deliberately not baked into the image — baking would leave a ghost
  pin after a delete). New `.pi-cmt` style.
- Root `index.html` / `editor.html` mirrored from `dist/` (Pages parity).

Verified in-browser: 2 comments restore into lexical state + render as pins,
edit updates text and returns to view mode, delete removes pin, badge shows the
count on a populated slot and is absent on an empty one. Rust already forwards
`comments` in the editor-pending payload — no backend change needed.

## [v0.1.62] — 2026-05-13 — Phase E/G minimal: annotations persist, invites, audit

Builds on v0.1.61's cloud wiring. Three more capabilities, each tied to a
specific item Roman raised on the call or in the SPRINT2_PLAN audit.

### Annotation persistence across sessions (Phase C #3 — call request)
- `editor.html` now emits `screenshot-ready` with `{dataUrl, annotations,
  comments}` instead of just the flat PNG. main listens, persists
  `annotations` JSONB on the task, and on next open re-loads them so the
  user resumes an editable session — exactly what Roman asked for
  ("открыл заново, история на 5 шагов назад").
- `open_editor_with_image` (Rust) accepts optional `annotations` /
  `comments` payload and re-emits both to the editor as `load-image` +
  `load-annotations`. Editor merges them into `annotations` + `comments`
  state, resets undo/redo stacks for a clean session, and notifies the
  user.

### Profile auto-create (Phase E)
- `0013_profile_invites_audit.sql` adds a trigger `on_auth_user_created`
  on `auth.users`. New OAuth signups get a matching row in
  `public.profiles` automatically (with email / full_name / avatar_url
  from raw_user_meta_data, default role 'engineer').
- Backfill query covers any existing auth users without profiles.

### Project invites (Phase E)
- `project_invites` table created (token, role, expires_at = +14d).
- RLS: admin/owner can insert/select/delete; invitee can see their own
  pending invite.
- `accept_project_invite(token)` Postgres function adds the current user
  to `project_members` and marks the invite accepted.
- `inviteToCurrentProject()` UI replaces the OOS placeholder. Generates
  `engiboard://invite/{token}` link and copies to clipboard so the
  inviter can paste it anywhere (Slack, email).

### Audit log (Phase G minimal)
- `audit_events` table — actor_id, project_id, entity, entity_id, action,
  before_data + after_data JSONB. Indexed on (project_id, created_at) and
  (entity, entity_id).
- `auditLog(action, entity, id, before, after, projectId)` helper, fire-
  and-forget. Wired into `changeStatus` for now (status_change events).
  Activity feed UI to follow.

---

## [v0.1.58] — 2026-05-10 — Phase A wrap-up: dashboard 8-status, split slideshow, SVG icons

Closes the three Phase A items left over from v0.1.46 (per SPRINT2_PLAN.md
acceptance audit done after the QA pass).

### A.4 — Dashboard 8-status everywhere
- KPI strip: 4 cards → **8 cards**, one per status (Info / Done / Not Relevant /
  Review / Info Required / Problem / In Progress / Upcoming). Each card has a
  3-px top border tinted with the status color, count in big number, and
  "X% of TOTAL" caption.
- Project legend in each project card: 4 fixed stats (Done/Active/Review/Issues)
  replaced with a **2×4 grid covering all 8 statuses**. Cells where count=0 get
  `.zero` class (35% opacity).
- 8-segment stacked progress bar already existed — now also has hover tooltips
  with status name and count.
- Responsive: 8 cards on ≥1500px, 4×2 grid below, 2×4 on narrow.

### A.5 — Slideshow split-view + chat LEFT
- `renderPresent()` redesigned. Layout is now
  `chat-LEFT (340px) | pics side-by-side RIGHT`. BEFORE and AFTER are visible
  simultaneously instead of one-at-a-time carousel.
- Click on either image opens the editor for that slot.
- Removed slideshow Prev/Next nav (no longer needed with both pics shown).
- Empty BEFORE or AFTER shows a graceful placeholder instead of nothing.

### A.7 — SVG icons (minimum-viable set)
- New helper `_ICON` map + `ICON('name')` function with 8 inline SVG icons:
  `play`, `clock`, `swap`, `chat`, `camera`, `send`, `check`, `x`. Strokes use
  `currentColor` so icons inherit the surrounding text color.
- Replaced emoji in primary task-row actions: `▶ Presentation` → SVG play,
  `⏱ start` / `⏱ 1h 25m` → SVG clock, `⇄ Compare` → SVG swap, `💬` empty-chat
  state → SVG chat balloon.
- Remaining emoji (pdf/csv chip labels, toast confirmations) left intact —
  not in interactive primary surfaces, swap-cost > value.

---

## [v0.1.55] — 2026-05-10 — Roman's call notes: 8-point shipping pass

Roman's screen-share feedback turned into eight required changes. This
release lands six of them (4 — Windows polish — needs a Windows machine,
3 — annotation-vector persistence — is a separate Phase B/C piece).

### Task row simplification (#5, #6)
- Removed the entire `.tit-col` (task title + `#ID`) from every row. Grid
  collapsed from 5 columns to 4: `drag · chat-col · BEFORE · AFTER`.
  Rationale: the screenshots speak for themselves; the title was visual
  noise. `t.title` is still kept in storage for search and is still set
  on `+ Type new task` flow — just not displayed in-row.
- Status pill moved into `.chat-row-actions` next to start/Presentation/
  Compare. One unified action strip per row.

### Out-of-scope guard removed (#7)
- Stage-1-strict OOS modal and overlay are gone. Full feature set is now
  in scope. `outOfScope()` downgraded to a soft toast for any remaining
  call site whose backend isn't wired yet (Slack webhook persist, email
  invites — both wait on Phase B Supabase).
- `openCompare()` no longer guarded — wipe slider works directly.

### Annotator: autosave + redo (#1, #2)
- `editor.html`: `Save to task ↗` button renamed to `Done ✓` and is
  optional — closing the window (✕, ⌘W, OS quit) **autosaves** the
  flattened image into the originating task slot. Discard button still
  bypasses save (asks confirmation if there's work).
- Redo stack added (10-step ring buffer, default ~5 forward / 5 back).
  Bound to ⌘⇧Z and ⌘Y. Toolbar gained ↶/↷ icon buttons. All
  `undoStack.push(...)` callsites consolidated into a single
  `pushHistory()` helper that also clears the redo stack on new edits.

### Multi-monitor sniper (#8)
- `open_sniper` (Rust): switched from `primary_monitor()` to
  `current_monitor()` so the dim sniper overlay opens on the same display
  EngiBoard is on. Window position now uses that monitor's origin
  (`m.position()`) instead of hard-coded `(0, 0)`. Existing macOS
  `screencapture -R x,y,w,h` already understands global desktop
  coordinates so capture works across displays.

### Deferred
- (#3) Persist annotation history across sessions — needs vector
  annotations to live in `task.annotations` instead of being flattened
  into PNG. Belongs with the screenshots-to-Storage migration in Phase C.
- (#4) Windows .exe popup audit — needs a Windows test machine.

---

## [v0.1.54] — 2026-05-10 — THE actual root cause: broken CSS parser

### What it really was
Versions v0.1.47 → v0.1.53 hunted the wrong target. The "huge icons" Roman
kept reporting were **not** broken-image renders, **not** unscaled
screenshots, **not** lightbox content. They were SVG icons in the **sidebar**
(`.sb-i svg`) rendering at their natural ~1440px size because their CSS rule
`.sb-i svg { width:16px; height:16px }` was being silently dropped.

### The actual bug
Lines 340-343 of `index.html` had a duplicated `.proj-picker-btn{` selector
**without a closing `}` between them**:

```css
.proj-picker-btn{
  display:inline-flex;align-items:center;gap:10px;padding:7px 14px 7px 12px;
.proj-picker-btn{                                  ← duplicate, no } above
  display:inline-flex;align-items:center;gap:10px;padding:7px 14px 7px 12px;
  background:var(--surf);...
}
```

A CSS parser sees an unbalanced `{` and silently swallows hundreds of
subsequent rules — including `.sb-i svg { width:16px }`. Without that rule,
the sidebar SVG icons fell back to the user-agent default and stretched to
fill their flex container, giving Roman gigantic black rounded squares with
white rectangles inside (the actual SVG glyphs at 1440×1440).

### The fix
Removed the duplicate `.proj-picker-btn{` block. CSS brace count is now
balanced (641 open / 641 close).

### How it was finally diagnosed
Enabled Tauri devtools (`features = ["devtools"]` on `tauri` crate),
right-clicked → Inspect Element on one of the giant icons. DevTools showed
`<svg viewBox="0 0 24 24">` at computed `1440×1440px` inside `<div class="sb-i">`,
with **no `.sb-i svg` rule in the matched-rules pane**. That immediately
pointed to a CSS parser breakdown rather than anything image-related.
Python brace-counter on the `<style>` block confirmed `{=642 }=641`, and
locating the unclosed nesting was straightforward.

### Removed
- v0.1.53's blanket image-size caps and the `img[src=""]{display:none}` guard
  are kept; they're cheap defense-in-depth, harmless either way.

### Lesson
When a rendering bug doesn't move under image- or layout-targeted fixes,
check whether the relevant CSS rule is actually applying. A single typo
upstream can silently nullify an entire stylesheet section.

---

## [v0.1.53] — 2026-05-10 — REAL FIX: lightbox image size cap (root-cause)

### Fixed (the actual bug)
After 6 versions (v0.1.47–v0.1.52) defensive-patching what I assumed was a
"broken-image fallback" rendering issue, the real problem turned out to be
much simpler: **the lightbox / slideshow / compare views had no CSS size cap
on `<img>` elements**, so any screenshot rendered at its natural pixel size,
filling the whole viewport with whatever happened to be in the middle of the
image (often a single icon-like UI element on a dark CAD background).

The "huge icons" Roman kept reporting were never broken-image SVGs — they
were the *content* of legitimate screenshots, displayed unscaled.

### Changed
- Hard CSS cap on every image inside `#lightbox`, `.pres-pic`, `.cmp-img-wrap`
  and `.ci-img`: `max-width:70vw; max-height:70vh; object-fit:contain`.
- Padding around lightbox stage (`6vh 8vw`) and slideshow grid (`4vh 6vw`)
  so images sit visually inside the frame instead of bleeding to edges.
- Removed the runtime QA debug overlay (MutationObserver + `findHuge` +
  clipboard report) — no longer needed once the structural cap is in place.
- Simplified `img[src=""], img:not([src]) { display:none }` is the only
  broken-image guard kept; everything more elaborate was redundant.

### Removed
- v0.1.51–52 debug banner & MutationObserver loop.
- v0.1.50 strict-`isBadSrc` and the related defensive guards in
  `renderPic` / `renderPresent` / `openLightbox`.

### Lesson learned
When a fix doesn't move the needle after 2 attempts, **stop patching and
reread the screenshot**. The user's "уменьши эту иконку" (REDUCE *this* icon,
singular) was the clue that the displayed pixels were valid content, just
unconstrained. Six iterations of guarding against broken images was wrong
abstraction — the discipline is to step back and re-question the diagnosis.

---

## [v0.1.48] — 2026-05-08 — Hotfix: lightbox broken-image fallback

### Fixed
- v0.1.47 covered slideshow + .pi thumbnails but **lightbox** (the
  full-screen single-image view with comments panel) had its own
  `<img id="lightboxImg">` element with no guard. Empty/short dataURL
  rendered the macOS WebView default broken-image SVG at full size.
- `openLightbox()` now validates `dataUrl` (length ≥ 32) and toggles
  between the image and a friendly "Screenshot data missing" overlay.
- `<img>` also gets an `onerror` handler as belt-and-suspenders.

# Changelog

All notable changes per release are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/).

---

## [v0.1.47] — 2026-05-08 — Hotfix: broken-image fallback in slideshow + .pi

### Fixed
- When a task's screenshot dataURL was empty/corrupted, slideshow and task-row
  thumbnails would render the macOS WebView default broken-image icon at full
  cell size. Now both paths check for a usable string (≥32 chars) and render a
  graceful placeholder instead. `<img onerror>` also catches in-flight load
  failures.

### Note
This is a defensive patch — the underlying cause (stale/corrupt base64 in
localStorage) goes away in Phase B when screenshots move to Supabase Storage.

---

## [v0.1.46] — 2026-05-08 — UX pass: tbar picker · chat-left · 8-status filters · EN-only

### Changed (UX consolidation from validated case-study mockups)
- **Project picker moved into the title-bar** (was in `.proj-bar` row beneath
  it). `.proj-bar` removed entirely — saves ~50 px vertical space. The `+ New
  project` action is now a floating button in the top-right corner of the list.
- **Chat is now the leftmost data column in every task row.** Grid changed
  from `24 / 160 / 240 / 1fr / 1fr` to `24 / 260 / 240 / 1fr / 1fr` and source
  order swapped: `drag · chat · title-id-status · BEFORE · AFTER`.
- **Chat fills the full row height** — the previous `max-height: 64px` on
  `.chat-list` is gone. Bigger conversations are visible without scroll.
- **Filter chips: all 8 statuses with their colors.** Replaces the old set
  (`All · Problem · In progress · Done`) with `All` + 8 status-tinted chips
  matching the pill colors. `data-f` is now the int status index (0..7); legacy
  string filters still accepted. CSS classes: `.chip.fc-info` … `.chip.fc-up`.
- **Column header row removed.** `.col-hdr` no longer rendered (legacy class
  retained for back-compat but `display:none`).
- **Language toggle removed.** EN-only build — the sidebar bottom no longer
  has the RU/EN switch. The `I18N` map and `applyLang()` are kept for future
  re-enable but no UI affordance.
- **Compare button** in row actions: now opens the wipe modal again
  (was `outOfScope` in v0.1.40 — wipe is in scope of Sprint 2).

### Notes
- Dashboard, slideshow split-view, and full SVG-icon pass deferred to v0.1.47
  to keep this delta reviewable on Mac.
- Sprint 2 plan committed: `docs/SPRINT2_PLAN.md`.

---

## [v0.1.45] — 2026-05-07 — Permission fail-safe for empty captures

### Added
- **Детект пустого/чёрного capture'а на macOS.** Когда в Системных
  настройках не выдано разрешение «Запись экрана», `screencapture` пишет
  крошечный пустой PNG (~700 байт) и редактор открывается с чёрным
  фоном. Теперь backend ловит эту ситуацию (area > 5000 px²,
  PNG < 1500 байт) и эмитит событие `capture-needs-permission`.
- **Модалка с прямым доступом к настройкам.** При получении этого
  события main webview показывает красную модалку с инструкцией и
  кнопкой «Открыть настройки», которая через
  `open_screen_recording_settings` ведёт прямо в нужный раздел
  Системных настроек.

### Why
Roman сообщил «скриншоттер окно не появляется». На свежей системе
с TCC reset macOS требует выдачи разрешения при первом capture'е.
Без этого editor открывался с чёрным изображением — выглядело как
«окно не появилось». Теперь причина озвучивается явно.

---

## [v0.1.44] — 2026-05-07 — Drop week tag, lower default row height

### Changed
- **Убрали неделю/дату из задачи и из списка.** ID задачи остался только в
  виде `#N` (без `26W17`). Заголовок «Week 26W17 — current week» между
  группами тоже выкинут — список теперь плоский. Filter chip "This week"
  убран как ненужный.
- **Default min-height строки задачи: 150 → 96 px.** Это компактнее под
  16:9 скриншот при доступной ширине pic-cell. Пользователь по-прежнему
  может тянуть resize-handle вниз для увеличения, как раньше.

### Note
- Поле `t.w` в данных задачи остаётся (back-compat с существующими тасками),
  просто не отображается. Фильтр по неделе всё ещё работает программно
  если кто-то его использует через API, но UI-кнопки больше нет.

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
