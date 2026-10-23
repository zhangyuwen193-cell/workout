// 將此檔貼入專用 Google 試算表的「擴充功能 → Apps Script」。
var PEOPLE = {yuchen:'張語宸', youlun:'張祐綸'};
var SNAPSHOT_SHEET = '健身APP_同步資料';

function setup() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('請從專用試算表開啟 Apps Script 後執行 setup。');
  var props=PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID',ss.getId());
  Object.keys(PEOPLE).forEach(function(id){
    var key='TOKEN_'+id.toUpperCase();
    if(!props.getProperty(key))props.setProperty(key,(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  });
  ensureSheet_(ss,SNAPSHOT_SHEET,['快照ID','使用者ID','版本','片段','JSON資料','更新時間']);
  Object.keys(PEOPLE).forEach(function(id){
    ensureSheet_(ss,'健身APP_'+PEOPLE[id],['日期','動作','組數','重量(kg)','次數']);
    ensureSheet_(ss,'健身APP_'+PEOPLE[id]+'_課表',['星期','訓練內容']);
  });
}

function doGet(){return output_({ok:true,service:'健身APP 試算表同步',version:1});}
function doPost(e){
  var lock;
  try{
    var text=e&&e.postData&&e.postData.contents;
    if(!text||text.length>850000)return output_({ok:false,error:'invalid-request'});
    var input=JSON.parse(text),props=PropertiesService.getScriptProperties();
    if(!Object.prototype.hasOwnProperty.call(PEOPLE,input.profileId))return output_({ok:false,error:'unauthorized'});
    var expected=props.getProperty('TOKEN_'+input.profileId.toUpperCase());
    if(!expected||typeof input.token!=='string'||input.token!==expected)return output_({ok:false,error:'unauthorized'});
    if(['read','write'].indexOf(input.action)<0)return output_({ok:false,error:'invalid-request'});
    if(input.action==='write'&&(!Number.isInteger(input.baseRevision)||input.baseRevision<0||!validData_(input.data)))return output_({ok:false,error:'invalid-data'});
    lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))return output_({ok:false,error:'busy'});
    var ss=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    var sheet=ss.getSheetByName(SNAPSHOT_SHEET);
    if(!sheet)return output_({ok:false,error:'not-configured'});
    var remote=readSnapshot_(sheet,props,input.profileId);
    if(input.action==='read')return output_({ok:true,remote:remote});
    if((remote?remote.revision:0)!==input.baseRevision)return output_({ok:true,conflict:true,remote:remote});
    var payload=JSON.stringify(input.data);
    if(payload.length>790000)return output_({ok:false,error:'too-large'});
    var revision=input.baseRevision+1,snapshotId=Utilities.getUuid(),rows=[],now=new Date().toISOString();
    for(var i=0;i<payload.length;i+=30000)rows.push([snapshotId,input.profileId,revision,rows.length,'JSON:'+payload.slice(i,i+30000),now]);
    growRows_(sheet,sheet.getLastRow()+rows.length);
    sheet.getRange(sheet.getLastRow()+1,1,rows.length,6).setValues(rows);
    updateViews_(ss,input.profileId,input.data);
    SpreadsheetApp.flush();
    // Only publish the pointer after all chunks were written; abandoned chunks are ignored.
    props.setProperty('STATE_'+input.profileId,JSON.stringify({revision:revision,snapshotId:snapshotId,chunks:rows.length}));
    return output_({ok:true,revision:revision});
  }catch(error){return output_({ok:false,error:'server-error'});}
  finally{if(lock&&lock.hasLock())lock.releaseLock();}
}

function readSnapshot_(sheet,props,id){
  var raw=props.getProperty('STATE_'+id);if(!raw)return null;
  var state=JSON.parse(raw),rows=sheet.getDataRange().getValues().slice(1).filter(function(row){return row[0]===state.snapshotId&&row[1]===id;});
  rows.sort(function(a,b){return Number(a[3])-Number(b[3]);});
  if(rows.length!==state.chunks)throw new Error('Snapshot incomplete');
  var data=JSON.parse(rows.map(function(row){if(String(row[4]).slice(0,5)!=='JSON:')throw new Error('Invalid chunk');return String(row[4]).slice(5);}).join(''));
  if(!validData_(data))throw new Error('Invalid stored data');
  return {revision:state.revision,data:data};
}
function validData_(data){
  return !!data&&data.version===1&&data.days&&typeof data.days==='object'&&!Array.isArray(data.days)
    &&(data.weeklyPlan===undefined||(Array.isArray(data.weeklyPlan)&&data.weeklyPlan.length===7&&data.weeklyPlan.every(function(v){return typeof v==='string'&&v.trim().length>0&&v.length<=100;})))
    &&Object.keys(data.days).every(function(date){
      var parsed=new Date(date+'T12:00:00Z');
      return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&Array.isArray(data.days[date])&&data.days[date].every(function(ex){
        return ex&&typeof ex.name==='string'&&ex.name.trim().length>0&&ex.name.length<=60&&Array.isArray(ex.sets)&&ex.sets.every(function(set){return set&&['weight','reps'].every(function(key){var n=set[key];return n===''||(typeof n==='number'&&isFinite(n)&&n>=0&&n<=100000&&(key!=='reps'||Number.isInteger(n)));});});
      });
    });
}
function ensureSheet_(ss,name,headers){
  var sheet=ss.getSheetByName(name)||ss.insertSheet(name);
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}
  else if(JSON.stringify(sheet.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw new Error('Existing sheet has incompatible columns');
  return sheet;
}
function safeCell_(value){return typeof value==='string'&&/^[=+\-@]/.test(value)?"'"+value:value;}
function growRows_(sheet,count){if(sheet.getMaxRows()<count)sheet.insertRowsAfter(sheet.getMaxRows(),count-sheet.getMaxRows());}
function updateViews_(ss,id,data){
  var name=PEOPLE[id],rows=[];
  Object.keys(data.days).sort().forEach(function(date){data.days[date].forEach(function(ex){ex.sets.forEach(function(set,i){rows.push([date,safeCell_(ex.name),i+1,set.weight,set.reps]);});});});
  var sheet=ensureSheet_(ss,'健身APP_'+name,['日期','動作','組數','重量(kg)','次數']);
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,5).clearContent();
  if(rows.length){growRows_(sheet,rows.length+1);sheet.getRange(2,1,rows.length,5).setValues(rows);}
  var defaults=['背、二頭肌、前臂訓練','胸肌、肩膀、三頭肌訓練','大腿、小腿訓練','背、二頭肌、前臂訓練','休息','胸肌、肩膀、三頭肌訓練','花式跳繩'];
  var planSheet=ensureSheet_(ss,'健身APP_'+name+'_課表',['星期','訓練內容']);
  planSheet.getRange(2,1,7,2).setValues([1,2,3,4,5,6,0].map(function(day){return ['星期'+['日','一','二','三','四','五','六'][day],safeCell_((data.weeklyPlan||defaults)[day])];}));
}
function output_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
