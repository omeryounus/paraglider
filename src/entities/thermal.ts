import * as THREE from 'three';

export interface ThermalZone {
  x: number;
  z: number;
  radius: number;
  bottom: number;
  top: number;
  group: THREE.Group;
}

export function createThermal(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
): ThermalZone {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.78, radius, height, 22, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd56a,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  shaft.position.y = y + height * 0.45;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.62, radius, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffe7a0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y + 1.2;
  group.add(shaft, ring);
  group.renderOrder = 2;
  return { x, z, radius, bottom: y, top: y + height, group };
}

export function containsCylinder(
  zone: { x: number; z: number; radius: number; bottom: number; top: number },
  pos: THREE.Vector3,
): boolean {
  if (pos.y < zone.bottom || pos.y > zone.top) return false;
  return Math.hypot(pos.x - zone.x, pos.z - zone.z) <= zone.radius;
}
