import { d } from "typegpu";
import * as m from "wgpu-matrix";
import { arenaFloorY, arenaWallMax, arenaWallMin } from "./map";
import type { PlayerState} from "./gameState";

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export function createCamera(
    root: any, 
    canvas: HTMLCanvasElement
) {
  const viewMat = d.mat4x4f();
  const projMat = d.mat4x4f();

  m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    projMat
  );

  const cameraBuffer = root
    .createBuffer(Camera, { view: viewMat, projection: projMat })
    .$usage("uniform");

  let pos = m.vec3.create(0, 0, 0);
  let yaw = -Math.PI / 2;
  let pitch = 0;

  const activeKeys = new Set<string>();

  function updateViewMatrix() {
    const forward = m.vec3.create(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw)
    );
    
    const target = m.vec3.add(pos, forward);
    const up = m.vec3.create(0, 1, 0);

    m.mat4.lookAt(pos, target, up, viewMat);
    cameraBuffer.patch({ view: viewMat });
  }

  updateViewMatrix();

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });


window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    
    yaw += e.movementX * 0.002; 
    pitch += -e.movementY * 0.002;
    
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    
    updateViewMatrix();
  });

  window.addEventListener("keydown", (e) => activeKeys.add(e.code));
  window.addEventListener("keyup", (e) => activeKeys.delete(e.code));

  let lastTime = performance.now();

  function renderLoop(time: number) {
    const dt = (time - lastTime) * 0.001;
    lastTime = time;

    const speed = 15.0 * dt * (activeKeys.has("ShiftLeft") ? 2.5 : 1.0);
    
    const forward = m.vec3.create(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw)
    );
    
    const right = m.vec3.normalize(m.vec3.cross(forward, [0, 1, 0]));
    const upVec = [0, 1, 0];

    let moved = false;

    if (activeKeys.has("KeyW")) { m.vec3.addScaled(pos, forward, speed, pos); moved = true; }
    if (activeKeys.has("KeyS")) { m.vec3.addScaled(pos, forward, -speed, pos); moved = true; }
    if (activeKeys.has("KeyA")) { m.vec3.addScaled(pos, right, -speed, pos); moved = true; }
    if (activeKeys.has("KeyD")) { m.vec3.addScaled(pos, right, speed, pos); moved = true; }
    
    if (activeKeys.has("Space")) { m.vec3.addScaled(pos, upVec, speed, pos); moved = true; }
    if (activeKeys.has("ControlLeft")) { m.vec3.addScaled(pos, upVec, -speed, pos); moved = true; }

    if (moved) {
        updateViewMatrix();
    }

    requestAnimationFrame(renderLoop);
  }
  
  requestAnimationFrame(renderLoop);

  window.addEventListener("resize", () => {
    m.mat4.perspective(Math.PI / 4, canvas.clientWidth / canvas.clientHeight, 0.1, 1000, projMat);
    cameraBuffer.patch({ projection: projMat });
  });

  return cameraBuffer;
}

const playerHalf = 0.5;

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
) {
  const viewMat = d.mat4x4f();
  const projMat = d.mat4x4f();

  m.mat4.perspective(Math.PI / 3, canvas.clientWidth / canvas.clientHeight, 0.1, 500, projMat);

  const cameraBuffer = root
    .createBuffer(Camera, { view: viewMat, projection: projMat })
    .$usage("uniform");

  const tpc: ThirdPersonCamera = {
    targetPos: new Float32Array([0, arenaFloorY, 0]),
    yaw: 0,
    pitch: 0.25,
    distance: 4,
    height: 1.5,
  };

  let mode: "intro" | "third-person" = "intro";
  let introPos = new Float32Array([0, arenaFloorY, 0]);

  function clampEye(ex: number, ey: number, ez: number): [number, number, number] {
    const lo = arenaWallMin - playerHalf + 0.1;
    const hi = arenaWallMax + playerHalf - 0.1;
    ex = Math.max(lo, Math.min(hi, ex));
    ez = Math.max(lo, Math.min(hi, ez));
    return [ex, ey, ez];
  }

  function updateView() {
    if (mode === "intro") {
      const px = introPos[0], py = introPos[1], pz = introPos[2];
      const camX = px + Math.sin(0) * 4;
      const camZ = pz + Math.cos(0) * 4;
      const camY = py + 1.2;
      const [ex, ey, ez] = clampEye(camX, camY, camZ);
      m.mat4.lookAt(
        new Float32Array([ex, ey, ez]),
        new Float32Array([px, py + 0.5, pz]),
        new Float32Array([0, 1, 0]),
        viewMat
      );
    } else {
      const px = tpc.targetPos[0];
      const py = tpc.targetPos[1] + tpc.height;
      const pz = tpc.targetPos[2];

      const offsetX = -Math.sin(tpc.yaw) * Math.cos(tpc.pitch) * tpc.distance;
      const offsetY =  Math.sin(tpc.pitch) * tpc.distance;
      const offsetZ = -Math.cos(tpc.yaw) * Math.cos(tpc.pitch) * tpc.distance;

      const [ex, ey, ez] = clampEye(px + offsetX, py + offsetY, pz + offsetZ);
      m.mat4.lookAt(
        new Float32Array([ex, ey, ez]),
        new Float32Array([px, py, pz]),
        new Float32Array([0, 1, 0]),
        viewMat
      );
    }
    cameraBuffer.patch({ view: viewMat });
  }

  updateView();

  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    tpc.yaw   -= e.movementX * 0.003;
    tpc.pitch += e.movementY * 0.003;
    tpc.pitch  = Math.max(-0.4, Math.min(0.8, tpc.pitch));
    if (mode === "third-person") updateView();
  });

  // window.addEventListener("wheel", (e) => {
  //   tpc.distance += e.deltaY * 0.01;
  //   tpc.distance = Math.max(1.5, Math.min(12, tpc.distance));
  //   if (mode === "third-person") updateView();
  // }, { passive: true });

  // window.addEventListener("resize", () => {
  //   m.mat4.perspective(Math.PI / 3, canvas.clientWidth / canvas.clientHeight, 0.1, 500, projMat);
  //   cameraBuffer.patch({ projection: projMat });
  // });

  canvas.addEventListener("click", () => {
    if (getInventoryOpen()) {
      onCanvasClickWhileInventoryOpen();
      canvas.requestPointerLock();
    } else {
      canvas.requestPointerLock();
    }
  });

  return {
    cameraBuffer,
    updateView,
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
    updatePlayerPos(x: number, y: number, z: number) {
      tpc.targetPos[0] = x;
      tpc.targetPos[1] = y;
      tpc.targetPos[2] = z;
      if (mode === "third-person") updateView();
    },
    getYaw(): number {
      return tpc.yaw;
    },
    getForwardDir(): [number, number, number] {
      return [Math.sin(tpc.yaw), 0, Math.cos(tpc.yaw)];
    },
    getRightDir(): [number, number, number] {
      return [-Math.cos(tpc.yaw), 0, Math.sin(tpc.yaw)];
    },
  };
}