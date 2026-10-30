// Original educational netlist analysis. GPL-2.0-or-later. NOT silicon STA / CDC sign-off.
export const virtualTech = Object.freeze({name:'EDU-GENERIC-v1',inv:0.04,xor:0.12,mux:0.10,gate:0.07,clkToQ:0.08,setup:0.06,uncertainty:0.10});
const sequential=c=>/dff|latch|\$mem/i.test(c.type);
const flop=c=>/dff/i.test(c.type);
export function sourceLine(src){const m=String(src||'').match(/design\.v:(\d+)/);return m?Number(m[1]):null;}
function modelDelay(type){return /xor|xnor/i.test(type)?virtualTech.xor:/mux/i.test(type)?virtualTech.mux:/not|inv/i.test(type)?virtualTech.inv:virtualTech.gate;}
function graph(netlist){
 const modules=Object.values(netlist.modules||{});if(modules.length!==1)throw Error('Analysis requires one flattened top');const m=modules[0],cells=m.cells||{};
 if(Object.keys(cells).length>12000)throw Error('Interactive analysis limit: 12,000 cells. Reduce design size.');
 const names=new Map(),drivers=new Map(),inputs=new Set();
 for(const[n,p]of Object.entries(m.ports||{}))p.bits.forEach((bit,i)=>{names.set(bit,p.bits.length>1?`${n}[${i+(p.offset||0)}]`:n);if(p.direction==='input')inputs.add(bit);});
 for(const[n,v]of Object.entries(m.netnames||{}))if(!n.startsWith('$'))v.bits.forEach((bit,i)=>{if(!names.has(bit))names.set(bit,v.bits.length>1?`${n}[${i+(v.offset||0)}]`:n);});
 for(const[name,c]of Object.entries(cells))for(const[p,bits]of Object.entries(c.connections||{}))if(c.port_directions?.[p]==='output')for(const bit of bits)if(typeof bit==='number'){if(drivers.has(bit))throw Error('Multiple drivers: resolve RTL checks before timing analysis');drivers.set(bit,{name,port:p,c});}
 return{m,cells,names,drivers,inputs,label:bit=>names.get(bit)||String(bit)};
}
export function analyzePaths(netlist,frequencyMHz=100){
 if(!Number.isFinite(frequencyMHz)||frequencyMHz<=0||frequencyMHz>100000)throw Error('Target frequency must be 0 < MHz <= 100000');
 const g=graph(netlist),memo=new Map(),active=new Set(),period=1000/frequencyMHz;
 function walk(bit,depth=0){
  if(depth>600)throw Error('Path exceeds interactive traversal limit');if(memo.has(bit))return memo.get(bit);if(active.has(bit))throw Error('Combinational loop: path timing undefined');active.add(bit);
  const d=g.drivers.get(bit);let paths;
  if(!d||sequential(d.c)){
   const clk=d?.c.connections?.CLK||d?.c.connections?.C;const isFF=d&&flop(d.c);
   paths=[{start:d?`${d.name}.${d.port} · ${g.label(bit)}`:g.label(bit),startLabel:d?`${g.label(bit)} · ${isFF?'FF.Q':'unsupported cell'}`:g.label(bit),launch:isFF?(clk?.[0]??null):null,launchKind:isFF?'register':d?'unsupported':'input',delay:isFF?virtualTech.clkToQ:0,nodes:[],startLine:sourceLine(d?.c.attributes?.src)}];
  }else{
   const upstream=[];for(const[p,bits]of Object.entries(d.c.connections||{}))if(d.c.port_directions?.[p]==='input')for(const b of new Set(bits))for(const path of walk(b,depth+1))upstream.push({...path,nodes:[...path.nodes,{name:d.name,type:d.c.type,signal:g.label(bit),line:sourceLine(d.c.attributes?.src),delay:modelDelay(d.c.type)}],delay:path.delay+modelDelay(d.c.type)});
   const seen=new Set();paths=upstream.sort((a,b)=>b.delay-a.delay).filter(p=>{const key=p.start+p.nodes.map(n=>n.name).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
  }
  active.delete(bit);memo.set(bit,paths);return paths;
 }
 const endpoints=[];
 for(const[name,c]of Object.entries(g.cells))if(flop(c))(c.connections?.D||[]).forEach((bit,i)=>endpoints.push({bit,end:`${name}.D · ${g.label(bit)}`,endLabel:`${g.label(c.connections.Q?.[i]??bit)} · FF.D`,capture:(c.connections.CLK||c.connections.C)?.[0]??null,endLine:sourceLine(c.attributes?.src),kind:'register'}));
 for(const[name,p]of Object.entries(g.m.ports||{}))if(p.direction==='output')p.bits.forEach((bit,i)=>endpoints.push({bit,end:p.bits.length>1?`${name}[${i+(p.offset||0)}]`:name,capture:null,kind:'output',endLine:sourceLine(g.m.netnames?.[name]?.attributes?.src)}));
 if(endpoints.length>20000)throw Error('Endpoint limit exceeded');let paths=[];
 for(const e of endpoints)for(const p of walk(e.bit)){
  if(!p.nodes.length&&p.launchKind==='input'&&typeof e.bit==='string')continue;
  const sameClock=e.kind==='register'&&p.launchKind==='register'&&p.launch===e.capture;
  paths.push({...p,end:e.end,endLabel:e.endLabel||e.end,endLine:e.endLine,depth:p.nodes.length,clock:sameClock?g.label(e.capture):null,estimatedSlack:sameClock?period-p.delay-virtualTech.setup-virtualTech.uncertainty:null,reason:sameClock?'same-clock-register':e.kind==='output'?'output-delay-unconstrained':p.launchKind==='input'?'input-delay-unconstrained':'cross-clock-or-unsupported'});
 }
 const hasLatch=Object.values(g.cells).some(c=>/latch/i.test(c.type));if(hasLatch)paths=paths.map(p=>({...p,estimatedSlack:null,reason:'latch-timing-unsupported'}));
 paths.sort((a,b)=>b.delay-a.delay);const seen=new Set();paths=paths.filter(p=>{const key=p.start+'>'+p.end+'>'+p.nodes.map(n=>n.name).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,10);
 return {model:virtualTech,frequencyMHz,period,paths,hasLatch};
}

export function rtlRules(source){
 const text=source.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,m=>' '.repeat(m.length));const findings=[];
 const add=(rule,severity,index,message)=>findings.push({rule,severity,line:text.slice(0,index).split('\n').length,message,origin:'RTL heuristic',review:true});
 for(const match of text.matchAll(/\bcasex\b/g))add('RTL-CASEX','warning',match.index,'casex masks X values; review X propagation. Prefer explicit case/casez only when intentional.');
 for(const match of text.matchAll(/#\s*(?:\d|\()/g))add('RTL-DELAY','warning',match.index,'Delay syntax in design RTL is normally ignored/not synthesizable; use a clocked architecture instead. Parameter overrides may also match: review manually.');
 for(const match of text.matchAll(/always\s*@\s*(\([^)]*\)|\*)\s*([\s\S]*?)(?=\balways\b|\bendmodule\b|$)/g)){
  const clocked=/\b(posedge|negedge)\b/.test(match[1]),body=match[2];
  if(!clocked&&/\b\w+(?:\[[^\]]+\])?\s*<=/.test(body))add('RTL-COMB-NBA','warning',match.index,'Nonblocking assignment in combinational always block; prefer blocking assignments and complete defaults.');
  if(clocked&&/(?<![<>=!])=(?!=)/.test(body))add('RTL-SEQ-BLOCK','review',match.index,'Blocking assignment in edge-triggered block. Review ordering; architectural registers normally use nonblocking <=. Local temporaries may be intentional.');
  if(!clocked&&!/\*/.test(match[1]))add('RTL-SENSITIVITY','review',match.index,'Explicit combinational sensitivity list: verify no RHS signal is missing; always @* avoids stale simulation updates.');
 }
 return findings;
}
export function structuralChecks(netlist,source,toolLines=[]){
 const result=[...rtlRules(source)];for(const message of toolLines)result.push({rule:'YOSYS-CHECK',severity:/error|multiple conflicting|logic loop/i.test(message)?'error':'warning',message,line:sourceLine(message),origin:'Yosys',review:false});
 for(const[moduleName,m]of Object.entries(netlist.modules||{})){
  const cells=m.cells||{},drivers=new Map(),users=new Map(),label=new Map();for(const[n,v]of Object.entries(m.netnames||{}))v.bits.forEach(b=>{if(!label.has(b)||!n.startsWith('$'))label.set(b,n);});
  for(const[name,c]of Object.entries(cells))for(const[p,bits]of Object.entries(c.connections||{}))for(const b of bits){const map=c.port_directions?.[p]==='output'?drivers:users;if(!map.has(b))map.set(b,[]);map.get(b).push({name,c,port:p});}
  const clocks=new Set();
  for(const[name,c]of Object.entries(cells)){
   const src=sourceLine(c.attributes?.src);if(/latch/i.test(c.type))result.push({rule:'STRUCT-LATCH',severity:'warning',line:src,origin:'Yosys netlist',message:`${moduleName}.${name}: inferred ${c.type}. Check missing branches/default assignments; intentional latches require a separate timing methodology.`});
   if(!flop(c))continue;const clock=(c.connections.CLK||c.connections.C)?.[0];if(clock!==undefined)clocks.add(clock);
   if(drivers.has(clock))result.push({rule:'CLOCK-DERIVED',severity:'review',line:src,origin:'Netlist topology',review:true,message:`${name}: clock ${label.get(clock)||clock} has an internal driver. Review generated-clock constraints and glitch-free gating; a divided clock may be intentional.`});
   const found=new Map(),visited=new Set();
   function trace(b,depth=0){if(depth>100||visited.has(b))return;visited.add(b);for(const d of drivers.get(b)||[]){if(flop(d.c)){const launch=(d.c.connections.CLK||d.c.connections.C)?.[0];if(launch!==clock)found.set(d.name,{...d,launch});}else if(!sequential(d.c))for(const[p,bits]of Object.entries(d.c.connections||{}))if(d.c.port_directions?.[p]==='input')bits.forEach(x=>trace(x,depth+1));}}
   (c.connections.D||[]).forEach(b=>trace(b));
   for(const[from,d]of found){
    const q=c.connections.Q||[],next=q.flatMap(b=>users.get(b)||[]).filter(u=>u.port==='D'&&flop(u.c)&&((u.c.connections.CLK||u.c.connections.C)?.[0]===clock));
    result.push({rule:'CDC-CROSSING',severity:'review',line:src,origin:'Clock-net topology',review:true,message:`${from} (${label.get(d.launch)||d.launch}) → ${name} (${label.get(clock)||clock}). ${next.length?'A same-clock FF follows: possible 2FF structure, NOT a safety proof.':'No directly connected same-clock second FF was identified.'} Review source registering, metastability, pulse width, bus coherence, reconvergence and constraints.`,from,to:name,clockFrom:label.get(d.launch)||String(d.launch),clockTo:label.get(clock)||String(clock)});
   }
  }
  result.unshift({rule:'COVERAGE',severity:'info',origin:'Netlist topology',message:`${moduleName}: ${clocks.size} distinct clock nets; ${Object.keys(cells).length} cells inspected. Clock relation, generated clocks, CDC intent, RDC and metastability are not proven. Unelaborated modules and complex reconvergence may need dedicated tools.`});
 }
 return result.slice(0,150);
}

// A bounded, deterministic netlist diagram. Not physical placement or routing.
export function placementSketch(netlist){
 const g=graph(netlist),names=Object.keys(g.cells).sort(),sample=names.slice(0,180),keep=new Set(sample),edges=[],fanout=new Map();
 for(const[to,c]of Object.entries(g.cells))for(const[p,bits]of Object.entries(c.connections||{}))if(c.port_directions?.[p]==='input')for(const b of new Set(bits)){const d=g.drivers.get(b);if(d&&d.name!==to){fanout.set(d.name,(fanout.get(d.name)||0)+1);if(keep.has(d.name)&&keep.has(to)&&edges.length<400)edges.push({from:d.name,to,signal:g.label(b)});}}
 const cols=Math.max(1,Math.ceil(Math.sqrt(sample.length*1.6))),nodes=sample.map((name,i)=>({name,type:g.cells[name].type,line:sourceLine(g.cells[name].attributes?.src),x:25+(i%cols)*62,y:30+Math.floor(i/cols)*44,fanout:fanout.get(name)||0}));
 return {nodes,edges,total:names.length,truncated:names.length>sample.length,width:Math.max(300,cols*62+40),height:Math.max(160,Math.ceil(sample.length/cols)*44+50)};
}
