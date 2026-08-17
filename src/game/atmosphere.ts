import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { LevelDef } from './types';

const FOG_COLOR = 0xb7d2e8;
const SUN_DISTANCE = 1000;

export interface Atmosphere {
  sky: Sky;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.AmbientLight;
  sunDir: THREE.Vector3;
  rimDir: THREE.Vector3;
  dispose: (scene: THREE.Scene) => void;
}

export function createAtmosphere(_level: LevelDef, scene: THREE.Scene): Atmosphere {
  const sky = new Sky();
  sky.name = 'SkyDome';
  sky.scale.setScalar(450000);
  sky.renderOrder = -10;
  const skyMat = sky.material as THREE.ShaderMaterial;
  skyMat.fog = false;
  skyMat.depthTest = false;
  skyMat.depthWrite = false;
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
  uniforms['turbidity'].value = 5.5;
  uniforms['rayleigh'].value = 1.7;
  uniforms['mieCoefficient'].value = 0.005;
  uniforms['mieDirectionalG'].value = 0.8;

  const elevation = 25;
  const azimuth = 195;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sunDir);

  const fogColor = new THREE.Color(_level.fogColor ?? FOG_COLOR);
  // Exp2 has no near-clip plane, so it won't cut a hard white band behind the pilot.
  scene.fog = new THREE.FogExp2(fogColor, Math.min(_level.fog ?? 0.00045, 0.0005));
  scene.background = fogColor;

  const hemi = new THREE.HemisphereLight(0xb8dcff, 0x5a564c, 1.25);
  scene.add(hemi);
  const fill = new THREE.AmbientLight(0x9ec4e6, 0.38);
  scene.add(fill);

  const sun = new THREE.DirectionalLight(0xfffaed, 2.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 900;
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.08;
  sun.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
  scene.add(sun);
  scene.add(sun.target);

  const rimDir = sunDir.clone().multiplyScalar(-1);
  rimDir.y = Math.max(0.42, Math.abs(rimDir.y) * 0.35 + 0.38);
  rimDir.normalize();
  const rim = new THREE.DirectionalLight(0xd5e4ff, 0.78);
  rim.name = 'PilotRim';
  rim.castShadow = false;
  rim.position.copy(rimDir).multiplyScalar(220);
  scene.add(rim);
  scene.add(rim.target);

  return {
    sky,
    sun,
    rim,
    hemi,
    fill,
    sunDir,
    rimDir,
    dispose: (host) => {
      host.remove(sky, sun, rim, hemi, fill, sun.target, rim.target);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    },
  };
}

export function trackSun(atmo: Atmosphere, focus: THREE.Vector3): void {
  atmo.sun.target.position.copy(focus);
  atmo.sun.position.copy(focus).addScaledVector(atmo.sunDir, SUN_DISTANCE);
  atmo.sun.target.updateMatrixWorld();
  atmo.rim.target.position.copy(focus);
  atmo.rim.position.copy(focus).addScaledVector(atmo.rimDir, 90);
  atmo.rim.target.updateMatrixWorld();
}
