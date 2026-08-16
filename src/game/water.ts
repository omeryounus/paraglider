import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { createWaterNormal } from './materials';
import { WORLD_SIZE } from '../config/constants';

export function createCoastalWater(sunDir: THREE.Vector3): Water {
  const water = new Water(new THREE.PlaneGeometry(WORLD_SIZE * 1.4, WORLD_SIZE * 1.4), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: createWaterNormal(),
    sunDirection: sunDir.clone(),
    sunColor: 0xfff2d0,
    waterColor: 0x0b6a78,
    distortionScale: 3.6,
    fog: true,
    alpha: 0.92,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.name = 'Water';
  return water;
}

export function updateWater(water: Water | null, dt: number, sunDir: THREE.Vector3): void {
  if (!water) return;
  const uniforms = (water.material as THREE.ShaderMaterial).uniforms;
  uniforms['time'].value += dt;
  uniforms['sunDirection'].value.copy(sunDir);
}
