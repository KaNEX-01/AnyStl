#!/usr/bin/env bash
# Ensures a Chromium-based browser is available for Playwright on Linux/macOS.
# If a supported system Chromium/Chrome/Edge/Brave browser is already installed
# on Linux, AnyStl uses it directly unless ANYSTL_FORCE_PLAYWRIGHT_BROWSER=1 is set.
# Otherwise downloads Playwright's full Chromium via curl + unzip (preferring
# Google's official Chrome for Testing CDN and skipping unused ffmpeg/headless-shell).

set -e
cd "$(dirname "$0")/.."

if [ "$(uname -s)" = "Linux" ] && [ "${ANYSTL_FORCE_PLAYWRIGHT_BROWSER:-0}" != "1" ]; then
  for bin in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/brave /usr/bin/brave-browser /usr/bin/microsoft-edge; do
    if [ -x "$bin" ]; then
      echo "Using installed browser: $bin"
      exit 0
    fi
  done
fi

for tool in curl unzip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "'$tool' is required to install the scraper browser. Please install it." >&2
    exit 1
  fi
done

PW_CLI="node_modules/playwright/cli.js"
if [ ! -f "$PW_CLI" ]; then
  echo "Playwright CLI not found at $PW_CLI." >&2
  exit 1
fi

# Emits one line per package: "<install location> <url> [fallback urls...]"
plan=$(node "$PW_CLI" install --dry-run chromium | awk '
  /Install location:/ { if (loc != "") print loc urls; loc = $3; urls = "" }
  /Download (url|fallback [0-9]+):/ {
    u = $NF
    if (u ~ /^https:\/\/cdn\.playwright\.dev\/builds\/cft\//) {
      g = u
      sub(/^https:\/\/cdn\.playwright\.dev\/builds\/cft\//, "https://storage.googleapis.com/chrome-for-testing-public/", g)
      urls = " " g urls " " u
    } else {
      urls = urls " " u
    }
  }
  END { if (loc != "") print loc urls }
' | sort -u)

# AnyStl uses channel: "chromium" (full Chromium) — skip ffmpeg and headless-shell.
full_plan=$(printf '%s\n' "$plan" | awk '{ n = split($1, a, "/"); if (a[n] ~ /^chromium-[0-9]+/) print }')
if [ -n "$full_plan" ]; then
  plan="$full_plan"
fi

if [ -z "$plan" ]; then
  echo "Could not determine which browsers Playwright needs." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

while read -r loc urls; do
  [ -f "$loc/INSTALLATION_COMPLETE" ] && continue

  name=$(basename "$loc")
  echo "→ Downloading $name..."
  zip="$TMP/$name.zip"
  ok=0
  for url in $urls; do
    if curl -fL --retry 1 --connect-timeout 15 --speed-limit 10240 --speed-time 15 -# -o "$zip" "$url"; then
      ok=1
      break
    fi
    echo "  download failed from $url, trying next mirror..." >&2
  done
  if [ "$ok" != "1" ]; then
    echo "Failed to download $name." >&2
    exit 1
  fi

  echo "→ Extracting $name..."
  rm -rf "$loc"
  mkdir -p "$loc"
  if ! unzip -q "$zip" -d "$loc"; then
    rm -rf "$loc"
    echo "Failed to extract $name." >&2
    exit 1
  fi
  rm -f "$zip"
  # Markers Playwright checks to consider a browser installed.
  touch "$loc/INSTALLATION_COMPLETE" "$loc/DEPENDENCIES_VALIDATED"
done <<< "$plan"

# A lock left behind by an interrupted `playwright install` blocks later runs.
rm -rf "$(dirname "$(printf '%s\n' "$plan" | head -n1 | cut -d' ' -f1)")/__dirlock"
