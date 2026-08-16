import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_SIZE } from '../config/constants';
import type { LevelDef } from './types';
import { fbm, hash2, valueNoise } from './math';

export interface TerrainWorld {
  root: THREE.Object3D;
  collision: THREE.Object3D;
  fromStudio: boolean;
  sampleHeight: (x: number, z: number) => number;
  centerline: (t: number) => THREE.Vector3;
  tangent: (t: number) => THREE.Vector3;
  dispose: () => void;
}

const loader = (() => {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  return gltf;
})();

export function pathPoint(level: LevelDef, t: number): { x: number; z: number; floor: number } {
  const { path } = level;
  const z = path.startZ + t * path.length;
  const x = Math.sin(t * path.waves * Math.PI * 2) * path.amplitude;
  const floor = path.startHeight - t * path.drop;
  return { x, z, floor };
}

export function pathTangent(level: LevelDef, t: number): THREE.Vector3 {
  const a = pathPoint(level, Math.max(0, t - 0.01));
  const b = pathPoint(level, Math.min(1, t + 0.01));
  return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
}

export function pathFrame(level: LevelDef, t: number, lateral: number, agl: number): THREE.Vector3 {
  const p = pathPoint(level, t);
  const tan = pathTangent(level, t);
  const right = new THREE.Vector3(tan.z, 0, -tan.x);
  return new THREE.Vector3(p.x + right.x * lateral, p.floor + agl, p.z + right.z * lateral);
}

export function biomeHeight(level: LevelDef, x: number, z: number): number {
  const { path } = level;
  const t = (z - path.startZ) / path.length;
  const tc = Math.max(-0.1, Math.min(1.1, t));
  const center = pathPoint(level, tc);
  const dist = Math.hypot(x - center.x, 0);
  const half = path.halfWidth;
  const n = fbm(x * 0.006, z * 0.006) * 7;

  if (level.id === 'alpine') {
    const mouth = tc < 0.08 ? 22 : 0;
    const walls = Math.pow(Math.max(0, dist - half - mouth), 1.28) * 0.2;
    const rim = Math.max(0, Math.abs(x) / (WORLD_SIZE * 0.5) - 0.78) ** 2 * 70;
    return Math.max(6, center.floor + walls + n + rim);
  }
  if (level.id === 'coastal') {
    const island = Math.exp(-((dist * 0.018) ** 2)) * 22;
    const beach = center.floor * Math.exp(-((dist * 0.012) ** 2)) + island;
    const extra = valueNoise(x * 0.02, z * 0.02) * 4;
    return Math.max(level.waterLevel - 4, beach + extra + n * 0.5);
  }
  if (level.id === 'dune') {
    const dunes = Math.sin(x * 0.018 + z * 0.01) * 10 + Math.sin(z * 0.025) * 6;
    const bowl = Math.pow(Math.max(0, dist - half * 1.4), 1.2) * 0.12;
    return Math.max(8, center.floor * 0.55 + 28 + dunes + bowl + n);
  }
  const terrace = Math.floor((1 - tc) * 6) * 16;
  const walls = Math.pow(Math.max(0, dist - half), 1.45) * 0.38;
  return Math.max(8, 36 + terrace + walls + n);
}

export async function loadTerrain(level: LevelDef, scene: THREE.Scene): Promise<TerrainWorld> {
  const studio = await tryLoad(`/terrains/${level.id}.glb`);
  if (studio) {
    return mountStudio(studio, level, scene);
  }
  return mountProcedural(level, scene);
}

async function tryLoad(url: string): Promise<THREE.Group | null> {
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch {
    return null;
  }
}

function mountStudio(root: THREE.Group, level: LevelDef, scene: THREE.Scene): TerrainWorld {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > 0 && size.x < 90) root.scale.multiplyScalar(480 / size.x);
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  scene.add(root);
  const collision =
    root.getObjectByName('Collision_Mesh') ??
    root.getObjectByName('Terrain_Surface') ??
    root.getObjectByName('Terrain_Board') ??
    root;

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const sampleHeight = (x: number, z: number): number => {
    origin.set(x, box.max.y + 400, z);
    ray.set(origin, down);
    ray.far = 2000;
    const hit = ray.intersectObject(collision, true)[0];
    return hit ? hit.point.y : box.min.y;
  };

  const fitted = fitPathToBox(level, box);
  return {
    root,
    collision,
    fromStudio: true,
    sampleHeight,
    centerline: fitted.centerline,
    tangent: fitted.tangent,
    dispose: () => {
      scene.remove(root);
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
    },
  };
}

function fitPathToBox(level: LevelDef, box: THREE.Box3): {
  centerline: (t: number) => THREE.Vector3;
  tangent: (t: number) => THREE.Vector3;
} {
  const min = box.min;
  const max = box.max;
  const spanZ = Math.max(40, max.z - min.z);
  const midX = (min.x + max.x) * 0.5;
  const amp = (max.x - min.x) * 0.18;
  const startY = max.y - 8;
  const endY = min.y + (max.y - min.y) * 0.28;
  const centerline = (t: number): THREE.Vector3 => {
    const z = min.z + 20 + t * (spanZ - 40);
    const x = midX + Math.sin(t * level.path.waves * Math.PI * 2) * amp;
    const y = startY + (endY - startY) * t;
    return new THREE.Vector3(x, y, z);
  };
  const tangent = (t: number): THREE.Vector3 => {
    const a = centerline(Math.max(0, t - 0.01));
    const b = centerline(Math.min(1, t + 0.01));
    return b.sub(a).setY(0).normalize();
  };
  return { centerline, tangent };
}

function mountProcedural(level: LevelDef, scene: THREE.Scene): TerrainWorld {
  const group = new THREE.Group();
  group.name = `Biome_${level.id}`;
  const segments = level.id === 'ridge' ? 180 : 160;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const cC = new THREE.Color();
  const mix = new THREE.Color();
  palette(level, cA, cB, cC);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = biomeHeight(level, x, z);
    pos.setY(i, y);
    const u = THREE.MathUtils.smoothstep(y, 12, level.path.startHeight);
    mix.copy(cA).lerp(cB, u).lerp(cC, THREE.MathUtils.smoothstep(y, level.path.startHeight * 0.7, level.path.startHeight + 10));
    const mottling = 0.88 + valueNoise(x * 0.03, z * 0.03) * 0.22;
    colors[i * 3] = mix.r * mottling;
    colors[i * 3 + 1] = mix.g * mottling;
    colors[i * 3 + 2] = mix.b * mottling;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02 }),
  );
  mesh.name = 'Terrain_Surface';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);

  if (level.water) {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD_SIZE * 0.62, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1b7b8c,
        roughness: 0.14,
        metalness: 0.45,
        transparent: true,
        opacity: 0.72,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = level.waterLevel;
    water.name = 'Water';
    group.add(water);
  }

  addScatter(group, level);
  scene.add(group);

  return {
    root: group,
    collision: mesh,
    fromStudio: false,
    sampleHeight: (x, z) => biomeHeight(level, x, z),
    centerline: (t) => {
      const p = pathPoint(level, t);
      return new THREE.Vector3(p.x, p.floor, p.z);
    },
    tangent: (t) => pathTangent(level, t),
    dispose: () => {
      scene.remove(group);
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
    },
  };
}

function palette(level: LevelDef, a: THREE.Color, b: THREE.Color, c: THREE.Color): void {
  if (level.id === 'alpine') {
    a.setHex(0x4c7a3c);
    b.setHex(0x6d7a48);
    c.setHex(0x7a7568);
  } else if (level.id === 'coastal') {
    a.setHex(0xd6c07a);
    b.setHex(0x3f8a4e);
    c.setHex(0x2f6a3a);
  } else if (level.id === 'dune') {
    a.setHex(0xc9a15b);
    b.setHex(0xe0b56a);
    c.setHex(0xa87a3a);
  } else {
    a.setHex(0x6a6848);
    b.setHex(0x8a7a5a);
    c.setHex(0x5a5550);
  }
}

function addScatter(parent: THREE.Group, level: LevelDef): void {
  const count = level.id === 'dune' ? 90 : 180;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2, 5);
  const crownGeo =
    level.id === 'coastal'
      ? new THREE.SphereGeometry(1.1, 6, 5)
      : new THREE.ConeGeometry(1.25, 3.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: level.id === 'dune' ? 0x8a6a3a : 0x4a3424,
    roughness: 0.9,
  });
  const crownMat = new THREE.MeshStandardMaterial({
    color: level.id === 'dune' ? 0xb88840 : level.id === 'coastal' ? 0x2f8a3e : 0x2f5a32,
    roughness: 0.82,
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  trunks.castShadow = true;
  crowns.castShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < 5000) {
    guard += 1;
    const x = (hash2(placed + 3, guard) - 0.5) * WORLD_SIZE * 0.86;
    const z = (hash2(guard, placed + 9) - 0.5) * WORLD_SIZE * 0.86;
    const y = biomeHeight(level, x, z);
    if (level.water && y < level.waterLevel + 2) continue;
    const p = pathPoint(level, (z - level.path.startZ) / level.path.length);
    if (Math.abs(x - p.x) < level.path.halfWidth + 8) continue;
    const scale = 0.7 + hash2(placed, 4) * 1.15;
    dummy.position.set(x, y + (level.id === 'dune' ? 0.4 : 1) * scale, z);
    dummy.rotation.set(0, hash2(placed, 11) * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + (level.id === 'dune' ? 1.1 : 2.9) * scale;
    dummy.scale.setScalar(level.id === 'dune' ? scale * 0.55 : scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  parent.add(trunks, crowns);
}

export function createEnvironment(level: LevelDef, scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
} {
  scene.fog = new THREE.FogExp2(level.fogColor, level.fog);
  scene.background = new THREE.Color(level.sky.horizon);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2800, 28, 14),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(level.sky.top) },
        horizon: { value: new THREE.Color(level.sky.horizon) },
        bottom: { value: new THREE.Color(level.sky.bottom) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 bottom;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.55, h));
          col = mix(bottom, col, smoothstep(-0.25, 0.05, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.name = 'SkyDome';
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(level.hemiSky, level.hemiGround, 0.74);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(level.sunColor, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}
