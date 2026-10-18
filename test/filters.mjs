// Filters area: shape category, mask and group, plus query filters on ray casts.
// The checks live in the Rust smoke module (crates/box3d-smoke/src/lib.rs, run_filters). A failed check returns its code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const module = new WebAssembly.Module(readFileSync(wasm));
assert.equal(WebAssembly.Module.imports(module).length, 0, "smoke module should import nothing");
const { run_filters } = new WebAssembly.Instance(module, {}).exports;
assert.equal(run_filters(), 0, "a filters check failed (the returned code is the check number)");
console.log("ok filters: category and mask pass-through, negative and positive groups, query filters");
