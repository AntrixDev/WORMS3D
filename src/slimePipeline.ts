import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera } from "./camera";
import { ModelUniforms } from "./modelSchema";
import { loadGLBModel } from "./modelLoader";
import type { PlayerState } from "./gameState";

const physicsRadius = 0.4;
const targetDiameter = 1.2;

function buildModelMat(
  px: number,
  py: number,
  pz: number,
  worldFwd: [number, number, number],
  groundOffset: number,
  scale: number,
  gravDown: [number, number, number] =[0, -1, 0],
) {
  const footX = px + gravDown[0]*physicsRadius;
  const footY = py + gravDown[1]*physicsRadius;
  const footZ = pz + gravDown[2]*physicsRadius;

  const up = m.vec3.normalize(m.vec3.create(-gravDown[0], -gravDown[1], -gravDown[2]));

  const fwdDotUp = worldFwd[0]*up[0] + worldFwd[1]*up[1] + worldFwd[2]*up[2];

  let flatFwd = m.vec3.create(
    worldFwd[0] - fwdDotUp*up[0],
    worldFwd[1] - fwdDotUp*up[1],
    worldFwd[2] - fwdDotUp*up[2],
  );

  const flatLen = m.vec3.length(flatFwd);

  if (flatLen > 0.001){
    m.vec3.scale(flatFwd, 1 / flatLen, flatFwd);
  } else {
    flatFwd = m.vec3.create(0, 0, 1);
  }

  const right = m.vec3.normalize(m.vec3.cross(flatFwd, up));

  const s = scale;
  const mat = d.mat4x4f();
  m.mat4.identity(mat);

  mat[0] = -right[0]*s;
  mat[1] = -right[1]*s;
  mat[2] = -right[2]*s;
  mat[3] = 0;

  mat[4] = up[0]* s;
  mat[5] = up[1]* s;
  mat[6] = up[2]* s;
  mat[7] = 0;

  mat[8] = flatFwd[0]* s;
  mat[9] = flatFwd[1]* s;
  mat[10] = flatFwd[2]* s;
  mat[11] = 0;

  mat[12] = footX + up[0]*(-groundOffset * s);
  mat[13] = footY + up[1]*(-groundOffset * s);
  mat[14] = footZ + up[2]* (-groundOffset * s);
  mat[15] = 1;

  return mat;
}

function splitAlphaIndices(
  indices:     Uint32Array,
  materialIds: Uint32Array,
  alphaFlags:  Uint8Array,
): { opaque: Uint32Array; alpha: Uint32Array } {
  const opaqueList: number[] = [];
  const alphaList:  number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const matId = materialIds[indices[i]];
    if (alphaFlags[matId]) {
      alphaList.push(indices[i], indices[i+1], indices[i+2]);
    } else {
      opaqueList.push(indices[i], indices[i+1], indices[i+2]);
    }
  }

  return {
    opaque: new Uint32Array(opaqueList),
    alpha:  new Uint32Array(alphaList),
  };
}

export async function createSlimePipeline(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,
  players: PlayerState[],
  gravityController: import("./gravity").GravityController,
) {
  const slime = await loadGLBModel("/assets/slime.glb");

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < slime.vertexCount; i++) {
    const x = slime.positions[i*3+0];
    const y = slime.positions[i*3+1];
    const z = slime.positions[i*3+2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const extentZ = maxZ - minZ;
  const maxExtent = Math.max(extentX, extentY, extentZ) || 1;
  const scaleFactor = targetDiameter / maxExtent;

  const groundOffset = slime.groundOffset;

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

  const { opaque: opaqueIndices, alpha: alphaIndices } = splitAlphaIndices(
    slime.indices,
    slime.materialIds,
    slime.alphaFlags,
  );

  const opaqueIndexBuffer = root
    .createBuffer(d.arrayOf(d.u32, opaqueIndices.length), Array.from(opaqueIndices))
    .$usage("index");

  const alphaIndexBuffer = opaqueIndices.length > 0 && alphaIndices.length > 0
    ? root
        .createBuffer(d.arrayOf(d.u32, alphaIndices.length), Array.from(alphaIndices))
        .$usage("index")
    : null;

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

  const playerUniforms = players.map((p, i) => {
    const gd = gravityController.getGravity(i).down;
    return root
      .createBuffer(ModelUniforms, { model: buildModelMat(p.posX, p.posY, p.posZ, [0, 0, 1], groundOffset, scaleFactor, [gd[0], gd[1], gd[2]]) })
      .$usage("uniform");
  });

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

  const modelFragment = tgpu.fragmentFn({
    in:  { color: d.vec4f },
    out: d.vec4f,
  })((i) => i.color);

  const opaquePipeline = root.createRenderPipeline({
    attribs:  { ...modelVertexLayout.attrib },
    vertex:   modelVertex,
    fragment: modelFragment,
    targets:  { format: presentationFormat },
    depthStencil: {
      format:            "depth24plus",
      depthWriteEnabled: true,
      depthCompare:      "less",
    },
    multisample: { count: 4 },
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

  const alphaPipeline = alphaIndexBuffer
    ? root.createRenderPipeline({
        attribs:  { ...modelVertexLayout.attrib },
        vertex:   modelVertex,
        fragment: modelFragment,
        targets: {
          format: presentationFormat,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
        depthStencil: {
          format:            "depth24plus",
          depthWriteEnabled: false,
          depthCompare:      "less",
        },
        multisample: { count: 4 },
      })
    : null;

  return {

    updatePlayerPos(
      playerIndex: number,
      px: number,
      py: number,
      pz: number,
      worldFwd: [number, number, number] = [0, 0, 1],
      gravDown: [number, number, number] = [0, -1, 0],
    ) {
      if(!playerUniforms[playerIndex]) return;
      playerUniforms[playerIndex].write({ model: buildModelMat(px, py, pz, worldFwd, groundOffset, scaleFactor, gravDown) });
    },

    draw(
      msaaTexture: any, 
      depthTexture: any, 
      context: any
    ) {
      for(let i=0; i< players.length; i++){
        opaquePipeline
          .withColorAttachment({
            view:          msaaTexture,
            resolveTarget: context,
            loadOp:        "load",
          })
          .withDepthStencilAttachment({
            view:            depthTexture,
            depthClearValue: 1,
            depthLoadOp:     "load",
            depthStoreOp:    "store",
          })
          .with(modelVertexLayout, modelVertexBuffer)
          .with(playerBindGroup[i])
          .withIndexBuffer(modelIndexBuffer)
          .drawIndexed(opaqueIndices.length);

          if (alphaPipeline && alphaIndexBuffer) {
          alphaPipeline
            .withColorAttachment({
              view:          msaaTexture,
              resolveTarget: context,
              loadOp:        "load",
            })
            .withDepthStencilAttachment({
              view:            depthTexture,
              depthClearValue: 1,
              depthLoadOp:     "load",
              depthStoreOp:    "store",
            })
            .with(modelVertexLayout, modelVertexBuffer)
            .with(playerBindGroup[i])
            .withIndexBuffer(alphaIndexBuffer)
            .drawIndexed(alphaIndices.length);
        }
      }
    },
  };
}