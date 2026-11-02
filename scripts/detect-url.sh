#!/usr/bin/env bash
# The detector over a running page: detect-url.sh <url> <WxH> <wait-s> <out.json>
# A plain `impeccable detect <url>` times out on Strata (the scene keeps the network busy past its 30 s navigation
# limit), so this opens the page in headless Chrome with a DevTools port and scans it as shown (`detect --cdp`).
# Exit: the detector's own (0 clean, 2 findings, 1 scan failed); read the JSON with scripts/check-detect.mjs.
set -u
url=$1; size=$2; wait_s=$3; out=$4
chrome=${CHROME_PATH:-google-chrome}
port=${CDP_PORT:-9333}
bin=${IMPECCABLE_DIR:-$HOME/.local/share/impeccable/0.1.18}/impeccable
prof=$(mktemp -d)
"$chrome" --headless=new --no-first-run --user-data-dir="$prof" --remote-debugging-port="$port" \
  --use-angle=swiftshader --enable-unsafe-swiftshader --window-size="${size/x/,}" "$url" >/dev/null 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null; wait $pid 2>/dev/null; rm -rf "$prof"' EXIT
sleep "$wait_s"
# --target: the page by its URL, never the omnibox popups headless Chrome also lists
DO_NOT_TRACK=1 timeout 240 "$bin" detect --json --cdp "$port" --target "${url%%\?*}" < /dev/null > "$out"
