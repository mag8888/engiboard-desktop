# EngiBoard — Manual Test Plan (full flows)

Owner: QA · Target build: v0.1.184 · Scope: desktop app (dist/index.html + editor.html)
Legend: P0 = blocker, P1 = major, P2 = minor · Each case = Steps -> Expected.
Regression column maps to the DEBUG sheet row it guards.

Setup for every run:
1. Fresh install / clean localStorage. Sign in (demo account).
2. Have at least 2 projects, one with tasks across 2+ weeks, one empty.
3. Desktop app on the client platform (Windows). Repeat key cases on Mac build.

---

## TS-1 · Boot & Auth
- 1.1 (P0) Launch app -> login screen shows; no blank window.
- 1.2 (P0) Sign in (email+pass) -> board appears, last project restored.
- 1.3 (P1) Sign in with Google -> returns to app authenticated (deep-link).
- 1.4 (P1) Relaunch app -> still signed in, same project/week state.
- 1.5 (P2) No Screen-Recording permission (Mac) -> clear modal, not silent fail.

## TS-2 · Projects
- 2.1 (P0) Open project picker -> "All projects" row at top, then client groups.
- 2.2 (P0) Pick a specific project -> board scopes to it, header shows its name.
- 2.3 (P0) After a project is chosen, pick "All projects" -> board shows all. [DEBUG #10]
- 2.4 (P1) Search in picker -> "All projects" hidden, only matches show.
- 2.5 (P0) Create project: fill number/name/client/lang + Engineer email -> created, board switches to it, appears in picker immediately, no manual refresh. [DEBUG #14, #18]
- 2.6 (P1) Create project with 2 engineers comma-separated -> both in project.members.
- 2.7 (P1) Create project, name empty -> "Name required", not created.
- 2.8 (P1) Rename / archive / delete project from picker -> reflected immediately.
- 2.9 (P2) Enter/Esc in create dialog -> create / cancel.

## TS-3 · Navigation between tabs
- 3.1 (P0) In Projects with project X -> Dashboard -> back to Projects -> still project X. [DEBUG #12]
- 3.2 (P0) In project X -> Favorites (shows pinned across all) -> back to Projects -> project X restored, not "all". [DEBUG #12]
- 3.3 (P1) Deliberately pick "All projects" -> Favorites -> back -> stays "All projects".
- 3.4 (P1) Dashboard cards reflect real project stats after edits.
- 3.5 (P2) Sidebar active state matches current tab.

## TS-4 · Tasks (CRUD + attributes)
- 4.1 (P0) Add task via bottom row (no weeks) -> appears, chat seeded with typed text.
- 4.2 (P0) Add task via a week's "+ Add task to <week>" -> lands in THAT week. [DEBUG #11]
- 4.3 (P0) Change status via dropdown -> pill + color update, cloud persists.
- 4.4 (P1) Edit task name inline -> saved, survives re-render.
- 4.5 (P1) Assign / unassign -> avatar updates.
- 4.6 (P1) Kebab: Duplicate / Pin / Mark-bug / Set deadline / Delete -> each works + undo where applicable.
- 4.7 (P1) Archive task -> moves to archived chip, diagonal hatch.
- 4.8 (P2) Deadline overdue -> red chip.
- 4.9 (P0) Right-click a row -> task context menu opens (not browser menu). [DEBUG #6 family]

## TS-5 · Weeks
- 5.1 (P0) Project with tasks in ONE real week -> that week's header IS shown. [DEBUG #9, #19]
- 5.2 (P0) Apply a status filter that leaves one week -> week header stays. [DEBUG #20]
- 5.3 (P1) Move a task from W28 to W27 -> both week names remain visible. [DEBUG #9]
- 5.4 (P1) Collapse / expand a week -> rows hide/show, state persists.
- 5.5 (P1) Create / rename / delete (empty only) week via week kebab.
- 5.6 (P0) Mark week complete (check) -> green check + strikethrough tag.
- 5.7 (P0) In a CLOSED week, editing is locked: status, name, chat, arrows, drag, resize, kebab, "+Add" row disabled; right-click -> "reopen the week" toast; Presentation still opens. [DEBUG #17]
- 5.8 (P1) Reopen the week -> editing restored.
- 5.9 (P1) Roll forward open tasks to next week.
- 5.10 (P1) Move-to-week submenu -> current week marked, new-week option.

## TS-6 · Reordering (arrows + drag)
- 6.1 (P0) Arrow down/up within a week -> swaps, order sticks. [DEBUG regression]
- 6.2 (P1) Arrow at top/bottom of week -> no-op, does NOT jump weeks.
- 6.3 (P0) Drag within a week -> reorders, week unchanged.
- 6.4 (P0) Drag onto a row in another week -> task changes week + position. [DEBUG #7]
- 6.5 (P0) Drag onto a week HEADER (incl. collapsed) -> task changes week. [DEBUG #7]
- 6.6 (P0) Drag toward an off-screen week -> list auto-scrolls, drop lands. [DEBUG #7]
- 6.7 (P0) Failed drag (release outside window) -> next click on kebab/arrow works; no stale drag, no spurious move. [DEBUG #8]
- 6.8 (P1) Drag/arrow under Status/Deadline sort -> switches to Manual, order sticks (no snap-back).
- 6.9 (P1) Drop onto a complete week -> refused with toast.
- 6.10 (P2) 20+ mixed ops -> no crash, no data loss/dupes, state clean.

## TS-7 · Screenshots & slots
- 7.1 (P0) Capture (hotkey) -> sniper -> editor -> Done -> paste mode -> click slot -> lands in BEFORE/AFTER.
- 7.2 (P0) "+ Add screenshot" -> ADDS a new screenshot; never replaces BEFORE/AFTER. [DEBUG #5]
- 7.3 (P0) Target slot does NOT depend on previously-open image (no stale slot). [DEBUG #5]
- 7.4 (P0) Delete a picture via trash button on the image -> removed; ⌘Z restores. [DEBUG #6]
- 7.5 (P1) Paste image from clipboard / drag-drop file -> paste mode -> slot.
- 7.6 (P1) Thumbnail shows a comment-count badge when the slot has pin-comments.
- 7.7 (P1) Extra screenshots (shots[]) appear as gallery thumbnails in presentation.

## TS-8 · Editor (annotate)
- 8.1 (P0) Every tool draws on LEFT click; RIGHT click never draws/places. [DEBUG #15]
- 8.2 (P0) Right-click in editor -> context menu allowed (not swallowed by a tool). [DEBUG #15]
- 8.3 (P0) Add a pin-comment, Done, reopen -> comment is back and editable. [DEBUG #2]
- 8.4 (P0) Comment added during FIRST capture survives paste into a slot + reopen. [DEBUG #2]
- 8.5 (P0) Edit an existing comment's text (Edit in bubble) -> saved. [DEBUG #2]
- 8.6 (P0) Delete a comment (bubble) -> gone; not resurrected on reopen. [DEBUG #2]
- 8.7 (P1) Vector annotations (arrow/rect/text/etc.) render in saved thumbnail.
- 8.8 (P1) Undo/redo, Clear, Discard, Done buttons behave.
- 8.9 (P1) Shift = perfect square/circle; arrow head sharp; zoom in/out/fit.
- 8.10 (P1) Hide-marks toggle hides overlay, restores on save.

## TS-9 · Presentation mode
- 9.1 (P0) Open Presentation -> BEFORE/AFTER + gallery + chat + notes.
- 9.2 (P1) Navigate prev/next (arrows + keyboard).
- 9.3 (P1) Send chat message; edit notes -> persisted.
- 9.4 (P1) Delete picture in presentation (trash) + ⌘Z.
- 9.5 (P2) Empty-state hero when no screenshots.
- 9.6 (P1) Annotate from presentation -> marks show immediately in preview after save.

## TS-10 · Chat & links
- 10.1 (P1) Inline chat: send, last messages visible, scroll.
- 10.2 (P1) Emoji picker inserts on LEFT click only.
- 10.3 (P1) URLs in chat are clickable (blue).
- 10.4 (P1) Drive links panel: add, open (left half), edit/remove (kebab half).
- 10.5 (P2) Links order / reorder behaves like a list. [DEBUG #1 — OPEN]

## TS-11 · Filters & search
- 11.1 (P0) Status filters (multi) -> only matching tasks; week headers persist. [DEBUG #20]
- 11.2 (P1) "Hide bugs" toggle.
- 11.3 (P1) Search tasks -> filters live.
- 11.4 (P1) Creating a task clears active filter so the new task is visible.

## TS-12 · Export
- 12.1 (P0) Export PDF dialog: date-from/to + task-type filters + Layout radios; Compact default. [DEBUG #3]
- 12.2 (P0) Compact PDF = several tasks/page with before/after thumbnails; NOT one per page. [DEBUG #3]
- 12.3 (P1) Detailed PDF = one full page per task.
- 12.4 (P1) Empty filter -> "No tasks" toast, no file.
- 12.5 (P1) XLSX export with embedded screenshots opens in Excel.

## TS-13 · Mouse buttons (global)
- 13.1 (P0) Left = primary action everywhere; Right = context menu; Middle = no drag. [DEBUG #15]
- 13.2 (P0) Right-button never starts a task drag.

## TS-14 · Removed / negative
- 14.1 (P0) Compare mode is GONE — no button, no modal, no console error. [DEBUG #16]
- 14.2 (P1) Row resized taller -> chat panel grows to fill height. [DEBUG #13a]

## TS-15 · Cloud / persistence
- 15.1 (P1) Edit on device A -> appears on device B (realtime).
- 15.2 (P1) Logout/login -> data intact.
- 15.3 (P1) Offline edits keep working locally.

---

## Regression matrix (DEBUG sheet -> test case)
| DEBUG | Item | Guards |
|---|---|---|
| 2 | Comments save/reopen | 8.3–8.6 |
| 3 | PDF compact | 12.1–12.3 |
| 5 | +Add replaces slot | 7.2–7.3 |
| 6 | Delete picture | 7.4 |
| 7 | Drag to week unstable | 6.3–6.6, 6.10 |
| 8 | Kebab dead after failed drag | 6.7 |
| 9/19 | Week not in header | 5.1, 5.3 |
| 10 | Get to all projects | 2.3 |
| 11 | Create task in current week | 4.2 |
| 12 | Project resets on tab switch | 3.1–3.3 |
| 13 | Chat too small | 14.2 (present part open) |
| 14 | Add engineer | 2.5–2.6 |
| 15 | Emoji both buttons | 8.1–8.2, 13.1 |
| 16 | Delete compare | 14.1 |
| 17 | Lock closed week | 5.7–5.8 |
| 18 | Refresh after create | 2.5 |
| 20 | Week name under filter | 5.2, 11.1 |
| 1 | Links order | 10.5 (OPEN) |

---

## Execution run — 2026-07-07 · build v0.1.184 · harness: dist in browser (logic-level)

Method: each executable case driven by real DOM/mouse events on demo data; asserts on
model + rendered DOM. Tauri-only, cloud-only and file-generating cases are marked
[device] and must be run on the packaged app.

RESULT: 48 / 48 executable cases PASS · 0 console errors.

| Suite | Cases run | Pass | Notes |
|---|---|---|---|
| TS-2 Projects | 2.1,2.2,2.3,2.4,2.5,2.5b,2.6,2.7 | 8/8 | all-projects, create+engineer+picker-refresh |
| TS-3 Navigation | 3.1,3.2,3.3 | 3/3 | project preserved across tabs; deliberate All stays |
| TS-4 Tasks | 4.2,4.3,4.9 | 3/3 | per-week add, status, right-click menu |
| TS-5 Weeks | 5.1,5.2,5.3,5.6,5.7,5.8 | 6/6 | header shown/persists, complete-week lock+reopen |
| TS-6 Reorder | 6.1,6.2a,6.2b,6.3,6.4,6.5,6.7,6.8,6.10 | 9/9 | arrows, drag within/between/header, failed-drag recovery, sort-stick, 24-op stress |
| TS-7 Slots | 7.2,7.3,7.4,7.6 | 4/4 | +Add appends, explicit slot, delete+undo, badge |
| TS-8 Editor | 8.1a,8.1b,8.1c,8.2,8.3,8.4,8.5,8.6,8.7 | 9/9 | left/right buttons, comment restore/edit/delete, fresh-capture persist, composite |
| TS-10 Chat | 10.3 | 1/1 | linkify |
| TS-11 Filters | 11.1 | 1/1 | filter + week header persists |
| TS-12 Export | 12.1 | 1/1 | PDF dialog date+type+compact default |
| TS-13 Buttons | 13.2 | 1/1 | right button never drags |
| TS-14 Removed | 14.1a,14.2 | 2/2 | compare gone, resized-row chat grows |

### [device] — run on packaged app (not coverable in browser harness)
- TS-1 boot/auth/Google-OAuth/permissions (Tauri deep-link + TCC)
- 6.6 drag auto-scroll to off-screen week (verified separately: list.scrollTop 0->1348)
- 7.1/7.5 capture -> sniper -> editor, clipboard paste (Tauri)
- 9.x presentation keyboard nav + annotate-from-present desktop repaint
- 12.2/12.3/12.5 actual PDF/XLSX file output (jsPDF/CDN + file save)
- 15.x cloud realtime / logout-login / offline

### OPEN (not implemented yet)
- 10.5 / DEBUG #1 — links order "like Google Spreadsheets"
- 13a / DEBUG #13 (presentation half) — resizable chat inside presentation mode
