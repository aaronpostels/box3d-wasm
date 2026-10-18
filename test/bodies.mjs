// Bodies area: damping, gravity scale, motion locks, mass data, user data, enable/disable, batch impulses.
// The checks live in the Rust smoke module (crates/box3d-smoke/src/lib.rs, run_bodies). A failed check returns its code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const module = new WebAssembly.Module(readFileSync(wasm));
assert.equal(WebAssembly.Module.imports(module).length, 0, "smoke module should import nothing");
const { run_bodies } = new WebAssembly.Instance(module, {}).exports;
assert.equal(run_bodies(), 0, "a bodies check failed (the returned code is the check number)");
console.log("ok bodies: damping, gravity scale, motion locks, mass data, user data, enable/disable, batch impulses");
