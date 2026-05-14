import { load } from '@loaders.gl/core';
import { GLBLoader } from '@loaders.gl/gltf';
import * as m from 'wgpu-matrix';

const GLTF_COMPONENT_TYPE = {
  UNSIGNED_BYTE:  5121,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
} as const;

const COMPONENT_SIZES: Record<number, number> = {
  [GLTF_COMPONENT_TYPE.UNSIGNED_BYTE]: 2,
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: 2,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: 4,
  [GLTF_COMPONENT_TYPE.FLOAT]: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2:   2,
  VEC3:   3,
  VEC4:   4,
  MAT2:   4,
  MAT3:   9,
  MAT4:   16,
};

const TYPED_ARRAYS: Record<number, any> = {
  [GLTF_COMPONENT_TYPE.UNSIGNED_BYTE]: Uint8Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_SHORT]: Uint16Array,
  [GLTF_COMPONENT_TYPE.UNSIGNED_INT]: Uint32Array,
  [GLTF_COMPONENT_TYPE.FLOAT]: Float32Array,
};

function trsToMat4(
  t: number[] = [0, 0, 0],
  r: number[] = [0, 0, 0, 1],
  s: number[] = [1, 1, 1],
): Float32Array {
  const out = new Float32Array(16);
  m.mat4.fromQuat(r as any, out);

  out[0]  *= s[0]; out[1]  *= s[0]; out[2]  *= s[0];
  out[4]  *= s[1]; out[5]  *= s[1]; out[6]  *= s[1];
  out[8]  *= s[2]; out[9]  *= s[2]; out[10] *= s[2];

  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
}



function computeWorldMatrices(nodes: any[]): Float32Array[] {
  const n = nodes.length;

  const local: Float32Array[] = nodes.map((node) => {
    if (node.matrix) {
      return new Float32Array(node.matrix);
    }
    return trsToMat4(node.translation, node.rotation, node.scale);
  });

  const world: Float32Array[] = Array.from({ length: n }, () => new Float32Array(16));
  const visited = new Uint8Array(n);

  const parent = new Int32Array(n).fill(-1);
  nodes.forEach((node, i) => {
    (node.children ?? []).forEach((c: number) => { parent[c] = i; });
  });

  function visit(i: number) {
    if (visited[i]) return;
    const p = parent[i];
    if (p !== -1) visit(p);
    if (p === -1) {
      world[i].set(local[i]);
    } else {
      m.mat4.multiply(world[p], local[i], world[i]);
    }
    visited[i] = 1;
  }

  for (let i = 0; i < n; i++) visit(i);
  return world;
}

export interface ModelData {
  positions: Float32Array;
  normals: Float32Array;
  materialIds: Uint32Array;
  indices: Uint32Array;
  paletteData: Float32Array;   
  alphaFlags: Uint8Array;     
  vertexCount: number;
  indexCount: number;
  groundOffset: number;
}

export async function loadGLBModel(path: string): Promise<ModelData>{
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

  const matCount = (materials ?? []).length || 1;
  const paletteData = new Float32Array(matCount * 4);
  const alphaFlags  = new Uint8Array(matCount);

  (materials ?? []).forEach((mat: any, idx: number) => {
    const pbr   = mat.pbrMetallicRoughness ?? {};
    const color = pbr.baseColorFactor ?? [1, 1, 1, 1];
    paletteData.set(color, idx * 4);
    if (mat.alphaMode === 'BLEND' || mat.alphaMode === 'MASK') {
      alphaFlags[idx] = 1;
    }
  });

  function getTypedArray(idx: number): Float32Array | Uint16Array | Uint32Array | Uint8Array {
    const acc  = accessors[idx];
    const view = bufferViews[acc.bufferView];
    const compCount  = TYPE_COMPONENTS[acc.type]      ?? 1;
    const compSize   = COMPONENT_SIZES[acc.componentType] ?? 4;
    const byteStride = view.byteStride;

    const baseOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const TypedArray = TYPED_ARRAYS[acc.componentType] ?? Float32Array;

    if (byteStride && byteStride !== compCount * compSize) {
      const flat = new TypedArray(acc.count * compCount);
      for (let i = 0; i < acc.count; i++) {
        const elemOffset = baseOffset + i * byteStride;
        const src = new TypedArray(binChunk, elemOffset, compCount);
        flat.set(src, i * compCount);
      }
      return flat;
    }

    const totalBytes = acc.count * compCount * compSize;
    return new TypedArray(binChunk.slice(baseOffset, baseOffset + totalBytes));
  }

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
    const ident = new Float32Array(16); m.mat4.identity(ident);
    const worldMat = meshWorldMat.get(meshIdx) ?? ident;

    for (const prim of mesh.primitives) {
      if(prim.attributes.POSITION == undefined) continue;

      const pos = getTypedArray(prim.attributes.POSITION) as Float32Array;
      const norm = prim.attributes.NORMAL !== undefined ? getTypedArray(prim.attributes.NORMAL) as Float32Array : new Float32Array((pos.length / 3) * 3);
      let indices: Uint32Array;

      if (prim.indices !== undefined) {
        const raw = getTypedArray(prim.indices);
        if (raw instanceof Uint32Array) {
          indices = raw;
        } else {
          indices = new Uint32Array(raw.length);
          for (let i = 0; i < raw.length; i++) indices[i] = raw[i];
        }
      } else {
        const vc = pos.length / 3;
        indices = new Uint32Array(vc);
        for (let i = 0; i < vc; i++) indices[i] = i;
      }



      const matId = prim.material ?? 0;
      const vertCount = pos.length / 3;
      const materialIdArray = new Uint32Array(vertCount).fill(matId);
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
  const finalIndices = new Uint32Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  let baseVertex = 0;

  let minY = Infinity;
  let maxY = -Infinity;

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

      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;

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

  const groundOffset = minY;

  return {
    positions,
    normals,
    materialIds,
    indices: finalIndices,
    paletteData,
    alphaFlags,
    vertexCount: totalVerts,
    indexCount: totalIndices,
    groundOffset
  };
}