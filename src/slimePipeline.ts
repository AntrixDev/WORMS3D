import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera } from "./camera";
import { ModelUniforms } from "./modelSchema";
import { loadGLBModel } from "./modelLoader";
import type { PlayerState } from "./gameState";

function buildModelMat(px: number, py: number, pz: number, yaw: number ){
  const mat = d.mat4x4f();
  m.mat4.identity(mat);
  m.mat4.translate(mat, [px, py, pz], mat);
  m.mat4.rotateY(mat, yaw - Math.PI / 2, mat);
  m.mat4.scale(mat, [scale, scale, scale], mat);
  return mat;
}

const scale = 0.5;

export async function createSlimePipeline(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,
  players: PlayerState[],
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

  const materialCount = slime.paletteData.length / 4;


  // console.log("palette:", Array.from(slime.paletteData));

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

  const playerUniforms = players.map((p)=> 
    root
      .createBuffer(ModelUniforms, { model: buildModelMat(p.posX, p.posY, p.posZ, 0) })
      .$usage("uniform")
  );

  const modelLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    modelUniforms: { uniform: ModelUniforms },
    palette: { storage: d.arrayOf(d.vec4f) },
  });

  const playerBindGroup = playerUniforms.map((ub =>
    root.createBindGroup(modelLayout, {
        camera: cameraBuffer,
        modelUniforms: ub,
        palette: paletteBuffer,
      })
  ));

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

    updatePlayerPos(
      playerIndex: number,
      px: number,
      py: number,
      pz: number,
      yaw = 0
    ) {
      if(!playerUniforms[playerIndex]) return;
      playerUniforms[playerIndex].write({ model: buildModelMat(px, py, pz, yaw) });
    },

    draw(
      msaaTexture: any, 
      depthTexture: any, 
      context: any
    ) {
      for(let i=0; i< players.length; i++){
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
          .with(playerBindGroup[i])
          .withIndexBuffer(modelIndexBuffer)
          .drawIndexed(slime.indexCount);
      }
    },
  };
}