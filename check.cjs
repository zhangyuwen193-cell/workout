// Data logic checks without modifying browser storage.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map();const el=()=>({value:'',innerHTML:'',textContent:'',dataset:{},addEventListener(){},classList:{toggle(){}},focus(){},showModal(){},close(){}});
const context=vm.createContext({console,Date,Blob,URL,setTimeout,alert(){},confirm(){return true;},localStorage:{getItem(){return null;},setItem(){}},document:{querySelector(s){if(!elements.has(s))elements.set(s,el());return elements.get(s);},querySelectorAll(){return [];}}});
vm.runInContext(fs.readFileSync('app.js','utf8'),context);
function run(code){return vm.runInContext(code,context);}
assert.equal(run(`valid({version:1,days:{'2026-10-23':[{name:'臥推',sets:[{weight:20,reps:10}]}]}})`),true);
assert.equal(run(`valid({version:1,days:{'2026-02-30':[]}})`),false);
assert.equal(run(`valid({version:1,days:{'2026-10-23':[{name:'臥推',sets:[{weight:-2,reps:10}]}]}})`),false);
assert.equal(run(`valid({version:1,days:{'2026-10-23':[{name:'臥推',sets:[{weight:20,reps:2.5}]}]}})`),false);
assert.equal(run(`volume({sets:[{weight:20,reps:10},{weight:25,reps:8},{weight:30,reps:''}]})`),400);
assert.equal(run(`complete({weight:0,reps:10})`),true);
run(`db.days={'2026-10-20':[{name:'臥推',sets:[{weight:20,reps:10}]}],'2026-10-21':[{name:'深蹲',sets:[{weight:50,reps:8}]}],'2026-10-22':[{name:'臥推',sets:[{weight:25,reps:8}]}]};date='2026-10-23';`);
assert.equal(run(`past('臥推')[0].date`),'2026-10-22');
assert.equal(run(`past('臥推').length`),2);
run(`save();progress();`);
assert.match(elements.get('#saveStatus').textContent,/已自動儲存/);
console.log('Passed: backup validation, invalid dates and inputs, volume, bodyweight sets, previous exercise matching, save and history rendering.');
