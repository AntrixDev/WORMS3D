import { useEffect, useState } from "react";
import type { GameState, PlayerState, Weapon, KillLogEntry } from "../gameState";
import "./gameUI.css"
import { turnDuration } from "../gameState"
import Button from "./components/button"

let primaryColor = "#96488A";

const MEDAL_COLORS = ["#FFD700", "#929292", "#CD7F32"];

const causeDeath: Record<string, string> = {
  void: "fell into the void",
  weapon: "blown up",
  unknown: "unknown",
};

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
          const hpColor = !p.alive ? primaryColor : p.hp < 30 ? "#ff9100" : "#000000";
          return (
            <div
              key={p.index}
              className={`playerlist-row ${!p.alive ? "playerlist-row--dead" : ""} ${isActive ? "playerlist-row--active" : ""}`}
              style={isActive ? { borderLeft: `3px solid ${primaryColor}`} : {}}
            >
              <span className="playerlist-status">{p.alive ? "●" : "✕"}</span>
              <span className="playerlist-name" style={isActive ? { color: primaryColor} : {}}>{p.username}</span>
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

function DeathScreen({ entry, timeLeft, totalTime, onDismiss, players }: { entry: KillLogEntry; timeLeft: number; totalTime: number; onDismiss: () => void; players: PlayerState[] }) {
  const victimColor = players[entry.victimIndex]?.color ?? primaryColor;
  const killerColor = entry.killerIndex !== null ? (players[entry.killerIndex]?.color ?? primaryColor) : primaryColor;
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
        <div className="death-username" style={{color: victimColor, textShadow: `0 0 40px ${victimColor}`}}>{entry.victimName}</div>

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
              <span className="death-stat-value" style={{ color: killerColor }}>
                {entry.killerName}
              </span>
            </div>
          )}

          <div className="death-stat-row">
            <span className="death-stat-label">Round</span>
            <span className="death-stat-value">#{entry.round}</span>
          </div>
          <div className="death-stat-row">
            <span className="death-stat-label">Status</span>
            <span className="death-stat-value"> none4now</span>
          </div>
        </div>

        <div className="death-timer-row">
          <div className="death-timer-bar-track">
            <div
              className="death-timer-bar-fill"
              style={{ width: `${barPct}%`, backgroundColor: primaryColor }}
            />
          </div>
          <div className="death-timer-hint">click to continue · {timeLeft}s</div>
        </div>
      </div>
    </div>
  );
}

interface RankedRow {
  player: PlayerState;
  kills: number;
  cause: string;
}

function buildLeaderboard(
  players: PlayerState[],
  killLog: KillLogEntry[],
  winnerIndex: number | null,
): RankedRow[] {
  const order: number[] = [];
  if (winnerIndex !== null) order.push(winnerIndex);

  for (let i = killLog.length - 1; i >= 0; i--) {
    const vi = killLog[i].victimIndex;
    if (!order.includes(vi)) order.push(vi);
  }
  for (const p of players) if (!order.includes(p.index)) order.push(p.index);

  return order.map((idx) => {
    const player = players[idx];
    const kills = killLog.filter((e) => e.killerIndex === idx).length;
    const deathEntry = killLog.find((e) => e.victimIndex === idx);
    const cause = player.alive
      ? "survived"
      : causeDeath[deathEntry?.cause ?? "unknown"] ?? "unknown";
    return { player, kills, cause };
  });
}

function Leaderboard({
  players,
  killLog,
  winnerIndex,
}: {
  players: PlayerState[];
  killLog: KillLogEntry[];
  winnerIndex: number | null;
}) {
  const rows = buildLeaderboard(players, killLog, winnerIndex);

  return (
    <div className="leaderboard-panel">
      <div className="leaderboard-title">LEADERBOARD</div>
      <div className="leaderboard-list">
        {rows.map((row, i) => {
          const medal = i < 3 ? MEDAL_COLORS[i] : "#000000";
          return (
            <div className="leaderboard-row" key={row.player.index}>
              <span className="leaderboard-place" style={{ color: medal }}>
                {i + 1}
              </span>
              <span
                className="leaderboard-name"
                style={{ color: medal, fontWeight: i < 3 ? 900 : 700 }}
              >
                {row.player.username}
              </span>
              <span className="leaderboard-cause">{row.cause}</span>
              <span className="leaderboard-kills">{row.kills} kills</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinnerOverlay({
  winner,
  players,
  killLog,
  winnerIndex,
  onBackToMenu,
}: {
  winner: PlayerState | null;
  players: PlayerState[];
  killLog: KillLogEntry[];
  winnerIndex: number | null;
  onBackToMenu: () => void;
}) {
  const accent = winner ? winner.color : primaryColor;
  return (
    <div className="winner-overlay">
      <div className="winner-card">
        <div className="winner-title">WINNER</div>
        <div
          className="winner-username"
          style={{ color: accent, textShadow: `0 0 40px ${accent}` }}
        >
          {winner ? winner.username : "DRAW"}
        </div>
        <div className="winner-sub">{winner ? "last slime standing" : "no survivors"}</div>
      </div>
      <Leaderboard
        players={players}
        killLog={killLog}
        winnerIndex={winnerIndex}
      />
      <div className="winner-back-wrap">
        <Button text="BACK TO LOBBY" action={onBackToMenu} />
      </div>
    </div>
  );
}

const killFeedTTL = 5000;
const animOutMs = 300;

interface FeedItem extends KillLogEntry {
  id: number;
  expiresAt: number;
}

let feedIdCounter=0;

function KillFeedEntry({ item, players }: { item: FeedItem; players: PlayerState[] }) {
  const victimColor = players[item.victimIndex]?.color ?? "#ffffff";
  const killerColor = item.killerIndex !== null ? (players[item.killerIndex]?.color ?? "#ffffff") : "#ffffff";
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timeUntilExitAnim = (item.expiresAt - Date.now()) - animOutMs;
    const t = setTimeout(() => {
      setIsExiting(true);
    }, Math.max(timeUntilExitAnim, 0));
    return () => clearTimeout(t);
  }, [item.expiresAt]);

  return (
    <div className={`killfeed-entry ${isExiting ? "killfeed-animate-out" : "killfeed-animate-in"}`} style={{borderLeft: `3px solid ${victimColor}`}}>
      <span className="killfeed-cause-icon">{causeIcon[item.cause] ?? "☠️"}</span>
      <span>
        <span style={{color: victimColor, fontWeight: 800}}>{item.victimName}</span>
        {" "}
        {causeLabel[item.cause] ?? "died"}
        {item.killerName && (
          <>
            {" "}by{" "}
            <span className="killfeed-killer" style={{color: killerColor, fontWeight: 800}}>{item.killerName}</span>
          </>
        )}
      </span>
    </div>
  );
}

function KillFeed({ killLog, players }: { killLog: KillLogEntry[]; players: PlayerState[] }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [seenCount, setSeenCount] = useState(0);

  useEffect(() => {
    if (killLog.length <= seenCount) return;
    const newEntries = killLog.slice(seenCount);
    const now = Date.now();
    
    const newItems: FeedItem[] = newEntries.map((e) => ({
      ...e,
      id: ++feedIdCounter,
      expiresAt: now + killFeedTTL,
    }));
    
    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
    }
    setSeenCount(killLog.length);
  }, [killLog, seenCount]);

  useEffect(() => {
    if (items.length === 0) return;
    const earliest = Math.min(...items.map((i) => i.expiresAt));
    const delay = earliest - Date.now();
    const t = setTimeout(() => {
      const now = Date.now();
      setItems((prev) => prev.filter((i) => i.expiresAt > now));
    }, Math.max(delay, 0));
    return () => clearTimeout(t);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="killfeed">
      {items.map((item) => (
        <KillFeedEntry key={item.id} item={item} players={players} />
      ))}
    </div>
  );
}

const deathScreenTotal = 10;

export function GameUI({ gameState, onSkipIntro, onSelectWeapon, onToggleInventory, onDismissDeathScreen, onBackToMenu }: { gameState: GameState; onSkipIntro: () => void; onSelectWeapon: (weapon: Weapon) => void; onToggleInventory: () => void; onDismissDeathScreen: () => void; onBackToMenu: () => void; }) {
  const {
    phase,
    players,
    currentPlayerIndex,
    turnTimeLeft,
    introTimeLeft,
    selectedWeapon,
    inventory,
    inventoryOpen,
    killLog,
    deathScreenEntry,
    deathScreenTimeLeft,
    winnerIndex,
  } = gameState;

  const currentPlayer = players[currentPlayerIndex];
  primaryColor = currentPlayer?.color ?? "#96488A";
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

      <KillFeed killLog={killLog} players={players} />

      {phase === "deathScreen" && deathScreenEntry && (
        <DeathScreen
          entry={deathScreenEntry}
          timeLeft={deathScreenTimeLeft}
          totalTime={deathScreenTotal}
          onDismiss={onDismissDeathScreen}
          players={players}
        />
      )}

      {phase === "winner" && (
        <WinnerOverlay
          winner={winnerIndex !== null ? players[winnerIndex] : null}
          players={players}
          killLog={killLog}
          winnerIndex={winnerIndex}
          onBackToMenu={onBackToMenu}
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