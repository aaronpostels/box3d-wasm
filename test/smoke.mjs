// Smoke test: every built flavor must drop a box on the ground and settle. Scalar and SIMD must agree bit for bit.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { initBox3D, Box3DWorld, BodyType } from "../dist/index.js";

const flavors = ["box3d.js", "box3d.scalar.js"];
const results = [];
for (const flavor of flavors) {
  const factory = (await import(pathToFileURL(resolve("dist", flavor)).href)).default;
  const world = new Box3DWorld(await initBox3D(factory), [0, -10, 0]);
  const ground = world.createBody({ type: BodyType.Static, position: [0, -1, 0] });
  world.createBoxShape(ground, { halfWidth: 50, halfHeight: 1, halfDepth: 50, friction: 0.5 });
  const ids = [];
  for (let i = 0; i < 200; i++) {
    const b = world.createBody({ type: BodyType.Dynamic, position: [(i % 10) * 2.2, 2 + Math.floor(i / 100) * 2.2 + ((i / 10) % 10 | 0) * 0, ((i / 10) | 0) % 10 * 2.2] });
    world.createBoxShape(b, { halfWidth: 1, halfHeight: 1, halfDepth: 1, density: 1, friction: 0.5 });
    ids.push(b);
  }
  const out = new Float32Array(ids.length * 7);
  for (let i = 0; i < 240; i++) world.step(1 / 60, 4);
  world.syncBatchTransforms(ids, out);
  assert.ok(out.every(Number.isFinite), `${flavor}: non-finite transform`);
  assert.ok(out[1] > 0.5 && out[1] < 10, `${flavor}: box not resting on the ground (y=${out[1]})`);
  results.push(Array.from(out));
  world.destroy();
  console.log(`ok ${flavor}`);
}
assert.deepEqual(results[0], results[1], "SIMD and scalar builds diverge");
console.log("ok simd == scalar");
