// Copyright 2026 Xi-Zhu Wang. GPL-2.0-or-later.
import {examples,makeSram,parseVcd,valueAt,displayValue,orfsTemplate} from './core.js';
import {setupWorkbench,clearAnalysis,updateLanguage,renderChecks,acceptAnalysis} from './workbench.js';
const $=id=>document.getElementById(id),key='eda-tools:workspace:v1';let locale='zh',worker=null,timer=null,jobId=0,vcd='',parsed=null,netlist='',saveTimer,cursor=0,selected=new Set();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(zh,en)=>locale==='zh'?zh:en;
function translate(){document.documentElement.lang=locale==='zh'?'zh-Hant':'en';document.querySelectorAll('[data-zh]').forEach(el=>el.textContent=el.dataset[locale]);$('language').textContent=locale==='zh'?'English':'繁體中文';sramPreview();if(parsed)renderWave();updateLanguage(locale);}
function highlight(id){const text=$(id).value;const re=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")|\b(module|endmodule|input|output|wire|reg|always|initial|begin|end|if|else|case|endcase|assign|posedge|negedge|parameter|integer|repeat|for)\b|(\b\d+(?:'[bhdBoHD][0-9a-fA-FxzXZ_]+)?\b)/g;let result='',i=0;for(const m of text.matchAll(re)){result+=escape(text.slice(i,m.index));result+=`<span class="tok-${m[1]?'comment':m[2]?'string':m[3]?'keyword':'number'}">${escape(m[0])}</span>`;i=m.index+m[0].length;}$(id+'-highlight').innerHTML=result+escape(text.slice(i))+'\n';syncScroll(id);}
function syncScroll(id){$(id+'-highlight').scrollTop=$(id).scrollTop;$(id+'-highlight').scrollLeft=$(id).scrollLeft;}
function snapshot(){return {schema:1,design:$('design').value,tb:$('tb').value,top:$('top').value,tbtop:$('tbtop').value};}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(key,JSON.stringify(snapshot()));$('save-state').textContent=t('已儲存於此瀏覽器','Saved in this browser');}catch{$('save-state').textContent=t('儲存失敗，請匯出備份','Save unavailable; export a backup');}},450);}
function validProject(p){return p&&p.schema===1&&['design','tb','top','tbtop'].every(k=>typeof p[k]==='string')&&p.design.length<=150000&&p.tb.length<=150000;}
function load(p){for(const id of ['design','tb','top','tbtop'])$(id).value=p[id];highlight('design');highlight('tb');invalidate();save();}
function invalidate(){vcd='';parsed=null;netlist='';$('download-vcd').disabled=true;$('download-netlist').disabled=true;$('waveform').replaceChildren();$('waveform').className='empty';$('waveform').textContent=t('內容已變更，請重新執行模擬。','Sources changed. Run simulation again.');$('signal-list').replaceChildren();$('wave-time').textContent='';$('checks').textContent=t('尚未檢查目前版本。','Current revision not checked.');$('cell-count').textContent='—';$('logic-depth').textContent='—';$('cell-table').replaceChildren();$('path-info').textContent='';$('synth-log').textContent='';clearAnalysis();}
function tab(name){document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===name)));document.querySelectorAll('.result-panel').forEach(el=>el.hidden=el.id!=='panel-'+name);}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function finish(){clearTimeout(timer);worker?.terminate();worker=null;['run','lint','synth'].forEach(id=>$(id).disabled=false);$('cancel').disabled=true;$('runtime-state').textContent='● Browser-local';}
function cancel(message=t('已取消執行。','Execution cancelled.')){++jobId;finish();$('job-status').textContent=message;}
function diagnostics(findings){$('checks').replaceChildren();if(!findings.length)findings=[t('這次檢查沒有回報結構警告。這不保證 CDC、功能或時序正確。','No structural warnings reported. This does not prove CDC, functional or timing correctness.')];for(const s of findings){const div=document.createElement('div');div.className='finding';div.textContent=s;$('checks').append(div);}}
function run(action){
  if(worker)return;const id=++jobId;['run','lint','synth'].forEach(k=>$(k).disabled=true);$('cancel').disabled=false;
  $('job-status').textContent=t('執行中：首次需下載工具…','Running: first use downloads tool files…');$('runtime-state').textContent='◌ Worker active';
  tab(action==='run'?'log':action==='lint'?'check':'report');$('console').textContent='Starting '+action+'…';
  worker=new Worker('./engine/worker.js',{type:'module'});
  timer=setTimeout(()=>{cancel(t('逾時，已停止 Worker；可重新執行。','Timed out. Worker stopped; retry when ready.'));$('console').textContent=t('執行逾時。請檢查零延遲迴圈、無 $finish 或過大設計。','Execution timed out. Check zero-delay loops, missing $finish or large designs.');},action==='run'?60000:180000);
  worker.onerror=e=>{if(id!==jobId)return;finish();$('job-status').textContent='Engine error';$('console').textContent=e.message;tab('log');};
  worker.onmessage=({data:r})=>{
    if(r.id!==jobId)return;finish();$('console').textContent=r.log||'(no output)';$('job-status').textContent=r.ok?t('工具執行完成（不代表功能驗證通過）','Tool completed (not a functional PASS)'):t('工具失敗，請查看診斷','Tool failed; inspect diagnostics');
    if(!r.ok){tab('log');return;}
    if(action==='run'){
      vcd=r.vcd||'';$('download-vcd').disabled=!vcd;
      if(!vcd){$('console').textContent+='\nNo /dump.vcd. Add $dumpfile("dump.vcd"); $dumpvars(0,tb); in your testbench.';return;}
      try{parsed=parseVcd(vcd);selected=new Set(parsed.signals.slice(0,12).map((_,i)=>i));cursor=0;renderWave();tab('wave');}catch(e){$('console').textContent+='\n'+e.message;}
    }else if(action==='lint'){renderChecks(r.structured);tab('check');}
    else{netlist=r.netlist;$('download-netlist').disabled=false;$('cell-count').textContent=r.stats.total;$('logic-depth').textContent=r.stats.depth;acceptAnalysis(r);renderChecks(r.structured);$('cell-table').innerHTML='<table><thead><tr><th>Cell type</th><th>Count</th></tr></thead><tbody>'+Object.entries(r.stats.counts).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<tr><td>${escape(k)}</td><td>${n}</td></tr>`).join('')+'</tbody></table>';$('synth-log').textContent=r.log;tab('report');}
  };
  worker.postMessage({id,action,...snapshot()});
}
function renderWave(){
  if(!parsed)return;const query=$('signal-filter').value.toLowerCase();$('signal-list').replaceChildren();
  parsed.signals.forEach((s,i)=>{if(!s.name.toLowerCase().includes(query))return;const label=document.createElement('label'),box=document.createElement('input'),span=document.createElement('span');box.type='checkbox';box.checked=selected.has(i);box.onchange=()=>{if(box.checked&&selected.size>=24){box.checked=false;alert(t('最多顯示 24 條波形。','Maximum 24 visible traces.'));return;}box.checked?selected.add(i):selected.delete(i);renderWave();};span.textContent=s.name;span.title=s.name;label.append(box,span);$('signal-list').append(label);});
  const visible=[...selected].sort((a,b)=>a-b).slice(0,24);const w=900*Number($('zoom').value),h=40+visible.length*48,left=145,plot=w-left-12,end=parsed.maxTime||1;const x=time=>left+time/end*plot;let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="Simulation waveform"><rect width="100%" height="100%" fill="#09131c"/>`;
  for(let n=0;n<=8;n++){const px=left+plot*n/8;svg+=`<path d="M${px} 27V${h}" stroke="#22384a"/><text x="${px}" y="17" fill="#829bb3" font-size="10" text-anchor="middle">${Math.round(end*n/8)}</text>`;}
  visible.forEach((i,row)=>{const s=parsed.signals[i],y=45+row*48,events=parsed.events.get(s.id)||[],val=valueAt(events,cursor);svg+=`<text x="8" y="${y+9}" fill="#a8c7d7" font-family="monospace" font-size="10">${escape(s.name.length>21?'…'+s.name.slice(-20):s.name)}</text><text x="8" y="${y+23}" fill="#7be4bb" font-family="monospace" font-size="10">${escape(displayValue(val,s.width))}</text>`;
    let transitions=events.filter(([time])=>time<=end);if(transitions.length>1500)transitions=transitions.slice(0,1500); // Bound DOM work.
    if(!transitions.length)transitions=[[0,'x']];
    for(let j=0;j<transitions.length;j++){const [start,v]=transitions[j],stop=transitions[j+1]?.[0]??end,a=x(start),b=x(stop),unknown=/[xz]/.test(v);const color=unknown?'#f6a17f':'#78e0bd';
      if(s.width===1){const level=v==='1'?y-5:y+17;svg+=`<path d="M${a} ${level}H${b}" stroke="${color}" fill="none"/>`;if(j){svg+=`<path d="M${a} ${y-5}V${y+17}" stroke="${color}"/>`;}}
      else{svg+=`<path d="M${a+3} ${y-5}H${b-3}L${b} ${y+6}L${b-3} ${y+17}H${a+3}L${a} ${y+6}Z" stroke="${color}" fill="#102c2c"/>`;if(b-a>45)svg+=`<text x="${(a+b)/2}" y="${y+10}" text-anchor="middle" fill="${color}" font-family="monospace" font-size="10">${escape(displayValue(v,s.width))}</text>`;}
    }
  });
  svg+=`<path d="M${x(cursor)} 23V${h}" stroke="#eac77f" stroke-dasharray="3 3"/></svg>`;$('waveform').className='';$('waveform').innerHTML=svg;$('wave-time').textContent=`cursor: ${cursor} × ${parsed.timescale}`;
  $('waveform').querySelector('svg').onclick=e=>{const px=e.clientX-e.currentTarget.getBoundingClientRect().left;cursor=Math.round(Math.max(0,Math.min(1,(px-left)/plot))*end);renderWave();};
}
function sramPreview(){const model=makeSram($('sram-kind').value,Number($('sram-depth').value),Number($('sram-width').value));$('sram-preview').textContent=model.source;$('sram-contract').textContent=model.contract;return model;}
for(const id of ['design','tb']){
  $(id).oninput=()=>{highlight(id);if(worker)cancel(t('程式已修改；已取消舊工作。','Sources changed; old job cancelled.'));invalidate();save();};$(id).onscroll=()=>syncScroll(id);
  $(id).onkeydown=e=>{if(e.key!=='Tab')return;e.preventDefault();const el=e.target,start=el.selectionStart;el.setRangeText('  ',start,el.selectionEnd,'end');el.dispatchEvent(new Event('input'));};
}
for(const id of ['top','tbtop'])$(id).oninput=()=>{if(worker)cancel();invalidate();save();};
$('run').onclick=()=>run('run');$('lint').onclick=()=>run('lint');$('synth').onclick=()=>run('synth');$('cancel').onclick=()=>cancel();
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>tab(b.dataset.panel));
$('language').onclick=()=>{locale=locale==='zh'?'en':'zh';translate();};
$('load-example').onclick=()=>{if(!confirm(t('以範例取代目前 RTL 與 testbench？請先匯出備份。','Replace current RTL and testbench? Export a backup first.')))return;if(worker)cancel();load(examples[$('example').value]);};
$('export-project').onclick=()=>download('eda-workspace.json',JSON.stringify(snapshot(),null,2),'application/json');
$('import-project').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>400000)throw Error('Import limit: 400 KB');const p=JSON.parse(await file.text());if(!validProject(p))throw Error('Invalid project schema');if(confirm(t('取代目前專案？','Replace current project?'))){if(worker)cancel();load(p);}}catch(err){alert(err.message);}finally{e.target.value='';}};
for(const [input,target]of [['design-file','design'],['tb-file','tb']])$(input).onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>150000){alert('File limit: 150 KB');return;}if(confirm(t('取代目前編輯器內容？','Replace editor contents?'))){$(target).value=await file.text();$(target).dispatchEvent(new Event('input'));}e.target.value='';};
$('download-vcd').onclick=()=>download('dump.vcd',vcd);$('download-netlist').onclick=()=>download('netlist.json',netlist,'application/json');
$('signal-filter').oninput=()=>renderWave();$('zoom').onchange=()=>renderWave();
for(const id of ['sram-kind','sram-depth','sram-width'])$(id).onchange=sramPreview;
$('insert-sram').onclick=()=>{const model=sramPreview();if(new RegExp('\\bmodule\\s+'+model.name+'\\b').test($('design').value)){alert('Module already exists: '+model.name);return;}$('design').value+='\n\n'+model.source;$('design').dispatchEvent(new Event('input'));};
$('download-sram').onclick=()=>{const m=sramPreview();download(m.name+'.v',m.source);};
$('export-flow').onclick=()=>{try{download('config.mk',orfsTemplate($('top').value,$('clock-port').value,Number($('clock-period').value)));}catch(e){alert(e.message);}};
$('privacy').onclick=()=>$('legal').showModal();$('close-legal').onclick=()=>$('legal').close();
setupWorkbench();
try{const saved=JSON.parse(localStorage.getItem(key));if(validProject(saved))load(saved);else load(examples.counter);}catch{load(examples.counter);}
translate();
