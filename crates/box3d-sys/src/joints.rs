//! Joints area of box3d-sys: spherical, distance, wheel, motor and filter joints, their limits, springs and motors,
//! and joint reaction forces. Externs are the flat glue in src/c/box3d_glue_joints.c; the safe wrappers below take
//! fixed-size arrays instead of raw pointers. Weld, revolute and prismatic are in lib.rs (their externs live there).
#![allow(non_snake_case)]

use crate::{Body, Joint, World};

extern "C" {
    pub fn b3Glue_CreateSpherical(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32) -> Joint;
    pub fn b3Glue_CreateDistance(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32, length: f32) -> Joint;
    pub fn b3Glue_CreateWheel(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32, axis: *const f32) -> Joint;
    pub fn b3Glue_CreateMotor(world: World, a: Body, b: Body, anchor_a: *const f32, anchor_b: *const f32) -> Joint;
    pub fn b3Glue_CreateFilter(world: World, a: Body, b: Body) -> Joint;
    pub fn b3Glue_JointReaction(joint: Joint, out6: *mut f32);

    pub fn b3Glue_DistanceSetLength(joint: Joint, length: f32);
    pub fn b3Glue_DistanceCurrentLength(joint: Joint) -> f32;
    pub fn b3Glue_DistanceSetSpring(joint: Joint, enable: i32, hertz: f32, damping_ratio: f32, lower_force: f32, upper_force: f32);
    pub fn b3Glue_DistanceSetLengthRange(joint: Joint, enable: i32, min_length: f32, max_length: f32);
    pub fn b3Glue_DistanceSetMotor(joint: Joint, enable: i32, speed: f32, max_force: f32);

    pub fn b3Glue_MotorSetVelocity(joint: Joint, vel6: *const f32);
    pub fn b3Glue_MotorSetMaxForce(joint: Joint, max_force: f32, max_torque: f32);
    pub fn b3Glue_MotorSetSpring(joint: Joint, linear_hertz: f32, linear_damping: f32, max_force: f32, angular_hertz: f32, angular_damping: f32, max_torque: f32);

    pub fn b3Glue_SphericalSetCone(joint: Joint, enable: i32, angle: f32);
    pub fn b3Glue_SphericalSetTwist(joint: Joint, enable: i32, lower: f32, upper: f32);
    pub fn b3Glue_SphericalSetSpring(joint: Joint, enable: i32, hertz: f32, damping_ratio: f32, target_quat4: *const f32);
    pub fn b3Glue_SphericalSetMotor(joint: Joint, enable: i32, vel3: *const f32, max_torque: f32);
    pub fn b3Glue_SphericalAngles(joint: Joint, out2: *mut f32);

    pub fn b3Glue_WheelSetSuspension(joint: Joint, enable_spring: i32, hertz: f32, damping_ratio: f32, enable_limit: i32, lower: f32, upper: f32);
    pub fn b3Glue_WheelSetSpin(joint: Joint, enable: i32, speed: f32, max_torque: f32);
    pub fn b3Glue_WheelSetSteering(joint: Joint, enable: i32, hertz: f32, damping_ratio: f32, target_angle: f32, max_torque: f32, enable_limit: i32, lower: f32, upper: f32);
    pub fn b3Glue_WheelState(joint: Joint, out3: *mut f32);
}

/// A joint's reaction at its anchor after the last step: force xyz, then torque xyz.
pub fn reaction(joint: Joint) -> [f32; 6] {
    let mut out = [0.0f32; 6];
    unsafe { b3Glue_JointReaction(joint, out.as_mut_ptr()) };
    out
}

pub fn create_spherical(world: World, a: Body, b: Body, anchor_a: [f32; 3], anchor_b: [f32; 3]) -> Joint {
    unsafe { b3Glue_CreateSpherical(world, a, b, anchor_a.as_ptr(), anchor_b.as_ptr()) }
}

pub fn create_distance(world: World, a: Body, b: Body, anchor_a: [f32; 3], anchor_b: [f32; 3], length: f32) -> Joint {
    unsafe { b3Glue_CreateDistance(world, a, b, anchor_a.as_ptr(), anchor_b.as_ptr(), length) }
}

/// `axis` is the suspension direction in body A's frame.
pub fn create_wheel(world: World, a: Body, b: Body, anchor_a: [f32; 3], anchor_b: [f32; 3], axis: [f32; 3]) -> Joint {
    unsafe { b3Glue_CreateWheel(world, a, b, anchor_a.as_ptr(), anchor_b.as_ptr(), axis.as_ptr()) }
}

pub fn create_motor(world: World, a: Body, b: Body, anchor_a: [f32; 3], anchor_b: [f32; 3]) -> Joint {
    unsafe { b3Glue_CreateMotor(world, a, b, anchor_a.as_ptr(), anchor_b.as_ptr()) }
}

/// Disables collision between a and b; they still share an island.
pub fn create_filter(world: World, a: Body, b: Body) -> Joint {
    unsafe { b3Glue_CreateFilter(world, a, b) }
}

pub fn distance_set_length(joint: Joint, length: f32) {
    unsafe { b3Glue_DistanceSetLength(joint, length) }
}

pub fn distance_current_length(joint: Joint) -> f32 {
    unsafe { b3Glue_DistanceCurrentLength(joint) }
}

/// `spring` false makes the distance joint rigid (it overrides the limit and the motor).
pub fn distance_set_spring(joint: Joint, spring: bool, hertz: f32, damping_ratio: f32, lower_force: f32, upper_force: f32) {
    unsafe { b3Glue_DistanceSetSpring(joint, spring as i32, hertz, damping_ratio, lower_force, upper_force) }
}

pub fn distance_set_length_range(joint: Joint, limit: bool, min_length: f32, max_length: f32) {
    unsafe { b3Glue_DistanceSetLengthRange(joint, limit as i32, min_length, max_length) }
}

pub fn distance_set_motor(joint: Joint, motor: bool, speed: f32, max_force: f32) {
    unsafe { b3Glue_DistanceSetMotor(joint, motor as i32, speed, max_force) }
}

/// Target relative velocity of body B: linear xyz, then angular xyz.
pub fn motor_set_velocity(joint: Joint, vel6: [f32; 6]) {
    unsafe { b3Glue_MotorSetVelocity(joint, vel6.as_ptr()) }
}

pub fn motor_set_max_force(joint: Joint, max_force: f32, max_torque: f32) {
    unsafe { b3Glue_MotorSetMaxForce(joint, max_force, max_torque) }
}

/// Position control: `linear` and `angular` are (hertz, damping ratio, max force) and (hertz, damping ratio, max torque).
pub fn motor_set_spring(joint: Joint, linear: [f32; 3], angular: [f32; 3]) {
    unsafe { b3Glue_MotorSetSpring(joint, linear[0], linear[1], linear[2], angular[0], angular[1], angular[2]) }
}

/// `limit` false removes the cone limit. `angle` is in radians, [0, pi].
pub fn spherical_set_cone(joint: Joint, limit: bool, angle: f32) {
    unsafe { b3Glue_SphericalSetCone(joint, limit as i32, angle) }
}

pub fn spherical_set_twist(joint: Joint, limit: bool, lower: f32, upper: f32) {
    unsafe { b3Glue_SphericalSetTwist(joint, limit as i32, lower, upper) }
}

/// `target` is a quaternion (x, y, z, w): frame B relative to frame A.
pub fn spherical_set_spring(joint: Joint, spring: bool, hertz: f32, damping_ratio: f32, target: [f32; 4]) {
    unsafe { b3Glue_SphericalSetSpring(joint, spring as i32, hertz, damping_ratio, target.as_ptr()) }
}

/// `vel` is the relative angular velocity (B minus A) the motor drives toward.
pub fn spherical_set_motor(joint: Joint, motor: bool, vel: [f32; 3], max_torque: f32) {
    unsafe { b3Glue_SphericalSetMotor(joint, motor as i32, vel.as_ptr(), max_torque) }
}

/// (cone angle, twist angle) in radians.
pub fn spherical_angles(joint: Joint) -> [f32; 2] {
    let mut out = [0.0f32; 2];
    unsafe { b3Glue_SphericalAngles(joint, out.as_mut_ptr()) };
    out
}

pub fn wheel_set_suspension(joint: Joint, spring: bool, hertz: f32, damping_ratio: f32, limit: bool, lower: f32, upper: f32) {
    unsafe { b3Glue_WheelSetSuspension(joint, spring as i32, hertz, damping_ratio, limit as i32, lower, upper) }
}

pub fn wheel_set_spin(joint: Joint, motor: bool, speed: f32, max_torque: f32) {
    unsafe { b3Glue_WheelSetSpin(joint, motor as i32, speed, max_torque) }
}

pub fn wheel_set_steering(joint: Joint, spring: bool, hertz: f32, damping_ratio: f32, target_angle: f32, max_torque: f32, limit: bool, lower: f32, upper: f32) {
    unsafe { b3Glue_WheelSetSteering(joint, spring as i32, hertz, damping_ratio, target_angle, max_torque, limit as i32, lower, upper) }
}

/// (spin speed, steering angle, spin torque).
pub fn wheel_state(joint: Joint) -> [f32; 3] {
    let mut out = [0.0f32; 3];
    unsafe { b3Glue_WheelState(joint, out.as_mut_ptr()) };
    out
}
