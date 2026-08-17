import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_SIZE } from '../config/constants';
import type { LevelDef } from './types';
import { fbm, valueNoise } from './math';
import { applyTerrainSplat, createSplatMaterial, ensureUpNormals, smoothTerrainShading } from './terrainShader';
import { addEnvironmentScatter } from './scatter';
import { createCoastalWater } from './water';
import type { Water } from 'three/addons/objects/Water.js';

export interface TerrainWorld {
  root: THREE.Object3D;
  collision: THREE.Object3D;
  fromStudio: boolean;
  water: Water | null;
  sampleHeight: (x: number, z: number) => number;
  centerline: (t: number) => THREE.Vector3;
  tangent: (t: number) => THREE.Vector3;
  dispose: () => void;
}

const loader = (() => {
  const draco = new DRACOLoader();
  draco.setDecoderPath('./draco/');
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
  const waves =
    Math.sin(x * 0.008) * Math.cos(z * 0.007) * 18 +
    Math.sin(x * 0.019 + 1.7) * Math.cos(z * 0.015) * 9 +
    n;

  if (level.id === 'alpine') {
    const mouth = tc < 0.08 ? 22 : 0;
    const walls = Math.pow(Math.max(0, dist - half - mouth), 1.28) * 0.2;
    const rim = Math.max(0, Math.abs(x) / (WORLD_SIZE * 0.5) - 0.78) ** 2 * 70;
    return Math.max(6, center.floor + walls + waves * 0.35 + rim);
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
    return Math.max(8, center.floor * 0.55 + 28 + dunes + bowl + waves * 0.4);
  }
  const terrace = Math.floor((1 - tc) * 6) * 16;
  const walls = Math.pow(Math.max(0, dist - half), 1.45) * 0.38;
  return Math.max(8, 36 + terrace + walls + waves * 0.3);
}

export function purgeTerrainFromScene(scene: THREE.Scene): void {
  const drop: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    const n = obj.name;
    if (
      n === 'Horizon_Skirt' ||
      n === 'Ground_Fill' ||
      n === 'Terrain_Studio' ||
      n === 'Terrain_Board' ||
      n === 'Terrain_Surface' ||
      n.startsWith('Biome_')
    ) {
      drop.push(obj);
    }
  });
  for (const obj of drop) {
    obj.removeFromParent();
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    });
  }
}

export async function loadTerrain(
  level: LevelDef,
  scene: THREE.Scene,
  sunDir: THREE.Vector3,
): Promise<TerrainWorld> {
  purgeTerrainFromScene(scene);
  const studio =
    (await tryLoad(`/terrains/${level.asset}.glb`)) ?? (await tryLoad(`/terrains/${level.id}.glb`));
  if (studio) {
    return mountStudio(studio, level, scene, sunDir);
  }
  return mountProcedural(level, scene, sunDir);
}

async function tryLoad(url: string): Promise<THREE.Group | null> {
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch {
    return null;
  }
}

function mountStudio(
  root: THREE.Group,
  level: LevelDef,
  scene: THREE.Scene,
  sunDir: THREE.Vector3,
): TerrainWorld {
  root.name = 'Terrain_Studio';
  fitStudioRoot(root);
  pruneOrphanMeshes(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const board = Math.max(box.getSize(new THREE.Vector3()).x, 400);
  applyTerrainSplat(root, level.id, board);
  scene.add(root);
  let water: Water | null = null;
  if (level.water) {
    water = createCoastalWater(sunDir);
    scene.add(water);
  }
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
  const pad = fitted.centerline(1);
  pad.y = sampleHeight(pad.x, pad.z);
  const span = Math.max(box.getSize(new THREE.Vector3()).x, 400);
  addGroundFill(scene, box.min.y);
  addEnvironmentScatter(root, level, sampleHeight, pad, span);
  smoothTerrainShading(root);
  return {
    root,
    collision,
    fromStudio: true,
    water,
    sampleHeight,
    centerline: fitted.centerline,
    tangent: fitted.tangent,
    dispose: () => {
      scene.remove(root);
      if (water) scene.remove(water);
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
      purgeTerrainFromScene(scene);
    },
  };
}

function fitStudioRoot(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  if (size.x > 0 && size.x < 200) root.scale.multiplyScalar(560 / size.x);
  else if (size.x > 1400) root.scale.multiplyScalar(640 / size.x);
  root.updateMatrixWorld(true);
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

function pruneOrphanMeshes(root: THREE.Group): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  if (meshes.length === 0) return;
  const ranked = meshes.map((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const count = mesh.geometry?.getAttribute('position')?.count ?? 0;
    return { mesh, box, size, count, volume: Math.max(size.x * size.y * size.z, 0) };
  });
  ranked.sort((a, b) => b.count - a.count);
  const main = ranked[0];
  const mainCenter = main.box.getCenter(new THREE.Vector3());
  const mainSpan = Math.max(main.size.length(), 40);
  for (const item of ranked) {
    if (item.mesh === main.mesh) continue;
    const name = item.mesh.name.toLowerCase();
    const keepName =
      name.includes('terrain') || name.includes('surface') || name.includes('board') || name.includes('ground');
    if (keepName) continue;
    const dropName =
      name.includes('collision') ||
      name.includes('proxy') ||
      name.includes('bound') ||
      name.includes('helper') ||
      name.includes('box') ||
      name.includes('debug') ||
      name.includes('volume') ||
      name.includes('locator');
    const tiny = item.count < 64 || item.volume < main.volume * 0.004;
    const far = mainCenter.distanceTo(item.box.getCenter(new THREE.Vector3())) > mainSpan * 0.65;
    if (dropName || tiny || far) {
      item.mesh.visible = false;
      item.mesh.removeFromParent();
    }
  }
}

function addGroundFill(scene: THREE.Scene, minY: number): void {
  const geo = new THREE.PlaneGeometry(15000, 15000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  ensureUpNormals(geo);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x6e8aa0,
      roughness: 1,
      metalness: 0,
      fog: true,
      depthWrite: true,
    }),
  );
  mesh.name = 'Ground_Fill';
  mesh.position.y = Math.min(minY - 8, -4);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function mountProcedural(level: LevelDef, scene: THREE.Scene, sunDir: THREE.Vector3): TerrainWorld {
  const group = new THREE.Group();
  group.name = `Biome_${level.id}`;
  const segments = level.id === 'ridge' ? 260 : 240;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, biomeHeight(level, pos.getX(i), pos.getZ(i)));
  }
  ensureUpNormals(geo);
  const mesh = new THREE.Mesh(geo, createSplatMaterial(level.id, WORLD_SIZE));
  mesh.name = 'Terrain_Surface';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  group.add(mesh);

  let water: Water | null = null;
  if (level.water) {
    water = createCoastalWater(sunDir);
    scene.add(water);
  }

  const pad = pathFrame(level, 1, 0, 0);
  pad.y = biomeHeight(level, pad.x, pad.z);
  addGroundFill(scene, 0);
  addEnvironmentScatter(group, level, (x, z) => biomeHeight(level, x, z), pad, WORLD_SIZE);
  smoothTerrainShading(group);
  scene.add(group);

  return {
    root: group,
    collision: mesh,
    fromStudio: false,
    water,
    sampleHeight: (x, z) => biomeHeight(level, x, z),
    centerline: (t) => {
      const p = pathPoint(level, t);
      return new THREE.Vector3(p.x, p.floor, p.z);
    },
    tangent: (t) => pathTangent(level, t),
    dispose: () => {
      scene.remove(group);
      if (water) scene.remove(water);
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      purgeTerrainFromScene(scene);
    },
  };
}


