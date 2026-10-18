// SPDX-License-Identifier: MIT
// Box3D glue, filters area: shape collision filters (category, mask, group) and filtered ray casts.
#pragma once

#include "box3d_glue.h"

#ifdef __cplusplus
extern "C" {
#endif

// Shape collision filter. A non-zero group wins over the masks: shapes with the same positive group always collide,
// shapes with the same negative group never do. Group 0 leaves the masks in charge.
// invokeContacts: rebuild the contacts of the shape now (pass true for a live shape).
B3_GLUE_EXPORT void b3Glue_SetShapeFilter(uint64_t shape, uint64_t category, uint64_t mask, int group, bool invokeContacts);
// out3: category, mask, group (group as int64).
B3_GLUE_EXPORT void b3Glue_GetShapeFilter(uint64_t shape, uint64_t* out3);

// Closest hit that passes the query filter (the query accepts shapes whose category is in mask and whose mask holds
// category). Same output as b3Glue_RayClosest: out7 = fraction, point, normal. Returns the shape, or 0.
B3_GLUE_EXPORT uint64_t b3Glue_RayClosestFiltered(uint32_t world, const float* origin, const float* d, uint64_t category, uint64_t mask, float* out7);

#ifdef __cplusplus
}
#endif
