# box3d-wasm

High-performance, zero-overhead WebAssembly compilation of Erin Catto's [Box3D](https://github.com/erincatto/box3d) (portable C17 3D rigid-body physics engine) tailored for web-based game engines.

---

## Why this build?

Existing community wrappers (such as `monteslu/box3d-wasm`) use Emscripten's **Embind**, which creates JavaScript wrapper objects, increases garbage collection pressure every frame, and pins outdated commits.

This implementation is built on three core design principles:
1. **Zero-GC Batch Synchronizations**: Object transforms (`[px, py, pz, qx, qy, qz, qw]`) are written into a contiguous native memory buffer in WASM memory (`HEAPF32`). Your game engine updates all entity transforms or WebGL/WebGPU instance buffers in one bulk operation with 0 object allocations.
2. **Native 128-bit SIMD**: Emscripten translates Box3D's SSE2 wide contact solver directly into WASM SIMD (`-msimd128 -msse2`).
3. **Automated Upstream Tracking**: Tracks `erincatto/box3d` as a git submodule with automated GitHub Actions CI checking for and building upstream commits on a weekly schedule.

---

## Architecture

```text
box3d-wasm/
├── vendor/box3d/           # Git submodule tracking erincatto/box3d
├── src/
│   ├── c/
│   │   ├── box3d_glue.h    # High-throughput C glue declarations
│   │   └── box3d_glue.c    # Bulk memory synchronization & flat FFI
│   └── ts/
│       ├── index.ts        # Module entrypoint & factory loader
│       ├── world.ts        # Ergonomic, zero-GC TypeScript engine wrapper
│       └── types.ts        # TypeScript declarations & math tuples
├── scripts/
│   ├── build.ps1           # Windows PowerShell build runner
│   └── build.sh            # Linux / macOS / WSL2 / CI build runner
├── examples/
│   ├── basic.ts            # Node.js / TS simulation test
│   └── demo.html           # In-browser test
├── .github/workflows/
│   └── ci.yml              # Automated build & upstream sync workflow
├── package.json
└── tsconfig.json
```

---

## Quick Start

### 1. Installation

```bash
npm i github:aaronpostels/box3d-wasm
```

### 2. Basic Engine Loop

```ts
import { initBox3D, Box3DWorld, BodyType } from "box3d-wasm";

const wasm = await initBox3D();
const world = new Box3DWorld(wasm, [0, -9.81, 0]);

// Create static ground
const groundId = world.createBody({ type: BodyType.Static, position: [0, -1, 0] });
world.createBoxShape(groundId, { halfWidth: 50, halfHeight: 1, halfDepth: 50 });

// Create dynamic entity
const entityId = world.createBody({ type: BodyType.Dynamic, position: [0, 10, 0] });
world.createSphereShape(entityId, { radius: 0.5, density: 1.0, restitution: 0.6 });

// Track bodies in engine
const bodyIds = [groundId, entityId];
const transformBuffer = new Float32Array(bodyIds.length * 7);

function gameLoop(dt: number) {
    // Step simulation
    world.step(dt, 4);

    // Sync all transforms into contiguous float array in 1 call (0 allocations)
    world.syncBatchTransforms(bodyIds, transformBuffer);

    // transformBuffer now contains [px, py, pz, qx, qy, qz, qw] for each entity
    requestAnimationFrame(gameLoop);
}
```

---

## Local Building

### Prerequisites

* Node.js 22+ & pnpm
* Emscripten SDK (`emcc`)

### Build Flavors

* **Standard (WASM SIMD + SSE2)**:
  ```powershell
  # Windows
  powershell -ExecutionPolicy Bypass -File scripts/build.ps1

  # Linux / WSL2
  bash scripts/build.sh simd
  ```

* **Scalar Fallback (No SIMD)**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Scalar
  ```

* **Multi-threaded (Web Workers & SharedArrayBuffer)**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Threads
  ```

### Full Build (WASM + TypeScript)

```bash
npm run build
```

---

## Updating Against Upstream Box3D

To pull the latest commits from Erin Catto's upstream repository locally:

```bash
npm run update:upstream
npm run build
```

In GitHub, the included workflow (`.github/workflows/ci.yml`) automatically checks for new Box3D commits every Monday and produces freshly compiled release artifacts.

---

## License

* Box3D is copyright (c) Erin Catto and licensed under the [MIT License](vendor/box3d/LICENSE).
* This WebAssembly wrapper and glue code is licensed under the [MIT License](LICENSE).
