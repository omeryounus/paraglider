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
  target: THREE.Vector3 | null,
  visible: boolean,
): void {
  if (!visible || !target) {
    el.hidden = true;
    return;
  }
  ndc.copy(target).project(camera);
  const behind = ndc.z > 1;
  let x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
  let y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
  if (behind || ndc.z < -1) {
    x = window.innerWidth * 0.5 - ndc.x * window.innerWidth * 0.4;
    y = 28;
  }
  const pad = 28;
  x = Math.max(pad, Math.min(window.innerWidth - pad, x));
  y = Math.max(pad, Math.min(window.innerHeight - pad, y));
  el.hidden = false;
  el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}
