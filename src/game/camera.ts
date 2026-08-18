import * as THREE from 'three';
import { damp } from './math';
import type { FlightState } from './types';
import { trackSun, type Atmosphere } from './atmosphere';
import type { GliderVisual } from '../entities/glider';

const ideal = new THREE.Vector3();
const look = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
let lastHeading = 0;

const DEFAULT_PITCH = 0.19;
const lookRig = { yaw: 0, pitch: 0, zoom: 1 };

export function resetLook(): void {
  lookRig.yaw = 0;
  lookRig.pitch = 0;
  lookRig.zoom = 1;
}

export function orbitLook(dx: number, dy: number): void {
  lookRig.yaw -= dx * 0.005;
  lookRig.pitch = THREE.MathUtils.clamp(lookRig.pitch + dy * 0.004, -0.38, 1.2);
}

export function zoomLook(steps: number): void {
  lookRig.zoom = THREE.MathUtils.clamp(lookRig.zoom * 1.12 ** steps, 0.36, 2.9);
}

export function setLook(yaw: number, pitch = 0): void {
  lookRig.yaw = yaw;
  lookRig.pitch = THREE.MathUtils.clamp(pitch, -0.38, 1.2);
}

export function bindLookControls(canvas: HTMLCanvasElement, isLive: () => boolean): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (event) => {
    if (!isLive() || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitLook(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = (): void => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!isLive()) return;
      event.preventDefault();
      zoomLook(Math.sign(event.deltaY));
    },
    { passive: false },
  );
}

export function snapCamera(pos: THREE.Vector3, heading: number): void {
  lastHeading = heading;
  look.copy(pos).setY(pos.y + 1.85);
  lookTarget.copy(look);
}

export function stepCamera(
  camera: THREE.PerspectiveCamera,
  atmo: Atmosphere,
  pos: THREE.Vector3,
  flight: FlightState,
  dt: number,
  glider: GliderVisual,
  firstPerson: boolean,
): { fov: number; shake: number } {
  const boost = flight.boosting || flight.speedBoost > 0;
  const speedT = THREE.MathUtils.smoothstep(flight.speed, 12, 40);
  const yawRate = flight.heading - lastHeading;
  lastHeading = flight.heading;
  fwd.set(Math.sin(flight.heading), 0, Math.cos(flight.heading));
  right.set(fwd.z, 0, -fwd.x);

  glider.helmet.visible = !firstPerson;

  if (firstPerson) {
    const fov = damp(camera.fov, 64 + speedT * 6 + (boost ? 5 : 0), 5, dt);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const lookYaw = flight.heading + lookRig.yaw;
    fwd.set(Math.sin(lookYaw), 0, Math.cos(lookYaw));
    glider.eye.getWorldPosition(eyePos);
    const mixamo = glider.root.userData.mixamoPilot as { bones?: Record<string, THREE.Bone> } | undefined;
    const head = mixamo?.bones?.Head;
    if (head) head.getWorldPosition(eyePos);
    ideal.copy(eyePos).addScaledVector(fwd, 0.12);
    ideal.y += 0.08;
    camera.position.lerp(ideal, 1 - Math.exp(-12 * dt));
    lookTarget.copy(eyePos).addScaledVector(fwd, 7.5);
    lookTarget.y -= 0.35 + lookRig.pitch * 5;
    look.lerp(lookTarget, 1 - Math.exp(-9 * dt));
    camera.lookAt(look);
    trackSun(atmo, pos);
    return { fov: camera.fov, shake: boost ? 0.08 : 0 };
  }

  const fov = 56 + speedT * 14 + (boost ? 8 : 0) + Math.max(0, flight.pitch) * 5;
  camera.fov = damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const yaw = flight.heading + lookRig.yaw;
  const pitch = DEFAULT_PITCH + lookRig.pitch;
  fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  right.set(fwd.z, 0, -fwd.x);
  const dist = (11.2 + Math.min(2.4, flight.agl * 0.008) - speedT * 0.4) * lookRig.zoom;
  const horiz = Math.cos(pitch) * dist;
  // 0 behind the pilot, 1 when the orbit is looking at their face.
  const frontAmt = 0.5 - 0.5 * Math.cos(lookRig.yaw);
  ideal.copy(pos).addScaledVector(fwd, -horiz).addScaledVector(right, flight.bank * 1.1 + yawRate * 14);
  // Stay under the wing: canopy hangs ~3.6 m above the harness.
  ideal.y += Math.sin(pitch) * dist + 1.15 - frontAmt * 1.7;
  const wingDeck = pos.y + 2.2;
  if (ideal.y > wingDeck) ideal.y = wingDeck;
  const shake = (boost ? 0.12 : 0) + (flight.inDowndraft ? 0.22 : 0) + (flight.nearMiss ? 0.1 : 0);
  if (shake > 0) {
    ideal.x += (Math.random() - 0.5) * shake;
    ideal.y += (Math.random() - 0.5) * shake;
  }
  camera.position.lerp(ideal, 1 - Math.exp(-5 * dt));
  lookTarget.copy(pos).addScaledVector(fwd, 3.4).setY(pos.y + 1.85);
  look.lerp(lookTarget, 1 - Math.exp(-6.2 * dt));
  camera.lookAt(look);
  trackSun(atmo, pos);
  return { fov: camera.fov, shake };
}
