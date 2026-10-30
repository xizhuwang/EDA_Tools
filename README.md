# EDA Tools — Open Silicon Workbench

**繁體中文 / English** · [Launch workbench](https://xizhuwang.github.io/EDA_Tools/)

A browser-local Verilog-2005 workspace: independent RTL and testbench editors, actual Icarus simulation, VCD debugging and actual Yosys structural checks / generic synthesis. No account, installation or compilation server is required for these features. First use needs internet to download pinned engines.

## 實際可用 / Available

| Feature | Engine / scope |
|---|---|
| Two editors | Syntax colors, tab indentation, file import, local draft, project JSON export/import |
| Compile + simulate | Icarus Verilog WASM, explicit TB top, original testbench output; completion is NOT automatic functional PASS |
| Waveforms | Actual VCD, hierarchy/aliases, signal selection/filter, zoom, cursor values, download |
| RTL checks | Yosys parse/elaboration, `proc`, `opt_clean`, `check`; latch inference, conflicting/undriven drivers and loops |
| Synthesis | Yosys `synth -flatten`, generic cell counts/types, JSON netlist, longest combinational unit-depth path |
| SRAM | Original 1RW / 1R1W / common-clock 2RW; 64/256/1024 × 8/32/64; 27 combinations |
| Reliability | One isolated Worker per job, cancellation, 60 s simulation / 180 s synthesis watchdog, bounded UI/log/VCD work |

## v0.2: path explorer / RTL review / netlist sketch

- Workspace tools now collapse above the editors; no permanent left sidebar.
- Synthesis uses `synth -flatten -noabc` to retain more Yosys RTL source metadata. This deliberately differs from an ABC-optimized mapped design.
- Up to 10 candidate data paths, retaining the best 3 per node under the educational model. Launch/capture, cell types, connected signals and available RTL line references are visible; references may cover expressions, not exact per-gate locations.
- `EDU-GENERIC-v1` is an original, **arbitrary educational delay assumption**, not a process library or silicon benchmark. INV=0.04 ns; XOR/XNOR=0.12 ns; MUX=0.10 ns; other gates=0.07 ns; clock-to-Q=0.08 ns; setup=0.06 ns; uncertainty=0.10 ns. No slew/load/RC/clock skew/hold analysis. Target defaults to 100 MHz (10 ns), independently of TB clock.
- Estimated slack is available only for same-clock FF-to-FF data paths. I/O without delays, crossings, and latch designs are not assigned passing slack. It is **not OpenSTA timing or sign-off**.
- Rule-coded reports combine Yosys checks, heuristic RTL-style checks and clock-net topology review. CDC reports can identify potential crossings and a following FF; they do **not** certify 2FF safety, bus coherence, reconvergence, clock relations, reset crossing or protocol correctness. Review required. No report means no finding within implemented coverage, not a clean sign-off.
- Physical flow now visualizes actual netlist cells/connections on an arbitrary grid (max 180 cells / 400 connections), highlights selected path cells, links available source lines, and exports SVG. **Not placement/routing or an APR estimate.** No physical units, die/core area, DRC, congestion or timing may be inferred from this sketch.

## 尚未完成：真實 PPA / APR

**This release is not the complete RTL-to-GDS browser suite.** No online OpenSTA, OpenROAD, actual area, physical clock slack, critical timing path, cell power, physical placement/routing, CTS, SPEF, DRC/LVS or GDS generation is implemented. The new educational slack model and netlist sketch above are explicitly non-physical. The Physical flow panel exports a starting ORFS config, labelled unexecuted. It must be adapted/tested in a separate ORFS installation; it is not a remote execution service.

Generic cell count is **not** area (µm²). Unit logic depth is **not** timing (ns). No arbitrary power estimate is presented. A meaningful physical flow needs licensed technology/cell/macro Liberty/LEF/GDS, clock and I/O constraints, PVT corner, wire RC, activity assumptions and validated platform configuration.

Next backend milestone: authenticated queued jobs in per-job containers with CPU/RAM/time caps, no host mounts/secrets/network, audited PDK storage, report artifacts and ephemeral source deletion. Never expose a generic Tcl/shell endpoint or use a GitHub token in the frontend. Running untrusted RTL/Tcl is not safe in an ordinary long-lived Python/Node server. Hosting/provider/cost choice remains open; no paid infrastructure is provisioned.

## SRAM contract

- All ports active-high; data read synchronously after rising edge; output holds when disabled. No memory reset/initialization; unwritten words are X.
- 1RW: writes do not update dout. 1R1W: same-address simultaneous read/write returns OLD data.
- 2RW: common clock, OLD data on read/write collision. Simultaneous same-address dual writes are illegal; simulation reports an error and marks the word X. Synthesis excludes this simulation check; don't rely on write priority in hardware.
- Behavioral models are not TSMC macros and contain no foundry timing. Memory may synthesize into many FFs/muxes. Physical macros need separate mapping and legal views.

## Use

1. Edit `design.v` / `testbench.v`; set their top module names.
2. For waveforms, use `$dumpfile("dump.vcd"); $dumpvars(0,tb);` and end with `$finish`.
3. Run simulation and inspect the console; write explicit assertions/checks in your TB. Tool success is not a correctness verdict.
4. Run RTL checks, then synthesize. Fix diagnostics before evaluating topology.
5. Export project JSON and generated VCD/netlist before clearing browser data.

## Develop / test

```sh
npm test
npm run dev # http://127.0.0.1:5182
```

No npm dependencies/build are required. For real Icarus regression tests, run `node tests/prepare-engine.mjs` to download and hash-verify the six assets in `.engine-cache/`, then `npm run test:engine`. Never commit cache/tool binaries. Both unit and real-engine tests run in CI. Test details are documented in `tests/engine.mjs`.

GitHub Actions publishes the static site after unit checks. In repository Settings → Pages select GitHub Actions if first-run automatic enablement is unavailable. JS/WASM downloads may be blocked by local browser policy/CDN restrictions; cancel and retry or inspect the console. This release bounds rendering, but huge simulations can still exhaust Worker memory before the watchdog; use modest designs and dump scopes.

## License / privacy

Website and original SRAM models: GPL-2.0-or-later. See [license inventory](THIRD_PARTY_NOTICES.md) for Icarus, Verisim, Yosys, YoWASP, OpenROAD/OpenSTA and source links. No commercial EDA source, logo, proprietary PDK or foundry SRAM is copied. This project does not claim equivalent sign-off coverage to commercial products. No legal guarantee is made.

Code stays in the browser; same-origin GitHub Pages can access localStorage, so use no confidential material. CDN downloads disclose ordinary network metadata. No analytics or ads.
