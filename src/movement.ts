import { isSolidBlock } from "./map";
import { createGameCamera } from "./camera";
import type { PlayerState } from "./gameState";

function sdBox(p: number[], b: number[]): number {

  const dx = Math.abs(p[0]) - b[0];
  const dy = Math.abs(p[1]) - b[1];
  const dz = Math.abs(p[2]) - b[2];

  const outX = Math.max(dx, 0);
  const outY = Math.max(dy, 0);
  const outZ = Math.max(dz, 0);

  const outDist = Math.sqrt(outX * outX + outY * outY + outZ * outZ);
  const inDist = Math.min(Math.max(dx, dy, dz), 0);

  return outDist + inDist;
}

function getSceneSDF(px: number, py: number, pz: number): number { 
  let minDist = Infinity;
  const cx = Math.round(px);
  const cy = Math.round(py);
  const cz = Math.round(pz);

  for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bx = cx + ox;
          const by = cy + oy;
          const bz = cz + oz;

          if (isSolidBlock(bx, by, bz)){
              const localX = px - bx;
              const localY = py - by;
              const localZ = pz - bz;

            
              const dist = sdBox([localX, localY, localZ], [0.5, 0.5, 0.5]);
              minDist = Math.min(minDist, dist);
          }
        }
      }
  }
  return minDist;
}

function getSDFNormal(px: number, py: number, pz: number): [number, number, number] {
  const eps = 0.01;
  const s1 =getSceneSDF(px+ eps, py- eps, pz- eps);
  const s2= getSceneSDF(px- eps, py- eps, pz+ eps);
  const s3 =getSceneSDF(px-eps, py+ eps, pz- eps);
  const s4 = getSceneSDF(px+ eps, py+ eps, pz+ eps);

  const nx= (s1- s2- s3 + s4);
  const ny= (-s1- s2+ s3 + s4);
  const nz= (-s1+ s2- s3 + s4);

  const len=Math.sqrt(nx * nx + ny * ny + nz * nz);
  if(len===0) return [0, 1, 0];
  return [nx / len,ny / len,nz / len];
}

export function createMovementController(camera: ReturnType<typeof createGameCamera>) {
  const activeKeys = new Set<string>();
  window.addEventListener("keydown", (e) => activeKeys.add(e.code));
  window.addEventListener("keyup", (e) => activeKeys.delete(e.code));

  return {
    update(dt: number, player: PlayerState, canMove: boolean): [number, number, number] {
      let{ posX, posY, posZ } =player;
      if(!canMove) return [posX, posY, posZ];
      
      return [posX, posY, posZ];
    }
  };
}
