import fs from 'fs';
function inspectMats(path) {
  console.log(`\n=== Materials in ${path} ===`);
  const buf = fs.readFileSync(path);
  const jsonChunkLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonChunkLen));
  console.log('Materials:', JSON.stringify(gltf.materials, null, 2));
  console.log('Textures:', gltf.textures);
  console.log('Images:', gltf.images);
}
inspectMats('public/models/canopy.glb');
inspectMats('public/models/pilot.glb');
