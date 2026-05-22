import { d } from "typegpu";
import * as m from "wgpu-matrix";
import { arenaFloorY } from "./map";
import type { PlayerState } from "./gameState";
import { getSceneSDF } from "./movement"; 

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
  invViewProj: d.mat4x4f,
});

export const FPeyeHeight = 0.45;

interface ThirdPersonCamera {
  targetPos: Float32Array;
  yaw: number;
  pitch: number;
  distance: number;
  height: number;
}


export function createGameCamera(
  root: any,
  canvas: HTMLCanvasElement,
  getInventoryOpen: () => boolean,
  onCanvasClickWhileInventoryOpen: () => void,
  getAllowPointerLock: () => boolean = () => true,
) {
  const viewMat = d.mat4x4f();
  const projMat = d.mat4x4f();

  m.mat4.perspective(Math.PI / 3, canvas.clientWidth / canvas.clientHeight, 0.1, 500, projMat);

  const invViewProjMat = m.mat4.identity(d.mat4x4f());
  const viewProjMat = d.mat4x4f();

  const cameraBuffer = root
    .createBuffer(Camera, { view: viewMat, projection: projMat, invViewProj: invViewProjMat })
    .$usage("uniform");

  function patchCamera() {
    m.mat4.mul(projMat, viewMat, viewProjMat);
    m.mat4.inverse(viewProjMat, invViewProjMat);
    cameraBuffer.patch({ view: viewMat, projection: projMat, invViewProj: invViewProjMat });
  }

  const tpc: ThirdPersonCamera = {
    targetPos: new Float32Array([0, arenaFloorY, 0]),
    yaw: 0,
    pitch: 0.25,
    distance: 4,
    height: 1,
  };

  let mode: "intro" | "third-person" | "first-person" | "winner" | "pat" = "intro";
  let introPos = new Float32Array([0, arenaFloorY, 0]);
  let eyePos = new Float32Array([0, arenaFloorY, 0]);

  let patFwd = m.vec3.create(0, 0, -1);
  const patDistance = 2.7;
  const patCamHeight = 0.5;
  const patLookHeight=0.2;

  const winnerTarget = new Float32Array([0, arenaFloorY, 0]);
  const winnerUp = new Float32Array([0, 1, 0]);
  let winnerAngle = 0;
  const winnerRadius = 5;
  const winnerHeight = 2.2;
  const winnerSpeed = 0.6;

  let baseRight = m.vec3.create(1, 0, 0);
  let baseUp = m.vec3.create(0, 1, 0);
  let baseFwd = m.vec3.create(0, 0, 1);

  interface BasisTransition {
    active: boolean;
    fromUp: m.Vec3;
    fromFwd: m.Vec3;
    fromRight: m.Vec3;
    toFwd: m.Vec3;
    toRight: m.Vec3;
    axis: m.Vec3;
    totalAngle: number;
    elapsed: number;
    duration: number;
  }

  let transition: BasisTransition = {
    active: false,
    fromUp: m.vec3.create(0, 1, 0),
    fromFwd: m.vec3.create(0, 0, 1),
    fromRight: m.vec3.create(1, 0, 0),
    toFwd: m.vec3.create(0, 0, 1),
    toRight: m.vec3.create(1, 0, 0),
    axis: m.vec3.create(0, 0, 1),
    totalAngle: 0,
    elapsed: 0, 
    duration: 0.5,
  };

  function rotateVector(v: m.Vec3, u: m.Vec3, cosT: number, sinT: number): m.Vec3 {
    const cross = m.vec3.cross(u, v);
    const dot = m.vec3.dot(u, v);
    return m.vec3.create(
      v[0] * cosT + cross[0] * sinT + u[0] * dot * (1 - cosT),
      v[1] * cosT + cross[1] * sinT + u[1] * dot * (1 - cosT),
      v[2] * cosT + cross[2] * sinT + u[2] * dot * (1 - cosT)
    );
  }

  function tickTransition(dt: number) {
    if (!transition.active) return;
    
    transition.elapsed += dt;
    const raw = transition.elapsed / transition.duration;
    const t = raw < 1 ? raw * raw * (3 - 2 * raw) : 1;
    
    const currentAngle = transition.totalAngle * t;
    const cosT = Math.cos(currentAngle);
    const sinT = Math.sin(currentAngle);

    baseUp = rotateVector(transition.fromUp, transition.axis, cosT, sinT);
    baseFwd = rotateVector(transition.fromFwd, transition.axis, cosT, sinT);
    baseRight = rotateVector(transition.fromRight, transition.axis, cosT, sinT);

    if (raw >= 1) {
      transition.active = false;
    }

    if (mode !== "intro") updateView();
  }

  function camOffsetDir(): m.Vec3 {
    const dirX = Math.sin(tpc.yaw) * Math.cos(tpc.pitch);
    const dirY = Math.sin(tpc.pitch);
    const dirZ = Math.cos(tpc.yaw) * Math.cos(tpc.pitch);
    return m.vec3.create(
      dirX * baseRight[0] + dirY * baseUp[0] + dirZ * baseFwd[0],
      dirX * baseRight[1] + dirY * baseUp[1] + dirZ * baseFwd[1],
      dirX * baseRight[2] + dirY * baseUp[2] + dirZ * baseFwd[2],
    );
  }

  function updateView() {
    if(mode === "first-person"){
      const g = camOffsetDir();
      const ex = tpc.targetPos[0] + baseUp[0] * FPeyeHeight;
      const ey = tpc.targetPos[1] + baseUp[1] * FPeyeHeight;
      const ez = tpc.targetPos[2] + baseUp[2] * FPeyeHeight;
      m.mat4.lookAt([ex, ey, ez], [ex - g[0], ey - g[1], ez - g[2]], baseUp, viewMat);
      eyePos[0] = ex;
      eyePos[1] = ey;
      eyePos[2] = ez;

      patchCamera();
    }else if(mode === "third-person"){
      const targetLookAt: [number, number, number] = [
        tpc.targetPos[0] + baseUp[0] * tpc.height, 
        tpc.targetPos[1] + baseUp[1] * tpc.height, 
        tpc.targetPos[2] + baseUp[2] * tpc.height
      ];

      const dirX = Math.sin(tpc.yaw) * Math.cos(tpc.pitch);
      const dirY = Math.sin(tpc.pitch);
      const dirZ = Math.cos(tpc.yaw) * Math.cos(tpc.pitch);

      const gx = dirX * baseRight[0] + dirY * baseUp[0] + dirZ * baseFwd[0];
      const gy = dirX * baseRight[1] + dirY * baseUp[1] + dirZ * baseFwd[1];
      const gz = dirX * baseRight[2] + dirY * baseUp[2] + dirZ * baseFwd[2];

      let actualDistance = tpc.distance;
      const cameraRadius = 0.4;

      const steps = 8; 
      for (let i = 1; i <= steps; i++) {
        const checkDist = (i / steps) * tpc.distance;
        const px = targetLookAt[0] + gx * checkDist;
        const py = targetLookAt[1] + gy * checkDist;
        const pz = targetLookAt[2] + gz * checkDist;

        const distToWall = getSceneSDF(px, py, pz);
        
        if (distToWall < cameraRadius) {
          actualDistance = Math.max(0.5, checkDist - (cameraRadius - distToWall));
          break; 
        }
      }

      const camX = targetLookAt[0] + gx * actualDistance;
      const camY = targetLookAt[1] + gy * actualDistance;
      const camZ = targetLookAt[2] + gz * actualDistance;

      m.mat4.lookAt([camX, camY, camZ], targetLookAt, baseUp, viewMat);
      eyePos[0] = camX;
      eyePos[1]= camY;
      eyePos[2] =camZ;
      patchCamera();

    } else if(mode === "winner"){
      const up = winnerUp;
      let ref = m.vec3.create(0, 0, 1);
      
      if (Math.abs(up[0] * ref[0] + up[1] * ref[1]+up[2] * ref[2]) > 0.99) {
        ref = m.vec3.create(1, 0, 0);
      }
      const orbitX = m.vec3.normalize(m.vec3.cross(up, ref));
      const orbitZ = m.vec3.cross(orbitX, up);

      const c = Math.cos(winnerAngle);
      const s= Math.sin(winnerAngle);

      const cx = winnerTarget[0] +up[0] * winnerHeight + (c * orbitX[0] + s * orbitZ[0]) * winnerRadius;
      const cy = winnerTarget[1] + up[1] * winnerHeight + (c * orbitX[1] +s * orbitZ[1]) * winnerRadius;
      const cz = winnerTarget[2] + up[2] * winnerHeight + (c * orbitX[2] + s * orbitZ[2]) * winnerRadius;

      m.mat4.lookAt(
        [cx, cy, cz],
        [
          winnerTarget[0] + up[0] * 0.6,
          winnerTarget[1] + up[1] * 0.6,
          winnerTarget[2] + up[2] * 0.6,
        ],
        up,
        viewMat,
      );
      eyePos[0] = cx;
      eyePos[1] = cy;
      eyePos[2]= cz;
      patchCamera();
    } else if (mode === "intro") {
      m.mat4.lookAt(introPos, [0, arenaFloorY, 0], [0, 1, 0], viewMat);
      eyePos[0] =introPos[0];
      eyePos[1] = introPos[1];
      eyePos[2] = introPos[2];

      patchCamera();
    }else if(mode === "pat"){
      const up = baseUp;
      const cx = tpc.targetPos[0] + patFwd[0] * patDistance + up[0] * patCamHeight;
      const cy = tpc.targetPos[1] + patFwd[1] * patDistance + up[1] * patCamHeight;
      const cz = tpc.targetPos[2] + patFwd[2] * patDistance + up[2] * patCamHeight;

      m.mat4.lookAt(
        [cx, cy, cz],
        [
          tpc.targetPos[0] + up[0] * patLookHeight,
          tpc.targetPos[1] + up[1] * patLookHeight,
          tpc.targetPos[2] + up[2] * patLookHeight,
        ],
        up,
        viewMat,
      );


      eyePos[0] = cx;
      eyePos[1] = cy;
      eyePos[2] = cz;
      patchCamera();
    }
  }

  updateView();

 window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (mode === "pat") return;
    tpc.yaw   -= e.movementX * 0.003;
    tpc.pitch += e.movementY * 0.003;
    tpc.pitch  = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, tpc.pitch));
    if (mode !== "intro") updateView();
  });

  window.addEventListener("wheel", (e) => {
    tpc.distance += e.deltaY * 0.01;
    tpc.distance = Math.max(1.5, Math.min(12, tpc.distance));
    if (mode !== "intro") updateView();
  }, { passive: true });

  window.addEventListener("resize", () => {
    m.mat4.perspective(Math.PI / 3, canvas.clientWidth/canvas.clientHeight, 0.1, 500, projMat);
    patchCamera();
  });

  canvas.addEventListener("click", () => {
    if (getInventoryOpen()) {
      onCanvasClickWhileInventoryOpen();
      if (getAllowPointerLock()) canvas.requestPointerLock();
    } else if (getAllowPointerLock()) {
      canvas.requestPointerLock();
    }
  });

  return {
    cameraBuffer,
    updateView,

    setGravityDown(down: m.Vec3 | number[], immediate = false) {
        const newUp = m.vec3.create(-down[0], -down[1], -down[2]);

        if (immediate) {
          const oldUp = m.vec3.create(baseUp[0], baseUp[1], baseUp[2]);
          const axis = m.vec3.cross(oldUp, newUp);
          const sine = m.vec3.length(axis);
          const cosine = m.vec3.dot(oldUp, newUp);

          let u = m.vec3.create(0, 0, 0);
          let cosT = cosine;
          let sinT = sine;

          if (sine < 0.001) {
            if (cosine > 0) {
              baseUp = newUp;
              transition.active = false;
              if (mode !== "intro") updateView();
              return;
            } else {
              u = m.vec3.create(baseRight[0], baseRight[1], baseRight[2]);
              cosT = -1; sinT = 0;
            }
          } else {
            u = m.vec3.create(axis[0] / sine, axis[1] / sine, axis[2] / sine);
          }

          baseUp    = newUp;
          baseFwd   = rotateVector(baseFwd, u, cosT, sinT);
          baseRight = rotateVector(baseRight, u, cosT, sinT);
          transition.active = false;
          if (mode !== "intro") updateView();
          return;
        }

        transition.fromUp = m.vec3.create(baseUp[0], baseUp[1], baseUp[2]);
        transition.fromFwd = m.vec3.create(baseFwd[0], baseFwd[1], baseFwd[2]);
        transition.fromRight = m.vec3.create(baseRight[0], baseRight[1], baseRight[2]);

        const axis = m.vec3.cross(transition.fromUp, newUp);
        const sine = m.vec3.length(axis);
        const cosine = m.vec3.dot(transition.fromUp, newUp);

        if (sine < 0.001) {
          if (cosine > 0) {
            transition.totalAngle = 0;
            transition.axis = m.vec3.create(0, 1, 0);
          } else {
            transition.axis = m.vec3.create(baseRight[0], baseRight[1], baseRight[2]);
            transition.totalAngle = Math.PI;
          }
        } else {
          transition.axis = m.vec3.create(axis[0] / sine, axis[1] / sine, axis[2] / sine);
          transition.totalAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
        }

        transition.elapsed  = 0;
        transition.active   = true;

        const cosEnd = Math.cos(transition.totalAngle);
        const sinEnd= Math.sin(transition.totalAngle);
        transition.toFwd = rotateVector(transition.fromFwd, transition.axis, cosEnd, sinEnd);
        transition.toRight =rotateVector(transition.fromRight, transition.axis, cosEnd, sinEnd);
    },

    setIntroTarget(player: PlayerState) {
      introPos[0] = player.posX;
      introPos[1] = player.posY;
      introPos[2] = player.posZ;
      mode = "intro";
      updateView();
    },
    setThirdPersonTarget(player: PlayerState) {
      tpc.targetPos[0] = player.posX;
      tpc.targetPos[1] = player.posY;
      tpc.targetPos[2] = player.posZ;
      mode = "third-person";
      updateView();
    },
    setPatTarget(player: PlayerState) {
      tpc.targetPos[0] = player.posX;
      tpc.targetPos[1] = player.posY;
      tpc.targetPos[2] = player.posZ;

      const dirX= Math.sin(tpc.yaw);
      const dirZ = Math.cos(tpc.yaw);
      const gx = dirX * baseRight[0] + dirZ * baseFwd[0];
      const gy = dirX * baseRight[1] + dirZ * baseFwd[1];
      const gz = dirX * baseRight[2] + dirZ*baseFwd[2];
      patFwd = m.vec3.create(-gx, -gy, -gz);

      mode = "pat";
      updateView();
    },

    projectToScreen(x: number, y: number, z: number): [number, number] | null {
      const e = viewProjMat;
      const w = e[3] * x+ e[7] * y + e[11] * z + e[15];
      if (w <= 1e-6) return null;
      const cx = e[0]*x + e[4]*y + e[8]*z + e[12];
      const cy = e[1]*x + e[5]*y + e[9]*z + e[13];

      return [
        ((cx / w) * 0.5 + 0.5) * canvas.clientWidth,
        (1 - ((cy / w) * 0.5 + 0.5)) * canvas.clientHeight,
      ];
    },
    updatePlayerPos(x: number, y: number, z: number) {
      tpc.targetPos[0] = x;
      tpc.targetPos[1] = y;
      tpc.targetPos[2] = z;
      if (mode !== "intro") updateView();
    },
    getYaw(): number {
      return tpc.yaw;
    },
    getPitch(): number {
      return tpc.pitch;
    },
    setWinnerTarget(player: PlayerState, gravityDown?: m.Vec3 | number[]) {
      winnerTarget[0] = player.posX;
      winnerTarget[1] = player.posY;
      winnerTarget[2] = player.posZ;
      if (gravityDown) {
        winnerUp[0] = -gravityDown[0];
        winnerUp[1] = -gravityDown[1];
        winnerUp[2] = -gravityDown[2];
      } else {
        winnerUp[0] = 0;
        winnerUp[1] = 1;
        winnerUp[2] = 0;
      }
      winnerAngle = 0;
      mode = "winner";
      updateView();
    },
    tick(dt: number) {
      tickTransition(dt);
      if (mode === "winner") {
        winnerAngle += dt * winnerSpeed;
        updateView();
      }
    },
    isTransitioning(): boolean {
      return transition.active;
    },
    getForwardDir(): m.Vec3 {
      if(mode === "pat") return m.vec3.create(patFwd[0], patFwd[1], patFwd[2]);
      const dirX = Math.sin(tpc.yaw);
      const dirZ = Math.cos(tpc.yaw);
      const gx = dirX * baseRight[0] + dirZ * baseFwd[0];
      const gy = dirX * baseRight[1] + dirZ * baseFwd[1];
      const gz = dirX * baseRight[2] + dirZ * baseFwd[2];
      return m.vec3.create(-gx, -gy, -gz);
    },

    getSettledForwardDir(): m.Vec3 {
      const fwd = transition.active ? transition.toFwd : baseFwd;
      const rgt = transition.active ? transition.toRight : baseRight;
      const dirX = Math.sin(tpc.yaw);
      const dirZ = Math.cos(tpc.yaw);
      const gx = dirX * rgt[0] + dirZ * fwd[0];
      const gy = dirX * rgt[1] + dirZ * fwd[1];
      const gz = dirX * rgt[2] + dirZ * fwd[2];
      
      return m.vec3.create(-gx, -gy, -gz);
    },
    getRightDir(): m.Vec3 {
      const f = this.getForwardDir();
      const r = m.vec3.cross(f, baseUp);
      m.vec3.normalize(r, r);

      return m.vec3.create(r[0], r[1], r[2]);
    },

    getAimDir(): m.Vec3 {
      const g = camOffsetDir();
      return m.vec3.normalize(m.vec3.create(-g[0], -g[1], -g[2]));
    },

    getUpDir(): m.Vec3 {
      return m.vec3.create(baseUp[0], baseUp[1], baseUp[2]);
    },

    getMode() {
      return mode;
    },

    getEyePos(): [number, number, number] {
      return [eyePos[0], eyePos[1], eyePos[2]];
    },

    getViewRight(): [number, number, number] {
      return [viewMat[0], viewMat[4], viewMat[8]];
    },

    getViewUp(): [number, number, number]{
      return [viewMat[1], viewMat[5], viewMat[9]];
    },

    setWeaponAim(on: boolean) {
      if (mode !== "third-person" && mode !== "first-person") return;
      const target = on ? "first-person" : "third-person";
      if (mode !== target) {
        mode = target;
        updateView();
      }
    },
  };
}