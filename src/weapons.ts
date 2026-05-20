import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, FPeyeHeight } from "./camera";
import { ModelUniforms } from "./modelSchema";
import { loadGLBModel } from "./modelLoader";
import { getSceneSDF } from "./movement";
import type { GameStateMachine } from "./gameState";
import type { GravityController } from "./gravity";
import type { MapController } from "./map";
import { cubeInstance } from "./map";
import type { createGameCamera } from "./camera";
import type { PhysicsController } from "./movement";

const rocketSPEED = 40;
const rocketRADIUS = 0.25;               
const rocketRadiusDESTROY = 5;          
const rocketRadiusSPLASH = 6;           
const rocketSplashDAMAGE = 80;
const rocketDiameter = 0.35;
const rocketDiameterHELD = 0.45;
const rocketPLAYERHITRadius = 0.6;
const rocketMAXlifetime = 5;
const rocketMAXinstances = 8;
const rocketsMAX = 4;

interface Rocket {
  pos: Vec3;
  vel: Vec3;
  owner: number;
  lifetime: number;
}

type Vec3 = [number, number, number];

function rotateAboutAxis(v: Vec3, a: Vec3, cos: number, sin: number): Vec3 {
  const cross: Vec3 = [
    a[1] * v[2] - a[2] * v[1],
    a[2] * v[0] - a[0] * v[2],
    a[0] * v[1] - a[1] * v[0],
  ];
  const dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const k = dot * (1 - cos);

  return [
    v[0] * cos + cross[0] * sin + a[0] * k,
    v[1] * cos + cross[1] * sin + a[1] * k,
    v[2] * cos + cross[2] * sin + a[2] * k,
  ];
}

interface WeaponDeps {
  gsm: GameStateMachine;
  camera: ReturnType<typeof createGameCamera>;
  gravity: GravityController;
  map: MapController;
  canvas: HTMLCanvasElement;
  physics: PhysicsController;
}

const granadeKnockbackForce = 26;
const rocketKnockbackForce = 40;

function sdfNormal(px: number, py: number, pz: number): [number, number, number]{
  const eps = 0.01;
  const s1 = getSceneSDF(px + eps, py - eps, pz - eps);
  const s2 = getSceneSDF(px - eps, py - eps, pz + eps);
  const s3 = getSceneSDF(px - eps, py+ eps, pz - eps);
  const s4 = getSceneSDF(px + eps, py + eps, pz + eps);

  let nx = s1 - s2 - s3 + s4;
  let ny = -s1 - s2 + s3 + s4;
  let nz = -s1 + s2 - s3 + s4;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return [0, 1, 0];
  return [nx / len, ny / len, nz / len];
}

export async function createWeaponSystem(
  root: any,
  cameraBuffer: any,
  presentationFormat: GPUTextureFormat,
  deps: WeaponDeps,
) {
  const { gsm, camera, gravity, map, canvas, physics } = deps;

  const model = await loadGLBModel("/assets/bomb.glb");

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < model.vertexCount; i++) {
    const x = model.positions[i * 3 + 0];
    const y = model.positions[i * 3 + 1];
    const z = model.positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];

  function buildMat(
    px: number, py: number, pz: number,
    scale: number,
    c0: Vec3 = [1, 0, 0],
    c1: Vec3 = [0, 1, 0],
    c2: Vec3 = [0, 0, 1],
  ) {
    const mat = d.mat4x4f();
    m.mat4.identity(mat);
    mat[0] = c0[0] * scale; mat[1] = c0[1] * scale; mat[2] = c0[2] * scale; mat[3] = 0;
    mat[4] = c1[0] * scale; mat[5] = c1[1] * scale; mat[6] = c1[2] * scale; mat[7] = 0;
    mat[8] = c2[0] * scale; mat[9] = c2[1] * scale; mat[10] = c2[2] * scale; mat[11] = 0;
    const cx = center[0], cy = center[1], cz = center[2];
    mat[12] = px - scale * (c0[0] * cx + c1[0] * cy + c2[0] * cz);
    mat[13] = py - scale * (c0[1] * cx + c1[1] * cy + c2[1] * cz);
    mat[14] = pz - scale * (c0[2] * cx + c1[2] * cy + c2[2] * cz);
    mat[15] = 1;
    return mat;
  }

  const ModelVertexData = d.struct({
    position: d.vec3f,
    normal: d.vec3f,
    materialId: d.u32,
  });
  const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertexData));

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(model.vertexCount))
    .$usage("vertex");

  (common.writeSoA as any)(vertexBuffer, {
    position: model.positions,
    normal: model.normals,
    materialId: model.materialIds,
  });

  const indexBuffer = root
    .createBuffer(d.arrayOf(d.u32, model.indexCount), Array.from(model.indices))
    .$usage("index");

  const materialCount = model.paletteData.length / 4;
  const palette = Array.from({ length: materialCount }, (_, i) =>
    d.vec4f(
      model.paletteData[i * 4 + 0],
      model.paletteData[i * 4 + 1],
      model.paletteData[i * 4 + 2],
      model.paletteData[i * 4 + 3],
    ),
  );
  const paletteBuffer = root
    .createBuffer(d.arrayOf(d.vec4f, materialCount), palette)
    .$usage("storage");

  const modelLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    modelUniforms: { uniform: ModelUniforms },
    palette: { storage: d.arrayOf(d.vec4f) },
  });

  const modelVertex = tgpu.vertexFn({
    in: { position: d.vec3f, normal: d.vec3f, materialId: d.u32 },
    out: { pos: d.builtin.position, color: d.vec4f },
  })((input) => {
    const worldPos = std.mul(
      modelLayout.$.modelUniforms.model,
      d.vec4f(input.position, d.f32(1)),
    );
    const pos = std.mul(
      modelLayout.$.camera.projection,
      std.mul(modelLayout.$.camera.view, worldPos),
    );
    return { pos, color: modelLayout.$.palette[input.materialId] };
  });

  const modelFragment = tgpu.fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })((i) => i.color);

  const pipeline = root.createRenderPipeline({
    attribs: { ...modelVertexLayout.attrib },
    vertex: modelVertex,
    fragment: modelFragment,
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

  const RocketVertex = d.struct({ position: d.vec4f, color: d.vec4f });
  const rocketVertexLayout = tgpu.vertexLayout(d.arrayOf(RocketVertex));

  const rocketCubeVerts = (() => {
    const topClr = d.vec4f(1.0, 0.40, 0.30, 1);
    const sideClr = d.vec4f(0.95, 0.22, 0.15, 1);
    const bottomClr = d.vec4f(0.65, 0.10, 0.08, 1);
    const face = (positions: number[][], color: any) =>
      positions.map((p) => ({
        position: d.vec4f(p[0], p[1], p[2], p[3]),
        color,
      }));
    return [
      ...face([
        [-0.5, -0.5,  0.5, 1], [0.5, -0.5,  0.5, 1], [0.5,  0.5,  0.5, 1],
        [-0.5, -0.5,  0.5, 1], [0.5,  0.5,  0.5, 1], [-0.5,  0.5,  0.5, 1],
      ], sideClr),
      ...face([
        [-0.5, -0.5, -0.5, 1], [-0.5,  0.5, -0.5, 1], [0.5, -0.5, -0.5, 1],
        [ 0.5, -0.5, -0.5, 1], [-0.5,  0.5, -0.5, 1], [0.5,  0.5, -0.5, 1],
      ], sideClr),
      ...face([
        [-0.5, 0.5, -0.5, 1], [-0.5, 0.5,  0.5, 1], [0.5, 0.5, -0.5, 1],
        [ 0.5, 0.5, -0.5, 1], [-0.5, 0.5,  0.5, 1], [0.5, 0.5,  0.5, 1],
      ], topClr),
      ...face([
        [-0.5, -0.5, -0.5, 1], [ 0.5, -0.5, -0.5, 1], [-0.5, -0.5,  0.5, 1],
        [ 0.5, -0.5, -0.5, 1], [ 0.5, -0.5,  0.5, 1], [-0.5, -0.5,  0.5, 1],
      ], bottomClr),
      ...face([
        [0.5, -0.5, -0.5, 1], [0.5,  0.5, -0.5, 1], [0.5, -0.5,  0.5, 1],
        [0.5, -0.5,  0.5, 1], [0.5,  0.5, -0.5, 1], [0.5,  0.5,  0.5, 1],
      ], sideClr),
      ...face([
        [-0.5, -0.5, -0.5, 1], [-0.5, -0.5,  0.5, 1], [-0.5,  0.5, -0.5, 1],
        [-0.5, -0.5,  0.5, 1], [-0.5,  0.5,  0.5, 1], [-0.5,  0.5, -0.5, 1],
      ], sideClr),
    ];
  })();

  const rocketCubeBuffer = root
    .createBuffer(rocketVertexLayout.schemaForCount(36), rocketCubeVerts)
    .$usage("vertex");

  const rocketInstanceBuffer = root
    .createBuffer(d.arrayOf(cubeInstance, rocketMAXinstances))
    .$usage("storage");

  const rocketLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    instance: { storage: d.arrayOf(cubeInstance) },
  });

  const rocketBindGroup = root.createBindGroup(rocketLayout, {
    camera: cameraBuffer,
    instance: rocketInstanceBuffer,
  });

  const rocketVertexShader = tgpu.vertexFn({
    in: { position: d.vec4f, color: d.vec4f, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, color: d.vec4f },
  })((input) => {
    const pos = std.mul(
      rocketLayout.$.camera.projection,
      std.mul(
        rocketLayout.$.camera.view,
        std.mul(rocketLayout.$.instance[input.instanceIndex].model, input.position),
      ),
    );
    return { pos, color: input.color };
  });

  const rocketPipeline = root.createRenderPipeline({
    attribs: rocketVertexLayout.attrib,
    vertex: rocketVertexShader,
    fragment: tgpu.fragmentFn({ in: { color: d.vec4f }, out: d.vec4f })((i) => i.color),
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

  function buildCubeMat(px: number, py: number, pz: number, scale: number) {
    const mat = d.mat4x4f();
    m.mat4.identity(mat);
    mat[0] = scale;
    mat[5] = scale;
    mat[10] = scale;
    mat[12] = px;
    mat[13] = py;
    mat[14] = pz;
    return mat;
  }

  const rocketFarFiller = { model: m.mat4.translation([1e7, 1e7, 1e7], d.mat4x4f()) };

  const rockets: Rocket[] = [];
  let charging = false;
  let charge = 0;

  function activePlayer() {
    return gsm.state.players[gsm.state.currentPlayerIndex];
  }

  function rocketSelectedAndAimed(): boolean {
    const s = gsm.state;
    return s.phase === "playing" && !s.inventoryOpen && s.selectedWeapon?.name === "Rocket Launcher";
  }

  function anyWeaponSelectedAndAimed(): boolean {
    const s = gsm.state;
    return s.phase === "playing" && !s.inventoryOpen && !!s.selectedWeapon;
  }

  function canFireRocket(): boolean {
    const p = activePlayer();
    return (
      rocketSelectedAndAimed() &&
      document.pointerLockElement === canvas &&
      !!p && p.alive &&
      rockets.length < rocketsMAX &&
      !gsm.state.weaponUsed
    );
  }

  function fireRocket() {
    const p = activePlayer();
    if (!p) return;
    const idx = gsm.state.currentPlayerIndex;
    const aim = camera.getAimDir();
    const up = camera.getUpDir();
    const right = camera.getRightDir();
    const fwd = camera.getForwardDir();
    rockets.push({
      pos: [
        p.posX + up[0] * 0.18 + right[0] * 0.40 + fwd[0] * 0.70,
        p.posY + up[1] * 0.18 + right[1] * 0.40 + fwd[1] * 0.70,
        p.posZ + up[2] * 0.18 + right[2] * 0.40 + fwd[2] * 0.70,
      ],
      vel: [aim[0] * rocketSPEED, aim[1] * rocketSPEED, aim[2] * rocketSPEED],
      owner: idx,
      lifetime: 0,
    });
    gsm.notifyWeaponFired();
  }

  function detonateRocket(r: Rocket, directHit: number | null) {
    const [x, y, z] = r.pos;
    map.destroySphere(x, y, z, rocketRadiusDESTROY);
    if (directHit !== null) {
       gsm.killPlayer(directHit, "weapon", r.owner);
    }
    gsm.applyExplosionDamage(
      x, y, z,
      rocketRadiusSPLASH, rocketSplashDAMAGE,
      rocketRadiusSPLASH, rocketSplashDAMAGE,
      r.owner,
    );
    physics.applyExplosion(x, y, z, rocketRadiusSPLASH, rocketKnockbackForce, gsm.state.players);
    gsm.notifyWeaponDetonated();
  }

  function aimSetup() {
    const p = activePlayer();
    if (!p) return null;
    const idx = gsm.state.currentPlayerIndex;
    const aim = camera.getAimDir();
    const right = camera.getRightDir();
    const up = camera.getUpDir();
    const spawn: Vec3 = [
      p.posX + up[0] * FPeyeHeight + aim[0] * 0.6 + right[0] * 0.15,
      p.posY + up[1] * FPeyeHeight + aim[1] * 0.6 + right[1] * 0.15,
      p.posZ + up[2] * FPeyeHeight + aim[2] * 0.6 + right[2] * 0.15,
    ];
    const gd = gravity.getGravity(idx).down;
    return {
      idx,
      aim: [aim[0], aim[1], aim[2]] as Vec3,
      spawn,
      gd: [gd[0], gd[1], gd[2]] as Vec3,
    };
  }

  return {
    update(dt: number) {

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.pos[0] += r.vel[0] * dt;
        r.pos[1] += r.vel[1] * dt;
        r.pos[2] += r.vel[2] * dt;
        r.lifetime += dt;

        let directHit: number | null = null;
        for (const pl of gsm.state.players) {
          if (!pl.alive) continue;
          if (pl.index === r.owner) continue;
          const dx = pl.posX - r.pos[0];
          const dy = pl.posY - r.pos[1];
          const dz = pl.posZ - r.pos[2];
          if (dx * dx + dy * dy + dz * dz < rocketPLAYERHITRadius * rocketPLAYERHITRadius) {
            directHit = pl.index;
            break;
          }
        }

        const hitSDF = getSceneSDF(r.pos[0], r.pos[1], r.pos[2]) < rocketRADIUS;
        const expired = r.lifetime >= rocketMAXlifetime;

        if (directHit !== null || hitSDF || expired) {
          detonateRocket(r, directHit);
          rockets.splice(i, 1);
        }
      }
    },

    draw(msaaTexture: any, depthTexture: any, context: any) {
      const instances: Array<{
        x: number; y: number; z: number; scale: number;
        c0?: Vec3; c1?: Vec3; c2?: Vec3;
      }> = [];


      const drawCount = Math.min(instances.length);
      for (let i = 0; i < drawCount; i++) {

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
          .with(modelVertexLayout, vertexBuffer)
          .withIndexBuffer(indexBuffer)
          .drawIndexed(model.indexCount);
      }

       const rocketInstances: { model: any }[] = [];
      if (rocketSelectedAndAimed()) {
        const p = activePlayer();
        if (p && p.alive) {
          const fwd = camera.getForwardDir();
          const right = camera.getRightDir();
          const up = camera.getUpDir();
          rocketInstances.push({
            model: buildCubeMat(
              p.posX + up[0] * 0.18 + right[0] * 0.40 + fwd[0] * 0.70,
              p.posY + up[1] * 0.18 + right[1] * 0.40 + fwd[1] * 0.70,
              p.posZ + up[2] * 0.18 + right[2] * 0.40 + fwd[2] * 0.70,
              rocketDiameterHELD,
            ),
          });
        }
      }
      for (const r of rockets) {
        rocketInstances.push({
          model: buildCubeMat(r.pos[0], r.pos[1], r.pos[2], rocketDiameter),
        });
      }

      if (rocketInstances.length > 0) {
        const padded = rocketInstances.slice(0, rocketMAXinstances);
        while (padded.length < rocketMAXinstances) padded.push(rocketFarFiller);
        rocketInstanceBuffer.write(padded);

        rocketPipeline
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
          .with(rocketVertexLayout, rocketCubeBuffer)
          .with(rocketBindGroup)
          .draw(36, Math.min(rocketInstances.length, rocketMAXinstances));
      }
    },

    getUIState() {
      return {
        weaponSelected: anyWeaponSelectedAndAimed(),
        charge,
      };
    },
  };
}
