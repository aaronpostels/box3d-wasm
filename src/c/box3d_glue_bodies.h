// SPDX-License-Identifier: MIT
// Box3D glue, bodies area: damping, gravity scale, motion locks, mass data, user data, enable/disable, batch impulses.
#pragma once

#include "box3d_glue.h"

#ifdef __cplusplus
extern "C" {
#endif

// Motion lock bits (b3Glue_SetMotionLocks): bit 0..2 translation x y z, bit 3..5 rotation x y z.
B3_GLUE_EXPORT void b3Glue_SetLinearDamping(uint64_t body, float damping);
B3_GLUE_EXPORT float b3Glue_GetLinearDamping(uint64_t body);
B3_GLUE_EXPORT void b3Glue_SetAngularDamping(uint64_t body, float damping);
B3_GLUE_EXPORT float b3Glue_GetAngularDamping(uint64_t body);
B3_GLUE_EXPORT void b3Glue_SetGravityScale(uint64_t body, float scale);
B3_GLUE_EXPORT float b3Glue_GetGravityScale(uint64_t body);
B3_GLUE_EXPORT void b3Glue_SetMotionLocks(uint64_t body, int locks);
B3_GLUE_EXPORT int b3Glue_GetMotionLocks(uint64_t body);

// out13: mass, center x y z, inertia columns cx cy cz (3 floats each).
B3_GLUE_EXPORT void b3Glue_GetMassData(uint64_t body, float* out13);
// mass, center3 and inertia9 (columns cx cy cz, 3 floats each) override the automatic mass until shapes change.
B3_GLUE_EXPORT void b3Glue_SetMassData(uint64_t body, float mass, const float* center3, const float* inertia9);

// The user data is an opaque 32-bit value the game owns (an entity id, an index): Box3D holds a void*, which is
// 32 bits on wasm32. Zero when never set.
B3_GLUE_EXPORT void b3Glue_SetBodyUserData(uint64_t body, uint32_t value);
B3_GLUE_EXPORT uint32_t b3Glue_GetBodyUserData(uint64_t body);

// Disabled bodies leave the simulation (expensive, like Box3D). Enabling again puts them back.
B3_GLUE_EXPORT void b3Glue_SetBodyEnabled(uint64_t body, bool enabled);
B3_GLUE_EXPORT bool b3Glue_BodyIsEnabled(uint64_t body);

// One-shot impulses at the centers of mass: bodies[i] gets impulses3[3i..3i+2]. Sleeping bodies wake only if wake is set.
B3_GLUE_EXPORT void b3Glue_ApplyImpulses(const uint64_t* bodies, const float* impulses3, int count, bool wake);

#ifdef __cplusplus
}
#endif
