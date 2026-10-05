#!/usr/bin/env bash
# Installs the Playwright browsers the scrapers need, using curl + unzip.
#
# `playwright install` hangs forever while extracting the zip on some setups
# (e.g. very new Node versions), so we read the download URLs and install
# locations from `playwright install --dry-run` and do the work ourselves.
# Already-installed browsers are skipped, so this is instant on later runs.

set -e
cd "$(dirname "$0")/.."

for tool in curl unzip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "'$tool' is required to install the scraper browser. Please install it." >&2
    exit 1
  fi
done

# Emits one line per package: "<install location> <url> [fallback urls...]"
plan=$(./node_modules/.bin/playwright install --dry-run chromium | awk '
  /Install location:/ { if (loc != "") print loc urls; loc = $3; urls = "" }
  /Download (url|fallback [0-9]+):/ { urls = urls " " $NF }
  END { if (loc != "") print loc urls }
' | sort -u)

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
    if curl -fL --retry 3 --connect-timeout 20 -# -o "$zip" "$url"; then
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
