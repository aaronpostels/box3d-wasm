// Snapshot test: a world saved at step 100 and restored must continue bit for bit like the original.
import assert from "node:assert/strict";
import factory from "../dist/box3d.js";

const m = await factory();
const f32 = (p, n) => new Float32Array(m.HEAPU8.buffer, p, n);
const ids = [];
const world = m._b3Glue_CreateWorld(0, -10, 0, 0, 0);
const pose = m._malloc(28), vel = m._malloc(24);
const setPose = (x, y, z) => f32(pose, 7).set([x, y, z, 0, 0, 0, 1]);
f32(vel, 6).fill(0);
setPose(0, -1, 0);
const ground = m._b3Glue_CreateBodyEx(world, 0, pose, vel, 1);
m._b3Glue_AddBox(ground, 50, 1, 50, 1, 0.5, 0, 2);
for (let i = 0; i < 150; i++) {
  setPose((i % 5) * 2.1, 2 + Math.floor(i / 25) * 2.1, (Math.floor(i / 5) % 5) * 2.1);
  const b = m._b3Glue_CreateBodyEx(world, 2, pose, vel, 1);
  if (i % 3 === 0) m._b3Glue_AddSphere(b, 0.9, 1, 0.5, 0, 2);
  else m._b3Glue_AddBox(b, 1, 1, 1, 1, 0.5, 0, 2);
  ids.push(b);
}
const idArr = m._malloc(8 * ids.length);
new BigUint64Array(m.HEAPU8.buffer, idArr, ids.length).set(ids);
const out = m._malloc(13 * 4 * ids.length);
const state = () => { m._b3Glue_GetBatchState(idArr, ids.length, out); return Array.from(f32(out, 13 * ids.length)); };
const run = (w, n) => { for (let i = 0; i < n; i++) m._b3Glue_Step(w, 1 / 60, 4); };

run(world, 100);
const snap = m._b3Glue_SnapshotTake(world);
const bytes = m.HEAPU8.slice(m._b3Glue_SnapshotData(snap), m._b3Glue_SnapshotData(snap) + m._b3Glue_SnapshotSize(snap));
m._b3Glue_SnapshotFree(snap);
run(world, 100);
const original = state();

const copy = m._malloc(bytes.length);
m.HEAPU8.set(bytes, copy);
const player = m._b3Glue_RestoreCreate(copy, bytes.length);
assert.ok(player, "restore failed");
const restored = m._b3Glue_RestoreWorld(player);
const n = m._b3Glue_RestoreBodyCount(player);
assert.equal(n, ids.length + 1, "restored body count");
// The restored world has its own body ids, in creation order: the ground first, then the boxes.
const rids = [];
for (let i = 1; i < n; i++) rids.push(m._b3Glue_RestoreBodyId(player, i));
new BigUint64Array(m.HEAPU8.buffer, idArr, ids.length).set(rids);
run(restored, 100);
const again = state();
assert.deepEqual(again, original, "restored world diverged");
console.log(`ok snapshot: ${bytes.length} bytes, ${ids.length} bodies, 100 steps after restore are identical`);
