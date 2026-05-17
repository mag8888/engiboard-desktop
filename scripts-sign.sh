#!/bin/bash
# Re-sign EngiBoard.app with the STABLE self-signed identity so macOS TCC
# (Screen Recording permission) treats every rebuild as the same app.
# Run after every `cargo tauri build`. Without this, Tauri's ad-hoc signature
# changes each build → permission silently stops working.
set -e
APP="${1:-/Applications/EngiBoard.app}"
codesign --force --deep --sign "EngiBoard Dev Signing" \
  --identifier "com.engiboard.desktop" "$APP"
codesign -dv "$APP" 2>&1 | grep Identifier
echo "✓ re-signed with stable identity: $APP"
