import tgpu, { d, std } from "typegpu";
import { Camera } from "./camera";
import { ExplosionLights, maxExplosionLights } from "./lighting";

const maxExplosions = 8;
const lifetime = 0.55;
const vfxRadius = 4.5;
const lightRadius = 16;
const lightPeak = 2.2;


const ExplosionInstance = d.struct({
  center: d.vec3f,
  radius: d.f32,
  seed: d.f32,
  fade: d.f32,
});

const BillboardBasis = d.struct({
  right: d.vec3f,
  up: d.vec3f,
});

const Corner = d.struct({ corner: d.vec2f });

const hash21 = tgpu.fn([d.vec2f], d.f32)((p) => {
  const h = std.dot(p, d.vec2f(127.1, 311.7));
  return std.fract(std.sin(h) * d.f32(43758.5453));
});

const valueNoise = tgpu.fn([d.vec2f], d.f32)((p) => {
  const cell = std.floor(p);
  const f = std.fract(p);
  const ux =f.x * f.x * (d.f32(3) - d.f32(2) * f.x);
  const uy = f.y * f.y * (d.f32(3)-d.f32(2) * f.y);
  const a = hash21(cell);
  const b = hash21(std.add(cell, d.vec2f(1, 0)));
  const c = hash21(std.add(cell, d.vec2f(0, 1)));
  const e= hash21(std.add(cell, d.vec2f(1, 1)));
  return std.mix(std.mix(a, b, ux), std.mix(c, e, ux), uy);
});



interface ActiveExplosion {
  x: number;
  y: number;
  z: number;
  age: number;
  seed: number;
}

function zeroLights() {
  const lights = [];

  for (let i = 0; i < maxExplosionLights; i++) {
    lights.push({
      pos: d.vec3f(0, 0, 0),
      radius: 0,
      color: d.vec3f(0, 0, 0),
      intensity: 0,
    });
  }
  
  return { count: 0, lights };
}

export function createExplosionSystem(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,
) {
  const cornerLayout = tgpu.vertexLayout(d.arrayOf(Corner));

  const cornerBuffer = root
    .createBuffer(cornerLayout.schemaForCount(6), [
      { corner: d.vec2f(0, 0) },
      { corner: d.vec2f(1, 0) },
      { corner: d.vec2f(0, 1) },
      { corner: d.vec2f(1, 0) },
      { corner: d.vec2f(1, 1) },
      { corner: d.vec2f(0, 1) },
    ])
    .$usage("vertex");

  const instanceBuffer = root
    .createBuffer(d.arrayOf(ExplosionInstance, maxExplosions))
    .$usage("storage");

  const basisBuffer = root
    .createBuffer(BillboardBasis, { right: d.vec3f(1, 0, 0), up: d.vec3f(0, 1, 0) })
    .$usage("uniform");

  const lightsBuffer = root
    .createBuffer(ExplosionLights, zeroLights())
    .$usage("uniform");

  const layout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    basis: { uniform: BillboardBasis },
    instances: { storage: d.arrayOf(ExplosionInstance) },
  });

  const bindGroup = root.createBindGroup(layout, {
    camera: cameraBuffer,
    basis: basisBuffer,
    instances: instanceBuffer,
  });

  
  const vertex = tgpu.vertexFn({
    in: { corner: d.vec2f, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, uv: d.vec2f, seed: d.f32, fade: d.f32 },
  })((input) => {
    const inst = layout.$.instances[input.instanceIndex];

    const uv = d.vec2f(
      input.corner.x * d.f32(2) - d.f32(1),
      input.corner.y * d.f32(2) - d.f32(1),
    );

    const offset = std.add(
      std.mul(layout.$.basis.right, uv.x * inst.radius),
      std.mul(layout.$.basis.up, uv.y * inst.radius),
    );

    const worldPos = std.add(inst.center, offset);

    const clip = std.mul(
      layout.$.camera.projection,
      std.mul(layout.$.camera.view, d.vec4f(worldPos, d.f32(1))),
    );


    return { pos: clip, uv, seed: inst.seed, fade: inst.fade };
  });

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, seed: d.f32, fade: d.f32 },
    out: d.vec4f,
  })((i) => {
    const r = std.length(i.uv);
    const np = std.add(std.mul(i.uv, d.f32(2.3)), d.vec2f(i.seed, i.seed));
    
    const turbulence =valueNoise(np) * d.f32(0.62) + valueNoise(std.mul(np, d.f32(2.5))) * d.f32(0.3);

    const edge = r + (turbulence - d.f32(0.46)) * d.f32(0.72);

    const core = d.f32(1) - std.smoothstep(d.f32(0.18), d.f32(1), edge);

    const hot = d.vec3f(1, 0.96, 0.8);
    const mid = d.vec3f(1, 0.5, 0.13);
    const rim = d.vec3f(0.72, 0.13, 0.05);
    const inner = std.mix(hot, mid, std.smoothstep(d.f32(0), d.f32(0.55), edge));
    const col = std.mix(inner, rim, std.smoothstep(d.f32(0.55), d.f32(1), edge));

    const brightness = core * i.fade;
    return d.vec4f(std.mul(col, brightness * d.f32(2.4)), d.f32(1));
  });

  const pipeline = root.createRenderPipeline({
    attribs: cornerLayout.attrib,
    vertex,
    fragment,
    targets: {
      format: presentationFormat,
      blend: {
        color: { srcFactor: "one", dstFactor: "one", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
      },
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

  const explosions: ActiveExplosion[] = [];

  return {
    get lightsBuffer() {
      return lightsBuffer;
    },

    spawn(x: number, y: number, z: number) {
      explosions.push({ x, y, z, age: 0, seed: Math.random() * 100 });
      if (explosions.length > maxExplosions) explosions.shift();
    },

    setCameraBasis(
      right: [number, number, number],
      up: [number, number, number],
    ) {
      basisBuffer.write({
        right: d.vec3f(right[0], right[1], right[2]),
        up: d.vec3f(up[0], up[1], up[2]),
      });
    },

    update(dt: number) {
      for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].age += dt;
        if (explosions[i].age >= lifetime) explosions.splice(i, 1);
      }

      const instances = [];
      for (let i = 0; i < maxExplosions; i++) {
        if (i < explosions.length) {
          const e = explosions[i];
          const t = e.age / lifetime;
          const radius = vfxRadius * (1 - Math.pow(1 - t, 3));
          const fade = t < 0.22 ? 1 : Math.pow(1 - (t - 0.22) / 0.78, 1.7);
          instances.push({
            center: d.vec3f(e.x, e.y, e.z),
            radius,
            seed: e.seed,
            fade: Math.max(0, fade),
          });
        } else {
          instances.push({
            center: d.vec3f(0, 0, 0),
            radius: 0,
            seed: 0,
            fade: 0,
          });
        }
      }
      instanceBuffer.write(instances);

      const count = Math.min(explosions.length, maxExplosionLights);
      const lights = [];

      for(let i = 0; i < maxExplosionLights; i++){
        if(i < count){
          const e = explosions[i];
          const t = e.age / lifetime;
          const intensity = lightPeak * (t < 0.14 ? t/0.14 : Math.pow(1 - (t - 0.14) / 0.86, 1.6));
          lights.push({
            pos: d.vec3f(e.x, e.y, e.z),
            radius: lightRadius,
            color: d.vec3f(1, 0.72, 0.4),
            intensity: Math.max(0, intensity),
          });
        }else{
          lights.push({
            pos: d.vec3f(0, 0, 0),
            radius: 0,
            color: d.vec3f(0, 0, 0),
            intensity: 0,
          });
        }
      }
      lightsBuffer.write({ count, lights });
    },

    draw(msaaTexture: any, depthTexture: any, context: any) {
      pipeline
        .withColorAttachment({
          view: msaaTexture,
          resolveTarget: context,
          loadOp: "load",
        })
        .withDepthStencilAttachment({
          view: depthTexture,
          depthClearValue: 1,
          depthLoadOp: "load",
          depthStoreOp: "store",
        })
        .with(cornerLayout, cornerBuffer)
        .with(bindGroup)
        .draw(6, maxExplosions);
    },
  };
}
