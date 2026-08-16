import * as THREE from 'three';

const ndc = new THREE.Vector3();

export function createWaypointArrow(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Waypoint';
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe082,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const shaft = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), mat);
  shaft.rotation.x = -Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 8), mat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.42;
  group.add(shaft, tip);
  group.renderOrder = 8;
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
  if (arrow.parent) {
    arrow.position.set(0, 4.55, 0.15);
    arrow.lookAt(target);
  } else {
    arrow.position.set(from.x, from.y + 4.55, from.z);
    arrow.lookAt(target);
  }
}

export function paintWaypointHud(
  el: HTMLElement,
  camera: THREE.Camera,
  from: THREE.Vector3,
  target: THREE.Vector3 | null,
  visible: boolean,
): void {
  if (!visible || !target) {
    el.hidden = true;
    return;
  }
  ndc.copy(target).project(camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const offscreen = ndc.z > 1 || ndc.x < -1.05 || ndc.x > 1.05 || ndc.y < -1.05 || ndc.y > 1.05;
  let x = (ndc.x * 0.5 + 0.5) * w;
  let y = (-ndc.y * 0.5 + 0.5) * h;
  if (offscreen) {
    const dx = ndc.z > 1 ? -ndc.x : ndc.x;
    const dy = ndc.z > 1 ? ndc.y : -ndc.y;
    const len = Math.hypot(dx, dy) || 1;
    x = w * 0.5 + (dx / len) * w * 0.42;
    y = h * 0.5 + (dy / len) * h * 0.38;
  }
  const pad = 32;
  x = Math.max(pad, Math.min(w - pad, x));
  y = Math.max(pad, Math.min(h - pad, y));
  const yaw = Math.atan2(target.x - from.x, target.z - from.z);
  const camYaw = Math.atan2(camera.position.x - from.x, camera.position.z - from.z);
  const deg = THREE.MathUtils.radToDeg(yaw - camYaw);
  el.hidden = false;
  el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`;
}
