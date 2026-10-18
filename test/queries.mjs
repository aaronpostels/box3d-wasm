// Queries glue: shape casts, overlaps, all-hits ray cast, capsule mover collide and cast. The assertions run inside the
// smoke module (crates/box3d-smoke, run_queries) on a fixed scene; each failed check returns its own code (101..137).
// No dist/ needed: this test reads only the smoke wasm, so a missing build fails here (readFileSync throws), never skips.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const module = new WebAssembly.Module(readFileSync(wasm));
assert.equal(WebAssembly.Module.imports(module).length, 0, "smoke module should import nothing");
const exports = new WebAssembly.Instance(module, {}).exports;
assert.equal(typeof exports.run_queries, "function", "smoke module should export run_queries");
const code = exports.run_queries();
assert.equal(code, 0, `query check ${code} failed`);
console.log("ok queries: shape casts, overlaps, all-hits ray, capsule mover collide and cast");
