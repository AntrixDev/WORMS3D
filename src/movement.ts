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
