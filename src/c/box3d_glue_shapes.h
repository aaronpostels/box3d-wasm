// SPDX-License-Identifier: MIT
// Box3D glue, shapes area: convex hulls, boxes with an offset and rotation, user material.
// Flags are those of box3d_glue_ext.c: bit 0 sensor, bit 1 contact events.
#pragma once

#include "box3d_glue.h"

#ifdef __cplusplus
extern "C" {
#endif

// Convex hull of `count` points (x y z each, at least 4, not all coplanar). Returns 0 when Box3D cannot build the hull.
B3_GLUE_EXPORT uint64_t b3Glue_AddHull(uint64_t body, const float* points, int count, float density, float friction, float restitution, uint64_t userMaterial, int flags);

// Box with half extents `half3`, centred at `center3` in the body frame and turned by `quat4` (x y z w, unit length).
B3_GLUE_EXPORT uint64_t b3Glue_AddBoxTransformed(uint64_t body, const float* half3, const float* center3, const float* quat4, float density, float friction, float restitution, uint64_t userMaterial, int flags);

// The user material id the shape was made with. Box3D passes it to the friction and restitution callbacks.
B3_GLUE_EXPORT uint64_t b3Glue_ShapeUserMaterial(uint64_t shape);

#ifdef __cplusplus
}
#endif
