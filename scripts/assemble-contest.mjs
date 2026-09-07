#!/usr/bin/env node
/**
 * Assemble the MHCP / Devpost zip:
 * - ONE self-contained index.html: game code + all of three.js inlined in a
 *   single inline <script type="module">, every asset inlined as a data URL.
 * - No ES-module fetches, no Worker, no network at all → works from file://
 *   (double-clicked from an unzipped folder) and from any web host.
 * - No CrazyGames SDK, no CDN, index.html at zip root.
 * - Draco is NOT used here: its WASM decoder needs a Worker, which file://
 *   blocks. contest/assets/ holds decoder-free GLBs (uncompressed geometry,
 *   WebP textures) produced by scripts/undraco.mjs.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAGE = fs.mkdtempSync(path.join('/tmp', 'aero-contest-'));
const JS_OUT = path.join(STAGE, 'game.assembled.js');

// Assets inlined into index.html. Keys are the runtime URLs the game requests.
const CONTEST_ASSETS = {
  './models/parachute.glb': 'parachute.glb',
  './models/mixamo/pilot.glb': 'pilot-mixamo.glb',
  './models/pilot.glb': 'pilot.glb',
  './terrains/mountain.glb': 'mountain.glb',
  './audio/ring.ogg': 'ring.ogg',
  './audio/ring-gold.ogg': 'ring-gold.ogg',
  './audio/boost.ogg': 'boost.ogg',
  './audio/orb.ogg': 'orb.ogg',
  './audio/miss.ogg': 'miss.ogg',
  './audio/land.ogg': 'land.ogg',
  './audio/crash.ogg': 'crash.ogg',
};

async function bundleGame(build) {
  const banner = `/**
 * Aero Glide: Canyon Rush
 * Meta Horizon Creator Competition — Survival & Resource Management
 *
 * Assembled, unminified game code. Original TypeScript lives under src/.
 * Core loop: gather fabric + cord, craft Patch / Bind / Heat wrap, land
 * before storm / freeze / canopy shred.
 *
 * three.js r178 + used addons are bundled above this banner in the same
 * module scope. Do not minify this file.
 */
`;
  await build({
    absWorkingDir: ROOT,
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'esm',
    minify: false,
    keepNames: true,
    sourcemap: false,
    legalComments: 'none',
    target: 'es2022',
    charset: 'utf8',
    outfile: JS_OUT,
    logLevel: 'info',
    banner: { js: banner },
    define: {
      'import.meta.env.CONTEST': 'true',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"contest"',
      'import.meta.env.BASE_URL': '"./"',
    },
    // three + addons bundled INTO the game module — no vendor/ fetches at all.
    plugins: [
      {
        name: 'src-banners',
        setup(buildApi) {
          buildApi.onLoad({ filter: /\/src\/.*\.(ts|css)$/ }, async (args) => {
            const source = await fs.promises.readFile(args.path, 'utf8');
            const rel = path.relative(ROOT, args.path);
            return {
              contents: `\n/* ---- ${rel} ---- */\n${source}`,
              loader: args.path.endsWith('.css') ? 'css' : 'ts',
            };
          });
        },
      },
    ],
  });
}

function assetManifest() {
  // Data-URL manifest consumed by the fetch shim below.
  const lines = [];
  for (const [url, file] of Object.entries(CONTEST_ASSETS)) {
    const glb = fs.existsSync(path.join(ROOT, 'contest/assets', file));
    const p = glb
      ? path.join(ROOT, 'contest/assets', file)
      : path.join(ROOT, 'public', url.replace('./', ''));
    if (!fs.existsSync(p)) throw new Error(`missing contest asset ${p}`);
    const b64 = fs.readFileSync(p).toString('base64');
    const mime = file.endsWith('.glb')
      ? 'model/gltf-binary'
      : file.endsWith('.ogg')
        ? 'audio/ogg'
        : 'application/octet-stream';
    lines.push(`  '${url}': 'data:${mime};base64,${b64}',`);
  }
  return lines.join('\n');
}

function writeIndex() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/\s*<script[^>]+src="https?:\/\/[^"]+"[^>]*>\s*<\/script>/g, '');
  if (!html.includes('screen-orientation')) {
    html = html.replace('</title>', '</title>\n    <meta name="screen-orientation" content="portrait" />');
  }
  const css = fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
  html = html.replace('<link rel="stylesheet" href="./src/style.css" />', `<style>\n${css}\n    </style>`);
  let game = fs.readFileSync(JS_OUT, 'utf8');
  // Contest build never talks to CrazyGames even if a host injects the SDK.
  game = game.replaceAll('https://sdk.crazygames.com', '');

  const prelude = `<script>
    // Contest pack: intercept fetch for the inlined asset manifest so the
    // game runs from file:// with zero network access. three's FileLoader
    // passes a Request object whose .url is ABSOLUTE (resolved against the
    // page), so match by exact key OR by path suffix.
    (() => {
      const manifest = {
${assetManifest()}
      };
      const orig = window.fetch;
      window.fetch = function (input, init) {
        let url = '';
        if (typeof input === 'string') url = input;
        else if (input && typeof input.url === 'string') url = input.url; // Request
        if (manifest[url]) return orig(manifest[url], init);
        const tail = url.split('?')[0].replace(/^\\/+/, '');
        for (const key of Object.keys(manifest)) {
          const rel = key.slice(2); // strip leading ./
          if (tail === rel || tail.endsWith('/' + rel)) {
            return orig(manifest[key], init);
          }
        }
        return orig(input, init);
      };
    })();
  </script>`;

  const tag = `  ${prelude}
  <script type="module">
${game}
  </script>`;
  html = html.replace('<script type="module" src="./src/main.ts"></script>', tag);
  if (/crazygames\.com/.test(html)) {
    throw new Error('CrazyGames URL leaked into contest index.html');
  }
  if (!html.includes('tickSurvival') || !html.includes('gatherSalvage')) {
    throw new Error('Survival loop missing from assembled index.html');
  }
  if (html.includes('src="./src/main.ts"') || /assets\/index-/.test(html)) {
    throw new Error('index.html is still a loader, not the assembled game');
  }
  fs.writeFileSync(path.join(STAGE, 'index.html'), html);
  fs.unlinkSync(JS_OUT);
}

function zipStage() {
  const outDist = path.join(ROOT, 'dist/aero-glide-canyon-rush.zip');
  const outDocs = path.join(ROOT, 'docs/devpost/aero-glide-canyon-rush.zip');
  fs.mkdirSync(path.dirname(outDist), { recursive: true });
  fs.mkdirSync(path.dirname(outDocs), { recursive: true });
  fs.rmSync(outDist, { force: true });
  execFileSync('zip', ['-X', '-9', '-r', outDist, '.', '-x', '*.map', '-x', '*/.*'], {
    cwd: STAGE,
    stdio: 'inherit',
  });
  fs.copyFileSync(outDist, outDocs);
  return outDist;
}

function verify(zpath) {
  const script = `
import zipfile, sys
from pathlib import Path
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
print("entries", len(names))
print("\\n".join(names[:20]))
html = z.read("index.html").decode("utf-8", "replace")
if "index.html" not in names:
    raise SystemExit("FAIL: index.html not at zip root")
if any(n.endswith("/index.html") for n in names if n != "index.html"):
    raise SystemExit("FAIL: nested index.html")
if len(names) != 1:
    raise SystemExit(f"FAIL: expected single-file pack, got {len(names)} entries")
if "crazygames.com" in html:
    raise SystemExit("FAIL: crazygames URL")
if 'src="./src/main.ts"' in html:
    raise SystemExit("FAIL: still a Vite loader")
if "tickSurvival" not in html:
    raise SystemExit("FAIL: game code not in index.html")
if html.count("\\n") < 200:
    raise SystemExit("FAIL: looks minified")
if "vendor/three.module.js" in html:
    raise SystemExit("FAIL: pack still references vendor/ modules")
if "./models/parachute.glb" not in html:
    raise SystemExit("FAIL: asset manifest missing")
if "import.meta.env.CONTEST" in html and "contest" not in html:
    raise SystemExit("FAIL: contest flag lost")
if "setDecoderPath" in html and "CONTEST" not in html:
    raise SystemExit("FAIL: draco always-on but no contest bypass")
mb = Path(sys.argv[1]).stat().st_size / (1024 * 1024)
print(f"size {mb:.2f} MB")
if mb > 35:
    raise SystemExit("FAIL: zip exceeds 35MB")
print("OK: single-file self-contained index.html, works from file:// and any host")
`;
  const out = execFileSync('python3', ['-c', script, zpath], { encoding: 'utf-8' });
  process.stdout.write(out);
}

const require = createRequire(import.meta.url);
let esbuildOk = true;
try {
  require.resolve('esbuild');
} catch {
  esbuildOk = false;
}

if (!esbuildOk) {
  console.log('installing esbuild locally…');
  execFileSync('npm', ['install', '--no-save', '--no-package-lock', 'esbuild@0.25.8'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

const { build } = await import('esbuild');
await bundleGame(build);
writeIndex();
const zpath = zipStage();
verify(zpath);
console.log('Wrote', zpath);
console.log('Stage was', STAGE);
