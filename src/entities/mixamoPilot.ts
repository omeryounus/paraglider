import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../game/math';
import type { FlightState } from '../game/types';

export interface MixamoPilot {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  bones: Record<string, THREE.Bone>;
  idle: THREE.AnimationAction | null;
  dying: THREE.AnimationAction | null;
  dead: boolean;
}

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

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

function multiplyEuler(bone: THREE.Bone | undefined, x: number, y: number, z: number): void {
  if (!bone) return;
  _euler.set(x, y, z, 'XYZ');
  _quat.setFromEuler(_euler);
  bone.quaternion.multiply(_quat);
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

export async function loadMixamoPilot(): Promise<MixamoPilot | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync('./models/mixamo/pilot.glb');
    const root = gltf.scene;
    root.name = 'Mixamo_Pilot';
    paintPilot(root);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const span = size.y || 1.7;
    root.scale.multiplyScalar((1.7 * 1.08) / span);
    root.updateMatrixWorld(true);
    const fit = new THREE.Box3().setFromObject(root);
    const center = fit.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= fit.min.y;
    root.position.y -= 0.06;
    root.rotation.x = 0.06;

    const mixer = new THREE.AnimationMixer(root);
    const idleClip = gltf.animations.find((c) => /idle/i.test(c.name));
    const dyingClip = gltf.animations.find((c) => /dy/i.test(c.name));
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    const dying = dyingClip ? mixer.clipAction(dyingClip) : null;
    if (idle) {
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.play();
    }
    if (dying) {
      dying.setLoop(THREE.LoopOnce, 1);
      dying.clampWhenFinished = true;
      dying.enabled = false;
    }

    return { root, mixer, bones: boneMap(root), idle, dying, dead: false };
  } catch {
    return null;
  }
}

export function playMixamoDying(mixamo: MixamoPilot): void {
  if (mixamo.dead || !mixamo.dying) return;
  mixamo.dead = true;
  mixamo.dying.enabled = true;
  mixamo.dying.reset();
  if (mixamo.idle) mixamo.dying.crossFadeFrom(mixamo.idle, 0.18, false);
  mixamo.dying.play();
}

export function poseMixamoPilot(
  mixamo: MixamoPilot,
  flight: FlightState,
  steer: number,
  dt: number,
): void {
  mixamo.mixer.update(dt);
  if (mixamo.dead) return;

  const weightShift = THREE.MathUtils.clamp(flight.weightShift + steer * 0.5, -1, 1);
  const leftPull = flight.leftBrake + (flight.flare ? 0.4 : 0);
  const rightPull = flight.rightBrake + (flight.flare ? 0.4 : 0);
  const flare = flight.flare ? 1 : 0;
  const bar = flight.speedBar;
  const { bones } = mixamo;

  multiplyEuler(bones.Hips, 0.32 + flare * 0.08, 0, weightShift * 0.05);
  multiplyEuler(bones.Spine, 0.2 + flare * 0.06, 0, weightShift * 0.1);
  multiplyEuler(bones.Spine1, 0.1, 0, weightShift * 0.06);
  multiplyEuler(bones.Neck, -0.1, weightShift * 0.14, 0);
  multiplyEuler(bones.Head, -0.06, weightShift * 0.12, 0);

  multiplyEuler(bones.LeftUpLeg, 1.5, 0.08, 0.14);
  multiplyEuler(bones.RightUpLeg, 1.5, -0.08, -0.14);
  multiplyEuler(bones.LeftLeg, -1.8 + bar * 0.14, 0, 0);
  multiplyEuler(bones.RightLeg, -1.8 + bar * 0.14, 0, 0);
  multiplyEuler(bones.LeftFoot, 0.3, 0, 0);
  multiplyEuler(bones.RightFoot, 0.3, 0, 0);

  multiplyEuler(bones.LeftShoulder, 0.1, 0.12, 0.32);
  multiplyEuler(bones.RightShoulder, 0.1, -0.12, -0.32);
  multiplyEuler(bones.LeftArm, -0.3, 0.42, 0.12 - leftPull * 0.25);
  multiplyEuler(bones.RightArm, -0.3, -0.42, -0.12 + rightPull * 0.25);
  multiplyEuler(bones.LeftForeArm, 0.18 + leftPull * 0.85, -1.0, 0.32);
  multiplyEuler(bones.RightForeArm, 0.18 + rightPull * 0.85, 1.0, -0.32);

  mixamo.root.rotation.z = damp(mixamo.root.rotation.z, weightShift * 0.16, 7, dt);
  mixamo.root.rotation.x = damp(mixamo.root.rotation.x, 0.06 + flare * 0.07, 6, dt);
}
