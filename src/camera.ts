import { d } from "typegpu";
import * as m from "wgpu-matrix";

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

  let pos = m.vec3.create(0, 0, 52);
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