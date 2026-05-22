import type { GameStateMachine } from "./gameState";
import type { createGameCamera } from "./camera";

const patDur = 5;
const finishDelay = 0.7;

interface PatDeps {
  gsm: GameStateMachine;
  camera: ReturnType<typeof createGameCamera>;
}

export function createPatSystem({ gsm, camera }: PatDeps) {
  let active = false;
  let finishing = false;
  let timeLeft = 0;
  let finishTimer = 0;

  const overlay = document.createElement("div");
  overlay.id = "patOverlay";

  const hud = document.createElement("div");
  hud.id = "patHud";
  const timeEl = document.createElement("div");
  timeEl.id = "patTime";
  const hintEl = document.createElement("div");
  hintEl.id = "patHint";
  hintEl.textContent = "SPAM LEFT-CLICK";
  hud.append(timeEl, hintEl);

  overlay.append(hud);
  document.body.appendChild(overlay);

  function activePlayer() {
    return gsm.state.players[gsm.state.currentPlayerIndex];
  }

  function updateOverlay() {
    timeEl.textContent = Math.max(0, timeLeft).toFixed(1);
  }

  return {
    start() {
      if (active || finishing) return;
      if (!gsm.beginPatSession()) return;
      active = true;
      finishing = false;
      timeLeft = patDur;
      finishTimer = 0;
      camera.setPatTarget(activePlayer());
      overlay.classList.add("on");
      updateOverlay();
    },

    isActive() {
      return active || finishing;
    },

    update(dt: number) {
      if (!active && !finishing) {
        overlay.classList.remove("on");
        return;
      }

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

      updateOverlay();
    },
  };
}
