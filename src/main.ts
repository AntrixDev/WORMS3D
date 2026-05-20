import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, createGameCamera } from "./camera";
import { vertexLayout, createCubeBuffer} from "./geometry";
import { cubeInstance, createMapController } from "./map";
import { createSlimePipeline } from "./slimePipeline";
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

interface Player{
  username: string
  characterIndex?: number;
  colorIndex?: number;
}

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

  const cubeLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    instance: {storage: d.arrayOf(cubeInstance)},
  });

  const cubeBindGroup = root.createBindGroup(cubeLayout, {
    camera: cameraBuffer,
    instance: instanceBuffer
  });

  const cubeVertex = tgpu.vertexFn({
    in: { position: d.vec4f, color: d.vec4f, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, color: d.vec4f },
  })((input) => {

    const pos = std.mul(
      cubeLayout.$.camera.projection,
      std.mul(
        cubeLayout.$.camera.view,
        std.mul(cubeLayout.$.instance[input.instanceIndex].model, input.position)
      )
    );
    return { pos, color: input.color };
  });

  const cubePipeline = root.createRenderPipeline({
    attribs: vertexLayout.attrib,
    vertex: cubeVertex,
    fragment: tgpu.fragmentFn({ 
      in: { color: d.vec4f }, 
      out: d.vec4f 
    })((i) => i.color),
    targets: { format: presentationFormat },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    multisample: { count: 4 },
  });

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
    if (player) gameCam.setWinnerTarget(player);
    confetti.start(player ? player.color : null);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };

  renderUI();
  gsm.start();

  let lastTime = performance.now();
  const tempProjectionVec = m.vec3.create();

  function drawCubes() {
    cubePipeline
      .withColorAttachment({
        view: msaaTexture,
        resolveTarget: context,
        loadOp: "clear",
        clearValue: [0.1, 0.1, 0.15, 1],
      })
      .withDepthStencilAttachment({
        view: depthTexture,
        depthClearValue: 1,
        depthLoadOp: "clear",
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
      slime.draw(msaaTexture, depthTexture, context);
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
    slime.draw(msaaTexture, depthTexture, context, skipIndex);
    weapons.draw(msaaTexture, depthTexture, context);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  //checkPosition(0);

  //physics.applyExplosion(cx, cy, cz, radius, force, gsm.state.players)
  (window as any).__physics = physics;
  (window as any).__gsm = gsm;
}
