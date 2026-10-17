// SPDX-License-Identifier: MIT
// Box3D WebAssembly Glue Header
#pragma once

#include "box3d/box3d.h"
#include "box3d/collision.h"
#include "box3d/math_functions.h"
#include "box3d/types.h"
#include <stdint.h>
#include <stdbool.h>

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

#ifdef __cplusplus
}
#endif
