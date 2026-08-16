import * as THREE from 'three';

export interface Popup {
  el: HTMLDivElement;
  life: number;
  world: THREE.Vector3;
}

export function spawnPopup(
  host: HTMLElement,
  world: THREE.Vector3,
  text: string,
  color: string,
): Popup {
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  el.style.color = color;
  host.appendChild(el);
  return { el, life: 1.1, world: world.clone() };
}

export function updatePopups(
  popups: Popup[],
  camera: THREE.Camera,
  width: number,
  height: number,
  dt: number,
): void {
  const projected = new THREE.Vector3();
  for (let i = popups.length - 1; i >= 0; i--) {
    const pop = popups[i];
    pop.life -= dt;
    pop.world.y += dt * 6;
    projected.copy(pop.world).project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    pop.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    pop.el.style.opacity = String(Math.max(0, pop.life / 1.1));
    if (pop.life <= 0) {
      pop.el.remove();
      popups.splice(i, 1);
    }
  }
}

export function createThermalDust(): THREE.Points {
  const count = 280;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.userData.seeds = Array.from({ length: count }, (_, i) => i * 0.137);
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xffe7a8,
      size: 0.5,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
}

export function updateThermalDust(
  points: THREE.Points,
  zones: Array<{ x: number; z: number; radius: number; bottom: number; top: number }>,
  time: number,
): void {
  const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const seeds = points.geometry.userData.seeds as number[];
  const n = zones.length || 1;
  for (let i = 0; i < pos.count; i++) {
    const zone = zones[i % n];
    if (!zone) {
      pos.setXYZ(i, 0, -40, 0);
      continue;
    }
    const s = seeds[i];
    const climb = (time * 0.16 + s) % 1;
    const ang = s * 12 + time * 0.3;
    const rad = zone.radius * (0.12 + (s % 1) * 0.75);
    pos.setXYZ(
      i,
      zone.x + Math.cos(ang) * rad,
      THREE.MathUtils.lerp(zone.bottom + 3, zone.top, climb),
      zone.z + Math.sin(ang) * rad,
    );
  }
  pos.needsUpdate = true;
}
