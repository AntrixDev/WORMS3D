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
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const target = d.vec3f(0, 0, 0);
  const up = d.vec3f(0, 1, 0);

  const viewMat = d.mat4x4f();
  const projMat = d.mat4x4f();

  const cameraInitialPos = d.vec4f(12, 5, 12, 1);

  m.mat4.lookAt(cameraInitialPos, target, up, viewMat);
  m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, projMat);

  const cameraBuffer = root
    .createBuffer(Camera, { view: viewMat, projection: projMat })
    .$usage("uniform");

  let isDragging = false;
  let prevX = 0;
  let prevY = 0;

  let Radius = Math.sqrt(
    cameraInitialPos.x * cameraInitialPos.x +
    cameraInitialPos.y * cameraInitialPos.y +
    cameraInitialPos.z * cameraInitialPos.z
  );

  let Yaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
  let Pitch = Math.asin(cameraInitialPos.y / Radius);

  function updateCameraPosition() {
    const x = Radius * Math.sin(Yaw) * Math.cos(Pitch);
    const y = Radius * Math.sin(Pitch);
    const z = Radius * Math.cos(Yaw) * Math.cos(Pitch);

    m.mat4.lookAt(d.vec4f(x, y, z, 1), target, up, viewMat);
    
    cameraBuffer.patch({ view: viewMat });
  }

  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
  });

  window.addEventListener("mouseup", () => { isDragging = false; });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    Yaw += -dx * 0.005;
    Pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, Pitch + dy * 0.005));
    updateCameraPosition();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    Radius = Math.max(1, Radius + e.deltaY * 0.05);
    updateCameraPosition();
  }, { passive: false });

  window.addEventListener("resize", () => {
    const newAspect = canvas.clientWidth / canvas.clientHeight;
    m.mat4.perspective(Math.PI / 4, newAspect, 0.1, 1000, projMat);
    cameraBuffer.patch({ projection: projMat });
  });

  return cameraBuffer;
}