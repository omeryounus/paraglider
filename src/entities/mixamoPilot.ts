import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../game/math';
import type { FlightState } from '../game/types';

export type PilotGait = 'sit' | 'walk' | 'run' | 'jump' | 'die';

export interface MixamoPilot {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  bones: Record<string, THREE.Bone>;
  bind: Record<string, THREE.Quaternion>;
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  jump: THREE.AnimationAction | null;
  dying: THREE.AnimationAction | null;
  dead: boolean;
  gait: PilotGait;
  age: number;
  leftGrip: THREE.Object3D;
  rightGrip: THREE.Object3D;
}

const POSE_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'RightShoulder',
  'LeftArm',
  'RightArm',
  'LeftForeArm',
  'RightForeArm',
  'LeftHand',
  'RightHand',
  'LeftHandIndex1',
  'LeftHandIndex2',
  'LeftHandIndex3',
  'RightHandIndex1',
  'RightHandIndex2',
  'RightHandIndex3',
  'LeftUpLeg',
  'RightUpLeg',
  'LeftLeg',
  'RightLeg',
  'LeftFoot',
  'RightFoot',
] as const;

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _target = new THREE.Vector3();
const _left = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _upW = new THREE.Vector3();
const _chest = new THREE.Vector3();

function boneMap(root: THREE.Object3D): Record<string, THREE.Bone> {
  const out: Record<string, THREE.Bone> = {};
  root.traverse((obj) => {
    const bone = obj as THREE.Bone;
    if (!bone.isBone) return;
    const short = bone.name.replace(/^mixamorig:/, '').replace(/^mixamorig/, '');
    out[short] = bone;
    out[bone.name] = bone;
  });
  return out;
}

function captureBind(bones: Record<string, THREE.Bone>): Record<string, THREE.Quaternion> {
  const bind: Record<string, THREE.Quaternion> = {};
  for (const name of POSE_BONES) {
    const bone = bones[name];
    if (bone) bind[name] = bone.quaternion.clone();
  }
  return bind;
}

function fromBind(bone: THREE.Bone | undefined, bind: THREE.Quaternion | undefined, x: number, y: number, z: number): void {
  if (!bone || !bind) return;
  _euler.set(x, y, z, 'XYZ');
  bone.quaternion.copy(bind).multiply(_quat.setFromEuler(_euler));
}

function hardenPilotMaterial(src: THREE.Material): THREE.MeshStandardMaterial {
  const mapped = src as THREE.MeshStandardMaterial;
  const existingMap = 'map' in src ? mapped.map : null;
  const suit = mapped.isMeshStandardMaterial
    ? mapped.clone()
    : new THREE.MeshStandardMaterial({
        map: existingMap ?? null,
        color: 0xffffff,
      });
  suit.color.set(0xffffff);
  suit.metalness = 0;
  suit.roughness = 0.72;
  suit.fog = true;
  suit.envMapIntensity = 0.18;
  suit.transparent = false;
  suit.opacity = 1;
  suit.depthWrite = true;
  suit.depthTest = true;
  suit.side = THREE.FrontSide;
  suit.alphaTest = 0;
  if (suit.map) {
    suit.map.colorSpace = THREE.SRGBColorSpace;
    suit.map.anisotropy = 8;
    suit.map.needsUpdate = true;
  }
  suit.needsUpdate = true;
  return suit;
}

function paintPilot(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const hardened = mats.map((m) => hardenPilotMaterial(m));
    mesh.material = hardened.length === 1 ? hardened[0] : hardened;
  });
}

function makeGrip(name: string, bone: THREE.Bone | undefined): THREE.Object3D {
  const grip = new THREE.Group();
  grip.name = name;
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a1e18, roughness: 0.48, metalness: 0, fog: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 10), mat);
  ring.rotation.x = Math.PI / 2;
  grip.add(ring);
  grip.position.set(0, 0.055, 0);
  if (bone) bone.add(grip);
  return grip;
}

export async function loadMixamoPilot(): Promise<MixamoPilot | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync('./models/mixamo/pilot.glb');
    const root = gltf.scene;
    root.name = 'Mixamo_Pilot';
    paintPilot(root);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const span = size.y || 1.7;
    root.scale.multiplyScalar((1.7 * 1.22) / span);
    root.updateMatrixWorld(true);
    const fit = new THREE.Box3().setFromObject(root);
    const center = fit.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= fit.min.y;
    root.position.y -= 0.06;
    root.rotation.x = 0.06;

    const bones = boneMap(root);
    const bind = captureBind(bones);
    const leftGrip = makeGrip('LeftToggleGrip', bones.LeftHand);
    const rightGrip = makeGrip('RightToggleGrip', bones.RightHand);

    const mixer = new THREE.AnimationMixer(root);
    const clipOf = (re: RegExp) => gltf.animations.find((c) => re.test(c.name));
    const makeLoop = (clip: THREE.AnimationClip | undefined, loop: THREE.AnimationActionLoopStyles) => {
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
      action.clampWhenFinished = loop === THREE.LoopOnce;
      action.enabled = false;
      action.weight = 0;
      return action;
    };
    const idle = makeLoop(clipOf(/idle/i), THREE.LoopRepeat);
    const walk = makeLoop(clipOf(/walk/i), THREE.LoopRepeat);
    const run = makeLoop(clipOf(/run/i), THREE.LoopRepeat);
    const jump = makeLoop(clipOf(/jump/i), THREE.LoopOnce);
    const dying = makeLoop(clipOf(/dy/i), THREE.LoopOnce);

    const mixamo: MixamoPilot = {
      root,
      mixer,
      bones,
      bind,
      idle,
      walk,
      run,
      jump,
      dying,
      dead: false,
      gait: 'sit',
      age: 0,
      leftGrip,
      rightGrip,
    };
    poseMixamoPilot(mixamo, REST_FLIGHT, 0, 0);
    return mixamo;
  } catch {
    return null;
  }
}

const REST_FLIGHT: FlightState = {
  heading: 0,
  pitch: 0,
  bank: 0,
  speed: 12,
  verticalSpeed: 0,
  boost: 0,
  boosting: false,
  flare: false,
  speedBoost: 0,
  agl: 40,
  asl: 400,
  nearMiss: false,
  inThermal: false,
  inDowndraft: false,
  windX: 0,
  windZ: 0,
  leftBrake: 0,
  rightBrake: 0,
  speedBar: 0,
  weightShift: 0,
  bigEars: false,
  stall: false,
  stallCharge: 0,
  harnessRoll: 0,
  harnessPitch: 0,
  glideRatio: 11,
};

export function playMixamoDying(mixamo: MixamoPilot): void {
  if (mixamo.dead || !mixamo.dying) return;
  mixamo.dead = true;
  setMixamoGait(mixamo, 'die');
}

export function setMixamoGait(mixamo: MixamoPilot, gait: PilotGait): void {
  if (mixamo.gait === gait && gait !== 'die') return;
  mixamo.gait = gait;
  const all = [mixamo.idle, mixamo.walk, mixamo.run, mixamo.jump, mixamo.dying];
  const pick =
    gait === 'walk' ? mixamo.walk :
    gait === 'run' ? mixamo.run :
    gait === 'jump' ? mixamo.jump :
    gait === 'die' ? mixamo.dying :
    null;
  for (const action of all) {
    if (!action) continue;
    if (action === pick) {
      action.enabled = true;
      action.reset();
      action.setEffectiveWeight(1);
      action.play();
    } else {
      action.fadeOut(0.16);
      action.enabled = action === mixamo.dying;
    }
  }
}

export function poseMixamoPilot(
  mixamo: MixamoPilot,
  flight: FlightState,
  steer: number,
  dt: number,
): void {
  try {
    if (mixamo.gait !== 'sit' && !mixamo.dead) {
      mixamo.age += dt;
      mixamo.mixer.update(dt);
      const hasClip =
        (mixamo.gait === 'walk' && mixamo.walk) ||
        (mixamo.gait === 'run' && mixamo.run) ||
        (mixamo.gait === 'jump' && mixamo.jump);
      if (!hasClip) {
        const cadence = mixamo.gait === 'run' ? 11 : 7;
        const swing = Math.sin(mixamo.age * cadence) * (mixamo.gait === 'run' ? 0.85 : 0.55);
        const { bones, bind } = mixamo;
        fromBind(bones.LeftUpLeg, bind.LeftUpLeg, swing, 0.05, 0.08);
        fromBind(bones.RightUpLeg, bind.RightUpLeg, -swing, -0.05, -0.08);
        fromBind(bones.LeftLeg, bind.LeftLeg, -0.4 - Math.max(0, swing) * 0.6, 0, 0);
        fromBind(bones.RightLeg, bind.RightLeg, -0.4 - Math.max(0, -swing) * 0.6, 0, 0);
        fromBind(bones.LeftArm, bind.LeftArm, -swing * 0.45, 0.2, -0.15);
        fromBind(bones.RightArm, bind.RightArm, swing * 0.45, -0.2, 0.15);
      }
      mixamo.root.rotation.x = damp(mixamo.root.rotation.x, 0, 8, dt);
      mixamo.root.rotation.z = damp(mixamo.root.rotation.z, 0, 8, dt);
      mixamo.root.updateMatrixWorld(true);
      return;
    }
    poseSeatedPilot(mixamo, flight, steer, dt);
  } catch (err) {
    console.error('poseMixamoPilot', err);
  }
}

function poseSeatedPilot(
  mixamo: MixamoPilot,
  flight: FlightState,
  steer: number,
  dt: number,
): void {
  mixamo.age += dt;
  mixamo.mixer.update(dt);
  if (mixamo.dead) return;

  const weightShift = THREE.MathUtils.clamp(flight.weightShift + steer * 0.5, -1, 1);
  const leftPull = THREE.MathUtils.clamp(flight.leftBrake + (flight.flare ? 0.45 : 0), 0, 1);
  const rightPull = THREE.MathUtils.clamp(flight.rightBrake + (flight.flare ? 0.45 : 0), 0, 1);
  const flare = flight.flare ? 1 : 0;
  const bar = flight.speedBar;
  const breath = Math.sin(mixamo.age * 2.1) * 0.025;
  const { bones, bind } = mixamo;

  fromBind(bones.Hips, bind.Hips, 0.38 + flare * 0.08, 0, weightShift * 0.07);
  fromBind(bones.Spine, bind.Spine, 0.16 + flare * 0.05 + breath, 0, weightShift * 0.12);
  fromBind(bones.Spine1, bind.Spine1, 0.1 + breath * 0.4, 0, weightShift * 0.08);
  fromBind(bones.Spine2, bind.Spine2, 0.04, 0, weightShift * 0.04);
  fromBind(bones.Neck, bind.Neck, -0.12 + breath, weightShift * 0.18, 0);
  fromBind(bones.Head, bind.Head, -0.08, weightShift * 0.16, 0);

  fromBind(bones.LeftUpLeg, bind.LeftUpLeg, 1.48, 0.1, 0.16);
  fromBind(bones.RightUpLeg, bind.RightUpLeg, 1.48, -0.1, -0.16);
  fromBind(bones.LeftLeg, bind.LeftLeg, -1.72 + bar * 0.22, 0, 0);
  fromBind(bones.RightLeg, bind.RightLeg, -1.72 + bar * 0.22, 0, 0);
  fromBind(bones.LeftFoot, bind.LeftFoot, 0.32, 0, 0);
  fromBind(bones.RightFoot, bind.RightFoot, 0.32, 0, 0);

  // T-pose bind: hands on the ear-level brake toggles; pull drops them toward the hips.
  fromBind(bones.LeftShoulder, bind.LeftShoulder, 0.1, 0.22, 0.14);
  fromBind(bones.RightShoulder, bind.RightShoulder, 0.1, -0.22, -0.14);
  fromBind(bones.LeftArm, bind.LeftArm, -0.52 - leftPull * 0.22, 0.32, -0.22 + leftPull * 0.85);
  fromBind(bones.RightArm, bind.RightArm, -0.52 - rightPull * 0.22, -0.32, 0.22 - rightPull * 0.85);
  fromBind(bones.LeftForeArm, bind.LeftForeArm, 0.4 + leftPull * 1.25, -1.22, 0.2);
  fromBind(bones.RightForeArm, bind.RightForeArm, 0.4 + rightPull * 1.25, 1.22, -0.2);
  fromBind(bones.LeftHand, bind.LeftHand, 0.4 + leftPull * 0.25, 0.1, 0.4);
  fromBind(bones.RightHand, bind.RightHand, 0.4 + rightPull * 0.25, -0.1, -0.4);
  // Auto-rig maps every finger onto the index chain — curl it into a fist on the toggles.
  fromBind(bones.LeftHandIndex1, bind.LeftHandIndex1, 1.22, 0.08, 0.12);
  fromBind(bones.LeftHandIndex2, bind.LeftHandIndex2, 1.45, 0, 0);
  fromBind(bones.LeftHandIndex3, bind.LeftHandIndex3, 1.18, 0, 0);
  fromBind(bones.RightHandIndex1, bind.RightHandIndex1, 1.22, -0.08, -0.12);
  fromBind(bones.RightHandIndex2, bind.RightHandIndex2, 1.45, 0, 0);
  fromBind(bones.RightHandIndex3, bind.RightHandIndex3, 1.18, 0, 0);

  mixamo.root.rotation.z = damp(mixamo.root.rotation.z, weightShift * 0.16, 7, dt);
  mixamo.root.rotation.x = damp(mixamo.root.rotation.x, 0.06 + flare * 0.07, 6, dt);
  mixamo.root.updateMatrixWorld(true);
}

export function mixamoHandAnchors(mixamo: MixamoPilot): { left: THREE.Object3D; right: THREE.Object3D } {
  return { left: mixamo.leftGrip, right: mixamo.rightGrip };
}

export function placeMixamoGear(
  mixamo: MixamoPilot,
  leftRiser: THREE.Object3D,
  rightRiser: THREE.Object3D,
  leftCar?: THREE.Object3D | null,
  rightCar?: THREE.Object3D | null,
): void {
  const chest = mixamo.bones.Spine2 ?? mixamo.bones.Spine1 ?? mixamo.bones.Spine;
  if (!chest) return;
  chest.updateWorldMatrix(true, false);
  chest.getWorldPosition(_chest);
  mixamo.root.matrixWorld.extractBasis(_left, _upW, _fwd);
  _left.normalize();
  _upW.normalize();
  _fwd.normalize();

  const put = (obj: THREE.Object3D | null | undefined, side: number): void => {
    if (!obj?.parent) return;
    _target.copy(_chest)
      .addScaledVector(_left, side * 0.16)
      .addScaledVector(_upW, 0.04)
      .addScaledVector(_fwd, 0.07);
    obj.parent.worldToLocal(_target);
    obj.position.copy(_target);
  };
  put(leftRiser, -1);
  put(rightRiser, 1);
  put(leftCar, -1);
  put(rightCar, 1);
}
