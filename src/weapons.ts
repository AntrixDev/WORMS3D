import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, FPeyeHeight } from "./camera";
import { ModelUniforms } from "./modelSchema";
import { loadGLBModel } from "./modelLoader";
import { getSceneSDF } from "./movement";
import type { GameStateMachine } from "./gameState";
import type { GravityController } from "./gravity";
import type { MapController } from "./map";
import type { createGameCamera } from "./camera";

const rocketInstance = d.struct({
  model: d.mat4x4f,
});
import type { PhysicsController } from "./movement";

const chargeTime = 2;       
const fuseTime = 1.5;       
const MINspeed = 8;         
const MAXspeed = 44;         
const gravityScale = 1.3;    
const rollRate = 0.5;        
const explRadius = 6;       
const outerRadius = 10;     
const innerDamage = 40;
const outerDamage = 10;
const bombRadius = 0.25; 
const restitution = 0.55;     
const heldDiameter = 0.45;
const bombDiameter = 0.4;
const MAXinstances = 16;
const MAXbombs = 8;

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

interface Bomb {
  pos: Vec3;
  vel: Vec3;
  gd: Vec3;
  mag: number;
  fuse: number;
  owner: number;
  c0: Vec3;
  c1: Vec3;
  c2: Vec3;
}

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
  explode: (x: number, y: number, z: number) => void;
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
  const { gsm, camera, gravity, map, canvas, physics, explode } = deps;

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
  const maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const heldScale = heldDiameter / maxExtent;
  const bombScale = bombDiameter / maxExtent;

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

  const uniformPool = Array.from({ length: MAXinstances }, () =>
    root.createBuffer(ModelUniforms, { model: buildMat(0, -9999, 0, bombScale) }).$usage("uniform"),
  );
  const bindPool = uniformPool.map((ub: any) =>
    root.createBindGroup(modelLayout, {
      camera: cameraBuffer,
      modelUniforms: ub,
      palette: paletteBuffer,
    }),
  );

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
    .createBuffer(d.arrayOf(rocketInstance, rocketMAXinstances))
    .$usage("storage");

  const rocketLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    instance: { storage: d.arrayOf(rocketInstance) },
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

  const bombs: Bomb[] = [];
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

    explode(x, y, z);

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

  function bombSelectedAndAimed(): boolean {
    const s = gsm.state;
    return (
      s.phase === "playing" &&
      !s.inventoryOpen &&
      s.selectedWeapon?.name === "Bomb"
    );
  }

  function canCharge(): boolean {
    const p = activePlayer();
    return (
      bombSelectedAndAimed() &&
      document.pointerLockElement === canvas &&
      !!p && p.alive &&
      !charging &&
      bombs.length < MAXbombs
    );
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

  function chargedSpeed() {
    return MINspeed + charge * (MAXspeed - MINspeed);
  }

  function throwBomb() {
    charging = false;
    const a = aimSetup();
    if (!a) { charge = 0; return; }

    const speed = chargedSpeed();

    bombs.push({
      pos: [a.spawn[0], a.spawn[1], a.spawn[2]],
      vel: [a.aim[0] * speed, a.aim[1] * speed, a.aim[2] * speed],
      gd: a.gd,
      mag: gravity.magnitude,
      fuse: fuseTime,
      owner: a.idx,
      c0: [1, 0, 0],
      c1: [0, 1, 0],
      c2: [0, 0, 1],
    });

    charge = 0;
    gsm.notifyWeaponFired();
  }

  function previewAscending(): { points: Vec3[]; camPos: Vec3 } | null {
    if (!bombSelectedAndAimed()) return null;
    const p = activePlayer();
    if (!p) return null;

    const up = camera.getUpDir();       
    const right = camera.getRightDir(); 
    const fwd = camera.getForwardDir();  
    const aim = camera.getAimDir();     

    const bombCenter: Vec3 = [
      p.posX + up[0] * 0.18 + right[0] * 0.40 + fwd[0] * 0.70,
      p.posY + up[1] * 0.18 + right[1] * 0.40 + fwd[1] * 0.70,
      p.posZ + up[2] * 0.18 + right[2] * 0.40 + fwd[2] * 0.70,
    ];

    let vrx = aim[1] * up[2] - aim[2] * up[1];
    let vry = aim[2] * up[0] - aim[0] * up[2];
    let vrz = aim[0] * up[1] - aim[1] * up[0];
    let vrl = Math.hypot(vrx, vry, vrz);
    if (vrl < 0.001) { vrx = right[0]; vry = right[1]; vrz = right[2]; vrl = 1; }
    vrx /= vrl; vry /= vrl; vrz /= vrl;
    const vux = vry * aim[2] - vrz * aim[1];
    const vuy = vrz * aim[0] - vrx * aim[2];
    const vuz = vrx * aim[1] - vry * aim[0];

    const fuseOff = 0.18;
    const start: Vec3 = [
      bombCenter[0] + vux * fuseOff,
      bombCenter[1] + vuy * fuseOff,
      bombCenter[2] + vuz * fuseOff,
    ];

    const idx = gsm.state.currentPlayerIndex;
    const gd = gravity.getGravity(idx).down;
    const worldUp: Vec3 = [-gd[0], -gd[1], -gd[2]];

    const camPos: Vec3 = [
      p.posX + up[0] * FPeyeHeight,
      p.posY + up[1] * FPeyeHeight,
      p.posZ + up[2] * FPeyeHeight,
    ];

    const vUp0 = aim[0] * worldUp[0] + aim[1] * worldUp[1] + aim[2] * worldUp[2];

    if (vUp0 <= 0) {
      const stubLen = 0.35 + charge * 0.45;
      const end: Vec3 = [
        start[0] + aim[0] * stubLen,
        start[1] + aim[1] * stubLen,
        start[2] + aim[2] * stubLen,
      ];
      return { points: [start, end], camPos };
    }

    const speed = chargedSpeed();
    const mag = gravity.magnitude * gravityScale;
    const pos: Vec3 = [start[0], start[1], start[2]];
    const vel: Vec3 = [aim[0] * speed, aim[1] * speed, aim[2] * speed];
    const pts: Vec3[] = [[pos[0], pos[1], pos[2]]];

    const stepDt = 0.04;
    const maxSteps = 220;
    const maxPoints = 25;

    for (let i = 0; i < maxSteps; i++) {
      vel[0] += gd[0] * mag * stepDt;
      vel[1] += gd[1] * mag * stepDt;
      vel[2] += gd[2] * mag * stepDt;
      pos[0] += vel[0] * stepDt;
      pos[1] += vel[1] * stepDt;
      pos[2] += vel[2] * stepDt;

      if (getSceneSDF(pos[0], pos[1], pos[2]) < bombRadius) {
        pts.push([pos[0], pos[1], pos[2]]);
        break;
      }

      pts.push([pos[0], pos[1], pos[2]]);

      const vUp = vel[0] * worldUp[0] + vel[1] * worldUp[1] + vel[2] * worldUp[2];
      if (vUp <= 0) break;
      if (pts.length >= maxPoints) break;
    }
    return { points: pts, camPos };
  }

  function detonate(g: Bomb) {
    const [x, y, z] = g.pos;
    map.destroySphere(x, y, z, explRadius);

    explode(x, y, z);
    
    gsm.applyExplosionDamage(
      x, y, z,
      explRadius, innerDamage,
      outerRadius, outerDamage,
      g.owner,
    );
    physics.applyExplosion(x, y, z, outerRadius, granadeKnockbackForce, gsm.state.players);
    gsm.notifyWeaponDetonated();
  }

  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (canCharge()) {
      charging = true;
      charge = 0;
      return;
    }
    if (canFireRocket()) {
      fireRocket();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    if (charging) throwBomb();
  });

  return {
    update(dt: number) {
      if (charging) {
        if (!bombSelectedAndAimed() || document.pointerLockElement !== canvas) {
          charging = false;
          charge = 0;
        } else {
          charge = Math.min(1, charge + dt / chargeTime);
          if (charge >= 1) throwBomb();
        }
      }

      for (let i = bombs.length - 1; i >= 0; i--) {
        const g = bombs[i];

        g.vel[0] += g.gd[0] * g.mag * gravityScale * dt;
        g.vel[1] += g.gd[1] * g.mag * gravityScale * dt;
        g.vel[2] += g.gd[2] * g.mag * gravityScale * dt;

        g.pos[0] += g.vel[0] * dt;
        g.pos[1] += g.vel[1] * dt;
        g.pos[2] += g.vel[2] * dt;

        for (let iter = 0; iter < 2; iter++) {
          const dist = getSceneSDF(g.pos[0], g.pos[1], g.pos[2]);
          if (dist < bombRadius) {
            const [nx, ny, nz] = sdfNormal(g.pos[0], g.pos[1], g.pos[2]);
            const pen = bombRadius - dist;
            g.pos[0] += nx * pen;
            g.pos[1] += ny * pen;
            g.pos[2] += nz * pen;

            const vn = g.vel[0] * nx + g.vel[1] * ny + g.vel[2] * nz;
            if (vn < 0) {
              g.vel[0] -= (1 + restitution) * vn * nx;
              g.vel[1] -= (1 + restitution) * vn * ny;
              g.vel[2] -= (1 + restitution) * vn * nz;
              g.vel[0] *= 0.92;
              g.vel[1] *= 0.92;
              g.vel[2] *= 0.92;
            }
          }
        }

        const sp = Math.hypot(g.vel[0], g.vel[1], g.vel[2]);
        if (sp > 1e-4) {
          let ax = -g.gd[1] * g.vel[2] - -g.gd[2] * g.vel[1];
          let ay = -g.gd[2] * g.vel[0] - -g.gd[0] * g.vel[2];
          let az = -g.gd[0] * g.vel[1] - -g.gd[1] * g.vel[0];
          let al = Math.hypot(ax, ay, az);
          if (al < 1e-5) { ax = 1; ay = 0; az = 0; al = 1; }
          ax /= al; ay /= al; az /= al;
          const ang = sp * rollRate * dt;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const axis: Vec3 = [ax, ay, az];
          g.c0 = rotateAboutAxis(g.c0, axis, c, s);
          g.c1 = rotateAboutAxis(g.c1, axis, c, s);
          g.c2 = rotateAboutAxis(g.c2, axis, c, s);
        }

        g.fuse -= dt;
        if (g.fuse <= 0) {
          detonate(g);
          bombs.splice(i, 1);
        }
      }

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

      if (bombSelectedAndAimed()) {
        const p = activePlayer();
        if (p && p.alive) {
          const fwd = camera.getForwardDir();
          const right = camera.getRightDir();
          const up = camera.getUpDir();
          instances.push({
            x: p.posX + up[0] * 0.18 + right[0] * 0.40 + fwd[0] * 0.70,
            y: p.posY + up[1] * 0.18 + right[1] * 0.40 + fwd[1] * 0.70,
            z: p.posZ + up[2] * 0.18 + right[2] * 0.40 + fwd[2] * 0.70,
            scale: heldScale,
          });
        }
      }

      for (const g of bombs) {
        instances.push({
          x: g.pos[0], y: g.pos[1], z: g.pos[2], scale: bombScale,
          c0: g.c0, c1: g.c1, c2: g.c2,
        });
      }


      const drawCount = Math.min(instances.length, MAXinstances);
      for (let i = 0; i < drawCount; i++) {
        const inst = instances[i];
        uniformPool[i].write({
          model: buildMat(inst.x, inst.y, inst.z, inst.scale, inst.c0, inst.c1, inst.c2),
        });

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
          .with(bindPool[i])
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
        showStrength: bombSelectedAndAimed(),
        charge,
      };
    },

    previewAscending,
  };
}
