// Copyright 2026 Xi-Zhu Wang. GPL-2.0-or-later.
export const examples = {
  counter: {top:'counter',tbtop:'tb',design:`module counter(input wire clk, input wire rst_n,
  input wire en, output reg [7:0] count);
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) count <= 8'd0;
    else if (en) count <= count + 1'b1;
  end
endmodule`,tb:`\x60timescale 1ns/1ps
module tb;
  reg clk=0, rst_n=0, en=0;
  wire [7:0] count;
  counter dut(clk, rst_n, en, count);
  always #5 clk=~clk;
  initial begin
    $dumpfile("dump.vcd"); $dumpvars(0,tb);
    repeat(2) @(negedge clk);
    rst_n=1; en=1;
    repeat(5) @(negedge clk);
    if(count !== 8'd5) $display("FAIL count=%d",count);
    else $display("PASS: five accepted increments");
    en=0; repeat(2) @(negedge clk);
    if(count !== 8'd5) $display("FAIL hold=%d",count);
    else $display("PASS: hold when disabled");
    $finish;
  end
endmodule`},
  pipeline:{top:'pipeline',tbtop:'tb',design:`module pipeline(input wire clk, input wire rst_n,
  input wire valid, input wire [7:0] a,b,
  output reg out_valid, output reg [8:0] sum);
  always @(posedge clk) begin
    if(!rst_n) begin out_valid<=0; sum<=0; end
    else begin
      out_valid<=valid;
      if(valid) sum<={1'b0,a}+{1'b0,b};
    end
  end
endmodule`,tb:`\x60timescale 1ns/1ps
module tb;
  reg clk=0,rst_n=0,valid=0;
  reg [7:0] a=0,b=0;
  wire out_valid; wire [8:0] sum;
  pipeline dut(clk,rst_n,valid,a,b,out_valid,sum);
  always #5 clk=~clk;
  initial begin
    $dumpfile("dump.vcd"); $dumpvars(0,tb);
    repeat(2) @(negedge clk); rst_n=1;
    a=200;b=100;valid=1;
    @(negedge clk);
    if(sum!==9'd300 || out_valid!==1) $display("FAIL");
    else $display("PASS: widened sum=300");
    valid=0; repeat(3) @(negedge clk); $finish;
  end
endmodule`},
  latch:{top:'latch_example',tbtop:'tb',design:`// Missing else infers a latch. Try adding else q=8'd0.
module latch_example(input wire en,input wire [7:0] d,
  output reg [7:0] q);
  always @* begin
    if(en) q=d;
  end
endmodule`,tb:`\x60timescale 1ns/1ps
module tb;
  reg en=0;reg [7:0] d=0;wire [7:0] q;
  latch_example dut(en,d,q);
  initial begin
    $dumpfile("dump.vcd");$dumpvars(0,tb);
    #10 en=1;d=8'h42;
    #10 en=0;d=8'hff;
    #10 $display("q=%h (latch retains 42)",q);
    $finish;
  end
endmodule`}
};

export function makeSram(kind,depth,width) {
  if(!['1rw','1r1w','2rw'].includes(kind)||![64,256,1024].includes(depth)||![8,32,64].includes(width)) throw Error('Unsupported SRAM preset');
  const aw=Math.log2(depth),name=`sram_${kind}_${depth}x${width}`;
  let ports,body,contract;
  if(kind==='1rw'){
    ports=`input wire clk, input wire cs, input wire we,
  input wire [${aw-1}:0] addr, input wire [${width-1}:0] din,
  output reg [${width-1}:0] dout`;
    body=`always @(posedge clk) if(cs) begin
    if(we) mem[addr] <= din;
    else dout <= mem[addr];
  end`;
    contract='1RW: cs=1 and we=1 writes; cs=1 and we=0 reads after the rising edge. dout holds on write or idle.';
  }else if(kind==='1r1w'){
    ports=`input wire clk, input wire wen, input wire ren,
  input wire [${aw-1}:0] waddr, raddr,
  input wire [${width-1}:0] din, output reg [${width-1}:0] dout`;
    body=`always @(posedge clk) begin
    if(wen) mem[waddr] <= din;
    if(ren) dout <= mem[raddr];
  end`;
    contract='1R1W: common clock, independent read/write addresses and enables. Simultaneous same-address read/write returns OLD data (read-first). dout holds when ren=0.';
  }else{
    ports=`input wire clk, input wire cs_a, we_a, cs_b, we_b,
  input wire [${aw-1}:0] addr_a, addr_b,
  input wire [${width-1}:0] din_a, din_b,
  output reg [${width-1}:0] dout_a, dout_b`;
    body=`always @(posedge clk) begin
    if(cs_a) begin
      if(we_a) mem[addr_a] <= din_a;
      else dout_a <= mem[addr_a];
    end
    if(cs_b) begin
      if(we_b) mem[addr_b] <= din_b;
      else dout_b <= mem[addr_b];
    end
  // Same-address dual writes are ILLEGAL: no physical guarantee.
  // Simulation marks the contested word X; never rely on port priority.
  // synthesis translate_off
    if(cs_a && we_a && cs_b && we_b && addr_a==addr_b) begin
      mem[addr_a] <= {${width}{1'bx}};
      $display("SRAM ERROR: same-address dual write at %t",$time);
    end
  // synthesis translate_on
  end`;
    contract='2RW: two read/write ports, COMMON clock only. Same-address read/write is read-first. Same-address dual write is illegal and emits a simulation diagnostic + X. Not an independent-clock macro.';
  }
  return {name,contract,source:`// Original behavioral model. GPL-2.0-or-later.
// ${contract}
// No initialization/reset: unread unwritten data is X.
// One-cycle synchronous read, no process-specific delays.
module ${name}(
  ${ports}
);
  reg [${width-1}:0] mem [0:${depth-1}];
  ${body}
endmodule\n`};
}

export function parseVcd(text){
  if(text.length>600000) throw Error('VCD exceeds 600 KB display limit');
  const signals=[],events=new Map(),scope=[];let time=0,maxTime=0,timescale='1 unit',inDefinitions=true,eventCount=0;
  const scale=text.match(/\$timescale\s+([^$]+)\$end/);if(scale) timescale=scale[1].trim().replace(/\s+/g,' ');
  for(const raw of text.split('\n')){
    const line=raw.trim();
    if(inDefinitions){
      if(line.startsWith('$scope '))scope.push(line.split(/\s+/)[2]);
      else if(line.startsWith('$upscope'))scope.pop();
      else if(line.startsWith('$var ')){const p=line.split(/\s+/);signals.push({id:p[3],width:Number(p[2]),name:[...scope,p.slice(4,-1).join(' ')].join('.')});}
      else if(line.startsWith('$enddefinitions'))inDefinitions=false;
      continue;
    }
    if(line[0]==='#'){time=Number(line.slice(1));maxTime=Math.max(maxTime,time);continue;}
    let id,value;if(/^[01xzXZ]/.test(line)){id=line.slice(1);value=line[0].toLowerCase();}else if(/^[bB]/.test(line)){[,value,id]=line.match(/^[bB](\S+)\s+(\S+)/)||[];}
    if(!id)continue;if(++eventCount>40000)throw Error('VCD exceeds 40,000 event display limit');
    if(!events.has(id))events.set(id,[]);events.get(id).push([time,value.toLowerCase()]);
  }
  return {signals,events,maxTime,timescale};
}
export function valueAt(events,time){let lo=0,hi=events.length-1,answer='x';while(lo<=hi){const m=(lo+hi)>>1;if(events[m][0]<=time){answer=events[m][1];lo=m+1;}else hi=m-1;}return answer;}
export function displayValue(value,width){if(/[xz]/i.test(value))return value;if(width===1)return value;return '0x'+BigInt('0b'+value).toString(16).padStart(Math.ceil(width/4),'0');}

// Unit-delay topology, NOT library timing. Sequential cells terminate paths.
export function netlistStats(netlist){
  const modules=Object.values(netlist.modules||{});if(modules.length!==1)throw Error('Expected one flattened top module');
  const m=modules[0],counts={},drivers=new Map(),cells=m.cells||{};
  for(const [name,c] of Object.entries(cells)){
    counts[c.type]=(counts[c.type]||0)+1;
    if(/DFF|LATCH|MEM|FF_/i.test(c.type))continue;
    for(const [p,bits] of Object.entries(c.connections||{}))if(c.port_directions?.[p]==='output')for(const bit of bits)if(typeof bit==='number'){
      if(drivers.has(bit))throw Error('Multiple drivers prevent unambiguous topology analysis');drivers.set(bit,name);
    }
  }
  const memo=new Map(),visiting=new Set();let best=[];
  function visit(name){if(memo.has(name))return memo.get(name);if(visiting.has(name))throw Error('Combinational cycle: depth undefined');visiting.add(name);let path=[];const c=cells[name];for(const [p,bits]of Object.entries(c.connections||{}))if(c.port_directions?.[p]==='input')for(const b of bits){const d=drivers.get(b);if(d){const candidate=visit(d);if(candidate.length>path.length)path=candidate;}}visiting.delete(name);const result=[...path,name];memo.set(name,result);return result;}
  for(const name of new Set(drivers.values())){const path=visit(name);if(path.length>best.length)best=path;}
  return {total:Object.values(counts).reduce((a,b)=>a+b,0),counts,depth:best.length,path:best};
}

export function orfsTemplate(top,clock,period){
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(top)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clock)||!Number.isFinite(period)||period<=0)throw Error('Use simple Verilog identifiers and a positive clock period');
  return `# EXPORT TEMPLATE ONLY. Not an executed or validated APR result.
# Save design.v and this file under an ORFS design directory.
# Select a licensed platform supported by your installed ORFS version.
export DESIGN_NAME = ${top}
export PLATFORM = nangate45
export VERILOG_FILES = $(DESIGN_HOME)/src/$(DESIGN_NICKNAME)/design.v
export SDC_FILE = $(DESIGN_HOME)/$(PLATFORM)/$(DESIGN_NICKNAME)/constraint.sdc
export CORE_UTILIZATION = 35
export PLACE_DENSITY = 0.55

# Save the following separately as constraint.sdc:
# create_clock -name core_clk -period ${period} [get_ports {${clock}}]
# Add real input/output delays, loads, drive strengths and clock uncertainty.
# Do NOT treat this incomplete constraint set as sign-off.
# Run from your ORFS installation: make DESIGN_CONFIG=/absolute/path/config.mk
# Behavioral SRAM is mapped to logic unless a real macro mapping is supplied.
# For hard macros provide matching Liberty, LEF and GDS plus placement constraints.
`;
}
