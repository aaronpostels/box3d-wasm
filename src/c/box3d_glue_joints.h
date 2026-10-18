// SPDX-License-Identifier: MIT
// Box3D glue, joints: spherical, distance, wheel, motor and filter joints, their limits, springs and motors,
// and joint reaction forces. Weld, revolute and prismatic stay in box3d_glue.c / box3d_glue_ext.c.
#pragma once

#include "box3d_glue.h"

#ifdef __cplusplus
extern "C" {
#endif

// Creation. Anchors are local to each body (3 floats each). Axis: a direction in body A's local frame (3 floats).
B3_GLUE_EXPORT uint64_t b3Glue_CreateSpherical(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB);
B3_GLUE_EXPORT uint64_t b3Glue_CreateDistance(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, float length);
// Suspension moves along the axis; the wheel spins about a direction perpendicular to it.
B3_GLUE_EXPORT uint64_t b3Glue_CreateWheel(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis);
B3_GLUE_EXPORT uint64_t b3Glue_CreateMotor(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB);
B3_GLUE_EXPORT uint64_t b3Glue_CreateFilter(uint32_t world, uint64_t a, uint64_t b);

// Reaction at the joint: out6 = constraint force xyz, then constraint torque xyz.
B3_GLUE_EXPORT void b3Glue_JointReaction(uint64_t joint, float* out6);

// Distance. Enable flags are 0 or 1. Spring off means a rigid rod (it overrides limit and motor).
B3_GLUE_EXPORT void b3Glue_DistanceSetLength(uint64_t joint, float length);
B3_GLUE_EXPORT float b3Glue_DistanceCurrentLength(uint64_t joint);
B3_GLUE_EXPORT void b3Glue_DistanceSetSpring(uint64_t joint, int enable, float hertz, float dampingRatio, float lowerForce, float upperForce);
B3_GLUE_EXPORT void b3Glue_DistanceSetLengthRange(uint64_t joint, int enable, float minLength, float maxLength);
B3_GLUE_EXPORT void b3Glue_DistanceSetMotor(uint64_t joint, int enable, float speed, float maxForce);

// Motor. vel6 = linear xyz, then angular xyz (target relative velocity of B).
B3_GLUE_EXPORT void b3Glue_MotorSetVelocity(uint64_t joint, const float* vel6);
B3_GLUE_EXPORT void b3Glue_MotorSetMaxForce(uint64_t joint, float maxForce, float maxTorque);
// Position control: linear (hertz, damping, max force) and angular (hertz, damping, max torque).
B3_GLUE_EXPORT void b3Glue_MotorSetSpring(uint64_t joint, float linearHertz, float linearDamping, float maxForce, float angularHertz, float angularDamping, float maxTorque);

// Spherical. Cone limit is around frame A z, twist limit around frame B z.
B3_GLUE_EXPORT void b3Glue_SphericalSetCone(uint64_t joint, int enable, float angle);
B3_GLUE_EXPORT void b3Glue_SphericalSetTwist(uint64_t joint, int enable, float lower, float upper);
// targetQuat4: qx qy qz qw, joint frame B relative to frame A.
B3_GLUE_EXPORT void b3Glue_SphericalSetSpring(uint64_t joint, int enable, float hertz, float dampingRatio, const float* targetQuat4);
// vel3: relative angular velocity (B minus A) the motor drives toward.
B3_GLUE_EXPORT void b3Glue_SphericalSetMotor(uint64_t joint, int enable, const float* vel3, float maxTorque);
// out2: cone angle, twist angle (radians).
B3_GLUE_EXPORT void b3Glue_SphericalAngles(uint64_t joint, float* out2);

// Wheel. Suspension: spring and limit along the axis. Spin: motor about the wheel axis. Steering: spring and limit.
B3_GLUE_EXPORT void b3Glue_WheelSetSuspension(uint64_t joint, int enableSpring, float hertz, float dampingRatio, int enableLimit, float lower, float upper);
B3_GLUE_EXPORT void b3Glue_WheelSetSpin(uint64_t joint, int enable, float speed, float maxTorque);
B3_GLUE_EXPORT void b3Glue_WheelSetSteering(uint64_t joint, int enable, float hertz, float dampingRatio, float targetAngle, float maxTorque, int enableLimit, float lower, float upper);
// out3: spin speed, steering angle, spin torque.
B3_GLUE_EXPORT void b3Glue_WheelState(uint64_t joint, float* out3);

#ifdef __cplusplus
}
#endif
