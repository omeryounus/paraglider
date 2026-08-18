import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { damp } from '../game/math';
import type { FlightState } from '../game/types';

export interface MixamoPilot {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  bones: Record<string, THREE.Bone>;
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

function styleMixamo(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) continue;
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.fog = true;
      mat.metalness = 0;
      mat.roughness = 0.78;
      mat.envMapIntensity = 0.14;
      const name = (mesh.name + ' ' + (mat.name || '')).toLowerCase();
      if (name.includes('joint') || name.includes('surface')) {
        // X Bot: charcoal flight suit, not the default grey mannequin.
        mat.color.setHex(0x1c2228);
      } else {
        mat.color.setHex(0x2a3036);
      }
      mat.needsUpdate = true;
    }
  });
}

export async function loadMixamoPilot(): Promise<MixamoPilot | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync('./models/mixamo/xbot.glb');
    const root = gltf.scene;
    root.name = 'Mixamo_XBot';
    styleMixamo(root);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const span = size.y || 1.7;
    root.scale.multiplyScalar((1.7 * 1.12) / span);
    root.updateMatrixWorld(true);
    const fit = new THREE.Box3().setFromObject(root);
    const center = fit.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= fit.min.y;
    root.position.y -= 0.06;
    root.rotation.x = 0.08;

    const mixer = new THREE.AnimationMixer(root);
    const idle =
      gltf.animations.find((clip) => /idle/i.test(clip.name)) ?? gltf.animations[0];
    if (idle) {
      const action = mixer.clipAction(idle);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    }

    return { root, mixer, bones: boneMap(root) };
  } catch {
    return null;
  }
}

export function poseMixamoPilot(
  mixamo: MixamoPilot,
  flight: FlightState,
  steer: number,
  dt: number,
): void {
  mixamo.mixer.update(dt);

  const weightShift = THREE.MathUtils.clamp(flight.weightShift + steer * 0.5, -1, 1);
  const leftPull = flight.leftBrake + (flight.flare ? 0.4 : 0);
  const rightPull = flight.rightBrake + (flight.flare ? 0.4 : 0);
  const flare = flight.flare ? 1 : 0;
  const bar = flight.speedBar;

  const { bones } = mixamo;

  // Sit the Mixamo T-pose into the harness after the idle clip writes.
  multiplyEuler(bones.Hips, 0.35 + flare * 0.08, 0, weightShift * 0.05);
  multiplyEuler(bones.Spine, 0.22 + flare * 0.06, 0, weightShift * 0.1);
  multiplyEuler(bones.Spine1, 0.1, 0, weightShift * 0.06);
  multiplyEuler(bones.Neck, -0.1, weightShift * 0.14, 0);
  multiplyEuler(bones.Head, -0.06, weightShift * 0.12, 0);

  multiplyEuler(bones.LeftUpLeg, 1.55, 0.08, 0.16);
  multiplyEuler(bones.RightUpLeg, 1.55, -0.08, -0.16);
  multiplyEuler(bones.LeftLeg, -1.85 + bar * 0.14, 0, 0);
  multiplyEuler(bones.RightLeg, -1.85 + bar * 0.14, 0, 0);
  multiplyEuler(bones.LeftFoot, 0.32, 0, 0);
  multiplyEuler(bones.RightFoot, 0.32, 0, 0);

  // Hands up at the toggles; pull folds the elbows.
  multiplyEuler(bones.LeftShoulder, 0.1, 0.15, 0.35);
  multiplyEuler(bones.RightShoulder, 0.1, -0.15, -0.35);
  multiplyEuler(bones.LeftArm, -0.35, 0.45, 0.15 - leftPull * 0.25);
  multiplyEuler(bones.RightArm, -0.35, -0.45, -0.15 + rightPull * 0.25);
  multiplyEuler(bones.LeftForeArm, 0.2 + leftPull * 0.85, -1.05, 0.35);
  multiplyEuler(bones.RightForeArm, 0.2 + rightPull * 0.85, 1.05, -0.35);
  multiplyEuler(bones.LeftHand, 0.15, 0, 0.2);
  multiplyEuler(bones.RightHand, 0.15, 0, -0.2);

  mixamo.root.rotation.z = damp(mixamo.root.rotation.z, weightShift * 0.16, 7, dt);
  mixamo.root.rotation.x = damp(mixamo.root.rotation.x, 0.08 + flare * 0.07, 6, dt);
}
