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
