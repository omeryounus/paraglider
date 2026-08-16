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
    const fov = damp(camera.fov, 68 + speedT * 8 + (boost ? 6 : 0), 5, dt);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    glider.eye.getWorldPosition(eyePos);
    ideal.copy(eyePos).addScaledVector(fwd, -0.55);
    ideal.y += 0.18;
    camera.position.lerp(ideal, 1 - Math.exp(-10 * dt));
    lookTarget.copy(eyePos).addScaledVector(fwd, 8);
    lookTarget.y += 0.22;
    look.lerp(lookTarget, 1 - Math.exp(-8 * dt));
    camera.lookAt(look);
    trackSun(atmo, pos);
    return { fov: camera.fov, shake: boost ? 0.08 : 0 };
  }

  const fov = 56 + speedT * 14 + (boost ? 8 : 0) + Math.max(0, flight.pitch) * 5;
  camera.fov = damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const back = 9.4 + Math.min(3.2, flight.agl * 0.01) - speedT * 0.5;
  const lift = 2.55 + Math.min(1.2, flight.agl * 0.005) - flight.pitch * 0.35;
  ideal.copy(pos).addScaledVector(fwd, -back).addScaledVector(right, flight.bank * 1.1 + yawRate * 14);
  ideal.y += lift;
  const shake = (boost ? 0.12 : 0) + (flight.inDowndraft ? 0.22 : 0) + (flight.nearMiss ? 0.1 : 0);
  if (shake > 0) {
    ideal.x += (Math.random() - 0.5) * shake;
    ideal.y += (Math.random() - 0.5) * shake;
  }
  camera.position.lerp(ideal, 1 - Math.exp(-5 * dt));
  lookTarget.copy(pos).addScaledVector(fwd, 4.8).setY(pos.y + 1.55);
  look.lerp(lookTarget, 1 - Math.exp(-6.2 * dt));
  camera.lookAt(look);
  trackSun(atmo, pos);
  return { fov: camera.fov, shake };
}
