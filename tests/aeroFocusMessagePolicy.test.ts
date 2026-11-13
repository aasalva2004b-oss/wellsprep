import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAeroFocusNotice } from '../src/lib/aeroFocusMessagePolicy';
test('browser hints require a matching account and exact trusted origin',()=>{
 const message={type:'AEROFOCUS_TOUCHDOWN_SYNC',userId:'synthetic-owner'};
 const allow=(origin:string,data:any=message)=>allowedAeroFocusNotice(origin,data,'synthetic-owner','https://wells.example',['https://aero.example']);
 assert.equal(allow('https://wells.example'),true);assert.equal(allow('https://aero.example'),true);
 for(const origin of ['null','https://evil.example','https://aero.example.evil.test','http://aero.example'])assert.equal(allow(origin),false);
 assert.equal(allow('https://aero.example',{...message,userId:'other'}),false);
 assert.equal(allow('https://aero.example',{type:message.type}),false);
});
