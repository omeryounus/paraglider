import fs from 'fs';

function inspectBinaryGLB(path) {
  console.log(`\n========================================`);
  console.log(`=== Inspecting ${path} ===`);
  console.log(`========================================`);
  const buf = fs.readFileSync(path);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonStr);
  
  const binOffset = 20 + jsonChunkLen + 8; // header + json chunk + bin chunk header
  const binBuf = buf.subarray(binOffset);

  function getAccessorData(accIndex) {
    const acc = gltf.accessors[accIndex];
    const bv = gltf.bufferViews[acc.bufferView];
    const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const count = acc.count;
    const type = acc.type;
    const compType = acc.componentType;
    return { acc, count, type, min: acc.min, max: acc.max };
  }

  console.log('Meshes & Geometries:');
  gltf.meshes?.forEach((mesh, mi) => {
    console.log(` Mesh ${mi}: "${mesh.name}"`);
    mesh.primitives.forEach((prim, pi) => {
      const posAcc = getAccessorData(prim.attributes.POSITION);
      console.log(`   Prim ${pi}: Material: ${gltf.materials?.[prim.material]?.name || 'none'}`);
      console.log(`     Positions count: ${posAcc.count}, bounds: min=${JSON.stringify(posAcc.min)}, max=${JSON.stringify(posAcc.max)}`);
      if (prim.attributes.NORMAL !== undefined) console.log(`     Has Normals`);
      if (prim.attributes.TEXCOORD_0 !== undefined) console.log(`     Has UVs`);
      if (prim.attributes.COLOR_0 !== undefined) console.log(`     Has Colors`);
    });
  });

  console.log('\nNodes Hierarchy:');
  function printNode(nodeIdx, depth = 0) {
    const node = gltf.nodes[nodeIdx];
    const indent = '  '.repeat(depth);
    console.log(`${indent}- [${nodeIdx}] "${node.name}" mesh=${node.mesh !== undefined ? gltf.meshes[node.mesh].name : 'none'} T=${JSON.stringify(node.translation)} R=${JSON.stringify(node.rotation)} S=${JSON.stringify(node.scale)}`);
    node.children?.forEach(c => printNode(c, depth + 1));
  }

  gltf.scenes?.[0]?.nodes?.forEach(rootIdx => printNode(rootIdx));
}

inspectBinaryGLB('public/models/canopy.glb');
inspectBinaryGLB('public/models/pilot.glb');
inspectBinaryGLB('public/models/paraglider.glb');
