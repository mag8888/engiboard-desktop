# EngiBoard Roadmap

Forward-looking plan beyond v0.1.x. See [CHANGELOG](../CHANGELOG.md) for what shipped.

---

## v0.2.x — Production trust (next 2-4 weeks)

**Goal:** make installs friction-free for non-developers.

| Task | Sprint | Status |
|---|---|---|
| Apple Developer signing + notarization | S1 P0-1 | ⏸ pending Apple Developer Program enrollment ($99/yr) |
| Windows EV Code Signing certificate | S1 P0-2 | ⏸ pending purchase ($300-500/yr + USB token shipping) |
| Auto-update via tauri-plugin-updater | S3 P1-1 | ⏸ blocked on signing |
| 10-tester scenario validation | S8 L-05 | pending broader rollout |

**Acceptance:** fresh Mac + Windows users can double-click → install → use, no terminal commands.

---

## v0.5.x — Cross-device sync (1-2 months)

**Goal:** real-time sync between devices, foundation for collaboration.

This sprint resolves the architectural decision documented in [`supabase/ARCHITECTURE_DECISION.md`](../supabase/ARCHITECTURE_DECISION.md):

### Decision needed: A vs D

**Option A:** Isolated `eb_dt_*` tables for desktop, separate from web app
- Pro: lower risk, parallel evolution
- Con: data fragmentation, two products with same name

**Option D:** Full schema unification — desktop adopts web's rich engineering team model
- Pro: one product, two clients, unified data, sets up future enterprise plays
- Con: major refactor of desktop UX (status text vs int, checklists, due_dates)

**Recommendation:** Option D, executed incrementally — each desktop feature migrates to align with web schema one at a time. The `db.*` wrapper in v0.1.x already isolates data access; refactor goes through that layer.

### Sub-tasks once A or D is chosen

- Apply migrations (DDL via PAT or DB password)
- Replace `TASKS` array with `db.tasks.list()` / `db.tasks.create()` / etc.
- Migrate inline base64 screenshots to Supabase Storage
- Real-time chat via Supabase Realtime (S4 P1-3)
- Project sharing / team workspaces (S4 P1-4)

**Acceptance:** edit a task on Mac, see it within 2s on Windows. Logout → login → data still there.

---

## v1.0 — Public launch (3-4 months)

**Goal:** broadly distributable consumer-grade release.

| Task | Status |
|---|---|
| All 4 artifacts signed | blocked v0.2 |
| Notarization passed (spctl assess accepted) | blocked v0.2 |
| Auto-update verified end-to-end | blocked v0.2 |
| Supabase RLS audit | blocked v0.5 |
| Performance benchmark passed (50 tasks + 100 screenshots smooth) | manual L-06 |
| PDF export benchmark (50 tasks < 10 sec) | manual L-07 |
| Landing page (engiboard.app) | external |
| Pricing tiers (Free / Pro / Team) | business decision |
| Support: knowledge base + help-desk email |  |

**Acceptance:** stranger downloads from engiboard.app → trial → paid plan → support flow works end-to-end.

---

## v2.0 — Enterprise tier (6-12 months)

**Goal:** team workspaces, audit logging, integrations.

- Team workspaces (multi-tenant Supabase architecture)
- Role-based permissions (admin / lead_engineer / engineer / viewer)
- Audit log of all task / project / screenshot changes
- Webhooks beyond Slack: Microsoft Teams, Discord, generic HTTP
- Native iOS / Android companion app (read-only initially)
- Public REST API for integrations
- SSO / SAML support
- Compliance: GDPR data export, SOC 2 Type 1
- Bulk operations: export / archive / migrate between workspaces
- Custom fields per task
- Time reporting per user / project / week
- Gantt view + Kanban view

---

## Tech debt parallel track (S7)

Separate from feature roadmap, runs alongside:

- **TD-1 Modularize** — split index.html (3000+ lines) into ES modules + Vite build. Improves maintainability but doesn't add user value. Schedule when team grows beyond 1 dev.
- **TD-2 Tests** — Rust unit tests for `main.rs`, JS Cypress E2E for the WebView. Schedule before v1.0.
- **TD-3 Telemetry** — Sentry (errors) + PostHog (usage analytics, opt-in). Schedule with launch (v1.0).

---

## Out-of-scope (probably never)

- Mobile-first redesign (desktop-first product, mobile is companion)
- Offline-first sync (current localStorage already is offline-first; cloud sync is the addition)
- Built-in screen recording (out of scope vs screenshots)
- Voice notes (engineering is visual, not audio-driven)
- AI auto-classification of screenshots (could be v3.0 experiment)

---

## How features get prioritized

1. **Customer requests** — direct feedback from active users
2. **Sprint commitments** — what's currently in progress
3. **Architectural prerequisites** — blockers for higher-impact work
4. **Roadmap themes** above

Updated quarterly. See latest dashboard for current sprint state: `engiboard-dashboard` repo.
