# EngiBoard Test Plan — v0.1.23

Comprehensive QA checklist. Each section = one feature. Mark ✅ pass / ❌ fail / ⏸ skip.

**Tested on:** ____________
**Build:** v0.1.23
**Date:** ____________

---

## 1. Install & launch (5 min)

- [ ] Download `EngiBoard_0.1.23_aarch64.dmg` (Mac) / `_x64-setup.exe` (Win)
- [ ] DMG opens → drag to /Applications
- [ ] First launch: handle "App is damaged" with `xattr -cr /Applications/EngiBoard.app`
- [ ] App opens, login screen visible
- [ ] No console errors in DevTools (right-click → Inspect — only in dev mode)

## 2. Auth (3 min)

- [ ] Click "Try demo" → app opens with 24 sample tasks
- [ ] OR: Click "Sign in with Google" → browser opens OAuth → returns to app
- [ ] Top right shows email or initials
- [ ] Click Profile in sidebar → see Statistics card with task counts

## 3. Capture & paste (5 min)

- [ ] Press ⌘⇧G (or click Capture chip) → app hides → custom overlay appears
- [ ] Drag rectangle on screen → editor opens with the captured area
- [ ] In editor: arrow tool → drag → arrow drawn
- [ ] Save → returns to main app, paste mode active (cursor changes)
- [ ] Click on a task BEFORE/AFTER slot → screenshot inserted
- [ ] Repeat: capture again → click slideshow image (in slideshow) → adds to extras

## 4. Tasks CRUD (5 min)

- [ ] Type in inline `+ Type new task and press Enter` → task created
- [ ] Click status pill → menu opens → click new status → updated
- [ ] Click task title → edit inline → Tab/click outside saves
- [ ] Hover task → drag handle ⋮⋮ visible → drag to reorder → persists
- [ ] Drag bottom edge of row → resize height

## 5. Slideshow + chat (3 min)

- [ ] Click `▶ slideshow` → presentation mode opens
- [ ] ← / → arrows navigate slides
- [ ] Right side chat panel: type message → Send → appears in list
- [ ] `+ 📷 Add` button → captures + adds to t.shots[]
- [ ] Drag image file onto slide → adds to t.shots[]
- [ ] Click image → lightbox opens → click on image → pin appears → write comment
- [ ] Esc closes slideshow

## 6. Bulk select (3 min) — v0.1.23 NEW

- [ ] Click `☑ Select` chip → checkboxes appear on rows
- [ ] Drag handle replaced with checkbox
- [ ] Drag-reorder disabled in select mode (verify: try drag → nothing happens)
- [ ] Click 3 task checkboxes → blue bulk-bar shows "3 selected"
- [ ] Click ✅ Done in bulk-bar → confirm 3 tasks change status, exits select mode
- [ ] Re-enter select mode, select 2 → 🗑 Delete → confirm dialog → tasks gone
- [ ] Click Cancel → exits select mode

## 7. Filters & search (2 min)

- [ ] Click `Problems` chip → only red-status tasks visible
- [ ] Click `This week` → only current-week tasks visible
- [ ] Type in search → tasks filter live
- [ ] Click `All` → returns to full list
- [ ] Click `⊟ Collapse all` → all project bodies collapse
- [ ] Click `⊞ Expand all` → all expand
- [ ] Reload app (⌘R or quit+open) → collapse state persisted

## 8. PDF export (3 min)

- [ ] Click `📄 PDF` chip → wait ~3 sec → file downloads
- [ ] Open PDF → cover page has project name + date + status counts
- [ ] Per-task pages: status side-bar correct color, image quality OK
- [ ] Comments listed below images
- [ ] Filename format: `engiboard_{code}_{date}.pdf`

**Acceptance L-07:** PDF for 50-task project completes < 10 sec.

## 9. CSV import (3 min)

- [ ] Click `📥 CSV` → file picker opens
- [ ] Select `bench/sample.csv` (provided) → tasks import
- [ ] Toast shows `✓ Imported N tasks`
- [ ] All 6 sample tasks appear with correct status / project / week
- [ ] Re-import same CSV → tasks duplicate (expected, no dedup yet)

## 10. Dark mode (2 min)

- [ ] Press ⌘⇧T → theme switches dark
- [ ] All surfaces dark, status pills still colored correctly
- [ ] Click sidebar sun/moon icon → switches back
- [ ] Reload app → state persists

## 11. Localization (2 min)

- [ ] Click sidebar `Language · en` → switches to RU
- [ ] Filter chips: All → Все, Done → Готово, etc.
- [ ] Status pills: Info → Инфо, Problem → Проблема
- [ ] Sidebar items: Dashboard → Дашборд, Profile → Профиль
- [ ] Click again → switches back to EN

## 12. Time tracking (3 min)

- [ ] Click `⏱ start` on a row → red pulsing dot appears, label changes to time
- [ ] Wait 30+ seconds, check label updates live
- [ ] Click again → `Stopped — added 1m (total 1m)` toast
- [ ] Reload app → time persists (`localStorage 'eb_timers'`)
- [ ] Generate PDF → check breadcrumb shows `⏱ 1m`

## 13. Slack webhook (3 min)

- [ ] Sidebar → Profile → scroll to Slack webhook card
- [ ] Paste a real Slack incoming webhook URL → Save
- [ ] Click Send test → check Slack channel for test message
- [ ] Mark a task as Done → check Slack receives notification
- [ ] Mark task as Problem → check Slack receives notification
- [ ] Clear webhook URL → Done transitions no longer fire

## 14. Customizable shortcuts (3 min)

- [ ] Sidebar → Shortcuts
- [ ] Click ✏️ next to "Toggle sidebar" → "press combo…" appears
- [ ] Press ⌘⌥B (instead of default ⌘B) → saves
- [ ] Test new combo → sidebar toggles
- [ ] Try to bind ⌘B to "Toggle dark mode" → conflict detected
- [ ] Click "Reset to defaults" → original bindings restored

## 15. Project list (2 min)

- [ ] 3 demo projects visible at top of list
- [ ] Click triangle on project header → collapses
- [ ] Reload → collapse state persists
- [ ] Sidebar `Projects` count = 3
- [ ] Sidebar `Chats` count = N (visible in CT badge)

## 16. Edge cases (5 min)

- [ ] No tasks at all → "No tasks yet" empty state visible
- [ ] No projects → "Create project" CTA shown
- [ ] Search with no matches → "No tasks found" or empty list
- [ ] Click outside paste mode → mode exits
- [ ] Esc during slideshow → closes slideshow
- [ ] Esc during lightbox → closes lightbox (returns to slideshow)
- [ ] Try to import malformed CSV → toast error, no crash

## 17. Performance (manual, no tooling)

- [ ] Run `bench/seed.js` in DevTools console (paste content → Enter) — generates 50 tasks
- [ ] Scroll task list — should be smooth (no jank, 60fps subjective)
- [ ] Click `📄 PDF` for 50-task project — note seconds
- [ ] Click between projects — switching feels instant

**L-06 acceptance:** subjective smoothness with 50 tasks + 100 screenshots.
**L-07 acceptance:** PDF export < 10 sec.

---

## Bug template

When you find an issue, capture:

```
[v0.1.23] [Severity: critical/major/minor]
What I did: ___________________________________
What happened: ________________________________
What I expected: ______________________________
Console errors: _______________________________
OS / version: _________________________________
```

Email to aleksey.stepikin@gmail.com or open issue at github.com/mag8888/engiboard-desktop/issues.
