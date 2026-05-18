import tgpu, { d, std, common } from "typegpu";
import * as m from "wgpu-matrix";
import { Camera, createGameCamera } from "./camera";
import { vertexLayout, createCubeBuffer} from "./geometry";
import { checkPosition, cubeInstance, cubeCount, createPlateBuffer} from "./map";
import { createSlimePipeline } from "./slimePipeline";
import { forEach } from "@loaders.gl/core";
import { GameStateMachine } from "./gameState";
import type { Weapon } from "./gameState";
import { GameUI } from "./ui/gameUI";
import { createMovementController } from "./movement"
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { GravityController, lookDirFromYawPitch } from "./gravity";

interface Player{
  username: string
  characterIndex?: number;
}

export async function startGame(playerData: Player[]) {

  const root = await tgpu.init();

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gsm = new GameStateMachine(playerData);
  const gravity = GravityController(playerData.length);

  const gameCam = createGameCamera(
    root,
    canvas,
    () => gsm.state.inventoryOpen,
    () => gsm.closeInventory(),
  );

  const cameraBuffer = gameCam.cameraBuffer;
  const cubeBuffer = createCubeBuffer(root);
  const instanceBuffer = createPlateBuffer(root);

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
  const slime = await createSlimePipeline(root, cameraBuffer, presentationFormat, gsm.state.players);

  function renderUI() {
    reactRoot.render(
      createElement(GameUI, {
        gameState: gsm.state,
        onSkipIntro: () => gsm.skipIntro(),
        onSelectWeapon: (w: Weapon) => gsm.selectWeapon(w),
        onToggleInventory: () => {
          const willOpen = !gsm.state.inventoryOpen;
          gsm.toggleInventory();
          if (willOpen) document.exitPointerLock();
          else canvas.requestPointerLock();
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

  renderUI();
  gsm.start();

  let lastTime = performance.now();

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
      .draw(36, cubeCount);
  }


  function frame() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) * 0.001, 0.1);
    lastTime = now;

    const state = gsm.state;

    const canMove = state.phase === "playing" && document.pointerLockElement === canvas;
    
    gameCam.tick(dt);

    const newPositions = physics.update(
      dt,
      state.players,
      state.currentPlayerIndex,
      canMove
    );

     for (let i = 0; i < state.players.length; i++) {
      const [nx, ny, nz] = newPositions[i];
      const p = state.players[i];

      const isActive = p.index === state.currentPlayerIndex;
      const currentYaw = isActive ? gameCam.getYaw() : p.yaw;

      const positionChanged = nx !== p.posX || ny !== p.posY || nz !== p.posZ;
      const yawChanged = currentYaw !== p.yaw;

      if (positionChanged || yawChanged) {
        if (positionChanged) {
          gsm.updatePlayerPosition(p.index, nx, ny, nz);
        }

        p.yaw = currentYaw;

        slime.updatePlayerPos(p.index, nx, ny - 0.1, nz, p.yaw);

        if (isActive) {
          gameCam.updatePlayerPos(nx, ny, nz);
        }
      }
      
    }

    drawCubes();
    slime.draw(msaaTexture, depthTexture, context);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  //checkPosition(0);

  //physics.applyExplosion(cx, cy, cz, radius, force, gsm.state.players)
  (window as any).__physics = physics;
  (window as any).__gsm = gsm;
}