const { test } = require('node:test');
const assert = require('node:assert/strict');
const { removeEdgeBackground } = require(process.env.CROP_BUNDLE || '/tmp/gallery-crop.cjs');
function image(w,h,color=[255,255,255,255]) { return {width:w,height:h,data:Uint8ClampedArray.from(Array.from({length:w*h},()=>color).flat())}; }
function set(img,x,y,rgba){img.data.set(rgba,4*(y*img.width+x));}
function get(img,x,y){return Array.from(img.data.slice(4*(y*img.width+x),4*(y*img.width+x)+4));}
test('remove only edge-connected light background, not enclosed white details',()=>{
 const img=image(9,9);
 for(let y=2;y<7;y++)for(let x=2;x<7;x++)set(img,x,y,[255,0,0,255]);
 set(img,4,4,[255,255,255,255]);
 removeEdgeBackground(img,24);
 assert.deepEqual(get(img,0,0),[255,255,255,0]);
 assert.deepEqual(get(img,2,2),[255,0,0,255]);
 assert.deepEqual(get(img,4,4),[255,255,255,255]);
});
test('no uniform border consensus leaves a complex edge unchanged',()=>{
 const img=image(5,5);
 for(let y=0;y<5;y++)for(let x=0;x<5;x++)set(img,x,y,[(x*51)%256,(y*51)%256,((x+y)*41)%256,255]);
 const before=img.data.slice();removeEdgeBackground(img,0);assert.deepEqual(img.data,before);
});
test('already-transparent border does not erase opaque center',()=>{
 const img=image(7,7,[0,0,0,0]);set(img,3,3,[30,80,150,255]);
 const before=img.data.slice();removeEdgeBackground(img,24);assert.deepEqual(img.data,before);
});
