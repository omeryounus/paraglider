import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { FlightState } from '../game/types';
import { damp } from '../game/math';

const SPAN = 9.2;
const CHORD = 2.55;
const SEGS_X = 48;
const SEGS_Z = 16;
const CANOPY_Y = 3.15;
const GALLERIES = 4;

export interface GliderVisual {
  root: THREE.Group;
  canopy: THREE.Group;
  wing: THREE.Mesh;
  eye: THREE.Object3D;
  helmet: THREE.Object3D;
  lines: THREE.LineSegments;
}

interface PilotRig {
  group: THREE.Object3D;
  torso: THREE.Object3D;
  headShell: THREE.Object3D;
  eye: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftForearm: THREE.Object3D;
  rightForearm: THREE.Object3D;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftRiser: THREE.Object3D;
  rightRiser: THREE.Object3D;
  restTorsoX: number;
  restArmX: number;
  restForearmX: number;
}

interface LineBind {
  vert: number;
  side: 'L' | 'R';
  gallery: number;
  kind: 'cascade' | 'brake';
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, 1);
const GATHER_LOCAL = [
  new THREE.Vector3(0, 0.98, -0.2),
  new THREE.Vector3(0, 1.05, -0.04),
  new THREE.Vector3(0, 1.02, 0.12),
  new THREE.Vector3(0, 0.92, 0.28),
];

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.position.y = CANOPY_Y;
  const { geometry, binds } = createAirfoil();
  const wing = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xd90429,
      vertexColors: true,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      roughness: 0.48,
      metalness: 0.05,
      emissive: 0x3a0a12,
      emissiveIntensity: 0.22,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
      flatShading: false,
      dithering: true,
    }),
  );
  wing.castShadow = true;
  wing.receiveShadow = false;
  wing.userData.binds = binds;
  canopy.add(wing);

  const cascadeCount = binds.filter((b) => b.kind === 'cascade').length;
  const brakeCount = binds.filter((b) => b.kind === 'brake').length;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((cascadeCount + brakeCount) * 6), 3),
  );
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: 0x1a1a1c,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
    }),
  );
  lines.frustumCulled = false;
  lines.name = 'Suspension';

  const straps = createRiserStraps();
  const pilot = createPilot();
  root.add(canopy, pilot.group, lines, straps);
  root.userData.pilot = pilot;
  root.userData.straps = straps;
  root.userData.rest = (geometry.getAttribute('rest') as THREE.BufferAttribute).array as Float32Array;

  return { root, canopy, wing, eye: pilot.eye, helmet: pilot.headShell, lines };
}

function panelColor(u: number, dest: number[]): void {
  const band = Math.floor(u * 6);
  if (band === 0 || band === 5) dest.push(0.12, 0.16, 0.38);
  else if (band === 1 || band === 4) dest.push(1, 0.62, 0.18);
  else dest.push(0.85, 0.03, 0.16);
}

function airfoilAt(u: number, v: number, surface: 'top' | 'bot'): { x: number; y: number; z: number } {
  const s = (u - 0.5) * 2;
  const plan = Math.sqrt(Math.max(0.04, 1 - s * s));
  const localChord = CHORD * (0.42 + 0.58 * plan);
  const x = s * (SPAN * 0.5);
  const z = (v - 0.22) * localChord;
  const camber = Math.sin(Math.PI * v) * 0.22 * plan;
  const thick = Math.sin(Math.PI * v) * 0.07 * plan;
  const arc = s * s * 1.05;
  const y = camber + (surface === 'top' ? thick : -thick * 0.85) - arc;
  return { x, y, z };
}

function createAirfoil(): { geometry: THREE.BufferGeometry; binds: LineBind[] } {
  const cols = SEGS_X + 1;
  const rows = SEGS_Z + 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const push = (surface: 'top' | 'bot'): void => {
    for (let j = 0; j < rows; j++) {
      const v = j / SEGS_Z;
      for (let i = 0; i < cols; i++) {
        const u = i / SEGS_X;
        const p = airfoilAt(u, v, surface);
        positions.push(p.x, p.y, p.z);
        uvs.push(u, v);
        panelColor(u, colors);
      }
    }
  };
  push('top');
  push('bot');

  const topOff = 0;
  const botOff = cols * rows;
  const face = (off: number, i: number, j: number, flip: boolean): void => {
    const a = off + j * cols + i;
    const b = a + 1;
    const c = a + cols;
    const d = c + 1;
    if (flip) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  };
  for (let j = 0; j < SEGS_Z; j++) {
    for (let i = 0; i < SEGS_X; i++) {
      face(topOff, i, j, false);
      face(botOff, i, j, true);
    }
  }
  for (let i = 0; i < SEGS_X; i++) {
    const t0 = topOff + i;
    const t1 = t0 + 1;
    const b0 = botOff + i;
    const b1 = b0 + 1;
    indices.push(t0, b0, t1, t1, b0, b1);
    const tt0 = topOff + SEGS_Z * cols + i;
    const tt1 = tt0 + 1;
    const bb0 = botOff + SEGS_Z * cols + i;
    const bb1 = bb0 + 1;
    indices.push(tt0, tt1, bb0, tt1, bb0, bb1);
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(pos.slice(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const binds: LineBind[] = [];
  const rowsV = [0.16, 0.38, 0.6, 0.8];
  const stations = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];
  for (let g = 0; g < rowsV.length; g++) {
    const j = Math.round(rowsV[g] * SEGS_Z);
    for (const u of stations) {
      const i = Math.round(u * SEGS_X);
      binds.push({
        vert: botOff + j * cols + i,
        side: u < 0.5 ? 'L' : 'R',
        gallery: g,
        kind: 'cascade',
      });
    }
  }
  const brakeU = [0.18, 0.34, 0.66, 0.82];
  const brakeJ = Math.round(0.96 * SEGS_Z);
  for (const u of brakeU) {
    const i = Math.round(u * SEGS_X);
    binds.push({
      vert: botOff + brakeJ * cols + i,
      side: u < 0.5 ? 'L' : 'R',
      gallery: 3,
      kind: 'brake',
    });
  }
  return { geometry: geo, binds };
}

function skin(color: number, rough = 0.65, metal = 0.06): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    fog: false,
  });
}

function applyFresnelRim(mat: THREE.MeshStandardMaterial, color: number, power = 2.5, gain = 0.48): void {
  const rim = new THREE.Color(color);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rim };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimGain = { value: gain };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor;
        uniform float uRimPower;
        uniform float uRimGain;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fres = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), uRimPower);
          totalEmissiveRadiance += uRimColor * fres * uRimGain;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `pilot-rim-${color.toString(16)}-${power}-${gain}`;
  mat.needsUpdate = true;
}

function createRiserStraps(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'RiserStraps';
  const webbing = new THREE.MeshStandardMaterial({
    color: 0x1c1814,
    roughness: 0.52,
    metalness: 0.06,
    fog: false,
  });
  for (let side = 0; side < 2; side++) {
    for (let g = 0; g < GALLERIES; g++) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.01, 1), webbing);
      strap.castShadow = true;
      strap.name = `Riser_${side === 0 ? 'L' : 'R'}_${'ABCD'[g]}`;
      group.add(strap);
    }
  }
  return group;
}

function createPilot(): PilotRig {
  const group = new THREE.Group();
  const jacket = skin(0x2a3340, 0.58, 0.1);
  const pants = skin(0x1a1e24, 0.68, 0.06);
  const flesh = skin(0xc68642, 0.55);
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x161b20,
    roughness: 0.32,
    metalness: 0.3,
    fog: false,
  });
  applyFresnelRim(carbon, 0x8eb8e6, 2.35, 0.42);
  const webbing = skin(0x2a2218, 0.55, 0.04);
  const buckle = new THREE.MeshStandardMaterial({
    color: 0xb7bec4,
    roughness: 0.28,
    metalness: 0.82,
    fog: false,
  });

  const cocoon = new THREE.Group();
  cocoon.name = 'PodCocoon';
  const hullGeo = new THREE.SphereGeometry(0.36, 22, 16);
  hullGeo.scale(0.7, 0.5, 1.88);
  const hull = new THREE.Mesh(hullGeo, carbon);
  hull.position.set(0, 0.1, 0.4);
  hull.rotation.x = 0.1;
  hull.castShadow = true;
  const wrapGeo = new THREE.SphereGeometry(0.3, 20, 14);
  wrapGeo.scale(0.78, 0.7, 1.05);
  const wrap = new THREE.Mesh(wrapGeo, carbon);
  wrap.position.set(0, 0.22, 0.16);
  wrap.rotation.x = 0.22;
  wrap.castShadow = true;
  const backGeo = new THREE.SphereGeometry(0.2, 16, 12);
  backGeo.scale(0.72, 0.9, 0.58);
  const back = new THREE.Mesh(backGeo, carbon);
  back.position.set(0, 0.3, 0.2);
  back.castShadow = true;
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 1.22), carbon);
  keel.position.set(0, -0.02, 0.46);
  keel.castShadow = true;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 14), carbon);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.06, 1.05);
  nose.castShadow = true;
  cocoon.add(hull, wrap, back, keel, nose);

  const torso = new THREE.Group();
  torso.position.set(0, 0.22, 0.06);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.24, 6, 10), jacket);
  chest.position.set(0, 0.18, 0.02);
  chest.rotation.x = 0.38;
  chest.castShadow = true;
  torso.add(chest);

  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.045), webbing);
  strap.position.set(0, 0.2, 0.12);
  strap.rotation.x = 0.2;
  strap.castShadow = true;
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.032, 0.05), buckle);
  clasp.position.set(0, 0.2, 0.145);
  torso.add(strap, clasp);

  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.1);
  const headShell = new THREE.Group();
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0x1c242c,
    roughness: 0.26,
    metalness: 0.38,
    fog: false,
  });
  applyFresnelRim(helmetMat, 0xa8d2ff, 2.15, 0.62);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), helmetMat);
  helmet.scale.set(1.02, 1.08, 1.14);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0.48, 1.12),
    new THREE.MeshStandardMaterial({
      color: 0x08141c,
      roughness: 0.1,
      metalness: 0.9,
      envMapIntensity: 1.4,
      fog: false,
    }),
  );
  visor.position.set(0, 0.0, 0.028);
  visor.castShadow = true;
  headShell.add(helmet, visor);
  const eye = new THREE.Object3D();
  eye.position.set(0, 0.02, 0.13);
  head.add(headShell, eye);
  torso.add(head);

  const makeArm = (side: number): { root: THREE.Group; forearm: THREE.Group; hand: THREE.Object3D } => {
    const root = new THREE.Group();
    root.position.set(side * 0.155, 0.3, 0.05);
    root.rotation.z = side * 0.78;
    root.rotation.x = 0.18;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), jacket);
    cap.position.set(0, 0.01, 0);
    cap.castShadow = true;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.15, 5, 8), jacket);
    upper.position.y = -0.1;
    upper.castShadow = true;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), jacket);
    elbow.position.y = -0.2;
    elbow.castShadow = true;
    const forearm = new THREE.Group();
    forearm.position.set(0, -0.2, 0);
    forearm.rotation.x = -1.82;
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.13, 5, 8), jacket);
    lower.position.y = -0.1;
    lower.castShadow = true;
    const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), jacket);
    cuff.position.y = -0.19;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), flesh);
    hand.position.y = -0.23;
    hand.castShadow = true;
    const toggle = new THREE.Mesh(
      new THREE.TorusGeometry(0.028, 0.007, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xd82418, roughness: 0.35, fog: false }),
    );
    toggle.rotation.x = Math.PI / 2;
    toggle.position.y = -0.01;
    hand.add(toggle);
    forearm.add(lower, cuff, hand);
    root.add(cap, upper, elbow, forearm);
    return { root, forearm, hand };
  };
  const left = makeArm(-1);
  const right = makeArm(1);
  torso.add(left.root, right.root);

  const shoulderL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.07, 4, 8), jacket);
  shoulderL.position.set(-0.14, 0.3, 0.04);
  shoulderL.rotation.z = 0.9;
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.14;
  shoulderR.rotation.z = -0.9;
  torso.add(shoulderL, shoulderR);

  const thighL = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.2, 5, 8), pants);
  thighL.rotation.x = 1.32;
  thighL.position.set(-0.055, 0.02, 0.42);
  thighL.castShadow = true;
  const thighR = thighL.clone();
  thighR.position.x = 0.055;
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.18), skin(0x111111, 0.42, 0.12));
  bootL.position.set(-0.06, 0.0, 0.96);
  bootL.castShadow = true;
  const bootR = bootL.clone();
  bootR.position.x = 0.06;

  const legStrap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.035), webbing);
  legStrap.position.set(0, 0.08, 0.55);
  const hipBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.04), buckle);
  hipBuckle.position.set(0, 0.09, 0.57);

  const leftRiser = new THREE.Group();
  leftRiser.position.set(-0.125, 0.2, 0.05);
  const rightRiser = new THREE.Group();
  rightRiser.position.set(0.125, 0.2, 0.05);
  const carabiner = (parent: THREE.Object3D): void => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.007, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0xc5ccd2, metalness: 0.88, roughness: 0.2, fog: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.022), buckle);
    gate.position.set(0, 0.0, 0.024);
    parent.add(ring, gate);
  };
  carabiner(leftRiser);
  carabiner(rightRiser);
  const shoulderWebL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.016), webbing);
  shoulderWebL.position.set(-0.11, 0.12, 0.03);
  shoulderWebL.rotation.z = 0.28;
  const shoulderWebR = shoulderWebL.clone();
  shoulderWebR.position.x = 0.11;
  shoulderWebR.rotation.z = -0.28;
  torso.add(leftRiser, rightRiser, shoulderWebL, shoulderWebR);

  const rimFill = new THREE.PointLight(0xb8d6ff, 0.55, 2.6, 1.4);
  rimFill.position.set(0, 0.48, 0.42);
  group.add(cocoon, torso, thighL, thighR, bootL, bootR, legStrap, hipBuckle, rimFill);
  return {
    group,
    torso,
    headShell,
    eye,
    leftArm: left.root,
    rightArm: right.root,
    leftForearm: left.forearm,
    rightForearm: right.forearm,
    leftHand: left.hand,
    rightHand: right.hand,
    leftRiser,
    rightRiser,
    restTorsoX: 0,
    restArmX: 0.18,
    restForearmX: -1.82,
  };
}

export function poseGlider(
  visual: GliderVisual,
  flight: FlightState,
  steer: number,
  time: number,
  dt: number,
): void {
  const pilot = visual.root.userData.pilot as PilotRig;
  visual.root.rotation.set(flight.pitch * 0.22, flight.heading, 0);
  visual.canopy.rotation.z = damp(visual.canopy.rotation.z, -flight.bank * 0.38, 6, dt);
  visual.canopy.rotation.x = flight.pitch * 0.12;

  const lean = THREE.MathUtils.clamp(steer, -1, 1);
  const flare = flight.flare ? 1 : 0;
  const dive = THREE.MathUtils.smoothstep(flight.pitch, 0.12, 0.45);
  const restTorsoX = pilot.restTorsoX ?? 0;
  const restForearmX = pilot.restForearmX ?? -1.82;
  pilot.torso.rotation.z = damp(pilot.torso.rotation.z, lean * 0.4, 7, dt);
  pilot.torso.rotation.x = damp(pilot.torso.rotation.x, restTorsoX + dive * 0.22 - flare * 0.05, 6, dt);
  pilot.headShell.rotation.z = damp(pilot.headShell.rotation.z, lean * 0.16, 8, dt);
  const leftBrake = Math.max(0, lean) + flare;
  const rightBrake = Math.max(0, -lean) + flare;
  if (pilot.leftForearm && pilot.rightForearm) {
    pilot.leftForearm.rotation.x = damp(pilot.leftForearm.rotation.x, restForearmX + leftBrake * 0.85, 8, dt);
    pilot.rightForearm.rotation.x = damp(pilot.rightForearm.rotation.x, restForearmX + rightBrake * 0.85, 8, dt);
  } else {
    const restArmX = pilot.restArmX ?? -1.05;
    pilot.leftArm.rotation.x = damp(pilot.leftArm.rotation.x, restArmX + leftBrake * 0.85, 8, dt);
    pilot.rightArm.rotation.x = damp(pilot.rightArm.rotation.x, restArmX + rightBrake * 0.85, 8, dt);
  }

  if (!visual.root.userData.blenderCanopy) {
    deformCanopy(visual, flight, leftBrake, rightBrake, time);
  }
  updateLines(visual, pilot);
}

function prepareStudioMesh(obj: THREE.Object3D): THREE.Mesh | null {
  let first: THREE.Mesh | null = null;
  obj.traverse((child) => {
    if (child.name === 'CascadeLines') {
      child.visible = false;
      return;
    }
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) continue;
      mat.side = THREE.DoubleSide;
      mat.shadowSide = THREE.DoubleSide;
      mat.fog = false;
      if (mesh.name.toLowerCase().includes('canopy') || mesh.parent?.name === 'Canopy') {
        mat.emissive = new THREE.Color(0x3a0a12);
        mat.emissiveIntensity = 0.1;
      }
    }
    if (!first) first = mesh;
  });
  return first;
}

export async function attachStudioCanopy(visual: GliderVisual): Promise<boolean> {
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/canopy.glb');
    const src = gltf.scene.getObjectByName('Canopy') ?? gltf.scene;
    if (!prepareStudioMesh(src)) return false;
    visual.wing.visible = false;
    src.position.set(0, 0, 0);
    visual.canopy.add(src);
    visual.root.userData.blenderCanopy = true;
    return true;
  } catch {
    return false;
  }
}

export async function attachStudioPilot(_visual: GliderVisual): Promise<boolean> {
  // Live rig (sleeves, high brake hands, chest carabiners) stays procedural.
  return false;
}

export async function attachStudioAssets(visual: GliderVisual): Promise<void> {
  await attachStudioCanopy(visual);
}

function deformCanopy(
  visual: GliderVisual,
  flight: FlightState,
  leftBrake: number,
  rightBrake: number,
  time: number,
): void {
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;
  const rest = visual.root.userData.rest as Float32Array;
  const half = SPAN * 0.5;
  const ripple = flight.inThermal || flight.inDowndraft ? 0.018 : flight.speed > 18 ? 0.01 : 0;
  for (let i = 0; i < pos.count; i++) {
    const rx = rest[i * 3];
    const ry = rest[i * 3 + 1];
    const rz = rest[i * 3 + 2];
    const spanT = rx / half;
    const v = THREE.MathUtils.clamp((rz + 0.22 * CHORD) / CHORD, 0, 1);
    let y = ry - flight.bank * 0.12 * spanT * v;
    if (v > 0.68) {
      const pull = (v - 0.68) / 0.32;
      y -= leftBrake * Math.max(0, -spanT) * 0.22 * pull;
      y -= rightBrake * Math.max(0, spanT) * 0.22 * pull;
    }
    if (ripple > 0) y += Math.sin(time * 14 + rx * 2.1 + rz * 2.8) * ripple;
    pos.setXYZ(i, rx, y, rz);
  }
  pos.needsUpdate = true;
  visual.wing.geometry.computeVertexNormals();
}

function fitStrap(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  _mid.addVectors(from, to).multiplyScalar(0.5);
  _c.subVectors(to, from);
  const len = Math.max(_c.length(), 0.04);
  _c.multiplyScalar(1 / len);
  mesh.position.copy(_mid);
  mesh.scale.set(1, 1, len);
  if (_c.dot(_fwd) < -0.999) mesh.quaternion.set(0, 1, 0, 0);
  else mesh.quaternion.setFromUnitVectors(_fwd, _c);
}

function updateLines(visual: GliderVisual, pilot: PilotRig): void {
  const binds = visual.wing.userData.binds as LineBind[];
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;
  const linePos = visual.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const straps = visual.root.userData.straps as THREE.Group | undefined;
  visual.canopy.updateWorldMatrix(true, false);
  visual.root.updateWorldMatrix(true, false);
  pilot.leftRiser.updateWorldMatrix(true, true);
  pilot.rightRiser.updateWorldMatrix(true, true);
  if (pilot.leftHand) pilot.leftHand.updateWorldMatrix(true, true);
  if (pilot.rightHand) pilot.rightHand.updateWorldMatrix(true, true);

  const leftCarab = _d;
  const rightCarab = new THREE.Vector3();
  pilot.leftRiser.getWorldPosition(leftCarab);
  visual.root.worldToLocal(leftCarab);
  pilot.rightRiser.getWorldPosition(rightCarab);
  visual.root.worldToLocal(rightCarab);

  const gathers: THREE.Vector3[][] = [[], []];
  for (let g = 0; g < GALLERIES; g++) {
    const off = GATHER_LOCAL[g];
    gathers[0].push(new THREE.Vector3(leftCarab.x - 0.07, leftCarab.y + off.y, leftCarab.z + off.z));
    gathers[1].push(new THREE.Vector3(rightCarab.x + 0.07, rightCarab.y + off.y, rightCarab.z + off.z));
  }

  let seg = 0;
  for (const bind of binds) {
    _a.set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(_a);
    visual.root.worldToLocal(_a);
    if (bind.kind === 'brake' && pilot.leftHand && pilot.rightHand) {
      const hand = bind.side === 'L' ? pilot.leftHand : pilot.rightHand;
      hand.getWorldPosition(_b);
      visual.root.worldToLocal(_b);
    } else {
      const sideIdx = bind.side === 'L' ? 0 : 1;
      _b.copy(gathers[sideIdx][bind.gallery] ?? gathers[sideIdx][0]);
    }
    linePos.setXYZ(seg * 2, _a.x, _a.y, _a.z);
    linePos.setXYZ(seg * 2 + 1, _b.x, _b.y, _b.z);
    seg += 1;
  }
  linePos.needsUpdate = true;

  if (straps) {
    for (let side = 0; side < 2; side++) {
      const carab = side === 0 ? leftCarab : rightCarab;
      for (let g = 0; g < GALLERIES; g++) {
        const strap = straps.children[side * GALLERIES + g];
        if (strap) fitStrap(strap, gathers[side][g], carab);
      }
    }
  }
}
