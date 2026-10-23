// Cloud-independent revision checks. A stale device never silently replaces newer data.
(function(root){
  const clone=value=>JSON.parse(JSON.stringify(value));
  class WorkoutSyncEngine {
    constructor({pending=null,persist,apply,commit,status}){
      this.pending=pending;this.persist=persist;this.apply=apply;this.commit=commit;this.status=status;
      this.revision=0;this.ready=false;this.saving=false;this.conflict=false;this.closed=false;this.latest=null;
    }
    remember(){this.persist(this.pending?clone(this.pending):null);}
    receive(remote){
      if(this.closed)return;
      if(this.saving){this.latest=remote;return;}
      const revision=remote?.revision||0;
      if(this.ready&&revision<this.revision)return;
      this.revision=revision;this.ready=true;this.remote=remote;
      if(this.pending){
        if(remote&&JSON.stringify(remote.data)===JSON.stringify(this.pending.data)){
          this.pending=null;this.conflict=false;this.remember();this.apply(clone(remote.data));this.status('synced');return;
        }
        if(this.pending.baseRevision!==revision){this.conflict=true;this.status('conflict');return;}
        this.conflict=false;this.flush();return;
      }
      this.conflict=false;
      if(remote)this.apply(clone(remote.data));
      this.status(remote?'synced':'empty');
    }
    change(data){
      if(!this.ready||this.closed||this.conflict)throw Error('Sync is not ready');
      this.pending={baseRevision:this.pending?.baseRevision??this.revision,data:clone(data)};
      this.remember();this.status('pending');
    }
    async flush(){
      if(!this.ready||!this.pending||this.saving||this.conflict||this.closed)return;
      this.saving=true;this.status('saving');
      const sent=clone(this.pending);
      try{
        const result=await this.commit(sent);
        if(this.closed)return;
        if(result.conflict){this.saving=false;this.receive(result.remote);return;}
        this.revision=result.revision;
        if(JSON.stringify(this.pending?.data)===JSON.stringify(sent.data))this.pending=null;
        else if(this.pending)this.pending.baseRevision=result.revision;
        this.remember();this.status(this.pending?'pending':'synced');
      }catch(error){if(!this.closed)this.status('error',error);}
      finally{
        this.saving=false;
        if(!this.closed&&this.latest){const next=this.latest;this.latest=null;this.receive(next);}
      }
    }
    close(){this.closed=true;}
  }
  root.WorkoutSyncEngine=WorkoutSyncEngine;
  if(typeof module!=='undefined')module.exports=WorkoutSyncEngine;
})(typeof window==='undefined'?globalThis:window);
