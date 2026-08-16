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
  sky.scale.setScalar(45000);
  scene.add(sky);

  const sunDir = new THREE.Vector3();
  const { atmosphere: atm } = level;
  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = atm.turbidity;
  uniforms['rayleigh'].value = atm.rayleigh;
  uniforms['mieCoefficient'].value = atm.mieCoefficient;
  uniforms['mieDirectionalG'].value = atm.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - atm.elevation);
  const theta = THREE.MathUtils.degToRad(atm.azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sunDir);

  scene.fog = new THREE.FogExp2(level.fogColor, level.fog);
  scene.background = new THREE.Color(level.fogColor);

  const hemi = new THREE.HemisphereLight(level.hemiSky, level.hemiGround, 0.42);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(level.sunColor, 2.15);
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
