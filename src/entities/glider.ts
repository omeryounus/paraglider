import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CANOPY_Y,
  CHORD,
  SEGS_X,
  SEGS_Z,
  SPAN,
} from '../config/constants';
import { damp } from '../game/math';
import type { FlightState } from '../game/types';

export interface GliderVisual {
  root: THREE.Group;
  canopy: THREE.Group;
  wing: THREE.Mesh;
  lines: THREE.LineSegments;
  brakeLines: THREE.LineSegments;
  pilotGroup: THREE.Group;
  helmet: THREE.Object3D;
  eye: THREE.Object3D;
  leftRiser: THREE.Object3D;
  rightRiser: THREE.Object3D;
  leftToggle: THREE.Object3D;
  rightToggle: THREE.Object3D;
}

export interface PilotRig {
  group: THREE.Group;
  torso: THREE.Group;
  headShell: THREE.Group;
  eye: THREE.Object3D;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
  leftToggle: THREE.Object3D;
  rightToggle: THREE.Object3D;
  legs: THREE.Group;
  leftRiser: THREE.Object3D;
  rightRiser: THREE.Object3D;
  restTorsoX: number;
  restArmX: number;
}

interface LineBind {
  vert: number;
  side: 'L' | 'R';
  type: 'A' | 'B' | 'C' | 'D' | 'brake';
  spanT: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.name = 'Canopy';
  canopy.position.y = CANOPY_Y;

  // 1. Aerodynamic Ram-Air Canopy Mesh with NACA Camber & Open Intakes
  const { geometry, binds, brakeBinds } = createAirfoil();

  // Translucent ruby fabric material with sun backlight effect
  const wingMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.03,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    fog: true,
  });

  // Shader enhancement for sun backlight transmission through ripstop nylon
  wingMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // Warm golden sun backlight transmission on underside of wing
      vec3 lightDir = normalize(vec3(0.3, 0.8, 0.5));
      float sunBacklight = max(0.0, dot(normalize(-vNormal), lightDir));
      gl_FragColor.rgb += vec3(0.85, 0.28, 0.05) * sunBacklight * 0.35;
      `
    );
  };

  const wing = new THREE.Mesh(geometry, wingMat);
  wing.name = 'Wing';
  wing.castShadow = true;
  wing.receiveShadow = true;
  canopy.add(wing);

  // 2. Rib Seam Tapes (High-definition dark cell partition seams)
  const ribMesh = createRibTapes();
  canopy.add(ribMesh);

  // 3. Open Seated Pilot Rig (Classic seated harness with dangling boots and raised arms)
  const pilot = createPilot();
  root.add(pilot.group);
  root.add(canopy);

  // 4. Cascade Suspension Lines (A, B, C, D Lines)
  const lineCount = binds.length;
  const linePos = new Float32Array(lineCount * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x14181c,
    linewidth: 1,
    transparent: true,
    opacity: 0.88,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'Suspension';
  root.add(lines);

  // 5. Dynamic High-Vis Brake Lines (Connected directly from trailing edge down into pilot hands)
  const brakeCount = brakeBinds.length;
  const brakeLinePos = new Float32Array(brakeCount * 2 * 3);
  const brakeLineGeo = new THREE.BufferGeometry();
  brakeLineGeo.setAttribute('position', new THREE.BufferAttribute(brakeLinePos, 3));
  const brakeLineMat = new THREE.LineBasicMaterial({
    color: 0xd82418,
    linewidth: 1.5,
    transparent: true,
    opacity: 0.95,
  });
  const brakeLines = new THREE.LineSegments(brakeLineGeo, brakeLineMat);
  brakeLines.name = 'BrakeLines';
  root.add(brakeLines);

  // Cache rest position for cloth deformation
  const restPos = geometry.getAttribute('position').array.slice(0);
  root.userData = {
    pilot,
    binds,
    brakeBinds,
    rest: restPos,
  };

  return {
    root,
    canopy,
    wing,
    lines,
    brakeLines,
    pilotGroup: pilot.group,
    helmet: pilot.headShell,
    eye: pilot.eye,
    leftRiser: pilot.leftRiser,
    rightRiser: pilot.rightRiser,
    leftToggle: pilot.leftToggle,
    rightToggle: pilot.rightToggle,
  };
}

function panelColor(u: number, v: number, dest: number[]): void {
  // Rich Radiant Ruby Red canopy with deep wine tip shading matching reference image
  const s = Math.abs((u - 0.5) * 2); // 0 (center) to 1 (tips)
  const isStripe = v > 0.38 && v < 0.44;

  if (isStripe && s < 0.75) {
    dest.push(0.96, 0.94, 0.95); // White leading accent band
  } else if (s > 0.94) {
    dest.push(0.55, 0.02, 0.06); // Dark wine tips
  } else if (s > 0.88) {
    dest.push(0.72, 0.035, 0.09);
  } else {
    dest.push(0.86, 0.05, 0.12); // Radiant ruby core
  }
}

function airfoilAt(u: number, v: number, surface: 'top' | 'bot'): { x: number; y: number; z: number } {
  const s = (u - 0.5) * 2; // -1 to 1
  const plan = Math.sqrt(Math.max(0.04, 1 - s * s * 0.95));
  const localChord = CHORD * (0.45 + 0.55 * plan);
  const x = s * (SPAN * 0.5);

  // Trailing edge is at +Z, leading edge is at -Z (aligned with flight direction towards +Z)
  const z = (v - 0.22) * localChord;

  // Aerodynamic NACA-style camber & thickness curve
  const camber = Math.sin(Math.PI * v) * 0.24 * plan;
  const thick = Math.sin(Math.PI * Math.pow(v, 0.65)) * 0.08 * plan;

  // Anhedral parabolic arc (center is highest, tips curve down)
  const arc = s * s * 1.35;
  const y = camber + (surface === 'top' ? thick : -thick * 0.75) - arc;

  return { x, y, z };
}

function createAirfoil(): {
  geometry: THREE.BufferGeometry;
  binds: LineBind[];
  brakeBinds: LineBind[];
} {
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
        panelColor(u, v, colors);
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

  // Close leading edge and trailing edge seams
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

  // Add side caps / wingtip stabilizer ears
  for (const side of [0, SEGS_X]) {
    for (let j = 0; j < SEGS_Z; j++) {
      const t0 = topOff + j * cols + side;
      const t1 = topOff + (j + 1) * cols + side;
      const b0 = botOff + j * cols + side;
      const b1 = botOff + (j + 1) * cols + side;
      if (side === 0) {
        indices.push(t0, b0, t1, t1, b0, b1);
      } else {
        indices.push(t0, t1, b0, b0, t1, b1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // 6. Generate Attachment Anchor Binds (A, B, C, D lines + Trailing Edge Brake Fan)
  const binds: LineBind[] = [];
  const brakeBinds: LineBind[] = [];

  // Span stations across both left and right wings
  const ribIndices = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  for (const i of ribIndices) {
    const u = i / SEGS_X;
    const side = u < 0.5 ? 'L' : 'R';
    const spanT = (u - 0.5) * 2;

    // Line stations along bottom chord:
    // A-lines (Leading edge 12%), B-lines (32%), C-lines (55%), D-lines (78%)
    const chordStations: Array<{ vIdx: number; type: LineBind['type'] }> = [
      { vIdx: Math.round(SEGS_Z * 0.12), type: 'A' },
      { vIdx: Math.round(SEGS_Z * 0.32), type: 'B' },
      { vIdx: Math.round(SEGS_Z * 0.55), type: 'C' },
      { vIdx: Math.round(SEGS_Z * 0.78), type: 'D' },
    ];

    for (const st of chordStations) {
      const vert = botOff + st.vIdx * cols + i;
      binds.push({ vert, side, type: st.type, spanT });
    }

    // Trailing edge brake line fans (98% chord)
    if (Math.abs(spanT) > 0.18) {
      const brakeVert = botOff + (SEGS_Z - 1) * cols + i;
      brakeBinds.push({ vert: brakeVert, side, type: 'brake', spanT });
    }
  }

  return { geometry, binds, brakeBinds };
}

function createRibTapes(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'RibTapes';
  const ribMat = new THREE.MeshBasicMaterial({
    color: 0x180406,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });

  for (let i = 1; i < SEGS_X; i++) {
    const u = i / SEGS_X;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= SEGS_Z; j++) {
      const v = j / SEGS_Z;
      const top = airfoilAt(u, v, 'top');
      pts.push(new THREE.Vector3(top.x, top.y, top.z));
    }
    for (let j = SEGS_Z; j >= 0; j--) {
      const v = j / SEGS_Z;
      const bot = airfoilAt(u, v, 'bot');
      pts.push(new THREE.Vector3(bot.x, bot.y, bot.z));
    }
    const ribGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(ribGeo, ribMat);
    group.add(line);
  }
  return group;
}

function skin(color: number, rough = 0.65, metal = 0.06): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    fog: true,
  });
}

function createPilot(): PilotRig {
  const group = new THREE.Group();
  group.name = 'Pilot';

  const jacket = skin(0x181e26, 0.65, 0.08);
  const pants = skin(0x12151a, 0.72, 0.05);
  const flesh = skin(0xd49b6a, 0.55);
  const harnessMat = new THREE.MeshStandardMaterial({
    color: 0x15181e,
    roughness: 0.42,
    metalness: 0.22,
    fog: true,
  });
  const bootMat = skin(0x0e1012, 0.4, 0.2);

  const harness = new THREE.Group();
  harness.name = 'Harness';
  const harnessBucket = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), harnessMat);
  harnessBucket.name = 'HarnessBucket';
  harnessBucket.scale.set(0.82, 0.88, 0.74);
  harnessBucket.position.set(0, 0.06, 0.06);
  harnessBucket.castShadow = true;

  const seatBottom = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.42), harnessMat);
  seatBottom.name = 'SeatPlate';
  seatBottom.position.set(0, -0.04, 0.12);
  seatBottom.castShadow = true;
  harness.add(harnessBucket, seatBottom);

  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 0.18, 0.04);
  torso.rotation.x = 0.22;

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 4, 8), jacket);
  chest.name = 'Chest';
  chest.position.set(0, 0.16, 0.02);
  chest.castShadow = true;

  const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.08), skin(0xba2222, 0.4));
  chestStrap.name = 'ChestStrap';
  chestStrap.position.set(0, 0.18, 0.08);
  torso.add(chest, chestStrap);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.42, 0.08);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.04, 4, 8), flesh);
  neck.name = 'Neck';
  neck.position.set(0, -0.04, 0.01);
  neck.castShadow = true;
  head.add(neck);
  const headShell = new THREE.Group();
  headShell.name = 'HeadShell';

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.22,
      metalness: 0.45,
      fog: true,
    }),
  );
  helmet.name = 'Helmet';
  helmet.scale.set(1.02, 1.12, 1.14);
  helmet.castShadow = true;

  // Dark Mirrored Visor
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.118, 18, 14, 0, Math.PI * 2, 0.46, 1.15),
    new THREE.MeshStandardMaterial({
      color: 0x050c14,
      roughness: 0.06,
      metalness: 0.96,
      fog: true,
    }),
  );
  visor.position.set(0, 0.0, 0.035);
  visor.castShadow = true;
  headShell.add(helmet, visor);

  const eye = new THREE.Object3D();
  eye.position.set(0, 0.02, 0.14);
  head.add(headShell, eye);
  torso.add(head);

  // --- 4. Arms Raised Holding Red Brake Toggles Up at Ear Level ---
  const makeArm = (side: number): {
    armRoot: THREE.Group;
    hand: THREE.Mesh;
    toggle: THREE.Object3D;
  } => {
    const tag = side < 0 ? 'Left' : 'Right';
    const armRoot = new THREE.Group();
    armRoot.name = `${tag}Arm`;
    armRoot.position.set(side * 0.18, 0.26, 0.04);
    armRoot.rotation.z = side * 0.42;
    armRoot.rotation.x = 0.45;

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.20, 3, 6), jacket);
    upper.name = `${tag}UpperArm`;
    upper.position.set(0, 0.10, 0.08);
    upper.castShadow = true;

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 3, 6), jacket);
    lower.name = `${tag}Forearm`;
    lower.position.set(0, 0.22, 0.22);
    lower.castShadow = true;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), flesh);
    hand.name = `${tag}Hand`;
    hand.position.set(0, 0.28, 0.32);
    hand.castShadow = true;

    // High-vis Red Brake Toggle Ring
    const toggle = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.009, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xd82418, roughness: 0.28 }),
    );
    toggle.rotation.x = Math.PI / 2;
    hand.add(toggle);

    armRoot.add(upper, lower, hand);
    return { armRoot, hand, toggle };
  };

  const leftArmData = makeArm(-1);
  const rightArmData = makeArm(1);
  torso.add(leftArmData.armRoot, rightArmData.armRoot);

  // --- 5. Open Seated Legs (Thighs forward, knees bent ~60°, boots dangling in open air) ---
  const legs = new THREE.Group();
  legs.position.set(0, 0, 0);

  const makeLeg = (side: number): THREE.Group => {
    const tag = side < 0 ? 'Left' : 'Right';
    const legRoot = new THREE.Group();
    legRoot.name = `${tag}Leg`;
    legRoot.position.set(side * 0.11, 0.02, 0.12);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.26, 4, 8), pants);
    thigh.name = `${tag}Thigh`;
    thigh.rotation.x = 0.52;
    thigh.position.set(0, 0.04, 0.08);
    thigh.castShadow = true;

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.24, 4, 8), pants);
    shin.name = `${tag}Shin`;
    shin.rotation.x = -1.05;
    shin.position.set(0, -0.14, 0.22);
    shin.castShadow = true;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.18), bootMat);
    boot.name = `${tag}Foot`;
    boot.position.set(0, -0.28, 0.28);
    boot.rotation.x = 0.2;
    boot.castShadow = true;

    legRoot.add(thigh, shin, boot);
    return legRoot;
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  legs.add(legL, legR);

  const leftRiser = new THREE.Object3D();
  leftRiser.name = 'LeftRiser';
  leftRiser.position.set(-0.16, 0.22, 0.08);
  const rightRiser = new THREE.Object3D();
  rightRiser.name = 'RightRiser';
  rightRiser.position.set(0.16, 0.22, 0.08);
  harness.add(leftRiser, rightRiser);

  group.add(harness, torso, legs);

  return {
    group,
    torso,
    headShell,
    eye,
    leftArm: leftArmData.armRoot,
    rightArm: rightArmData.armRoot,
    leftHand: leftArmData.hand,
    rightHand: rightArmData.hand,
    leftToggle: leftArmData.toggle,
    rightToggle: rightArmData.toggle,
    legs,
    leftRiser,
    rightRiser,
    restTorsoX: 0.22,
    restArmX: 0.45,
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

  // 1. Overall Flight Orientation (Pitch + Heading)
  visual.root.rotation.set(flight.pitch * 0.42, flight.heading, 0);

  // 2. Canopy Roll & Pitch (Canopy leads the bank)
  visual.canopy.rotation.z = damp(visual.canopy.rotation.z, -flight.bank * 0.45, 7.5, dt);
  visual.canopy.rotation.x = damp(visual.canopy.rotation.x, flight.pitch * 0.18, 6.5, dt);

  // 3. Pilot Harness Pendulum Dynamics (Harness swings beneath canopy)
  pilot.group.rotation.z = damp(pilot.group.rotation.z, flight.harnessRoll, 8.5, dt);
  pilot.group.rotation.x = damp(pilot.group.rotation.x, flight.harnessPitch, 8.0, dt);

  // 4. Pilot Body Posture & Weight Shift
  const weightShift = THREE.MathUtils.clamp(flight.weightShift + steer * 0.5, -1, 1);
  pilot.torso.rotation.z = damp(pilot.torso.rotation.z, weightShift * 0.38, 8, dt);
  pilot.torso.rotation.x = damp(
    pilot.torso.rotation.x,
    pilot.restTorsoX + (flight.pitch > 0 ? flight.pitch * 0.25 : flight.flare ? -0.12 : 0),
    6.5,
    dt,
  );

  // Head tracks ahead into the turn
  pilot.headShell.rotation.z = damp(pilot.headShell.rotation.z, weightShift * 0.25, 9, dt);
  pilot.headShell.rotation.y = damp(pilot.headShell.rotation.y, weightShift * 0.18, 8, dt);

  // 5. Interactive Pilot Arms & Brake Toggles
  // Raising hands up = full speed glide; Pulling hands down = brake / steer / flare
  const leftPull = flight.leftBrake + (flight.flare ? 0.4 : 0);
  const rightPull = flight.rightBrake + (flight.flare ? 0.4 : 0);

  // When pulling brake, arm moves from high rest (0.45) downward towards waist (-0.6)
  pilot.leftArm.rotation.x = damp(pilot.leftArm.rotation.x, pilot.restArmX - leftPull * 1.15, 12, dt);
  pilot.rightArm.rotation.x = damp(pilot.rightArm.rotation.x, pilot.restArmX - rightPull * 1.15, 12, dt);

  // Speed bar pushes legs slightly forward
  if (pilot.legs) {
    const legExtend = flight.speedBar * 0.14;
    pilot.legs.position.z = damp(pilot.legs.position.z, legExtend, 8, dt);
  }

  // 6. Dynamic Canopy Deformation (Trailing edge flare & turbulence cloth flutter)
  deformCanopy(visual, flight, leftPull, rightPull, time);

  // 7. Dynamic Suspension & Brake Lines
  updateSuspensionLines(visual, pilot);
  updateBrakeLines(visual, pilot);
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

  const ripple = flight.inThermal || flight.inDowndraft ? 0.022 : flight.speed > 16 ? 0.012 : 0.005;
  const bigEarsEffect = flight.bigEars ? 0.45 : 0;

  for (let i = 0; i < pos.count; i++) {
    const rx = rest[i * 3];
    const ry = rest[i * 3 + 1];
    const rz = rest[i * 3 + 2];
    const spanT = rx / half; // -1 (left) to +1 (right)
    const v = THREE.MathUtils.clamp((rz + 0.22 * CHORD) / CHORD, 0, 1);

    let y = ry;

    // Dynamic Trailing-Edge Brake Deflection
    if (v > 0.65) {
      const brakeWeight = (v - 0.65) / 0.35;
      const pull = spanT < 0 ? leftBrake : rightBrake;
      const spanInfluence = Math.abs(spanT);
      y -= pull * brakeWeight * (0.28 + 0.32 * spanInfluence);
    }

    // Big ears: fold the outer 20% of wingtips down
    if (Math.abs(spanT) > 0.8 && bigEarsEffect > 0) {
      const earWeight = (Math.abs(spanT) - 0.8) / 0.2;
      y -= bigEarsEffect * earWeight;
    }

    // High-speed cloth flutter
    y += Math.sin(time * 18 + rx * 2.5 + rz * 3.0) * ripple;

    pos.setXYZ(i, rx, y, rz);
  }
  pos.needsUpdate = true;
  visual.wing.geometry.computeVertexNormals();
}

function updateSuspensionLines(visual: GliderVisual, pilot: PilotRig): void {
  const binds = visual.root.userData.binds as LineBind[];
  const linePos = visual.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < binds.length; i++) {
    const bind = binds[i];
    _a.set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(_a);
    visual.root.worldToLocal(_a);

    // Anchor to corresponding left or right riser maillon above pilot shoulders
    const riser = bind.side === 'L' ? pilot.leftRiser : pilot.rightRiser;
    riser.getWorldPosition(_b);
    visual.root.worldToLocal(_b);

    linePos.setXYZ(i * 2, _a.x, _a.y, _a.z);
    linePos.setXYZ(i * 2 + 1, _b.x, _b.y, _b.z);
  }
  linePos.needsUpdate = true;
}

function updateBrakeLines(visual: GliderVisual, pilot: PilotRig): void {
  const brakeBinds = visual.root.userData.brakeBinds as LineBind[];
  const linePos = visual.brakeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < brakeBinds.length; i++) {
    const bind = brakeBinds[i];
    _a.set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(_a);
    visual.root.worldToLocal(_a);

    // Connect trailing edge brake fan directly to the pilot's left or right hand toggle
    const hand = bind.side === 'L' ? pilot.leftHand : pilot.rightHand;
    hand.getWorldPosition(_b);
    visual.root.worldToLocal(_b);

    linePos.setXYZ(i * 2, _a.x, _a.y, _a.z);
    linePos.setXYZ(i * 2 + 1, _b.x, _b.y, _b.z);
  }
  linePos.needsUpdate = true;
}

export async function attachStudioAssets(_visual: GliderVisual): Promise<void> {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/models/paraglider.glb');
    if (gltf && gltf.scene) {
      const model = gltf.scene;
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          mesh.castShadow = true;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m && 'fog' in m) {
              (m as THREE.MeshStandardMaterial).fog = true;
            }
          });
        }
      });
    }
  } catch {
    // Falls back cleanly to procedural high-fidelity canopy & pilot rig
  }
}
