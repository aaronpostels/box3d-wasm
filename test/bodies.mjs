// Stub for the bodies area (scaffold). No assertions yet: checks that the smoke wasm builds and imports nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wasm = new URL("../crates/box3d-smoke/target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url);
const module = new WebAssembly.Module(readFileSync(wasm));
assert.equal(WebAssembly.Module.imports(module).length, 0, "smoke module should import nothing");
assert.equal(typeof new WebAssembly.Instance(module, {}).exports.run, "function", "smoke module should export run");
console.log("ok bodies (scaffold)");
