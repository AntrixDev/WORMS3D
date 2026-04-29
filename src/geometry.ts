import tgpu, { d} from "typegpu";

const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});


export const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

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

export function createCubeBuffer(root: any) {
  return root
    .createBuffer(vertexLayout.schemaForCount(36), createCube())
    .$usage("vertex");
}

