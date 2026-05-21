import tgpu, { d, std } from "typegpu";
import { Camera } from "./camera";

const SkyVertex = d.struct({ position: d.vec2f });
const skyVertexLayout = tgpu.vertexLayout(d.arrayOf(SkyVertex));

const skyLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});

const hash13 = tgpu.fn([d.vec3f], d.f32)((p) => {
  let p3 = std.fract(std.mul(p, d.f32(0.1031)));
  p3 = std.add(p3, d.vec3f(std.dot(p3, std.add(p3.zyx, d.vec3f(31.32)))));
  return std.fract((p3.x + p3.y) * p3.z);
});

const skyVertex = tgpu.vertexFn({
  in: { position: d.vec2f },
  out: { pos: d.builtin.position, ndc: d.vec2f },
})((input) => ({
  pos: d.vec4f(input.position.x, input.position.y, d.f32(0.9999), d.f32(1)),
  ndc:input.position,
}));

const skyFragment = tgpu.fragmentFn({
  in: { ndc: d.vec2f },
  out: d.vec4f,
})((i) => {
  const invVP = skyLayout.$.camera.invViewProj;
  const nearH = std.mul(invVP, d.vec4f(i.ndc.x, i.ndc.y, d.f32(0), d.f32(1)));
  const farH = std.mul(invVP, d.vec4f(i.ndc.x, i.ndc.y, d.f32(1), d.f32(1)));
  const nearW = std.mul(nearH.xyz, d.f32(1)/nearH.w);
  const farW= std.mul(farH.xyz, d.f32(1)/farH.w);
  const rd = std.normalize(std.sub(farW, nearW));

  let color = d.vec3f(0, 0, 0);

  const starPos = std.mul(rd, d.f32(50));
  const cell = std.floor(starPos);
  const local =std.fract(starPos);
  const rx=hash13(cell);
  const ry=hash13(std.add(cell,d.vec3f(19.19, 0, 0)));
  const rz=hash13(std.add(cell, d.vec3f(0, 37.31, 0)));
  const rExist= hash13(std.add(cell, d.vec3f(0, 0, 11.71)));
  const starCenter = std.add(std.mul(d.vec3f(rx, ry, rz), d.f32(0.6)), d.vec3f(0.2, 0.2, 0.2));
  const starDist = std.length(std.sub(local, starCenter));
  const glow = std.max(d.f32(1)-starDist *d.f32(4), d.f32(0));
  const intensity = std.pow(glow, d.f32(4)) * std.step(d.f32(0.85), rExist)* d.f32(3);
  const starColor = std.mix(d.vec3f(1, 0.9, 0.8), d.vec3f(0.8, 0.9, 1), rExist);
  color = std.add(color, std.mul(starColor, intensity));

  return d.vec4f(color, d.f32(1));
});

export interface Background {
  draw(msaaTexture: any, depthTexture: any, context: any): void;
}

export function createBackground(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,
): Background {
  const skyBuffer = root
    .createBuffer(skyVertexLayout.schemaForCount(6), [
      { position: d.vec2f(-1, -1) },
      { position: d.vec2f( 1, -1) },
      { position: d.vec2f( 1,  1) },
      { position: d.vec2f(-1, -1) },
      { position: d.vec2f( 1,  1) },
      { position: d.vec2f(-1,  1) },
    ])
    .$usage("vertex");

  const skyBindGroup = root.createBindGroup(skyLayout, { camera: cameraBuffer });

  const skyPipeline = root.createRenderPipeline({
    attribs: skyVertexLayout.attrib,
    vertex: skyVertex,
    fragment: skyFragment,
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "less-equal",
    },
    multisample: { count: 4 },
  });


  return {
    draw(msaaTexture, depthTexture, context) {
      skyPipeline
        .withColorAttachment({
          view: msaaTexture,
          resolveTarget: context,
          loadOp: "clear",
          clearValue: [0, 0, 0, 1],
        })
        .withDepthStencilAttachment({
          view: depthTexture,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        })
        .with(skyVertexLayout, skyBuffer)
        .with(skyBindGroup)
        .draw(6);
    },
  };

}
