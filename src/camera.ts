import { d } from "typegpu";
import * as m from "wgpu-matrix";
import { arenaFloorY, arenaWallMax, arenaWallMin } from "./map";
import type { PlayerState} from "./gameState";
import { getSceneSDF } from "./movement"; 

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

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

  function updateView() {
    if (mode === "third-person") {
      const targetLookAt: [number, number, number] = [
        tpc.targetPos[0], 
        tpc.targetPos[1] + tpc.height, 
        tpc.targetPos[2]
      ];

      const dirX = Math.sin(tpc.yaw) * Math.cos(tpc.pitch);
      const dirY = Math.sin(tpc.pitch);
      const dirZ = Math.cos(tpc.yaw) * Math.cos(tpc.pitch);

      let actualDistance = tpc.distance;
      const cameraRadius = 0.4;

      const steps = 8; 
      for (let i = 1; i <= steps; i++) {
        const checkDist = (i / steps) * tpc.distance;
        const px = targetLookAt[0] + dirX * checkDist;
        const py = targetLookAt[1] + dirY * checkDist;
        const pz = targetLookAt[2] + dirZ * checkDist;

        const distToWall = getSceneSDF(px, py, pz);
        
        if (distToWall < cameraRadius) {
          actualDistance = Math.max(0.5, checkDist - (cameraRadius - distToWall));
          break; 
        }
      }

      const camX = targetLookAt[0] + dirX * actualDistance;
      const camY = targetLookAt[1] + dirY * actualDistance;
      const camZ = targetLookAt[2] + dirZ * actualDistance;

      m.mat4.lookAt([camX, camY, camZ], targetLookAt, [0, 1, 0], viewMat);
      cameraBuffer.patch({ view: viewMat });
      
    } else if (mode === "intro") {
      m.mat4.lookAt(introPos, [0, arenaFloorY, 0], [0, 1, 0], viewMat);
      cameraBuffer.patch({ view: viewMat });
    }
  }

  updateView();

 window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    tpc.yaw   -= e.movementX * 0.003;
    tpc.pitch += e.movementY * 0.003;
    tpc.pitch  = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, tpc.pitch));
    if (mode === "third-person") updateView();
  });

  window.addEventListener("wheel", (e) => {
    tpc.distance += e.deltaY * 0.01;
    tpc.distance = Math.max(1.5, Math.min(12, tpc.distance));
    if (mode === "third-person") updateView();
  }, { passive: true });

  window.addEventListener("resize", () => {
    m.mat4.perspective(Math.PI / 3, canvas.clientWidth / canvas.clientHeight, 0.1, 500, projMat);
    cameraBuffer.patch({ projection: projMat });
  });

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
      return [-Math.sin(tpc.yaw), 0, -Math.cos(tpc.yaw)];
    },
    getRightDir(): [number, number, number] {
      return [Math.cos(tpc.yaw), 0, -Math.sin(tpc.yaw)];
    },
  };
}