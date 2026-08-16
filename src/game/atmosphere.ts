import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { LevelDef } from './types';

export interface Atmosphere {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
  dispose: (scene: THREE.Scene) => void;
}

export function createAtmosphere(level: LevelDef, scene: THREE.Scene): Atmosphere {
  const sky = new Sky();
  sky.name = 'SkyDome';
  sky.scale.setScalar(12000);
  sky.material.fog = false;
  scene.add(sky);

  const sunDir = new THREE.Vector3();
  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = Math.max(4, level.atmosphere.turbidity);
  uniforms['rayleigh'].value = 2.2;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;

  const elevation = THREE.MathUtils.clamp(level.atmosphere.elevation, 15, 25);
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(level.atmosphere.azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sunDir);

  scene.fog = new THREE.FogExp2(0x9bc5e2, 0.0008);
  scene.background = new THREE.Color(0x87c4e8);

  const hemi = new THREE.HemisphereLight(0x7ec0ee, 0x3a4f2e, 0.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffeedd, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.04;
  sun.position.copy(sunDir).multiplyScalar(280);
  scene.add(sun);
  scene.add(sun.target);
  return {
    sky,
    sun,
    hemi,
    sunDir,
    dispose: (host) => {
      host.remove(sky, sun, hemi, sun.target);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    },
  };
}

export function trackSun(atmo: Atmosphere, focus: THREE.Vector3): void {
  atmo.sun.target.position.copy(focus);
  atmo.sun.position.copy(focus).addScaledVector(atmo.sunDir, 280);
  atmo.sun.target.updateMatrixWorld();
}
