// Joints test. Two parts:
// 1. Smoke crate (always runs, no dist needed): run_joints in crates/box3d-smoke runs the strong checks (spherical,
//    wheel, motor spring, distance spring, limits, ...). Same checks as `cargo test -p box3d-smoke`. Needs the smoke wasm
//    (cargo build --release --target wasm32-unknown-unknown in crates/box3d-smoke).
// 2. Emscripten module (needs dist/box3d.js, npm run build:wasm): a rod keeps its length, a motor reaches its target
//    velocity, a filter joint lets a ball fall through a box that holds the other ball, and a rod carries its weight.
// When dist/ is missing, part 2 is skipped locally (exit 0). With CI set or REQUIRE_DIST=1 it fails instead.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const smokeWasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const smoke = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(smokeWasm)), {}).exports;
assert.equal(typeof smoke.run_joints, "function", "smoke module should export run_joints");
assert.equal(smoke.run_joints(), 0, "smoke joint checks failed");
console.log("ok smoke joint checks: distance rod, spring, limit, motor; motor; filter; spherical; wheel");

const distPath = resolve("dist", "box3d.js");
if (!existsSync(distPath)) {
  const required = Boolean(process.env.CI) || process.env.REQUIRE_DIST === "1";
  if (required) {
    console.error(`FAIL joints: ${distPath} not found, and CI or REQUIRE_DIST=1 is set. Run "npm run build:wasm" first.`);
    process.exit(1);
  }
  console.log(`Skipping joints dist scenarios: ${distPath} not found. Run "npm run build:wasm" first.`);
  process.exit(0);
}

const { default: factory } = await import("../dist/box3d.js");
const m = await factory();
const f32 = (p, n) => new Float32Array(m.HEAPU8.buffer, p, n);
const u64 = (p, n) => new BigUint64Array(m.HEAPU8.buffer, p, n);
const floats = (arr) => { const p = m._malloc(4 * arr.length); f32(p, arr.length).set(arr); return p; };
const zero3 = floats([0, 0, 0]);
const idBuf = m._malloc(8);
const stateBuf = m._malloc(13 * 4);
const reactBuf = m._malloc(6 * 4);

function body(world, kind, p, vel = [0, 0, 0, 0, 0, 0]) {
  return m._b3Glue_CreateBodyEx(world, kind, floats([p[0], p[1], p[2], 0, 0, 0, 1]), floats(vel), 0);
}
// Position, rotation, linear and angular velocity of one body (13 floats).
function state(b) {
  u64(idBuf, 1)[0] = b;
  m._b3Glue_GetBatchState(idBuf, 1, stateBuf);
  return Array.from(f32(stateBuf, 13));
}
const step = (world, n) => { for (let i = 0; i < n; i++) m._b3Glue_Step(world, 1 / 60, 4); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1. Rigid rod: a pendulum keeps its length and swings.
{
  const w = m._b3Glue_CreateWorld(0, -10, 0, 0, 0);
  const anchor = body(w, 0, [0, 10, 0]);
  const bob = body(w, 2, [1, 10, 0]);
  m._b3Glue_AddSphere(bob, 0.1, 1, 0.5, 0, 0);
  const j = m._b3Glue_CreateDistance(w, anchor, bob, zero3, zero3, 1);
  let minY = Infinity;
  for (let i = 0; i < 300; i++) {
    step(w, 1);
    const len = m._b3Glue_DistanceCurrentLength(j);
    assert.ok(near(len, 1, 0.02), `rod length drifted to ${len}`);
    minY = Math.min(minY, state(bob)[1]);
  }
  assert.ok(minY < 9, `pendulum never swung (lowest y ${minY})`);
  console.log("ok distance rod");
}

// 2. Motor joint: a free ball reaches the target linear velocity.
{
  const w = m._b3Glue_CreateWorld(0, 0, 0, 0, 0);
  const anchor = body(w, 0, [0, 0, 0]);
  const b = body(w, 2, [0, 0, 0]);
  m._b3Glue_AddSphere(b, 0.5, 1, 0.5, 0, 0);
  const j = m._b3Glue_CreateMotor(w, anchor, b, zero3, zero3);
  m._b3Glue_MotorSetMaxForce(j, 1e4, 1e4);
  m._b3Glue_MotorSetVelocity(j, floats([2, 0, 0, 0, 0, 0]));
  step(w, 60);
  const v = state(b).slice(7, 10);
  assert.ok(near(v[0], 2, 0.05) && near(v[1], 0, 0.05) && near(v[2], 0, 0.05), `linear velocity ${v}, want (2,0,0)`);
  console.log("ok motor joint");
}

// 3. Filter joint: the ball on the filtered pair falls through the box, the other ball rests on it.
{
  const w = m._b3Glue_CreateWorld(0, -10, 0, 0, 0);
  const ground = body(w, 0, [0, -1, 0]);
  m._b3Glue_AddBox(ground, 50, 1, 50, 1, 0.5, 0, 0);
  const resting = body(w, 2, [0, 0.4, 0]);
  m._b3Glue_AddSphere(resting, 0.5, 1, 0.5, 0, 0);
  const falling = body(w, 2, [5, 0.4, 0]);
  m._b3Glue_AddSphere(falling, 0.5, 1, 0.5, 0, 0);
  m._b3Glue_CreateFilter(w, ground, falling);
  step(w, 120);
  assert.ok(state(resting)[1] > 0.3, `unfiltered ball should rest on the box, y=${state(resting)[1]}`);
  assert.ok(state(falling)[1] < -2, `filtered ball should fall through, y=${state(falling)[1]}`);
  console.log("ok filter joint");
}

// 4. Reaction: a rod holding a still bob carries the bob's weight.
{
  const w = m._b3Glue_CreateWorld(0, -10, 0, 0, 0);
  const anchor = body(w, 0, [0, 10, 0]);
  const bob = body(w, 2, [0, 9, 0]);
  m._b3Glue_AddSphere(bob, 0.1, 1, 0.5, 0, 0);
  const j = m._b3Glue_CreateDistance(w, anchor, bob, zero3, zero3, 1);
  step(w, 200);
  const mass = m._b3Glue_BodyMass(bob);
  m._b3Glue_JointReaction(j, reactBuf);
  const r = Array.from(f32(reactBuf, 6));
  const force = Math.hypot(r[0], r[1], r[2]);
  assert.ok(near(force, mass * 10, 0.02 * mass * 10), `rod force ${force}, want weight ${mass * 10}`);
  console.log("ok joint reaction");
}
