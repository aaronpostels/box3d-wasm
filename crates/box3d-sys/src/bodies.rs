//! bodies area of box3d-sys: damping, gravity scale, motion locks, mass data, user data, enable/disable, batch impulses.
//! The C side is src/c/box3d_glue_bodies.c.
use super::Body;

/// Motion lock bits for `set_motion_locks`: translation x y z, then rotation x y z.
pub const LOCK_LINEAR_X: i32 = 1;
pub const LOCK_LINEAR_Y: i32 = 2;
pub const LOCK_LINEAR_Z: i32 = 4;
pub const LOCK_ANGULAR_X: i32 = 8;
pub const LOCK_ANGULAR_Y: i32 = 16;
pub const LOCK_ANGULAR_Z: i32 = 32;

/// Mass properties of a body. `inertia` holds the three columns of the inertia tensor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MassData {
    pub mass: f32,
    pub center: [f32; 3],
    pub inertia: [[f32; 3]; 3],
}

extern "C" {
    pub fn b3Glue_SetLinearDamping(body: Body, damping: f32);
    pub fn b3Glue_GetLinearDamping(body: Body) -> f32;
    pub fn b3Glue_SetAngularDamping(body: Body, damping: f32);
    pub fn b3Glue_GetAngularDamping(body: Body) -> f32;
    pub fn b3Glue_SetGravityScale(body: Body, scale: f32);
    pub fn b3Glue_GetGravityScale(body: Body) -> f32;
    pub fn b3Glue_SetMotionLocks(body: Body, locks: i32);
    pub fn b3Glue_GetMotionLocks(body: Body) -> i32;
    pub fn b3Glue_GetMassData(body: Body, out13: *mut f32);
    pub fn b3Glue_SetMassData(body: Body, mass: f32, center3: *const f32, inertia9: *const f32);
    pub fn b3Glue_SetBodyUserData(body: Body, value: u32);
    pub fn b3Glue_GetBodyUserData(body: Body) -> u32;
    pub fn b3Glue_SetBodyEnabled(body: Body, enabled: bool);
    pub fn b3Glue_BodyIsEnabled(body: Body) -> bool;
    pub fn b3Glue_ApplyImpulses(bodies: *const u64, impulses3: *const f32, count: i32, wake: bool);
}

pub fn set_linear_damping(body: Body, damping: f32) {
    unsafe { b3Glue_SetLinearDamping(body, damping) }
}

pub fn linear_damping(body: Body) -> f32 {
    unsafe { b3Glue_GetLinearDamping(body) }
}

pub fn set_angular_damping(body: Body, damping: f32) {
    unsafe { b3Glue_SetAngularDamping(body, damping) }
}

pub fn angular_damping(body: Body) -> f32 {
    unsafe { b3Glue_GetAngularDamping(body) }
}

/// 0 is weightless, 1 is normal gravity, negative pulls up.
pub fn set_gravity_scale(body: Body, scale: f32) {
    unsafe { b3Glue_SetGravityScale(body, scale) }
}

pub fn gravity_scale(body: Body) -> f32 {
    unsafe { b3Glue_GetGravityScale(body) }
}

/// `locks` is an OR of the `LOCK_*` bits. A locked axis neither translates nor rotates.
pub fn set_motion_locks(body: Body, locks: i32) {
    unsafe { b3Glue_SetMotionLocks(body, locks) }
}

pub fn motion_locks(body: Body) -> i32 {
    unsafe { b3Glue_GetMotionLocks(body) }
}

pub fn mass_data(body: Body) -> MassData {
    let mut o = [0.0f32; 13];
    unsafe { b3Glue_GetMassData(body, o.as_mut_ptr()) };
    MassData { mass: o[0], center: [o[1], o[2], o[3]], inertia: [[o[4], o[5], o[6]], [o[7], o[8], o[9]], [o[10], o[11], o[12]]] }
}

/// Overrides the automatic mass until a shape is added or removed, or the body type changes.
pub fn set_mass_data(body: Body, data: MassData) {
    unsafe { b3Glue_SetMassData(body, data.mass, data.center.as_ptr(), data.inertia.as_ptr() as *const f32) }
}

/// The user data is 32 bits (Box3D's void* on wasm32), e.g. an entity index. Zero when never set.
pub fn set_user_data(body: Body, value: u32) {
    unsafe { b3Glue_SetBodyUserData(body, value) }
}

pub fn user_data(body: Body) -> u32 {
    unsafe { b3Glue_GetBodyUserData(body) }
}

/// A disabled body leaves the simulation and does not move until enabled again.
pub fn set_enabled(body: Body, enabled: bool) {
    unsafe { b3Glue_SetBodyEnabled(body, enabled) }
}

pub fn is_enabled(body: Body) -> bool {
    unsafe { b3Glue_BodyIsEnabled(body) }
}

/// One-shot impulses at the centers of mass: `bodies[i]` gets `impulses[i]`. Panics when the lengths differ.
pub fn apply_impulses(bodies: &[Body], impulses: &[[f32; 3]], wake: bool) {
    assert_eq!(bodies.len(), impulses.len(), "one impulse per body");
    unsafe { b3Glue_ApplyImpulses(bodies.as_ptr(), impulses.as_ptr() as *const f32, bodies.len() as i32, wake) }
}
