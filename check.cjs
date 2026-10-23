// Data logic checks without modifying browser storage.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map();const el=()=>({value:'',innerHTML:'',textContent:'',dataset:{},addEventListener(){},classList:{toggle(){}},focus(){},showModal(){},close(){}});
const storage=new Map();
storage.set('daily-rep-v1',JSON.stringify({version:1,days:{'2026-10-19':[{name:'原始動作',sets:[{weight:10,reps:5}]}]}}));
const context=vm.createContext({console,Date,Blob,URL,setTimeout,alert(){},confirm(){return true;},localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);}},document:{querySelector(s){if(!elements.has(s))elements.set(s,el());return elements.get(s);},querySelectorAll(){return [];}}});
vm.runInContext(fs.readFileSync('app.js','utf8'),context);
function run(code){return vm.runInContext(code,context);}
assert.equal(run(`activeUser().name`),'我的紀錄');
assert.equal(run(`db.days['2026-10-19'][0].name`),'原始動作');
assert.ok(storage.has('daily-rep-v1'));
assert.equal(JSON.parse(storage.get('daily-rep-v2')).users[0].data.days['2026-10-19'][0].name,'原始動作');
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
run(`store.users.push({id:'brother',name:'弟弟',data:{version:1,days:{}}});switchUser('brother');`);
assert.equal(run(`entries().length`),0);
assert.equal(run(`past('臥推').length`),0);
assert.match(elements.get('#history').innerHTML,/第一筆紀錄/);
run(`db.days[date]=[{name:'臥推',sets:[{weight:5,reps:12}]}];save();switchUser('default');`);
assert.equal(run(`past('臥推')[0].sets[0].weight`),25);
assert.equal(run(`entries().length`),0);
run(`switchUser('brother');`);
assert.equal(run(`entries()[0].sets[0].weight`),5);
const saved=JSON.parse(storage.get('daily-rep-v2'));
assert.equal(saved.activeUserId,'brother');
assert.equal(saved.users[0].data.days['2026-10-22'][0].sets[0].weight,25);
assert.equal(saved.users[1].data.days['2026-10-23'][0].sets[0].weight,5);
assert.equal(run(`validStore(JSON.parse(localStorage.getItem(KEY)))`),true);
assert.equal(run(`validStore({version:2,activeUserId:'missing',users:store.users})`),false);
run(`$('#userName').value='弟弟';editingUser=false;$('#userForm').onsubmit({preventDefault(){}});`);
assert.equal(run(`store.users.length`),2);
run(`$('#userName').value='哥哥';editingUser=true;$('#userForm').onsubmit({preventDefault(){}});`);
assert.equal(run(`activeUser().name`),'哥哥');
async function checkImport(){
  await run(`$('#import').onchange({target:{files:[{size:100,text:async()=>JSON.stringify({version:1,days:{'2026-10-18':[{name:'匯入動作',sets:[{weight:7,reps:9}]}]}})}],value:'backup'}})`);
  assert.equal(run(`db.days['2026-10-18'][0].name`),'匯入動作');
  run(`switchUser('default');`);
  assert.equal(run(`past('臥推')[0].sets[0].weight`),25);
  assert.equal(run(`db.days['2026-10-18']`),undefined);
  // Reload from v2 must retain both profiles and their independent records.
  vm.runInContext(`(()=>{${fs.readFileSync('app.js','utf8')}\nif(store.users.length!==2||db.days['2026-10-22'][0].sets[0].weight!==25)throw Error('Reload failed');})()`,context);
  console.log('Passed: legacy migration, user switching, isolated history and statistics, persistence/reload, duplicate names, rename, and per-user import.');
}
checkImport().catch(error=>{console.error(error);process.exitCode=1;});
console.log('Passed: backup validation, invalid dates and inputs, volume, bodyweight sets, previous exercise matching, save and history rendering.');
