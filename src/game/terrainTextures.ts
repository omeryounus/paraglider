import * as THREE from 'three';

function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

function hash(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, oct = 5): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += noise(x * f, y * f) * a;
    f *= 2.07;
    a *= 0.5;
  }
  return s;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function makeAlbedo(
  size: number,
  sample: (u: number, v: number) => [number, number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = sample(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = clampByte(r);
      img.data[i + 1] = clampByte(g);
      img.data[i + 2] = clampByte(b);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeNormal(
  size: number,
  heightFn: (x: number, y: number) => number,
  strength = 2.4,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = heightFn(wrap(x - 1, size), y);
      const hR = heightFn(wrap(x + 1, size), y);
      const hD = heightFn(x, wrap(y - 1, size));
      const hU = heightFn(x, wrap(y + 1, size));
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface TerrainMaps {
  grass: THREE.Texture;
  rock: THREE.Texture;
  scree: THREE.Texture;
  snow: THREE.Texture;
  grassN: THREE.Texture;
  rockN: THREE.Texture;
  screeN: THREE.Texture;
  snowN: THREE.Texture;
}

let cached: TerrainMaps | null = null;

export function getTerrainMaps(): TerrainMaps {
  if (cached) return cached;
  const size = 256;
  const grassH = (x: number, y: number) =>
    fbm(x * 0.08, y * 0.08) + fbm(x * 0.32, y * 0.34) * 0.42 + Math.abs(Math.sin(y * 0.55)) * 0.12;
  const rockH = (x: number, y: number) => {
    const n = fbm(x * 0.045, y * 0.045);
    const crack = Math.min(
      Math.abs(Math.sin(x * 0.16 + n * 2.2)),
      Math.abs(Math.cos(y * 0.13 - n)),
    );
    return n * 0.65 + (1 - crack) * 0.55 + fbm(x * 0.22, y * 0.22) * 0.2;
  };
  const screeH = (x: number, y: number) =>
    fbm(x * 0.15, y * 0.15) + hash(Math.floor(x * 0.42), Math.floor(y * 0.42)) * 0.42;
  const snowH = (x: number, y: number) =>
    fbm(x * 0.06, y * 0.06) * 0.55 + fbm(x * 0.38, y * 0.4) * 0.22 + Math.sin(x * 0.2 + y * 0.05) * 0.08;

  cached = {
    grass: makeAlbedo(size, (u, v) => {
      const n = fbm(u * 20, v * 20);
      const clump = fbm(u * 6, v * 6);
      const blade = Math.abs(Math.sin(v * 82 + n * 8 + u * 14));
      const dirt = clump < 0.32 ? 1 - clump * 2.2 : 0;
      return [
        32 + n * 28 + blade * 22 + dirt * 48,
        88 + n * 70 + blade * 36 - dirt * 34,
        18 + n * 16 + blade * 10 - dirt * 8,
      ];
    }),
    rock: makeAlbedo(size, (u, v) => {
      const n = fbm(u * 11, v * 11);
      const strata = Math.sin(v * 34 + n * 4.2) * 18;
      const seam = Math.pow(Math.abs(Math.sin(u * 22 + v * 3)), 8) * 38;
      return [86 + n * 48 + strata - seam, 80 + n * 40 + strata * 0.55 - seam, 74 + n * 34 - seam * 0.8];
    }),
    scree: makeAlbedo(size, (u, v) => {
      const n = fbm(u * 24, v * 22);
      const pebble = hash(Math.floor(u * 56), Math.floor(v * 56));
      const pebble2 = hash(Math.floor(u * 88 + 3), Math.floor(v * 88));
      const chip = pebble > 0.72 ? 36 : pebble2 > 0.88 ? -22 : 0;
      return [140 + n * 38 + chip, 114 + n * 26 + chip * 0.7, 76 + n * 16 + chip * 0.4];
    }),
    snow: makeAlbedo(size, (u, v) => {
      const n = fbm(u * 16, v * 16);
      const rip = Math.sin(u * 40 + n * 5) * 8;
      const spark = hash(Math.floor(u * 96), Math.floor(v * 96)) > 0.93 ? 36 : 0;
      return [226 + n * 18 + rip + spark, 234 + n * 12 + rip * 0.5 + spark, 242 + n * 8 + spark];
    }),
    grassN: makeNormal(size, grassH, 3.6),
    rockN: makeNormal(size, rockH, 4.6),
    screeN: makeNormal(size, screeH, 3.8),
    snowN: makeNormal(size, snowH, 1.7),
  };
  return cached;
}
