#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/.."

usage() {
  cat <<'EOF'
Usage: bash scripts/test-apis.sh [--live] [suite ...]
       bash scripts/test-apis.sh --list

Default: run all offline suites, or only the named suites.
  --live:  call the configured search APIs directly (no scraping fallback).
  --list:  list the available offline and live tests.
EOF
}

shopt -s nullglob
test_dir="scripts/api-tests"
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --list)
    if (($# != 1)); then usage >&2; exit 2; fi
    for file in "$test_dir"/*.test.mjs; do
      site=${file##*/}
      site=${site%.test.mjs}
      if [[ -f "$test_dir/$site.live.mjs" ]]; then
        printf '%s (offline, live)\n' "$site"
      else
        printf '%s (offline)\n' "$site"
      fi
    done
    for file in "$test_dir"/*.live.mjs; do
      site=${file##*/}
      site=${site%.live.mjs}
      if [[ ! -f "$test_dir/$site.test.mjs" ]]; then printf '%s (live)\n' "$site"; fi
    done
    exit 0
    ;;
esac

mode=test
label=offline
if [[ "${1:-}" == --live ]]; then
  mode=live
  label=live
  shift
fi

files=()
if (($# == 0)); then
  files=("$test_dir"/*."$mode".mjs)
else
  for site in "$@"; do
    if [[ ! "$site" =~ ^[a-z0-9][a-z0-9-]*$ || ! -f "$test_dir/$site.$mode.mjs" ]]; then
      printf 'No %s test registered for %s. See --list.\n' "$label" "$site" >&2
      exit 2
    fi
    files+=("$test_dir/$site.$mode.mjs")
  done
fi
if ((${#files[@]} == 0)); then
  printf 'No %s tests registered.\n' "$label" >&2
  exit 2
fi
if [[ ! -x ./node_modules/.bin/tsc ]]; then
  printf 'Dependencies are missing. Run npm ci first.\n' >&2
  exit 2
fi

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/home"
export HOME="$scratch/home"
export HYPRLAND_INSTANCE_SIGNATURE= DISPLAY= WAYLAND_DISPLAY=
export NODE_PATH="$PWD/node_modules"
export ANYSTL_TEST_BUILD="$scratch/compiled"

./node_modules/.bin/tsc --target ES2017 --module commonjs --strict --esModuleInterop --skipLibCheck \
  --rootDir src/lib --outDir "$ANYSTL_TEST_BUILD" src/lib/scrapers/index.ts src/lib/urlState.ts src/lib/savedValidation.ts \
  src/lib/useComparison.ts src/lib/modelAlternatives.ts src/lib/details.ts src/lib/slicer.ts src/lib/slicerOpen.ts src/lib/sendToOrca.ts

if [[ "$mode" == live ]]; then
  node "$test_dir/run-live.mjs" "${files[@]}"
else
  node --test "${files[@]}"
fi
