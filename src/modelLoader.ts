import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';
import * as m from 'wgpu-matrix';

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

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  m.mat4.multiply(a, b, out);
  return out;
}

function computeWorldMatrices(nodes: any[]): Float32Array[] {
  const localMats: Float32Array[] = nodes.map((node) => {
    if (node.matrix) {
      return new Float32Array(node.matrix);
    }
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation    ?? [0, 0, 0, 1];
    const s = node.scale       ?? [1, 1, 1];
    const mat = new Float32Array(16);
    m.mat4.identity(mat);
    m.mat4.fromQuat(r, mat);
    mat[12] = t[0]; mat[13] = t[1]; mat[14] = t[2];
    const scaleMat = new Float32Array(16);
    m.mat4.scaling(s, scaleMat);
    m.mat4.multiply(mat, scaleMat, mat);
    return mat;
  });

  const worldMats: Float32Array[] = nodes.map(() => new Float32Array(16).fill(0));
  const identity = new Float32Array(16);
  m.mat4.identity(identity);

  const parentOf = new Int32Array(nodes.length).fill(-1);
  nodes.forEach((node, i) => {
    (node.children ?? []).forEach((c: number) => { parentOf[c] = i; });
  });

  function getWorld(i: number): Float32Array {
    if (worldMats[i][0] !== 0 || worldMats[i][5] !== 0) return worldMats[i];
    const p = parentOf[i];
    const parentWorld = p === -1 ? identity : getWorld(p);
    mat4Mul(parentWorld, localMats[i]);
    m.mat4.multiply(parentWorld, localMats[i], worldMats[i]);
    return worldMats[i];
  }

  nodes.forEach((_, i) => getWorld(i));
  return worldMats;
}

export async function loadGLBModel(path: string){
  const model = await load(path, GLBLoader);
  const { arrayBuffer, byteOffset, byteLength } = model.binChunks[0];
  const binChunk = arrayBuffer.slice(byteOffset, byteOffset + byteLength);

  const {
    accessors,
    bufferViews,
    meshes,
    materials,
    nodes
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

  const worldMats = computeWorldMatrices(nodes);

  const meshWorldMat: Map<number, Float32Array> = new Map();
  nodes.forEach((node: any, ni: number) => {
    if (node.mesh !== undefined) {
      meshWorldMat.set(node.mesh, worldMats[ni]);
    }
  });

  const primitiveData: {
    pos: Float32Array;
    norm: Float32Array;
    materialId: Uint32Array;
    indices: Uint16Array | Uint32Array;
    worldMat: Float32Array;
  }[] = [];

  let totalVerts = 0;
  let totalIndices = 0;

  meshes.forEach((mesh: any, meshIdx: number) => {
    const worldMat = meshWorldMat.get(meshIdx) ?? (() => {
      const id = new Float32Array(16); m.mat4.identity(id); return id;
    })();

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
        worldMat
      });
      totalVerts += vertCount;
      totalIndices += indices.length;

    }
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const materialIds = new Uint32Array(totalVerts);
  const finalIndices = new Uint16Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  let baseVertex = 0;

  for (const { pos, norm, materialId, indices, worldMat } of primitiveData) {
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      const x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];

      const wx = worldMat[0]*x + worldMat[4]*y + worldMat[8]*z  + worldMat[12];
      const wy = worldMat[1]*x + worldMat[5]*y + worldMat[9]*z  + worldMat[13];
      const wz = worldMat[2]*x + worldMat[6]*y + worldMat[10]*z + worldMat[14];
      positions[(vOff+i)*3+0] = wx;
      positions[(vOff+i)*3+1] = wy;
      positions[(vOff+i)*3+2] = wz;

      const nx = norm[i*3], ny = norm[i*3+1], nz = norm[i*3+2];
      let nnx = worldMat[0]*nx + worldMat[4]*ny + worldMat[8]*nz;
      let nny = worldMat[1]*nx + worldMat[5]*ny + worldMat[9]*nz;
      let nnz = worldMat[2]*nx + worldMat[6]*ny + worldMat[10]*nz;
      const len = Math.sqrt(nnx*nnx + nny*nny + nnz*nnz) || 1;
      normals[(vOff+i)*3+0] = nnx/len;
      normals[(vOff+i)*3+1] = nny/len;
      normals[(vOff+i)*3+2] = nnz/len;
    }

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