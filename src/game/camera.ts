import * as THREE from 'three';
import { damp } from './math';
import type { FlightState } from './types';
import { trackSun, type Atmosphere } from './atmosphere';

const ideal = new THREE.Vector3();
const look = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

export function stepCamera(
  camera: THREE.PerspectiveCamera,
  atmo: Atmosphere,
  pos: THREE.Vector3,
  flight: FlightState,
  dt: number,
): { fov: number; shake: number } {
  const boost = flight.boosting || flight.speedBoost > 0;
  const speedT = THREE.MathUtils.smoothstep(flight.speed, 12, 40);
  const fov = 58 + speedT * 18 + (boost ? 10 : 0) + Math.max(0, flight.pitch) * 6;
  camera.fov = damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const back = 16 + Math.min(10, flight.agl * 0.03) - speedT * 1.2;
  const lift = 5.8 + Math.min(6, flight.agl * 0.012) - flight.pitch * 1.1;
  ideal.set(
    pos.x - Math.sin(flight.heading) * back + Math.sin(flight.heading + Math.PI / 2) * flight.bank * 1.8,
    pos.y + lift,
    pos.z - Math.cos(flight.heading) * back + Math.cos(flight.heading + Math.PI / 2) * flight.bank * 1.8,
  );
  const shake = (boost ? 0.18 : 0) + (flight.inDowndraft ? 0.28 : 0) + (flight.nearMiss ? 0.12 : 0);
  if (shake > 0) {
    ideal.x += (Math.random() - 0.5) * shake;
    ideal.y += (Math.random() - 0.5) * shake;
  }
  camera.position.lerp(ideal, 1 - Math.exp(-3.3 * dt));
  lookTarget.set(
    pos.x + Math.sin(flight.heading) * 10,
    pos.y + 0.3,
    pos.z + Math.cos(flight.heading) * 10,
  );
  look.lerp(lookTarget, 1 - Math.exp(-5.2 * dt));
  camera.lookAt(look);

  trackSun(atmo, pos);
  return { fov: camera.fov, shake };
}
