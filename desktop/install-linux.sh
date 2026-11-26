#!/usr/bin/env bash
# Builds the native Linux AnyStl desktop launcher and installs a desktop entry.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust / cargo is required. Install from https://rustup.rs" >&2
  exit 1
fi

echo "→ Building AnyStl desktop app (release)..."
cargo build --manifest-path "$ROOT/desktop/Cargo.toml" --release

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"

mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR"
cp "$ROOT/desktop/target/release/anystl" "$BIN_DIR/anystl"
chmod +x "$BIN_DIR/anystl"
cp "$ROOT/desktop/icons/128x128@2x.png" "$ICON_DIR/anystl.png"

cat > "$APP_DIR/anystl.desktop" << EOF
[Desktop Entry]
Type=Application
Name=AnyStl
Comment=3D model meta-search across 22+ libraries
Exec=env ANYSTL_DIR=$ROOT $BIN_DIR/anystl
Icon=anystl
Terminal=false
Categories=Graphics;3DGraphics;Utility;
StartupWMClass=anystl
EOF

echo "Installed:"
echo "  Binary:  $BIN_DIR/anystl"
echo "  Desktop: $APP_DIR/anystl.desktop"
echo "You can now launch AnyStl from your app menu or run: ANYSTL_DIR=\"$ROOT\" $BIN_DIR/anystl"
