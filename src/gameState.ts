import { arenaFloorY, arenaWallMax, arenaWallMin } from "./map";
import { colorAt, defaultColorIndex } from "./colors";
import { faceCount } from "./gravity";

export type GamePhase = "intro" | "playing" | "deathScreen" | "winner";

export interface PlayerState {
    index: number;
    username: string;
    // characterIndex: number;
    hp: number;
    spawnX: number;
    // spawnY: number;
    spawnZ: number;
    posX: number;
    posY: number;
    posZ: number;
    yaw: number;
    alive: boolean;
    colorIndex: number;
    color: string;
    colorName: string;
    gravityFaceIndex: number;
}

export interface Weapon {
    id: number;
    name: string;
    ammo: number;
    icon: string;
    description?: string;
}

export type DeathCause = "void" | "weapon" | "unknown";

export interface KillLogEntry {
    victimIndex: number;
    victimName: string;
    killerIndex: number | null;
    killerName: string | null;
    cause: DeathCause;
    round: number;
    duringOwnTurn: boolean;
}

export interface GameState {
    phase: GamePhase;
    players: PlayerState[];
    currentPlayerIndex: number;
    turnTimeLeft: number;
    roundNumber: number;
    introTimeLeft: number;
    selectedWeapon: Weapon | null;
    inventory: Weapon[];
    inventoryOpen: boolean;
    cameraMode: "intro" | "thirdPer";
    killLog: KillLogEntry[];
    deathScreenEntry: KillLogEntry | null;
    deathScreenTimeLeft: number;
    winnerIndex: number | null;
    weaponUsed: boolean;
}

export const turnDuration = 50;
const introDuration = 5;
const deathScreenDuration = 10;

const spawnMin = Math.ceil(arenaWallMin);
const spawnMax = Math.ceil(arenaWallMax);

const nearLOW = arenaWallMin - 0.3;  
const nearHIGH = arenaWallMax + 0.3; 
void arenaFloorY;

export const defWeapons: Weapon[] = [
    {id: 1, name: "Rocket Launcher", ammo: 2, icon: "🚀", description: "I wonder what can it doo.. launches a rocket obviously"},
    {id: 2, name: "Bomb", ammo: 1, icon: "💣", description: "That's a throw and run bomb. Show them how much strength you got."},
];

function randomSpawnCord(): number {
    return Math.floor(Math.random() * (spawnMax - spawnMin+1)) + spawnMin;
}

function spawnForFace(faceIdx: number, a: number, b: number): { x: number; y: number; z: number } {
    switch (faceIdx) {
        case 0: return { x: a, y: nearLOW, z: b };
        case 1: return { x: a, y: nearHIGH, z: b };
        case 2: return { x: nearLOW, y: a, z: b };
        case 3: return { x: nearHIGH, y: a, z: b };
        case 4: return { x: a, y: b, z: nearLOW };
        case 5: return { x: a, y: b, z: nearHIGH };
        default: return { x: a, y: nearLOW, z: b };
    }
}

function generateSpawnsWithGravity(
    count: number,
): Array<{ faceIdx: number; x: number; y: number; z: number }> {
    const usedPerFace: Map<number, Set<string>> = new Map();
    for (let i = 0; i < faceCount; i++) usedPerFace.set(i, new Set());

    const result: Array<{ faceIdx: number; x: number; y: number; z: number }> = [];

    for (let i = 0; i < count; i++) {
        const faceIdx = Math.floor(Math.random() * faceCount);
        const slots = usedPerFace.get(faceIdx)!;

        let a: number, b: number, key: string;
        let attempts = 0;
        do {
            a = randomSpawnCord();
            b = randomSpawnCord();
            key = `${a},${b}`;
            attempts++;
        } while (slots.has(key) && attempts < 50);
        slots.add(key);

        result.push({ faceIdx, ...spawnForFace(faceIdx, a, b) });
    }

    return result;
}

export function createInitGameState (
    players: {username: string; colorIndex?: number}[]
): GameState {
    const spawns = generateSpawnsWithGravity(players.length);

    const playerStatus: PlayerState[] = players.map((p, i) => {
    const ci = p.colorIndex ?? defaultColorIndex;
    const c = colorAt(ci);
    return {
        index: i,
        username: p.username,
        hp: 100,
        spawnX: spawns[i].x,
        spawnZ: spawns[i].z,
        posX: spawns[i].x,
        posY: spawns[i].y,
        posZ: spawns[i].z,
        yaw: 0,
        alive: true,
        colorIndex: ci,
        color: c.hex,
        colorName: c.name,
        gravityFaceIndex: spawns[i].faceIdx,
    };
    });

    return{
        phase: "intro",
        players: playerStatus,
        currentPlayerIndex: 0,
        turnTimeLeft: turnDuration,
        roundNumber: 1,
        introTimeLeft: introDuration,
        selectedWeapon: null,
        inventory: [...defWeapons.map(w => ({ ...w }))],
        inventoryOpen: false,
        cameraMode: "intro",
        killLog: [],
        deathScreenEntry: null,
        deathScreenTimeLeft: 0,
        winnerIndex: null,
        weaponUsed: false,
    }
}


export class GameStateMachine {
    state: GameState;
    onCameraIntro?: (player: PlayerState) => void;
    onCameraThirdPerson?: (player: PlayerState) => void;
    onWinner?: (player: PlayerState | null) => void;
    onTurnEnd?: () => void;
    onStateChanged?: (state: GameState) => void;

    private introTimer: ReturnType<typeof setInterval> | null=null;
    private turnTimer: ReturnType<typeof setInterval> | null=null;
    private fireTimer: ReturnType<typeof setTimeout> | null=null;
    private deathTimer: ReturnType<typeof setInterval> | null=null;
    private weaponWaitTimer: ReturnType<typeof setTimeout> | null=null;

    constructor(players: { username: string; characterIndex?: number; colorIndex?: number }[]) {
        this.state = createInitGameState(players);
    }

    start() {
        this.beginIntro();
    }

    private emit() {
        this.onStateChanged?.(this.state);
    }

    private beginIntro() {
        this.clearTimers();
        const cur = this.currentPlayerState();
        this.state.phase = "intro";
        this.state.introTimeLeft = introDuration;
        this.state.cameraMode = "intro";
        this.state.inventoryOpen = false;
        this.state.selectedWeapon = null;
        this.state.deathScreenEntry = null;
        this.emit();

        this.onCameraIntro?.(cur);

        this.introTimer = setInterval(() => {
            this.state.introTimeLeft -= 1;
            this.emit();
            if (this.state.introTimeLeft <= 0) {
                this.clearTimers();
                this.beginPlaying();
            }
        }, 1000);
    }

    skipIntro() {
        if (this.state.phase !== "intro") return;
        this.clearTimers();
        this.beginPlaying();
    }

    private beginPlaying() {
        this.clearTimers();
        const cur = this.currentPlayerState();
        this.state.phase = "playing";
        this.state.turnTimeLeft = turnDuration;
        this.state.cameraMode = "thirdPer";
        this.state.weaponUsed = false;
        this.emit();

        this.onCameraThirdPerson?.(cur);

        this.turnTimer = setInterval(() => {
            this.state.turnTimeLeft -= 1;
            this.emit();
            if (this.state.turnTimeLeft <= 0) {
                this.clearTimers();
                this.state.inventoryOpen = false;
                this.advanceTurn();
            }
        }, 1000);
    }

    killPlayer( victimIndex: number, cause: DeathCause = "void", killerIndex: number | null = null, ) {
        const victim = this.state.players[victimIndex];
        if (!victim || !victim.alive) return;

        victim.hp = 0;
        victim.alive = false;

        const killer = killerIndex !== null ? this.state.players[killerIndex] : null;
        const duringOwnTurn = victimIndex === this.state.currentPlayerIndex;

        const entry: KillLogEntry = {
            victimIndex,
            victimName: victim.username,
            killerIndex,
            killerName: killer?.username ?? null,
            cause,
            round: this.state.roundNumber,
            duringOwnTurn,
        };

        this.state.killLog = [...this.state.killLog, entry];

        const alive = this.state.players.filter((p) => p.alive);
        if (alive.length <= 1) {
            this.clearTimers();
            this.state.phase = "winner";
            this.state.winnerIndex = alive.length === 1 ? alive[0].index : null;
            this.state.inventoryOpen = false;
            this.state.selectedWeapon = null;
            this.state.deathScreenEntry = null;
            this.emit();
            this.onWinner?.(alive[0] ?? null);
            return;
        }

        if (duringOwnTurn) {
            this.clearTimers();
            this.state.phase = "deathScreen";
            this.state.deathScreenEntry = entry;
            this.state.deathScreenTimeLeft = deathScreenDuration;
            this.state.inventoryOpen = false;
            this.emit();

            this.deathTimer = setInterval(() => {
                this.state.deathScreenTimeLeft -= 1;
                this.emit();
                if (this.state.deathScreenTimeLeft <= 0) {
                    this.dismissDeathScreen();
                }
            }, 1000);
        } else {
            this.emit();
        }
    }

    applyExplosionDamage(
        cx: number,
        cy: number,
        cz: number,
        innerRadius: number,
        innerDamage: number,
        outerRadius: number,
        outerDamage: number,
        killerIndex: number | null = null,
    ) {
        const innerR2 = innerRadius * innerRadius;
        const outerR2 = outerRadius * outerRadius;
        let changed = false;

        for (const p of this.state.players) {
            if (!p.alive) continue;

            const dx = p.posX - cx;
            const dy = p.posY - cy;
            const dz = p.posZ - cz;
            const distSq = dx * dx + dy * dy + dz * dz;

            let damage = 0;
            if (distSq <= innerR2) damage = innerDamage;
            else if (distSq <= outerR2) damage = outerDamage;
            else continue;

            p.hp -= damage;
            changed = true;
            if (p.hp <= 0) {
                p.hp = 0;
                this.killPlayer(p.index, "weapon", killerIndex);
            }
        }

        if (changed) this.emit();
    }

    dismissDeathScreen() {
        if (this.state.phase !== "deathScreen") return;
        this.clearTimers();
        this.state.deathScreenEntry = null;
        this.advanceTurn();
    }

    toggleInventory() {
        if(this.state.phase !== "playing" || this.state.weaponUsed) return;
        this.state.inventoryOpen = !this.state.inventoryOpen;
        this.emit();
    }

    openInventory() {
        if (this.state.phase !== "playing" || this.state.weaponUsed) return;
        this.state.inventoryOpen = true;
        this.emit();
    }

    notifyWeaponFired() {
        if (this.state.phase !== "playing" || this.state.weaponUsed) return;
        this.state.weaponUsed = true;
        this.state.selectedWeapon = null;
        this.state.inventoryOpen = false;
        if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null; }
        this.emit();
    }

    notifyWeaponDetonated() {
        if (this.state.phase !== "playing" || this.weaponWaitTimer) return;
        this.weaponWaitTimer = setTimeout(() => {
            this.weaponWaitTimer = null;
            if (this.state.phase === "playing") this.advanceTurn();
        }, 1800);
    }

    closeInventory() {
        this.state.inventoryOpen = false;
        this.emit();
    }

    selectWeapon(weapon: Weapon) {
        if(this.state.phase !== "playing" || this.state.weaponUsed) return;
        this.state.selectedWeapon = weapon;
        this.state.inventoryOpen = false;
        this.emit();
    }

    private advanceTurn() {
        const total = this.state.players.length;
        let next = this.state.currentPlayerIndex;
        let tries = 0;
        do {
            next = (next + 1) % total;
            tries++;
        } while (!this.state.players[next].alive && tries < total);

        this.state.currentPlayerIndex = next;
        this.state.roundNumber += 1;
        this.state.inventory = [...defWeapons.map(w => ({ ...w }))];

        this.beginIntro();
        this.onTurnEnd?.();
    }

    private currentPlayerState(): PlayerState {
        return this.state.players[this.state.currentPlayerIndex];
    }

    updatePlayerPosition(playerIndex: number, x: number, y: number, z: number) {
        const p = this.state.players[playerIndex];
        if(p){
            p.posX = x;
            p.posY = y;
            p.posZ = z;
        }
    }

    private clearTimers() {
        if (this.introTimer) { clearInterval(this.introTimer); this.introTimer = null; }
        if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null; }
        if (this.fireTimer) { clearTimeout(this.fireTimer); this.fireTimer = null; }
        if(this.deathTimer) { clearInterval(this.deathTimer); this.deathTimer = null; }
        if(this.weaponWaitTimer) { clearTimeout(this.weaponWaitTimer); this.weaponWaitTimer = null; }
    }

    get currentPlayer(): PlayerState {
        return this.currentPlayerState();
    }

    get isActivePlayerTurn(): boolean {
        return this.state.phase === "playing";
    }
}