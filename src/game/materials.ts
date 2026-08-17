import * as THREE from 'three';

let cachedNormal: THREE.DataTexture | null = null;

export function createDetailNormal(size = 128): THREE.DataTexture {
  if (cachedNormal) return cachedNormal;
  const data = new Uint8Array(size * size * 4);
  const wrap = (v: number) => ((v % size) + size) % size;
  const heightAt = (x: number, y: number): number => {
    const n = Math.sin(x * 0.31) * Math.cos(y * 0.27) + Math.sin(x * 0.73 + y * 0.19) * 0.45;
    return n * 0.5 + 0.5;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = heightAt(wrap(x - 1), y);
      const hR = heightAt(wrap(x + 1), y);
      const hD = heightAt(x, wrap(y - 1));
      const hU = heightAt(x, wrap(y + 1));
      let nx = (hL - hR) * 3.2;
      let ny = (hD - hU) * 3.2;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedNormal = tex;
  return tex;
}

export function createWaterNormal(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const wrap = (v: number) => ((v % size) + size) % size;
  const h = (x: number, y: number) =>
    Math.sin(x * 0.17) * Math.cos(y * 0.13) + Math.sin((x + y) * 0.09) * 0.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = h(wrap(x - 1), y) - h(wrap(x + 1), y);
      const ny = h(x, wrap(y - 1)) - h(x, wrap(y + 1));
      const len = Math.hypot(nx, ny, 1) || 1;
      const i = (y * size + x) * 4;
      data[i] = (nx / len) * 127 + 128;
      data[i + 1] = (ny / len) * 127 + 128;
      data[i + 2] = (1 / len) * 127 + 128;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function applyTerrainPbr(root: THREE.Object3D): void {
  const detail = createDetailNormal();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((mat) => upgradeMaterial(mat, detail, mesh.name === 'Water'));
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

function upgradeMaterial(
  mat: THREE.Material,
  detail: THREE.DataTexture,
  isWater: boolean,
): THREE.Material {
  if (isWater) return mat;
  const std =
    mat instanceof THREE.MeshStandardMaterial
      ? mat
      : new THREE.MeshStandardMaterial({
          color: mat instanceof THREE.MeshBasicMaterial ? mat.color : 0x6a7a4a,
          map: 'map' in mat ? (mat as THREE.MeshBasicMaterial).map : null,
          vertexColors: Boolean((mat as THREE.MeshBasicMaterial).vertexColors),
        });
  std.roughness = 0.9;
  std.metalness = 0.05;
  std.vertexColors = true;
  if (!std.normalMap) {
    std.normalMap = detail;
    std.normalScale = new THREE.Vector2(0.62, 0.62);
    detail.repeat.set(48, 48);
  }
  return std;
}
