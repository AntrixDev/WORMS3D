import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';

const GLTF_COMPONENT_TYPE = {
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
} as const;

const COMPONENT_SIZES: Record<number, number> = {
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: 2,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: 4,
  [GLTF_COMPONENT_TYPE.FLOAT]: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC3: 3,
};

const TYPED_ARRAYS: Record<number, any> = {
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: Uint16Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: Uint32Array,
  [GLTF_COMPONENT_TYPE.FLOAT]: Float32Array,
};

export async function loadGLBModel(path: string){
  const model = await load(path, GLBLoader);
  const { arrayBuffer, byteOffset, byteLength } = model.binChunks[0];
  const binChunk = arrayBuffer.slice(byteOffset, byteOffset + byteLength);

  const {
    accessors,
    bufferViews,
    meshes,
    materials,
  } = model.json;

  const paletteData = new Float32Array(materials.length * 4);
  materials.forEach((mat: any, idx: number) => {
    const color = mat.pbrMetallicRoughness?.baseColorFactor || [1.0, 1.0, 1.0, 1.0];
    paletteData.set(color, idx * 4);
  });

  const getTypedArray = (idx: number) => {
    const acc = accessors[idx];
    const view = bufferViews[acc.bufferView];
    const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const length = acc.count * TYPE_COMPONENTS[acc.type] * COMPONENT_SIZES[acc.componentType];
    return new TYPED_ARRAYS[acc.componentType](binChunk.slice(offset, offset + length));
  };

  const primitiveData: {
    pos: Float32Array;
    norm: Float32Array;
    materialId: Uint32Array;
    indices: Uint16Array | Uint32Array;
  }[] = [];

  let totalVerts = 0;
  let totalIndices = 0;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const pos = getTypedArray(prim.attributes.POSITION) as Float32Array;
      const norm = getTypedArray(prim.attributes.NORMAL) as Float32Array;
      const indices = getTypedArray(prim.indices) as Uint16Array;

      const vertCount = pos.length / 3;

      const materialIdArray = new Uint32Array(vertCount);
      materialIdArray.fill(prim.material ?? 0);

      primitiveData.push({
        pos,
        norm,
        materialId: materialIdArray,
        indices,
      });
      totalVerts += pos.length / 3;
      totalIndices += indices.length;

    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const materialIds = new Uint32Array(totalVerts);
  const finalIndices = new Uint16Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  let baseVertex = 0;

  for (const { pos, norm, materialId, indices } of primitiveData) {
    const count = pos.length / 3;
    positions.set(pos, vOff * 3);
    normals.set(norm, vOff * 3);
    materialIds.set(materialId, vOff);

    for (let i = 0; i < indices.length; i++) {
      finalIndices[iOff + i] = indices[i] + baseVertex;
    }

    vOff += count;
    iOff += indices.length;
    baseVertex += count;
  }

  return {
    positions,
    normals,
    materialIds,
    indices: finalIndices,
    paletteData,
    vertexCount: totalVerts,
    indexCount: totalIndices,
  };

}