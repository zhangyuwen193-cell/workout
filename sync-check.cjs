const Engine=require('./sync-engine.js'),assert=require('node:assert/strict');
const copy=v=>JSON.parse(JSON.stringify(v));
function client(server,pending=null){
  const state={saved:null,applied:null,status:''};
  const engine=new Engine({pending,persist:p=>state.saved=p,apply:d=>state.applied=d,status:s=>state.status=s,
    commit:async change=>{
      if(server.fail)throw Error('offline');
      if((server.remote?.revision||0)!==change.baseRevision)return {conflict:true,remote:copy(server.remote)};
      server.remote={revision:change.baseRevision+1,data:copy(change.data)};return {revision:server.remote.revision};
    }});
  return {engine,state};
}
async function test(){
  const server={remote:null},a=client(server);
  a.engine.receive(null);a.engine.change({days:{a:1}});await a.engine.flush();
  assert.equal(server.remote.revision,1);assert.equal(a.state.status,'synced');assert.equal(a.engine.pending,null);
  const b=client(server);b.engine.receive(copy(server.remote));assert.deepEqual(b.state.applied,{days:{a:1}});
  a.engine.change({days:{a:2}});await a.engine.flush();
  b.engine.change({days:{a:3}});await b.engine.flush();
  assert.equal(b.engine.conflict,true);assert.equal(server.remote.data.days.a,2);assert.equal(b.engine.pending.data.days.a,3);
  assert.equal(b.engine.remote.data.days.a,2);
  b.engine.pending.baseRevision=b.engine.revision;b.engine.conflict=false;await b.engine.flush();assert.equal(server.remote.data.days.a,3);
  const offline=client(server);offline.engine.receive(copy(server.remote));offline.engine.change({days:{b:4}});server.fail=true;await offline.engine.flush();
  assert.equal(offline.state.status,'error');assert.ok(offline.state.saved);
  const outbox=copy(offline.state.saved);server.fail=false;
  const resumed=client(server,outbox);resumed.engine.receive(copy(server.remote));await resumed.engine.flush();
  // receive already starts flushing; wait for its async acknowledgement.
  await Promise.resolve();assert.equal(server.remote.data.days.b,4);
  const ack=client(server,{baseRevision:server.remote.revision-1,data:copy(server.remote.data)});ack.engine.receive(copy(server.remote));assert.equal(ack.engine.pending,null);
  const stopped=client(server);stopped.engine.receive(copy(server.remote));stopped.engine.close();stopped.engine.receive({revision:100,data:{}});assert.notEqual(stopped.engine.revision,100);
  let finish;const inFlight=new Engine({persist(){},apply(){},status(){},commit:()=>new Promise(resolve=>finish=resolve)});
  inFlight.receive(null);inFlight.change({value:1});const first=inFlight.flush();inFlight.change({value:2});finish({revision:1});await first;
  assert.equal(inFlight.pending.data.value,2);assert.equal(inFlight.pending.baseRevision,1);
  console.log('Passed: cloud initial upload/download, stale-write protection, conflict resolution, offline outbox/retry, reload acknowledgement, closed session and edits during upload.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
