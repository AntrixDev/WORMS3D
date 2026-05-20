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

