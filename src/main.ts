import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, createCamera } from "./camera";
import { vertexLayout, createCubeBuffer} from "./geometry";
import { checkPosition, cubeInstance, cubeCount, createPlateBuffer} from "./map";
import { createSlimePipeline } from "./slimePipeline";

interface Player{
  id: number,
  username: string
}

export async function startGame(playerData: Player[]) {

  const root = await tgpu.init();

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const cameraBuffer = createCamera(root, canvas);
  const cubeBuffer = createCubeBuffer(root);
  const instanceBuffer = createPlateBuffer(root);

  const cubeLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    instance: {storage: d.arrayOf(cubeInstance)},
  });

  const cubeBindGroup = root.createBindGroup(cubeLayout, {
    camera: cameraBuffer,
    instance: instanceBuffer
  });

  const cubeVertex = tgpu.vertexFn({
    in: { position: d.vec4f, color: d.vec4f, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, color: d.vec4f },
  })((input) => {

    const pos = std.mul(
      cubeLayout.$.camera.projection,
      std.mul(
        cubeLayout.$.camera.view,
        std.mul(cubeLayout.$.instance[input.instanceIndex].model, input.position)
      )
    );
    return { pos, color: input.color };
  });

  const cubePipeline = root.createRenderPipeline({
    attribs: vertexLayout.attrib,
    vertex: cubeVertex,
    fragment: tgpu.fragmentFn({ 
      in: { color: d.vec4f }, 
      out: d.vec4f 
    })((i) => i.color),
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

  function makeTextures() {
    return {
      depth: root.createTexture({ 
        size: [canvas.width, canvas.height],
        format: "depth24plus",
        sampleCount: 4
      }).$usage("render"),

      msaa: root.createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat,
        sampleCount: 4
      }).$usage("render"),
    };
  }
  let { depth: depthTexture, msaa: msaaTexture } = makeTextures();

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
    depthTexture.destroy(); 
    msaaTexture.destroy();
    ({ depth: depthTexture, msaa: msaaTexture } = makeTextures());
  });

  console.log("Player: ", playerData);


  const slime = await createSlimePipeline(root, cameraBuffer, presentationFormat);

  function drawCubes(
    msaaTexture: any, 
    depthTexture: any, 
    context: any
  ) {
    cubePipeline
      .withColorAttachment({
        view: msaaTexture,
        resolveTarget: context,
        loadOp: "clear",
        clearValue: [0.1, 0.1, 0.15, 1],
      })
      .withDepthStencilAttachment({
        view: depthTexture,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      })
      .with(vertexLayout, cubeBuffer)
      .with(cubeBindGroup)
      .draw(36, cubeCount);
  }


  function frame() {
    drawCubes(msaaTexture, depthTexture, context);
    slime.draw(msaaTexture, depthTexture, context);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  //checkPosition(0);
}