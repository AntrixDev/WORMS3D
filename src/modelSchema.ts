import { d, tgpu } from 'typegpu';

const ModelVertexData = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  materialId: d.u32,
});

export const ModelUniforms = d.struct({
  model: d.mat4x4f,
});

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertexData));
export const MaterialPalette = d.arrayOf(d.vec4f, 3);