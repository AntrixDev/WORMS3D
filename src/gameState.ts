import { arenaFloorY, arenaWallMax, arenaWallMin } from "./map";

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

const spawnMin = Math.ceil(arenaWallMin);
const spawnMax = Math.ceil(arenaWallMax);

export const defWeapons: Weapon[] = [
    {id: "yomom", name: "yomom", ammo: 1, icon: "🚀"},
    {id: "yodad", name: "yodad", ammo: 4, icon: "🧨"},
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