import type { GameStateMachine } from "./gameState";
import type { createGameCamera } from "./camera";

const patDur = 5;
const patCycle = 0.4;
const handFrames = 5;
const handLinger = 0.5;
const handFade = 0.18;
const finishDelay = 0.7;
const path = "/assets/handFrame.png";

interface PatDeps {
  gsm: GameStateMachine;
  camera: ReturnType<typeof createGameCamera>;
  canvas: HTMLCanvasElement;
}

export function createPatSystem({ gsm, camera, canvas }: PatDeps) {
  let active = false;
  let finishing = false;
  let timeLeft = 0;
  let finishTimer = 0;
  let clicks = 0;
  let patPhase= 0;
  let handTimer = 0;
  let topX = 0;
  let topY = 0;

  const overlay = document.createElement("div");
  overlay.id = "patOverlay";

  const hand = document.createElement("div");
  hand.id = "patHand";

  const hud = document.createElement("div");
  hud.id = "patHud";
  const timeEl = document.createElement("div");
  timeEl.id = "patTime";
  const countEl = document.createElement("div");
  countEl.id = "patCount";
  const hintEl = document.createElement("div");
  hintEl.id = "patHint";
  hintEl.textContent = "SPAM LEFT-CLICK";
  hud.append(timeEl, countEl, hintEl);

  overlay.append(hand, hud);
  document.body.appendChild(overlay);

  function activePlayer() {
    return gsm.state.players[gsm.state.currentPlayerIndex];
  }

  function registerClick() {
    if(!active) return;

    clicks += 1;
    gsm.applyPatHeal(1);
    if (handTimer <= 0.02) patPhase = 0;
    handTimer = handLinger;
  }

  window.addEventListener("mousedown", (e) => {
    if(e.button !== 0) return;
    if(!active) return;
    if(document.pointerLockElement !== canvas) return;
    registerClick();
  });

  function updateOverlay(cyc: number, handAlpha: number) {
    timeEl.textContent = Math.max(0, timeLeft).toFixed(1);
    countEl.textContent = `${clicks} ${clicks === 1 ? "PAT" : "PATS"}`;

    const p = activePlayer();
    const up = camera.getUpDir();
    
    const top = camera.projectToScreen(
      p.posX + up[0]*0.85,
      p.posY + up[1]*0.85,
      p.posZ + up[2]*0.85,
    );

    const foot = camera.projectToScreen(
      p.posX - up[0]*0.4,
      p.posY - up[1]*0.4,
      p.posZ - up[2]*0.4,
    );

    if (top && foot) {
      const slimePx = Math.max(40, Math.abs(foot[1] - top[1]));
      const handW = slimePx * 1.05;

      topX = top[0];
      topY = top[1];

      const frame = Math.min(handFrames - 1, Math.floor(cyc * handFrames));
      hand.style.backgroundPositionX = `${(frame / (handFrames - 1)) * 100}%`;
      hand.style.width = `${handW}px`;
      hand.style.height = `${handW}px`;
      hand.style.left = `${topX - handW / 2}px`;
      hand.style.top = `${topY - handW * 0.18}px`;
    }

    hand.style.opacity = `${handAlpha}`;
  }

  return {
    start() {
      if (active || finishing) return;
      if (!gsm.beginPatSession()) return;
      active = true;
      finishing = false;
      timeLeft = patDur;
      finishTimer = 0;
      clicks=0;
      patPhase = 0;
      handTimer = 0;
      camera.setPatTarget(activePlayer());
      overlay.classList.add("on");
      updateOverlay(0, 0);
    },

    isActive() {
      return active || finishing;
    },

    update(dt: number) {
      if (!active && !finishing) {
        overlay.classList.remove("on");
        return;
      }

      patPhase += dt;
      if(handTimer > 0) handTimer -= dt;

      const handAlpha = Math.max(0, Math.min(1, handTimer/handFade));
      const cyc = (patPhase / patCycle) % 1;

      if (active) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          active = false;
          finishing = true;
          finishTimer = finishDelay;
        }
      } else if (finishing) {
        finishTimer -= dt;
        if (finishTimer <= 0) {
          finishing = false;
          overlay.classList.remove("on");
          gsm.endPatSession();
          return;
        }
      }

      updateOverlay(cyc, handAlpha);
    },
  };
}
