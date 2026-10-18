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
    let shapes = run_shapes();
    if shapes != 0 {
        return shapes;
    }
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

// ---- shapes ----
// Each check asserts one shape feature against physics or a query. run_shapes returns 0, or 10 + the index of the
// first failing check (the order is listed in test/shapes.mjs).

use box3d_sys::shapes::{self, ShapeParams};

const DT: f32 = 1.0 / 60.0;
const CUBE: [[f32; 3]; 8] = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [-0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
];
/// 90 degrees about z: local x becomes world y.
const QUARTER_Z: [f32; 4] = [0.0, 0.0, core::f32::consts::FRAC_1_SQRT_2, core::f32::consts::FRAC_1_SQRT_2];

fn shape_world() -> World {
    unsafe { b3Glue_CreateWorld(0.0, -10.0, 0.0, 0, 0) }
}

/// A body without sleep, at `pos` moving at `vel`.
fn shape_body(w: World, kind: i32, pos: [f32; 3], vel: [f32; 3]) -> Body {
    let pose = [pos[0], pos[1], pos[2], 0.0, 0.0, 0.0, 1.0];
    let v = [vel[0], vel[1], vel[2], 0.0, 0.0, 0.0];
    unsafe { b3Glue_CreateBodyEx(w, kind, pose.as_ptr(), v.as_ptr(), 0) }
}

/// Static floor whose top face is at `top`, friction 0.6, no bounce.
fn shape_floor(w: World, top: f32) -> Body {
    let g = shape_body(w, BODY_STATIC, [0.0, top - 1.0, 0.0], [0.0; 3]);
    unsafe { b3Glue_AddBox(g, 50.0, 1.0, 50.0, 1.0, 0.6, 0.0, 0) };
    g
}

fn shape_step(w: World, n: usize) {
    for _ in 0..n {
        unsafe { b3Glue_Step(w, DT, 4) };
    }
}

fn shape_state(b: Body) -> [f32; 13] {
    let mut out = [0.0f32; 13];
    let ids = [b];
    unsafe { b3Glue_GetBatchState(ids.as_ptr(), 1, out.as_mut_ptr()) };
    out
}

fn shape_mass(b: Body) -> f32 {
    unsafe { b3Glue_BodyMass(b) }
}

fn hull_rests_on_floor() -> bool {
    let w = shape_world();
    shape_floor(w, 0.0);
    let b = shape_body(w, BODY_DYNAMIC, [0.0, 3.0, 0.0], [0.0; 3]);
    let p = ShapeParams { density: 2.0, ..Default::default() };
    if shapes::add_hull(b, &CUBE[..3], &p).is_some() {
        return false; // three points cannot make a hull
    }
    if shapes::add_hull(b, &CUBE, &p).is_none() {
        return false;
    }
    shape_step(w, 240);
    let y = shape_state(b)[1];
    // A unit cube rests with its centre at half its height; density 2 makes its mass 2.
    (y - 0.5).abs() < 0.03 && (shape_mass(b) - 2.0).abs() < 1e-3
}

fn offset_rotated_box_is_where_it_should_be() -> bool {
    let w = shape_world();
    let b = shape_body(w, BODY_STATIC, [0.0; 3], [0.0; 3]);
    // Half extents 1 x 0.5 x 0.5, turned 90 degrees: world x spans [2.5, 3.5], world y spans [-1, 1].
    if shapes::add_box_transformed(b, [1.0, 0.5, 0.5], [3.0, 0.0, 0.0], QUARTER_Z, &ShapeParams::default()).is_none() {
        return false;
    }
    shape_step(w, 1);
    let ray = |x: f32| {
        let mut out = [0.0f32; 7];
        let hit = unsafe { b3Glue_RayClosest(w, [x, 10.0, 0.0].as_ptr(), [0.0f32, -20.0, 0.0].as_ptr(), out.as_mut_ptr()) };
        (hit, out[2])
    };
    let (hit_in, top) = ray(3.3);
    let (hit_out, _) = ray(3.7); // unrotated, this would hit the top at y = 0.5 instead of missing
    hit_in != 0 && (top - 1.0).abs() < 0.01 && hit_out == 0
}

fn compound_mass_is_sum() -> bool {
    let w = shape_world();
    let b = shape_body(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], [0.0; 3]);
    // Unit cube at density 2: mass 2. Box of volume 2 at density 3, turned: mass 6.
    let a = ShapeParams { density: 2.0, ..Default::default() };
    let c = ShapeParams { density: 3.0, ..Default::default() };
    if shapes::add_box_transformed(b, [0.5; 3], [-1.5, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0], &a).is_none() {
        return false;
    }
    let one = shape_mass(b);
    if shapes::add_box_transformed(b, [1.0, 0.5, 0.5], [1.5, 0.0, 0.0], QUARTER_Z, &c).is_none() {
        return false;
    }
    (one - 2.0).abs() < 1e-3 && (shape_mass(b) - 8.0).abs() < 1e-3
}

fn friction_changes_sliding_distance() -> bool {
    let w = shape_world();
    shape_floor(w, 0.0);
    // Both slide at 4 m/s on the same floor (friction 0.6). Shape friction 0 mixes to 0; 0.9 mixes to about 0.73.
    let slick = shape_body(w, BODY_DYNAMIC, [0.0, 0.5, 0.0], [4.0, 0.0, 0.0]);
    let grippy = shape_body(w, BODY_DYNAMIC, [0.0, 0.5, 5.0], [4.0, 0.0, 0.0]);
    unsafe {
        b3Glue_AddBox(slick, 0.5, 0.5, 0.5, 1.0, 0.0, 0.0, 0);
        b3Glue_AddBox(grippy, 0.5, 0.5, 0.5, 1.0, 0.9, 0.0, 0);
    }
    shape_step(w, 60);
    let slick_x = shape_state(slick)[0];
    let grippy_x = shape_state(grippy)[0];
    // Grippy stops after about 1.1 m; slick keeps going at 4 m/s, about 4 m in one second.
    slick_x > 3.0 && grippy_x < 2.0 && grippy_x < 0.5 * slick_x
}

fn restitution_changes_bounce() -> bool {
    let w = shape_world();
    shape_floor(w, 0.0);
    let bouncy = shape_body(w, BODY_DYNAMIC, [-3.0, 3.0, 0.0], [0.0; 3]);
    let dead = shape_body(w, BODY_DYNAMIC, [3.0, 3.0, 0.0], [0.0; 3]);
    unsafe {
        b3Glue_AddSphere(bouncy, 0.5, 1.0, 0.5, 0.9, 0);
        b3Glue_AddSphere(dead, 0.5, 1.0, 0.5, 0.0, 0);
    }
    // Drop from 3 m lands at 0.7 s. Peaks after 1 s: bouncy rises about 2 m, dead stays near 0.5 m.
    let (mut peak_bouncy, mut peak_dead) = (0.0f32, 0.0f32);
    for step in 0..180 {
        shape_step(w, 1);
        if step >= 60 {
            peak_bouncy = peak_bouncy.max(shape_state(bouncy)[1]);
            peak_dead = peak_dead.max(shape_state(dead)[1]);
        }
    }
    peak_bouncy > 2.0 && peak_dead < 0.8
}

fn density_sets_mass() -> bool {
    let w = shape_world();
    let a = shape_body(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], [0.0; 3]);
    let b = shape_body(w, BODY_DYNAMIC, [5.0, 5.0, 0.0], [0.0; 3]);
    unsafe {
        b3Glue_AddBox(a, 0.5, 0.5, 0.5, 3.0, 0.5, 0.0, 0); // volume 1, density 3
        b3Glue_AddSphere(b, 1.0, 2.0, 0.5, 0.0, 0); // volume 4/3 pi, density 2
    }
    (shape_mass(a) - 3.0).abs() < 1e-3 && (shape_mass(b) - 2.0 * 4.0 / 3.0 * core::f32::consts::PI).abs() < 1e-2
}

fn sensor_passes_through_but_reports() -> bool {
    let w = shape_world();
    shape_floor(w, -4.0);
    // A static sensor slab from y = -0.5 to 0.5, above a solid floor whose top is at y = -4.
    let slab = shape_body(w, BODY_STATIC, [0.0; 3], [0.0; 3]);
    unsafe { b3Glue_AddBox(slab, 3.0, 0.5, 3.0, 1.0, 0.5, 0.0, SHAPE_SENSOR) };
    let falling = shape_body(w, BODY_DYNAMIC, [0.0, 4.0, 0.0], [0.0; 3]);
    unsafe { b3Glue_AddBox(falling, 0.5, 0.5, 0.5, 1.0, 0.5, 0.0, 0) };
    let mut buf = [0u64; 128];
    let mut begins = 0;
    for _ in 0..180 {
        shape_step(w, 1);
        begins += unsafe { b3Glue_SensorBeginEvents(w, buf.as_mut_ptr(), 64) };
    }
    // It falls through the slab and lands on the floor: centre at -4 + 0.5.
    let y = shape_state(falling)[1];
    begins > 0 && (y + 3.5).abs() < 0.05
}

fn contact_events_flag_gates_events() -> bool {
    let w = shape_world();
    shape_floor(w, 0.0);
    let quiet = shape_body(w, BODY_DYNAMIC, [-5.0, 3.0, 0.0], [0.0; 3]);
    let loud = shape_body(w, BODY_DYNAMIC, [5.0, 3.0, 0.0], [0.0; 3]);
    let (quiet_shape, loud_shape) = unsafe {
        (
            b3Glue_AddBox(quiet, 0.5, 0.5, 0.5, 1.0, 0.5, 0.0, 0),
            b3Glue_AddBox(loud, 0.5, 0.5, 0.5, 1.0, 0.5, 0.0, SHAPE_CONTACT_EVENTS),
        )
    };
    let mut buf = [0u64; 128];
    let (mut quiet_n, mut loud_n) = (0, 0);
    for _ in 0..120 {
        shape_step(w, 1);
        let n = unsafe { b3Glue_ContactBeginEvents(w, buf.as_mut_ptr(), 64) } as usize;
        for pair in buf[..2 * n].chunks_exact(2) {
            for id in pair {
                if *id == quiet_shape {
                    quiet_n += 1;
                }
                if *id == loud_shape {
                    loud_n += 1;
                }
            }
        }
    }
    quiet_n == 0 && loud_n > 0
}

fn user_material_round_trips() -> bool {
    let w = shape_world();
    let b = shape_body(w, BODY_DYNAMIC, [0.0, 3.0, 0.0], [0.0; 3]);
    let hull = shapes::add_hull(b, &CUBE, &ShapeParams { user_material: 42, ..Default::default() });
    let boxed = shapes::add_box_transformed(b, [0.5; 3], [3.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0], &ShapeParams { user_material: 7, ..Default::default() });
    match (hull, boxed) {
        (Some(h), Some(x)) => shapes::user_material(h) == 42 && shapes::user_material(x) == 7,
        _ => false,
    }
}

/// Runs every shapes check. 0 when all hold, else 10 + the index of the first that fails.
#[no_mangle]
pub extern "C" fn run_shapes() -> i32 {
    let checks: [fn() -> bool; 9] = [
        hull_rests_on_floor,
        offset_rotated_box_is_where_it_should_be,
        compound_mass_is_sum,
        friction_changes_sliding_distance,
        restitution_changes_bounce,
        density_sets_mass,
        sensor_passes_through_but_reports,
        contact_events_flag_gates_events,
        user_material_round_trips,
    ];
    for (i, check) in checks.iter().enumerate() {
        if !check() {
            return 10 + i as i32;
        }
    }
    0
}

// ---- joints ----

// Strong joint checks. Each is a plain `pub fn` for `run_joints` and, via `cfg_attr(test, test)`, a test for
// `cargo test -p box3d-smoke`. A failed assert panics, which traps the wasm module.
// They are not in `run`, so the wasm module stays as it was.
mod joint_checks {
    use super::*;
    use box3d_sys::joints::*;

    const DT: f32 = 1.0 / 60.0;
    const IDENT: [f32; 4] = [0.0, 0.0, 0.0, 1.0];

    // Parallel test threads crashed the native test binary when they built worlds at once, so the tests take turns.
    fn serial() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn world(gy: f32) -> World {
        unsafe { b3Glue_CreateWorld(0.0, gy, 0.0, 0, 0) }
    }

    fn body(w: World, kind: i32, pos: [f32; 3], rot: [f32; 4], vel6: [f32; 6]) -> Body {
        let pose = [pos[0], pos[1], pos[2], rot[0], rot[1], rot[2], rot[3]];
        unsafe { b3Glue_CreateBodyEx(w, kind, pose.as_ptr(), vel6.as_ptr(), 0) }
    }

    fn ball(b: Body, radius: f32) {
        unsafe { b3Glue_AddSphere(b, radius, 1.0, 0.5, 0.0, 0) };
    }

    fn step(w: World, n: usize) {
        for _ in 0..n {
            unsafe { b3Glue_Step(w, DT, 4) };
        }
    }

    // Batch state of one body: position, rotation, linear velocity, angular velocity (13 floats).
    fn state(b: Body) -> [f32; 13] {
        let mut out = [0.0f32; 13];
        unsafe { b3Glue_GetBatchState([b].as_ptr(), 1, out.as_mut_ptr()) };
        out
    }

    fn pos(b: Body) -> [f32; 3] {
        let s = state(b);
        [s[0], s[1], s[2]]
    }

    fn lin_vel(b: Body) -> [f32; 3] {
        let s = state(b);
        [s[7], s[8], s[9]]
    }

    fn ang_vel(b: Body) -> [f32; 3] {
        let s = state(b);
        [s[10], s[11], s[12]]
    }

    fn near(a: f32, b: f32, tol: f32) -> bool {
        (a - b).abs() <= tol
    }

    #[cfg_attr(test, test)]
    pub fn distance_rod_keeps_length_and_swings() {
        let _s = serial();
        let w = world(-10.0);
        let anchor = body(w, BODY_STATIC, [0.0, 10.0, 0.0], IDENT, [0.0; 6]);
        let bob = body(w, BODY_DYNAMIC, [1.0, 10.0, 0.0], IDENT, [0.0; 6]);
        ball(bob, 0.1);
        let j = create_distance(w, anchor, bob, [0.0; 3], [0.0; 3], 1.0);
        let mut min_y = f32::MAX;
        for _ in 0..300 {
            step(w, 1);
            assert!(near(distance_current_length(j), 1.0, 0.02), "rod length drifted to {}", distance_current_length(j));
            min_y = min_y.min(pos(bob)[1]);
        }
        assert!(min_y < 9.0, "pendulum never swung (lowest y {min_y})");
    }

    #[cfg_attr(test, test)]
    pub fn distance_rod_reaction_holds_weight() {
        let _s = serial();
        let w = world(-10.0);
        let anchor = body(w, BODY_STATIC, [0.0, 10.0, 0.0], IDENT, [0.0; 6]);
        let bob = body(w, BODY_DYNAMIC, [0.0, 9.0, 0.0], IDENT, [0.0; 6]);
        ball(bob, 0.1);
        let j = create_distance(w, anchor, bob, [0.0; 3], [0.0; 3], 1.0);
        step(w, 200);
        let mass = unsafe { b3Glue_BodyMass(bob) };
        let r = reaction(j);
        let force = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt();
        assert!(near(force, mass * 10.0, 0.02 * mass * 10.0), "rod force {force} should be weight {}", mass * 10.0);
    }

    #[cfg_attr(test, test)]
    pub fn distance_spring_oscillates_about_rest_length() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let bob = body(w, BODY_DYNAMIC, [1.5, 0.0, 0.0], IDENT, [0.0; 6]);
        ball(bob, 0.1);
        let j = create_distance(w, anchor, bob, [0.0; 3], [0.0; 3], 1.0);
        distance_set_spring(j, true, 2.0, 0.2, f32::MIN, f32::MAX);
        let mut min_len = f32::MAX;
        let mut crossings = 0;
        let mut was_above = true;
        for _ in 0..240 {
            step(w, 1);
            let len = distance_current_length(j);
            min_len = min_len.min(len);
            let above = len > 1.0;
            if above != was_above {
                crossings += 1;
                was_above = above;
            }
        }
        assert!(min_len < 0.95, "spring never compressed below rest length (min {min_len})");
        assert!(crossings >= 6, "spring should cross rest length repeatedly, got {crossings} crossings");
    }

    #[cfg_attr(test, test)]
    pub fn distance_length_limit_stops_outward_motion() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let bob = body(w, BODY_DYNAMIC, [1.0, 0.0, 0.0], IDENT, [2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        ball(bob, 0.1);
        let j = create_distance(w, anchor, bob, [0.0; 3], [0.0; 3], 1.0);
        // Spring on with zero stiffness: the joint is free, so only the limit acts.
        distance_set_spring(j, true, 0.0, 0.0, f32::MIN, f32::MAX);
        distance_set_length_range(j, true, 0.5, 1.2);
        let mut max_len = 0.0f32;
        for _ in 0..120 {
            step(w, 1);
            max_len = max_len.max(distance_current_length(j));
        }
        assert!(max_len <= 1.25, "limit let the rope reach {max_len}");
        assert!(max_len >= 1.1, "bob should reach the limit, reached only {max_len}");
    }

    #[cfg_attr(test, test)]
    pub fn distance_motor_pulls_length_at_speed() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let bob = body(w, BODY_DYNAMIC, [1.0, 0.0, 0.0], IDENT, [0.0; 6]);
        ball(bob, 0.1);
        let j = create_distance(w, anchor, bob, [0.0; 3], [0.0; 3], 1.0);
        distance_set_spring(j, true, 0.0, 0.0, f32::MIN, f32::MAX);
        distance_set_motor(j, true, 1.0, 100.0);
        step(w, 60);
        let len = distance_current_length(j);
        assert!(near(len, 2.0, 0.15), "motor should lengthen the rope at 1 m/s, length after 1 s is {len}");
    }

    #[cfg_attr(test, test)]
    pub fn motor_joint_reaches_target_velocity() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let b = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0; 6]);
        ball(b, 0.5);
        let j = create_motor(w, anchor, b, [0.0; 3], [0.0; 3]);
        motor_set_max_force(j, 1.0e4, 1.0e4);
        motor_set_velocity(j, [2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        step(w, 60);
        let v = lin_vel(b);
        assert!(near(v[0], 2.0, 0.05) && near(v[1], 0.0, 0.05) && near(v[2], 0.0, 0.05), "linear velocity {v:?}, want (2,0,0)");
    }

    #[cfg_attr(test, test)]
    pub fn motor_joint_spring_returns_to_target() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let b = body(w, BODY_DYNAMIC, [0.5, 0.0, 0.0], IDENT, [0.0; 6]);
        ball(b, 0.5);
        let j = create_motor(w, anchor, b, [0.0; 3], [0.0; 3]);
        // No velocity drive (zero max force), so only the position spring acts.
        motor_set_max_force(j, 0.0, 0.0);
        motor_set_spring(j, [2.0, 0.7, 1.0e3], [2.0, 0.7, 1.0e3]);
        step(w, 240);
        let p = pos(b);
        assert!(near(p[0], 0.0, 0.05) && near(p[1], 0.0, 0.05) && near(p[2], 0.0, 0.05), "spring should bring the body to the target, at {p:?}");
    }

    #[cfg_attr(test, test)]
    pub fn filter_joint_lets_bodies_pass_through() {
        // Same drop twice: with a filter joint the ball falls through the box, without one it rests on top.
        let fall = |filter: bool| -> f32 {
            let _s = serial();
            let w = world(-10.0);
            let ground = body(w, BODY_STATIC, [0.0, -1.0, 0.0], IDENT, [0.0; 6]);
            unsafe { b3Glue_AddBox(ground, 50.0, 1.0, 50.0, 1.0, 0.5, 0.0, 0) };
            let ball_b = body(w, BODY_DYNAMIC, [0.0, 0.4, 0.0], IDENT, [0.0; 6]);
            ball(ball_b, 0.5);
            if filter {
                create_filter(w, ground, ball_b);
            }
            step(w, 120);
            let y = pos(ball_b)[1];
            unsafe { b3Glue_DestroyWorld(w) };
            y
        };
        let resting = fall(false);
        let through = fall(true);
        assert!(resting > 0.3, "without a filter the ball should rest on the box, y={resting}");
        assert!(through < -2.0, "with a filter the ball should fall through, y={through}");
    }

    #[cfg_attr(test, test)]
    pub fn spherical_cone_limit_holds() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        // Body B spins about y: its frame z tilts away from frame A z at 5 rad/s, the cone of 0.3 rad must stop it.
        let b = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0, 0.0, 0.0, 0.0, 5.0, 0.0]);
        ball(b, 0.5);
        let j = create_spherical(w, anchor, b, [0.0; 3], [0.0; 3]);
        spherical_set_cone(j, true, 0.3);
        let mut max_cone = 0.0f32;
        for i in 0..120 {
            step(w, 1);
            if i > 30 {
                max_cone = max_cone.max(spherical_angles(j)[0]);
            }
        }
        assert!(max_cone <= 0.35, "cone limit let the tilt reach {max_cone} rad");
    }

    #[cfg_attr(test, test)]
    pub fn spherical_twist_limit_holds() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        // Spin about frame z (the twist axis): the twist limit of +-0.3 rad must stop it.
        let b = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0, 0.0, 0.0, 0.0, 0.0, 5.0]);
        ball(b, 0.5);
        let j = create_spherical(w, anchor, b, [0.0; 3], [0.0; 3]);
        spherical_set_twist(j, true, -0.3, 0.3);
        let mut max_twist = 0.0f32;
        for i in 0..120 {
            step(w, 1);
            if i > 30 {
                max_twist = max_twist.max(spherical_angles(j)[1].abs());
            }
        }
        assert!(max_twist <= 0.35, "twist limit let the twist reach {max_twist} rad");
    }

    #[cfg_attr(test, test)]
    pub fn spherical_spring_returns_to_target_rotation() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        // Start rotated 0.5 rad about z; the spring pulls back to the identity target.
        let half = 0.25f32;
        let b = body(w, BODY_DYNAMIC, [0.0; 3], [0.0, 0.0, half.sin(), half.cos()], [0.0; 6]);
        ball(b, 0.5);
        let j = create_spherical(w, anchor, b, [0.0; 3], [0.0; 3]);
        spherical_set_spring(j, true, 2.0, 0.5, IDENT);
        let mut max_twist = 0.0f32;
        for i in 0..240 {
            step(w, 1);
            if i > 0 {
                max_twist = max_twist.max(spherical_angles(j)[1].abs());
            }
        }
        assert!(max_twist > 0.3, "the spring should see the 0.5 rad start, max twist {max_twist}");
        let end = spherical_angles(j)[1].abs();
        assert!(end < 0.05, "spring should settle at the target rotation, twist {end}");
    }

    #[cfg_attr(test, test)]
    pub fn spherical_motor_reaches_target_velocity() {
        let _s = serial();
        let w = world(0.0);
        let anchor = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let b = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0; 6]);
        ball(b, 0.5);
        let j = create_spherical(w, anchor, b, [0.0; 3], [0.0; 3]);
        spherical_set_motor(j, true, [0.0, 0.0, 3.0], 1.0e4);
        step(w, 60);
        let v = ang_vel(b);
        assert!(near(v[2], 3.0, 0.05) && near(v[0], 0.0, 0.05) && near(v[1], 0.0, 0.05), "angular velocity {v:?}, want (0,0,3)");
    }

    #[cfg_attr(test, test)]
    pub fn wheel_spin_motor_reaches_speed() {
        let _s = serial();
        let w = world(0.0);
        let chassis = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let wheel = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0; 6]);
        ball(wheel, 0.5);
        let j = create_wheel(w, chassis, wheel, [0.0; 3], [0.0; 3], [1.0, 0.0, 0.0]);
        wheel_set_spin(j, true, 5.0, 1.0e3);
        step(w, 60);
        let spin = wheel_state(j)[0];
        assert!(near(spin, 5.0, 0.1), "spin speed {spin}, want 5 rad/s");
        let wz = ang_vel(wheel)[2].abs();
        assert!(near(wz, 5.0, 0.1), "wheel angular velocity about its axis {wz}, want 5");
    }

    #[cfg_attr(test, test)]
    pub fn wheel_suspension_limit_stops_fall() {
        let _s = serial();
        let w = world(-10.0);
        let chassis = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let wheel = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0; 6]);
        ball(wheel, 0.5);
        // Suspension along world y. Gravity pulls the wheel down; the lower limit at -0.1 m must hold it.
        let j = create_wheel(w, chassis, wheel, [0.0; 3], [0.0; 3], [0.0, 1.0, 0.0]);
        wheel_set_suspension(j, false, 0.0, 0.0, true, -0.1, 0.1);
        step(w, 120);
        let p = pos(wheel);
        assert!(near(p[1], -0.1, 0.02), "wheel should stop at the lower suspension limit, y={}", p[1]);
        assert!(near(p[0], 0.0, 0.02) && near(p[2], 0.0, 0.02), "wheel should stay on the suspension line, at {p:?}");
    }

    #[cfg_attr(test, test)]
    pub fn wheel_steering_reaches_target_angle() {
        let _s = serial();
        let w = world(0.0);
        let chassis = body(w, BODY_STATIC, [0.0; 3], IDENT, [0.0; 6]);
        let wheel = body(w, BODY_DYNAMIC, [0.0; 3], IDENT, [0.0; 6]);
        ball(wheel, 0.5);
        let j = create_wheel(w, chassis, wheel, [0.0; 3], [0.0; 3], [1.0, 0.0, 0.0]);
        wheel_set_steering(j, true, 4.0, 0.7, 0.4, 1.0e3, false, 0.0, 0.0);
        step(w, 120);
        let angle = wheel_state(j)[1];
        assert!(near(angle, 0.4, 0.02), "steering angle {angle}, want 0.4 rad");
    }
}

/// Runs every joint check in the wasm module. Returns 0 when all hold; a failed check traps with its message.
#[no_mangle]
pub extern "C" fn run_joints() -> i32 {
    use joint_checks::*;
    distance_rod_keeps_length_and_swings();
    distance_rod_reaction_holds_weight();
    distance_spring_oscillates_about_rest_length();
    distance_length_limit_stops_outward_motion();
    distance_motor_pulls_length_at_speed();
    motor_joint_reaches_target_velocity();
    motor_joint_spring_returns_to_target();
    filter_joint_lets_bodies_pass_through();
    spherical_cone_limit_holds();
    spherical_twist_limit_holds();
    spherical_spring_returns_to_target_rotation();
    spherical_motor_reaches_target_velocity();
    wheel_spin_motor_reaches_speed();
    wheel_suspension_limit_stops_fall();
    wheel_steering_reaches_target_angle();
    0
}

// ---- queries ----

use box3d_sys::queries::{self as q, Capsule, Proxy};

fn near(a: f32, b: f32, tol: f32) -> bool {
    (a - b).abs() <= tol
}

fn sorted(mut v: Vec<Shape>) -> Vec<Shape> {
    v.sort_unstable();
    v
}

/// Static scene: ground top at y = 0, a sphere, a box and a capsule above it, and a row of 20 small spheres along +x.
struct QueryScene {
    w: World,
    ground: Shape,
    sphere: Shape,
    boxed: Shape,
    capsule: Shape,
    row: Vec<Shape>,
}

fn query_scene() -> QueryScene {
    unsafe {
        let w = b3Glue_CreateWorld(0.0, -10.0, 0.0, 0, 0);
        let vel = [0.0f32; 6];
        let body = |x: f32, y: f32, z: f32| b3Glue_CreateBodyEx(w, BODY_STATIC, [x, y, z, 0.0, 0.0, 0.0, 1.0].as_ptr(), vel.as_ptr(), 0);
        let ground = b3Glue_AddBox(body(0.0, -1.0, 0.0), 50.0, 1.0, 50.0, 1.0, 0.5, 0.0, 0);
        let sphere = b3Glue_AddSphere(body(0.0, 5.0, 0.0), 0.5, 1.0, 0.5, 0.0, 0);
        let boxed = b3Glue_AddBox(body(10.0, 3.0, 0.0), 1.0, 1.0, 1.0, 1.0, 0.5, 0.0, 0);
        let capsule = b3Glue_AddCapsule(body(-10.0, 2.0, 0.0), 1.0, 0.5, 1.0, 0.5, 0.0, 0);
        let row = (0..20).map(|i| b3Glue_AddSphere(body(20.0 + 0.5 * i as f32, 5.0, 0.0), 0.1, 1.0, 0.5, 0.0, 0)).collect();
        QueryScene { w, ground, sphere, boxed, capsule, row }
    }
}

/// Runs the query checks on a fixed scene. Returns 0 when all hold, else a code 101..=137 naming the failed check.
#[no_mangle]
pub extern "C" fn run_queries() -> i32 {
    let s = query_scene();
    let w = s.w;

    // Ray cast, all hits: sphere then ground, sorted by fraction.
    let hits = q::cast_ray_all(w, [0.0, 20.0, 0.0], [0.0, -40.0, 0.0]);
    if hits.len() != 2 || hits[0].shape != s.sphere || hits[1].shape != s.ground {
        return 101;
    }
    if !near(hits[0].fraction, 0.3625, 1e-4) || !near(hits[1].fraction, 0.5, 1e-4) {
        return 102;
    }
    if hits[0].normal[1] < 0.99 {
        return 103;
    }
    // 20 hits, more than the first buffer holds, so the wrapper must grow it.
    let row = q::cast_ray_all(w, [15.0, 5.0, 0.0], [20.0, 0.0, 0.0]);
    if row.len() != 20 || row.iter().map(|h| h.shape).ne(s.row.iter().copied()) {
        return 104;
    }
    if !near(row[0].fraction, 0.245, 1e-4) || !row.windows(2).all(|p| p[0].fraction < p[1].fraction) {
        return 105;
    }

    // Truncated ray cast: a buffer smaller than the hit count keeps the nearest hits, sorted, and still reports the
    // total. Traversal order is not distance order, so both ray directions are checked: from the far end the nearest
    // three are row 19, 18, 17; from the near end the nearest two are row 0, 1.
    let mut far_ids = [0u64; 3];
    let mut far_out = [0.0f32; 21];
    let far_total = unsafe {
        q::b3Glue_CastRayAll(w, [35.0f32, 5.0, 0.0].as_ptr(), [-20.0f32, 0.0, 0.0].as_ptr(), far_ids.as_mut_ptr(), far_out.as_mut_ptr(), 3)
    };
    if far_total != 20 || far_ids != [s.row[19], s.row[18], s.row[17]] {
        return 136;
    }
    if !(far_out[0] < far_out[7] && far_out[7] < far_out[14]) {
        return 137;
    }
    let mut near_ids = [0u64; 2];
    let mut near_out = [0.0f32; 14];
    let near_total = unsafe {
        q::b3Glue_CastRayAll(w, [15.0f32, 5.0, 0.0].as_ptr(), [20.0f32, 0.0, 0.0].as_ptr(), near_ids.as_mut_ptr(), near_out.as_mut_ptr(), 2)
    };
    if near_total != 20 || near_ids != [s.row[0], s.row[1]] {
        return 136;
    }
    if !(near_out[0] < near_out[7]) {
        return 137;
    }

    // Overlap by AABB.
    if q::overlap_aabb(w, [-1.0, 4.0, -1.0], [1.0, 6.0, 1.0]) != vec![s.sphere] {
        return 110;
    }
    if sorted(q::overlap_aabb(w, [-11.0, -1.0, -2.0], [12.0, 3.8, 2.0])) != sorted(vec![s.boxed, s.capsule, s.ground]) {
        return 111;
    }

    // Overlap by shape.
    if q::overlap_shape(w, &Proxy::Sphere { radius: 1.0 }, [0.0, 5.2, 0.0]) != vec![s.sphere] {
        return 112;
    }
    if q::overlap_shape(w, &Proxy::Box { half: [0.1, 0.1, 0.1] }, [-10.0, 2.0, 0.0]) != vec![s.capsule] {
        return 113;
    }
    let tri = [[9.5, 3.0, 0.0], [10.0, 3.5, 0.0], [10.5, 2.5, 0.0]];
    if q::overlap_shape(w, &Proxy::Hull { radius: 0.1, points: &tri }, [0.0, 0.0, 0.0]) != vec![s.boxed] {
        return 114;
    }
    if q::overlap_shape(w, &Proxy::Capsule { half_height: 0.2, radius: 0.1 }, [-10.0, 2.0, 0.0]) != vec![s.capsule] {
        return 115;
    }
    if !q::overlap_shape(w, &Proxy::Sphere { radius: 1.0 }, [0.0, 20.0, 0.0]).is_empty() {
        return 116;
    }

    // Shape cast, closest hit.
    let Some(h) = q::cast_shape(w, &Proxy::Sphere { radius: 0.5 }, [0.0, 20.0, 0.0], [0.0, -40.0, 0.0]) else { return 121 };
    if h.shape != s.sphere || !near(h.fraction, 0.35, 1e-3) || h.normal[1] < 0.99 {
        return 122;
    }
    let Some(h) = q::cast_shape(w, &Proxy::Box { half: [0.5, 0.5, 0.5] }, [10.0, 10.0, 0.0], [0.0, -20.0, 0.0]) else { return 123 };
    if h.shape != s.boxed || !near(h.fraction, 0.275, 1e-3) {
        return 124;
    }
    let Some(h) = q::cast_shape(w, &Proxy::Capsule { half_height: 0.5, radius: 0.5 }, [-10.0, 10.0, 0.0], [0.0, -20.0, 0.0]) else { return 125 };
    if h.shape != s.capsule || !near(h.fraction, 0.275, 1e-3) {
        return 126;
    }
    let hull = [[-0.5, 0.0, -0.5], [0.5, 0.0, -0.5], [0.0, 0.0, 0.5], [0.0, 0.5, 0.0]];
    let Some(h) = q::cast_shape(w, &Proxy::Hull { radius: 0.1, points: &hull }, [-30.0, 20.0, 0.0], [0.0, -40.0, 0.0]) else { return 127 };
    if h.shape != s.ground || !near(h.fraction, 0.4975, 1e-3) {
        return 128;
    }
    if q::cast_shape(w, &Proxy::Sphere { radius: 0.5 }, [-30.0, 20.0, 0.0], [0.0, -10.0, 0.0]).is_some() {
        return 129;
    }

    // Capsule mover: collide (penetrating the ground, and the capsule shape), self filter, and cast.
    let standing = Capsule { center1: [0.0, -1.0, 0.0], center2: [0.0, 1.0, 0.0], radius: 0.5 };
    if !q::collide_mover(w, [-30.0, 1.0, 0.0], standing, None).iter().any(|p| p.shape == s.ground && p.normal[1] > 0.9) {
        return 131;
    }
    let low = Capsule { center1: [0.0, -0.5, 0.0], center2: [0.0, 0.5, 0.0], radius: 0.5 };
    if !q::collide_mover(w, [-10.0, 4.0, 0.0], low, None).iter().any(|p| p.shape == s.capsule && p.normal[1] > 0.5) {
        return 132;
    }
    if q::collide_mover(w, [-10.0, 4.0, 0.0], low, Some(s.capsule)).iter().any(|p| p.shape == s.capsule) {
        return 133;
    }
    // Capsule bottom is 2.0 above the ground, so a 10 m drop stops at fraction 0.2.
    if !near(q::cast_mover(w, [-30.0, 3.0, 0.0], low, [0.0, -10.0, 0.0], None), 0.2, 0.01) {
        return 134;
    }
    if !near(q::cast_mover(w, [-30.0, 3.0, 0.0], low, [0.0, -10.0, 0.0], Some(s.ground)), 1.0, 1e-6) {
        return 135;
    }

    unsafe { b3Glue_DestroyWorld(w) };
    0
}

// ---- shared helpers for the bodies and filters checks ----

const NO_VEL: [f32; 6] = [0.0; 6];

fn expect(ok: bool, code: i32) -> Result<(), i32> {
    if ok { Ok(()) } else { Err(code) }
}

fn world(gravity_y: f32) -> World {
    unsafe { b3Glue_CreateWorld(0.0, gravity_y, 0.0, 0, 0) }
}

fn steps(w: World, n: i32) {
    for _ in 0..n {
        unsafe { b3Glue_Step(w, 1.0 / 60.0, 4) };
    }
}

/// A body with one sphere (radius 0.5, density 1, no sleep). `vel6` is linear then angular velocity.
fn ball(w: World, kind: i32, p: [f32; 3], vel6: [f32; 6]) -> (Body, Shape) {
    unsafe {
        let b = b3Glue_CreateBodyEx(w, kind, [p[0], p[1], p[2], 0.0, 0.0, 0.0, 1.0].as_ptr(), vel6.as_ptr(), 0);
        let s = b3Glue_AddSphere(b, 0.5, 1.0, 0.5, 0.0, 0);
        (b, s)
    }
}

// ---- bodies ----

fn bodies_checks() -> Result<(), i32> {
    use box3d_sys::bodies;

    // Damping: a damped body loses speed, an undamped one keeps it (linear and angular).
    let w = world(0.0);
    let (free, _) = ball(w, BODY_DYNAMIC, [0.0, 0.0, 0.0], [10.0, 0.0, 0.0, 0.0, 0.0, 10.0]);
    let (damped, _) = ball(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], [10.0, 0.0, 0.0, 0.0, 0.0, 10.0]);
    bodies::set_linear_damping(damped, 2.0);
    bodies::set_angular_damping(damped, 2.0);
    expect(bodies::linear_damping(damped) == 2.0 && bodies::angular_damping(damped) == 2.0, 101)?;
    expect(bodies::linear_damping(free) == 0.0, 102)?;
    steps(w, 60);
    let s = state(&[free, damped]);
    expect(s[7] > 9.9 && s[12] > 9.9, 103)?; // free body: linear x and angular z unchanged after 1 s
    expect(s[20] < 2.0 && s[25] < 2.0, 104)?; // damped: about 10 * exp(-2) after 1 s
    destroy(w);

    // Gravity scale: 0 floats, 1 falls.
    let w = world(-10.0);
    let (floats, _) = ball(w, BODY_DYNAMIC, [0.0, 10.0, 0.0], NO_VEL);
    let (falls, _) = ball(w, BODY_DYNAMIC, [5.0, 10.0, 0.0], NO_VEL);
    bodies::set_gravity_scale(floats, 0.0);
    expect(bodies::gravity_scale(floats) == 0.0 && bodies::gravity_scale(falls) == 1.0, 105)?;
    steps(w, 30);
    let s = state(&[floats, falls]);
    expect((s[1] - 10.0).abs() < 1e-4, 106)?; // scale 0: stays at y = 10
    expect(s[14] < 9.0, 107)?; // scale 1: 0.5 * 10 * 0.5^2 = 1.25 m lower after 0.5 s
    destroy(w);

    // Motion locks: a locked axis does not move, a locked rotation does not turn, the free axis still moves.
    let w = world(-10.0);
    let (locked, _) = ball(w, BODY_DYNAMIC, [0.0, 10.0, 0.0], [2.0, 0.0, 2.0, 0.0, 0.0, 0.0]);
    bodies::set_motion_locks(locked, bodies::LOCK_LINEAR_X | bodies::LOCK_LINEAR_Y);
    let (spin_locked, _) = ball(w, BODY_DYNAMIC, [5.0, 10.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 5.0]);
    bodies::set_motion_locks(spin_locked, bodies::LOCK_ANGULAR_Z);
    let (spin_free, _) = ball(w, BODY_DYNAMIC, [10.0, 10.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 5.0]);
    expect(bodies::motion_locks(locked) == (bodies::LOCK_LINEAR_X | bodies::LOCK_LINEAR_Y), 108)?;
    steps(w, 30);
    let s = state(&[locked, spin_locked, spin_free]);
    expect(s[0].abs() < 1e-4 && (s[1] - 10.0).abs() < 1e-4, 109)?; // locked x and y
    expect(s[2] > 0.5, 110)?; // free z moves
    expect(s[16].abs() < 1e-4 && s[17].abs() < 1e-4 && s[18].abs() < 1e-4, 111)?; // locked spin: identity rotation
    expect(s[31].abs() > 0.1, 112)?; // unlocked spin turns about z (sin 1.25 rad after 0.5 s)
    destroy(w);

    // Mass data: the automatic mass of a radius 0.5 sphere at density 1, then an override.
    let w = world(0.0);
    let (b, _) = ball(w, BODY_DYNAMIC, [0.0, 0.0, 0.0], NO_VEL);
    expect((bodies::mass_data(b).mass - 0.5236).abs() < 1e-3, 113)?;
    bodies::set_mass_data(b, bodies::MassData { mass: 3.0, center: [0.1, 0.0, 0.0], inertia: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] });
    let md = bodies::mass_data(b);
    expect(md.mass == 3.0 && (md.center[0] - 0.1).abs() < 1e-6, 114)?;
    expect(unsafe { b3Glue_BodyMass(b) } == 3.0, 115)?;
    destroy(w);

    // User data: a 32-bit value round-trips, 0 when never set.
    let w = world(0.0);
    let (b, _) = ball(w, BODY_DYNAMIC, [0.0, 0.0, 0.0], NO_VEL);
    expect(bodies::user_data(b) == 0, 116)?;
    bodies::set_user_data(b, 0xDEAD_BEEF);
    expect(bodies::user_data(b) == 0xDEAD_BEEF, 117)?;
    destroy(w);

    // Enable and disable: a disabled body does not move; enabled again it falls.
    let w = world(-10.0);
    let (b, _) = ball(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], NO_VEL);
    bodies::set_enabled(b, false);
    expect(!bodies::is_enabled(b), 118)?;
    steps(w, 30);
    expect((state(&[b])[1] - 5.0).abs() < 1e-4, 119)?;
    bodies::set_enabled(b, true);
    expect(bodies::is_enabled(b), 120)?;
    steps(w, 30);
    expect(state(&[b])[1] < 4.5, 121)?;
    destroy(w);

    // Batch impulses: velocity change is impulse / mass, applied to each body of the batch.
    let w = world(0.0);
    let (a, _) = ball(w, BODY_DYNAMIC, [0.0, 0.0, 0.0], NO_VEL);
    let (c, _) = ball(w, BODY_DYNAMIC, [10.0, 0.0, 0.0], NO_VEL);
    let m = bodies::mass_data(a).mass;
    bodies::apply_impulses(&[a, c], &[[1.0, 0.0, 0.0], [0.0, 2.0, 0.0]], true);
    let s = state(&[a, c]);
    expect((s[7] - 1.0 / m).abs() < 1e-3, 122)?;
    expect((s[13 + 8] - 2.0 / m).abs() < 1e-3, 123)?;
    destroy(w);
    Ok(())
}

#[no_mangle]
pub extern "C" fn run_bodies() -> i32 {
    match bodies_checks() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

// ---- filters ----

fn destroy(w: World) {
    unsafe { b3Glue_DestroyWorld(w) };
}

fn filters_checks() -> Result<(), i32> {
    use box3d_sys::filters::{self, Filter};

    // Round trip: default filter, then a set one.
    let w = world(0.0);
    let (_, s) = ball(w, BODY_DYNAMIC, [0.0, 0.0, 0.0], NO_VEL);
    expect(filters::shape_filter(s) == filters::DEFAULT_FILTER, 201)?;
    let f = Filter { category: 4, mask: 0b1011, group: -3 };
    filters::set_shape_filter(s, f, true);
    expect(filters::shape_filter(s) == f, 202)?;
    destroy(w);

    // Masks: a pair whose masks exclude each other passes through; a default pair collides and bounces.
    let w = world(0.0);
    let (a, sa) = ball(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    let (b, sb) = ball(w, BODY_DYNAMIC, [0.6, 5.0, 0.0], [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    filters::set_shape_filter(sa, Filter { category: 2, mask: 1, group: 0 }, true);
    filters::set_shape_filter(sb, Filter { category: 4, mask: 1, group: 0 }, true);
    let (c, _) = ball(w, BODY_DYNAMIC, [0.0, 10.0, 0.0], [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    let (d, _) = ball(w, BODY_DYNAMIC, [0.6, 10.0, 0.0], [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    steps(w, 60);
    let s = state(&[a, b, c, d]);
    expect(s[0] > s[13], 203)?; // masked pair: a has passed b (a at x = 1, b at x = -0.4)
    expect(s[26] < s[39], 204)?; // default pair: collided, c stays on the left of d
    destroy(w);

    // Groups: equal negative groups never collide (they pass through); equal positive groups always do.
    let w = world(0.0);
    let (e, se) = ball(w, BODY_DYNAMIC, [0.0, 5.0, 0.0], [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    let (g, sg) = ball(w, BODY_DYNAMIC, [0.6, 5.0, 0.0], [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    filters::set_shape_filter(se, Filter { category: u64::MAX, mask: u64::MAX, group: -1 }, true);
    filters::set_shape_filter(sg, Filter { category: u64::MAX, mask: u64::MAX, group: -1 }, true);
    let (h, sh) = ball(w, BODY_DYNAMIC, [0.0, 10.0, 0.0], [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    let (k, sk) = ball(w, BODY_DYNAMIC, [0.6, 10.0, 0.0], [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    filters::set_shape_filter(sh, Filter { category: u64::MAX, mask: u64::MAX, group: 1 }, true);
    filters::set_shape_filter(sk, Filter { category: u64::MAX, mask: u64::MAX, group: 1 }, true);
    steps(w, 60);
    let s = state(&[e, g, h, k]);
    expect(s[0] > s[13], 205)?; // negative group: e has passed g
    expect(s[26] < s[39], 206)?; // positive group: h and k collided
    destroy(w);

    // Query filters: the closest hit is the upper box unless the query filter skips it.
    let w = world(0.0);
    let zeros = [0.0f32; 6];
    let upper = unsafe { b3Glue_CreateBodyEx(w, BODY_STATIC, [0.0, 10.0, 0.0, 0.0, 0.0, 0.0, 1.0].as_ptr(), zeros.as_ptr(), 0) };
    let up = unsafe { b3Glue_AddBox(upper, 2.0, 2.0, 2.0, 1.0, 0.5, 0.0, 0) };
    filters::set_shape_filter(up, Filter { category: 2, mask: u64::MAX, group: 0 }, false);
    let lower = unsafe { b3Glue_CreateBodyEx(w, BODY_STATIC, [0.0, 5.0, 0.0, 0.0, 0.0, 0.0, 1.0].as_ptr(), zeros.as_ptr(), 0) };
    let low = unsafe { b3Glue_AddBox(lower, 2.0, 2.0, 2.0, 1.0, 0.5, 0.0, 0) };
    filters::set_shape_filter(low, Filter { category: 1, mask: u64::MAX, group: 0 }, false);
    let (origin, down) = ([0.0f32, 50.0, 0.0], [0.0f32, -100.0, 0.0]);
    let mut out = [0.0f32; 7];
    expect(unsafe { b3Glue_RayClosest(w, origin.as_ptr(), down.as_ptr(), out.as_mut_ptr()) } == up, 207)?;
    expect(filters::ray_closest_filtered(w, origin, down, 1, 1).map(|h| h.0) == Some(low), 208)?; // accepts category 1 only
    expect(filters::ray_closest_filtered(w, origin, down, 1, 2).map(|h| h.0) == Some(up), 209)?; // accepts category 2 only
    expect(filters::ray_closest_filtered(w, origin, down, 1, 0).is_none(), 210)?; // accepts nothing
    destroy(w);
    Ok(())
}

#[no_mangle]
pub extern "C" fn run_filters() -> i32 {
    match filters_checks() {
        Ok(()) => 0,
        Err(code) => code,
    }
}
