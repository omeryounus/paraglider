import * as THREE from 'three';
import type { FlightState } from '../game/types';
import { damp } from '../game/math';

const SPAN = 9.2;
const CHORD = 2.55;
const SEGS_X = 48;
const SEGS_Z = 16;
const CANOPY_Y = 3.15;

export interface GliderVisual {
  root: THREE.Group;
  canopy: THREE.Group;
  wing: THREE.Mesh;
  eye: THREE.Object3D;
  helmet: THREE.Object3D;
  lines: THREE.LineSegments;
}

interface PilotRig {
  group: THREE.Group;
  torso: THREE.Group;
  headShell: THREE.Group;
  eye: THREE.Object3D;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftRiser: THREE.Object3D;
  rightRiser: THREE.Object3D;
}

interface LineBind {
  vert: number;
  side: 'L' | 'R';
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.position.y = CANOPY_Y;
  const { geometry, binds } = createAirfoil();
  const wing = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xe63946,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.04,
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
  wing.material.shadowSide = THREE.FrontSide;
  wing.userData.binds = binds;
  canopy.add(wing);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binds.length * 6), 3));
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: 0x111111,
      linewidth: 1,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
    }),
  );
  lines.frustumCulled = false;
  lines.name = 'Suspension';

  const pilot = createPilot();
  root.add(canopy, pilot.group, lines);
  root.userData.pilot = pilot;
  root.userData.rest = (geometry.getAttribute('rest') as THREE.BufferAttribute).array as Float32Array;

  return { root, canopy, wing, eye: pilot.eye, helmet: pilot.headShell, lines };
}

function panelColor(u: number, dest: number[]): void {
  const band = Math.floor(u * 6);
  if (band === 0 || band === 5) dest.push(0.06, 0.09, 0.2);
  else if (band === 1 || band === 4) dest.push(0.98, 0.55, 0.16);
  else dest.push(0.902, 0.224, 0.275);
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
    indices.push(tt0, tt1, bb0, tt1, bb1, bb0);
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(pos.slice(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  refreshAirfoilNormals(geo, cols, rows);

  const binds: LineBind[] = [];
  const rowsV = [0.16, 0.38, 0.6, 0.8];
  const stations = [0.08, 0.16, 0.24, 0.32, 0.4, 0.6, 0.68, 0.76, 0.84, 0.92];
  for (const tv of rowsV) {
    const j = Math.round(tv * SEGS_Z);
    for (const u of stations) {
      const i = Math.round(u * SEGS_X);
      binds.push({ vert: botOff + j * cols + i, side: u < 0.5 ? 'L' : 'R' });
    }
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

function createPilot(): PilotRig {
  const group = new THREE.Group();
  const jacket = skin(0x222222, 0.72);
  const pants = skin(0x1a1a1a, 0.76);
  const flesh = skin(0xc68642, 0.55);

  const podGeo = new THREE.SphereGeometry(0.34, 14, 12);
  podGeo.scale(0.78, 0.55, 1.55);
  const pod = new THREE.Mesh(
    podGeo,
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.48,
      metalness: 0.12,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
    }),
  );
  pod.position.set(0, 0.12, 0.28);
  pod.rotation.x = 0.18;
  pod.castShadow = true;

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 10),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.45,
      metalness: 0.14,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
    }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.06, 0.82);
  nose.castShadow = true;

  const torso = new THREE.Group();
  torso.position.set(0, 0.28, 0.05);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 4, 8), jacket);
  chest.position.set(0, 0.16, 0);
  chest.rotation.x = 0.35;
  chest.castShadow = true;
  torso.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.12);
  const headShell = new THREE.Group();
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0x2a2a2e,
      roughness: 0.38,
      metalness: 0.16,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      fog: false,
    }),
  );
  helmet.scale.set(1, 1.06, 1.1);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.108, 14, 10, 0, Math.PI * 2, 0.55, 1.05),
    new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.1,
      metalness: 0.9,
      transparent: false,
      opacity: 1,
      depthWrite: true,
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

  const makeArm = (side: number): THREE.Group => {
    const root = new THREE.Group();
    root.position.set(side * 0.18, 0.28, 0.02);
    root.rotation.z = side * 0.35;
    root.rotation.x = -1.05;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.2, 3, 6), jacket);
    upper.position.y = -0.13;
    upper.castShadow = true;
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 3, 6), jacket);
    lower.position.y = -0.36;
    lower.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), flesh);
    hand.position.y = -0.5;
    hand.castShadow = true;
    const toggle = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.007, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xd82418, roughness: 0.35 }),
    );
    toggle.rotation.x = Math.PI / 2;
    hand.add(toggle);
    root.add(upper, lower, hand);
    return root;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  torso.add(leftArm, rightArm);

  const boots = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 3, 6), pants);
  boots.rotation.x = 1.2;
  boots.position.set(0, 0.02, 0.62);
  boots.castShadow = true;
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), skin(0x111111, 0.5));
  bootL.position.set(-0.06, -0.02, 0.86);
  bootL.castShadow = true;
  const bootR = bootL.clone();
  bootR.position.x = 0.06;

  const leftRiser = new THREE.Object3D();
  leftRiser.position.set(-0.35, 0.58, 0);
  const rightRiser = new THREE.Object3D();
  rightRiser.position.set(0.35, 0.58, 0);
  const carabiner = (): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.007, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xc5ccd2, metalness: 0.85, roughness: 0.22 }),
    );
    mesh.castShadow = true;
    return mesh;
  };
  leftRiser.add(carabiner());
  rightRiser.add(carabiner());
  group.add(leftRiser, rightRiser);

  group.add(pod, nose, torso, boots, bootL, bootR);
  return {
    group,
    torso,
    headShell,
    eye,
    leftArm,
    rightArm,
    leftRiser,
    rightRiser,
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
  pilot.torso.rotation.z = damp(pilot.torso.rotation.z, lean * 0.28, 7, dt);
  pilot.torso.rotation.x = damp(pilot.torso.rotation.x, dive * 0.28 - flare * 0.06, 6, dt);
  const leftBrake = Math.max(0, lean) + flare;
  const rightBrake = Math.max(0, -lean) + flare;
  pilot.leftArm.rotation.x = damp(pilot.leftArm.rotation.x, -1.05 + leftBrake * 0.85, 8, dt);
  pilot.rightArm.rotation.x = damp(pilot.rightArm.rotation.x, -1.05 + rightBrake * 0.85, 8, dt);

  deformCanopy(visual, flight, leftBrake, rightBrake, time);
  updateLines(visual, pilot);
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
  refreshAirfoilNormals(visual.wing.geometry, SEGS_X + 1, SEGS_Z + 1);
}

function refreshAirfoilNormals(geo: THREE.BufferGeometry, cols: number, rows: number): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  let nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!nrm || nrm.count !== pos.count) {
    nrm = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('normal', nrm);
  }
  const sample = (i: number, dest: THREE.Vector3): THREE.Vector3 =>
    dest.set(pos.getX(i), pos.getY(i), pos.getZ(i));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  const writeSheet = (off: number, flip: boolean): void => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const i0 = off + j * cols + i;
        const il = off + j * cols + Math.max(0, i - 1);
        const ir = off + j * cols + Math.min(cols - 1, i + 1);
        const jd = off + Math.max(0, j - 1) * cols + i;
        const ju = off + Math.min(rows - 1, j + 1) * cols + i;
        sample(ir, a).sub(sample(il, b));
        sample(ju, c).sub(sample(jd, d));
        n.crossVectors(a, c);
        if (flip) n.negate();
        if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
        else n.normalize();
        nrm.setXYZ(i0, n.x, n.y, n.z);
      }
    }
  };
  writeSheet(0, false);
  writeSheet(cols * rows, true);
  nrm.needsUpdate = true;
}

function updateLines(visual: GliderVisual, pilot: PilotRig): void {
  const binds = visual.wing.userData.binds as LineBind[];
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;
  const linePos = visual.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  visual.canopy.updateWorldMatrix(true, false);
  visual.root.updateWorldMatrix(true, false);
  pilot.leftRiser.updateWorldMatrix(true, true);
  pilot.rightRiser.updateWorldMatrix(true, true);

  for (let i = 0; i < binds.length; i++) {
    const bind = binds[i];
    _a.set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(_a);
    visual.root.worldToLocal(_a);
    const riser = bind.side === 'L' ? pilot.leftRiser : pilot.rightRiser;
    riser.getWorldPosition(_b);
    visual.root.worldToLocal(_b);
    linePos.setXYZ(i * 2, _a.x, _a.y, _a.z);
    linePos.setXYZ(i * 2 + 1, _b.x, _b.y, _b.z);
  }
  linePos.needsUpdate = true;
}
