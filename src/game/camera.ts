import * as THREE from 'three';
import { damp } from './math';
import type { FlightState } from './types';

const ideal = new THREE.Vector3();
const look = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const sunOffset = new THREE.Vector3(150, 220, 80);

export function stepCamera(
  camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight,
  pos: THREE.Vector3,
  flight: FlightState,
  dt: number,
): { fov: number; shake: number } {
  const boost = flight.boosting || flight.speedBoost > 0;
  const speedT = THREE.MathUtils.smoothstep(flight.speed, 20, 52);
  const fov = 60 + speedT * 16 + (boost ? 8 : 0) + Math.max(0, flight.pitch) * 8;
  camera.fov = damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const back = 15 - speedT * 1.6;
  const lift = 5.6 - flight.pitch * 1.2;
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

  sun.target.position.copy(pos);
  sun.position.copy(pos).add(sunOffset);
  sun.target.updateMatrixWorld();
  return { fov: camera.fov, shake };
}
