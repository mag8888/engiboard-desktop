# Architecture Decision Record — S2 Real Supabase persistence

**Status:** ⏸ Deferred (2026-05-03)
**Sprint:** S2 P0-3
**Decided by:** autonomous analysis, user delegated decision

## Context

Sprint S2 goal: replace desktop's localStorage with Supabase persistence for cross-device sync.

Investigation discovered:

1. **Existing Supabase project `gselxucvcomqlfyogidz` already has data** from a different application (the EngiBoard web app on Vercel — see `engiboard-deploy.vercel.app`).

2. **Existing schema is a rich engineering team model** (not the simple desktop model):

   | Table     | Existing columns                                                                          |
   |-----------|-------------------------------------------------------------------------------------------|
   | profiles  | id, email, full_name, avatar_url, **role** (admin/lead_engineer/engineer/viewer), department |
   | projects  | id, title, description, status, priority, owner_id, due_date, **cad_software**, project_code, progress |
   | tasks     | id, title, description, status (text), priority, project_id, assignee_id, **checklist** (JSONB), position, progress |

3. **Desktop app uses a different model**: simple int status (0–7), week strings (`26W17`), inline base64 screenshots, plain `chat[]` arrays.

4. **The two models are incompatible** without significant refactor on either side.

5. **Schema migration requires DDL access** (CREATE/ALTER TABLE). DDL needs:
   - Direct DB connection (psql with password), OR
   - Personal Access Token (`sbp_*`) for Management API, OR
   - Manual paste in Supabase Dashboard SQL Editor

   Available now: `sb_publishable_*` (anon-equivalent, runtime safe) and `sb_secret_*` (admin for Storage/CRUD but NOT DDL).

6. **Storage bucket creation works** with `sb_secret_*`, but **RLS policies for storage.objects require DDL**, so per-user file isolation cannot be set up without extra credentials.

## Options considered

### A. Isolated tables `eb_dt_*` for desktop
- Pro: clean separation, no impact on web app
- Con: requires DDL paste; data fragmentation between web/desktop apps
- Verdict: pragmatic but architecturally suboptimal

### B. Direct DB connection (psql)
- Pro: full DDL access
- Con: requires DB password not yet provided; longer-lived credential exposure risk
- Verdict: works but high friction

### C. Defer S2 ← **CHOSEN**
- Pro: no architectural compromise; web/desktop products coexist on same DB; localStorage works fine for v0.1.x
- Con: no cross-device sync until decision is made
- Verdict: correct move now — S2 needs an architectural conversation, not just credentials

### D. Refactor desktop to align with web schema (full unification)
- Pro: ideal long-term — one product, two clients, unified data
- Con: massive refactor (1–3 weeks); breaks existing desktop UX
- Verdict: right answer for v2.0, not v1.0

## Resolution

**S2 P0-3 is deferred until architectural decision** between options A / D for v2.0. Until then:

- Desktop continues with `localStorage` (works, no friction).
- Code already includes Supabase JS client + `db.*` wrapper (S2 step 2) — graceful no-op if migration not applied.
- Migration files `0001-0003.sql` remain in repo as a snapshot of what *would* be applied if option A is chosen later.
- Web app continues using existing schema unchanged.

## When to revisit

Trigger to revisit S2:
- Multi-device sync becomes a paying customer requirement
- Real-time chat (S4 P1-3) becomes priority — needs DB persistence first
- Decision made on web/desktop schema unification

## Files affected

- `supabase/migrations/0001_initial_schema.sql` — kept (option A reference, not applied)
- `supabase/migrations/0002_rls_policies.sql` — kept (option A reference, not applied)
- `supabase/migrations/0003_storage.sql` — kept (option A reference, not applied)
- `index.html` — `db.*` wrapper present, falls back to localStorage when DB calls fail
- `index.html` — anon key embedded; `sb_secret_*` not committed (admin-only, server-side use)
