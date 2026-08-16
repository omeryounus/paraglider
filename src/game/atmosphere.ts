import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { LevelDef } from './types';

const FOG_COLOR = 0x8cb8de;
const SUN_OFFSET = new THREE.Vector3(300, 600, 200);

export interface Atmosphere {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
  dispose: (scene: THREE.Scene) => void;
}

export function createAtmosphere(_level: LevelDef, scene: THREE.Scene): Atmosphere {
  const sky = new Sky();
  sky.name = 'SkyDome';
  sky.scale.setScalar(3600);
  const skyMat = sky.material as THREE.ShaderMaterial;
  skyMat.fog = false;
  skyMat.toneMapped = false;
  skyMat.fragmentShader = skyMat.fragmentShader
    .replace('#include <tonemapping_fragment>', '')
    .replace('#include <colorspace_fragment>', '')
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'gl_FragColor = vec4( 1.0 - exp( -retColor * 0.16 ), 1.0 );',
    );
  skyMat.needsUpdate = true;
  scene.add(sky);

  const sunDir = SUN_OFFSET.clone().normalize();
  const uniforms = skyMat.uniforms;
  uniforms['turbidity'].value = 2.4;
  uniforms['rayleigh'].value = 1.05;
  uniforms['mieCoefficient'].value = 0.0032;
  uniforms['mieDirectionalG'].value = 0.72;
  uniforms['sunPosition'].value.copy(sunDir);

  scene.fog = new THREE.Fog(FOG_COLOR, 200, 2500);
  scene.background = new THREE.Color(FOG_COLOR);

  const hemi = new THREE.HemisphereLight(0x90c4f8, 0x3e4732, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3db, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.position.copy(SUN_OFFSET);
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
  atmo.sun.position.copy(focus).add(SUN_OFFSET);
  atmo.sun.target.updateMatrixWorld();
}
