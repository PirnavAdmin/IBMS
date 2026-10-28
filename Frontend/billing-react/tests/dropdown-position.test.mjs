import test from 'node:test';
import assert from 'node:assert/strict';
import { dropdownPosition } from '../src/utils/dropdownPosition.js';
const viewport={width:390,height:720};
test('dropdown near the bottom opens above with full option space',()=>{
 const p=dropdownPosition({top:650,bottom:686,left:200,width:170},viewport,144);
 assert.equal(p.top,'auto'); assert.equal(p.bottom,74); assert.equal(p.maxHeight,144);
});
test('dropdown near the top opens below rather than clipping above',()=>{
 const p=dropdownPosition({top:20,bottom:56,left:20,width:170},viewport,210);
 assert.equal(p.top,60); assert.equal(p.bottom,'auto'); assert.equal(p.maxHeight,210);
});
test('long menus stay within viewport and use available scroll space',()=>{
 const p=dropdownPosition({top:300,bottom:336,left:350,width:500},viewport,600);
 assert.equal(p.width,374); assert.equal(p.left,8); assert.equal(p.maxHeight,372);
 assert.ok(p.top+p.maxHeight<=viewport.height-8);
});
test('short viewports keep scrollable options on the larger side',()=>{
 const p=dropdownPosition({top:120,bottom:156,left:20,width:100},{width:320,height:180},240);
 assert.equal(p.top,'auto'); assert.equal(p.maxHeight,108);
 assert.equal(180-p.bottom-p.maxHeight,8);
});
