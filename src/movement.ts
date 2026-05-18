import { arenaInnerSize, arenaLayers, isSolidBlock } from "./map";
import { createGameCamera } from "./camera";
import type { PlayerState } from "./gameState";
import type { GravityController } from "./gravity";
import * as m from "wgpu-matrix";
import { abs } from "typegpu/std";

function sdBox(p: number[] | m.Vec3, b: number[]): number {
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

function getSDFNormal(px: number, py: number, pz: number): m.Vec3 {
  const eps = 0.01;
  const s1 = getSceneSDF(px+ eps, py- eps, pz- eps);
  const s2 = getSceneSDF(px- eps, py- eps, pz+ eps);
  const s3 = getSceneSDF(px-eps, py+ eps, pz- eps);
  const s4 = getSceneSDF(px+ eps, py+ eps, pz+ eps);

  const nx= (s1- s2- s3 + s4);
  const ny= (-s1- s2+ s3 + s4);
  const nz= (-s1+ s2- s3 + s4);

  const len=Math.sqrt(nx * nx + ny * ny + nz * nz);
  if(len===0) return m.vec3.create(0, 1, 0);
  
  return m.vec3.create(nx / len, ny / len, nz / len);
}

interface PhysicsBody {
  velX: number;
  velY: number;
  velZ: number;
  isOnGround: boolean;
}

const jumpVel = 10;
const moveAcc = 60;
const friction = 10;
const playerRadius = 0.4;
const fallReset = (arenaInnerSize + arenaLayers-1 * 2)*4;
const fallResetSpawn = 0;


export interface PhysicsController {
  update(
    dt: number,
    players: PlayerState[],
    activePlayerIndex: number,
    canMove: boolean
  ): Array<m.Vec3>;

  applyExplosion(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    force: number,
    players: PlayerState[]
  ): void;

    setVelocity(playerIndex: number, vx: number, vy: number, vz: number): void;
    getVelocity(playerIndex: number): m.Vec3;
}



export function createMovementController(
    camera: ReturnType<typeof createGameCamera>,
    initialPlayers: PlayerState[],
    gravityController: GravityController
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
    inputX: number, inputY: number, inputZ: number,
    gravDown: m.Vec3,
    gravMag: number
  ): m.Vec3 {
    body.velX += inputX * moveAcc * dt;
    body.velY += inputY * moveAcc * dt;
    body.velZ += inputZ * moveAcc * dt;

    const frictionMult = Math.exp(-friction * dt);
    const velDotDown = body.velX * gravDown[0] + body.velY * gravDown[1] + body.velZ * gravDown[2];

    const latX = body.velX - velDotDown * gravDown[0];
    const latY = body.velY - velDotDown * gravDown[1];
    const latZ = body.velZ - velDotDown * gravDown[2];
    body.velX = latX * frictionMult + velDotDown * gravDown[0];
    body.velY = latY * frictionMult + velDotDown * gravDown[1];
    body.velZ = latZ * frictionMult + velDotDown * gravDown[2];

    body.velX += gravDown[0] * gravMag * dt;
    body.velY += gravDown[1] * gravMag * dt;
    body.velZ += gravDown[2] * gravMag * dt;

    px += body.velX * dt;
    py += body.velY * dt;
    pz += body.velZ * dt;

    const upX = -gravDown[0];
    const upY = -gravDown[1];
    const upZ = -gravDown[2];

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

        const normalUpDot = nx * upX + ny * upY + nz * upZ;
        if (normalUpDot > 0.7){
          body.isOnGround = true;
          const velDownComp = body.velX * gravDown[0] + body.velY * gravDown[1] + body.velZ * gravDown[2];
          if (velDownComp > 0) {
            body.velX -= velDownComp * gravDown[0];
            body.velY -= velDownComp * gravDown[1];
            body.velZ -= velDownComp * gravDown[2];
          }
        }
      }
    }

    if ((py < -fallReset || py > fallReset) || (px < -fallReset || px > fallReset) || (pz < -fallReset || pz > fallReset)) {
      py = fallResetSpawn;
      px = fallResetSpawn;
      pz = fallResetSpawn;
      body.velY = 0;
      body.velX = 0;
      body.velZ = 0;
    }

    return m.vec3.create(px, py, pz);
  }

return {
    update(dt, players, activePlayerIndex, canMove) {
      while (bodies.length < players.length) {
        bodies.push({ velX: 0, velY: 0, velZ: 0, isOnGround: false });
      }

      const fwd = camera.getForwardDir();
      const rgt = camera.getRightDir();

      let inputX = 0, inputY = 0, inputZ = 0;
      let wantsJump = false;

      if (canMove) {
        let rawX = 0, rawY = 0, rawZ = 0;
        
        if (activeKeys.has("KeyW")) { rawX += fwd[0]; rawY += fwd[1]; rawZ += fwd[2]; }
        if (activeKeys.has("KeyS")) { rawX -= fwd[0]; rawY -= fwd[1]; rawZ -= fwd[2]; }
        if (activeKeys.has("KeyA")) { rawX -= rgt[0]; rawY -= rgt[1]; rawZ -= rgt[2]; }
        if (activeKeys.has("KeyD")) { rawX += rgt[0]; rawY += rgt[1]; rawZ += rgt[2]; }

        const len = Math.sqrt(rawX*rawX + rawY*rawY + rawZ*rawZ);
        if (len > 0) { rawX /= len; rawY /= len; rawZ /= len; }

        inputX = rawX;
        inputY = rawY;
        inputZ = rawZ;
        wantsJump = activeKeys.has("Space");
      }

      const results: Array<m.Vec3> = [];

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!p.alive) {
          results.push(m.vec3.create(p.posX, p.posY, p.posZ));
          continue;
        }

        const isActive = i === activePlayerIndex;
        const grav = gravityController.getGravity(i);
        results.push(stepBody(
          bodies[i],
          p.posX, p.posY, p.posZ,
          dt,
          isActive ? inputX : 0,
          isActive ? inputY : 0,
          isActive ? inputZ : 0,
          grav.down,
          gravityController.magnitude
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
              
              const grav1 = gravityController.getGravity(i);
              const grav2 = gravityController.getGravity(j);
              
              if(nx * -grav2.down[0] + ny * -grav2.down[1] + nz * -grav2.down[2] > 0.5){
                  b2.isOnGround = true;
              }else if(nx * grav1.down[0] + ny * grav1.down[1] + nz * grav1.down[2] > 0.5){
                  b1.isOnGround = true;
              }

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
          
          const grav = gravityController.getGravity(i);
          const dot = nx * -grav.down[0] + ny * -grav.down[1] + nz * -grav.down[2];
          
          if (dot > 0.7) {
              bodies[i].isOnGround = true;
          }
        }
      }
    

      if (canMove && wantsJump && bodies[activePlayerIndex]?.isOnGround) {
          const grav = gravityController.getGravity(activePlayerIndex);
          const b = bodies[activePlayerIndex];
          const velAlongUp = -(b.velX * grav.down[0] + b.velY * grav.down[1] + b.velZ * grav.down[2]);
          
          if (velAlongUp < jumpVel * 0.5) {
            const velDotDown = b.velX * grav.down[0] + b.velY * grav.down[1] + b.velZ * grav.down[2];
            b.velX -= velDotDown * grav.down[0];
            b.velY -= velDotDown * grav.down[1];
            b.velZ -= velDotDown * grav.down[2];
            b.velX -= grav.down[0] * jumpVel;
            b.velY -= grav.down[1] * jumpVel;
            b.velZ -= grav.down[2] * jumpVel;
            b.isOnGround = false;
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
      if (!b) return m.vec3.create(0, 0, 0);
      return m.vec3.create(b.velX, b.velY, b.velZ);
    },
  };
}
