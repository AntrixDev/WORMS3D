import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera } from "./camera";
import { ModelUniforms } from "./modelSchema";
import { loadGLBModel } from "./modelLoader";

export async function createSlimePipeline(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,

) {
  const slime = await loadGLBModel("/assets/slime.glb");

  const ModelVertexData = d.struct({
    position: d.vec3f,
    normal: d.vec3f,
    materialId: d.u32,
  });
  const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertexData));

  const modelVertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(slime.vertexCount))
    .$usage("vertex");

  (common.writeSoA as any)(modelVertexBuffer, {
    position: slime.positions,
    normal: slime.normals,
    materialId: slime.materialIds,
  });

  const modelIndexBuffer = root
    .createBuffer(d.arrayOf(d.u32, slime.indexCount), Array.from(slime.indices))
    .$usage("index");

  const FLOOR_Y = -9.5;
  const SCALE = 0.45;

  const modelMat = d.mat4x4f();
  m.mat4.identity(modelMat);
  m.mat4.translate(modelMat, [0, FLOOR_Y + SCALE, 0], modelMat);
  m.mat4.scale(modelMat, [SCALE, SCALE, SCALE], modelMat);

  const modelUniformBuffer = root
    .createBuffer(ModelUniforms, { model: modelMat })
    .$usage("uniform");

  const materialCount = slime.paletteData.length / 4;


  console.log("palette:", Array.from(slime.paletteData));

  const palette = Array.from({ length: materialCount }, (_, i) =>
      d.vec4f(
        slime.paletteData[i * 4 + 0],
        slime.paletteData[i * 4 + 1],
        slime.paletteData[i * 4 + 2],
        slime.paletteData[i * 4 + 3],
      )
    );

// const customPalette = Array.from({ length: materialCount }, (_, i) => {
//   if (i === 0) return d.vec4f(0.95, 0.2, 0.6, 1.0);
//   return d.vec4f(
//     slime.paletteData[i * 4 + 0],
//     slime.paletteData[i * 4 + 1],
//     slime.paletteData[i * 4 + 2],
//     slime.paletteData[i * 4 + 3],
//   );
// });

  const paletteBuffer = root
    .createBuffer(d.arrayOf(d.vec4f, materialCount), palette)
    .$usage("storage");

  const modelLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    modelUniforms: { uniform: ModelUniforms },
    palette: { storage: d.arrayOf(d.vec4f) },
  });

  const modelBindGroup = root.createBindGroup(modelLayout, {
    camera: cameraBuffer,
    modelUniforms: modelUniformBuffer,
    palette: paletteBuffer,
  });

  const modelVertex = tgpu.vertexFn({
    in: {
      position: d.vec3f,
      normal: d.vec3f,
      materialId: d.u32
    },
    out: {
      pos: d.builtin.position,
      color: d.vec4f
    },
  })((input) => {
    const worldPos = std.mul(
      modelLayout.$.modelUniforms.model,
      d.vec4f(input.position, d.f32(1))
    );
    const pos = std.mul(
      modelLayout.$.camera.projection,
      std.mul(modelLayout.$.camera.view, worldPos)
    );
    return { pos, color: modelLayout.$.palette[input.materialId] };
  });

  const pipeline = root.createRenderPipeline({
    attribs: { ...modelVertexLayout.attrib },
    vertex: modelVertex,
    fragment: tgpu.fragmentFn({ 
      in: { color: d.vec4f }, 
      out: d.vec4f 
    })((i) => i.color),
    targets: { format: presentationFormat },
    depthStencil: { 
      format: "depth24plus", 
      depthWriteEnabled: true, 
      depthCompare: "less" 
    },
    multisample: { count: 4 },
  });

  return {
    draw(
      msaaTexture: any, 
      depthTexture: any, 
      context: any
    ) {
      pipeline
        .withColorAttachment({ 
          view: msaaTexture, 
          resolveTarget: context, 
          loadOp: "load" 
        })
        .withDepthStencilAttachment({
          view: depthTexture,
          depthClearValue: 1,
          depthLoadOp: "load",
          depthStoreOp: "store"
        })
        .with(modelVertexLayout, modelVertexBuffer)
        .with(modelBindGroup)
        .withIndexBuffer(modelIndexBuffer)
        .drawIndexed(slime.indexCount);
    },
  };
}