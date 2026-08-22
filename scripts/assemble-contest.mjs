#!/usr/bin/env node
/**
 * Assemble the MHCP / Devpost zip:
 * - all of OUR game code inlined into index.html, unminified
 * - Three.js + addons in vendor/, referenced by import map
 * - no CrazyGames SDK, no CDN, index.html at zip root
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

function walkImports(entryRel, destRoot) {
  const jsm = path.join(ROOT, 'node_modules/three/examples/jsm');
  const seen = new Set();
  const queue = [entryRel];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = path.join(jsm, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    const text = fs.readFileSync(src, 'utf8');
    const re = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) {
      const resolved = path.normalize(path.join(path.dirname(rel), m[1])).replace(/\\/g, '/');
      queue.push(resolved);
    }
  }
}

async function bundleGame(build) {
  const banner = `/**
 * Aero Glide: Canyon Rush
 * Meta Horizon Creator Competition — Survival & Resource Management
 *
 * Assembled, unminified game code. Original TypeScript lives under src/.
 * Core loop: gather fabric + cord, craft Patch / Bind / Heat wrap, land
 * before storm / freeze / canopy shred.
 *
 * Three.js r178 loads from ./vendor via the import map. Do not minify this file.
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
    external: ['three', 'three/*'],
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

function copyVendor() {
  const vendor = path.join(STAGE, 'vendor');
  const addons = path.join(vendor, 'addons');
  fs.mkdirSync(addons, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'node_modules/three/build/three.module.js'),
    path.join(vendor, 'three.module.js'),
  );
  const needed = [
    'objects/Sky.js',
    'objects/Water.js',
    'loaders/GLTFLoader.js',
    'loaders/DRACOLoader.js',
    'utils/BufferGeometryUtils.js',
    'postprocessing/EffectComposer.js',
    'postprocessing/OutputPass.js',
    'postprocessing/RenderPass.js',
  ];
  for (const rel of needed) walkImports(rel, addons);
}

function copyAssets() {
  const copy = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  };
  for (const name of fs.readdirSync(path.join(ROOT, 'public/audio')).filter((n) => n.endsWith('.ogg'))) {
    copy(path.join(ROOT, 'public/audio', name), path.join(STAGE, 'audio', name));
  }
  copy(path.join(ROOT, 'public/models/parachute.glb'), path.join(STAGE, 'models/parachute.glb'));
  copy(path.join(ROOT, 'public/models/pilot.glb'), path.join(STAGE, 'models/pilot.glb'));
  copy(path.join(ROOT, 'public/models/mixamo/pilot.glb'), path.join(STAGE, 'models/mixamo/pilot.glb'));
  copy(path.join(ROOT, 'public/terrains/mountain.glb'), path.join(STAGE, 'terrains/mountain.glb'));
  for (const name of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
    copy(path.join(ROOT, 'public/draco', name), path.join(STAGE, 'draco', name));
  }
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
  const importMap = `{
      "imports": {
        "three": "./vendor/three.module.js",
        "three/addons/": "./vendor/addons/"
      }
    }`;
  const tag = `    <script type="importmap">
    ${importMap}
    </script>
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
if any(n.endswith("/index.html") for n in names):
    raise SystemExit("FAIL: nested index.html")
if "crazygames.com" in html:
    raise SystemExit("FAIL: crazygames URL")
if 'src="./src/main.ts"' in html:
    raise SystemExit("FAIL: still a Vite loader")
if "tickSurvival" not in html:
    raise SystemExit("FAIL: game code not in index.html")
if html.count("\\n") < 200:
    raise SystemExit("FAIL: looks minified")
if "vendor/three.module.js" not in html:
    raise SystemExit("FAIL: three not in vendor import map")
mb = Path(sys.argv[1]).stat().st_size / (1024 * 1024)
print(f"size {mb:.2f} MB")
if mb > 35:
    raise SystemExit("FAIL: zip exceeds 35MB")
print("OK: readable unminified index.html, vendor three, under 35MB")
`;
  const out = execFileSync('python3', ['-c', script, zpath], { encoding: 'utf8' });
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

copyVendor();
copyAssets();
const { build } = await import('esbuild');
await bundleGame(build);
writeIndex();
const zpath = zipStage();
verify(zpath);
console.log('Wrote', zpath);
console.log('Stage was', STAGE);
