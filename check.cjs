const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
function boot(initial={}){
 const storage=new Map(Object.entries(initial)),elements=new Map();
 const context=vm.createContext({Date,Blob,URL,setTimeout,alert(){},confirm:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{querySelector(s){if(!elements.has(s))elements.set(s,{value:'',innerHTML:'',textContent:'',addEventListener(t,f){this[t]=f;},focus(){},showModal(){},close(){}});return elements.get(s);},querySelectorAll:()=>[]}});
 vm.runInContext(source,context);return {storage,elements,run:code=>vm.runInContext(code,context)};
}
const data=w=>({version:1,days:{'2026-10-20':[{name:'臥推',sets:[{weight:w,reps:10}]}]}});
const old={version:2,activeUserId:'b',users:[{id:'a',name:'我的紀錄',data:data(20)},{id:'b',name:'弟弟',data:data(5)},{id:'c',name:'其他',data:data(40)}]};
const {run,storage,elements}=boot({'daily-rep-v2':JSON.stringify(old)});
assert.equal(run('store.users.length'),2);assert.equal(run('store.users[0].name'),'張語宸');assert.equal(run('activeUser().name'),'張祐綸');
assert.equal(run('past("臥推","2026-10-23")[0].sets[0].weight'),5);
assert.equal(run('store.archivedUsers[0].data.days["2026-10-20"][0].sets[0].weight'),40);
assert.equal(storage.get('daily-rep-v2'),JSON.stringify(old));
assert.match(elements.get('#userChoices').innerHTML,/aria-pressed="true"/);
assert.match(elements.get('#currentUser').textContent,/張祐綸/);
run(`$('#userChoices').click({target:{closest:()=>({dataset:{userId:'yuchen'}})}});date='2026-10-23';`);
assert.equal(run('activeUser().name'),'張語宸');assert.equal(run('past("臥推")[0].sets[0].weight'),20);
run(`$('#editPlan').onclick();plan.forEach((p,d)=>$('#planDay'+d).value=d===5?'游泳':p[1]);$('#planForm').onsubmit({preventDefault(){}});`);
assert.equal(run('weeklyPlan()[5]'),'游泳');assert.match(elements.get('#dayBanner').innerHTML,/游泳/);
run(`switchUser('youlun')`);assert.equal(run('weeklyPlan()[5]'),'胸肌、肩膀、三頭肌訓練');
run(`switchUser('invalid')`);assert.equal(run('activeUser().name'),'張祐綸');
const reload=boot(Object.fromEntries(storage));assert.equal(reload.run('activeUser().name'),'張祐綸');assert.equal(reload.run('store.users[0].data.weeklyPlan[5]'),'游泳');assert.equal(reload.run('store.archivedUsers.length'),1);
const exact=boot({'daily-rep-v2':JSON.stringify({...old,users:[{...old.users[1],name:'張祐綸'},{...old.users[0],name:'張語宸'}]})});assert.equal(exact.run('store.users[0].data.days["2026-10-20"][0].sets[0].weight'),20);
const v1=boot({'daily-rep-v1':JSON.stringify(data(12))});assert.equal(v1.run('store.users[0].data.days["2026-10-20"][0].sets[0].weight'),12);assert.equal(v1.run('Object.keys(store.users[1].data.days).length'),0);
assert.equal(run(`valid({version:1,days:{'2026-02-30':[]}})`),false);assert.equal(run(`valid({version:1,days:{},weeklyPlan:['bad']})`),false);
assert.equal(run(`volume({sets:[{weight:20,reps:10},{weight:25,reps:8},{weight:30,reps:''}]})`),400);
assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/id="(?:addUser|deleteUser|renameUser|userDialog|userSelect)"/);
(async()=>{await run(`$('#import').onchange({target:{files:[{size:100,text:async()=>JSON.stringify({version:1,days:{'2026-10-18':[{name:'匯入動作',sets:[{weight:7,reps:9}]}]}})}],value:'backup'}})`);assert.equal(run(`db.days['2026-10-18'][0].name`),'匯入動作');run(`switchUser('yuchen')`);assert.equal(run(`past('臥推')[0].sets[0].weight`),20);assert.equal(run('weeklyPlan()[5]'),'游泳');console.log('Passed: fixed users, selection, legacy migration, name matching, archives, separate history/plans/import, reload, and validation.');})().catch(e=>{console.error(e);process.exitCode=1;});
