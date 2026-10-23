(function(){
  const endpoint=window.WORKOUT_APPS_SCRIPT_URL;
  if(!endpoint)return;
  const bridge=window.workoutBridge,$=s=>document.querySelector(s);
  const message=text=>$('#cloudStatus').textContent=text;
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)){message('Apps Script 網址格式不正確，請填入部署的 /exec 網址。');return;}
  let engine=null,profile=null,token='',generation=0,polling=false,timer=null,blocked=true,lastData='',statusText='請選自己的姓名，輸入個人同步碼以連接試算表。';
  $('#cloudLogin').hidden=false;$('#loginButton').disabled=false;$('#loginEmail').required=false;$('#loginEmail').parentElement.hidden=true;
  $('#loginPassword').parentElement.firstChild.textContent='個人同步碼';$('#loginPassword').autocomplete='off';
  $('#loginButton').textContent='連接試算表';
  function paint(){
    const editable=!blocked&&profile===bridge.profileId()&&engine?.ready&&!engine.conflict;
    $('#trainingEditor').disabled=!editable;$('#editPlan').disabled=!editable;$('#import').disabled=!editable;
    $('#cloudConflict').hidden=!engine?.conflict;
    message(profile&&profile!==bridge.profileId()?'已切換姓名，請先中斷連線，再輸入此人的同步碼。':statusText);
  }
  function status(text){statusText=text;paint();}
  function readError(error){
    if(error.code==='unauthorized')return '同步碼不正確，請確認姓名及專屬同步碼。';
    if(error.code==='too-large')return '資料超過單份同步容量，請先匯出備份。';
    if(error.code==='busy')return '試算表忙碌中，稍後會重試。';
    if(error.code==='server-error'||error.code==='not-configured')return 'Apps Script 尚未正確設定，請確認已執行 setup 並重新部署。';
    return '未能確認試算表回應，尚未同步。本機紀錄保留，請檢查網路、部署權限或重新連線。';
  }
  async function request(action,id,secret,extra={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,profileId:id,token:secret,...extra}),signal:controller.signal});
      if(!response.ok)throw Error('HTTP failure');
      const result=await response.json();if(!result.ok)throw Object.assign(Error('Request failed'),{code:result.error});
      if(result.remote&&(!Number.isInteger(result.remote.revision)||result.remote.revision<1||!bridge.valid(result.remote.data)))throw Error('Invalid server data');
      if(action==='write'&&!result.conflict&&result.revision!==extra.baseRevision+1)throw Error('Invalid revision');
      return result;
    }finally{clearTimeout(timeout);}
  }
  bridge.canEdit=()=>!blocked&&profile===bridge.profileId()&&engine?.ready&&!engine.conflict;
  bridge.onRender=paint;
  bridge.onSaved=()=>{
    if(!bridge.canEdit())return;
    const serialized=JSON.stringify(bridge.read());if(serialized===lastData)return;lastData=serialized;
    try{engine.change(bridge.read());clearTimeout(timer);timer=setTimeout(()=>engine?.flush(),1000);}
    catch{blocked=true;status('本機已儲存，但上傳佇列儲存失敗，請先匯出備份。');}
  };
  async function poll(){
    if(!engine||polling||document.hidden||!navigator.onLine)return;
    const current=engine,id=profile,secret=token,run=generation;polling=true;
    try{const response=await request('read',id,secret);if(run!==generation)return;current.receive(response.remote||null);if(current.pending)await current.flush();}
    catch(error){if(run===generation)status(readError(error));}
    finally{polling=false;}
  }
  $('#loginForm').onsubmit=async event=>{
    event.preventDefault();const run=++generation,id=bridge.profileId(),secret=$('#loginPassword').value.trim();
    engine?.close();engine=null;profile=null;blocked=true;$('#loginButton').disabled=true;status('正在連接試算表…');
    try{
      const first=await request('read',id,secret);if(run!==generation)return;
      bridge.select(id);
      const name=bridge.name(),namespace=endpoint.split('/s/')[1].split('/')[0];
      profile=id;token=secret;
      const backupKey=`workout-sheets-backup-${namespace}-${id}`,outboxKey=`workout-sheets-outbox-${namespace}-${id}`;
      if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify({...bridge.readFor(id),userName:name}));
      $('#beforeSyncBackup').hidden=false;
      $('#beforeSyncBackup').onclick=()=>{const url=URL.createObjectURL(new Blob([localStorage.getItem(backupKey)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`健身APP-${name}-同步前備份.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
      const raw=localStorage.getItem(outboxKey),pending=raw?JSON.parse(raw):null;
      if(pending&&(!bridge.valid(pending.data)||!Number.isInteger(pending.baseRevision)||pending.baseRevision<0))throw Error('Invalid outbox');
      engine=new window.WorkoutSyncEngine({pending,
        persist:value=>{if(value)localStorage.setItem(outboxKey,JSON.stringify(value));else localStorage.removeItem(outboxKey);},
        apply:data=>{if(run===generation){lastData=JSON.stringify(data);bridge.replace(id,data);}},
        commit:change=>request('write',id,secret,change),
        status:(state,error)=>{if(run!==generation)return;const messages={synced:'✓ 已與試算表同步 · 開啟頁面時每 30 秒檢查其他裝置更新',empty:'準備上傳此人的本機紀錄…',pending:'本機已儲存 · 等待上傳試算表',saving:'正在同步到試算表…',conflict:'另一台裝置有不同修改，請先備份，再選擇版本。',error:readError(error||{})};status(messages[state]);}
      });
      lastData=JSON.stringify(bridge.readFor(id));if(pending)bridge.replace(id,pending.data);
      blocked=false;$('#cloudIdentity').textContent=`已連接：${name}`;$('#logoutButton').hidden=false;$('#logoutButton').textContent='中斷連線';$('#loginForm').hidden=true;$('#loginPassword').value='';
      engine.receive(first.remote||null);
      if(!first.remote&&!engine.pending){engine.change(bridge.readFor(id));await engine.flush();}
      paint();
    }catch(error){if(run===generation){blocked=true;status(readError(error));}}
    finally{$('#loginButton').disabled=false;}
  };
  $('#logoutButton').onclick=()=>{
    if(engine?.pending&&!confirm('尚有未同步的修改，已保存在本機。確定中斷連線？'))return;
    ++generation;engine?.close();engine=null;profile=null;token='';blocked=true;clearTimeout(timer);
    $('#loginForm').hidden=false;$('#logoutButton').hidden=true;$('#cloudIdentity').textContent='';$('#beforeSyncBackup').hidden=true;status('已中斷連線。請選姓名後輸入對應的個人同步碼。');
  };
  $('#retrySync').onclick=poll;
  $('#useCloud').onclick=()=>{if(!engine?.conflict||!engine.remote||!confirm('確定使用試算表版本取代本機修改？請先匯出備份。'))return;const remote=engine.remote;engine.pending=null;engine.persist(null);engine.receive(remote);};
  $('#useLocal').onclick=()=>{if(!engine?.conflict||!confirm('確定以此裝置的本機版本取代試算表資料？其他裝置將接收此版本。'))return;engine.pending.baseRevision=engine.revision;engine.conflict=false;engine.remember();engine.flush();paint();};
  $('#useCloud').textContent='使用試算表版本';$('#useLocal').textContent='以本機版本取代試算表';
  window.addEventListener('online',poll);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});setInterval(poll,30000);paint();
})();
