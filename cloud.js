(async function(){
  const config=window.WORKOUT_FIREBASE_CONFIG, bridge=window.workoutBridge;
  const $=s=>document.querySelector(s);
  const message=text=>$('#cloudStatus').textContent=text;
  if(!config){message('本機模式 · 尚未設定雲端同步');return;}
  $('#cloudLogin').hidden=false;
  let engine=null,auth,fire,api,unsubscribe=null,profile=null,generation=0,timer=null,blocked=true,lastData='',latestRemote=null;
  function paint(){
    const editable=!blocked&&profile===bridge.profileId()&&engine?.ready&&!engine.conflict;
    $('#trainingEditor').disabled=!editable;
    $('#editPlan').disabled=!editable;
    $('#import').disabled=!editable;
    $('#loginButton').disabled=!auth;
    $('#cloudConflict').hidden=!engine?.conflict;
    if(profile&&profile!==bridge.profileId())message('目前登入身分與所選姓名不同，請切回自己的姓名或登出後換人登入。');
  }
  bridge.canEdit=()=>!blocked&&profile===bridge.profileId()&&engine?.ready&&!engine.conflict;
  bridge.onRender=paint;
  bridge.onSaved=()=>{
    if(!bridge.canEdit())return;
    const serialized=JSON.stringify(bridge.read());
    if(serialized===lastData)return;
    lastData=serialized;
    try{engine.change(bridge.read());clearTimeout(timer);timer=setTimeout(()=>engine?.flush(),800);}
    catch{message('已保留本機紀錄，但無法排入雲端上傳；請匯出備份。');blocked=true;paint();}
  };
  paint();message('正在載入雲端登入服務…');
  try{
    const [appSDK,authSDK,fireSDK]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
    ]);
    api={...authSDK,...fireSDK};const app=appSDK.initializeApp(config);auth=api.getAuth(app);fire=api.getFirestore(app);
  }catch{message('無法載入雲端服務。資料仍保存在此瀏覽器，請檢查網路與 Firebase 設定後重新整理。');return;}
  function errorText(error){
    if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(error.code))return '登入失敗，請確認 Email 與密碼。';
    if(error.code==='auth/too-many-requests')return '嘗試次數過多，請稍後再試。';
    if(error.code==='permission-denied')return '無權讀寫雲端紀錄，請確認帳號身分綁定與資料庫規則。';
    return '雲端連線失敗，本機紀錄仍保留。請確認網路與專案設定後重試。';
  }
  function decode(snapshot){
    if(!snapshot.exists())return null;
    const value=snapshot.data(),data=JSON.parse(value.payload);
    if(!Number.isInteger(value.revision)||value.revision<1||!bridge.valid(data))throw Error('Invalid cloud data');
    return {revision:value.revision,data};
  }
  function download(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('#loginForm').onsubmit=async event=>{
    event.preventDefault();$('#loginButton').disabled=true;message('登入中…');
    try{await api.signInWithEmailAndPassword(auth,$('#loginEmail').value.trim(),$('#loginPassword').value);$('#loginPassword').value='';}
    catch(error){message(errorText(error));}finally{$('#loginButton').disabled=false;}
  };
  $('#logoutButton').onclick=async()=>{if(engine?.pending&&!confirm('此裝置還有未同步的修改，已保存在本機。確定先登出？'))return;try{await api.signOut(auth);}catch(error){message(errorText(error));}};
  $('#retrySync').onclick=()=>engine?.flush();
  $('#useCloud').onclick=()=>{
    if(!engine?.conflict||!engine.remote)return;
    if(!confirm('使用雲端版本會取代目前顯示的本機修改。請先匯出備份。確定繼續？'))return;
    const remote=engine.remote;engine.pending=null;engine.persist(null);engine.receive(remote);paint();
  };
  $('#useLocal').onclick=()=>{
    if(!engine?.conflict)return;
    if(!confirm('確定以上方可見的本機紀錄取代目前雲端版本？其他裝置將收到此版本。'))return;
    engine.pending.baseRevision=engine.revision;engine.conflict=false;engine.remember();engine.flush();paint();
  };
  api.onAuthStateChanged(auth,async user=>{
    const token=++generation;engine?.close();engine=null;unsubscribe?.();unsubscribe=null;clearTimeout(timer);profile=null;latestRemote=null;blocked=true;paint();
    $('#logoutButton').hidden=!user;$('#loginForm').hidden=!!user;$('#cloudIdentity').textContent='';$('#beforeSyncBackup').hidden=true;
    if(!user){message('請用自己的 Email／密碼登入，以啟用跨裝置同步。');return;}
    message('正在確認登入身分與讀取雲端紀錄…');
    try{
      const member=await api.getDoc(api.doc(fire,'members',user.uid));if(token!==generation)return;
      const id=member.data()?.profileId;
      if(!member.exists()||!['yuchen','youlun'].includes(id))throw {code:'permission-denied'};
      profile=id;bridge.select(id);
      const name=bridge.name();$('#cloudIdentity').textContent=`已登入：${name}`;
      const backupKey=`workout-before-cloud-${user.uid}`,outboxKey=`workout-outbox-${user.uid}-${config.projectId}`;
      // Preserve pre-cloud records once; never replace this backup when another device signs in.
      if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify({...bridge.read(),userName:name}));
      $('#beforeSyncBackup').hidden=false;
      $('#beforeSyncBackup').onclick=()=>download(JSON.parse(localStorage.getItem(backupKey)),`健身APP-${name}-同步前備份.json`);
      const raw=localStorage.getItem(outboxKey),pending=raw?JSON.parse(raw):null;
      if(pending&&(!bridge.valid(pending.data)||!Number.isInteger(pending.baseRevision)||pending.baseRevision<0))throw Error('Invalid outbox');
      const reference=api.doc(fire,'profiles',id);
      engine=new window.WorkoutSyncEngine({pending,
        persist:value=>{if(value)localStorage.setItem(outboxKey,JSON.stringify(value));else localStorage.removeItem(outboxKey);},
        apply:data=>{if(token!==generation)return;lastData=JSON.stringify(data);bridge.replace(id,data);},
        commit:change=>api.runTransaction(fire,async transaction=>{
          const snapshot=await transaction.get(reference),remote=decode(snapshot);
          if((remote?.revision||0)!==change.baseRevision)return {conflict:true,remote};
          const revision=change.baseRevision+1,payload=JSON.stringify(change.data);
          if(new TextEncoder().encode(payload).length>=790000)throw Error('Data too large');
          transaction.set(reference,{revision,payload,updatedAt:api.serverTimestamp()});return {revision};
        }),
        status:(state,error)=>{
          if(token!==generation)return;
          const messages={synced:'✓ 已與雲端同步',empty:'準備上傳此使用者的本機紀錄…',pending:'本機已儲存 · 等待上傳',saving:'正在同步…',conflict:'另一台裝置有不同修改。兩份資料皆保留，請選擇要使用的版本。',error:errorText(error||{})};
          message(messages[state]);paint();
        }
      });
      lastData=JSON.stringify(bridge.read());
      if(pending)bridge.replace(id,pending.data);
      const currentEngine=engine;
      unsubscribe=api.onSnapshot(reference,{includeMetadataChanges:true},snapshot=>{
        if(token!==generation||currentEngine.closed||snapshot.metadata.fromCache)return;
        try{
          latestRemote=decode(snapshot);blocked=false;currentEngine.receive(latestRemote);
          if(!latestRemote&&!currentEngine.pending&&currentEngine.revision===0){currentEngine.change(bridge.readFor(id));currentEngine.flush();}
          paint();
        }catch{blocked=true;message('雲端資料格式或本機儲存發生錯誤，已暫停同步，請保留備份。');paint();}
      },error=>{if(token===generation){blocked=true;message(errorText(error));paint();}});
    }catch(error){if(token===generation){blocked=true;message(errorText(error));paint();}}
  });
  const retry=()=>{if(navigator.onLine&&engine?.pending)engine.flush();};
  window.addEventListener('online',retry);window.addEventListener('focus',retry);setInterval(retry,30000);
})();
