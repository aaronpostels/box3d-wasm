// Shapes checks in the Rust smoke module (crates/box3d-smoke/src/lib.rs, section "shapes"). run_shapes returns 0,
// or 10 + the index of the first failing check. Build the smoke wasm first: cd crates/box3d-smoke && cargo build --target wasm32-unknown-unknown --release
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CHECKS = [
  "hull rests on floor, rejects fewer than 4 points, mass = volume * density",
  "offset and rotated box sits where its transform says",
  "compound body mass is the sum of its shapes",
  "per-shape friction changes sliding distance",
  "restitution changes the bounce",
  "density sets the mass of box and sphere",
  "sensor passes through and reports overlap",
  "contact events flag gates the events",
  "user material round-trips through the shape",
];

const wasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const module = new WebAssembly.Module(readFileSync(wasm));
assert.equal(WebAssembly.Module.imports(module).length, 0, "smoke module should import nothing");
const { run_shapes } = new WebAssembly.Instance(module, {}).exports;
assert.equal(typeof run_shapes, "function", "smoke module should export run_shapes");
const code = run_shapes();
assert.ok(code === 0 || (code >= 10 && code < 10 + CHECKS.length), `unexpected code ${code}`);
assert.equal(code, 0, `shapes check failed: ${CHECKS[code - 10]}`);
console.log(`ok shapes: ${CHECKS.length} checks`);
