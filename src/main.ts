import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE_SPEED = 12;
const GLIDE_RATIO = 9;
const THERMAL_LIFT = 3.5;
const LANDING_AGL = 1;
const SAFE_SINK = 2;
const MAX_BANK_LANDING = 0.48;
const WORLD_SIZE = 1400;

type FlightPhase = 'flying' | 'landed' | 'crashed';

interface Thermal {
  x: number;
  z: number;
  radius: number;
  bottom: number;
  top: number;
  mesh: THREE.Mesh;
}

interface GliderVisual {
  root: THREE.Group;
  canopy: THREE.Group;
}

const keys = new Set<string>();
const clock = new THREE.Clock();
const down = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
const camIdeal = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camLookTarget = new THREE.Vector3();
const sunOffset = new THREE.Vector3(160, 240, 90);
const scratch = new THREE.Vector3();

const el = {
  loader: must('#loader'),
  loaderStatus: must('#loader-status'),
  hud: must('#hud'),
  alt: must('#hud-alt'),
  spd: must('#hud-spd'),
  vari: must('#hud-var'),
  glide: must('#hud-glide'),
  hdg: must('#hud-hdg'),
  msl: must('#hud-msl'),
  source: must('#terrain-source'),
  thermal: must('#thermal-chip'),
  varioDial: must('#vario-dial'),
  varioNeedle: must('#vario-needle'),
  banner: must('#banner'),
  bannerGo: must('#banner-go') as HTMLButtonElement,
  modal: must('#modal'),
  modalCard: document.querySelector('.modal-card') as HTMLElement,
  modalKicker: must('#modal-kicker'),
  modalTitle: must('#modal-title'),
  modalCopy: must('#modal-copy'),
  statTime: must('#stat-time'),
  statDist: must('#stat-dist'),
  statMax: must('#stat-max'),
  statTd: must('#stat-td'),
  restart: must('#modal-restart') as HTMLButtonElement,
};

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')?.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.FogExp2(0x9ec4dd, 0.00115);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.2,
  6000,
);

const hemi = new THREE.HemisphereLight(0xc8e4ff, 0x4a3a28, 0.72);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d0, 1.55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 900;
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.bias = -0.00025;
scene.add(sun);
scene.add(sun.target);

const glider = createGlider();
scene.add(glider.root);

const thermals: Thermal[] = [];
const thermalParticles = createThermalParticles();
scene.add(thermalParticles);

let collisionTarget: THREE.Object3D = new THREE.Object3D();
let terrainRoot: THREE.Object3D = new THREE.Object3D();

const flight = {
  heading: 0.35,
  pitch: 0,
  bank: 0,
  speed: BASE_SPEED,
  verticalSpeed: -BASE_SPEED / GLIDE_RATIO,
  flare: false,
  inThermal: false,
  phase: 'flying' as FlightPhase,
  agl: 120,
  distance: 0,
  maxAgl: 0,
  elapsed: 0,
  spawn: new THREE.Vector3(0, 160, 0),
};

function must(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
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

function fbm(x: number, z: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += (valueNoise(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

function terrainHeight(x: number, z: number): number {
  const nx = x * 0.0048;
  const nz = z * 0.0048;
  const rolling = fbm(nx, nz) * 38;
  const ridges = (1 - Math.abs(fbm(nx * 0.55 + 12, nz * 0.55))) * 52;
  const valley = Math.exp(-((x * 0.0018) ** 2 + (z * 0.0011) ** 2) * 1.4) * -22;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (WORLD_SIZE * 0.5);
  const rim = Math.max(0, edge - 0.62) ** 2 * 110;
  return Math.max(2.2, 36 + rolling + ridges * 0.55 + valley + rim);
}

function createFallbackTerrain(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ProceduralHills';

  const segments = 196;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x4f7a3e);
  const dry = new THREE.Color(0x8a7a48);
  const rock = new THREE.Color(0x6d675f);
  const snow = new THREE.Color(0xe8eef4);
  const mix = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);
    mix.copy(grass).lerp(dry, THREE.MathUtils.smoothstep(y, 20, 48));
    mix.lerp(rock, THREE.MathUtils.smoothstep(y, 52, 78));
    mix.lerp(snow, THREE.MathUtils.smoothstep(y, 84, 112));
    const mottling = 0.88 + valueNoise(x * 0.03, z * 0.03) * 0.22;
    colors[i * 3] = mix.r * mottling;
    colors[i * 3 + 1] = mix.g * mottling;
    colors[i * 3 + 2] = mix.b * mottling;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.02,
    }),
  );
  mesh.name = 'Terrain_Surface';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(78, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1d6a7a,
      roughness: 0.12,
      metalness: 0.55,
      transparent: true,
      opacity: 0.72,
    }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(-70, 18.4, 40);
  lake.name = 'Water';
  group.add(lake);

  addScatter(group);
  return group;
}

function addScatter(parent: THREE.Group): void {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.1, 5);
  const crownGeo = new THREE.ConeGeometry(1.35, 3.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f5a32, roughness: 0.82 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 220);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, 220);
  trunks.castShadow = true;
  crowns.castShadow = true;
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < 220 && guard < 4000) {
    guard += 1;
    const x = (hash2(placed + 3, guard) - 0.5) * WORLD_SIZE * 0.88;
    const z = (hash2(guard, placed + 9) - 0.5) * WORLD_SIZE * 0.88;
    const y = terrainHeight(x, z);
    if (y < 24 || y > 68) continue;
    if (Math.hypot(x + 70, z - 40) < 90) continue;
    const scale = 0.75 + hash2(placed, 4) * 1.1;
    dummy.position.set(x, y + 1.05 * scale, z);
    dummy.rotation.set(0, hash2(placed, 11) * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = y + 3.1 * scale;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  parent.add(trunks, crowns);
}

function createCanopyGeometry(): THREE.BufferGeometry {
  const span = 8.8;
  const chord = 2.65;
  const segsX = 26;
  const segsZ = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= segsZ; j++) {
    const v = j / segsZ;
    for (let i = 0; i <= segsX; i++) {
      const u = i / segsX;
      const taper = 1 - 0.2 * (Math.abs(u - 0.5) * 2) ** 2.6;
      const x = (u - 0.5) * span;
      const z = (v - 0.18) * chord * taper;
      const camber = Math.sin(Math.PI * Math.min(1, v * 1.05)) * 0.46 * taper;
      const arc = (Math.abs(u - 0.5) * 2) ** 2 * 0.92;
      positions.push(x, camber - arc, z);
      uvs.push(u, v);
      const cell = Math.floor(u * 12);
      if (cell % 3 === 0) colors.push(0.94, 0.42, 0.18);
      else if (cell % 3 === 1) colors.push(0.96, 0.94, 0.9);
      else colors.push(0.13, 0.24, 0.4);
    }
  }

  for (let j = 0; j < segsZ; j++) {
    for (let i = 0; i < segsX; i++) {
      const a = j * (segsX + 1) + i;
      const b = a + 1;
      const c = a + (segsX + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.position.y = 2.55;
  const wing = new THREE.Mesh(
    createCanopyGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  wing.castShadow = true;
  canopy.add(wing);

  const linePos: number[] = [];
  const riser = new THREE.Vector3(0, -2.55, 0.15);
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    const x = (u - 0.5) * 7.6;
    const arc = (Math.abs(u - 0.5) * 2) ** 2 * 0.92;
    linePos.push(x, 0.15 - arc, -0.15, riser.x, riser.y, riser.z);
    linePos.push(x, -0.12 - arc, 1.55, riser.x, riser.y, riser.z);
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePos, 3),
    ),
    new THREE.LineBasicMaterial({ color: 0xd8d2c6, transparent: true, opacity: 0.7 }),
  );
  canopy.add(lines);

  const harness = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.55, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.7 }),
  );
  harness.rotation.x = 0.35;
  harness.position.set(0, 0.15, 0.12);
  harness.castShadow = true;

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xe36a28, roughness: 0.35 }),
  );
  helmet.position.set(0, 0.62, 0.28);
  helmet.castShadow = true;

  const legs = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 0.45, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2730, roughness: 0.8 }),
  );
  legs.rotation.x = 1.15;
  legs.position.set(0, -0.18, 0.42);

  root.add(canopy, harness, helmet, legs);
  return { root, canopy };
}

function createThermalParticles(): THREE.Points {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.userData.seeds = Array.from({ length: count }, (_, i) => ({
    t: hash2(i, 2),
    s: 0.35 + hash2(i, 5) * 0.8,
  }));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xcde8d8,
      size: 0.55,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
}

function prepareLoadedTerrain(root: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > 0 && size.x < 80) {
    root.scale.multiplyScalar(420 / size.x);
    root.updateMatrixWorld(true);
  }
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      const std = mat as THREE.MeshStandardMaterial;
      if ('side' in std) std.side = THREE.FrontSide;
    }
  });
  const dedicated =
    root.getObjectByName('Collision_Mesh') ??
    root.getObjectByName('Terrain_Surface') ??
    root.getObjectByName('Terrain_Board');
  if (dedicated) return dedicated;

  const meshes: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.name !== 'Water' && !/skirt|slab|base/i.test(mesh.name)) {
      meshes.push(mesh);
    }
  });
  if (meshes.length === 1) return meshes[0];
  return root;
}

async function tryLoadGlb(url: string, loader: GLTFLoader): Promise<THREE.Group | null> {
  try {
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch {
    return null;
  }
}

function placeThermals(bounds: THREE.Box3): void {
  for (const thermal of thermals) scene.remove(thermal.mesh);
  thermals.length = 0;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(80, Math.min(size.x, size.z) * 0.28);
  const spots = [
    { x: center.x + span * 0.55, z: center.z + span * 0.2, r: span * 0.22 },
    { x: center.x - span * 0.7, z: center.z + span * 0.45, r: span * 0.26 },
    { x: center.x + span * 0.1, z: center.z - span * 0.75, r: span * 0.2 },
  ];

  for (const spot of spots) {
    const height = Math.max(140, size.y * 1.6 + 80);
    const column = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(spot.r, spot.r * 0.78, height, 28, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7fe3b4,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    shaft.position.y = bounds.min.y + height * 0.45;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spot.r * 0.72, spot.r, 40),
      new THREE.MeshBasicMaterial({
        color: 0xb7f3d4,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = bounds.min.y + 1.4;
    column.add(shaft, ring);
    column.position.set(spot.x, 0, spot.z);
    column.renderOrder = 2;
    scene.add(column);
    thermals.push({
      x: spot.x,
      z: spot.z,
      radius: spot.r,
      bottom: bounds.min.y,
      top: bounds.min.y + height,
      mesh: shaft,
    });
  }
}

function resetFlight(): void {
  glider.root.position.copy(flight.spawn);
  flight.heading = 0.28;
  flight.pitch = 0;
  flight.bank = 0;
  flight.speed = BASE_SPEED;
  flight.verticalSpeed = -BASE_SPEED / GLIDE_RATIO;
  flight.flare = false;
  flight.inThermal = false;
  flight.phase = 'flying';
  flight.agl = 120;
  flight.distance = 0;
  flight.maxAgl = 0;
  flight.elapsed = 0;
  el.modal.hidden = true;
  el.modalCard.classList.remove('safe', 'crash');
  camera.position.set(
    flight.spawn.x - Math.sin(flight.heading) * 16,
    flight.spawn.y + 6,
    flight.spawn.z - Math.cos(flight.heading) * 16,
  );
  camLook.copy(flight.spawn);
}

function finishFlight(kind: 'landed' | 'crashed', touchdown: number): void {
  if (flight.phase !== 'flying') return;
  flight.phase = kind;
  const safe = kind === 'landed';
  el.modal.hidden = false;
  el.modalCard.classList.toggle('safe', safe);
  el.modalCard.classList.toggle('crash', !safe);
  el.modalKicker.textContent = safe ? 'Textbook arrival' : 'Hard contact';
  el.modalTitle.textContent = safe ? 'Safe Landing' : 'Crash';
  el.modalCopy.textContent = safe
    ? 'Sink rate was gentle and the wing was level. The slope accepted you.'
    : Math.abs(flight.bank) > MAX_BANK_LANDING
      ? 'You arrived with too much bank. Level the canopy before the last few metres.'
      : 'Vertical speed was too steep. Flare with Space to bleed energy before touchdown.';
  el.statTime.textContent = formatTime(flight.elapsed);
  el.statDist.textContent = `${Math.round(flight.distance)} m`;
  el.statMax.textContent = `${Math.round(flight.maxAgl)} m`;
  el.statTd.textContent = `${touchdown.toFixed(1)} m/s`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sampleGround(origin: THREE.Vector3): THREE.Intersection | null {
  scratch.copy(origin);
  scratch.y += 80;
  raycaster.set(scratch, down);
  raycaster.far = 600;
  const hits = raycaster.intersectObject(collisionTarget, true);
  return hits[0] ?? null;
}

function updatePhysics(dt: number): void {
  if (flight.phase !== 'flying') {
    glider.root.rotation.y = flight.heading;
    glider.canopy.rotation.z = THREE.MathUtils.lerp(glider.canopy.rotation.z, 0, 1 - Math.exp(-4 * dt));
    return;
  }

  const pitchIn =
    keys.has('arrowup') || keys.has('w') ? 1 : keys.has('arrowdown') || keys.has('s') ? -1 : 0;
  const steerIn =
    keys.has('arrowleft') || keys.has('a') ? 1 : keys.has('arrowright') || keys.has('d') ? -1 : 0;
  flight.flare = keys.has(' ');

  const pitchTarget = pitchIn * 0.42 + (flight.flare ? 0.2 : 0);
  const bankTarget = steerIn * 0.68;
  flight.pitch = THREE.MathUtils.lerp(flight.pitch, pitchTarget, 1 - Math.exp(-6 * dt));
  flight.bank = THREE.MathUtils.lerp(flight.bank, bankTarget, 1 - Math.exp(-5.2 * dt));
  flight.heading += flight.bank * 0.92 * dt;

  const pitchMul = 1 - flight.pitch * 0.9;
  const flareMul = flight.flare ? 0.62 : 1;
  const targetSpeed = THREE.MathUtils.clamp(BASE_SPEED * pitchMul * flareMul, 6.2, 22);
  flight.speed = THREE.MathUtils.lerp(flight.speed, targetSpeed, 1 - Math.exp(-2.1 * dt));

  let sink = -flight.speed / GLIDE_RATIO;
  sink *= 1 - flight.pitch * 0.95;
  if (flight.flare) sink *= 0.34;

  const pos = glider.root.position;
  flight.inThermal = false;
  for (const thermal of thermals) {
    const radial = Math.hypot(pos.x - thermal.x, pos.z - thermal.z);
    if (radial <= thermal.radius && pos.y >= thermal.bottom && pos.y <= thermal.top) {
      sink += THERMAL_LIFT;
      flight.inThermal = true;
      break;
    }
  }
  flight.verticalSpeed = sink;

  const step = flight.speed * dt;
  pos.x += Math.sin(flight.heading) * step;
  pos.z += Math.cos(flight.heading) * step;
  pos.y += sink * dt;
  flight.distance += step;
  flight.elapsed += dt;

  const hit = sampleGround(pos);
  if (hit) {
    flight.agl = pos.y - hit.point.y;
    flight.maxAgl = Math.max(flight.maxAgl, flight.agl);
    if (flight.agl <= LANDING_AGL) {
      pos.y = hit.point.y + LANDING_AGL;
      const steep = Math.abs(flight.verticalSpeed) >= SAFE_SINK;
      const tipped = Math.abs(flight.bank) > MAX_BANK_LANDING;
      finishFlight(steep || tipped ? 'crashed' : 'landed', Math.abs(flight.verticalSpeed));
    }
  } else {
    flight.agl = pos.y;
  }

  glider.root.rotation.set(flight.pitch * 0.28, flight.heading, 0);
  glider.canopy.rotation.z = -flight.bank;
  glider.canopy.rotation.x = flight.pitch * 0.35 + Math.sin(flight.elapsed * 2.2) * 0.015;
}

function updateCamera(dt: number): void {
  const pos = glider.root.position;
  const back = 15;
  const lift = 5.4;
  camIdeal.set(
    pos.x - Math.sin(flight.heading) * back + Math.sin(flight.heading + Math.PI / 2) * flight.bank * 1.6,
    pos.y + lift - flight.pitch * 1.4,
    pos.z - Math.cos(flight.heading) * back + Math.cos(flight.heading + Math.PI / 2) * flight.bank * 1.6,
  );
  camera.position.lerp(camIdeal, 1 - Math.exp(-3.15 * dt));
  camLookTarget.set(
    pos.x + Math.sin(flight.heading) * 9,
    pos.y + 0.4,
    pos.z + Math.cos(flight.heading) * 9,
  );
  camLook.lerp(camLookTarget, 1 - Math.exp(-5.4 * dt));
  camera.lookAt(camLook);

  sun.target.position.copy(pos);
  sun.position.copy(pos).add(sunOffset);
  sun.target.updateMatrixWorld();
}

function updateHud(): void {
  el.alt.textContent = Math.max(0, flight.agl).toFixed(0).padStart(3, '0');
  el.spd.textContent = (flight.speed * 3.6).toFixed(0).padStart(3, '0');
  const vari = flight.verticalSpeed;
  el.vari.textContent = `${vari >= 0 ? '+' : ''}${vari.toFixed(1)}`;
  el.varioDial.classList.toggle('lift', vari > 0.15);
  el.varioDial.classList.toggle('sink', vari < -0.15);
  const needle = THREE.MathUtils.clamp(0.5 + vari / 10, 0.04, 0.96);
  el.varioNeedle.style.left = `${needle * 100}%`;

  const horiz = Math.max(0.01, flight.speed);
  const liveGlide = flight.verticalSpeed < -0.05 ? horiz / Math.abs(flight.verticalSpeed) : 99;
  el.glide.textContent = liveGlide > 40 ? '∞' : liveGlide.toFixed(1);
  const deg = ((THREE.MathUtils.radToDeg(flight.heading) % 360) + 360) % 360;
  el.hdg.textContent = `HDG ${deg.toFixed(0).padStart(3, '0')}°`;
  el.msl.textContent = `MSL ${glider.root.position.y.toFixed(0)} m`;
  el.thermal.hidden = !flight.inThermal;
}

function updateThermals(time: number): void {
  const positions = thermalParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
  const seeds = thermalParticles.geometry.userData.seeds as Array<{ t: number; s: number }>;
  const n = thermals.length || 1;
  for (let i = 0; i < positions.count; i++) {
    const thermal = thermals[i % n];
    if (!thermal) {
      positions.setXYZ(i, 0, -20, 0);
      continue;
    }
    const seed = seeds[i];
    const climb = ((time * seed.s * 0.18 + seed.t) % 1);
    const ang = seed.t * Math.PI * 2 + time * 0.25;
    const rad = thermal.radius * (0.15 + seed.t * 0.7);
    positions.setXYZ(
      i,
      thermal.x + Math.cos(ang) * rad,
      THREE.MathUtils.lerp(thermal.bottom + 4, thermal.top, climb),
      thermal.z + Math.sin(ang) * rad,
    );
  }
  positions.needsUpdate = true;
  for (const thermal of thermals) {
    const mat = thermal.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = flight.inThermal ? 0.28 : 0.16;
  }
}

function addSkyDressing(): void {
  const skyGeo = new THREE.SphereGeometry(2800, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f90c6) },
      horizon: { value: new THREE.Color(0xd9c7a2) },
      bottom: { value: new THREE.Color(0x8aa56a) },
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
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf4f7fb,
    transparent: true,
    opacity: 0.55,
    roughness: 1,
    depthWrite: false,
  });
  for (let i = 0; i < 10; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(18 + (i % 3) * 6, 10, 8), cloudMat);
    puff.position.set((i - 4.5) * 90, 210 + (i % 4) * 18, -180 + (i % 5) * 70);
    puff.scale.set(2.4, 0.7, 1.4);
    scene.add(puff);
  }
}

function bindControls(): void {
  window.addEventListener('keydown', (event) => {
    keys.add(event.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
      el.banner.classList.add('hidden');
    }
    if (event.key.toLowerCase() === 'r') resetFlight();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => keys.clear());
  el.bannerGo.addEventListener('click', () => el.banner.classList.add('hidden'));
  el.restart.addEventListener('click', resetFlight);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePhysics(dt);
  updateCamera(dt);
  updateHud();
  updateThermals(clock.elapsedTime);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function boot(): Promise<void> {
  addSkyDressing();
  bindControls();
  el.loaderStatus.textContent = 'Looking for Terrain Studio export…';

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const studio = await tryLoadGlb('/terrain.glb', loader);
  if (studio) {
    terrainRoot = studio;
    scene.add(studio);
    const collisionFile = await tryLoadGlb('/collision.glb', loader);
    collisionTarget = collisionFile ?? prepareLoadedTerrain(studio);
    if (collisionFile) scene.add(collisionFile);
    el.source.textContent = 'Terrain Studio · terrain.glb';
    el.loaderStatus.textContent = 'Studio landscape loaded';
  } else {
    const hills = createFallbackTerrain();
    terrainRoot = hills;
    collisionTarget = hills.getObjectByName('Terrain_Surface') ?? hills;
    scene.add(hills);
    el.source.textContent = 'Procedural hills (drop terrain.glb to replace)';
    el.loaderStatus.textContent = 'No terrain.glb — flying the fallback valley';
  }

  terrainRoot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(terrainRoot);
  placeThermals(bounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const launch = sampleGround(new THREE.Vector3(center.x, bounds.max.y + 40, center.z));
  const groundY = launch?.point.y ?? bounds.max.y;
  flight.spawn.set(center.x, groundY + Math.max(95, bounds.getSize(new THREE.Vector3()).y * 0.35 + 70), center.z);
  resetFlight();

  el.hud.hidden = false;
  el.loader.classList.add('hidden');
  tick();
}

void boot();
