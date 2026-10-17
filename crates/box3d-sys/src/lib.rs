//! Box3D as a Rust library. The C engine and a flat glue API are compiled by build.rs; this file declares the glue
//! functions and, on wasm32-unknown-unknown, the few libc functions Box3D calls.
//!
//! Ids are plain integers: a world is a `u32`, bodies, shapes and joints are `u64`. Pointers are `*const f32` of a
//! documented length, so no C struct layout is needed on the Rust side.
#![allow(non_snake_case)]

use core::ffi::c_void;

pub type World = u32;
pub type Body = u64;
pub type Shape = u64;
pub type Joint = u64;

/// Body types, the values of `b3BodyType`.
pub const BODY_STATIC: i32 = 0;
pub const BODY_KINEMATIC: i32 = 1;
pub const BODY_DYNAMIC: i32 = 2;
/// Body flags for `b3Glue_CreateBodyEx`.
pub const BODY_ALLOW_SLEEP: i32 = 1;
pub const BODY_BULLET: i32 = 2;
pub const BODY_START_ASLEEP: i32 = 4;
/// Shape flags.
pub const SHAPE_SENSOR: i32 = 1;
pub const SHAPE_CONTACT_EVENTS: i32 = 2;

/// Starts a task and returns a handle for `TaskFinish`.
pub type TaskEnqueue = unsafe extern "C" fn(task: unsafe extern "C" fn(*mut c_void), ctx: *mut c_void, user: *mut c_void, name: *const core::ffi::c_char) -> *mut c_void;
/// Blocks until the task behind the handle is done.
pub type TaskFinish = unsafe extern "C" fn(handle: *mut c_void, user: *mut c_void);

extern "C" {
    /// Gives a world a task system and a worker count (at least 2). The caller thread counts as worker 0.
    pub fn b3Glue_SetTaskSystem(world: World, workers: i32, enqueue: TaskEnqueue, finish: TaskFinish);
    pub fn b3Glue_WorkerCount(world: World) -> i32;
    pub fn b3Glue_CreateWorld(gx: f32, gy: f32, gz: f32, enable_sleep: i32, enable_continuous: i32) -> World;
    pub fn b3Glue_DestroyWorld(world: World);
    pub fn b3Glue_Step(world: World, dt: f32, sub_steps: i32);
    /// Turns sleeping and continuous collision on or off for a live world.
    pub fn b3Glue_Configure(world: World, sleeping: bool, continuous: bool);
    /// Contact stiffness in Hz, damping ratio, and the fastest push-out speed in m/s.
    pub fn b3Glue_SetContactTuning(world: World, hertz: f32, damping_ratio: f32, push_speed: f32);
    pub fn b3Glue_SetGravity(world: World, gx: f32, gy: f32, gz: f32);

    /// `pose7` is x y z qx qy qz qw, `vel6` is linear then angular velocity.
    pub fn b3Glue_CreateBodyEx(world: World, kind: i32, pose7: *const f32, vel6: *const f32, flags: i32) -> Body;
    pub fn b3Glue_DestroyBody(body: Body);
    pub fn b3Glue_BodyIsValid(body: Body) -> bool;
    pub fn b3Glue_SetTransform(body: Body, px: f32, py: f32, pz: f32, qx: f32, qy: f32, qz: f32, qw: f32);
    pub fn b3Glue_SetLinearVelocity(body: Body, x: f32, y: f32, z: f32);
    pub fn b3Glue_SetAngularVelocity(body: Body, x: f32, y: f32, z: f32);
    /// 13 floats per body: position, rotation, linear velocity, angular velocity.
    pub fn b3Glue_GetBatchState(ids: *const u64, count: i32, out: *mut f32);
    pub fn b3Glue_SetTargetTransform(body: Body, pose7: *const f32, dt: f32);
    /// Speed (m/s) under which a body counts as at rest for sleeping.
    pub fn b3Glue_SetSleepThreshold(body: Body, threshold: f32);
    pub fn b3Glue_BodyMass(body: Body) -> f32;
    /// Sets the mass and scales the inertia with it.
    pub fn b3Glue_SetBodyMass(body: Body, mass: f32);
    pub fn b3Glue_BodyIsAwake(body: Body) -> bool;

    pub fn b3Glue_AddBox(body: Body, hx: f32, hy: f32, hz: f32, density: f32, friction: f32, restitution: f32, flags: i32) -> Shape;
    pub fn b3Glue_AddSphere(body: Body, radius: f32, density: f32, friction: f32, restitution: f32, flags: i32) -> Shape;
    pub fn b3Glue_AddCapsule(body: Body, half_height: f32, radius: f32, density: f32, friction: f32, restitution: f32, flags: i32) -> Shape;
    pub fn b3Glue_ShapeBody(shape: Shape) -> Body;

    pub fn b3Glue_JointIsValid(joint: Joint) -> bool;
    /// Moves a capsule character by `delta3` sliding along what it meets. `pos3` is updated. Returns 1 when grounded.
    pub fn b3Glue_MoveCharacter(world: World, self_shape: Shape, pos3: *mut f32, half_height: f32, radius: f32, delta3: *const f32, ground_normal_y: f32) -> i32;
    pub fn b3Glue_CreateWeld(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32) -> Joint;
    pub fn b3Glue_CreateRevolute(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32, axis: *const f32, limited: i32, lo: f32, hi: f32) -> Joint;
    pub fn b3Glue_CreatePrismatic(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32, axis: *const f32, limited: i32, lo: f32, hi: f32) -> Joint;

    /// Shape id pairs, two `u64` per event. Return the number of events written.
    pub fn b3Glue_ContactBeginEvents(world: World, out: *mut u64, max: i32) -> i32;
    pub fn b3Glue_ContactEndEvents(world: World, out: *mut u64, max: i32) -> i32;
    pub fn b3Glue_SensorBeginEvents(world: World, out: *mut u64, max: i32) -> i32;
    pub fn b3Glue_SensorEndEvents(world: World, out: *mut u64, max: i32) -> i32;

    /// `out7`: fraction, point, normal. Returns the shape hit, or 0.
    pub fn b3Glue_RayClosest(world: World, origin: *const f32, d: *const f32, out7: *mut f32) -> Shape;

    pub fn b3Glue_SnapshotTake(world: World) -> *mut c_void;
    pub fn b3Glue_SnapshotData(rec: *const c_void) -> *const u8;
    pub fn b3Glue_SnapshotSize(rec: *const c_void) -> i32;
    pub fn b3Glue_SnapshotFree(rec: *mut c_void);
    pub fn b3Glue_RestoreCreate(data: *const u8, size: i32) -> *mut c_void;
    pub fn b3Glue_RestoreWorld(player: *mut c_void) -> World;
    pub fn b3Glue_RestoreBodyCount(player: *const c_void) -> i32;
    pub fn b3Glue_RestoreBodyId(player: *const c_void, i: i32) -> Body;
    pub fn b3Glue_RestoreDestroy(player: *mut c_void);
}

/// Runs a world's parallel work on the rayon pool. Needs a pool with at least `workers` threads (the caller steps as worker 0,
/// the others are spawned onto the pool and spin together at the solver barriers, so each needs a free pool thread).
#[cfg(feature = "rayon")]
static TASKS: [core::sync::atomic::AtomicU32; 10] = [const { core::sync::atomic::AtomicU32::new(0) }; 10];

/// What a task handle points at: a done flag and the first bytes of its name, for stall reports.
#[cfg(feature = "rayon")]
struct TaskSlot {
    done: core::sync::atomic::AtomicBool,
    name: [u8; 16],
}

/// Counters of the rayon task system: tasks enqueued, started on a pool thread, finished; then, if a `finish` ever stalled,
/// the same three at that moment and the first 16 bytes of the stalled task's name (as four little-endian words).
#[cfg(feature = "rayon")]
pub fn task_stats() -> [u32; 10] {
    use core::sync::atomic::Ordering::Relaxed;
    core::array::from_fn(|i| TASKS[i].load(Relaxed))
}

#[cfg(feature = "rayon")]
pub fn use_rayon(world: World, workers: i32) {
    use core::sync::atomic::{AtomicBool, Ordering};

    struct Job(unsafe extern "C" fn(*mut c_void), *mut c_void);
    // The task and its context are used on one pool thread only, and the caller keeps them alive until finish returns.
    unsafe impl Send for Job {}

    unsafe extern "C" fn enqueue(task: unsafe extern "C" fn(*mut c_void), ctx: *mut c_void, _user: *mut c_void, _name: *const core::ffi::c_char) -> *mut c_void {
        let mut name = [0u8; 16];
        if !_name.is_null() {
            for (i, slot) in name.iter_mut().enumerate().take(15) {
                let c = unsafe { *(_name as *const u8).add(i) };
                if c == 0 {
                    break;
                }
                *slot = c;
            }
        }
        let slot: &'static TaskSlot = Box::leak(Box::new(TaskSlot { done: AtomicBool::new(false), name }));
        let done = &slot.done;
        let job = Job(task, ctx);
        TASKS[0].fetch_add(1, Ordering::Relaxed);
        rayon::spawn(move || {
            let job = job;
            TASKS[1].fetch_add(1, Ordering::Relaxed);
            unsafe { (job.0)(job.1) };
            TASKS[2].fetch_add(1, Ordering::Relaxed);
            done.store(true, Ordering::Release);
        });
        slot as *const TaskSlot as *mut c_void
    }

    unsafe extern "C" fn finish(handle: *mut c_void, _user: *mut c_void) {
        let slot = &*(handle as *const TaskSlot);
        let done = &slot.done;
        let mut spins = 0u64;
        while !done.load(Ordering::Acquire) {
            core::hint::spin_loop();
            spins += 1;
            if spins > 400_000_000 {
                // A stall: remember what the counters said at that moment, then trap, so the page can read `task_stats`.
                TASKS[3].store(TASKS[0].load(Ordering::Relaxed), Ordering::Relaxed);
                TASKS[4].store(TASKS[1].load(Ordering::Relaxed), Ordering::Relaxed);
                TASKS[5].store(TASKS[2].load(Ordering::Relaxed), Ordering::Relaxed);
                for k in 0..4 {
                    TASKS[6 + k].store(u32::from_le_bytes([slot.name[4 * k], slot.name[4 * k + 1], slot.name[4 * k + 2], slot.name[4 * k + 3]]), Ordering::Relaxed);
                }
                #[cfg(target_arch = "wasm32")]
                core::arch::wasm32::unreachable();
                #[cfg(not(target_arch = "wasm32"))]
                panic!("box3d task stalled");
            }
        }
        drop(Box::from_raw(handle as *mut TaskSlot));
    }

    unsafe { b3Glue_SetTaskSystem(world, workers, enqueue, finish) };
}

/// The libc Box3D needs when there is none (wasm32-unknown-unknown). Allocations keep their size in a 16-byte header.
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
mod libc {
    use core::alloc::Layout;

    const HEADER: usize = 16;

    unsafe fn alloc_aligned(align: usize, size: usize, zero: bool) -> *mut u8 {
        let align = align.max(HEADER);
        let total = size + align;
        let Ok(layout) = Layout::from_size_align(total, align) else { return core::ptr::null_mut() };
        let base = if zero { std::alloc::alloc_zeroed(layout) } else { std::alloc::alloc(layout) };
        if base.is_null() {
            return base;
        }
        // The user pointer sits `align` bytes in, so it is aligned; the header just below it holds base layout info.
        let user = base.add(align);
        (user.sub(16) as *mut usize).write(total);
        (user.sub(8) as *mut usize).write(align);
        user
    }

    #[no_mangle]
    pub unsafe extern "C" fn malloc(size: usize) -> *mut u8 {
        alloc_aligned(HEADER, size, false)
    }
    #[no_mangle]
    pub unsafe extern "C" fn aligned_alloc(align: usize, size: usize) -> *mut u8 {
        alloc_aligned(align, size, false)
    }
    #[no_mangle]
    pub unsafe extern "C" fn calloc(n: usize, m: usize) -> *mut u8 {
        match n.checked_mul(m) {
            Some(size) => alloc_aligned(HEADER, size, true),
            None => core::ptr::null_mut(),
        }
    }
    #[no_mangle]
    pub unsafe extern "C" fn free(p: *mut u8) {
        if p.is_null() {
            return;
        }
        let total = (p.sub(16) as *const usize).read();
        let align = (p.sub(8) as *const usize).read();
        std::alloc::dealloc(p.sub(align), Layout::from_size_align_unchecked(total, align));
    }
    #[no_mangle]
    pub unsafe extern "C" fn realloc(p: *mut u8, size: usize) -> *mut u8 {
        if p.is_null() {
            return malloc(size);
        }
        let total = (p.sub(16) as *const usize).read();
        let align = (p.sub(8) as *const usize).read();
        let old = total - align;
        let n = malloc(size);
        if !n.is_null() {
            core::ptr::copy_nonoverlapping(p, n, old.min(size));
            free(p);
        }
        n
    }
    #[no_mangle]
    pub unsafe extern "C" fn strlen(s: *const u8) -> usize {
        let mut n = 0;
        while *s.add(n) != 0 {
            n += 1;
        }
        n
    }
}
