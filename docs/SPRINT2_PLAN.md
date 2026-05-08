# Sprint 2 — Production Engineering & Cloud Sync Plan

**Status:** 🟢 Active  
**Goal:** From single-user localStorage app → distributed-team cloud product on shared web schema.  
**Architectural decision:** **Option D** — unify desktop with the existing web app schema (one product, two clients). Per `supabase/ARCHITECTURE_DECISION.md`.  
**Target:** v0.1.46 → v0.5.0 over ~6–8 weeks of focused work.

---

## Phase A — UX-pass from case-study mockups (v0.1.46)

Roman validated the new UX in case-study HTML mockups. Now propagate to the real app.

### A.1 Project picker in title-bar
- Move picker from `.proj-bar` (separate row under tbar) into `.tbar` itself, between brand-mark and tbar-spacer.
- Drop `.proj-bar` entirely — saves ~50 px vertical space.
- New element: `.tbar-proj` with project name + code + meta (`23 tasks · 14 done · 61%`).

### A.2 Chat panel: LEFT, full row height
- 5-column grid `.row` reorders: `drag · CHAT · title-id-status · BEFORE · AFTER` (was `drag · title · CHAT · BEFORE · AFTER`).
- `.chat-col`: remove `max-height:64px`, let it stretch full row height.
- Background bg-gray rounded box for chat to visually separate.

### A.3 Filter chips — all 8 statuses with status colors
- Replace 5 chips (`All · Done · In progress · Review · Problem`) with 9: `All` + 8 status-colored chips matching pill colors (`fc-info`, `fc-not`, `fc-prog`, `fc-rev`, `fc-req`, `fc-prob`, `fc-up`, `fc-done`).
- `.chip.fc-* .on` → solid background of status color, white text.

### A.4 Dashboard — all 8 statuses everywhere
- KPI strip: 4 → **8 cards** (one per status), top-border tinted, large count.
- Project cards: legend grid 3-row (was) → **2×4 grid covering 8 statuses**, with `.zero` opacity for unused.
- Stacked progress bar: 4-segment (was Done · In progress · Review · Empty) → **8-segment** mirroring full status distribution.

### A.5 Slideshow → split-view + chat LEFT
- Layout becomes `chat-panel-left | slides-side-by-side`.
- Two screenshots shown simultaneously (BEFORE/AFTER pair) instead of single carousel.
- Chat in dedicated 340px left panel with same look as task-row chat.

### A.6 EN-only, no language toggle
- Drop sidebar `EN ↔ RU` toggle and `I18N` runtime application.
- All `data-t` and `data-t-ph` resolved at build into hard EN strings.
- Keep `I18N` map in code for future re-enable but remove the toggle.

### A.7 Emoji → SVG icons
- New file: `icons.css` with 16 inline-SVG data-URI icons (camera, clipboard, send, pen, compare, pdf, csv, check-square, chat, clock, mail, keyboard, plug, search, x, arrow-down).
- Replace tbar buttons (📷 → camera, 📋 → clipboard, ⚙️ → cog or removed).
- Replace status pill chevrons, send buttons, send-test, etc.
- Skin: stroke `#475569` light, `#cbd5e1` dark via `filter: invert`.

### A.8 Build + install on Mac, commit v0.1.46
- `cargo tauri build --target aarch64-apple-darwin` → install in /Applications.
- Roman tests on Mac + Windows laptop. No tag push until he says "выкатывай".

---

## Phase B — DB schema migration (Sprint 2.1, v0.1.47–v0.1.50)

**Trigger:** Roman provides Supabase DB password / Personal Access Token (`sbp_*`).

### B.1 ADR-2: Option D unification
Document in `supabase/ADR-002-OPTION-D.md`:
- Why D over A
- Migration order: profiles → projects → tasks → screenshots → chat → activity
- Per-feature acceptance criteria

### B.2 Wrapper `db.*` layer
- File: `index.html` already has stub. Expand to cover full CRUD.
- Each method: try Supabase first, fall back to `localStorage` on error.
- Auto-sync queue: queued mutations replayed on reconnect.

### B.3 Schema migrations
- `supabase/migrations/0010_align_desktop_to_web.sql` — reuse existing web tables, add desktop-specific columns (`shot1_url`, `shot2_url` referencing Storage).
- `supabase/migrations/0011_eb_dt_compat_views.sql` — views for backwards compat with old desktop reads during transition.

### B.4 Per-feature migration order
1. **Projects** — read/write via Supabase, RLS by `owner_id` and `project_members`.
2. **Tasks** — same. status int → text mapping function.
3. **Screenshots** — uploaded to Storage `screenshots/{project_id}/{task_id}/{shot_id}.png`; signed URLs cached.
4. **Chat** — `task_chat` table with optimistic insert.
5. **Annotations** — JSONB column on task or separate `annotations` table.

### B.5 Local dev workflow
- `supabase start` for local development DB.
- Schema-first dev — any change goes through migration, tested locally.

---

## Phase C — Storage for screenshots (Sprint 2.2, v0.1.51–v0.1.53)

### C.1 Upload pipeline
- After capture/paste/drop, instead of base64 in JS, upload to `storage.from('screenshots')` and store URL.
- Progress indicator while uploading (large screenshots > 5 MB).

### C.2 Migration of existing base64 → Storage
- One-time migration script: scan localStorage tasks, decode base64, upload to Storage, update DB row.
- Run on app start once per user, gated by `eb_storage_migrated` flag.

### C.3 Optimistic display
- Show base64 (or local blob URL) instantly while upload is in flight.
- Replace with Storage URL when upload completes.

### C.4 Lazy-loading
- `IntersectionObserver` on .pi cells; `<img loading="lazy">` with placeholder.
- Critical for tables with hundreds of rows.

---

## Phase D — Real-time collaboration (Sprint 2.3, v0.1.54–v0.1.57)

### D.1 Realtime channels
- Per-project Supabase Realtime channel: `project:{id}`.
- Subscribe to `tasks:INSERT|UPDATE|DELETE` and merge into local state.

### D.2 Optimistic locking
- Each task row has `updated_at` timestamp.
- On save, check `updated_at = client_seen_at` server-side; reject with 409 → UI shows "Reload, this task was edited by Maria".

### D.3 Chat realtime
- `task_chat` channel `task:{id}:chat`.
- Insert appears in all viewers' UIs in <1s.

### D.4 Annotation real-time (deferred to v0.6)
- Live cursor + draft annotations from other editors — heavy, defer.

---

## Phase E — Auth + RLS + invite (Sprint 2.4, v0.1.58–v0.1.61)

### E.1 Real Supabase Auth
- Replace demo mode toggle with email + Google OAuth.
- Session persistence via `sb.auth.setSession()` + Tauri secure storage.

### E.2 RLS policies
- `tasks`: SELECT/INSERT/UPDATE allowed if `auth.uid() IN (SELECT user_id FROM project_members WHERE project_id = tasks.project_id)`.
- Same pattern for `task_chat`, `screenshots`, `annotations`.
- Service-role bypass for migration scripts only.

### E.3 Invite by email (real)
- `project_invites` table: `email, project_id, role, token, expires_at`.
- Email send via Supabase Auth invite or a transactional provider.
- Magic link → on accept, insert into `project_members`.

### E.4 Roles in UI
- `owner` / `admin` / `member` / `viewer`.
- `viewer` can't edit, member can't delete project, etc. Enforced both client (UX hints) and server (RLS).

---

## Phase F — Performance for thousands of tasks (Sprint 2.5, v0.1.62–v0.1.64)

### F.1 Pagination
- Tasks fetched 50 at a time, infinite scroll on `.list`.
- Server-side filter & sort to avoid loading the world.

### F.2 Indexes
```sql
CREATE INDEX idx_tasks_project_status_position ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_search ON tasks USING GIN(to_tsvector('english', title || ' ' || coalesce(notes,'')));
```

### F.3 Virtual scroll
- Library or hand-rolled: only render rows in viewport ± buffer.
- Critical at 1000+ tasks.

### F.4 Bench
- `bench/` folder: synthetic dataset 5k tasks, measure FPS scrolling, time-to-first-render, memory.

---

## Phase G — Activity log + Presence + Offline (Sprint 2.6, v0.1.65+)

### G.1 audit_events table
- Every mutation logs `(user_id, action, entity_type, entity_id, before, after, ts)`.
- Activity feed UI in profile / project view.

### G.2 Presence
- `presence` channel: each viewer broadcasts `(user_id, task_id_viewing)`.
- "Currently viewing: AS, RM" badge in task header.

### G.3 Offline queue
- When network down: mutations queued in IndexedDB.
- On reconnect: replay in order, conflict-resolve via `updated_at`.

---

## Phase H — Pre-release polish (toward v0.5.0)

- Auto-update via `tauri-plugin-updater` (requires EV cert from Phase ∞).
- Notarization / EV cert purchase 2–3 weeks before public launch.
- 10-tester scenario QA (Roman drives on Win laptop + Mac).
- Privacy / Terms / Onboarding tour update.

---

## Roman's external blockers (recap)

1. **Supabase DB password / PAT** — needed at start of Phase B. Roman to provide.
2. **Architectural decision A vs D** — DECIDED: Option D.
3. **Windows EV cert** — purchase 2–3 weeks before public launch (Phase H).
4. **Apple Developer** — excluded by Roman.

---

## Workflow rules

- **No tag pushes until Roman explicitly says "выкатывай"** — local Mac builds only for iteration.
- Commits to `main` are fine; just no `git tag v*; git push origin v*`.
- Each phase ends with a Mac install + Roman test cycle.
- Bug reports from Roman ⇒ fix in next minor (v0.1.x).

---

*Author: Claude (autonomous mode) · Owner: Roman M.*  
*Last updated: 2026-05-08*
