// SPDX-License-Identifier: MIT
// Box3D glue, filters area. Same conventions as box3d_glue_ext.c.

#include "box3d_glue_filters.h"

void b3Glue_SetShapeFilter(uint64_t shape, uint64_t category, uint64_t mask, int group, bool invokeContacts) {
    b3Filter f = { .categoryBits = category, .maskBits = mask, .groupIndex = group };
    b3Shape_SetFilter(b3LoadShapeId(shape), f, invokeContacts);
}

void b3Glue_GetShapeFilter(uint64_t shape, uint64_t* out3) {
    b3Filter f = b3Shape_GetFilter(b3LoadShapeId(shape));
    out3[0] = f.categoryBits;
    out3[1] = f.maskBits;
    out3[2] = (uint64_t)(int64_t)f.groupIndex;
}

uint64_t b3Glue_RayClosestFiltered(uint32_t world, const float* origin, const float* d, uint64_t category, uint64_t mask, float* out7) {
    b3QueryFilter filter = b3DefaultQueryFilter();
    filter.categoryBits = category;
    filter.maskBits = mask;
    b3RayResult r = b3World_CastRayClosest(b3LoadWorldId(world), (b3Pos){ origin[0], origin[1], origin[2] }, (b3Vec3){ d[0], d[1], d[2] }, filter);
    if (!r.hit) return 0;
    out7[0] = r.fraction;
    out7[1] = (float)r.point.x; out7[2] = (float)r.point.y; out7[3] = (float)r.point.z;
    out7[4] = r.normal.x; out7[5] = r.normal.y; out7[6] = r.normal.z;
    return b3StoreShapeId(r.shapeId);
}
