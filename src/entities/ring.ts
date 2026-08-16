import * as THREE from 'three';
import type { RingKind } from '../game/types';

const PALETTE: Record<RingKind, number> = {
  green: 0x3ee08a,
  gold: 0xffc14a,
  boost: 0x3ce6ff,
};

export interface CourseRing {
  mesh: THREE.Group;
  torus: THREE.Mesh;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  type: RingKind;
  collected: boolean;
  missed: boolean;
  pulse: number;
}

export function createRing(
  position: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  type: RingKind,
): CourseRing {
  const color = PALETTE[type];
  const group = new THREE.Group();
  group.position.copy(position);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal.clone().normalize(),
  );
  group.quaternion.copy(quat);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, type === 'gold' ? 0.42 : 0.36, 10, 40),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: type === 'boost' ? 2.1 : 1.45,
      roughness: 0.28,
      metalness: 0.08,
    }),
  );
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(radius, type === 'gold' ? 0.72 : 0.62, 8, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  group.add(torus, glow, disc);
  return {
    mesh: group,
    torus,
    position: position.clone(),
    normal: normal.clone().normalize(),
    radius,
    type,
    collected: false,
    missed: false,
    pulse: Math.random() * Math.PI * 2,
  };
}

export function updateRingVisual(ring: CourseRing, active: boolean, time: number): void {
  const mat = ring.torus.material as THREE.MeshStandardMaterial;
  if (ring.collected) {
    ring.mesh.scale.setScalar(1.25 + Math.min(0.8, (time % 1) * 0.1));
    mat.opacity = 0.08;
    ring.mesh.visible = ring.mesh.scale.x < 1.9;
    return;
  }
  if (ring.missed) {
    mat.color.setHex(0x88919a);
    mat.opacity = 0.28;
    return;
  }
  const pulse = ring.type === 'boost' ? 1 + Math.sin(time * 8 + ring.pulse) * 0.08 : 1;
  ring.mesh.scale.setScalar(active ? 1.06 * pulse : 0.96 * pulse);
  mat.opacity = active ? 1 : 0.55;
}
