import fs from 'fs';
function inspectCanopy(path) {
  const buf = fs.readFileSync(path);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonStr);
  gltf.meshes?.forEach((m, idx) => {
    console.log(`Mesh ${idx}: ${m.name}`);
    m.primitives.forEach((p, pidx) => {
      const acc = gltf.accessors[p.attributes.POSITION];
      console.log(`  Prim ${pidx}: pos min=${JSON.stringify(acc.min)} max=${JSON.stringify(acc.max)}`);
    });
  });
  console.log('Nodes:');
  gltf.nodes?.forEach((n, idx) => {
    console.log(`Node ${idx}: ${n.name}, T=${JSON.stringify(n.translation)}, R=${JSON.stringify(n.rotation)}`);
  });
}
inspectCanopy('public/models/canopy.glb');
