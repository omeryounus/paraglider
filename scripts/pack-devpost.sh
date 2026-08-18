#!/usr/bin/env bash
# Offline Horizon / Devpost prototype zip: unminified, no CrazyGames SDK.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npx vite build --minify false
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/assets" "$STAGE/audio" "$STAGE/models/mixamo" "$STAGE/terrains" "$STAGE/vendor" "$STAGE/draco"
python3 - <<'PY'
from pathlib import Path
html = Path("dist/index.html").read_text()
html = html.replace(
    '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n    ',
    '',
)
html = html.replace(
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
)
Path("/tmp/devpost-index.html").write_text(html)
PY
cp /tmp/devpost-index.html "$STAGE/index.html"
cp dist/assets/*.js "$STAGE/assets/" 2>/dev/null || true
cp dist/assets/*.css "$STAGE/assets/"
rm -f "$STAGE/assets/"*.map
cp -r node_modules/three/build/three.module.js "$STAGE/vendor/three.module.js"
cp dist/audio/*.ogg "$STAGE/audio/"
cp dist/models/person.glb dist/models/parachute.glb dist/models/pilot.glb dist/models/canopy.glb "$STAGE/models/" 2>/dev/null || true
cp dist/models/mixamo/pilot.glb "$STAGE/models/mixamo/" 2>/dev/null || true
cp dist/terrains/*.glb "$STAGE/terrains/"
cp dist/draco/* "$STAGE/draco/" 2>/dev/null || true
OUT="$ROOT/dist/aero-glide-devpost.zip"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" .)
echo "Wrote $OUT"
unzip -l "$OUT" | tail -8
du -h "$OUT"
