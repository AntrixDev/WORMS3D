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
    id: string;
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

const turnDuration = 50;
const introDuration = 5;

const spawnMin = Math.ceil(arenaWallMin);
const spawnMax = Math.ceil(arenaWallMax);
const spawnY = arenaFloorY + 0.5;

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



