import tgpu, { d, std } from "typegpu";

const particleAmount = 180;

type Rgb = [number, number, number];

const defaultPalette: Rgb[] = [
  [255, 190, 11],
  [251, 86, 7],
  [255, 0, 110],
  [131, 56, 236],
  [58, 134, 255],
];

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function shadesOf(base: Rgb): Rgb[] {
  const [r, g, b] = base;
  const scale = (f: number): Rgb => [clamp255(r * f), clamp255(g * f), clamp255(b * f)];
  const towardWhite = (f: number): Rgb => [
    clamp255(r + (255 - r) * f),
    clamp255(g + (255 - g) * f),
    clamp255(b + (255 - b) * f),
  ];
  return [scale(0.5), scale(0.72), scale(0.9), base, towardWhite(0.3), towardWhite(0.6)];
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const ConfettiParticle = d.struct({
  color: d.vec4f,
  center: d.vec2f,
  size: d.vec2f,
  angle: d.f32,
});

const Aspect = d.struct({
  aspect: d.f32,
});

const CornerVertex = d.struct({
  corner: d.vec2f,
});

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  angle: number;
  angVel: number;
  seed: number;
  color: [number, number, number];
}

export function createConfetti(
  root: any,
  canvas: HTMLCanvasElement,
  presentationFormat: GPUTextureFormat,
) {
  const cornerLayout = tgpu.vertexLayout(d.arrayOf(CornerVertex));

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

  const particleBuffer = root
    .createBuffer(d.arrayOf(ConfettiParticle, particleAmount))
    .$usage("storage");

  const aspectBuffer = root
    .createBuffer(Aspect, { aspect: canvas.width / Math.max(1, canvas.height) })
    .$usage("uniform");

  const layout = tgpu.bindGroupLayout({
    particles: { storage: d.arrayOf(ConfettiParticle) },
    view: { uniform: Aspect },
  });

  const bindGroup = root.createBindGroup(layout, {
    particles: particleBuffer,
    view: aspectBuffer,
  });

  const vertex = tgpu.vertexFn({
    in: { corner: d.vec2f, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, color: d.vec4f },
  })((input) => {
    const p = layout.$.particles[input.instanceIndex];

    const lx = (input.corner.x - 0.5) * p.size.x;
    const ly = (input.corner.y - 0.5) * p.size.y;

    const ca = std.cos(p.angle);
    const sa = std.sin(p.angle);

    const rx = lx * ca - ly * sa;
    const ry = lx * sa + ly * ca;

    const px = rx + p.center.x;
    const py = (ry + p.center.y) * layout.$.view.aspect;

    return { pos: d.vec4f(px, py, d.f32(0), d.f32(1)), color: p.color };
  });

  const fragment = tgpu.fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })((i) => i.color);

  const pipeline = root.createRenderPipeline({
    attribs: cornerLayout.attrib,
    vertex,
    fragment,
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "always",
    },
    multisample: { count: 4 },
  });

  let palette: Rgb[] = defaultPalette;

  const particles: Particle[] = Array.from({ length: particleAmount }, () => spawn(true));

  function spawn(initial: boolean): Particle {
    const color = palette[Math.floor(Math.random() * palette.length)];
    const w = 0.018 + Math.random() * 0.03;
    return {
      x: Math.random() * 2 - 1,
      y: initial ? Math.random() * 2 + 1 : 1.05 + Math.random() * 0.6,
      vx: (Math.random() * 2 - 1) * 0.08,
      vy: -(0.18 + Math.random() * 0.35),
      w,
      h: w * 0.5,
      angle: Math.random() * Math.PI * 2,
      angVel: (Math.random() * 2 - 1) * 4,
      seed: Math.random() * 1000,
      color,
    };
  }

  let time = 0;
  const out = Array.from({ length: particleAmount }, () => ({
    color: d.vec4f(1, 1, 1, 1),
    center: d.vec2f(0, 0),
    size: d.vec2f(0, 0),
    angle: 0,
  }));

  return {
    start(baseHex?: string | null) {
      palette = baseHex ? shadesOf(hexToRgb(baseHex)) : defaultPalette;
      time = 0;
      for (let i = 0; i < particles.length; i++) particles[i] = spawn(true);
    },

    update(dt: number) {
      time += dt;
      aspectBuffer.write({ aspect: canvas.width / Math.max(1, canvas.height) });

      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.x += p.vx * dt + Math.sin(time * 1.5 + p.seed) * 0.0015;
        p.y += p.vy * dt;
        p.angle += p.angVel * dt;

        if (p.y < -1.25) {
          p = spawn(false);
          particles[i] = p;
        }

        const o = out[i];
        o.color = d.vec4f(p.color[0] / 255, p.color[1] / 255, p.color[2] / 255, 1);
        o.center = d.vec2f(p.x, p.y);
        o.size = d.vec2f(p.w, p.h);
        o.angle = p.angle;
      }

      particleBuffer.write(out);
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
        .draw(6, particleAmount);
    },
  };
}
