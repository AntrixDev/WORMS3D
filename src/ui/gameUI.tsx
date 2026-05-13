import { useEffect } from "react";
import type { GameState, PlayerState, Weapon } from "../gameState";
import "./gameUI.css"
import { turnDuration } from "../gameState"

const primaryColor= "#f77298";

function IntroOverlay({ player, timeLeft, onSkip }: { player: PlayerState; timeLeft: number; onSkip: () => void }) {
  useEffect(() => {
    const handler = () => onSkip();
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [onSkip]);

  return (
    <div className="intro-overlay">
      <div className="intro-card" style={{ borderColor: primaryColor}}>
        <div className="intro-center-text">
          <div className="intro-username" style={{ color: primaryColor}}>{player.username}</div>
          <div className="intro-catchphrase">PREPARE FOR THE SUGAR RUSH</div>
        </div>
        <div className="intro-countdown">
          <div className="intro-num" style={{ color: primaryColor}}>{timeLeft <= 0 ? "GO!" : timeLeft}</div>
          <div className="intro-hint">click to skip</div>
        </div>
      </div>
    </div>
  );
}

function TurnUI({ player, turnTimeLeft }: { player: PlayerState; turnTimeLeft: number }) {
  const hpPct = player.hp;
  const hpColor = hpPct <= 0 ? "#ff0000" : hpPct < 30 ? "#ff9100" : primaryColor;
  const timerColor = turnTimeLeft <= 15 ? "#ff0000" : primaryColor;
  const circleR = 30; 
  const circleC = 2 * Math.PI * circleR;

  return (
    <div className="turn">
      <div className="timer-box">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={circleR} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={circleR} fill="none" stroke={timerColor} strokeWidth="6"
            strokeDasharray={circleC} strokeDashoffset={circleC * (1 - turnTimeLeft / turnDuration)}
            strokeLinecap="round" transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
          />
          <text x="40" y="49" textAnchor="middle" fill={timerColor} fontSize="26" fontWeight="900">{turnTimeLeft}</text>
        </svg>
      </div>
      <div className="player-info">
        <div className="username" style={{ color: 'black'}}>{player.username}</div>
        <div className="hp-row">
          <div className="hp-track">
            <div className="hp-fill" style={{ width: `${hpPct}%`, backgroundColor: hpColor, transition: "width 0.5s, background-color 0.5s" }} />
          </div>
          <span className="hp-value">{hpPct}</span>
        </div>
      </div>
    </div>
  );
}

export function GameUI({ gameState, onSkipIntro, onToggleInventory }: { gameState: GameState; onSkipIntro: () => void; onSelectWeapon: (weapon: Weapon) => void; onToggleInventory: () => void }) {
  const { phase, players, currentPlayerIndex, turnTimeLeft, introTimeLeft} = gameState;
  const currentPlayer = players[currentPlayerIndex];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.code === "KeyQ" && phase === "playing") onToggleInventory(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, onToggleInventory]);

  return (
    <div className="container">
      {phase === "intro" && <IntroOverlay player={currentPlayer} timeLeft={introTimeLeft} onSkip={onSkipIntro} />}
      {phase === "playing" && (
        <>
          <TurnUI player={currentPlayer} turnTimeLeft={turnTimeLeft} />
        </>
      )}
    </div>
  );
}