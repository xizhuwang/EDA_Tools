import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{examples,makeSram,parseVcd,valueAt,displayValue,netlistStats,orfsTemplate}from'../core.js';
let checks=0;function test(name,fn){fn();console.log('PASS '+name);checks++;}
for(const kind of ['1rw','1r1w','2rw'])for(const d of [64,256,1024])for(const w of [8,32,64])test(`SRAM ${kind} ${d}x${w}`,()=>{const m=makeSram(kind,d,w);assert.ok(m.source.includes(`reg [${w-1}:0] mem [0:${d-1}]`));assert.ok(m.source.includes('posedge clk'));assert.ok(m.source.includes('endmodule'));});
test('reject unsupported preset',()=>assert.throws(()=>makeSram('1rw',63,32)));
const vcd='$timescale 1 ns $end\n$scope module tb $end\n$var wire 1 ! clk $end\n$var wire 4 " data [3:0] $end\n$var wire 4 " alias [3:0] $end\n$upscope $end\n$enddefinitions $end\n#0\n0!\nb0000 "\n#5\n1!\nb1010 "\n#10\n0!\n';
test('VCD timescale, aliases and values',()=>{const p=parseVcd(vcd);assert.equal(p.signals.length,3);assert.equal(p.timescale,'1 ns');assert.equal(p.maxTime,10);assert.equal(valueAt(p.events.get('"'),6),'1010');assert.equal(displayValue('1010',4),'0xa');assert.equal(displayValue('xx',4),'xx');});
test('VCD size cap',()=>assert.throws(()=>parseVcd(' '.repeat(600001))));
test('path terminates at flops',()=>{const n={modules:{top:{cells:{ff:{type:'$_DFF_P_',port_directions:{D:'input',Q:'output'},connections:{D:[3],Q:[1]}},a:{type:'$_NOT_',port_directions:{A:'input',Y:'output'},connections:{A:[1],Y:[2]}},b:{type:'$_NOT_',port_directions:{A:'input',Y:'output'},connections:{A:[2],Y:[3]}}}}}};assert.equal(netlistStats(n).depth,2);assert.equal(netlistStats(n).total,3);});
test('detect logic cycle',()=>assert.throws(()=>netlistStats({modules:{top:{cells:{a:{type:'$_NOT_',port_directions:{A:'input',Y:'output'},connections:{A:[1],Y:[1]}}}}}})));
test('ORFS input validation rejects injection',()=>{assert.throws(()=>orfsTemplate('x;puts HACK','clk',10));assert.throws(()=>orfsTemplate('top','clk',0));assert.ok(orfsTemplate('top','clk',10).includes('EXPORT TEMPLATE ONLY'));});
const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),app=await readFile(new URL('../app.js',import.meta.url),'utf8');
test('all UI bindings exist',()=>{const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(match[1]),'Missing #'+match[1]);});
test('all examples self-check and dump',()=>{for(const e of Object.values(examples)){assert.ok(e.tb.includes('$dumpfile("dump.vcd")'));assert.ok(e.tb.includes('$finish'));assert.ok(e.design.includes('module '+e.top));}});
console.log(`All ${checks} unit checks passed.`);
