export type GamePhase = "instro" | "playing" | "aiming";

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
    id: string;
    name: string;
    ammo: number;
    icon: string;
}

export interface GameState {
    phase: GamePhase;
    players: PlayerState;
    currentPlayerIndex: number;
    turnTimeLeft: number;
    roundNumber: number;
    introTimeLeft: number;
    inventory: Weapon[];
    inventoryOpen: boolean;
    cameraMode: "intro" | "third-person";
}

const turnDuration = 50;
const introDuration = 5;
