import tgpu, { d, std } from "typegpu";
import * as m from "wgpu-matrix";

const root = await tgpu.init();

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();


const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});


const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});


const Transform = d.struct({
  model: d.mat4x4f,
});

function createFace(
  vertices: number[][],
  color: d.Infer<typeof Vertex>["color"]
): d.Infer<typeof Vertex>[] {
  return vertices.map((pos) => ({
    position: d.vec4f(...(pos as [number, number, number, number])),
    color,
  }));
}

function createCube(): d.Infer<typeof Vertex>[] {
  const front = createFace([
    [-1, -1,  1, 1], [1, -1,  1, 1], [1,  1,  1, 1],
    [-1, -1,  1, 1], [1,  1,  1, 1], [-1,  1,  1, 1],
  ], d.vec4f(1, 0, 0, 1));
  const back = createFace([
    [-1, -1, -1, 1], [-1,  1, -1, 1], [1, -1, -1, 1],
    [ 1, -1, -1, 1], [-1,  1, -1, 1], [1,  1, -1, 1],
  ], d.vec4f(0, 1, 0, 1));
  const top = createFace([
    [-1, 1, -1, 1], [-1, 1,  1, 1], [1, 1, -1, 1],
    [ 1, 1, -1, 1], [-1, 1,  1, 1], [1, 1,  1, 1],
  ], d.vec4f(0, 0, 1, 1));
  const bottom = createFace([
    [-1, -1, -1, 1], [ 1, -1, -1, 1], [-1, -1,  1, 1],
    [ 1, -1, -1, 1], [ 1, -1,  1, 1], [-1, -1,  1, 1],
  ], d.vec4f(1, 1, 0, 1));
  const right = createFace([
    [1, -1, -1, 1], [1,  1, -1, 1], [1, -1,  1, 1],
    [1, -1,  1, 1], [1,  1, -1, 1], [1,  1,  1, 1],
  ], d.vec4f(1, 0, 1, 1));
  const left = createFace([
    [-1, -1, -1, 1], [-1, -1,  1, 1], [-1,  1, -1, 1],
    [-1, -1,  1, 1], [-1,  1,  1, 1], [-1,  1, -1, 1],
  ], d.vec4f(0, 1, 1, 1));
  return [...front, ...back, ...top, ...bottom, ...right, ...left];
}

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(12, 5, 12, 1);

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

const cubeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(36), createCube())
  .$usage("vertex");

const cameraBuffer = root
  .createBuffer(Camera, cameraInitial)
  .$usage("uniform");

const transformBuffer = root
  .createBuffer(Transform, { model: m.mat4.identity(d.mat4x4f()) })
  .$usage("uniform");

const layout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  transform: { uniform: Transform },
});

const bindGroup = root.createBindGroup(layout, {
  camera: cameraBuffer,
  transform: transformBuffer,
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
  in: { position: d.vec4f, color: d.vec4f },
  out: { pos: d.builtin.position, color: d.vec4f },
})((input) => {

  const pos = std.mul(
    layout.$.camera.projection,
    std.mul(
      layout.$.camera.view,
      std.mul(layout.$.transform.model, input.position)
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
    .draw(vertexCount);
}


function frame() {
  drawObject(cubeBuffer, bindGroup, 36, "clear");
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

let isDragging = false;
let prevX = 0;
let prevY = 0;

let orbitRadius = Math.sqrt(
  cameraInitialPos.x * cameraInitialPos.x +
  cameraInitialPos.y * cameraInitialPos.y +
  cameraInitialPos.z * cameraInitialPos.z,
);

let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

function updateCameraPosition() {
  const x = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const y = orbitRadius * Math.sin(orbitPitch);
  const z = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);

  cameraBuffer.write({
    view: m.mat4.lookAt(d.vec4f(x, y, z, 1), target, d.vec3f(0, 1, 0), d.mat4x4f()),
    projection: cameraInitial.projection,
  });
}

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
});

window.addEventListener("mouseup", () => { isDragging = false; });

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - prevX;
  const dy = e.clientY - prevY;
  prevX = e.clientX;
  prevY = e.clientY;
  orbitYaw += -dx * 0.005;
  orbitPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, orbitPitch + dy * 0.005));
  updateCameraPosition();
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  orbitRadius = Math.max(1, orbitRadius + e.deltaY * 0.05);
  updateCameraPosition();
}, { passive: false });