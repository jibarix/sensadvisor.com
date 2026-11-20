#!/bin/sh
# Renders tools/og/card.html into assets/og/<page>.png (1200x630) with headless Chrome.
# Run from Git Bash at the repo root: sh tools/og/render.sh   (override the browser with CHROME=...)
# A throwaway profile is used so a Chrome window that is already open does not swallow the job.
set -e
CHROME=${CHROME:-"/c/Program Files/Google/Chrome/Application/chrome.exe"}
cd "$(dirname "$0")/../.."
ROOT=$(pwd -W)
PROFILE=$(mktemp -d)
trap 'rm -rf "$PROFILE"' EXIT
mkdir -p assets/og
for page in outages generation reservoirs pr-lmci rentals economy; do
  "$CHROME" --headless=new --user-data-dir="$(cd "$PROFILE" && pwd -W)" --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=2000 \
    --screenshot="$ROOT/assets/og/$page.png" "file:///$ROOT/tools/og/card.html?page=$page" >/dev/null 2>&1
  echo "assets/og/$page.png"
done
