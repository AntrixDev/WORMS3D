import tgpu, { d, std } from "typegpu";

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
});

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
        const k = light.intensity * atten * ndotl;
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
