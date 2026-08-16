import * as THREE from 'three';

export function createWaypointArrow(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe082, depthTest: true });
  const shaft = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 8), mat);
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.42, 8), mat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.42;
  group.add(shaft, tip);
  group.visible = false;
  return group;
}

export function updateWaypointArrow(
  arrow: THREE.Group,
  from: THREE.Vector3,
  target: THREE.Vector3 | null,
): void {
  if (!target) {
    arrow.visible = false;
    return;
  }
  arrow.visible = true;
  arrow.position.set(from.x, from.y + 4.05, from.z);
  const yaw = Math.atan2(target.x - from.x, target.z - from.z);
  arrow.rotation.set(0.12, yaw, 0);
}
