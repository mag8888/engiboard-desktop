# EngiBoard — 2-month regression check (2026-05 → 2026-07)

Ran 2026-07 against current code (v0.1.184) in a browser harness (real DOM/mouse
events on demo data). Source of truth for "all bugs": 67 fix commits since
2026-05-07 + CHANGELOG (v0.1.0–62, v0.1.184x) + the DEBUG sheet.

## RESULT: 80 / 80 automated checks PASS · 0 console errors

### A. DEBUG-sheet batch (this session) — 48/48
Comments save/reopen/edit/delete + fresh-capture persist + badge; PDF compact;
+Add appends / no stale slot; delete picture + undo; drag to week / auto-scroll /
failed-drag kebab recovery / sort-stick / 24-op stress; week header shown &
persists under filter; per-week add; closed-week lock; All-projects; project kept
across tabs; engineer on create; picker refresh; emoji/tools left-only; right =
context menu; compare removed; row-resize chat grows; Drive kebab toggle. (see
MANUAL_TEST_PLAN.md)

### B. Historical fixes (v0.1.62 → v0.1.183) — 32/32
| Check | Guards |
|---|---|
| undo/redo present | v0.1.69 |
| reorder switches to Manual under sort | v0.1.183 |
| linkify url + bare domain | v0.1.171/176 |
| no raw-HTML injection (XSS) | v0.1.181 |
| out-of-range status no render crash | v0.1.181 |
| task menu says "Templates" (not "Insert template") | v0.1.167 |
| task kebab toggles closed on repeat click | v0.1.138 |
| up/down move-arrows present | v0.1.170 |
| PDF export fns present | v0.1.15+ |
| pin / unpin | v0.1.152 |
| mark bug + Hide-bugs state | v0.1.164/169 |
| deadline set / clear renders | v0.1.149 |
| archive / unarchive | v0.1.141 |
| duplicate task | v0.1.x |
| week complete | v0.1.152 |
| roll-forward fn | v0.1.x |
| move-to-week fns | v0.1.150 |
| assignee set | v0.1.150 |
| dark mode toggles | v0.1.16 |
| task menu English-only (no Cyrillic) | v0.1.174 |
| Blur tool removed from editor | v0.1.164 |
| core tools present | — |
| editor buttons (undo/redo/clear/discard/save) | v0.1.69 |
| arrow rendered as SVG (tracks cursor) | v0.1.131/#7#8 |
| comment added | v0.1.172 |
| hide-marks fn | v0.1.150 |
| editor left draws / right no draw | v0.1.184/#15 |

## NOT auto-testable in browser — verify on device / cloud / CI
- Tauri/WebView2/WKWebView: blank editor on Windows (v0.1.85/131/132), compositor
  repaint (v0.1.98/105/180), capture crash / async open_editor (v0.1.133),
  silent capture permission (v0.1.45/67), deep-link OAuth (v0.1.6/34/140),
  presentation image refresh/flicker on desktop (v0.1.175/179).
- Cloud/Supabase: project invites + RLS (v0.1.86/89), real Google account
  (v0.1.139/140), realtime sync, license-gate lockdown (v0.1.160/161).
- Windows-only: machine fingerprint (v0.1.162), NSIS installer, SmartScreen.
- CI: Windows charmap / dep pinning (build pipeline).
These are covered by the GitHub Actions Windows smoke test + the Mac .app build
(exercises the native paths) + a manual pass on a Windows VM.
