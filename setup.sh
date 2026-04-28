#!/bin/bash
# EngiBoard Desktop — macOS Setup & Build
# Run: bash setup.sh
# ─────────────────────────────────────────────────────────

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

print_step() { echo -e "\n${BLUE}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════╗"
echo "║   EngiBoard Desktop · macOS Setup   ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Check macOS ──────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  print_err "This script requires macOS. Current OS: $(uname -s)"
  exit 1
fi
print_ok "macOS detected: $(sw_vers -productVersion)"

# ── Xcode Command Line Tools ─────────────────────────────
print_step "Checking Xcode Command Line Tools..."
if ! xcode-select -p &>/dev/null; then
  print_warn "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "Please wait for Xcode CLT to install, then re-run this script."
  exit 0
fi
print_ok "Xcode CLT: $(xcode-select -p)"

# ── Homebrew ─────────────────────────────────────────────
print_step "Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  print_warn "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
print_ok "Homebrew: $(brew --version | head -1)"

# ── Rust ─────────────────────────────────────────────────
print_step "Checking Rust..."
if ! command -v rustc &>/dev/null; then
  print_warn "Installing Rust via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
rustup update stable 2>/dev/null
print_ok "Rust: $(rustc --version)"
print_ok "Cargo: $(cargo --version)"

# ── Node.js ──────────────────────────────────────────────
print_step "Checking Node.js..."
if ! command -v node &>/dev/null; then
  print_warn "Installing Node.js via Homebrew..."
  brew install node
fi
print_ok "Node.js: $(node --version)"

# ── Tauri CLI ────────────────────────────────────────────
print_step "Checking Tauri CLI..."
if ! command -v cargo-tauri &>/dev/null; then
  print_warn "Installing Tauri CLI (this takes ~2-3 min)..."
  cargo install tauri-cli --version "^2" --locked
fi
print_ok "Tauri CLI: $(cargo tauri --version)"

# ── Generate proper icons ────────────────────────────────
print_step "Generating icons from icon_1024.png..."
if [ -f "src-tauri/icons/icon_1024.png" ]; then
  cargo tauri icon src-tauri/icons/icon_1024.png 2>/dev/null && print_ok "Icons generated" || print_warn "Icon generation failed, using placeholders"
fi

# ── Dev mode check ───────────────────────────────────────
echo ""
echo -e "${YELLOW}Ready to build! Choose an option:${NC}"
echo ""
echo "  1) DEV mode  (fast, opens app immediately)"
echo "     → cargo tauri dev"
echo ""
echo "  2) RELEASE build  (creates .app + .dmg, ~5 min first time)"
echo "     → cargo tauri build"
echo ""
read -p "Enter 1 or 2 (default: 1): " choice

case "${choice:-1}" in
  2)
    print_step "Building EngiBoard.app (release)..."
    cargo tauri build
    echo ""
    print_ok "Build complete!"
    APP_PATH="src-tauri/target/release/bundle/macos/EngiBoard.app"
    DMG_PATH="src-tauri/target/release/bundle/dmg/EngiBoard_0.1.0_aarch64.dmg"
    if [ -d "$APP_PATH" ]; then
      echo -e "${GREEN}▶ App: $(pwd)/$APP_PATH${NC}"
      echo -e "${BLUE}  → Copy to /Applications to install${NC}"
      read -p "Copy to /Applications now? [y/N]: " copy
      if [[ "$copy" == "y" || "$copy" == "Y" ]]; then
        cp -r "$APP_PATH" /Applications/
        print_ok "Installed to /Applications/EngiBoard.app"
        open /Applications/EngiBoard.app
      fi
    fi
    if [ -f "$DMG_PATH" ]; then
      print_ok "DMG: $(pwd)/$DMG_PATH"
    fi
    ;;
  *)
    print_step "Starting EngiBoard in dev mode..."
    echo -e "${BLUE}App will open in a few seconds...${NC}"
    echo -e "${BLUE}Global shortcuts active:${NC}"
    echo "  ⌘⇧4  → Capture screenshot"
    echo "  ⌘⇧E  → Show/hide EngiBoard"
    echo "  ⌘⇧A  → Open annotation editor"
    echo ""
    cargo tauri dev
    ;;
esac
