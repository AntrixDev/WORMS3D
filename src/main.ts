import tgpu, { d, std } from "typegpu";
import * as m from "wgpu-matrix";

const root = await tgpu.init();

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

//structure for the corner points of 3d cube
const Vertex = d.struct({
  position: d.vec4f, //where x y z w w=1(it's a position not a direction)
  color: d.vec4f, //rgba
});

//structure for camera
const Camera = d.struct({
  view: d.mat4x4f, //where is it, which way is it looking
  projection: d.mat4x4f, //3d -> 2d
});

//structure for object's transform
const Transform = d.struct({
  model: d.mat4x4f, //identity, translate, rotate, scale
});

function createFace(
  vertices: number[][], //list of vertices for 1 side of cube,
  color: d.Infer<typeof Vertex>["color"]//color (all points on 1 side same clr)
): d.Infer<typeof Vertex>[] {
  return vertices.map((pos) => ({
    position: d.vec4f(...(pos as [number, number, number, number])),
    color,
  }));
}

//all of the traingles have to be drawn ccw or cw
//the starting vertice doesn't matter as long as the direction of drawing is right

function createCube(): d.Infer<typeof Vertex>[] { //x y z w(always =1)
  const front = createFace([ 
    [-1, -1,  1, 1], [1, -1,  1, 1], [1,  1,  1, 1], //x y z w 
    [-1, -1,  1, 1], [1,  1,  1, 1], [-1,  1,  1, 1], //x y z w
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
  return [...front, ...back, ...top, ...bottom, ...right, ...left]; // returns flat array 36 vertices
}

const aspect = canvas.clientWidth / canvas.clientHeight; //stretching prevention
const target = d.vec3f(0, 0, 0); //the point the camera looks at
const cameraInitialPos = d.vec4f(12, 2, 2, 1); //right up forward w=1

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()), //lookAt(placement of camera, target, up=Yaxis, where to store output) 
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()), //perspective(45 degree field of view, width/height ratio, closer than 0.1 units invisible, farther than 1000 units invisible)
};
 

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex)); //layout of the vertex to arrange data for GPU 

const cubeBuffer = root
  .createBuffer(vertexLayout.schemaForCount(36), createCube()) //schema, data - allocates memory and fills it with data from createCube()
  .$usage("vertex"); //this buffor stores only vertexes

const cameraBuffer = root
  .createBuffer(Camera, cameraInitial)
  .$usage("uniform"); //this buffor stores data that is the same for the draw call

const transformBuffer = root
  .createBuffer(Transform, { model: m.mat4.identity(d.mat4x4f()) }) // { model matrix : raw model placement (output storage)}
  .$usage("uniform"); //all of the vertexes will be moving together

//model matrix moves one particullar model
//view matrix like (lookAt) moves camera

const layout = tgpu.bindGroupLayout({ //layout of resources for the shader has acces to
  camera: { uniform: Camera }, //
  transform: { uniform: Transform },
});

const bindGroup = root.createBindGroup(layout, { //group for binding the camera and transform buffers with the shader that fulfills the required layout
  camera: cameraBuffer,
  transform: transformBuffer,
});

//off-screen surface that tracks how far a pixel is from the camera

const depthTexture = root 
  .createTexture({
    size: [canvas.width, canvas.height], //same size as the canvas
    format: "depth24plus", //24 bits of precision 
    sampleCount: 4, //a pixel is sampled 4 times
  })
  .$usage("render"); //output storage for a draw

const msaaTexture = root
  .createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat, //same pixel format as the screen
    sampleCount: 4,
  })
  .$usage("render");

//a vertex shader that runs on GPU once for each vertex
const vertex = tgpu.vertexFn({
  in: { position: d.vec4f, color: d.vec4f }, //input: one vertex's position and color
  out: { pos: d.builtin.position, color: d.vec4f }, //output: screen position + color to pass to fragment shader
})((input) => {
  //multiply the vertex position through: object space(*model matrix) -> world space(*camera space) -> 2D clip space
  const pos = std.mul(
    layout.$.camera.projection, //apply perspective projection
    std.mul( 
      layout.$.camera.view, //apply camera view transform
      std.mul(layout.$.transform.model, input.position) //apply object's model transform
    )
  );
  return { pos, color: input.color }; //return 2d screen position, color
});


//fragment shader that runs on GPU once for each pixel
//it decides the color of a pixel
const fragment = tgpu.fragmentFn({
  in: { color: d.vec4f }, //input blended color value of a pixel (from nearby vertices)
  out: d.vec4f, //output final rgba color of a pixel
})((input) => input.color);//pass unchanged color no. shadow etc

//render pipeline
const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib, //how to read vertex data from buffer
  vertex, //vertex shader
  fragment, //fragment shader
  depthStencil: {
    format: "depth24plus", 
    depthWriteEnabled: true, //after drawing the depth values are saved to texture
    depthCompare: "less", //only drawing a pixel its depth is less (closer to the camera) 
  },
  multisample: { count: 4 }, //same as sampleCount in texture
});


function drawObject(
  buffer: typeof cubeBuffer, //vertex data from buffer
  group: typeof bindGroup, //bindgroup connecting uniforms to the shader
  vertexCount: number, //number of vertices
  loadOp: "clear" | "load", //clear - wpie the screen, load - draw on top
) {
  pipeline
    .withColorAttachment({
      view: msaaTexture, //draw into MSAA texture
      resolveTarget: context, //resolve 4 canvas down to canvas
      loadOp, //clear - wipe before drawing, load-keep existing content
    })
    .withDepthStencilAttachment({
      view: depthTexture, //depth texture
      depthClearValue: 1, //clear depth to 1.0 - (nothing is drawn)
      depthLoadOp: loadOp, 
      depthStoreOp: "store", //store the depth values after drawing
    })
    .with(vertexLayout, buffer) //connect vertex layout and cube vertex buffer to pipeline
    .with(group) //connect bind group
    .draw(vertexCount); //draw: vertex shader for 36 times, fill pixels with fragment shader
}


function frame() {
  drawObject(cubeBuffer, bindGroup, 36, "clear"); //draw a cube clear, clear the sceen
  requestAnimationFrame(frame); //before the next screen refresh call function frame
}

requestAnimationFrame(frame); //start of the loop