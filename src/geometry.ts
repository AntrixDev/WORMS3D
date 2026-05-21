import tgpu, { d } from "typegpu";
import * as m from "wgpu-matrix";

const Vertex = d.struct({
  position: d.vec4f,
  faceNormal: d.vec3f,
  faceUv: d.vec2f,
});

export const Transform = d.struct({
  model: d.mat4x4f,
});

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

function createFace(
  positions: number[][],
  normal: [number, number, number],
  normalAxis: number,
): d.Infer<typeof Vertex>[] {
  const others = [0, 1, 2].filter((i) => i !== normalAxis);
  return positions.map((pos) => ({
    position: d.vec4f(...(pos as [number, number, number, number])),
    faceNormal: d.vec3f(normal[0], normal[1], normal[2]),
    faceUv: d.vec2f(pos[others[0]] + 0.5, pos[others[1]] + 0.5),
  }));
}

function createCube(): d.Infer<typeof Vertex>[] {
  const front = createFace([
    [-0.5, -0.5,  0.5, 1], [0.5, -0.5,  0.5, 1], [0.5,  0.5,  0.5, 1],
    [-0.5, -0.5,  0.5, 1], [0.5,  0.5,  0.5, 1], [-0.5,  0.5,  0.5, 1],
  ], [0, 0, 1], 2);
  const back = createFace([
    [-0.5, -0.5, -0.5, 1], [-0.5,  0.5, -0.5, 1], [0.5, -0.5, -0.5, 1],
    [ 0.5, -0.5, -0.5, 1], [-0.5,  0.5, -0.5, 1], [0.5,  0.5, -0.5, 1],
  ], [0, 0, -1], 2);
  const top = createFace([
    [-0.5, 0.5, -0.5, 1], [-0.5, 0.5,  0.5, 1], [0.5, 0.5, -0.5, 1],
    [ 0.5, 0.5, -0.5, 1], [-0.5, 0.5,  0.5, 1], [0.5, 0.5,  0.5, 1],
  ], [0, 1, 0], 1);
  const bottom = createFace([
    [-0.5, -0.5, -0.5, 1], [ 0.5, -0.5, -0.5, 1], [-0.5, -0.5,  0.5, 1],
    [ 0.5, -0.5, -0.5, 1], [ 0.5, -0.5,  0.5, 1], [-0.5, -0.5,  0.5, 1],
  ], [0, -1, 0], 1);
  const right = createFace([
    [0.5, -0.5, -0.5, 1], [0.5,  0.5, -0.5, 1], [0.5, -0.5,  0.5, 1],
    [0.5, -0.5,  0.5, 1], [0.5,  0.5, -0.5, 1], [0.5,  0.5,  0.5, 1],
  ], [1, 0, 0], 0);
  const left = createFace([
    [-0.5, -0.5, -0.5, 1], [-0.5, -0.5,  0.5, 1], [-0.5,  0.5, -0.5, 1],
    [-0.5, -0.5,  0.5, 1], [-0.5,  0.5,  0.5, 1], [-0.5,  0.5, -0.5, 1],
  ], [-1, 0, 0], 0);
  return [...front, ...back, ...top, ...bottom, ...right, ...left];
}

export function createCubeBuffer(root: any) {
  return root
    .createBuffer(vertexLayout.schemaForCount(36), createCube())
    .$usage("vertex");
}

export function createTransformBuffer(root: any) {
  return root
     .createBuffer(Transform, { model: m.mat4.identity(d.mat4x4f()) })
    .$usage("uniform");
}
