import tgpu, { d, std } from "typegpu";
import { occupancyGridMin, occupancyGridDim } from "./map";

export const MAX_EXPLOSION_LIGHTS = 4;

export const ExplosionLight = d.struct({
  pos: d.vec3f,
  radius: d.f32,
  color: d.vec3f,
  intensity: d.f32,
});

export const ExplosionLights = d.struct({
  count: d.u32,
  lights: d.arrayOf(ExplosionLight, MAX_EXPLOSION_LIGHTS),
});

export const lightingLayout = tgpu.bindGroupLayout({
  explosionLights: { uniform: ExplosionLights },
  occupancy: { storage: d.arrayOf(d.u32) },
});

const gridOffset = -occupancyGridMin;
const gridDim = occupancyGridDim;

const castShadowRay = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.f32)(
  (origin, normal, lightPos) => {
    const start = std.add(origin, std.mul(normal, d.f32(0.5)));
    const toLight = std.sub(lightPos, start);
    const dist = std.length(toLight);
    const dir = std.mul(toLight, d.f32(1) / std.max(dist, d.f32(0.001)));

    let lit = d.f32(1);

    for(let i = 0; i < 96; i++){
      const t= (d.f32(i) + d.f32(1)) * d.f32(0.5);

      if (t > dist - d.f32(0.6)) {
        break;
      }

      const p = std.add(start, std.mul(dir, t));
      const cell = std.floor(std.add(p, d.vec3f(0.5)));
      const cx = d.i32(cell.x) + gridOffset;
      const cy = d.i32(cell.y) + gridOffset;
      const cz = d.i32(cell.z) + gridOffset;

      if (cx >= 0 && cx < gridDim && cy >= 0 && cy < gridDim && cz >= 0 && cz < gridDim) {
        const idx = d.u32((cz * gridDim + cy)* gridDim + cx);
        if (lightingLayout.$.occupancy[idx] > d.u32(0)) {
          lit = d.f32(0);
          break;
        }
      }
    }
    return lit;
  },
);

export const shadeWithExplosions = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)(
  (albedo, worldPos, normal) => {
    let lit = d.vec3f(albedo);

    for (let i = 0; i < MAX_EXPLOSION_LIGHTS; i++) {
      if (d.u32(i) >= lightingLayout.$.explosionLights.count) {
        break;
      }
      
      const light = lightingLayout.$.explosionLights.lights[i];
      const toLight = std.sub(light.pos, worldPos);
      const dist = std.length(toLight);

      if (dist < light.radius) {
        const dir = std.mul(toLight, d.f32(1) / std.max(dist, d.f32(0.001)));
        const ndotl = std.max(std.dot(normal, dir), d.f32(0));
        const f = d.f32(1) - dist / light.radius;
        const atten = f * f;
        const shadow = castShadowRay(worldPos, normal, light.pos);
        const k = light.intensity * atten * ndotl * shadow;
        const tint = d.vec3f(
          albedo.x * light.color.x,
          albedo.y*light.color.y,
          albedo.z * light.color.z,
        );
        lit = std.add(lit, std.mul(tint, k));
      }
    }
    return lit;
  },
);
