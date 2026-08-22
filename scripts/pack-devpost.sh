#!/usr/bin/env bash
# Meta Horizon / Devpost prototype zip.
# FAQ: all of our game code in index.html, unminified; libraries in vendor/;
# index.html at the zip ROOT; ≤35MB; no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Typecheck the source of truth first.
npx tsc --noEmit
node scripts/assemble-contest.mjs
