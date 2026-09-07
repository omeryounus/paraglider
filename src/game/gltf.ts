import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Shared GLTF loader with one global Draco decoder instance.
 * Each `new DRACOLoader()` fetches draco_wasm_wrapper.js + draco_decoder.wasm
 * again (~700 KB); the game had three modules doing this at boot.
 *
 * Contest/file:// build: Draco is skipped entirely — the WASM decoder runs in
 * a Worker, which file:// blocks, and the contest pack ships decoder-free
 * GLBs anyway (see scripts/assemble-contest.mjs).
 */
let _loader: GLTFLoader | null = null;

export function dracoGltfLoader(): GLTFLoader {
  if (!_loader) {
    _loader = new GLTFLoader();
    const contest = import.meta.env.CONTEST === true || import.meta.env.MODE === 'contest';
    if (!contest) {
      const draco = new DRACOLoader();
      draco.setDecoderPath('./draco/');
      _loader.setDRACOLoader(draco);
    }
  }
  return _loader;
}
