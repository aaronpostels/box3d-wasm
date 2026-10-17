//! Runs Box3D inside a plain wasm32-unknown-unknown module, the way Artisan will: drop boxes on a floor, step,
//! snapshot, restore, and compare. `run` returns 0 when everything holds, or a code naming the failed check.
use box3d_sys::*;

fn build() -> (World, Vec<Body>) {
    unsafe {
        let w = b3Glue_CreateWorld(0.0, -10.0, 0.0, 0, 0);
        let vel = [0.0f32; 6];
        let ground = b3Glue_CreateBodyEx(w, BODY_STATIC, [0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0].as_ptr(), vel.as_ptr(), 0);
        b3Glue_AddBox(ground, 50.0, 1.0, 50.0, 1.0, 0.5, 0.0, SHAPE_CONTACT_EVENTS);
        let mut ids = Vec::new();
        for i in 0..150 {
            let (x, y, z) = ((i % 5) as f32 * 2.1, 2.0 + (i / 25) as f32 * 2.1, ((i / 5) % 5) as f32 * 2.1);
            let b = b3Glue_CreateBodyEx(w, BODY_DYNAMIC, [x, y, z, 0.0, 0.0, 0.0, 1.0].as_ptr(), vel.as_ptr(), BODY_ALLOW_SLEEP);
            if i % 3 == 0 {
                b3Glue_AddSphere(b, 0.9, 1.0, 0.5, 0.0, SHAPE_CONTACT_EVENTS);
            } else {
                b3Glue_AddBox(b, 1.0, 1.0, 1.0, 1.0, 0.5, 0.0, SHAPE_CONTACT_EVENTS);
            }
            ids.push(b);
        }
        (w, ids)
    }
}

fn state(ids: &[Body]) -> Vec<f32> {
    let mut out = vec![0.0f32; ids.len() * 13];
    unsafe { b3Glue_GetBatchState(ids.as_ptr(), ids.len() as i32, out.as_mut_ptr()) };
    out
}

#[no_mangle]
pub extern "C" fn run() -> i32 {
    let (w, ids) = build();
    unsafe {
        let mut events = 0;
        let mut buf = vec![0u64; 2 * 512];
        for _ in 0..100 {
            b3Glue_Step(w, 1.0 / 60.0, 4);
            events += b3Glue_ContactBeginEvents(w, buf.as_mut_ptr(), 512);
        }
        if events == 0 {
            return 1; // no contact events: boxes never landed
        }
        let snap = b3Glue_SnapshotTake(w);
        let bytes = core::slice::from_raw_parts(b3Glue_SnapshotData(snap), b3Glue_SnapshotSize(snap) as usize).to_vec();
        b3Glue_SnapshotFree(snap);
        for _ in 0..100 {
            b3Glue_Step(w, 1.0 / 60.0, 4);
        }
        let original = state(&ids);
        if !(original[1] > 0.5 && original[1] < 12.0) {
            return 2; // body not resting on the floor
        }
        let player = b3Glue_RestoreCreate(bytes.as_ptr(), bytes.len() as i32);
        if player.is_null() {
            return 3;
        }
        let rw = b3Glue_RestoreWorld(player);
        let rids: Vec<Body> = (1..b3Glue_RestoreBodyCount(player)).map(|i| b3Glue_RestoreBodyId(player, i)).collect();
        for _ in 0..100 {
            b3Glue_Step(rw, 1.0 / 60.0, 4);
        }
        if state(&rids) != original {
            return 4; // restored world diverged
        }
        // Ray down onto the pile.
        let mut hit = [0.0f32; 7];
        if b3Glue_RayClosest(rw, [0.0f32, 50.0, 0.0].as_ptr(), [0.0f32, -100.0, 0.0].as_ptr(), hit.as_mut_ptr()) == 0 {
            return 5;
        }
        b3Glue_RestoreDestroy(player);
        b3Glue_DestroyWorld(w);
    }
    0
}
