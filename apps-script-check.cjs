const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const values=new Map(),sheets=new Map();let uuid=0,failPointer=false;
class Sheet{
  constructor(){this.rows=[];this.maxRows=1000;}
  getLastRow(){let n=this.rows.length;while(n&&!(this.rows[n-1]||[]).some(v=>v!==''&&v!==undefined))n--;return n;}
  getMaxRows(){return this.maxRows;}
  insertRowsAfter(_n,amount){this.maxRows+=amount;}
  setFrozenRows(){}
  getRange(row,col,count=1,width=1){const sheet=this;return {
    getValues:()=>Array.from({length:count},(_,r)=>Array.from({length:width},(_,c)=>sheet.rows[row+r-1]?.[col+c-1]??'')),
    setValues(data){if(row+count-1>sheet.maxRows)throw Error('Out of rows');data.forEach((line,r)=>{sheet.rows[row+r-1]??=[];line.forEach((v,c)=>sheet.rows[row+r-1][col+c-1]=v);});},
    clearContent(){for(let r=0;r<count;r++)for(let c=0;c<width;c++)if(sheet.rows[row+r-1])sheet.rows[row+r-1][col+c-1]='';}
  };}
  getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),6);}
}
const ss={getId:()=> 'private-sheet-id',getSheetByName:n=>sheets.get(n),insertSheet(n){const sheet=new Sheet();sheets.set(n,sheet);return sheet;}};
const props={getProperty:k=>values.get(k)||null,setProperty(k,v){if(failPointer&&k.startsWith('STATE_'))throw Error('Temporary failure');values.set(k,v);}};
const sandbox={console,PropertiesService:{getScriptProperties:()=>props},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){}},Utilities:{getUuid:()=>`uuid-${++uuid}`},ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})}};
const context=vm.createContext(sandbox);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);context.setup();
const token=values.get('TOKEN_YUCHEN'),brother=values.get('TOKEN_YOULUN');
context.setup();assert.equal(values.get('TOKEN_YUCHEN'),token);
function request(input){return JSON.parse(context.doPost({postData:{contents:JSON.stringify(input)}}).text);}
const call=(action,extra={})=>request({action,profileId:'yuchen',token,...extra});
assert.equal(call('read').remote,null);
assert.equal(request({action:'read',profileId:'youlun',token}).error,'unauthorized');
assert.equal(request({action:'read',profileId:'__proto__',token}).error,'unauthorized');
const data={version:1,days:{'2026-10-23':[{name:'=IMPORTXML("bad")',sets:[{weight:20,reps:10}]}]},weeklyPlan:Array(7).fill('休息')};
assert.equal(call('write',{baseRevision:0,data}).revision,1);
assert.deepEqual(call('read').remote.data,data);
assert.equal(call('write',{baseRevision:0,data}).conflict,true);
assert.equal(request({action:'read',profileId:'youlun',token:brother}).remote,null);
assert.ok(sheets.get('健身APP_張語宸').rows[1][1].startsWith("'="));
assert.ok(sheets.get('健身APP_同步資料').rows[1][4].startsWith('JSON:'));
assert.equal(call('write',{baseRevision:1,data:{version:1,days:{'2026-02-30':[]}}}).error,'invalid-data');
const large={version:1,days:{'2026-10-23':Array.from({length:500},()=>({name:'測試動作'.repeat(10),sets:[{weight:10,reps:8}]}))}};
assert.equal(call('write',{baseRevision:1,data:large}).revision,2);assert.deepEqual(call('read').remote.data,large);
failPointer=true;assert.equal(call('write',{baseRevision:2,data}).ok,false);assert.equal(call('read').remote.revision,2);
failPointer=false;assert.equal(call('write',{baseRevision:2,data}).revision,3);assert.deepEqual(call('read').remote.data,data);
console.log('Passed: Apps Script setup, per-user token authorization, input validation, revisions, chunk roundtrip, formula escaping, failed-commit recovery and separate users.');
