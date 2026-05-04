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

            instanceArray.push({
                model: m.mat4.translation([origin, origin+b, origin+a], d.mat4x4f()),
            });

            instanceArray.push({
                model: m.mat4.translation([origin+max, origin+b, origin+a], d.mat4x4f()),
            });

            instanceArray.push({
                model: m.mat4.translation([origin+a, origin+b, origin], d.mat4x4f()),
            });


        }
    }

}

const size = 40;
const origin = -(size/2);

addPlates(origin, size);

export const cubeCount = instanceArray.length;

export function checkPosition(cubeIndex: number){
    let instance = instanceArray[cubeIndex];
    console.log(instance);
}

export function createPlateBuffer(root: any){
    return root
    .createBuffer(d.arrayOf(cubeInstance, cubeCount), instanceArray)
    .$usage("storage");
}

