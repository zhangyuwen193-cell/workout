(function(){
  const endpoint=window.WORKOUT_APPS_SCRIPT_URL;
  if(!endpoint)return;
  const bridge=window.workoutBridge,$=s=>document.querySelector(s);
  const message=text=>$('#cloudStatus').textContent=text;
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)){message('Apps Script 網址格式不正確，請填入部署的 /exec 網址。');return;}
  let engine=null,profile=null,connectingId=null,generation=0,polling=false,timer=null,blocked=true,lastData='',syncWarning=false,statusText='正在自動連接試算表…';
  $('#cloudLogin').hidden=false;$('#loginForm').hidden=true;$('#logoutButton').hidden=true;
  function paint(){
    const editable=!blocked&&profile===bridge.profileId()&&engine?.ready;
    $('#trainingEditor').disabled=!editable;$('#editPlan').disabled=!editable;$('#import').disabled=!editable;
    $('#cloudConflict').hidden=!engine?.conflict;
    $('#syncEditNotice').hidden=!(profile===bridge.profileId()&&engine?.pending&&(engine.conflict||syncWarning));
    $('#syncEditText').textContent=engine?.conflict?'雲端版本有差異，上傳暫停；你仍可繼續新增組數與記錄，資料會保存在本機。':'尚有紀錄等待同步；你仍可繼續訓練，資料已保存在本機。';
    message(statusText);
  }
  function status(text){statusText=text;paint();}
  function readError(error){
    if(error.code==='unauthorized')return 'Apps Script 仍是舊版，請貼上新版 Code.gs 並重新部署「新版本」，才能免同步碼連線。';
    if(error.code==='too-large')return '資料超過單份同步容量，請先匯出備份。';
    if(error.code==='busy')return '試算表忙碌中，稍後會重試。';
    if(error.code==='server-error'||error.code==='not-configured')return 'Apps Script 尚未正確設定，請確認已執行 setup 並重新部署。';
    return '未能確認試算表回應，尚未同步。本機紀錄保留，請檢查網路、部署權限或重新連線。';
  }
  async function request(action,id,extra={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,profileId:id,...extra}),signal:controller.signal});
      if(!response.ok)throw Error('HTTP failure');
      const result=await response.json();if(!result.ok)throw Object.assign(Error('Request failed'),{code:result.error});
      if(result.remote&&(!Number.isInteger(result.remote.revision)||result.remote.revision<1||!bridge.valid(result.remote.data)))throw Error('Invalid server data');
      if(action==='write'&&!result.conflict&&result.revision!==extra.baseRevision+1)throw Error('Invalid revision');
      return result;
    }finally{clearTimeout(timeout);}
  }
  bridge.canEdit=()=>!blocked&&profile===bridge.profileId()&&engine?.ready;
  bridge.onRender=()=>{paint();if(profile!==bridge.profileId()&&connectingId!==bridge.profileId()){connectingId=bridge.profileId();queueMicrotask(connect);}};
  bridge.onSaved=()=>{
    if(!bridge.canEdit())return;
    const serialized=JSON.stringify(bridge.read());if(serialized===lastData)return;lastData=serialized;
    try{engine.change(bridge.read());clearTimeout(timer);timer=setTimeout(()=>engine?.flush(),1000);}
    catch{blocked=true;status('本機已儲存，但上傳佇列儲存失敗，請先匯出備份。');}
  };
  async function poll(){
    if(!engine){if(connectingId===null)connect();return;}if(polling||document.hidden||!navigator.onLine)return;
    const current=engine,id=profile,run=generation;polling=true;
    try{const response=await request('read',id);if(run!==generation)return;current.receive(response.remote||null);if(current.pending)await current.flush();}
    catch(error){if(run===generation)status(readError(error));}
    finally{polling=false;}
  }
  async function connect(){
    const run=++generation,id=bridge.profileId();connectingId=id;
    engine?.close();engine=null;profile=null;blocked=true;clearTimeout(timer);status('正在連接試算表…');
    try{
      const first=await request('read',id);if(run!==generation||id!==bridge.profileId())return;
      const name=bridge.name(),namespace=endpoint.split('/s/')[1].split('/')[0];
      profile=id;
      const backupKey=`workout-sheets-backup-${namespace}-${id}`,outboxKey=`workout-sheets-outbox-${namespace}-${id}`;
      if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify({...bridge.readFor(id),userName:name}));
      $('#beforeSyncBackup').hidden=false;
      $('#beforeSyncBackup').onclick=()=>{const url=URL.createObjectURL(new Blob([localStorage.getItem(backupKey)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`健身APP-${name}-同步前備份.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
      const raw=localStorage.getItem(outboxKey);let pending=raw?JSON.parse(raw):null;
      const local=bridge.readFor(id),missing=first.remote?Object.keys(local.days).filter(d=>!Object.prototype.hasOwnProperty.call(first.remote.data.days,d)&&local.days[d].length):[];
      if(!pending&&missing.length){
        localStorage.setItem('workout-sheets-recovery-'+namespace+'-'+id+'-'+Date.now(),JSON.stringify({...local,userName:name}));
        pending={baseRevision:Math.max(0,first.remote.revision-1),data:local};localStorage.setItem(outboxKey,JSON.stringify(pending));
      }
      if(pending&&(!bridge.valid(pending.data)||!Number.isInteger(pending.baseRevision)||pending.baseRevision<0))throw Error('Invalid outbox');
      engine=new window.WorkoutSyncEngine({pending,
        persist:value=>{if(value)localStorage.setItem(outboxKey,JSON.stringify(value));else localStorage.removeItem(outboxKey);},
        apply:data=>{if(run===generation){lastData=JSON.stringify(data);bridge.replace(id,data);}},
        commit:change=>request('write',id,change),
        status:(state,error)=>{if(run!==generation)return;syncWarning=state==='error'||state==='conflict';const messages={synced:'✓ 已與試算表同步 · 開啟頁面時每 30 秒檢查其他裝置更新',empty:'準備上傳此人的本機紀錄…',pending:'本機已儲存 · 等待上傳試算表',saving:'正在同步到試算表…',conflict:'雲端版本有差異，上傳暫停；仍可繼續記錄，請先備份再選擇版本。',error:readError(error||{})};status(messages[state]);}
      });
      lastData=JSON.stringify(bridge.readFor(id));if(pending)bridge.replace(id,pending.data);
      blocked=false;$('#cloudIdentity').textContent=`已連接：${name}`;$('#logoutButton').hidden=true;$('#loginForm').hidden=true;$('#loginPassword').value='';
      engine.receive(first.remote||null);
      if(!first.remote&&!engine.pending){engine.change(bridge.readFor(id));await engine.flush();}
      paint();
    }catch(error){if(run===generation){blocked=true;status(readError(error));}}
    finally{if(run===generation)connectingId=null;}
  };
  $('#retrySync').onclick=poll;
  $('#useCloud').onclick=()=>{if(!engine?.conflict||!engine.remote||!confirm('確定使用試算表版本取代本機修改？請先匯出備份。'))return;const remote=engine.remote;engine.pending=null;engine.persist(null);engine.receive(remote);};
  $('#useLocal').onclick=()=>{if(!engine?.conflict||!confirm('確定以此裝置的本機版本取代試算表資料？其他裝置將接收此版本。'))return;engine.pending.baseRevision=engine.revision;engine.conflict=false;engine.remember();engine.flush();paint();};
  $('#recoverDates').onclick=()=>{
    if(!engine?.pending||!engine.remote)return;
    const local=engine.pending.data,remote=engine.remote.data,missing=Object.keys(local.days).filter(d=>!Object.prototype.hasOwnProperty.call(remote.days,d)&&local.days[d].length);
    if(!missing.length){alert('沒有雲端缺少的日期。若同一天內容不同，請先匯出備份再選擇版本。');return;}
    if(!confirm('將補上 '+missing.join('、')+' 的本機紀錄，雲端已有日期不會更動。確定繼續？'))return;
    const merged=JSON.parse(JSON.stringify(remote));missing.forEach(d=>merged.days[d]=JSON.parse(JSON.stringify(local.days[d])));
    localStorage.setItem('workout-recovery-before-merge-'+Date.now(),JSON.stringify({...local,userName:bridge.name()}));
    engine.pending={baseRevision:engine.revision,data:merged};engine.conflict=false;engine.remember();lastData=JSON.stringify(merged);bridge.replace(profile,merged);engine.flush();paint();
  };
  $('#useCloud').textContent='使用試算表版本';$('#useLocal').textContent='以本機版本取代試算表';
  window.addEventListener('online',poll);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});setInterval(poll,30000);connect();
})();
