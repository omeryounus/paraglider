import * as THREE from 'three';
import type { FlightState } from '../game/types';
import { damp } from '../game/math';

const SPAN = 9.4;
const CHORD = 2.85;
const SEGS_X = 28;
const SEGS_Z = 10;
const CANOPY_Y = 2.72;
const CELLS = 14;

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
  helmet: THREE.Object3D;
  headShell: THREE.Group;
  eye: THREE.Object3D;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftRiser: THREE.Object3D;
  rightRiser: THREE.Object3D;
}

interface LineBind {
  vert: number;
  side: 'L' | 'R';
  brake?: boolean;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.position.y = CANOPY_Y;
  const { geometry, binds } = createRamAirGeometry();
  const fabric = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.05,
    sheen: 0.85,
    sheenRoughness: 0.62,
    sheenColor: new THREE.Color(0xffe8d2),
    transmission: 0.025,
    thickness: 0.03,
    transparent: false,
    depthWrite: true,
  });
  const wing = new THREE.Mesh(geometry, fabric);
  wing.castShadow = true;
  wing.receiveShadow = true;
  wing.userData.binds = binds;
  canopy.add(wing);
  canopy.add(createCellRibs());
  canopy.add(createIntakes());

  const lineGeo = new THREE.BufferGeometry();
  const lineCount = binds.length;
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineCount * 6), 3));
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: 0xd9d4cb,
      transparent: true,
      opacity: 0.78,
    }),
  );
  lines.frustumCulled = false;
  canopy.add(lines);

  const pilot = createPilot();
  root.add(canopy, pilot.group);
  root.userData.pilot = pilot;
  root.userData.rest = (geometry.getAttribute('rest') as THREE.BufferAttribute).array as Float32Array;

  return { root, canopy, wing, eye: pilot.eye, helmet: pilot.headShell, lines };
}

function stripeColor(u: number, v: number, out: number[]): void {
  const cell = Math.floor(u * CELLS);
  const leading = v < 0.12;
  if (leading) {
    out.push(0.97, 0.97, 0.96);
    return;
  }
  const band = cell % 4;
  if (band === 0) out.push(1.0, 0.38, 0.08);
  else if (band === 1) out.push(0.97, 0.97, 0.95);
  else if (band === 2) out.push(0.08, 0.78, 0.88);
  else out.push(0.08, 0.16, 0.28);
}

function canopyPoint(u: number, v: number, surface: 'top' | 'bot'): THREE.Vector3 {
  const taper = 1 - 0.22 * Math.abs(u - 0.5) ** 2.2 * 4;
  const x = (u - 0.5) * SPAN;
  const z = (v - 0.16) * CHORD * taper;
  const camber = Math.sin(Math.PI * Math.min(1, v * 1.02)) * 0.5 * taper;
  const thick = Math.sin(Math.PI * v) * 0.13 * taper;
  const arc = (Math.abs(u - 0.5) * 2) ** 1.85 * 1.05;
  const y = (surface === 'top' ? camber + thick * 0.55 : camber - thick * 0.7) - arc;
  return _p.set(x, y, z).clone();
}

function createRamAirGeometry(): { geometry: THREE.BufferGeometry; binds: LineBind[] } {
  const cols = SEGS_X + 1;
  const rows = SEGS_Z + 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushGrid = (surface: 'top' | 'bot'): void => {
    for (let j = 0; j < rows; j++) {
      const v = j / SEGS_Z;
      for (let i = 0; i < cols; i++) {
        const u = i / SEGS_X;
        const p = canopyPoint(u, v, surface);
        positions.push(p.x, p.y, p.z);
        uvs.push(u, v);
        stripeColor(u, v, colors);
      }
    }
  };
  pushGrid('top');
  pushGrid('bot');

  const topOff = 0;
  const botOff = cols * rows;
  const quad = (off: number, i: number, j: number, flip: boolean): void => {
    const a = off + j * cols + i;
    const b = a + 1;
    const c = a + cols;
    const d = c + 1;
    if (flip) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  };
  for (let j = 0; j < SEGS_Z; j++) {
    for (let i = 0; i < SEGS_X; i++) {
      quad(topOff, i, j, false);
      quad(botOff, i, j, true);
    }
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
  const tiers = [0.2, 0.48, 0.76];
  for (const tv of tiers) {
    const j = Math.round(tv * SEGS_Z);
    for (let k = 1; k < 10; k++) {
      const i = Math.round((k / 10) * SEGS_X);
      const u = i / SEGS_X;
      binds.push({ vert: topOff + j * cols + i, side: u < 0.5 ? 'L' : 'R' });
    }
  }
  binds.push({ vert: topOff + SEGS_Z * cols + 3, side: 'L', brake: true });
  binds.push({ vert: topOff + SEGS_Z * cols + (SEGS_X - 3), side: 'R', brake: true });
  return { geometry: geo, binds };
}

function createCellRibs(): THREE.LineSegments {
  const pts: number[] = [];
  for (let c = 1; c < CELLS; c++) {
    const u = c / CELLS;
    for (let s = 0; s < 8; s++) {
      const v0 = s / 8;
      const v1 = (s + 1) / 8;
      const a = canopyPoint(u, v0, 'top');
      const b = canopyPoint(u, v1, 'top');
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0x1a1a1c, transparent: true, opacity: 0.28 }),
  );
}

function createIntakes(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf2f0ea,
    roughness: 0.8,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  for (let c = 0; c < CELLS; c++) {
    const u0 = c / CELLS;
    const u1 = (c + 1) / CELLS;
    const a = canopyPoint((u0 + u1) * 0.5, 0.02, 'top');
    const b = canopyPoint((u0 + u1) * 0.5, 0.02, 'bot');
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SPAN / CELLS * 0.72, 0.035, 0.12), mat);
    frame.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    frame.castShadow = true;
    group.add(frame);
  }
  return group;
}

function skin(color: number, rough = 0.72): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 });
}

function cap(r: number, h: number, mat: THREE.Material, radial = 6): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 3, radial), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPilot(): PilotRig {
  const group = new THREE.Group();
  const jacket = skin(0x1c3144, 0.78);
  const pants = skin(0x1a1e24, 0.82);
  const skinTone = skin(0xc68642, 0.55);
  const boot = skin(0x141414, 0.5);

  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.08, 0.08);
  const pod = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26, 0.62, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.45, metalness: 0.12 }),
  );
  pod.rotation.x = 0.95;
  pod.position.set(0, 0.02, 0.22);
  pod.castShadow = true;
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.12, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.55 }),
  );
  seat.position.set(0, -0.02, 0.08);
  seat.castShadow = true;

  const torso = new THREE.Group();
  torso.position.set(0, 0.22, 0.02);
  const chest = cap(0.18, 0.34, jacket, 7);
  chest.position.y = 0.2;
  chest.rotation.x = 0.18;
  torso.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.1);
  const skull = cap(0.1, 0.06, skinTone, 8);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35, metalness: 0.08 }),
  );
  helmet.scale.set(1, 1.08, 1.12);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.112, 12, 10, 0, Math.PI * 2, 0.45, 1.15),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a1a22,
      metalness: 0.95,
      roughness: 0.1,
      transparent: true,
      opacity: 0.72,
      reflectivity: 1,
    }),
  );
  visor.position.set(0, 0.01, 0.03);
  visor.castShadow = true;
  const headShell = new THREE.Group();
  headShell.add(skull, helmet, visor);
  const eye = new THREE.Object3D();
  eye.position.set(0, 0.02, 0.12);
  head.add(headShell, eye);

  const makeArm = (side: number): { root: THREE.Group; hand: THREE.Object3D } => {
    const root = new THREE.Group();
    root.position.set(side * 0.2, 0.32, 0.04);
    root.rotation.z = side * 0.55;
    root.rotation.x = -0.85;
    const upper = cap(0.045, 0.22, jacket, 6);
    upper.position.y = -0.14;
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    const lower = cap(0.038, 0.2, jacket, 6);
    lower.position.y = -0.12;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), skin(0x2a2118, 0.7));
    hand.position.y = -0.26;
    hand.castShadow = true;
    const toggle = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.008, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xe23b18, roughness: 0.4 }),
    );
    toggle.rotation.x = Math.PI / 2;
    hand.add(toggle);
    elbow.add(lower, hand);
    root.add(upper, elbow);
    return { root, hand };
  };
  const left = makeArm(-1);
  const right = makeArm(1);

  const makeLeg = (side: number): THREE.Group => {
    const root = new THREE.Group();
    root.position.set(side * 0.1, -0.02, 0.05);
    root.rotation.x = 1.05;
    const thigh = cap(0.065, 0.28, pants, 6);
    thigh.position.y = -0.16;
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    knee.rotation.x = 0.15;
    const shin = cap(0.05, 0.26, pants, 6);
    shin.position.y = -0.15;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.18), boot);
    foot.position.set(0, -0.32, 0.04);
    foot.castShadow = true;
    knee.add(shin, foot);
    root.add(thigh, knee);
    return root;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  const leftRiser = new THREE.Object3D();
  leftRiser.position.set(-0.09, 0.42, 0.02);
  const rightRiser = new THREE.Object3D();
  rightRiser.position.set(0.09, 0.42, 0.02);
  const carab = new THREE.Mesh(
    new THREE.TorusGeometry(0.028, 0.006, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xc0c6cc, metalness: 0.85, roughness: 0.25 }),
  );
  const carabR = carab.clone();
  leftRiser.add(carab);
  rightRiser.add(carabR);

  torso.add(head, left.root, right.root, leftRiser, rightRiser);
  pelvis.add(pod, seat, torso, leftLeg, rightLeg);
  group.add(pelvis);

  return {
    group,
    torso,
    helmet,
    headShell,
    eye,
    leftArm: left.root,
    rightArm: right.root,
    leftHand: left.hand,
    rightHand: right.hand,
    leftLeg,
    rightLeg,
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
  visual.root.rotation.set(flight.pitch * 0.28, flight.heading, 0);
  visual.canopy.rotation.z = damp(visual.canopy.rotation.z, -flight.bank * 0.42, 6, dt);
  visual.canopy.rotation.x = flight.pitch * 0.22 + Math.sin(time * 1.6) * 0.01;

  const lean = THREE.MathUtils.clamp(steer, -1, 1);
  const leftBrake = Math.max(0, lean) + (flight.flare ? 1 : 0);
  const rightBrake = Math.max(0, -lean) + (flight.flare ? 1 : 0);
  const dive = THREE.MathUtils.smoothstep(flight.pitch, 0.12, 0.45);
  const flare = flight.flare ? 1 : 0;

  const torsoZ = lean * 0.32;
  const torsoX = dive * 0.42 - flare * 0.08;
  pilot.torso.rotation.z = damp(pilot.torso.rotation.z, torsoZ, 7, dt);
  pilot.torso.rotation.x = damp(pilot.torso.rotation.x, torsoX, 6, dt);
  pilot.group.rotation.z = damp(pilot.group.rotation.z, lean * 0.12, 6, dt);

  const armDown = (brake: number, diveAmt: number) => -0.85 + brake * 1.15 + diveAmt * 0.35;
  pilot.leftArm.rotation.x = damp(pilot.leftArm.rotation.x, armDown(leftBrake, dive), 8, dt);
  pilot.rightArm.rotation.x = damp(pilot.rightArm.rotation.x, armDown(rightBrake, dive), 8, dt);
  const armOut = 0.55 - flare * 0.12;
  pilot.leftArm.rotation.z = damp(pilot.leftArm.rotation.z, -armOut, 6, dt);
  pilot.rightArm.rotation.z = damp(pilot.rightArm.rotation.z, armOut, 6, dt);

  const legPitch = 1.05 - flare * 0.85 + dive * 0.2;
  pilot.leftLeg.rotation.x = damp(pilot.leftLeg.rotation.x, legPitch, 6, dt);
  pilot.rightLeg.rotation.x = damp(pilot.rightLeg.rotation.x, legPitch, 6, dt);

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
  const ripple =
    (flight.inThermal || flight.inDowndraft ? 0.055 : 0) +
    (flight.speed > 18 ? 0.03 : 0) +
    (flight.boosting ? 0.02 : 0);
  const half = SPAN * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const rx = rest[i * 3];
    const ry = rest[i * 3 + 1];
    const rz = rest[i * 3 + 2];
    const spanT = rx / half;
    const v = THREE.MathUtils.clamp((rz + 0.16 * CHORD) / CHORD, 0, 1);
    let y = ry;
    y += -flight.bank * 0.22 * spanT * (0.35 + v * 0.75);
    if (v > 0.62) {
      const pull = (v - 0.62) / 0.38;
      y -= leftBrake * Math.max(0, -spanT) * 0.55 * pull;
      y -= rightBrake * Math.max(0, spanT) * 0.55 * pull;
    }
    if (ripple > 0) {
      y += Math.sin(time * 17 + rx * 2.4 + rz * 3.1) * ripple;
      y += Math.sin(time * 11 + rx * 1.3) * ripple * 0.45;
    }
    const load = 1 + Math.min(0.08, flight.speed * 0.002);
    pos.setXYZ(i, rx * load, y, rz);
  }
  pos.needsUpdate = true;
  visual.wing.geometry.computeVertexNormals();
}

function updateLines(visual: GliderVisual, pilot: PilotRig): void {
  const binds = visual.wing.userData.binds as LineBind[];
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;
  const linePos = visual.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  visual.canopy.updateWorldMatrix(true, false);
  pilot.leftRiser.updateWorldMatrix(true, true);
  pilot.rightRiser.updateWorldMatrix(true, true);
  pilot.leftHand.updateWorldMatrix(true, true);
  pilot.rightHand.updateWorldMatrix(true, true);

  for (let i = 0; i < binds.length; i++) {
    const bind = binds[i];
    _p.set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(_p);
    visual.root.worldToLocal(_p);
    const target = bind.brake
      ? bind.side === 'L'
        ? pilot.leftHand
        : pilot.rightHand
      : bind.side === 'L'
        ? pilot.leftRiser
        : pilot.rightRiser;
    target.getWorldPosition(_q);
    visual.root.worldToLocal(_q);
    linePos.setXYZ(i * 2, _p.x, _p.y, _p.z);
    linePos.setXYZ(i * 2 + 1, _q.x, _q.y, _q.z);
  }
  linePos.needsUpdate = true;
}
