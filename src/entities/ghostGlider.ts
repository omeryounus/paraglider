import * as THREE from 'three';
import { sampleGhost, type GhostTape } from '../game/ghost';
import { SPAN } from '../config/constants';

export interface GhostVisual {
  root: THREE.Group;
  tape: GhostTape;
}

export function createGhostVisual(tape: GhostTape): GhostVisual {
  const root = new THREE.Group();
  root.name = 'Ghost';
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x7cf0ff,
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth);
  wing.scale.set(SPAN * 0.42, 0.55, 1.15);
  wing.position.y = 3.4;
  wing.rotation.x = Math.PI;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), cloth);
  body.position.y = 0.9;
  root.add(wing, body);
  root.visible = false;
  return { root, tape };
}

export function stepGhost(ghost: GhostVisual, t: number): void {
  const sample = sampleGhost(ghost.tape, t);
  if (!sample) {
    ghost.root.visible = false;
    return;
  }
  ghost.root.visible = true;
  ghost.root.position.set(sample.x, sample.y, sample.z);
  ghost.root.rotation.set(0, sample.heading, -sample.bank * 0.35);
}
