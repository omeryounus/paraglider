import * as THREE from 'three';

export interface LandingPad {
  group: THREE.Group;
  position: THREE.Vector3;
  heading: number;
  radii: { bullseye: number; mid: number; outer: number };
}

export function createLandingPad(position: THREE.Vector3, heading: number): LandingPad {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = heading;

  const rings: Array<[number, number, number]> = [
    [28, 0x2a3340, 0.55],
    [16, 0xf0d060, 0.72],
    [8, 0xff5a4a, 0.88],
  ];
  for (const [r, color, opacity] of rings) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.08;
    group.add(disc);
  }

  const flags = [-18, 18];
  for (const x of flags) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: 0xded8ce }),
    );
    pole.position.set(x, 2.1, 0);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, side: THREE.DoubleSide }),
    );
    flag.position.set(x + 0.8, 3.6, 0);
    group.add(pole, flag);
  }

  return {
    group,
    position: position.clone(),
    heading,
    radii: { bullseye: 8, mid: 16, outer: 28 },
  };
}

export function landingBand(
  pad: LandingPad,
  pos: THREE.Vector3,
): 'bullseye' | 'mid' | 'outer' | null {
  const dx = pos.x - pad.position.x;
  const dz = pos.z - pad.position.z;
  const d = Math.hypot(dx, dz);
  if (d <= pad.radii.bullseye) return 'bullseye';
  if (d <= pad.radii.mid) return 'mid';
  if (d <= pad.radii.outer) return 'outer';
  return null;
}
