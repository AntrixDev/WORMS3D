import {d} from "typegpu";
import * as m from "wgpu-matrix";

export const cubeInstance = d.struct({
    model: d.mat4x4f,
});

const plateSize = 100;

const instanceArray: d.InferInput<typeof cubeInstance>[]=[];

const offset = Math.floor(plateSize / 2);

for(let i=0; i <plateSize*plateSize; i++){

    const x = (i% plateSize) - offset;
    const y =-2;
    const z = Math.floor((i/plateSize)) - offset;

    instanceArray.push({
        model: m.mat4.translation([x, y, z], d.mat4x4f()),
    });
}

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

