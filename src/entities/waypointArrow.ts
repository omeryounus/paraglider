import * as THREE from 'three';

export function createWaypointArrow(): THREE.Group {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.8, 3),
    new THREE.MeshBasicMaterial({ color: 0x3ce6ff }),
  );
  cone.rotation.x = Math.PI / 2;
  group.add(cone);
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
  arrow.position.set(from.x, from.y + 5.2, from.z);
  const dir = target.clone().sub(from);
  dir.y = 0;
  if (dir.lengthSq() < 0.01) return;
  const yaw = Math.atan2(dir.x, dir.z);
  arrow.rotation.set(0.15, yaw, 0);
}
