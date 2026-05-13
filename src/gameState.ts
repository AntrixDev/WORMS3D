import { arenaFloorY, arenaWallMax, arenaWallMin } from "./map";

export type GamePhase = "intro" | "playing";

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
    alive: boolean;
}

export interface Weapon {
    id: number;
    name: string;
    ammo: number;
    icon: string;
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
}

export const turnDuration = 50;
const introDuration = 5;

const spawnMin = Math.ceil(arenaWallMin);
const spawnMax = Math.ceil(arenaWallMax);
const spawnY = arenaFloorY + 0.5;

export const defWeapons: Weapon[] = [
    {id: 1, name: "weap1", ammo: 1, icon: "🚀"},
    {id: 2, name: "weap2", ammo: 4, icon: "🧨"},
];

function randomSpawnCord(): number {
    return Math.floor(Math.random() * (spawnMax - spawnMin+1)) + spawnMin;
}

function generateSpawns(count: number): Array<{x: number; z: number}> {
    const used = new Set<string>();
    const result: Array<{x: number; z: number}> = [];

    for(let i=0; i< count; i++){
        let x: number, z: number, cords: string;

        do{
            x= randomSpawnCord();
            z= randomSpawnCord();
            cords = `${x},${z}`;
        }while(used.has(cords));
        used.add(cords);
        result.push({ x, z });
    }

    return result;
}

export function createInitGameState (
    players: {username: string;}[]
): GameState {
    const spawns = generateSpawns(players.length);

    const playerStatus: PlayerState[] = players.map((p, i) => ({
        index: i,
        username: p.username,
        hp: 100,
        spawnX: spawns[i].x,
        spawnZ: spawns[i].z,
        posX: spawns[i].x,
        posY: spawnY,
        posZ: spawns[i].z,
        alive: true,
    }));

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
    }
}


export class GameStateMachine {
    state: GameState;
    onCameraIntro?: (player: PlayerState) => void;
    onCameraThirdPerson?: (player: PlayerState) => void;
    onTurnEnd?: () => void;
    onStateChanged?: (state: GameState) => void;

    private introTimer: ReturnType<typeof setInterval> | null=null;
    private turnTimer: ReturnType<typeof setInterval> | null=null;
    private fireTimer: ReturnType<typeof setTimeout> | null=null;

    constructor(players: { username: string; characterIndex?: number }[]) {
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

    toggleInventory() {
        if(this.state.phase !== "playing") return;
        this.state.inventoryOpen = !this.state.inventoryOpen;
        this.emit();
    }

    openInventory() {
        if (this.state.phase !== "playing") return;
        this.state.inventoryOpen = true;
        this.emit();
    }

    closeInventory() {
        this.state.inventoryOpen = false;
        this.emit();
    }

    selectWeapon(weapon: Weapon) {
        if(this.state.phase !== "playing") return;
        this.state.selectedWeapon = weapon;
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
    }

    get currentPlayer(): PlayerState {
        return this.currentPlayerState();
    }

    get isActivePlayerTurn(): boolean {
        return this.state.phase === "playing";
    }
}