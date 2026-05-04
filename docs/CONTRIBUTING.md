# Contributing to EngiBoard Desktop

Thanks for considering a contribution. This is currently a small project (single primary maintainer + Claude) so contribution flow is light.

---

## Reporting bugs

1. Check [existing issues](https://github.com/mag8888/engiboard-desktop/issues) first
2. Open a new issue with the **bug template** from [TEST_PLAN.md §17](./TEST_PLAN.md#bug-template)
3. Include:
   - OS + version
   - Build version (from About / Profile)
   - Console errors (DevTools → Console)
   - Reproduction steps

---

## Suggesting features

Open an issue tagged `enhancement` describing:
- The user pain point
- Proposed solution (or just describe the problem)
- Whether it fits the [roadmap](./ROADMAP.md)

---

## Pull requests

1. Fork → branch → commit → PR
2. **One feature per PR** — easier to review
3. Match existing code style:
   - 2-space indentation in JS/HTML/CSS
   - 4-space in Rust (`cargo fmt`)
   - Single quotes in JS
4. Update relevant docs:
   - `CHANGELOG.md` — add entry under `[Unreleased]`
   - `USER_GUIDE.md` — if user-facing
   - `ROADMAP.md` — if changes scope/timing of future work

---

## Local development

```bash
git clone https://github.com/mag8888/engiboard-desktop.git
cd engiboard-desktop
bash setup.sh   # Installs Rust + Tauri CLI, then runs `cargo tauri dev`
```

The setup script handles Xcode CLT, Rust, Node, and Tauri. First build takes 3-8 min.

To rebuild after frontend changes: just save the file, Tauri webview hot-reloads.
To rebuild after Rust changes: `cargo tauri dev` recompiles incrementally.

For a full release build:
```bash
cargo tauri build --target aarch64-apple-darwin    # Mac M1+
cargo tauri build --target x86_64-apple-darwin     # Mac Intel
cargo tauri build --target x86_64-pc-windows-msvc  # Windows
```

---

## Code map

```
engiboard-desktop/
├── index.html          ← main UI + all client-side JS (3000+ lines)
├── editor.html         ← annotation editor (separate window)
├── sniper.html         ← screenshot area selector overlay (transparent fullscreen)
├── dist/               ← production copies of HTML files (Tauri frontendDist points here)
├── src-tauri/
│   ├── src/main.rs     ← Rust backend: shortcuts, tray, sniper, editor, deep-link
│   ├── Cargo.toml      ← Rust deps (Tauri 2 + 5 plugins)
│   ├── tauri.conf.json ← bundle config, identifiers, icon paths
│   └── capabilities/   ← Tauri 2 permissions
├── docs/               ← user-facing docs (USER_GUIDE, PRIVACY, TERMS, ROADMAP, …)
├── supabase/           ← migrations + ARCHITECTURE_DECISION
├── bench/              ← test data + perf scripts
└── .github/workflows/  ← GitHub Actions CI (matrix build for Mac+Win)
```

---

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/):
- `0.x.y` — pre-1.0, breaking changes possible at any minor bump
- `1.x.y` (future) — strict semver

Bumping versions:
1. `src-tauri/Cargo.toml` `version` field
2. `src-tauri/tauri.conf.json` `version` field
3. Tag: `git tag v0.x.y && git push origin v0.x.y`
4. GitHub Actions auto-builds 4 artifacts on tag push

---

## Editing rules (per project context)

When editing `index.html` or `main.rs` (large files):

- **Don't use regex patches** — they break brace balance
- Use exact-string `Edit` operations or full file rewrites
- After non-trivial JS changes: `node --check` to validate syntax (extract `<script>` block manually)

---

## Code review

Before merging, run the [`superpowers:code-reviewer`](https://github.com/anthropic-experimental/superpowers) agent (or equivalent reviewer) on the diff. Focus areas:

- Drag-reorder + bulk select interaction
- Paste mode + slideshow interaction
- Keyboard shortcut conflicts
- localStorage data migration safety
- Dark mode coverage of new UI

---

## License

By contributing, you agree your contributions are licensed under the same license as the project (see future [LICENSE](../LICENSE) file). Until LICENSE is added: MIT-style implied.

---

## Questions

aleksey.stepikin@gmail.com
