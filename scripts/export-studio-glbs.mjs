/**
 * Bake four Terrain Studio–style boards to public/terrains/*.glb.
 * Node-native GLB writer (no browser FileReader).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'terrains');
const SIZE = 480;
const RES = 160;

function hash2(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x, z) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += (valueNoise(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function rgb(hex) {
  return [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const BIOMES = {
  mountain: {
    height(x, z) {
      const r = Math.hypot(x, z) / (SIZE * 0.5);
      const ridge = (1 - Math.abs(fbm(x * 0.0045, z * 0.0045))) * 110;
      const valley = Math.exp(-((x * 0.006) ** 2)) * -28;
      const n = fbm(x * 0.007, z * 0.007) * 36;
      return Math.max(40, 180 + ridge * 1.6 + valley + n + Math.max(0, r - 0.72) ** 2 * 90);
    },
    color(y) {
      if (y > 200) return rgb(0xe8eef4);
      if (y > 150) {
        const t = (y - 150) / 50;
        const a = rgb(0x8a8478);
        const b = rgb(0xc8c4bc);
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      }
      if (y > 80) {
        const t = (y - 80) / 70;
        const a = rgb(0x4f7a3e);
        const b = rgb(0x8a7a48);
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      }
      return rgb(0x3a6a32);
    },
  },
  island: {
    height(x, z) {
      const r = Math.hypot(x * 0.92, z);
      const island = Math.exp(-((r * 0.009) ** 2)) * 92;
      const cone = Math.max(0, 70 - r * 0.32);
      const n = fbm(x * 0.01, z * 0.01) * 8;
      return Math.max(-4, 40 + island * 1.8 + cone * 0.7 + n);
    },
    color(y) {
      if (y < 4) return rgb(0xe2c878);
      if (y < 28) return rgb(0x3f9a4a);
      return rgb(0x2a6e34);
    },
  },
  desert: {
    height(x, z) {
      const dunes = Math.sin(x * 0.018 + z * 0.01) * 22 + Math.sin(z * 0.028) * 14;
      const n = fbm(x * 0.008, z * 0.008) * 16;
      return Math.max(20, 110 + dunes * 1.4 + n);
    },
    color(y) {
      const t = Math.max(0, Math.min(1, (y - 30) / 60));
      const a = rgb(0xe0b56a);
      const b = rgb(0xc48a32);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    },
  },
  hybrid: {
    height(x, z) {
      const tz = z / SIZE + 0.5;
      const terrace = Math.floor((1 - tz) * 7) * 18;
      const walls = Math.max(0, Math.abs(x) - 36) ** 1.25 * 0.18;
      const n = fbm(x * 0.009, z * 0.009) * 10;
      return Math.max(30, 90 + terrace * 1.35 + walls + n);
    },
    color(y) {
      if (y > 140) return rgb(0x8a8478);
      if (y > 80) return rgb(0x8a7a4a);
      return rgb(0x5a7a38);
    },
  },
};

function buildMesh(id) {
  const spec = BIOMES[id];
  const cols = RES + 1;
  const count = cols * cols;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const normals = new Float32Array(count * 3);
  const indices = new Uint32Array(RES * RES * 6);

  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i / RES - 0.5) * SIZE;
      const z = (j / RES - 0.5) * SIZE;
      const y = spec.height(x, z);
      const idx = j * cols + i;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      const [r, g, b] = spec.color(y);
      colors[idx * 4] = r;
      colors[idx * 4 + 1] = g;
      colors[idx * 4 + 2] = b;
      colors[idx * 4 + 3] = 1;
    }
  }

  let t = 0;
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[t++] = a;
      indices[t++] = c;
      indices[t++] = b;
      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = d;
    }
  }

  normals.fill(0);
  for (let k = 0; k < indices.length; k += 3) {
    const ia = indices[k] * 3;
    const ib = indices[k + 1] * 3;
    const ic = indices[k + 2] * 3;
    const ax = positions[ib] - positions[ia];
    const ay = positions[ib + 1] - positions[ia + 1];
    const az = positions[ib + 2] - positions[ia + 2];
    const bx = positions[ic] - positions[ia];
    const by = positions[ic + 1] - positions[ia + 1];
    const bz = positions[ic + 2] - positions[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    normals[ia] += nx;
    normals[ia + 1] += ny;
    normals[ia + 2] += nz;
    normals[ib] += nx;
    normals[ib + 1] += ny;
    normals[ib + 2] += nz;
    normals[ic] += nx;
    normals[ic + 1] += ny;
    normals[ic + 2] += nz;
  }
  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }

  return { positions, normals, colors, indices };
}

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

function writeGlb(mesh) {
  const posBuf = Buffer.from(mesh.positions.buffer);
  const nrmBuf = Buffer.from(mesh.normals.buffer);
  const colBuf = Buffer.from(mesh.colors.buffer);
  const idxBuf = Buffer.from(mesh.indices.buffer);
  const bin = Buffer.concat([posBuf, nrmBuf, colBuf, idxBuf]);
  const posOff = 0;
  const nrmOff = posBuf.length;
  const colOff = nrmOff + nrmBuf.length;
  const idxOff = colOff + colBuf.length;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minX = Math.min(minX, mesh.positions[i]);
    minY = Math.min(minY, mesh.positions[i + 1]);
    minZ = Math.min(minZ, mesh.positions[i + 2]);
    maxX = Math.max(maxX, mesh.positions[i]);
    maxY = Math.max(maxY, mesh.positions[i + 1]);
    maxZ = Math.max(maxZ, mesh.positions[i + 2]);
  }

  const json = {
    asset: { version: '2.0', generator: 'Terrain Studio / Aero Glide baker' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ name: 'Terrain_Board', children: [1] }, { name: 'Terrain_Surface', mesh: 0 }],
    meshes: [
      {
        name: 'Terrain_Surface',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            extras: { vertexColors: true },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'Terrain_Material',
        pbrMetallicRoughness: { metallicFactor: 0.05, roughnessFactor: 0.85 },
        extras: { vertexColors: true },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: mesh.positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      { bufferView: 1, componentType: 5126, count: mesh.normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: mesh.colors.length / 4, type: 'VEC4' },
      { bufferView: 3, componentType: 5125, count: mesh.indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOff, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: nrmOff, byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: colOff, byteLength: colBuf.length, target: 34962 },
      { buffer: 0, byteOffset: idxOff, byteLength: idxBuf.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const jsonStr = JSON.stringify(json);
  const jsonPad = pad4(Buffer.byteLength(jsonStr));
  const jsonBuf = Buffer.concat([
    Buffer.from(jsonStr),
    Buffer.alloc(jsonPad, 0x20),
  ]);
  const binPad = pad4(bin.length);
  const binPadded = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

  const jsonChunkLen = jsonBuf.length;
  const binChunkLen = binPadded.length;
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunkLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  const binHeader = 20 + jsonChunkLen;
  out.writeUInt32LE(binChunkLen, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  binPadded.copy(out, binHeader + 8);
  return out;
}

for (const id of ['mountain', 'island', 'desert', 'hybrid']) {
  const glb = writeGlb(buildMesh(id));
  const path = join(OUT, `${id}.glb`);
  writeFileSync(path, glb);
  console.log('wrote', path, glb.length, 'bytes');
}
