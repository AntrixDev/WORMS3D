import { useEffect, useState } from "react";
import type { GameState, PlayerState, Weapon, KillLogEntry } from "../gameState";
import "./gameUI.css"
import { turnDuration } from "../gameState"

const primaryColor= "#f77298";

const causeLabel: Record<string, string> = {
  void: "fell into the void",
  weapon: "was eliminated",
  unknown: "died",
};

const causeIcon: Record<string, string> = {
  void: ".𖥔 ݁ ˖🕳️ִ༄˖°",
  weapon: "ᡕᠵデᡁ᠊╾━",
  unknown: "¯\_(ツ)_/¯",
};

function IntroOverlay({ player, timeLeft, onSkip }: { player: PlayerState; timeLeft: number; onSkip: () => void }) {
  useEffect(() => {
    const handler = () => onSkip();
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [onSkip]);

  return (
    <div className="intro-overlay">
      <div className="intro-card">
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
          <circle cx="40" cy="40" r={circleR} fill="none" stroke="rgba(0, 0, 0, 0.08)" strokeWidth="6" />
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
      <div className="username">{player.username}</div>
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

function PlayerList({ players, currentPlayerIndex }: { players: PlayerState[]; currentPlayerIndex: number }) {
  return (
    <div className="playerlist-overlay">
      <div className="playerlist-panel">
        <div className="playerlist-title">PLAYERS</div>
        {players.map((p, i) => {
          const isActive = i === currentPlayerIndex;
          const hpColor = !p.alive ? "#880000" : p.hp < 30 ? "#ff9100" : primaryColor;
          return (
            <div
              key={p.index}
              className={`playerlist-row ${!p.alive ? "playerlist-row--dead" : ""} ${isActive ? "playerlist-row--active" : ""}`}
              style={isActive ? { borderLeft: `3px solid ${primaryColor}` } : {}}
            >
              <span className="playerlist-status">{p.alive ? "●" : "✕"}</span>
              <span className="playerlist-name">{p.username}</span>
              <span className="playerlist-hp" style={{ color: hpColor }}>
                {p.alive ? `${p.hp} HP` : "DEAD"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function InventoryPanel({ inventory, selected, onSelect, onClose }: { inventory: Weapon[]; selected: Weapon | null; onSelect: (w: Weapon) => void; onClose: () => void }) {
  return (
    <div className="inventory-panel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="inventory-header">
        <span className="inventory-title">WEAPONS</span>
        <button className="inventory-close" onClick={onClose}>✕</button></div>
      <div className="inventory-list">
        {inventory.map((w) => (
          <button
            key={w.id}
            className={`weapon-slot ${selected?.id === w.id ? 'selected' : ''}`}
            onClick={() => onSelect(w)}
            style={selected?.id === w.id ? { borderColor: primaryColor, backgroundColor: `${primaryColor}15` } : {}}
          >
            <span className="weapon-icon">{w.icon}</span>
            <span className="weapon-name">{w.name}</span>
            <span className="weapon-ammo">×{w.ammo}</span>
          </button>
        ))}
      </div>
      <div className="inventory-hint">Press Q to close</div>
    </div>
  );
}

function WeaponUI({ selected, onOpenInventory }: { selected: Weapon | null; onOpenInventory: () => void }) {
  return (
    <div className="weapon-hud" onClick={onOpenInventory}>
      <div className="weapon-hud-slot" style={{ borderRight: `4px solid ${primaryColor}`, borderBottom: `4px solid ${primaryColor}` }}>
        {selected ? (
          <>
            <span style={{ fontSize: 32 }}>{selected.icon}</span>
            <span className="weapon-hud-name">{selected.name}</span>
            <span className="weapon-hud-ammo" style={{ color: primaryColor }}>×{selected.ammo}</span>
          </>
        ) : (
          <span className="weapon-hud-empty">[ Q ] WEAPONS</span>
        )}
      </div>
    </div>
  );
}

function DeathScreen({ entry, timeLeft, totalTime, onDismiss, }: { entry: KillLogEntry; timeLeft: number; totalTime: number; onDismiss: () => void; }) {
  useEffect(() => {
    const handler = () => onDismiss();
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [onDismiss]);

  const barPct = (timeLeft/totalTime) * 100;

  return (
    <div className="death-overlay">
      <div className="death-card">
        <div className="death-title">eliminated</div>
        <div className="death-username">{entry.victimName}</div>

        <div className="death-stats">
          <div className="death-stat-row">
            <span className="death-stat-label">Cause</span>
            <span className="death-stat-value">
              {causeIcon[entry.cause] ?? "☠️"}&nbsp;
              {causeLabel[entry.cause] ?? "died"}
            </span>
          </div>

          {entry.killerName && (
            <div className="death-stat-row">
              <span className="death-stat-label">Killed by</span>
              <span className="death-stat-value" style={{ color: primaryColor }}>
                {entry.killerName}
              </span>
            </div>
          )}

          <div className="death-stat-row">
            <span className="death-stat-label">Round</span>
            <span className="death-stat-value">#{entry.round}</span>
          </div>
        </div>

        <div className="death-timer-row">
          <div className="death-timer-bar-track">
            <div
              className="death-timer-bar-fill"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <div className="death-timer-hint">click to continue · {timeLeft}s</div>
        </div>
      </div>
    </div>
  );
}

const deathScreenTotal = 10;

export function GameUI({ gameState, onSkipIntro, onSelectWeapon, onToggleInventory, onDismissDeathScreen }: { gameState: GameState; onSkipIntro: () => void; onSelectWeapon: (weapon: Weapon) => void; onToggleInventory: () => void; onDismissDeathScreen: () => void; }) {
  const {
    phase,
    players,
    currentPlayerIndex,
    turnTimeLeft,
    introTimeLeft,
    selectedWeapon,
    inventory,
    inventoryOpen,
    deathScreenEntry,
    deathScreenTimeLeft,
  } = gameState;

  const currentPlayer = players[currentPlayerIndex];
  const [showPlayerList, setShowPlayerList] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if(e.code === "KeyQ" && phase === "playing") onToggleInventory();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, onToggleInventory]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if(e.code === "Tab" || e.code === "KeyT") {
        e.preventDefault();
        setShowPlayerList(true);
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === "Tab" || e.code === "KeyT") setShowPlayerList(false); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  return (
    <div className="hud-container">
      {phase === "deathScreen" && deathScreenEntry && (
        <DeathScreen
          entry={deathScreenEntry}
          timeLeft={deathScreenTimeLeft}
          totalTime={deathScreenTotal}
          onDismiss={onDismissDeathScreen}
        />
      )}

      {phase === "intro" && (
        <IntroOverlay player={currentPlayer} timeLeft={introTimeLeft} onSkip={onSkipIntro} />
      )}

      {phase === "playing" && (
        <>
          <TurnUI player={currentPlayer} turnTimeLeft={turnTimeLeft} />
          {inventoryOpen ? (
            <InventoryPanel inventory={inventory} selected={selectedWeapon} onSelect={onSelectWeapon} onClose={onToggleInventory} />
          ) : (
            <WeaponUI selected={selectedWeapon} onOpenInventory={onToggleInventory} />
          )}
        </>
      )}
      {showPlayerList && <PlayerList players={players} currentPlayerIndex={currentPlayerIndex} />}
    </div>
  );
}