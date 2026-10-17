// Loads the smoke module and runs it. Exit code 0 when every check inside passes.
import { readFileSync } from "node:fs";
const module = new WebAssembly.Module(readFileSync(new URL("./target/wasm32-unknown-unknown/release/box3d_smoke.wasm", import.meta.url)));
const imports = WebAssembly.Module.imports(module);
if (imports.length) throw new Error("the module should import nothing, got " + JSON.stringify(imports));
const code = new WebAssembly.Instance(module, {}).exports.run();
if (code !== 0) throw new Error("box3d-smoke failed with code " + code);
console.log("ok rust wasm32-unknown-unknown: no imports, step, events, ray, exact snapshot/restore");
