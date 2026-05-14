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

export function getSceneSDF(px: number, py: number, pz: number): number { 
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
  const s1 = getSceneSDF(px+ eps, py- eps, pz- eps);
  const s2 = getSceneSDF(px- eps, py- eps, pz+ eps);
  const s3 = getSceneSDF(px-eps, py+ eps, pz- eps);
  const s4 = getSceneSDF(px+ eps, py+ eps, pz+ eps);

  const nx= (s1- s2- s3 + s4);
  const ny= (-s1- s2+ s3 + s4);
  const nz= (-s1+ s2- s3 + s4);

  const len=Math.sqrt(nx * nx + ny * ny + nz * nz);
  if(len===0) return [0, 1, 0];
  
  return [nx / len,ny / len,nz / len];
}

interface PhysicsBody {
  velX: number;
  velY: number;
  velZ: number;
  isOnGround: boolean;
}

const gravity = -25;
const jumpVel = 10;
const moveAcc = 50;
const friction = 12;
const playerRadius = 0.4;
const fallResetY = -50;
const fallResetSpawnY = 5;


export interface PhysicsController {
  update(
    dt: number,
    players: PlayerState[],
    activePlayerIndex: number,
    canMove: boolean
  ): Array<[number, number, number]>;

  applyExplosion(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    force: number,
    players: PlayerState[]
  ): void;

    setVelocity(playerIndex: number, vx: number, vy: number, vz: number): void;
    getVelocity(playerIndex: number): [number, number, number];
}



export function createMovementController(
    camera: ReturnType<typeof createGameCamera>,
    initialPlayers: PlayerState[]
): PhysicsController {
  const activeKeys = new Set<string>();
  window.addEventListener("keydown", (e) => activeKeys.add(e.code));
  window.addEventListener("keyup", (e) => activeKeys.delete(e.code));

  const bodies: PhysicsBody[] = initialPlayers.map(() => ({
    velX: 0, velY: 0, velZ: 0, isOnGround: false,
  }));

  function stepBody(
    body: PhysicsBody,
    px: number, py: number, pz: number,
    dt: number,
    inputDx: number, inputDz: number,
    wantsJump: boolean
  ): [number, number, number] {
    body.velX += inputDx * moveAcc * dt;
    body.velZ += inputDz * moveAcc * dt;

    const frictionMult = Math.exp(-friction * dt);
    body.velX *= frictionMult;
    body.velZ *= frictionMult;


    body.velY += gravity * dt;

    px += body.velX * dt;
    py += body.velY * dt;
    pz += body.velZ * dt;

    body.isOnGround = false;
    for (let iter = 0; iter < 2; iter++) {
      const dist = getSceneSDF(px, py, pz);
      if (dist < playerRadius) {
        const [nx, ny, nz] = getSDFNormal(px, py, pz);
        const penetration = playerRadius - dist;

        px += nx * penetration;
        py += ny * penetration;
        pz += nz * penetration;

        const dot = body.velX * nx + body.velY * ny + body.velZ * nz;
        if (dot < 0) {
          body.velX -= dot * nx;
          body.velY -= dot * ny;
          body.velZ -= dot * nz;
        }

        if (ny > 0.7) {
          body.isOnGround = true;
          body.velY = Math.max(body.velY, 0);
        }
      }
    }

    if (wantsJump && body.isOnGround) {
      body.velY = jumpVel;
    }

    if (py < fallResetY) {
      py = fallResetSpawnY;
      body.velY = 0;
      body.velX = 0;
      body.velZ = 0;
    }

    return [px, py, pz];
  }

return {
    update(dt, players, activePlayerIndex, canMove) {
      while (bodies.length < players.length) {
        bodies.push({ velX: 0, velY: 0, velZ: 0, isOnGround: false });
      }

      const fwd = camera.getForwardDir();
      const rgt = camera.getRightDir();

      let inputDx = 0, inputDz = 0;
      let wantsJump = false;

      if (canMove) {
        if (activeKeys.has("KeyW")) { inputDx += fwd[0]; inputDz += fwd[2]; }
        if (activeKeys.has("KeyS")) { inputDx -= fwd[0]; inputDz -= fwd[2]; }
        if (activeKeys.has("KeyA")) { inputDx -= rgt[0]; inputDz -= rgt[2]; }
        if (activeKeys.has("KeyD")) { inputDx += rgt[0]; inputDz += rgt[2]; }

        const len = Math.sqrt(inputDx * inputDx + inputDz * inputDz);
        if (len > 0) { inputDx /= len; inputDz /= len; }

        wantsJump = activeKeys.has("Space");
      }

      const results: Array<[number, number, number]> = [];

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!p.alive) {
          results.push([p.posX, p.posY, p.posZ]);
          continue;
        }

        const isActive = i === activePlayerIndex;
        results.push(stepBody(
          bodies[i],
          p.posX, p.posY, p.posZ,
          dt,
          isActive ? inputDx  : 0,
          isActive ? inputDz  : 0,
          isActive ? wantsJump : false
        ));
      }

      const minDist = playerRadius * 2;
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < players.length; i++) {
          if (!players[i].alive) continue;
          for (let j = i + 1; j < players.length; j++) {
            if (!players[j].alive) continue;

            const p1 = results[i];
            const p2 = results[j];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const dz = p2[2] - p1[2];
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < minDist * minDist && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const nx = dx / dist;
              const ny = dy / dist;
              const nz = dz / dist;
              const penetration = (minDist - dist) * 0.5;

              p1[0] -= nx * penetration;
              p1[1] -= ny * penetration;
              p1[2] -= nz * penetration;
              p2[0] += nx * penetration;
              p2[1] += ny * penetration;
              p2[2] += nz * penetration;

              const b1 = bodies[i];
              const b2 = bodies[j];
              const relVelX = b2.velX - b1.velX;
              const relVelY = b2.velY - b1.velY;
              const relVelZ = b2.velZ - b1.velZ;
              const sepVel = relVelX * nx + relVelY * ny + relVelZ * nz;

              if (sepVel < 0) {
                const restitution = 0.6;
                const impulse = -sepVel * (1 + restitution) * 0.5;
                b1.velX -= nx * impulse;
                b1.velY -= ny * impulse;
                b1.velZ -= nz * impulse;
                b2.velX += nx * impulse;
                b2.velY += ny * impulse;
                b2.velZ += nz * impulse;
              }
            }
          }
        }
      }

      for (let i = 0; i < results.length; i++) {
        if (!players[i].alive) continue;
        const p = results[i];
        const dist = getSceneSDF(p[0], p[1], p[2]);
        if (dist < playerRadius) {
          const [nx, ny, nz] = getSDFNormal(p[0], p[1], p[2]);
          const penetration = playerRadius - dist;
          p[0] += nx * penetration;
          p[1] += ny * penetration;
          p[2] += nz * penetration;
        }
      }

      return results;
    },

    applyExplosion(cx, cy, cz, radius, force, players) {
      while (bodies.length < players.length) {
        bodies.push({ velX: 0, velY: 0, velZ: 0, isOnGround: false });
      }

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!p.alive) continue;

        const dx = p.posX - cx;
        const dy = p.posY - cy;
        const dz = p.posZ - cz;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist   = Math.sqrt(distSq);

        if (dist > radius) continue;

        const falloff  = 1 - dist / radius;
        const impulse  = force * falloff;

        if (dist < 0.001) {
          bodies[i].velY += impulse;
        } else {
          bodies[i].velX += (dx / dist) * impulse;
          bodies[i].velY += (dy / dist) * impulse;
          bodies[i].velZ += (dz / dist) * impulse;
        }

        bodies[i].isOnGround = false;
      }
    },

    setVelocity(playerIndex, vx, vy, vz) {
      if (!bodies[playerIndex]) return;
      bodies[playerIndex].velX = vx;
      bodies[playerIndex].velY = vy;
      bodies[playerIndex].velZ = vz;
    },

    getVelocity(playerIndex) {
      const b = bodies[playerIndex];
      if (!b) return [0, 0, 0];
      return [b.velX, b.velY, b.velZ];
    },
  };
}
