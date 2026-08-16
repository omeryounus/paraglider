import * as THREE from 'three';

export interface GliderVisual {
  root: THREE.Group;
  canopy: THREE.Group;
}

export function createGlider(): GliderVisual {
  const root = new THREE.Group();
  root.name = 'Paraglider';

  const canopy = new THREE.Group();
  canopy.position.y = 2.55;
  const wing = new THREE.Mesh(
    createCanopyGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  wing.castShadow = true;
  canopy.add(wing);

  const linePos: number[] = [];
  const riser = new THREE.Vector3(0, -2.55, 0.15);
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    const x = (u - 0.5) * 7.6;
    const arc = (Math.abs(u - 0.5) * 2) ** 2 * 0.92;
    linePos.push(x, 0.15 - arc, -0.15, riser.x, riser.y, riser.z);
    linePos.push(x, -0.12 - arc, 1.55, riser.x, riser.y, riser.z);
  }
  canopy.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(linePos, 3),
      ),
      new THREE.LineBasicMaterial({ color: 0xd8d2c6, transparent: true, opacity: 0.7 }),
    ),
  );

  const harness = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.55, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.7 }),
  );
  harness.rotation.x = 0.35;
  harness.position.set(0, 0.15, 0.12);
  harness.castShadow = true;

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xe36a28, roughness: 0.35 }),
  );
  helmet.position.set(0, 0.62, 0.28);
  helmet.castShadow = true;

  const legs = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 0.45, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2730, roughness: 0.8 }),
  );
  legs.rotation.x = 1.15;
  legs.position.set(0, -0.18, 0.42);

  root.add(canopy, harness, helmet, legs);
  return { root, canopy };
}

function createCanopyGeometry(): THREE.BufferGeometry {
  const span = 8.8;
  const chord = 2.65;
  const segsX = 26;
  const segsZ = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= segsZ; j++) {
    const v = j / segsZ;
    for (let i = 0; i <= segsX; i++) {
      const u = i / segsX;
      const taper = 1 - 0.2 * (Math.abs(u - 0.5) * 2) ** 2.6;
      const x = (u - 0.5) * span;
      const z = (v - 0.18) * chord * taper;
      const camber = Math.sin(Math.PI * Math.min(1, v * 1.05)) * 0.46 * taper;
      const arc = (Math.abs(u - 0.5) * 2) ** 2 * 0.92;
      positions.push(x, camber - arc, z);
      uvs.push(u, v);
      const cell = Math.floor(u * 12);
      if (cell % 3 === 0) colors.push(0.94, 0.42, 0.18);
      else if (cell % 3 === 1) colors.push(0.96, 0.94, 0.9);
      else colors.push(0.13, 0.24, 0.4);
    }
  }

  for (let j = 0; j < segsZ; j++) {
    for (let i = 0; i < segsX; i++) {
      const a = j * (segsX + 1) + i;
      const b = a + 1;
      const c = a + (segsX + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function poseGlider(
  visual: GliderVisual,
  heading: number,
  pitch: number,
  bank: number,
  time: number,
): void {
  visual.root.rotation.set(pitch * 0.32, heading, 0);
  visual.canopy.rotation.z = -bank;
  visual.canopy.rotation.x = pitch * 0.38 + Math.sin(time * 2.4) * 0.016;
}
