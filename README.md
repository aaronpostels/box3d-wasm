# box3d-wasm

[Box3D](https://github.com/erincatto/box3d) (Erin Catto's C17 3D physics engine) compiled to WebAssembly, rebuilt automatically whenever upstream changes.

Two ways to use it:

| | For | What you get |
|---|---|---|
| **JS / TS** | web apps, any JS engine | `dist/box3d.wasm` (SIMD), a scalar build, a threaded build, and a small TypeScript wrapper |
| **Rust** | Rust engines that target the browser | crate `box3d-sys`: Box3D linked into your own `wasm32-unknown-unknown` module, no JS in the loop, no imports |

Box3D itself is alpha. This repo tracks its `main` branch: a daily job pulls upstream, builds, runs the tests, commits the new submodule revision and publishes a release. If upstream changes something that breaks the glue, the build goes red and the last good release stays.

## Status

| Area | State |
|---|---|
| Bodies (static, kinematic, dynamic), box / sphere / capsule shapes | done |
| Weld, revolute, prismatic joints | done |
| Contact and sensor events, ray cast, character mover (capsule) | done |
| Batch read of body state (one call for all bodies) | done |
| Exact world snapshot and restore (continues bit for bit) | done |
| SIMD and scalar builds give identical results | tested |
| Worker threads | Rust crate on a rayon pool (`use_rayon`, scales to about 8); not in the JS wrapper |
| Hull and mesh shapes, other joint types, shape casts and overlaps | not in the glue yet (the engine has them) |

## Roadmap

Wanted next (Artisan, the first user, tracks this in its own list):
- Glue: hull, mesh, compound and heightfield shapes; spherical, distance, wheel and motor joints; shape casts and overlaps; collision filters; moved-body events in one buffer; damping, gravity scale, motion locks, user data.
- TypeScript wrapper methods for the newer glue calls (they are typed, not wrapped).
- The daily upstream bump and release have not run on a real upstream change yet; npm publish; a test for the Emscripten threads build.

## JS / TS

```bash
npm i github:aaronpostels/box3d-wasm
```

```ts
import { initBox3D, Box3DWorld, BodyType } from "box3d-wasm";

const wasm = await initBox3D();
const world = new Box3DWorld(wasm, [0, -9.81, 0], { sleep: true, continuous: true });

const ground = world.createBody({ type: BodyType.Static, position: [0, -1, 0] });
world.createBoxShape(ground, { halfWidth: 50, halfHeight: 1, halfDepth: 50 });
const ball = world.createBody({ type: BodyType.Dynamic, position: [0, 10, 0] });
world.createSphereShape(ball, { radius: 0.5, density: 1, restitution: 0.6 });

const ids = [ground, ball];
const out = new Float32Array(ids.length * 7); // px py pz qx qy qz qw per body
world.step(1 / 60, 4);
world.syncBatchTransforms(ids, out);          // no allocation
```

The wrapper covers the basics. The whole glue API (`_b3Glue_*`, typed in `RawBox3DModule`) is on the module object for everything else: joints, events, character mover, snapshot. `test/snapshot.mjs` shows the raw calls.

## Rust

```toml
box3d-sys = { git = "https://github.com/aaronpostels/box3d-wasm", rev = "<commit>" }
```

Needs `clang` with the wasm32 target (`CC_wasm32_unknown_unknown=clang`, `AR_wasm32_unknown_unknown=llvm-ar`). `build.rs` compiles Box3D and the glue; a tiny libc (`crates/box3d-sys/include/libc`, `src/shim.c`) stands in for the C library, and Box3D's SSE2 code maps to WASM SIMD through Emscripten's header-only intrinsics. It also builds for the host (MSVC, clang, gcc) for native tests. If your Rust build uses shared memory (`+atomics`), the C is built with atomics too.

The API is flat: ids are integers, data moves in float buffers. See `crates/box3d-sys/src/lib.rs`; `crates/box3d-smoke` is a complete example (step, events, ray, snapshot and restore) that CI runs in Node.

## Build locally

You do not need to install Emscripten, Docker is enough:

```bash
docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:4.0.18 bash -c \
  "bash scripts/build.sh simd && bash scripts/build.sh scalar && bash scripts/build.sh threads"
npm install && npm run build:ts && npm test
```

Rust: `cd crates/box3d-smoke && cargo build --target wasm32-unknown-unknown --release && node run.mjs`.

Clone with `--recurse-submodules` (Box3D is `vendor/box3d`).

## Updating

CI does it daily. By hand: `npm run update:upstream`, then build and test. Pin a Rust build to a commit of this repo; a commit pins its Box3D revision.

## License

MIT. Third-party notices: [THIRD_PARTY.md](THIRD_PARTY.md).
