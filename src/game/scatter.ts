import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LevelDef } from './types';
import { hash2 } from './math';

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

function pineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 1.8, 5);
  trunk.translate(0, 0.9, 0);
  paint(trunk, 0x4a3422);
  const c0 = new THREE.ConeGeometry(1.15, 1.8, 6);
  c0.translate(0, 2.15, 0);
  paint(c0, 0x1a4a22);
  const c1 = new THREE.ConeGeometry(0.85, 1.4, 6);
  c1.translate(0, 3.15, 0);
  paint(c1, 0x22602a);
  const c2 = new THREE.ConeGeometry(0.5, 1.05, 6);
  c2.translate(0, 3.95, 0);
  paint(c2, 0x2a7032);
  const merged = mergeGeometries([trunk, c0, c1, c2], false);
  trunk.dispose();
  c0.dispose();
  c1.dispose();
  c2.dispose();
  if (!merged) throw new Error('pine merge');
  merged.computeVertexNormals();
  return merged;
}

function palmGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 2.6, 5);
  trunk.translate(0, 1.3, 0);
  paint(trunk, 0x8a6234);
  const crown = new THREE.SphereGeometry(0.95, 6, 5);
  crown.scale(1.2, 0.5, 1.2);
  crown.translate(0, 2.75, 0);
  paint(crown, 0x1c7a30);
  const merged = mergeGeometries([trunk, crown], false);
  trunk.dispose();
  crown.dispose();
  if (!merged) throw new Error('palm merge');
  merged.computeVertexNormals();
  return merged;
}

function cactusGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.18, 0.24, 2.1, 6);
  body.translate(0, 1.05, 0);
  paint(body, 0x3a6a32);
  const arm = new THREE.CylinderGeometry(0.1, 0.12, 0.95, 5);
  arm.rotateZ(1.05);
  arm.translate(0.48, 1.35, 0);
  paint(arm, 0x457838);
  const merged = mergeGeometries([body, arm], false);
  body.dispose();
  arm.dispose();
  if (!merged) throw new Error('cactus merge');
  merged.computeVertexNormals();
  return merged;
}

function slopeAt(sample: (x: number, z: number) => number, x: number, z: number): number {
  const e = 3.2;
  const dx = (sample(x + e, z) - sample(x - e, z)) / (2 * e);
  const dz = (sample(x, z + e) - sample(x, z - e)) / (2 * e);
  return Math.atan(Math.hypot(dx, dz));
}

export function addEnvironmentScatter(
  parent: THREE.Group,
  level: LevelDef,
  sampleHeight: (x: number, z: number) => number,
  pad: THREE.Vector3,
  extent: number,
): void {
  const treeBudget = level.id === 'dune' ? 140 : level.id === 'ridge' ? 280 : 320;
  const treeGeo =
    level.id === 'coastal' ? palmGeometry() : level.id === 'dune' ? cactusGeometry() : pineGeometry();
  const treeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    vertexColors: true,
  });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeBudget);
  trees.castShadow = true;
  trees.receiveShadow = true;
  trees.name = 'ScatterTrees';

  const dummy = new THREE.Object3D();
  const padR = 34;
  const span = extent * 0.72;
  const treeSlopeMax = (22 * Math.PI) / 180;
  const treeAltMax = 220;
  const waterMin = level.water ? level.waterLevel + 1.6 : 8;

  let treesN = 0;
  let guard = 0;
  while (treesN < treeBudget && guard < treeBudget * 6) {
    guard += 1;
    const x = (hash2(guard, 11) - 0.5) * span;
    const z = (hash2(guard + 5, 19) - 0.5) * span;
    if (Math.hypot(x - pad.x, z - pad.z) < padR) continue;
    const y = sampleHeight(x, z);
    if (y < waterMin || y > treeAltMax) continue;
    const ang = slopeAt(sampleHeight, x, z);
    if (ang >= treeSlopeMax) continue;
    const s = 0.85 + hash2(treesN, 4) * 1.15;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, hash2(treesN, 8) * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trees.setMatrixAt(treesN, dummy.matrix);
    treesN += 1;
  }

  trees.count = treesN;
  trees.instanceMatrix.needsUpdate = true;
  parent.add(trees);
}
