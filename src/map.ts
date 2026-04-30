import {d} from "typegpu";
import * as m from "wgpu-matrix";

 const cubeInstance = d.struct({
    model: d.mat4x4f,
});

const plateSize = 10;

const instanceArray: {
    instanceAr: Float32Array 
}[]=[];

const offset = Math.floor(plateSize / 2);

for(let i=0; i <plateSize*plateSize; i++){

    const x = (i% plateSize) - offset;
    const y =-2;
    const z = Math.floor((i/plateSize)) - offset;

    instanceArray.push({
        instanceAr: m.mat4.translate([x, y ,z], d.mat4x4f()),
    });
}

 const cubeCount = instanceArray.length;

export function checkPosition(cubeIndex: number){
    let instance = instanceArray[cubeIndex];
    console.log(instance);
}