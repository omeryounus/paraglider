import * as THREE from 'three';
import type { LevelId } from './types';
import { getLevel } from '../config/levels';
import { getTerrainMaps } from './terrainTextures';

export interface BiomeSplat {
  grass: THREE.Vector3;
  rock: THREE.Vector3;
  scree: THREE.Vector3;
  snow: THREE.Vector3;
  snowHeight: number;
  grassScale: number;
  grassMax: number;
  rockMin: number;
  beachMin: number;
  beachMax: number;
  strata: number;
}

export const BIOME_SPLAT: Record<LevelId, BiomeSplat> = {
  alpine: {
    grass: new THREE.Vector3(0.3, 0.44, 0.26),
    rock: new THREE.Vector3(0.44, 0.44, 0.46),
    scree: new THREE.Vector3(0.4, 0.37, 0.3),
    snow: new THREE.Vector3(0.74, 0.78, 0.82),
    snowHeight: 350,
    grassScale: 0.048,
    grassMax: 30,
    rockMin: 35,
    beachMin: -999,
    beachMax: -998,
    strata: 0,
  },
  coastal: {
    grass: new THREE.Vector3(0.14, 0.46, 0.13),
    rock: new THREE.Vector3(0.16, 0.14, 0.14),
    scree: new THREE.Vector3(0.7, 0.6, 0.4),
    snow: new THREE.Vector3(0.82, 0.8, 0.76),
    snowHeight: 520,
    grassScale: 0.1,
    grassMax: 30,
    rockMin: 32,
    beachMin: 0,
    beachMax: 48,
    strata: 0,
  },
  dune: {
    grass: new THREE.Vector3(0.6, 0.48, 0.3),
    rock: new THREE.Vector3(0.5, 0.36, 0.26),
    scree: new THREE.Vector3(0.58, 0.46, 0.32),
    snow: new THREE.Vector3(0.78, 0.72, 0.62),
    snowHeight: 155,
    grassScale: 0.095,
    grassMax: 24,
    rockMin: 28,
    beachMin: -999,
    beachMax: -998,
    strata: 0.08,
  },
  ridge: {
    grass: new THREE.Vector3(0.38, 0.36, 0.26),
    rock: new THREE.Vector3(0.46, 0.4, 0.34),
    scree: new THREE.Vector3(0.48, 0.42, 0.32),
    snow: new THREE.Vector3(0.76, 0.76, 0.74),
    snowHeight: 380,
    grassScale: 0.046,
    grassMax: 28,
    rockMin: 33,
    beachMin: -999,
    beachMax: -998,
    strata: 0.28,
  },
};

const SPLAT_CHUNK = /* glsl */ `
uniform sampler2D uGrass;
uniform sampler2D uRock;
uniform sampler2D uScree;
uniform sampler2D uSnow;
uniform sampler2D uGrassN;
uniform sampler2D uRockN;
uniform sampler2D uScreeN;
uniform sampler2D uSnowN;
uniform sampler2D uDetailN;
uniform vec3 uGrassTint;
uniform vec3 uRockTint;
uniform vec3 uScreeTint;
uniform vec3 uSnowTint;
uniform float uSnowHeight;
uniform float uTexScale;
uniform float uGrassMax;
uniform float uRockMin;
uniform float uBeachMin;
uniform float uBeachMax;
uniform float uStrata;
uniform float uSkirtInner;
uniform vec3 uFogColor;
varying vec3 vWp;
varying vec3 vWn;

vec3 planar(sampler2D tex, vec3 p, float sc) {
  vec3 a = texture2D(tex, p.xz * sc).rgb;
  vec3 b = texture2D(tex, p.zx * sc * 0.37 + vec2(0.17, 0.09)).rgb;
  return mix(a, b, 0.42);
}

vec3 triplanar(sampler2D tex, vec3 p, vec3 n, float sc) {
  vec3 q = p + 0.32 * vec3(sin(p.y * 0.07), sin(p.z * 0.061), sin(p.x * 0.068));
  vec3 an = pow(abs(n), vec3(4.0));
  an /= (an.x + an.y + an.z + 1e-5);
  vec3 x = texture2D(tex, q.zy * sc).rgb;
  vec3 y = texture2D(tex, q.xz * sc).rgb;
  vec3 z = texture2D(tex, q.xy * sc).rgb;
  return x * an.x + y * an.y + z * an.z;
}

vec3 projectAlbedo(sampler2D tex, vec3 p, vec3 n, float sc) {
  float steep = smoothstep(0.18, 0.46, 1.0 - clamp(n.y, 0.0, 1.0));
  return mix(planar(tex, p, sc), triplanar(tex, p, n, sc), steep);
}

vec3 unpackN(vec3 c) {
  return c * 2.0 - 1.0;
}

vec3 planarNormal(sampler2D tex, vec3 p, vec3 n, float sc) {
  vec3 t = unpackN(texture2D(tex, p.xz * sc).xyz);
  vec3 wn = normalize(n);
  vec3 wt = normalize(cross(wn, vec3(0.0, 0.0, 1.0)));
  if (length(wt) < 0.1) wt = normalize(cross(wn, vec3(1.0, 0.0, 0.0)));
  vec3 wb = cross(wn, wt);
  return normalize(mix(wn, wt * t.x + wb * t.y + wn * t.z, 0.38));
}

vec3 triplanarNormal(sampler2D tex, vec3 p, vec3 n, float sc) {
  vec3 an = pow(abs(n), vec3(4.0));
  an /= (an.x + an.y + an.z + 1e-5);
  vec3 tx = unpackN(texture2D(tex, p.zy * sc).xyz);
  vec3 ty = unpackN(texture2D(tex, p.xz * sc).xyz);
  vec3 tz = unpackN(texture2D(tex, p.xy * sc).xyz);
  vec3 nx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  vec3 ny = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  vec3 nz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(nx.zyx * an.x + ny.xzy * an.y + nz.xyz * an.z);
}

vec4 splatWeights(vec3 wn, float h) {
  float slopeDeg = degrees(acos(clamp(wn.y, 0.0, 1.0)));
  float grassW = 1.0 - smoothstep(uGrassMax - 6.0, uGrassMax + 4.0, slopeDeg);
  grassW *= 1.0 - smoothstep(uSnowHeight - 160.0, uSnowHeight - 25.0, h);
  float rockW = smoothstep(uRockMin - 5.0, uRockMin + 6.0, slopeDeg);
  float snowW = smoothstep(uSnowHeight - 45.0, uSnowHeight + 22.0, h);
  snowW *= mix(1.0, 0.5, rockW);
  float beachW = (1.0 - smoothstep(uBeachMin, uBeachMax, h)) * (1.0 - rockW);
  grassW *= 1.0 - beachW;
  float screeW = (1.0 - grassW) * (1.0 - rockW * 0.72) * (1.0 - snowW);
  screeW = max(screeW, beachW);
  vec4 w = vec4(grassW, rockW, screeW, snowW);
  return w / (w.x + w.y + w.z + w.w + 1e-4);
}

vec3 strataTint(float h, vec3 p) {
  float band = smoothstep(0.42, 0.58, fract(h * 0.031 + sin(p.x * 0.018) * 0.1));
  return mix(vec3(1.0), mix(vec3(0.82, 0.7, 0.48), vec3(1.2, 0.78, 0.5), band), uStrata);
}

vec3 splatAlbedo(vec4 w, vec3 wn) {
  float sc = uTexScale;
  float variegation = sin(vWp.x * 0.023) * sin(vWp.z * 0.019);
  vec3 grass = projectAlbedo(uGrass, vWp, wn, sc) * uGrassTint * mix(vec3(0.9, 1.08, 0.85), vec3(1.08, 0.92, 0.7), variegation * 0.5 + 0.5);
  vec3 rock = triplanar(uRock, vWp, wn, sc * 0.48) * uRockTint * strataTint(vWp.y, vWp);
  vec3 scree = projectAlbedo(uScree, vWp, wn, sc * 1.05) * uScreeTint;
  vec3 snow = projectAlbedo(uSnow, vWp, wn, sc * 0.58) * uSnowTint * vec3(0.82, 0.88, 0.94);
  float spark = step(0.975, fract(sin(dot(vWp.xz, vec2(12.9898, 78.233))) * 43758.5453));
  snow += spark * 0.08;
  vec3 c = grass * w.x + rock * w.y + scree * w.z + snow * w.w;
  vec3 grain = projectAlbedo(uGrass, vWp, wn, sc * 4.2);
  c *= mix(vec3(1.0), grain * 1.06, 0.16);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.28);
  c *= 0.9 + 0.1 * pow(clamp(wn.y, 0.0, 1.0), 0.85);
  c = min(c, vec3(0.92));
  float radial = max(abs(vWp.x), abs(vWp.z));
  float rim = smoothstep(uSkirtInner * 0.72, uSkirtInner * 1.08, radial);
  c = mix(c, uFogColor, rim * 0.92);
  return c;
}

vec3 projectNormal(sampler2D tex, vec3 p, vec3 n, float sc) {
  float steep = smoothstep(0.18, 0.46, 1.0 - clamp(n.y, 0.0, 1.0));
  return normalize(mix(planarNormal(tex, p, n, sc), triplanarNormal(tex, p, n, sc), steep));
}

vec3 splatWorldNormal(vec4 w, vec3 wn) {
  float sc = uTexScale;
  vec3 ng = projectNormal(uGrassN, vWp, wn, sc);
  vec3 nr = normalize(mix(wn, triplanarNormal(uRockN, vWp, wn, sc * 0.52), 0.45));
  vec3 ns = projectNormal(uScreeN, vWp, wn, sc * 1.12);
  vec3 nw = projectNormal(uSnowN, vWp, wn, sc * 0.64);
  vec3 base = normalize(ng * w.x + nr * w.y + ns * w.z + nw * w.w);
  vec3 detail = projectNormal(uDetailN, vWp, wn, 0.22);
  return normalize(mix(base, detail, 0.18));
}

float splatRough(vec4 w) {
  float grain = planar(uDetailN, vWp, 0.28).r;
  return clamp(w.x * 0.9 + w.y * 0.94 + w.z * 0.88 + w.w * 0.82 + (grain - 0.5) * 0.16, 0.62, 0.98);
}
`;

function bindSplatUniforms(
  shader: THREE.WebGLProgramParametersWithUniforms,
  biome: LevelId,
  extent: number,
): void {
  const maps = getTerrainMaps();
  const pal = BIOME_SPLAT[biome];
  shader.uniforms.uGrass = { value: maps.grass };
  shader.uniforms.uRock = { value: maps.rock };
  shader.uniforms.uScree = { value: maps.scree };
  shader.uniforms.uSnow = { value: maps.snow };
  shader.uniforms.uGrassN = { value: maps.grassN };
  shader.uniforms.uRockN = { value: maps.rockN };
  shader.uniforms.uScreeN = { value: maps.screeN };
  shader.uniforms.uSnowN = { value: maps.snowN };
  shader.uniforms.uDetailN = { value: maps.detailN };
  shader.uniforms.uGrassTint = { value: pal.grass };
  shader.uniforms.uRockTint = { value: pal.rock };
  shader.uniforms.uScreeTint = { value: pal.scree };
  shader.uniforms.uSnowTint = { value: pal.snow };
  shader.uniforms.uSnowHeight = { value: pal.snowHeight };
  shader.uniforms.uTexScale = { value: pal.grassScale };
  shader.uniforms.uGrassMax = { value: pal.grassMax };
  shader.uniforms.uRockMin = { value: pal.rockMin };
  shader.uniforms.uBeachMin = { value: pal.beachMin };
  shader.uniforms.uBeachMax = { value: pal.beachMax };
  shader.uniforms.uStrata = { value: pal.strata };
  shader.uniforms.uSkirtInner = { value: extent * 0.5 };
  shader.uniforms.uFogColor = { value: new THREE.Color(getLevel(biome).fogColor) };
}

export function createSplatMaterial(biome: LevelId, extent = 1600): THREE.MeshStandardMaterial {
  const maps = getTerrainMaps();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5a6850,
    roughness: 0.88,
    metalness: 0.05,
    vertexColors: false,
    dithering: true,
    fog: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    flatShading: false,
    normalMap: maps.detailN,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  mat.onBeforeCompile = (shader) => {
    bindSplatUniforms(shader, biome, extent);
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWp;\nvarying vec3 vWn;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>\nvWn = normalize(mat3(modelMatrix) * objectNormal);`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SPLAT_CHUNK}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec4 tw = splatWeights(normalize(vWn), vWp.y);
        diffuseColor.rgb = splatAlbedo(tw, normalize(vWn));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = splatRough(tw);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 geoN = normalize(vWn);
          vec3 splN = splatWorldNormal(tw, geoN);
          normal = normalize(mat3(viewMatrix) * normalize(mix(geoN, splN, 0.48)));
        }`,
      );
  };
  mat.customProgramCacheKey = () => `terrain-splat-v10-${biome}`;
  return mat;
}

export function ensureUpNormals(geo: THREE.BufferGeometry, _weld = true): void {
  geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  if (!nrm || nrm.count === 0) return;
  let sumY = 0;
  for (let i = 0; i < nrm.count; i++) sumY += nrm.getY(i);
  if (sumY / nrm.count < 0) {
    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const b = idx.getX(i + 1);
        const c = idx.getX(i + 2);
        idx.setX(i + 1, c);
        idx.setX(i + 2, b);
      }
      idx.needsUpdate = true;
    }
    geo.computeVertexNormals();
  }
}

export function tessellateOnce(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const idx = geo.getIndex();
  if (!pos || !idx || idx.count > 80000 || pos.count > 22000) {
    geo.computeVertexNormals();
    return geo;
  }
  const keyOf = (a: number, b: number): number => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return lo * 1000003 + hi;
  };
  const newPos: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  const midCache = new Map<number, number>();
  let next = pos.count;
  const midpoint = (a: number, b: number): number => {
    const key = keyOf(a, b);
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const m = next;
    next += 1;
    midCache.set(key, m);
    newPos.push(
      (newPos[a * 3] + newPos[b * 3]) * 0.5,
      (newPos[a * 3 + 1] + newPos[b * 3 + 1]) * 0.5,
      (newPos[a * 3 + 2] + newPos[b * 3 + 2]) * 0.5,
    );
    return m;
  };
  const newIdx: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  out.setIndex(newIdx);
  out.computeVertexNormals();
  return out;
}

function isScatterOrFx(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) return true;
  const n = mesh.name;
  return (
    n.startsWith('Scatter') ||
    n === 'Water' ||
    n.includes('Pad') ||
    n.includes('Ring') ||
    n.includes('Orb')
  );
}

export function smoothTerrainShading(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || isScatterOrFx(mesh)) return;
    if (mesh.geometry) {
      mesh.geometry.deleteAttribute('normal');
      ensureUpNormals(mesh.geometry);
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat) return;
      const std = mat as THREE.MeshStandardMaterial;
      if ('flatShading' in std) {
        std.flatShading = false;
        std.needsUpdate = true;
      }
    });
  });
}

export function applyTerrainSplat(root: THREE.Object3D, biome: LevelId, extent = 480): void {
  const splat = createSplatMaterial(biome, extent);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || isScatterOrFx(mesh)) return;
    const verts = mesh.geometry?.getAttribute('position')?.count ?? 0;
    if (verts > 0 && verts < 48) return;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (mesh.geometry) {
      ensureUpNormals(mesh.geometry, true);
    }
    const prev = mesh.material;
    mesh.material = splat;
    if (prev && prev !== splat) {
      const mats = Array.isArray(prev) ? prev : [prev];
      mats.forEach((m) => m.dispose());
    }
  });
}
