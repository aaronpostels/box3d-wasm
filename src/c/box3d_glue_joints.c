// SPDX-License-Identifier: MIT
// Box3D glue, joints: flat C API (ids, numbers and float arrays only), same conventions as box3d_glue_ext.c.

#include "box3d_glue_joints.h"

static b3JointId jointOf(uint64_t v) { return b3LoadJointId(v); }

static b3Quat axisFrame(const float* axis, b3Vec3 from) {
    b3Vec3 to = b3Normalize((b3Vec3){ axis[0], axis[1], axis[2] });
    if (b3LengthSquared(to) < 0.5f) to = from;
    return b3ComputeQuatBetweenUnitVectors(from, to);
}

static void jointBase(b3JointDef* base, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, b3Quat q) {
    base->bodyIdA = b3LoadBodyId(a);
    base->bodyIdB = b3LoadBodyId(b);
    base->localFrameA = (b3Transform){ .p = { anchorA[0], anchorA[1], anchorA[2] }, .q = q };
    base->localFrameB = (b3Transform){ .p = { anchorB[0], anchorB[1], anchorB[2] }, .q = q };
    base->collideConnected = false;
}

// ---- creation ----

uint64_t b3Glue_CreateSpherical(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB) {
    b3SphericalJointDef def = b3DefaultSphericalJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, b3Quat_identity);
    return b3StoreJointId(b3CreateSphericalJoint(b3LoadWorldId(world), &def));
}

uint64_t b3Glue_CreateDistance(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, float length) {
    b3DistanceJointDef def = b3DefaultDistanceJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, b3Quat_identity);
    def.length = length;
    return b3StoreJointId(b3CreateDistanceJoint(b3LoadWorldId(world), &def));
}

uint64_t b3Glue_CreateWheel(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis) {
    b3WheelJointDef def = b3DefaultWheelJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, axisFrame(axis, (b3Vec3){ 1, 0, 0 }));
    return b3StoreJointId(b3CreateWheelJoint(b3LoadWorldId(world), &def));
}

uint64_t b3Glue_CreateMotor(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB) {
    b3MotorJointDef def = b3DefaultMotorJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, b3Quat_identity);
    return b3StoreJointId(b3CreateMotorJoint(b3LoadWorldId(world), &def));
}

uint64_t b3Glue_CreateFilter(uint32_t world, uint64_t a, uint64_t b) {
    static const float origin[3] = { 0, 0, 0 };
    b3FilterJointDef def = b3DefaultFilterJointDef();
    jointBase(&def.base, a, b, origin, origin, b3Quat_identity);
    return b3StoreJointId(b3CreateFilterJoint(b3LoadWorldId(world), &def));
}

// ---- reaction ----

void b3Glue_JointReaction(uint64_t joint, float* out6) {
    b3Vec3 f = b3Joint_GetConstraintForce(jointOf(joint));
    b3Vec3 t = b3Joint_GetConstraintTorque(jointOf(joint));
    out6[0] = f.x; out6[1] = f.y; out6[2] = f.z;
    out6[3] = t.x; out6[4] = t.y; out6[5] = t.z;
}

// ---- distance ----

void b3Glue_DistanceSetLength(uint64_t joint, float length) {
    b3DistanceJoint_SetLength(jointOf(joint), length);
}

float b3Glue_DistanceCurrentLength(uint64_t joint) {
    return b3DistanceJoint_GetCurrentLength(jointOf(joint));
}

void b3Glue_DistanceSetSpring(uint64_t joint, int enable, float hertz, float dampingRatio, float lowerForce, float upperForce) {
    b3JointId j = jointOf(joint);
    b3DistanceJoint_EnableSpring(j, enable != 0);
    b3DistanceJoint_SetSpringHertz(j, hertz);
    b3DistanceJoint_SetSpringDampingRatio(j, dampingRatio);
    b3DistanceJoint_SetSpringForceRange(j, lowerForce, upperForce);
}

void b3Glue_DistanceSetLengthRange(uint64_t joint, int enable, float minLength, float maxLength) {
    b3JointId j = jointOf(joint);
    b3DistanceJoint_EnableLimit(j, enable != 0);
    b3DistanceJoint_SetLengthRange(j, minLength, maxLength);
}

void b3Glue_DistanceSetMotor(uint64_t joint, int enable, float speed, float maxForce) {
    b3JointId j = jointOf(joint);
    b3DistanceJoint_EnableMotor(j, enable != 0);
    b3DistanceJoint_SetMotorSpeed(j, speed);
    b3DistanceJoint_SetMaxMotorForce(j, maxForce);
}

// ---- motor ----

void b3Glue_MotorSetVelocity(uint64_t joint, const float* vel6) {
    b3JointId j = jointOf(joint);
    b3MotorJoint_SetLinearVelocity(j, (b3Vec3){ vel6[0], vel6[1], vel6[2] });
    b3MotorJoint_SetAngularVelocity(j, (b3Vec3){ vel6[3], vel6[4], vel6[5] });
}

void b3Glue_MotorSetMaxForce(uint64_t joint, float maxForce, float maxTorque) {
    b3JointId j = jointOf(joint);
    b3MotorJoint_SetMaxVelocityForce(j, maxForce);
    b3MotorJoint_SetMaxVelocityTorque(j, maxTorque);
}

void b3Glue_MotorSetSpring(uint64_t joint, float linearHertz, float linearDamping, float maxForce, float angularHertz, float angularDamping, float maxTorque) {
    b3JointId j = jointOf(joint);
    b3MotorJoint_SetLinearHertz(j, linearHertz);
    b3MotorJoint_SetLinearDampingRatio(j, linearDamping);
    b3MotorJoint_SetMaxSpringForce(j, maxForce);
    b3MotorJoint_SetAngularHertz(j, angularHertz);
    b3MotorJoint_SetAngularDampingRatio(j, angularDamping);
    b3MotorJoint_SetMaxSpringTorque(j, maxTorque);
}

// ---- spherical ----

void b3Glue_SphericalSetCone(uint64_t joint, int enable, float angle) {
    b3JointId j = jointOf(joint);
    b3SphericalJoint_EnableConeLimit(j, enable != 0);
    b3SphericalJoint_SetConeLimit(j, angle);
}

void b3Glue_SphericalSetTwist(uint64_t joint, int enable, float lower, float upper) {
    b3JointId j = jointOf(joint);
    b3SphericalJoint_EnableTwistLimit(j, enable != 0);
    b3SphericalJoint_SetTwistLimits(j, lower, upper);
}

void b3Glue_SphericalSetSpring(uint64_t joint, int enable, float hertz, float dampingRatio, const float* targetQuat4) {
    b3JointId j = jointOf(joint);
    b3SphericalJoint_EnableSpring(j, enable != 0);
    b3SphericalJoint_SetSpringHertz(j, hertz);
    b3SphericalJoint_SetSpringDampingRatio(j, dampingRatio);
    b3SphericalJoint_SetTargetRotation(j, (b3Quat){ .v = { targetQuat4[0], targetQuat4[1], targetQuat4[2] }, .s = targetQuat4[3] });
}

void b3Glue_SphericalSetMotor(uint64_t joint, int enable, const float* vel3, float maxTorque) {
    b3JointId j = jointOf(joint);
    b3SphericalJoint_EnableMotor(j, enable != 0);
    b3SphericalJoint_SetMotorVelocity(j, (b3Vec3){ vel3[0], vel3[1], vel3[2] });
    b3SphericalJoint_SetMaxMotorTorque(j, maxTorque);
}

void b3Glue_SphericalAngles(uint64_t joint, float* out2) {
    b3JointId j = jointOf(joint);
    out2[0] = b3SphericalJoint_GetConeAngle(j);
    out2[1] = b3SphericalJoint_GetTwistAngle(j);
}

// ---- wheel ----

void b3Glue_WheelSetSuspension(uint64_t joint, int enableSpring, float hertz, float dampingRatio, int enableLimit, float lower, float upper) {
    b3JointId j = jointOf(joint);
    b3WheelJoint_EnableSuspension(j, enableSpring != 0);
    b3WheelJoint_SetSuspensionHertz(j, hertz);
    b3WheelJoint_SetSuspensionDampingRatio(j, dampingRatio);
    b3WheelJoint_EnableSuspensionLimit(j, enableLimit != 0);
    b3WheelJoint_SetSuspensionLimits(j, lower, upper);
}

void b3Glue_WheelSetSpin(uint64_t joint, int enable, float speed, float maxTorque) {
    b3JointId j = jointOf(joint);
    b3WheelJoint_EnableSpinMotor(j, enable != 0);
    b3WheelJoint_SetSpinMotorSpeed(j, speed);
    b3WheelJoint_SetMaxSpinTorque(j, maxTorque);
}

void b3Glue_WheelSetSteering(uint64_t joint, int enable, float hertz, float dampingRatio, float targetAngle, float maxTorque, int enableLimit, float lower, float upper) {
    b3JointId j = jointOf(joint);
    b3WheelJoint_EnableSteering(j, enable != 0);
    b3WheelJoint_SetSteeringHertz(j, hertz);
    b3WheelJoint_SetSteeringDampingRatio(j, dampingRatio);
    b3WheelJoint_SetTargetSteeringAngle(j, targetAngle);
    b3WheelJoint_SetMaxSteeringTorque(j, maxTorque);
    b3WheelJoint_EnableSteeringLimit(j, enableLimit != 0);
    b3WheelJoint_SetSteeringLimits(j, lower, upper);
}

void b3Glue_WheelState(uint64_t joint, float* out3) {
    b3JointId j = jointOf(joint);
    out3[0] = b3WheelJoint_GetSpinSpeed(j);
    out3[1] = b3WheelJoint_GetSteeringAngle(j);
    out3[2] = b3WheelJoint_GetSpinTorque(j);
}
