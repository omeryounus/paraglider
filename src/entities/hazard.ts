import * as THREE from 'three';

export interface HazardZone {
  x: number;
  z: number;
  radius: number;
  bottom: number;
  top: number;
  wander: number;
  baseX: number;
  baseZ: number;
  group: THREE.Group;
}

export function createDowndraft(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  wander = 0,
): HazardZone {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const mist = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.85, radius, height, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff4d4d,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mist.position.y = y + height * 0.42;
  group.add(mist);
  group.renderOrder = 2;
  return {
    x,
    z,
    radius,
    bottom: y,
    top: y + height,
    wander,
    baseX: x,
    baseZ: z,
    group,
  };
}

export function updateHazard(zone: HazardZone, time: number): void {
  if (zone.wander <= 0) return;
  zone.x = zone.baseX + Math.sin(time * 0.55 + zone.baseZ * 0.01) * zone.wander;
  zone.z = zone.baseZ + Math.cos(time * 0.42 + zone.baseX * 0.01) * zone.wander;
  zone.group.position.set(zone.x, 0, zone.z);
}
