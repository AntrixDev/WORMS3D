import {d} from "typegpu";
import * as m from "wgpu-matrix";

export const cubeInstance = d.struct({
    model: d.mat4x4f,
});

const instanceArray: d.InferInput<typeof cubeInstance>[]=[];

function addPlates(origin: number, plateSize: number){
    const max = plateSize-1;

    for(let a=0; a<plateSize; a++){
        for(let b=0; b<plateSize; b++){
            instanceArray.push({
                model: m.mat4.translation([origin+a, origin, origin+b], d.mat4x4f()),
            });

            instanceArray.push({
                model: m.mat4.translation([origin+a, origin+max, origin+b], d.mat4x4f()),
            });

            if(b>0 && b<max){
                instanceArray.push({
                    model: m.mat4.translation([origin, origin+b, origin+a], d.mat4x4f()),
                });

                instanceArray.push({
                    model: m.mat4.translation([origin+max, origin+b, origin+a], d.mat4x4f()),
                });
                if(a>0 && a<max){
                    instanceArray.push({
                        model: m.mat4.translation([origin+a, origin+b, origin], d.mat4x4f()),
                    });

                    instanceArray.push({
                        model: m.mat4.translation([origin+a, origin+b, origin+max], d.mat4x4f()),
                    });
                }

            }


        }
    }

}

export const arenaLayers = 4;
export const arenaInnerSize = 20;

const innerOrigin = -(arenaInnerSize/2);

export const arenaWallMin = innerOrigin+1;
export const arenaWallMax = innerOrigin + arenaInnerSize -2;
export const arenaFloorY = innerOrigin + 0.5;
export const arenaCeilY = innerOrigin + arenaInnerSize -2;


for(let i=0; i<arenaLayers; i++){
    const size = arenaInnerSize+i*2;
    const origin = -(size/2);

    addPlates(origin, size);
}


function mulberry32(seed: number) {
    let s = seed >>> 0;

    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t))^t;

        return ((t^(t >>> 14)) >>> 0) / 4294967296;
    };
}

type Cell2D = [number, number];

function makeRectangle(rng: () => number, maxDim: number): Cell2D[] {
    const w = 3 + Math.floor(rng() * (maxDim - 2));
    const h = 3 + Math.floor(rng() * (maxDim - 2));
    const cells: Cell2D[] = [];
    for(let u = 0; u < w; u++){
        for(let v = 0; v < h; v++){
            cells.push([u, v]);
        }
    }
    return cells;
}

const wallCells = new Set<string>();

for (const inst of instanceArray) {
    const tx= Math.round(inst.model[12]);
    const ty= Math.round(inst.model[13]);
    const tz= Math.round(inst.model[14]);

    wallCells.add(`${tx},${ty},${tz}`);
}

(function addPlatforms() {
    const minCell = arenaWallMin;
    const maxCell = arenaWallMax;
    const perpMin = arenaWallMin + 1;
    const perpMax = arenaWallMax - 1;

    const platformCount = Math.max(3, Math.floor(arenaInnerSize / 3));
    const maxPlatformDim = Math.max(4, Math.floor(arenaInnerSize / 2.5));

    const rng = mulberry32(0x5772d1e);
    const maxAttempts = platformCount * 40;

    const emitted = new Set<string>();

    let placed = 0;
    for (let attempt = 0; attempt < maxAttempts && placed < platformCount; attempt++) {
        const localCells = makeRectangle(rng, maxPlatformDim);

        const orientRoll = rng();
        const orient = orientRoll < 0.55 ? 0 : (orientRoll < 0.775 ? 1 : 2);

        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (const [u, v] of localCells) {
            if (u < minU) minU = u; if (u > maxU) maxU = u;
            if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
        const w = maxU - minU + 1;
        const h = maxV - minV + 1;

        const uRange = maxCell - minCell - w + 2;
        const vRange = maxCell - minCell - h + 2;
        if (uRange <= 0 || vRange <= 0) continue;
        const baseU = minCell + Math.floor(rng() * uRange);
        const baseV = minCell + Math.floor(rng() * vRange);
        const perp = perpMin + Math.floor(rng() * (perpMax - perpMin + 1));

        const worldCells: Array<[number, number, number]> = [];
        for (const [u, v] of localCells) {
            const lu = u - minU;
            const lv = v - minV;
            let x: number, y: number, z: number;
            if (orient === 0)      { x = baseU + lu; y = perp;       z = baseV + lv; }
            else if (orient === 1) { x = perp;       y = baseU + lu; z = baseV + lv; }
            else                   { x = baseU + lu; y = baseV + lv; z = perp;       }
            worldCells.push([x, y, z]);
        }

        let canPlace = true;
        for (const [x, y, z] of worldCells) {
            if (x < minCell || x > maxCell ||
                y < minCell || y > maxCell ||
                z < minCell || z > maxCell) { canPlace = false; break; }
            if (wallCells.has(`${x},${y},${z}`)) { canPlace = false; break; }
        }
        if (!canPlace) continue;

        for (const [x, y, z] of worldCells) {
            const key = `${x},${y},${z}`;
            if (emitted.has(key)) continue;
            emitted.add(key);
            instanceArray.push({
                model: m.mat4.translation([x, y, z], d.mat4x4f()),
            });
        }
        placed++;
    }
})();

export const initialCubeCount = instanceArray.length;

export function checkPosition(cubeIndex: number){
    let instance = instanceArray[cubeIndex];
    console.log(instance);
}

let activeBlocks = new Set<string>();

function rebuildActiveBlocks(list: d.InferInput<typeof cubeInstance>[]) {
    activeBlocks = new Set<string>();
    for (const inst of list) {
        const tx = Math.round(inst.model[12]);
        const ty = Math.round(inst.model[13]);
        const tz = Math.round(inst.model[14]);
        activeBlocks.add(`${tx},${ty},${tz}`);
    }
}

rebuildActiveBlocks(instanceArray);

export function isSolidBlock(x: number, y: number, z: number): boolean {
    return activeBlocks.has(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
}

const farFiller: d.InferInput<typeof cubeInstance> = {
    model: m.mat4.translation([1e7, 1e7, 1e7], d.mat4x4f()),
};

export interface MapController {
    readonly buffer: any;
    readonly count: number;
    destroySphere(cx: number, cy: number, cz: number, radius: number): void;
}

export function createMapController(root: any): MapController {
    let live = instanceArray.slice();
    const capacity = instanceArray.length;

    function padded(list: d.InferInput<typeof cubeInstance>[]) {
        if (list.length === capacity) return list;
        const out = list.slice();
        while (out.length < capacity) out.push(farFiller);
        return out;
    }

    const buffer = root
        .createBuffer(d.arrayOf(cubeInstance, capacity), padded(live))
        .$usage("storage");

    return {
        get buffer() { return buffer; },
        get count() { return live.length; },

        destroySphere(cx: number, cy: number, cz: number, radius: number) {
            const r2 = radius * radius;
            live = live.filter(({ model }) => {
                const dx = model[12] - cx;
                const dy = model[13] - cy;
                const dz = model[14] - cz;
                return dx * dx + dy * dy + dz * dz + 1 > r2;
            });
            rebuildActiveBlocks(live);
            buffer.write(padded(live));
        },
    };
}

