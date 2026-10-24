const Engine=require('./sync-engine.js'),assert=require('node:assert/strict');
const clone=v=>JSON.parse(JSON.stringify(v));
const snapshot=()=>({version:1,days:{'2026-10-24':[{name:'臥推',sets:[{weight:20,reps:10}]}]}});
async function test(){
  let renders=0;
  const stable=new Engine({persist(){},apply(){renders++;},commit:async()=>({revision:2}),status(){}});
  const original=snapshot();stable.receive({revision:1,data:original});
  for(let i=0;i<10;i++)stable.receive({revision:1,data:clone(original)});
  assert.equal(renders,1,'Unchanged background polls must not rebuild form inputs');
  let saved,uploads=0;
  const conflict=new Engine({persist:v=>saved=v,apply(){},status(){},commit:async()=>{uploads++;return {revision:3};}});
  conflict.receive({revision:1,data:original});conflict.change({...original,note:'local'});
  conflict.receive({revision:2,data:{...original,note:'other device'}});
  assert.equal(conflict.conflict,true);
  // Reproduce adding twelve sets after conflict: editing must stay available locally.
  for(let i=0;i<12;i++){
    const next=clone(original);next.days['2026-10-24'][0].sets=Array.from({length:i+2},()=>({weight:20,reps:10}));
    conflict.change(next);await conflict.flush();
  }
  assert.equal(saved.data.days['2026-10-24'][0].sets.length,13);
  assert.equal(uploads,0,'Conflict must pause uploads, not overwrite remote');
  // A write can reach the server even when its response times out.
  let remote={revision:1,data:clone(original)},duringWrite,failOnce=true;
  const ambiguous=new Engine({persist:v=>saved=v,apply(){},status(){},commit:async change=>{
    remote={revision:change.baseRevision+1,data:clone(change.data)};
    if(failOnce){failOnce=false;duringWrite();throw Error('Response lost after server saved');}
    return {revision:remote.revision};
  }});
  ambiguous.receive(remote);ambiguous.change({...original,note:'first edit'});
  duringWrite=()=>ambiguous.change({...original,note:'newer edit during upload'});
  await ambiguous.flush();const pendingAfterTimeout=clone(saved);
  // Recover on a fresh engine, using the durable outbox.
  const recovered=new Engine({pending:pendingAfterTimeout,persist(){},apply(){},status(){},commit:async change=>{remote={revision:change.baseRevision+1,data:clone(change.data)};return {revision:remote.revision};}});
  recovered.receive(remote);await recovered.flush();await new Promise(setImmediate);
  assert.equal(recovered.conflict,false,'Own timed-out write must not be mistaken for another device');
  assert.equal(remote.data.note,'newer edit during upload');
  // Drain edits queued during a slow upload without waiting for the next 30-second poll.
  let release;const submitted=[];
  const slow=new Engine({persist(){},apply(){},status(){},commit:change=>{submitted.push(change);return new Promise(resolve=>{release=resolve;});}});
  slow.receive(null);slow.change({value:1});const first=slow.flush();slow.change({value:2});release({revision:1});await first;await new Promise(setImmediate);
  assert.equal(submitted.length,2);assert.equal(submitted[1].data.value,2);release({revision:2});await new Promise(setImmediate);
  assert.equal(slow.pending,null);
  console.log('Passed: unchanged polls preserve inputs, 12 further sets during conflict, no remote overwrite, timed-out own-write recovery and slow-upload queue drain.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
