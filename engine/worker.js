// GPL-2.0-or-later. Icarus adapter derived from Xi-Zhu Wang's RTL Interview Lab.
import {loadIcarus} from './runtime-loader.js';
import {netlistStats} from '../core.js';
const LIMIT=24000;
function logSink(){let text='';const decoder=new TextDecoder();return {push(v){if(v==null)return;const chunk=typeof v==='string'?v:typeof v==='number'?String.fromCharCode(v):ArrayBuffer.isView(v)?decoder.decode(v,{stream:true}):String(v);if(text.length<LIMIT)text+=chunk.slice(0,LIMIT-text.length);},get text(){return text;}};}
const ivlConfig=(top)=>`basedir:/\nmodule:system.vpi\ngeneration:2005\ngeneration:no-specify\nout:/out.vvp\niwidth:32\nwidthcap:65536\nfunctor:cprop\nfunctor:nodangle\nflag:DLL=vvp.tgt\nroot:${top}\n`;
export async function runJob(data){
  const {action,design,tb='',top,tbtop}=data;
  if(typeof design!=='string'||design.length>150000||tb.length>150000)throw Error('Source limit: 150 KB per editor');
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(top)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tbtop))throw Error('Invalid top module identifier');
  const log=logSink();
  if(action==='run'){
    const {initIvlpp,initIvl,initVvp}=await loadIcarus();let pre='';
    const pp=await initIvlpp({print:x=>{if(pre.length>500000)throw Error('Preprocessed source limit');pre+=x+'\n';},printErr:x=>log.push(x+'\n')});
    pp.FS.writeFile('/design.v','`timescale 1ns/1ps\n'+design+'\n');pp.FS.writeFile('/testbench.v','`timescale 1ns/1ps\n'+tb+'\n');
    pp.callMain(['-L','/design.v','/testbench.v']);
    const ivl=await initIvl({print:x=>log.push(x+'\n'),printErr:x=>log.push(x+'\n')});
    ivl.FS.writeFile('/ivl.conf',ivlConfig(tbtop));ivl.FS.writeFile('/src.v',pre);ivl.callMain(['-C/ivl.conf','--','/src.v']);
    let program;try{program=ivl.FS.readFile('/out.vvp');}catch{return {ok:false,phase:'compile',log:log.text};}
    const vvp=await initVvp({print:x=>log.push(x+'\n'),printErr:x=>log.push(x+'\n')});vvp.FS.writeFile('/sim.vvp',program);vvp.callMain(['/sim.vvp']);
    let vcd='';try{const size=vvp.FS.stat('/dump.vcd').size;if(size>600000)log.push('VCD exceeds 600 KB. Reduce $dumpvars scope or simulation duration.');else vcd=vvp.FS.readFile('/dump.vcd',{encoding:'utf8'});}catch{/* TB may omit dumping */}
    return {ok:true,phase:'simulation',log:log.text,vcd};
  }
  if(!['lint','synth'].includes(action))throw Error('Unknown tool action');
  const {runYosys}=await import('https://cdn.jsdelivr.net/npm/@yowasp/yosys@0.65.176-dev.1145/gen/bundle.js');
  const script=action==='lint'
    ? `read_verilog design.v; hierarchy -check -top ${top}; proc; opt_clean; check; write_json out.json`
    : `read_verilog design.v; hierarchy -check -top ${top}; synth -top ${top} -flatten; delete t:$scopeinfo; opt_clean; stat; ltp -noff; write_json out.json`;
  const files=await runYosys(['-p',script],{'design.v':new TextEncoder().encode(design)},{stdout:x=>log.push(x),stderr:x=>log.push(x)});
  if(!files?.['out.json'])throw Error(log.text||'Yosys returned no netlist');
  const raw=files['out.json'],json=typeof raw==='string'?raw:new TextDecoder().decode(raw);const netlist=JSON.parse(json);
  const findings=log.text.split('\n').filter(x=>/warning:|ERROR:|Latch inferred|multiple conflicting drivers|no driver|logic loop/i.test(x));
  const latches=Object.values(netlist.modules||{}).flatMap(m=>Object.entries(m.cells||{}).filter(([,c])=>/latch/i.test(c.type)).map(([n])=>`Inferred latch: ${n}`));
  const stats=action==='synth'?netlistStats(netlist):null;
  return {ok:true,phase:action,log:log.text,findings:[...new Set([...findings,...latches])],stats,netlist:json};
}
self.addEventListener('message',async({data})=>{try{self.postMessage({id:data.id,...await runJob(data)});}catch(e){self.postMessage({id:data.id,ok:false,phase:data.action,log:String(e?.message||e)});}});
