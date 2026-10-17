// SPDX-License-Identifier: MIT
// Box3D WebAssembly Glue Header
#pragma once

#include "box3d/box3d.h"
#include "box3d/collision.h"
#include "box3d/math_functions.h"
#include "box3d/types.h"
#include <stdint.h>
#include <stdbool.h>

typedef struct b3Recording b3Recording;
typedef struct b3RecPlayer b3RecPlayer;

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define B3_GLUE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define B3_GLUE_EXPORT
#endif

#ifdef __cplusplus
extern "C" {
#endif

// World Management
B3_GLUE_EXPORT uint32_t b3Glue_CreateWorld(float gx, float gy, float gz, int enableSleep, int enableContinuous);
B3_GLUE_EXPORT void b3Glue_DestroyWorld(uint32_t worldIdRaw);
B3_GLUE_EXPORT void b3Glue_Step(uint32_t worldIdRaw, float timeStep, int subStepCount);
B3_GLUE_EXPORT bool b3Glue_WorldIsValid(uint32_t worldIdRaw);

// Body Management
B3_GLUE_EXPORT uint64_t b3Glue_CreateBody(uint32_t worldIdRaw, int type, float px, float py, float pz, float qx, float qy, float qz, float qw);
B3_GLUE_EXPORT void b3Glue_DestroyBody(uint64_t bodyIdRaw);
B3_GLUE_EXPORT bool b3Glue_BodyIsValid(uint64_t bodyIdRaw);

// Shapes
B3_GLUE_EXPORT uint64_t b3Glue_CreateBoxShape(uint64_t bodyIdRaw, float hx, float hy, float hz, float density, float friction, float restitution);
B3_GLUE_EXPORT uint64_t b3Glue_CreateSphereShape(uint64_t bodyIdRaw, float radius, float density, float friction, float restitution);
B3_GLUE_EXPORT uint64_t b3Glue_CreateCapsuleShape(uint64_t bodyIdRaw, float radius, float halfHeight, float density, float friction, float restitution);
B3_GLUE_EXPORT void b3Glue_DestroyShape(uint64_t shapeIdRaw, bool updateBodyMass);

// Transforms
B3_GLUE_EXPORT void b3Glue_GetTransform(uint64_t bodyIdRaw, float* out7);
B3_GLUE_EXPORT void b3Glue_SetTransform(uint64_t bodyIdRaw, float px, float py, float pz, float qx, float qy, float qz, float qw);
B3_GLUE_EXPORT void b3Glue_GetBatchTransforms(const uint64_t* bodyIds, int count, float* outFloats);

// Velocities & Forces
B3_GLUE_EXPORT void b3Glue_GetLinearVelocity(uint64_t bodyIdRaw, float* out3);
B3_GLUE_EXPORT void b3Glue_SetLinearVelocity(uint64_t bodyIdRaw, float vx, float vy, float vz);
B3_GLUE_EXPORT void b3Glue_GetAngularVelocity(uint64_t bodyIdRaw, float* out3);
B3_GLUE_EXPORT void b3Glue_SetAngularVelocity(uint64_t bodyIdRaw, float wx, float wy, float wz);
B3_GLUE_EXPORT void b3Glue_ApplyForce(uint64_t bodyIdRaw, float fx, float fy, float fz, float px, float py, float pz, bool wake);
B3_GLUE_EXPORT void b3Glue_ApplyLinearImpulse(uint64_t bodyIdRaw, float ix, float iy, float iz, bool wake);
B3_GLUE_EXPORT void b3Glue_ApplyAngularImpulse(uint64_t bodyIdRaw, float ax, float ay, float az, bool wake);

// Raycasts
B3_GLUE_EXPORT bool b3Glue_CastRayClosest(uint32_t worldIdRaw, float ox, float oy, float oz, float dx, float dy, float dz, float* outResult8);

// Part 2 (box3d_glue_ext.c): engine-grade API
B3_GLUE_EXPORT void b3Glue_SetTaskSystem(uint32_t world, int workers, b3EnqueueTaskCallback* enqueue, b3FinishTaskCallback* finish);
B3_GLUE_EXPORT int b3Glue_WorkerCount(uint32_t world);
B3_GLUE_EXPORT void b3Glue_SetSleepThreshold(uint64_t body, float threshold);
B3_GLUE_EXPORT void b3Glue_SetContactTuning(uint32_t world, float hertz, float dampingRatio, float pushSpeed);
B3_GLUE_EXPORT void b3Glue_Configure(uint32_t world, bool sleeping, bool continuous);
B3_GLUE_EXPORT void b3Glue_SetBodyMass(uint64_t body, float mass);
B3_GLUE_EXPORT int b3Glue_MoveCharacter(uint32_t world, uint64_t selfShape, float* pos3, float halfHeight, float radius, const float* delta3, float groundNormalY);
B3_GLUE_EXPORT bool b3Glue_JointIsValid(uint64_t joint);
B3_GLUE_EXPORT void b3Glue_SetGravity(uint32_t world, float gx, float gy, float gz);
B3_GLUE_EXPORT uint64_t b3Glue_CreateBodyEx(uint32_t world, int type, const float* pose7, const float* vel6, int flags);
B3_GLUE_EXPORT void b3Glue_GetBatchState(const uint64_t* ids, int count, float* out);
B3_GLUE_EXPORT void b3Glue_SetTargetTransform(uint64_t body, const float* pose7, float dt);
B3_GLUE_EXPORT float b3Glue_BodyMass(uint64_t body);
B3_GLUE_EXPORT bool b3Glue_BodyIsAwake(uint64_t body);
B3_GLUE_EXPORT uint64_t b3Glue_AddBox(uint64_t body, float hx, float hy, float hz, float density, float friction, float restitution, int flags);
B3_GLUE_EXPORT uint64_t b3Glue_AddSphere(uint64_t body, float radius, float density, float friction, float restitution, int flags);
B3_GLUE_EXPORT uint64_t b3Glue_AddCapsule(uint64_t body, float halfHeight, float radius, float density, float friction, float restitution, int flags);
B3_GLUE_EXPORT uint64_t b3Glue_ShapeBody(uint64_t shape);
B3_GLUE_EXPORT uint64_t b3Glue_CreateWeld(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB);
B3_GLUE_EXPORT uint64_t b3Glue_CreateRevolute(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis, int limited, float lo, float hi);
B3_GLUE_EXPORT uint64_t b3Glue_CreatePrismatic(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis, int limited, float lo, float hi);
B3_GLUE_EXPORT int b3Glue_ContactBeginEvents(uint32_t world, uint64_t* out, int max);
B3_GLUE_EXPORT int b3Glue_ContactEndEvents(uint32_t world, uint64_t* out, int max);
B3_GLUE_EXPORT int b3Glue_SensorBeginEvents(uint32_t world, uint64_t* out, int max);
B3_GLUE_EXPORT int b3Glue_SensorEndEvents(uint32_t world, uint64_t* out, int max);
B3_GLUE_EXPORT uint64_t b3Glue_RayClosest(uint32_t world, const float* origin, const float* d, float* out7);
B3_GLUE_EXPORT b3Recording* b3Glue_SnapshotTake(uint32_t world);
B3_GLUE_EXPORT const uint8_t* b3Glue_SnapshotData(const b3Recording* rec);
B3_GLUE_EXPORT int b3Glue_SnapshotSize(const b3Recording* rec);
B3_GLUE_EXPORT void b3Glue_SnapshotFree(b3Recording* rec);
B3_GLUE_EXPORT b3RecPlayer* b3Glue_RestoreCreate(const uint8_t* data, int size);
B3_GLUE_EXPORT uint32_t b3Glue_RestoreWorld(b3RecPlayer* p);
B3_GLUE_EXPORT int b3Glue_RestoreBodyCount(const b3RecPlayer* p);
B3_GLUE_EXPORT uint64_t b3Glue_RestoreBodyId(const b3RecPlayer* p, int i);
B3_GLUE_EXPORT void b3Glue_RestoreDestroy(b3RecPlayer* p);

#ifdef __cplusplus
}
#endif
