#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/assets" "$STAGE/audio" "$STAGE/models" "$STAGE/terrains" "$STAGE/draco"
cp dist/index.html "$STAGE/"
cp dist/assets/*.js "$STAGE/assets/" 2>/dev/null || true
cp dist/assets/*.css "$STAGE/assets/"
rm -f "$STAGE/assets/"*.map
cp dist/audio/*.ogg "$STAGE/audio/"
cp dist/models/person.glb dist/models/parachute.glb dist/models/pilot.glb dist/models/canopy.glb "$STAGE/models/"
cp dist/terrains/*.glb "$STAGE/terrains/"
cp dist/draco/draco_decoder.js dist/draco/draco_decoder.wasm dist/draco/draco_wasm_wrapper.js "$STAGE/draco/"
OUT="$ROOT/dist/aero-glide-crazygames.zip"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" .)
echo "Wrote $OUT"
unzip -l "$OUT" | tail -5
du -h "$OUT"
find "$STAGE" -type f | wc -l
