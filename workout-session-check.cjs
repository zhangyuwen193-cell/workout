// Exercise the actual app event handlers with a controlled, isolated cloud service.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const clone=v=>JSON.parse(JSON.stringify(v)),elements=new Map(),storage=new Map(),timers=new Map();let timerId=0,poll;
class Element{
  constructor(){this.value='';this.hidden=false;this.disabled=false;this.textContent='';this._html='';this.renders=0;this.classList={toggle(){}};}
  set innerHTML(value){this._html=value;this.renders++;}
  get innerHTML(){return this._html;}
  addEventListener(type,fn){this[type]=fn;}
  showModal(){}close(){}focus(){}
}
const $=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s);};
const remote={revision:1,data:{version:1,days:{}}};
const window={WORKOUT_APPS_SCRIPT_URL:'https://script.google.com/macros/s/session-test/exec',addEventListener(){}};
const context=vm.createContext({window,console,Date,URL,Blob,queueMicrotask,AbortController,navigator:{onLine:true},alert:message=>{throw Error(message);},confirm:()=>true,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{hidden:false,addEventListener(){},querySelector:$,querySelectorAll:()=>[]},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{poll=fn;},fetch:async(_url,options)=>{
 const body=JSON.parse(options.body);
 if(body.action==='read')return {ok:true,json:async()=>({ok:true,remote:clone(remote)})};
 if(body.baseRevision!==remote.revision)return {ok:true,json:async()=>({ok:true,conflict:true,remote:clone(remote)})};
 remote.revision++;remote.data=clone(body.data);return {ok:true,json:async()=>({ok:true,revision:remote.revision})};
}});
for(const file of ['sync-engine.js','app.js','sheets-cloud.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const run=code=>vm.runInContext(code,context),settle=()=>new Promise(setImmediate);
function clickAction(action){$('#exercises').click({target:{closest:()=>({dataset:{action,i:'0'}})}});}
function typeSet(index,key,value){$('#exercises').input({target:{dataset:{i:'0',j:String(index),key},value:String(value),validity:{valid:true}}});}
async function flushDebounce(){const jobs=[...timers.entries()].filter(([,job])=>job.ms===1000);for(const [id,job]of jobs){timers.delete(id);await job.fn();}await settle();}
(async()=>{
 await settle();assert.equal($('#trainingEditor').disabled,false);
 $('#exerciseName').value='測試臥推';$('#exerciseForm').onsubmit({preventDefault(){}});
 for(let i=0;i<24;i++){if(i)clickAction('addSet');typeSet(i,'weight',20+i*.25);typeSet(i,'reps',10);if(i%3===2)await flushDebounce();}
 await flushDebounce();assert.equal(remote.data.days[$('#date').value][0].sets.length,24);
 assert.equal($('#trainingEditor').disabled,false);
 run('openExercise(0)');$('#exerciseName').value='修正後臥推';$('#exerciseForm').onsubmit({preventDefault(){}});await flushDebounce();
 assert.equal(remote.data.days[$('#date').value][0].name,'修正後臥推');assert.equal(remote.data.days[$('#date').value][0].sets.length,24);
 run('openExercise()');assert.match($('#savedExercise').innerHTML,/修正後臥推/);$('#savedExercise').onchange({target:{value:'修正後臥推'}});assert.equal($('#exerciseName').value,'修正後臥推');
 const renders=$('#exercises').renders;for(let i=0;i<5;i++)await poll();assert.equal($('#exercises').renders,renders);
 // Introduce a genuine second-device edit while there are unsent local changes.
 clickAction('addSet');typeSet(24,'weight',30);typeSet(24,'reps',8);
 remote.revision++;remote.data.days['2026-01-01']=[];await poll();
 assert.equal($('#cloudConflict').hidden,false);assert.equal($('#syncEditNotice').hidden,false);
 assert.equal($('#trainingEditor').disabled,false);
 for(let i=25;i<37;i++){clickAction('addSet');typeSet(i,'weight',32);typeSet(i,'reps',8);}
 await flushDebounce();assert.equal(run('entries()[0].sets.length'),37);
 const pendingKey=[...storage.keys()].find(k=>k.startsWith('workout-sheets-outbox-'));
 assert.equal(JSON.parse(storage.get(pendingKey)).data.days[$('#date').value][0].sets.length,37);
 assert.equal(remote.data.days[$('#date').value][0].sets.length,24,'Remote must remain protected during conflict');
 console.log('Passed: actual handlers record 24 sets across repeated uploads and polls; 12 more sets remain editable and durable during a real version conflict.');
})().catch(error=>{console.error(error);process.exitCode=1;});
