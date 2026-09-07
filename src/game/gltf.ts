import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Shared GLTF loader with one global Draco decoder instance.
 * Each `new DRACOLoader()` fetches draco_wasm_wrapper.js + draco_decoder.wasm
 * again (~700 KB); the game had three modules doing this at boot.
 */
let _loader: GLTFLoader | null = null;

export function dracoGltfLoader(): GLTFLoader {
  if (!_loader) {
    _loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('./draco/');
    _loader.setDRACOLoader(draco);
  }
  return _loader;
}
