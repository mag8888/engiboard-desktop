# Privacy Policy — EngiBoard Desktop

**Effective date:** 2026-05-03
**App:** EngiBoard Desktop (macOS · Windows)
**Publisher:** EngiBoard / Aleksey Stepikin (aleksey.stepikin@gmail.com)

---

## 1. What we collect

EngiBoard Desktop is designed for **local-first, privacy-first** use. Data stays on your device unless you explicitly opt into integrations.

### 1.1 Stored on your device only (`localStorage`)
- Your tasks, projects, screenshots, comments, time-tracking
- UI preferences (dark mode, language, custom shortcuts)
- Slack webhook URL (if you set one)

### 1.2 Sent to Supabase (only when you sign in with Google)
- Your email address (for authentication)
- OAuth access/refresh tokens (managed by Supabase Auth)
- **No task content, screenshots, or activity logs** are uploaded to Supabase by the desktop app in v0.1.x — see [`supabase/ARCHITECTURE_DECISION.md`](../supabase/ARCHITECTURE_DECISION.md).

### 1.3 Sent to Slack (only if you configure webhook)
- When you mark a task **Done** or **Problem**, a notification is POSTed to your configured Slack webhook URL containing: emoji, task title, status, project name, week.
- The Slack workspace that owns the webhook controls retention.

### 1.4 Sent to Google (when signing in with Google)
- Standard OAuth flow handled by Supabase. Google receives nothing app-specific from us beyond the standard authentication request.

---

## 2. What we do NOT collect

- ❌ No telemetry / analytics on usage patterns
- ❌ No crash reports auto-sent (Sentry/PostHog deferred — see Sprint S7)
- ❌ No screenshots are uploaded anywhere by the app
- ❌ No tracking pixels, ads, or third-party trackers
- ❌ No background phone-home

---

## 3. Permissions requested

### macOS
- **Screen Recording** — required for `screencapture -R` (area selection)
- **Accessibility** (optional) — for global hotkey ⌘⇧G to work when app is hidden
- **Network** — for Google OAuth (during sign-in only) and Slack webhooks (if configured)

### Windows
- **Network** — same as macOS
- **No screen recording prompt** — Windows allows it by default

---

## 4. Data export & deletion

### Export
- All your data is in `localStorage`. To export:
  - Open DevTools (right-click → Inspect → Console — only in dev mode)
  - Or: use `📄 PDF` to export task report

### Delete
- **Sign out**: clears `eb_account`, but other localStorage keys remain
- **Full reset**: delete the app's localStorage:
  - macOS: `rm -rf ~/Library/WebKit/com.engiboard.desktop`
  - Windows: clear EngiBoard folder in `%APPDATA%`

### Slack revocation
Remove the webhook URL in Profile → Integrations → Clear, OR revoke in Slack Apps settings.

---

## 5. Third-party services

| Service | What it sees | Why |
|---|---|---|
| **Google OAuth** (via Supabase) | Your email + name | Sign-in only |
| **Supabase Auth** | OAuth tokens | Manages session |
| **Slack** (only if configured) | Task done/problem notifications | User-initiated webhooks |
| **GitHub Releases** | Your IP when downloading the app | Standard release distribution |
| **jsdelivr / fonts.googleapis.com** | App fetches fonts/JS libs on first launch | Geist font + jsPDF + Supabase JS client |

---

## 6. Children's privacy

EngiBoard is not directed at children under 13. We do not knowingly collect data from children.

---

## 7. Changes to this policy

We may update this policy. The "Effective date" at top will reflect changes. Major changes will be announced in [CHANGELOG.md](../CHANGELOG.md).

---

## 8. Contact

Questions? Email **aleksey.stepikin@gmail.com** or open an issue on [GitHub](https://github.com/mag8888/engiboard-desktop/issues).
