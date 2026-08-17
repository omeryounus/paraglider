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

const BANDS = ['A', 'B', 'C', 'D'] as const;
type Band = (typeof BANDS)[number];
const RISER_HALF = 0.18;
const CORD_COLOR = 0x2a2e32;
const _c = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _riserL = new THREE.Vector3();
const _riserR = new THREE.Vector3();
const _handL = new THREE.Vector3();
const _handR = new THREE.Vector3();
const _gL = new THREE.Vector3();
const _gR = new THREE.Vector3();
const _gather: Record<'L' | 'R', Record<Band, THREE.Vector3>> = {
  L: { A: new THREE.Vector3(), B: new THREE.Vector3(), C: new THREE.Vector3(), D: new THREE.Vector3() },
  R: { A: new THREE.Vector3(), B: new THREE.Vector3(), C: new THREE.Vector3(), D: new THREE.Vector3() },
};
const _topScratch: THREE.Vector3[] = [];
function scratchTop(i: number): THREE.Vector3 {
  if (!_topScratch[i]) _topScratch[i] = new THREE.Vector3();
  return _topScratch[i];
}

function bandOf(type: LineBind['type']): Band {
  return type === 'brake' ? 'D' : type;
}

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.name = 'Canopy';
  canopy.position.y = CANOPY_Y;

  // 1. Aerodynamic Ram-Air Canopy Mesh with NACA Camber & Open Intakes
  const { geometry, binds, brakeBinds } = createAirfoil();

  // Ripstop nylon: matte fabric, not plastic
  const wingMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    fog: true,
    normalMap: ripstopNormal(),
    normalScale: new THREE.Vector2(0.45, 0.45),
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

  // 4. Upper cascade (canopy → A/B/C/D gathers). Lower 3–4 webbings are meshes.
  const lineCount = binds.length;
  const linePos = new Float32Array(lineCount * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: CORD_COLOR,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'Suspension';
  root.add(lines);

  const webbing: THREE.Mesh[] = [];
  const webMat = new THREE.MeshStandardMaterial({
    color: 0x2c3036,
    roughness: 0.84,
    metalness: 0.06,
    fog: true,
  });
  const webGeo = new THREE.CylinderGeometry(0.0045, 0.006, 1, 5);
  for (const side of ['Left', 'Right'] as const) {
    for (const band of BANDS) {
      const mesh = new THREE.Mesh(webGeo, webMat);
      mesh.name = `${side}RiserWeb_${band}`;
      mesh.castShadow = false;
      root.add(mesh);
      webbing.push(mesh);
    }
  }

  // 5. Brake fans use the same aramid cord (no high-vis red)
  const brakeCount = brakeBinds.length + 2;
  const brakeLinePos = new Float32Array(brakeCount * 2 * 3);
  const brakeLineGeo = new THREE.BufferGeometry();
  brakeLineGeo.setAttribute('position', new THREE.BufferAttribute(brakeLinePos, 3));
  const brakeLineMat = new THREE.LineBasicMaterial({
    color: CORD_COLOR,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
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
    webbing,
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
    depthTest: true,
    fog: false,
    forceSinglePass: true,
  });
}

/** Keep the close-up pilot a solid depth writer so fog/terrain cannot bleed through. */
function makeHeroOpaque(mat: THREE.Material): void {
  mat.transparent = false;
  mat.opacity = 1;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.alphaTest = 0;
  mat.alphaHash = false;
  mat.forceSinglePass = false;
  mat.side = THREE.DoubleSide;
  mat.shadowSide = THREE.FrontSide;
  mat.colorWrite = true;
  const std = mat as THREE.MeshStandardMaterial;
  if (std.isMeshStandardMaterial) {
    std.fog = false;
    std.premultipliedAlpha = false;
    std.alphaMap = null;
    std.transparent = false;
    std.opacity = 1;
    const prev = std.onBeforeCompile.bind(std);
    std.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        diffuseColor.a = 1.0;`,
        )
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
        diffuseColor.a = 1.0;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
        gl_FragColor.a = 1.0;`,
        );
    };
    std.customProgramCacheKey = () => 'hero-opaque-v3';
  }
  const phys = mat as THREE.MeshPhysicalMaterial;
  if (phys.isMeshPhysicalMaterial) {
    phys.transmission = 0;
    phys.thickness = 0;
    phys.attenuationDistance = Infinity;
  }
  mat.needsUpdate = true;
}

let _ripstop: THREE.DataTexture | null = null;
function ripstopNormal(): THREE.DataTexture {
  if (_ripstop) return _ripstop;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grid = (Math.sin(x * 0.48) + Math.sin(y * 0.48)) * 0.12;
      const wrinkle =
        Math.sin(x * 0.07 + y * 0.031) * 0.55 + Math.sin(y * 0.09 - x * 0.04) * 0.4 + grid;
      const wx = wrinkle + Math.sin((x + y) * 0.21) * 0.18;
      const wy = wrinkle * 0.85 + Math.sin((y - x) * 0.19) * 0.2;
      const i = (y * size + x) * 4;
      data[i] = 128 + wx * 36;
      data[i + 1] = 128 + wy * 36;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 5);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  _ripstop = tex;
  return tex;
}

function stretchCylinder(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = _c.copy(b).sub(a);
  const len = dir.length();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(1, Math.max(0.04, len), 1);
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(_up, dir.multiplyScalar(1 / len));
}

function createPilot(): PilotRig {
  const group = new THREE.Group();
  group.name = 'Pilot';

  const jacket = skin(0x181e26, 0.65, 0.08);
  const pants = skin(0x12151a, 0.72, 0.05);
  const flesh = skin(0xd49b6a, 0.55);
  const bootMat = skin(0x0e1012, 0.4, 0.2);
  const webbingMat = skin(0x2a241c, 0.78, 0.04);
  const carbon = skin(0x16181c, 0.42, 0.22);

  const harness = new THREE.Group();
  harness.name = 'Harness';

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.3), webbingMat);
  seat.name = 'SeatBase';
  seat.position.set(0, -0.02, 0.07);
  seat.castShadow = true;

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.16), webbingMat);
  pack.name = 'HarnessPack';
  pack.position.set(0, 0.16, -0.13);
  pack.castShadow = true;

  const hipBelt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.055, 0.16), webbingMat);
  hipBelt.name = 'HipBelt';
  hipBelt.position.set(0, 0.05, 0.04);

  const leftCarabiner = new THREE.Mesh(
    new THREE.TorusGeometry(0.022, 0.0045, 6, 10),
    carbon,
  );
  leftCarabiner.name = 'LeftCarabiner';
  leftCarabiner.position.set(-RISER_HALF, 0.18, 0.06);
  leftCarabiner.rotation.z = Math.PI / 2;
  const rightCarabiner = leftCarabiner.clone();
  rightCarabiner.name = 'RightCarabiner';
  rightCarabiner.position.x = RISER_HALF;

  harness.add(seat, pack, hipBelt, leftCarabiner, rightCarabiner);

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
      fog: false,
      transparent: false,
      depthWrite: true,
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
      fog: false,
      transparent: false,
      depthWrite: true,
    }),
  );
  visor.position.set(0, 0.0, 0.035);
  visor.castShadow = true;
  headShell.add(helmet, visor);

  const eye = new THREE.Object3D();
  eye.position.set(0, 0.02, 0.14);
  head.add(headShell, eye);
  torso.add(head);

  // Elbows out, hands at ear height on the rear brake toggles
  const makeArm = (side: number): {
    armRoot: THREE.Group;
    hand: THREE.Mesh;
    toggle: THREE.Object3D;
  } => {
    const tag = side < 0 ? 'Left' : 'Right';
    const armRoot = new THREE.Group();
    armRoot.name = `${tag}Arm`;
    armRoot.position.set(side * 0.19, 0.3, 0.02);
    armRoot.rotation.z = side * 0.62;
    armRoot.rotation.x = 0.12;

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.2, 3, 6), jacket);
    upper.name = `${tag}UpperArm`;
    upper.position.set(0, 0.08, 0.05);
    upper.rotation.x = -0.35;
    upper.castShadow = true;

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.18, 3, 6), jacket);
    lower.name = `${tag}Forearm`;
    lower.position.set(side * 0.02, 0.2, 0.02);
    lower.rotation.x = -1.05;
    lower.rotation.z = side * -0.15;
    lower.castShadow = true;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), flesh);
    hand.name = `${tag}Hand`;
    hand.position.set(side * 0.01, 0.32, -0.02);
    hand.castShadow = true;

    const toggle = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.008, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a1c16, roughness: 0.45, fog: true }),
    );
    toggle.name = `${tag}Toggle`;
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
  leftRiser.position.set(-RISER_HALF, 0.18, 0.06);
  const rightRiser = new THREE.Object3D();
  rightRiser.name = 'RightRiser';
  rightRiser.position.set(RISER_HALF, 0.18, 0.06);

  const leftBrake = new THREE.Object3D();
  leftBrake.name = 'LeftBrakeAnchor';
  leftBrake.position.set(-0.2, 0.5, 0.08);
  const rightBrake = new THREE.Object3D();
  rightBrake.name = 'RightBrakeAnchor';
  rightBrake.position.set(0.2, 0.5, 0.08);
  harness.add(leftRiser, rightRiser, leftBrake, rightBrake);

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
    leftToggle: leftBrake,
    rightToggle: rightBrake,
    legs,
    leftRiser,
    rightRiser,
    restTorsoX: 0.22,
    restArmX: 0.12,
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

  // Rest is ear-level; pull drops the hands / brake toggles toward the hips
  pilot.leftArm.rotation.x = damp(pilot.leftArm.rotation.x, pilot.restArmX - leftPull * 1.05, 12, dt);
  pilot.rightArm.rotation.x = damp(pilot.rightArm.rotation.x, pilot.restArmX - rightPull * 1.05, 12, dt);
  const restLY = (visual.root.userData.toggleRestL as number | undefined) ?? visual.leftToggle.position.y;
  const restRY = (visual.root.userData.toggleRestR as number | undefined) ?? visual.rightToggle.position.y;
  visual.leftToggle.position.y = restLY - leftPull * 0.38;
  visual.rightToggle.position.y = restRY - rightPull * 0.38;

  const person = visual.root.userData.hyper3dPerson as THREE.Object3D | undefined;
  if (person) {
    person.rotation.z = damp(person.rotation.z, weightShift * 0.22, 7, dt);
    person.rotation.x = damp(person.rotation.x, 0.06 + (flight.flare ? 0.08 : 0), 6, dt);
  }

  // Speed bar pushes legs slightly forward
  if (pilot.legs) {
    const legExtend = flight.speedBar * 0.14;
    pilot.legs.position.z = damp(pilot.legs.position.z, legExtend, 8, dt);
  }

  // 6. Dynamic Canopy Deformation (procedural wing and Hyper3D canopy)
  deformCanopy(visual, flight, leftPull, rightPull, time);
  deformStudioCanopy(visual, flight, leftPull, rightPull, time);

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

function deformStudioCanopy(
  visual: GliderVisual,
  flight: FlightState,
  leftBrake: number,
  rightBrake: number,
  time: number,
): void {
  const mesh = visual.root.userData.studioCanopyMesh as THREE.Mesh | undefined;
  const rest = visual.root.userData.studioRest as Float32Array | undefined;
  const size = visual.root.userData.studioSize as THREE.Vector3 | undefined;
  if (!mesh || !rest || !size) return;
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const halfX = Math.max(0.01, size.x * 0.5);
  const minZ = visual.root.userData.studioMinZ as number;
  const spanZ = Math.max(0.01, size.z);
  const ripple = flight.inThermal || flight.inDowndraft ? 0.018 : 0.006;
  const ears = flight.bigEars ? 0.38 : 0;
  for (let i = 0; i < pos.count; i++) {
    const rx = rest[i * 3];
    const ry = rest[i * 3 + 1];
    const rz = rest[i * 3 + 2];
    const spanT = rx / halfX;
    const chordT = (rz - minZ) / spanZ;
    let y = ry;
    if (chordT > 0.62) {
      const w = (chordT - 0.62) / 0.38;
      const pull = spanT < 0 ? leftBrake : rightBrake;
      y -= pull * w * 0.22 * (0.45 + Math.abs(spanT));
    }
    if (Math.abs(spanT) > 0.78 && ears > 0) {
      y -= ears * ((Math.abs(spanT) - 0.78) / 0.22);
    }
    if (ripple > 0.01) y += Math.sin(time * 7 + rx * 2.2 + rz * 2.8) * ripple * 0.35;
    pos.setXYZ(i, rx, y, rz);
  }
  pos.needsUpdate = true;
}

function updateSuspensionLines(visual: GliderVisual, pilot: PilotRig): void {
  const binds = visual.root.userData.binds as LineBind[];
  const webbing = visual.root.userData.webbing as THREE.Mesh[];
  const linePos = visual.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;

  const counts: Record<'L' | 'R', Record<Band, number>> = {
    L: { A: 0, B: 0, C: 0, D: 0 },
    R: { A: 0, B: 0, C: 0, D: 0 },
  };
  for (const side of ['L', 'R'] as const) {
    for (const band of BANDS) _gather[side][band].set(0, 0, 0);
  }

  for (let i = 0; i < binds.length; i++) {
    const bind = binds[i];
    const top = scratchTop(i).set(pos.getX(bind.vert), pos.getY(bind.vert), pos.getZ(bind.vert));
    visual.canopy.localToWorld(top);
    visual.root.worldToLocal(top);
    const band = bandOf(bind.type);
    _gather[bind.side][band].add(top);
    counts[bind.side][band] += 1;
  }

  pilot.leftRiser.getWorldPosition(_riserL);
  visual.root.worldToLocal(_riserL);
  pilot.rightRiser.getWorldPosition(_riserR);
  visual.root.worldToLocal(_riserR);
  const riserOf = { L: _riserL, R: _riserR };

  const bandZ: Record<Band, number> = { A: -0.035, B: -0.012, C: 0.012, D: 0.035 };
  for (const side of ['L', 'R'] as const) {
    const riser = riserOf[side];
    for (const band of BANDS) {
      const n = counts[side][band];
      const g = _gather[side][band];
      if (n > 0) g.multiplyScalar(1 / n);
      else g.copy(riser).y += 2.1;
      // Keep the join high so risers run most of the way up, then the fan tapers.
      g.lerp(riser, 0.16);
      g.z += bandZ[band];
      g.x += side === 'L' ? -0.03 : 0.03;
    }
  }

  for (let i = 0; i < binds.length; i++) {
    const bind = binds[i];
    const top = scratchTop(i);
    const g = _gather[bind.side][bandOf(bind.type)];
    linePos.setXYZ(i * 2, top.x, top.y, top.z);
    linePos.setXYZ(i * 2 + 1, g.x, g.y, g.z);
  }
  linePos.needsUpdate = true;

  let w = 0;
  for (const side of ['L', 'R'] as const) {
    const riser = riserOf[side];
    for (const band of BANDS) {
      stretchCylinder(webbing[w], _gather[side][band], riser);
      w += 1;
    }
  }
}

function updateBrakeLines(visual: GliderVisual, pilot: PilotRig): void {
  const brakeBinds = visual.root.userData.brakeBinds as LineBind[];
  const linePos = visual.brakeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const pos = visual.wing.geometry.getAttribute('position') as THREE.BufferAttribute;

  let nL = 0;
  let nR = 0;
  _gL.set(0, 0, 0);
  _gR.set(0, 0, 0);

  for (let i = 0; i < brakeBinds.length; i++) {
    const bind = brakeBinds[i];
    const top = scratchTop(i).set(
      pos.getX(bind.vert),
      pos.getY(bind.vert),
      pos.getZ(bind.vert),
    );
    visual.canopy.localToWorld(top);
    visual.root.worldToLocal(top);
    if (bind.side === 'L') {
      _gL.add(top);
      nL += 1;
    } else {
      _gR.add(top);
      nR += 1;
    }
  }

  (visual.root.userData.brakeLeft ?? pilot.leftToggle).getWorldPosition(_handL);
  (visual.root.userData.brakeRight ?? pilot.rightToggle).getWorldPosition(_handR);
  visual.root.worldToLocal(_handL);
  visual.root.worldToLocal(_handR);

  if (nL) _gL.multiplyScalar(1 / nL).lerp(_handL, 0.52);
  else _gL.copy(_handL).y += 0.8;
  if (nR) _gR.multiplyScalar(1 / nR).lerp(_handR, 0.52);
  else _gR.copy(_handR).y += 0.8;

  for (let i = 0; i < brakeBinds.length; i++) {
    const top = scratchTop(i);
    const g = brakeBinds[i].side === 'L' ? _gL : _gR;
    linePos.setXYZ(i * 2, top.x, top.y, top.z);
    linePos.setXYZ(i * 2 + 1, g.x, g.y, g.z);
  }
  linePos.setXYZ(brakeBinds.length * 2, _gL.x, _gL.y, _gL.z);
  linePos.setXYZ(brakeBinds.length * 2 + 1, _handL.x, _handL.y, _handL.z);
  linePos.setXYZ(brakeBinds.length * 2 + 2, _gR.x, _gR.y, _gR.z);
  linePos.setXYZ(brakeBinds.length * 2 + 3, _handR.x, _handR.y, _handR.z);
  linePos.needsUpdate = true;
}

function prepMaps(mat: THREE.MeshStandardMaterial, mipmaps = true): void {
  const maps = [
    mat.map,
    mat.normalMap,
    mat.roughnessMap,
    mat.aoMap,
    mat.emissiveMap,
  ];
  for (const tex of maps) {
    if (!tex) continue;
    // Hyper3D atlases sit on black padding — mipmaps pull that black into the silhouette.
    tex.generateMipmaps = mipmaps;
    tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = mipmaps ? 8 : 1;
    if (tex === mat.map) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  }
}

/** Drop Hyper3D capture cards: tall, thin, camera-facing sheets welded into the person. */
function stripBillboardCards(geo: THREE.BufferGeometry): void {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  if (!idx || !pos) return;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox!.getSize(new THREE.Vector3());
  const minH = size.y * 0.65;
  const minW = size.x * 0.4;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  type Rec = { faces: number[]; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  const buckets = new Map<string, Rec>();
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]);
    b.fromBufferAttribute(pos, arr[i + 1]);
    c.fromBufferAttribute(pos, arr[i + 2]);
    n.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    if (Math.abs(n.z) < 0.88) continue;
    const z = (a.z + b.z + c.z) / 3;
    const key = `${Math.round(z * 20) / 20}:${n.z > 0 ? '+' : '-'}`;
    let rec = buckets.get(key);
    if (!rec) {
      rec = { faces: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      buckets.set(key, rec);
    }
    rec.faces.push(i);
    rec.minX = Math.min(rec.minX, a.x, b.x, c.x);
    rec.maxX = Math.max(rec.maxX, a.x, b.x, c.x);
    rec.minY = Math.min(rec.minY, a.y, b.y, c.y);
    rec.maxY = Math.max(rec.maxY, a.y, b.y, c.y);
    rec.minZ = Math.min(rec.minZ, a.z, b.z, c.z);
    rec.maxZ = Math.max(rec.maxZ, a.z, b.z, c.z);
  }
  const drop = new Set<number>();
  for (const rec of buckets.values()) {
    const thin = rec.maxZ - rec.minZ < Math.max(0.09, size.z * 0.09);
    const tall = rec.maxY - rec.minY >= minH;
    const wide = rec.maxX - rec.minX >= minW;
    if (thin && tall && wide && rec.faces.length > 80) {
      for (const face of rec.faces) drop.add(face);
    }
  }
  if (drop.size === 0) return;
  const next: number[] = [];
  for (let i = 0; i < arr.length; i += 3) {
    if (drop.has(i)) continue;
    next.push(arr[i], arr[i + 1], arr[i + 2]);
  }
  geo.setIndex(next);
  geo.computeVertexNormals();
}

function isHelperMesh(mesh: THREE.Mesh): boolean {
  const name = mesh.name.toLowerCase();
  if (/(plane|shadow|catcher|bound|helper|grid|floor|ground|quad|card)/.test(name)) return true;
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return false;
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
  const area = dims[1] * dims[2];
  return dims[0] < 0.02 && area > 0.15;
}

async function loadGlbScene(url: string, _doubleSide = false): Promise<THREE.Group | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const scene = gltf.scene;
    const drop: THREE.Mesh[] = [];
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (isHelperMesh(mesh)) {
        drop.push(mesh);
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.depthTest = true;
          mat.alphaTest = 0;
          mat.fog = true;
          mat.side = THREE.DoubleSide;
          mat.shadowSide = THREE.FrontSide;
          mat.forceSinglePass = false;
          prepMaps(mat, false);
        }
      }
    });
    for (const mesh of drop) mesh.removeFromParent();
    return scene;
  } catch {
    return null;
  }
}

function fitAsset(src: THREE.Object3D, targetSpan: number, axis: 'x' | 'y'): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  const span = axis === 'x' ? size.x : size.y;
  if (span > 1e-4) src.scale.multiplyScalar(targetSpan / span);
  src.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(src);
}

export async function attachStudioAssets(visual: GliderVisual): Promise<void> {
  const parachute =
    (await loadGlbScene('/models/parachute.glb', true)) ??
    (await loadGlbScene('/models/canopy.glb', true));
  const person =
    (await loadGlbScene('/models/person.glb', false)) ??
    (await loadGlbScene('/models/pilot.glb', false));
  const fabric = ripstopNormal();

  if (parachute) {
    parachute.name = 'Hyper3D_Parachute';
    const box = fitAsset(parachute, SPAN, 'x');
    const center = box.getCenter(new THREE.Vector3());
    parachute.position.sub(center);
    parachute.position.y -= box.min.y;
    parachute.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (!mat?.isMeshStandardMaterial) continue;
        mat.transparent = false;
        mat.opacity = 1;
        mat.alphaTest = 0;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
        mat.forceSinglePass = false;
        mat.roughness = 0.55;
        mat.metalness = 0;
        mat.metalnessMap = null;
        mat.envMapIntensity = 0.15;
        mat.normalMap = fabric;
        mat.normalScale = new THREE.Vector2(0.32, 0.32);
        prepMaps(mat, false);
        mat.needsUpdate = true;
      }
    });
    visual.wing.visible = false;
    visual.canopy.add(parachute);
    visual.root.userData.blenderCanopy = true;
    parachute.updateMatrixWorld(true);
    let canopyMesh: THREE.Mesh | undefined;
    parachute.traverse((child) => {
      if (canopyMesh) return;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) canopyMesh = mesh;
    });
    if (canopyMesh) {
      const geo = canopyMesh.geometry;
      const attr = geo.getAttribute('position');
      visual.root.userData.studioCanopyMesh = canopyMesh;
      visual.root.userData.studioRest = Float32Array.from(attr.array as Float32Array);
      const box = new THREE.Box3().setFromBufferAttribute(attr as THREE.BufferAttribute);
      visual.root.userData.studioSize = box.getSize(new THREE.Vector3());
      visual.root.userData.studioMinZ = box.min.z;
    }
  }

  if (person) {
    person.name = 'Hyper3D_Person';
    const box = fitAsset(person, 1.7 * 1.18, 'y');
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    person.position.x -= center.x;
    person.position.z -= center.z;
    person.position.y -= box.min.y;
    person.rotation.x = 0.06;
    person.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      stripBillboardCards(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        makeHeroOpaque(raw);
        const mat = raw as THREE.MeshStandardMaterial;
        if (!mat?.isMeshStandardMaterial) continue;
        mat.roughness = 0.72;
        mat.metalness = 0;
        mat.metalnessMap = null;
        mat.roughnessMap = null;
        mat.envMapIntensity = 0.12;
        prepMaps(mat, false);
        mat.needsUpdate = true;
      }
    });

    const harness = visual.root.getObjectByName('Harness');
    const harnessY = size.y * 0.38;
    const harnessScale = 1.05;
    if (harness) {
      harness.position.set(0, harnessY, 0.04);
      harness.scale.setScalar(harnessScale);
      // Chest / shoulder maillons — not the hands.
      visual.leftRiser.position.set(-0.16, 0.16, 0.07);
      visual.rightRiser.position.set(0.16, 0.16, 0.07);
      const leftCar = harness.getObjectByName('LeftCarabiner');
      const rightCar = harness.getObjectByName('RightCarabiner');
      if (leftCar) leftCar.position.copy(visual.leftRiser.position);
      if (rightCar) rightCar.position.copy(visual.rightRiser.position);
    }

    const earLocalY = (size.y * 0.7 - harnessY) / harnessScale;
    visual.leftToggle.position.set(-0.22, earLocalY, 0.12);
    visual.rightToggle.position.set(0.22, earLocalY, 0.12);
    visual.root.userData.toggleRestL = visual.leftToggle.position.y;
    visual.root.userData.toggleRestR = visual.rightToggle.position.y;
    visual.root.userData.brakeLeft = visual.leftToggle;
    visual.root.userData.brakeRight = visual.rightToggle;

    const gripMat = new THREE.MeshStandardMaterial({ color: 0x7a1e18, roughness: 0.5, fog: true });
    for (const anchor of [visual.leftToggle, visual.rightToggle]) {
      if (anchor.children.length === 0) {
        const grip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 10), gripMat);
        grip.rotation.x = Math.PI / 2;
        anchor.add(grip);
      }
    }

    const hide = new Set(['Chest', 'Head', 'Neck', 'Helmet', 'HeadShell']);
    visual.root.getObjectByName('Pilot')?.traverse((child) => {
      if (child.name === 'Harness' || child.name.endsWith('Riser') || child.name.endsWith('Toggle')) {
        return;
      }
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (
        mesh.name === 'SeatBase' ||
        mesh.name === 'HarnessPack' ||
        mesh.name === 'HipBelt' ||
        mesh.name === 'ChestStrap'
      ) {
        mesh.visible = false;
        return;
      }
      const underHarness = mesh.parent?.name === 'Harness' || mesh.name.startsWith('Harness')
        || mesh.name.includes('Carabiner');
      if (underHarness) return;
      if (hide.has(mesh.name) || mesh.name.includes('Arm') || mesh.name.includes('Hand')
        || mesh.name.includes('Leg') || mesh.name.includes('Foot') || mesh.name.includes('Thigh')
        || mesh.name.includes('Shin') || mesh.name.includes('Forearm') || mesh.name === 'Visor') {
        mesh.visible = false;
      }
    });

    const pilot = visual.root.userData.pilot as PilotRig;
    person.position.y -= 0.08;
    pilot.group.add(person);
    visual.root.userData.hyper3dPerson = person;
  }
}
