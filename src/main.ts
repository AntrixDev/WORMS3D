import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, createCamera } from "./camera";
import { Transform, vertexLayout, createCubeBuffer, createTransformBuffer} from "./geometry";
import { checkPosition, cubeInstance, cubeCount, createPlateBuffer} from "./map";
import { loadGLBModel } from "./modelLoader";

const root = await tgpu.init();

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

function resize() { 
  canvas.width = window.innerWidth; 
  canvas.height = window.innerHeight; 
}

resize();
window.addEventListener("resize", resize);

const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const cameraBuffer = createCamera(root, canvas);
const cubeBuffer = createCubeBuffer(root);
const instanceBuffer = createPlateBuffer(root);
const transformBuffer = createTransformBuffer(root);

const modelData = await loadGLBModel('/assets/slime.glb');

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
  instance: {storage: d.arrayOf(cubeInstance)},
});

const bindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: transformBuffer,
  instance: instanceBuffer
});



const depthTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    sampleCount: 4,
  })
  .$usage("render");

const msaaTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat,
    sampleCount: 4,
  })
  .$usage("render");


const vertex = tgpu.vertexFn({
  in: { position: d.vec4f, color: d.vec4f, instanceIndex: d.builtin.instanceIndex },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {

  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.instance[input.instanceIndex].model, input.position)
    )
  );
  return { pos, color: input.color };
});



const fragment = tgpu.fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => input.color);

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex,
  fragment,
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
  multisample: { count: 4 },
});


function drawObject(
  buffer: typeof cubeBuffer,
  group: typeof bindGroup,
  vertexCount: number,
  instanceCount: number,
  loadOp: "clear" | "load",
) {
  pipeline
    .withColorAttachment({
      view: msaaTexture,
      resolveTarget: context,
      loadOp,
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: loadOp,
      depthStoreOp: "store",
    })
    .with(vertexLayout, buffer)
    .with(group)
    .draw(vertexCount, instanceCount);
}


function frame() {
  drawObject(cubeBuffer, bindGroup, 36, cubeCount, "clear");
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

//checkPosition(0);