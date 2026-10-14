#!/usr/bin/env bash
# AnyStl launcher — installs deps if needed, builds, and starts the production server.

set -e
cd "$(dirname "$0")"
SELF="$PWD/$(basename "$0")"

# Started by double-clicking in a file manager? Then there's no terminal to
# show progress or errors in, so reopen this script inside one.
if [ ! -t 1 ] && [ -z "$ANYSTL_IN_TERMINAL" ] && { [ -n "$WAYLAND_DISPLAY" ] || [ -n "$DISPLAY" ]; }; then
  export ANYSTL_IN_TERMINAL=1
  for term in "$TERMINAL" kitty konsole alacritty foot wezterm ghostty gnome-terminal xfce4-terminal xterm; do
    [ -n "$term" ] && command -v "$term" >/dev/null 2>&1 || continue
    case "$(basename "$term")" in
      foot)           exec "$term" "$SELF" "$@" ;;
      wezterm)        exec "$term" start -- "$SELF" "$@" ;;
      gnome-terminal) exec "$term" -- "$SELF" "$@" ;;
      *)              exec "$term" -e "$SELF" "$@" ;;
    esac
  done
  # No terminal emulator found: carry on without one.
fi

# In a terminal we opened ourselves, keep the window up after a failure so
# the error can be read (it would otherwise close instantly).
if [ -n "$ANYSTL_IN_TERMINAL" ] && [ -t 0 ]; then
  trap 'status=$?; if [ "$status" -ne 0 ]; then echo; read -rp "AnyStl stopped with an error. Press Enter to close..." _; fi' EXIT
fi

PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

REBUILD=0
NO_OPEN=0
for arg in "$@"; do
  case "$arg" in
    --rebuild)  REBUILD=1 ;;
    --no-open)  NO_OPEN=1 ;;
    -h|--help)
      cat <<EOF
Usage: ./start.sh [--rebuild] [--no-open]

  --rebuild   Force a fresh production build before starting.
  --no-open   Don't auto-open the browser.

Environment:
  PORT        Port to listen on (default: 3000).
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

# Already running (e.g. started earlier)? Just open another tab.
if command -v curl >/dev/null 2>&1 && curl -fsI "$URL" >/dev/null 2>&1; then
  echo "AnyStl is already running at $URL"
  if [ "$NO_OPEN" != "1" ]; then
    xdg-open "$URL" >/dev/null 2>&1 || open "$URL" >/dev/null 2>&1 || echo "Open $URL in your browser."
  fi
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20+ from https://nodejs.org" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found. Install it (e.g. 'sudo pacman -S npm' on Arch)." >&2
  exit 1
fi

if [ ! -x node_modules/.bin/next ]; then
  echo "→ Installing dependencies (first run, ~1 min)..."
  npm install
fi

if [ ! -x node_modules/.bin/playwright ]; then
  echo "→ Playwright missing from node_modules, reinstalling deps..."
  npm install
fi

echo "→ Checking Playwright Chromium (used by backend scrapers)..."
./scripts/install-browsers.sh

if [ "$REBUILD" = "1" ] || [ ! -f .next/BUILD_ID ]; then
  echo "→ Building for production..."
  npm run build
fi

echo
echo "AnyStl is starting at $URL"
echo "It will open in your default browser. Closing the tab shuts down the server."
echo "Or press Ctrl+C to stop."
echo

export PORT
if [ "$NO_OPEN" = "1" ]; then
  export ANYSTL_NO_OPEN=1
fi

# Not exec'd, so the error trap above still runs if the server fails.
node ./scripts/launch.mjs
