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

const explX =0;
const explY =-10;
const explZ=0;
const explRadius = 6;

const explArray = instanceArray.filter(({ model }) => {
    const tx = model[12];
    const ty = model[13];
    const tz = model[14];

    const dx = tx-explX;
    const dy = ty-explY;
    const dz = tz-explZ;

    const dist = dx*dx + dy*dy + dz*dz +1;

    return dist > explRadius * explRadius;
});

export const cubeCount = explArray.length;

export function checkPosition(cubeIndex: number){
    let instance = instanceArray[cubeIndex];
    console.log(instance);
}

export function createPlateBuffer(root: any){
    return root
    .createBuffer(d.arrayOf(cubeInstance, cubeCount), explArray)
    .$usage("storage");
}

const activeBlocks = new Set<string>();

for (const inst of explArray) {
    const tx = Math.round(inst.model[12]);
    const ty = Math.round(inst.model[13]);
    const tz = Math.round(inst.model[14]);
    activeBlocks.add(`${tx},${ty},${tz}`);
}

export function isSolidBlock(x: number, y: number, z: number): boolean {
    return activeBlocks.has(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
}

