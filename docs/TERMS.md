# Terms of Service — EngiBoard Desktop

**Effective date:** 2026-05-03

By installing or using EngiBoard Desktop ("the Software"), you agree to these terms.

---

## 1. Acceptance

These Terms govern your use of EngiBoard Desktop. If you don't agree, don't use the Software.

---

## 2. License

EngiBoard Desktop is provided **as-is** under the MIT License (see [LICENSE](../LICENSE) when added). You may:

- ✅ Install on any number of personal devices
- ✅ Use for commercial purposes
- ✅ Modify and redistribute (per MIT terms)
- ✅ Build from source

You may NOT:

- ❌ Claim authorship of unmodified portions
- ❌ Remove copyright notices

---

## 3. The Software

### 3.1 As-is, no warranty

EngiBoard Desktop is provided "as is" without warranty of any kind, express or implied. We don't guarantee:

- Uninterrupted operation
- Bug-free behavior
- Data integrity (back up your localStorage if you care about your data)
- Compatibility with future OS versions

### 3.2 Code signing

Builds in v0.1.x are **not code-signed**. macOS and Windows will warn before launch. Sign-related issues:

- macOS: requires `xattr -cr /Applications/EngiBoard.app` on first launch
- Windows: SmartScreen "Run anyway"

We're not responsible for any security implications of running unsigned binaries. Use at your own risk. v1.0 will introduce signed releases.

### 3.3 Third-party components

The Software bundles or fetches:
- Tauri 2 (MIT/Apache-2.0)
- jsPDF (MIT)
- Supabase JS client (MIT)
- Geist + Geist Mono fonts (SIL OFL 1.1)

Each retains its own license.

---

## 4. Your responsibilities

You are responsible for:

- The legality of content you store / transmit (screenshots, task notes, comments)
- Your Slack workspace's compliance when using webhook integration
- Backing up your local data

---

## 5. Privacy

See [PRIVACY.md](./PRIVACY.md) for what we collect (mostly nothing) and how the app uses third-party services.

---

## 6. Limitations of liability

To the maximum extent permitted by law, the publisher shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, lost profits, or business interruption arising from use of EngiBoard Desktop.

---

## 7. Termination

You may stop using the Software at any time by uninstalling. We may discontinue updates or distribution of the Software at any time without notice.

---

## 8. Changes to these Terms

We may update these Terms. Material changes will be announced in [CHANGELOG.md](../CHANGELOG.md). Continued use after changes = acceptance.

---

## 9. Governing law

These Terms are governed by the laws of Germany (Frankfurt am Main jurisdiction), where the publisher resides. Disputes go through the appropriate German courts.

---

## 10. Contact

Questions about these Terms: **aleksey.stepikin@gmail.com**
