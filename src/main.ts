import tgpu, { d, std } from "typegpu";
import * as m from "wgpu-matrix";

const root = await tgpu.init();

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
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
