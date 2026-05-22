import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, createGameCamera } from "./camera";
import { vertexLayout, createCubeBuffer} from "./geometry";
import { cubeInstance, createMapController, arenaInnerSize } from "./map";
import { createSlimePipeline } from "./slimePipeline";
import { createBackground } from "./background";
import { createWeaponSystem } from "./weapons";
import { createConfetti } from "./confetti";
import { forEach } from "@loaders.gl/core";
import { GameStateMachine } from "./gameState";
import type { Weapon } from "./gameState";
import { GameUI } from "./ui/gameUI";
import { createMovementController, fallReset } from "./movement"
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { GravityController, lookDirFromYawPitch } from "./gravity";
import { hexToRgb } from "./colors";

interface Player{
  username: string
  characterIndex?: number;
  colorIndex?: number;
}

const wallGradientGrid = [
  "#0E1737", "#1F2543", "#252A44", "#2D2843", "#2E1F40", "#221533", "#1F112F",
  "#161F3C", "#1B2240", "#202642", "#292441", "#291A3A", "#241534", "#251434",
  "#192441", "#1A2341", "#1D2542", "#262240", "#291939", "#291737", "#2E1939",
  "#1D2B46", "#212F49", "#28354E", "#3D344D", "#452846", "#422342", "#3E1F3F",
  "#23314C", "#2F4056", "#3F4F60", "#5F4F61", "#664059", "#613753", "#4C2849",
  "#283B52", "#3B4F60", "#4F5E69", "#655B68", "#6A485E", "#75455C", "#6C3A54",
  "#2F455A", "#4E626D", "#626C71", "#6C626C", "#5F4B5F", "#7D5063", "#80455E",
];

export async function startGame(playerData: Player[]) {

  const root = await tgpu.init();

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gsm = new GameStateMachine(playerData);
  const gravity = GravityController(
    playerData.length,
    undefined,
    gsm.state.players.map((p) => p.gravityFaceIndex),
  );

  const gameCam = createGameCamera(
    root,
    canvas,
    () => gsm.state.inventoryOpen,
    () => gsm.closeInventory(),
    () => gsm.state.phase !== "winner",
  );

  const cameraBuffer = gameCam.cameraBuffer;
  const cubeBuffer = createCubeBuffer(root);
  const mapCtl = createMapController(root);
  const instanceBuffer = mapCtl.buffer;

  const wallGridBuffer = root
    .createBuffer(
      d.arrayOf(d.vec4f, 49),
      wallGradientGrid.map((hex) => {
        const [r, g, b] = hexToRgb(hex);
        return d.vec4f(r / 255, g / 255, b / 255, 1);
      }),
    )
    .$usage("storage");

  const cubeLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    instance: {storage: d.arrayOf(cubeInstance)},
    wallGrid: { storage: d.arrayOf(d.vec4f) },
  });

  const cubeBindGroup = root.createBindGroup(cubeLayout, {
    camera: cameraBuffer,
    instance: instanceBuffer,
    wallGrid: wallGridBuffer,
  });


  const gradMinXZ = -(arenaInnerSize / 2) + 0.5;
  const gradMaxXZ = (arenaInnerSize / 2) - 1.5;

  const cubeVertex = tgpu.vertexFn({
    in: {
      position: d.vec4f,
      faceNormal: d.vec3f,
      faceUv: d.vec2f,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: {
      pos: d.builtin.position,
      worldPos: d.vec3f,
      faceNormal: d.vec3f,
      faceUv: d.vec2f,
      edgeFlags: d.vec4f,
    },
  })((input) => {
    
    const inst = cubeLayout.$.instance[input.instanceIndex];
    const world = std.mul(inst.model, input.position);
    const pos = std.mul(
      cubeLayout.$.camera.projection,
      std.mul(cubeLayout.$.camera.view, world),
    );

    const absN =std.abs(input.faceNormal);
    const axisIdx = d.u32(absN.y + absN.z * d.f32(2));
    const signSum = input.faceNormal.x +input.faceNormal.y + input.faceNormal.z;
    const signOff = std.select(d.u32(0), d.u32(1), signSum < d.f32(0));
    const faceIdx = axisIdx * d.u32(2) + signOff;

    const offset = faceIdx* d.u32(4);
    const m = inst.outlineMask;
    const b0 = d.f32((m >> offset)&d.u32(1));
    const b1 = d.f32((m >> (offset+ d.u32(1))) & d.u32(1));
    const b2= d.f32((m >> (offset + d.u32(2))) & d.u32(1));
    const b3 = d.f32((m >> (offset + d.u32(3))) & d.u32(1));

    return {
      pos,
      worldPos: world.xyz,
      faceNormal: input.faceNormal,
      faceUv: input.faceUv,
      edgeFlags: d.vec4f(b0, b1, b2, b3),
    };
  });

  const outlineCoverage = tgpu.fn([d.vec2f, d.vec4f, d.vec2f], d.f32)(
    (uv, flags, g) => {
      const FAR = d.f32(1e9);
      const dU0 = std.select(FAR, uv.x,            flags.x > d.f32(0.5));
      const dU1 = std.select(FAR, d.f32(1)- uv.x, flags.y > d.f32(0.5));
      const dV0 = std.select(FAR, uv.y,            flags.z > d.f32(0.5));
      const dV1 = std.select(FAR, d.f32(1) - uv.y, flags.w > d.f32(0.5));
      const mU = std.min(dU0, dU1);
      const mV = std.min(dV0, dV1);
      const dManh = std.min(mU, mV);
      const dCorner = std.length(d.vec2f(mU, mV));
      const dEdge = std.min(dManh, dCorner * d.f32(0.7));

      const px = std.max(std.max(g.x, g.y), d.f32(1e-6));
      const width = std.min(d.f32(2) *px, d.f32(0.04));
      const aa = std.min(px, d.f32(0.03));
      return d.f32(1) - std.smoothstep(width, width + aa, dEdge);
    },
  );

  const cubeFragment = tgpu.fragmentFn({
    in: {
      worldPos: d.vec3f,
      faceNormal: d.vec3f,
      faceUv: d.vec2f,
      edgeFlags: d.vec4f,
    },
    out: d.vec4f,
  })((i) => {
    const span = d.f32(gradMaxXZ - gradMinXZ);
    const gx = std.clamp((i.worldPos.x - d.f32(gradMinXZ)) / span, d.f32(0), d.f32(1));
    const gz = std.clamp((i.worldPos.z - d.f32(gradMinXZ)) / span, d.f32(0), d.f32(1));

    const fx = gx * d.f32(6);
    const fz = gz * d.f32(6);
    const ix0 = d.u32(std.floor(fx));
    const iz0 = d.u32(std.floor(fz));
    const ix1 = std.min(ix0 + d.u32(1), d.u32(6));
    const iz1 = std.min(iz0 + d.u32(1), d.u32(6));
    const tx = std.fract(fx);
    const tz = std.fract(fz);

    const row0 = iz0 * d.u32(7);
    const row1 = iz1 * d.u32(7);
    const color = std.mix(
      std.mix(
        cubeLayout.$.wallGrid[row0 + ix0].xyz,
        cubeLayout.$.wallGrid[row0 + ix1].xyz,
        tx,
      ),
      std.mix(
        cubeLayout.$.wallGrid[row1 + ix0].xyz,
        cubeLayout.$.wallGrid[row1 + ix1].xyz,
        tx,
      ),
      tz,
    );

    const duvdx = std.dpdx(i.faceUv);
    const duvdy = std.dpdy(i.faceUv);
    const g = d.vec2f(
      std.max(std.length(d.vec2f(duvdx.x, duvdy.x)), d.f32(1e-7)),
      std.max(std.length(d.vec2f(duvdx.y, duvdy.y)), d.f32(1e-7)),
    );

    const t0 = std.add(i.faceUv, std.add(std.mul(duvdx, d.f32(-0.375)), std.mul(duvdy, d.f32(-0.125))));
    const t1 = std.add(i.faceUv, std.add(std.mul(duvdx, d.f32( 0.125)), std.mul(duvdy, d.f32(-0.375))));
    const t2 = std.add(i.faceUv, std.add(std.mul(duvdx, d.f32( 0.375)), std.mul(duvdy, d.f32( 0.125))));
    const t3 = std.add(i.faceUv, std.add(std.mul(duvdx, d.f32(-0.125)), std.mul(duvdy, d.f32( 0.375))));
    const cov = (
      outlineCoverage(t0, i.edgeFlags, g) +
      outlineCoverage(t1, i.edgeFlags, g) +
      outlineCoverage(t2, i.edgeFlags, g) +
      outlineCoverage(t3, i.edgeFlags, g)
    ) * d.f32(0.25);

    const lineColor = std.mul(color, d.f32(0.18));
    const finalColor = std.mix(color, lineColor, cov);

    return d.vec4f(finalColor, d.f32(1));
  });

  const cubePipeline = root.createRenderPipeline({
    attribs: vertexLayout.attrib,
    vertex: cubeVertex,
    fragment: cubeFragment,
    targets: { format: presentationFormat },
    primitive: { cullMode: "back" },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

  const background = createBackground(root, cameraBuffer, presentationFormat);

  function makeTextures() {
    return {
      depth: root.createTexture({ 
        size: [canvas.width, canvas.height],
        format: "depth24plus",
        sampleCount: 4
      }).$usage("render"),

      msaa: root.createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat,
        sampleCount: 4
      }).$usage("render"),
    };
  }
  let { depth: depthTexture, msaa: msaaTexture } = makeTextures();

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
    depthTexture.destroy(); 
    msaaTexture.destroy();
    ({ depth: depthTexture, msaa: msaaTexture } = makeTextures());
  });

  console.log("Player: ", playerData);

  playerData.forEach((player, i)=> (
    console.log("Player " + (i+1) +  " name: " + player.username)
  ))

  const physics = createMovementController(gameCam, gsm.state.players, gravity);

    window.addEventListener("keydown", (e) => {
    if (e.code === "KeyG") {
      const activeIdx = gsm.state.currentPlayerIndex;
      const lookDir = gameCam.getForwardDir();
      const changed = gravity.trySwap(activeIdx, lookDir);
      
      if (changed) {
        console.log(`Gravity swapped for player ${activeIdx}: ${changed.label}`);
        gameCam.setGravityDown(changed.down); 
      }
    }
  });

  const uiRoot = document.createElement("div");
  uiRoot.id = "gameUIMount";
  uiRoot.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:10";
  document.body.appendChild(uiRoot);

  const reactRoot = createRoot(uiRoot);
  const slime = await createSlimePipeline(root, cameraBuffer, presentationFormat, gsm.state.players, gravity);
  const weapons = await createWeaponSystem(root, cameraBuffer, presentationFormat, {
    gsm,
    camera: gameCam,
    gravity,
    map: mapCtl,
    canvas,
    physics,
  });

  const confetti = createConfetti(root, canvas, presentationFormat);

  const crosshairEl = document.getElementById("lockedCoursor")!;
  const strengthFillEl = document.getElementById("strengthFill") as HTMLDivElement;

  const slimeVisuals = playerData.map(() => ({
    currentGd: m.vec3.create(0, -1, 0),
    currentFwd: m.vec3.create(0, 0, -1),
    initialized: false,
  }));

  function renderUI() {
    if (
      (gsm.state.phase === "deathScreen" || gsm.state.phase === "winner") &&
      document.pointerLockElement === canvas
    ) {
      document.exitPointerLock();
    }

    reactRoot.render(
      createElement(GameUI, {
        gameState: gsm.state,
        onSkipIntro: () => gsm.skipIntro(),
        onSelectWeapon: (w: Weapon) => {
          gsm.selectWeapon(w);
          canvas.requestPointerLock();
        },
        onToggleInventory: () => {
          const willOpen = !gsm.state.inventoryOpen;
          gsm.toggleInventory();
          if (willOpen) document.exitPointerLock();
          else canvas.requestPointerLock();
        },
        onDismissDeathScreen: () => gsm.dismissDeathScreen(),
        onBackToMenu: () => {
          const replay = gsm.state.players.map((p) => ({
            username: p.username,
            colorIndex: p.colorIndex,
          }));
          sessionStorage.setItem("replayPlayers", JSON.stringify(replay));
          window.location.reload();
        },
      })
    );
  }

  gsm.onStateChanged = renderUI;
  gsm.onCameraIntro = (player) => gameCam.setIntroTarget(player);
  gsm.onCameraThirdPerson = (player) => {
    gameCam.setThirdPersonTarget(player);
    gameCam.setGravityDown(gravity.getGravity(player.index).down, true);
    canvas.requestPointerLock();
  };
  gsm.onWinner = (player) => {
    if(player) gameCam.setWinnerTarget(player, gravity.getGravity(player.index).down);
    confetti.start(player ? player.color : null);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };

  renderUI();
  gsm.start();

  let lastTime = performance.now();
  const tempProjectionVec = m.vec3.create();

  function drawCubes() {
    background.draw(msaaTexture, depthTexture, context);

    cubePipeline
      .withColorAttachment({
        view: msaaTexture,
        resolveTarget: context,
        loadOp: "load",
      })
      .withDepthStencilAttachment({
        view: depthTexture,
        depthClearValue: 1,
        depthLoadOp: "load",
        depthStoreOp: "store",
      })
      .with(vertexLayout, cubeBuffer)
      .with(cubeBindGroup)
      .draw(36, mapCtl.count);
  }


  function frame() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) * 0.001, 0.1);
    lastTime = now;

    const state = gsm.state;

    const canMove = state.phase === "playing" && document.pointerLockElement === canvas;
    
    gameCam.tick(dt);

    if (state.phase === "winner") {
      crosshairEl.classList.remove("crosshair");
      strengthFillEl.style.height = "0%";
      confetti.update(dt);
      drawCubes();
      slime.drawOpaque(msaaTexture, depthTexture, context, -1);
      slime.drawAlpha(msaaTexture, depthTexture, context, -1, gameCam.getEyePos());
      confetti.draw(msaaTexture, depthTexture, context);
      requestAnimationFrame(frame);
      return;
    }

    const newPositions = physics.update(
      dt,
      state.players,
      state.currentPlayerIndex,
      canMove
    );

     for (let i = 0; i < state.players.length; i++) {
      const [nx, ny, nz] = newPositions[i];
      const p = state.players[i];
      
      if (!p.alive) {
        slime.updatePlayerPos(p.index, 0, -9999, 0, [0, 0, -1], [0, -1, 0]);
        continue;
      }

      if ((ny < -fallReset || ny > fallReset) || (nx < -fallReset || nx > fallReset) || (nz < -fallReset || nz > fallReset)) {
        gsm.killPlayer(p.index, "void");
        slime.updatePlayerPos(p.index, 0, -9999, 0, [0, 0, -1], [0, -1, 0]);
        continue;
      }

      const isActive = p.index === state.currentPlayerIndex;

      if(isActive){
        p.yaw = gameCam.getYaw();
        gameCam.updatePlayerPos(nx, ny, nz);
      }

      if(nx !== p.posX || ny !== p.posY || nz !== p.posZ){
        gsm.updatePlayerPosition(p.index, nx, ny, nz);
      }

      const targetGd = gravity.getGravity(p.index).down;
      
      const targetFwd = isActive ? gameCam.getForwardDir() : (() => { const s = Math.sin(p.yaw), c = Math.cos(p.yaw); return m.vec3.create(-s, 0, -c); })();

      const visual = slimeVisuals[i];
      if(!visual.initialized){
        m.vec3.copy(targetGd, visual.currentGd);
        m.vec3.copy(targetFwd, visual.currentFwd);
        visual.initialized = true;
      }else{
        const gdBlendFactor = 1 - Math.exp(-6.0 * dt); 
        m.vec3.lerp(visual.currentGd, targetGd, gdBlendFactor, visual.currentGd);
        m.vec3.normalize(visual.currentGd, visual.currentGd);

        const dot = m.vec3.dot(targetFwd, visual.currentGd);
        m.vec3.scale(visual.currentGd, dot, tempProjectionVec);
        m.vec3.subtract(targetFwd, tempProjectionVec, visual.currentFwd);
        
        if(m.vec3.lengthSq(visual.currentFwd) < 0.001){
          if(Math.abs(visual.currentGd[1]) > 0.9){
            visual.currentFwd = m.vec3.create(0, 0, -1);
          }else{
            visual.currentFwd = m.vec3.create(0, 1, 0);
          }
        }else{
          m.vec3.normalize(visual.currentFwd, visual.currentFwd);
        }
      }

      const gd = visual.currentGd;
      const fwd = visual.currentFwd;

      slime.updatePlayerPos( p.index, nx, ny, nz, [fwd[0], fwd[1], fwd[2]] as [number, number, number], [gd[0], gd[1], gd[2]] as [number, number, number]);
    }

    if (state.phase === "playing") {
      gameCam.setWeaponAim(!!state.selectedWeapon && !state.inventoryOpen);
    }

    weapons.update(dt);

    const ws = weapons.getUIState();
    crosshairEl.classList.toggle("crosshair", ws.weaponSelected);
    strengthFillEl.style.height = ws.weaponSelected ? `${Math.max(0, Math.min(1, ws.charge)) * 100}%` : "0%";

    const skipIndex = gameCam.getMode() === "first-person" ? state.currentPlayerIndex : -1;

    drawCubes();
    slime.drawOpaque(msaaTexture, depthTexture, context, skipIndex);
    weapons.draw(msaaTexture, depthTexture, context);
    slime.drawAlpha(msaaTexture, depthTexture, context, skipIndex, gameCam.getEyePos());

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  //checkPosition(0);
}
