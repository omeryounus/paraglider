import * as THREE from 'three';

export interface EnergyOrb {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  collected: boolean;
  spin: number;
}

export function createOrb(position: THREE.Vector3): EnergyOrb {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({
      color: 0x7cf0ff,
      emissive: 0x1ad4e6,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  return { mesh, position: position.clone(), collected: false, spin: Math.random() * Math.PI };
}

export function updateOrb(orb: EnergyOrb, time: number): void {
  if (orb.collected) {
    orb.mesh.visible = false;
    return;
  }
  orb.mesh.position.y = orb.position.y + Math.sin(time * 2.6 + orb.spin) * 0.55;
  orb.mesh.rotation.y = time * 1.8 + orb.spin;
}
