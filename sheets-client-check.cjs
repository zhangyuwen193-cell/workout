const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const Engine=require('./sync-engine.js');const elements=new Map(),storage=new Map(),requests=[];let selected='yuchen';
const data={yuchen:{version:1,days:{a:[]}},youlun:{version:1,days:{b:[]}}};
const bridge={profileId:()=>selected,name:()=>selected==='yuchen'?'張語宸':'張祐綸',read:()=>data[selected],readFor:id=>data[id],valid:v=>v.version===1,replace(id,v){data[id]=v;bridge.onRender?.();}};
const window={WORKOUT_APPS_SCRIPT_URL:'https://script.google.com/macros/s/test-deployment/exec',workoutBridge:bridge,WorkoutSyncEngine:Engine,addEventListener(){}};
const context=vm.createContext({window,console,queueMicrotask,AbortController,URL,Blob,navigator:{onLine:true},confirm:()=>true,setTimeout:()=>1,clearTimeout(){},setInterval(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{hidden:false,addEventListener(){},querySelector(s){if(!elements.has(s))elements.set(s,{hidden:false,disabled:false,value:'',textContent:''});return elements.get(s);}},fetch:async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>({ok:true,remote:{revision:1,data:data[body.profileId]}})};}});
vm.runInContext(fs.readFileSync('sheets-cloud.js','utf8'),context);
(async()=>{
 await new Promise(setImmediate);
 assert.equal(requests[0].action,'read');assert.equal(requests[0].profileId,'yuchen');assert.equal('token' in requests[0],false);
 assert.match(elements.get('#cloudStatus').textContent,/已與試算表同步/);assert.equal(elements.get('#loginForm').hidden,true);assert.equal(elements.get('#trainingEditor').disabled,false);
 selected='youlun';bridge.onRender();await new Promise(setImmediate);
 assert.equal(requests[1].profileId,'youlun');assert.match(elements.get('#cloudIdentity').textContent,/張祐綸/);assert.equal(elements.get('#trainingEditor').disabled,false);
 assert.equal(bridge.canEdit(),true);
 console.log('Passed: automatic initial connection, no token in request, hidden login form and automatic profile switching.');
})().catch(error=>{console.error(error);process.exitCode=1;});
