# Third-party notices / 授權盤點

This is an independent open-source workbench, not affiliated with Synopsys, Siemens, Cadence, or their products. No proprietary EDA implementation, UI assets, foundry PDK, standard-cell library or SRAM compiler output is included.

## Website and original models

Copyright 2026 Xi-Zhu Wang. GPL-2.0-or-later. See [LICENSE](LICENSE).
Original SRAM behavioral models share this license; this does NOT impose a license on independently authored user RTL. Users retain rights to their inputs. Generated outputs may include tool/library material with its own terms.

## Icarus WebAssembly runtime

The browser downloads unmodified JS/WASM assets from **Verisim**, pinned to commit `a275a9ac28c59db1130505973644c9a3754ec1d7`. SHA-256 hashes are checked before execution. This repository does not redistribute the six tool binaries.

- Distributor/source/build instructions: https://github.com/senolgulgonul/verisim/tree/a275a9ac28c59db1130505973644c9a3754ec1d7
- Icarus source: https://github.com/steveicarus/iverilog
- Icarus core: GPL-2.0-or-later, with component-specific exceptions in upstream files; Verisim distributor license: GPL-2.0. See retained `engine/LICENSE-VERISIM-GPL-2.0.txt` and upstream file notices.
- Source adapter (`runtime-loader.js`, `runtime-manifest.js`, Icarus invocation) derives from Xi-Zhu Wang's GPL RTL Interview Lab: https://github.com/xizhuwang/rtl-interview-lab . Notices preserved.

If self-hosting binaries, preserve notices AND satisfy corresponding-source requirements, including exact patches and build scripts. A generic link to the newest upstream source is not a substitute for corresponding source. The upstream distribution's source completeness is not independently legally certified here.

## Yosys / YoWASP

The browser downloads `@yowasp/yosys@0.65.176-dev.1145` from jsDelivr, an unofficial WASM package. Version is pinned; unlike the Icarus loader, transitive package files do not currently have application-level integrity verification. CDN/runtime code executes in a Worker, not a security boundary for hostile third-party runtime code. Only use trusted upstreams. Users' RTL is passed to a local WASM filesystem, not sent to a compilation service.

- Package/source: https://github.com/YoWASP/yosys
- Runtime wrapper: https://github.com/YoWASP/runtime
- Yosys: ISC https://github.com/YosysHQ/yosys/blob/main/COPYING
- YoWASP package wrapper: ISC https://github.com/YoWASP/yosys/blob/develop/LICENSE.txt
- Preserve bundled Yosys/ABC/WASI/dependency notices if redistributing the package. ISC does not replace dependencies' licenses. `yosys -Q -T -p license` / upstream distribution contains component notices.

## Physical flow references (not bundled or executed)

- OpenROAD: BSD-3-Clause, https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/LICENSE
- OpenSTA: GPL-3.0, https://github.com/The-OpenROAD-Project/OpenSTA/blob/master/LICENSE
- OpenROAD-flow-scripts: BSD-3-Clause, https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts
- OpenRAM: BSD-3-Clause, https://github.com/VLSIDA/OpenRAM
- Platform/PDK/macro licenses must be reviewed individually. Nangate45 is a research platform, not a foundry manufacturing guarantee. No TSMC timing tables, libraries, LEF, GDS or NDA materials are included.

## Limitations

This is a technical license inventory, not a legal opinion or guarantee of non-infringement. It does not grant patent, foundry IP or trademark rights. Before commercial redistribution, hosting a paid service or bundling third-party binaries/PDKs, review exact versions and licenses with qualified counsel. GitHub Pages is not intended to host a commercial SaaS backend.
