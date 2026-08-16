import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { LevelDef } from './types';

const FOG_COLOR = 0xa8c8e8;
const SUN_DISTANCE = 1000;

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
  sky.scale.setScalar(450000);
  const skyMat = sky.material as THREE.ShaderMaterial;
  skyMat.fog = false;
  skyMat.toneMapped = false;
  skyMat.fragmentShader = skyMat.fragmentShader
    .replace('#include <tonemapping_fragment>', '')
    .replace('#include <colorspace_fragment>', '')
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `gl_FragColor = vec4( mix( vec3( dot( clamp( retColor * 0.7, 0.0, 2.6 ), vec3( 0.2126, 0.7152, 0.0722 ) ) ), clamp( retColor * 0.7, 0.0, 2.6 ), 1.32 ), 1.0 );`,
    );
  skyMat.needsUpdate = true;
  scene.add(sky);

  const sunDir = new THREE.Vector3();
  const uniforms = skyMat.uniforms;
  uniforms['turbidity'].value = 8;
  uniforms['rayleigh'].value = 1.5;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;

  const elevation = 25;
  const azimuth = 195;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sunDir);

  scene.fog = new THREE.Fog(FOG_COLOR, 400, 3200);
  scene.background = new THREE.Color(FOG_COLOR);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a4235, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfffaed, 2.6);
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
  sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
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
  atmo.sun.position.copy(focus).addScaledVector(atmo.sunDir, SUN_DISTANCE);
  atmo.sun.target.updateMatrixWorld();
}
