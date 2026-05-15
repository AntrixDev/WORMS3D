import * as m from "wgpu-matrix";

export interface GravityState{
    down: m.Vec3;
    label: string;
}

const faceGravity: GravityState[] = [
    { down: m.vec3.create(0, -1, 0), label: "floor " }, 
    { down: m.vec3.create(0,  1, 0), label: "ceiling" },
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

