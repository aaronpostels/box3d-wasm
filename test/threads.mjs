// Threads flavour: loads dist/box3d.threads.js (Emscripten pthreads, shared memory) and steps a world on it.
// The threads build runs the same SIMD sources as dist/box3d.js, so its result must match that build bit for bit.
// Skips (exit 0, "Skipping") when dist/box3d.threads.js is missing, e.g. a checkout without a wasm build. With CI set or
// REQUIRE_DIST=1 a missing dist fails instead. CI builds dist before npm test.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const required = Boolean(process.env.CI) || process.env.REQUIRE_DIST === "1";
const threadsPath = resolve("dist", "box3d.threads.js");
if (!existsSync(threadsPath)) {
  if (required) {
    console.error(`FAIL threads: ${threadsPath} not found, and CI or REQUIRE_DIST=1 is set. Run "npm run build:wasm" first.`);
    process.exit(1);
  }
  console.log(`Skipping threads: ${threadsPath} not found. Run "npm run build:wasm" first (CI does this).`);
  process.exit(0);
}
const { initBox3D, Box3DWorld, BodyType } = await import("../dist/index.js");

async function stepScene(flavor) {
  const factory = (await import(pathToFileURL(resolve("dist", flavor)).href)).default;
  const module = await initBox3D(factory);
  const world = new Box3DWorld(module, [0, -10, 0]);
  const ground = world.createBody({ type: BodyType.Static, position: [0, -1, 0] });
  world.createBoxShape(ground, { halfWidth: 50, halfHeight: 1, halfDepth: 50, friction: 0.5 });
  const ids = [];
  for (let i = 0; i < 200; i++) {
    const b = world.createBody({ type: BodyType.Dynamic, position: [(i % 10) * 2.2, 2 + Math.floor(i / 100) * 2.2, (Math.floor(i / 10) % 10) * 2.2] });
    world.createBoxShape(b, { halfWidth: 1, halfHeight: 1, halfDepth: 1, density: 1, friction: 0.5 });
    ids.push(b);
  }
  for (let i = 0; i < 240; i++) world.step(1 / 60, 4);
  const out = new Float32Array(ids.length * 7);
  world.syncBatchTransforms(ids, out);
  world.destroy();
  return { module, out: Array.from(out) };
}

const threaded = await stepScene("box3d.threads.js");
assert.ok(threaded.module.HEAPU8.buffer instanceof SharedArrayBuffer, "threads build must run on shared memory");
assert.ok(threaded.out.every(Number.isFinite), "threads: non-finite transform");
assert.ok(threaded.out[1] > 0.5 && threaded.out[1] < 10, `threads: box not resting on the ground (y=${threaded.out[1]})`);
console.log("ok threads steps a world");

// The single-threaded SIMD build is the reference when it is built too.
if (existsSync(resolve("dist", "box3d.js"))) {
  const simd = await stepScene("box3d.js");
  assert.deepEqual(threaded.out, simd.out, "threads build diverges from the SIMD build");
  console.log("ok threads == simd");
} else if (required) {
  console.error("FAIL threads == simd: dist/box3d.js not found, and CI or REQUIRE_DIST=1 is set.");
  process.exit(1);
} else {
  console.log("Skipping threads == simd: dist/box3d.js not found");
}
