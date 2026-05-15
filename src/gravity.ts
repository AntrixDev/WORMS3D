import * as m from "wgpu-matrix";

export interface GravityState{
    down: m.Vec3;
    label: string;
}

const faceGravity: GravityState[] = [
    { down: m.vec3.create(0, -1, 0), label: "floor " }, 
    { down: m.vec3.create(0,  1, 0), label: "ceiling" },
    { down: m.vec3.create(-1,  0, 0), label: "left" },
    { down: m.vec3.create(+1,  0, 0), label: "right" },
    { down: m.vec3.create(0,  0, -1), label: "back" },
    { down: m.vec3.create(0,  0, 1), label: "front" },
]

const defaultGravity: GravityState = {
   down: m.vec3.create(0, -1, 0), label: "defFloor",
}


function pickGravity(lookDir: m.Vec3): GravityState {
    let best = faceGravity[0];
    let bestDot = -Infinity;

    for (const g of faceGravity) {
        const dot = m.vec3.dot(lookDir, g.down);
        
        if (dot > bestDot) {
            bestDot = dot;
            best = g;
        }
    }

  return best;
}

export interface GravityController {
    getGravity(playerIndex: number): GravityState;

    trySwap(
        playerIndex: number,
        lookDir: m.Vec3
    ): GravityState | undefined;
    readonly magnitude: number;
}

export function GravityController(
    playerCount: number,
    magnitude = 25
): GravityController{

    const states: GravityState[] = Array.from(
        { length: playerCount },
        () => defaultGravity
    );

    return {
        magnitude,

        getGravity(playerIndex: number): GravityState {
        return states[playerIndex] ?? defaultGravity;
        },

        trySwap(playerIndex: number, lookDir: m.Vec3): GravityState | undefined {
        const candidate = pickGravity(lookDir);
        const current = states[playerIndex] ?? defaultGravity;

        if (
            candidate.down[0] !== current.down[0] ||
            candidate.down[1] !== current.down[1] ||
            candidate.down[2] !== current.down[2]
        ) {
            while (states.length <= playerIndex) states.push(defaultGravity);
            states[playerIndex] = candidate;
            return candidate;
        }

        return undefined;
        },
    };
}

export function lookDirFromYawPitch(yaw: number, pitch: number): m.Vec3 {

    return m.vec3.create(
        -Math.sin(yaw) * Math.cos(pitch),
        -Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
    );
}