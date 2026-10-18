// SPDX-License-Identifier: MIT
// Box3D glue, shapes area. Same conventions as box3d_glue_ext.c: flat C API, numbers and pointers only.

#include "box3d_glue_shapes.h"

static inline b3BodyId bodyOf(uint64_t v) { return b3LoadBodyId(v); }

// Same defaults as box3d_glue_ext.c, plus the user material. Sensor events stay on, as there.
static b3ShapeDef shapeDefWithMaterial(float density, float friction, float restitution, uint64_t userMaterial, int flags) {
    b3ShapeDef def = b3DefaultShapeDef();
    def.density = density;
    def.baseMaterial.friction = friction;
    def.baseMaterial.restitution = restitution;
    def.baseMaterial.userMaterialId = userMaterial;
    def.isSensor = (flags & 1) != 0;
    def.enableSensorEvents = true;
    def.enableContactEvents = (flags & 2) != 0;
    return def;
}

// Box3D clones the hull into the shape, so the caller's hull is freed here.
uint64_t b3Glue_AddHull(uint64_t body, const float* points, int count, float density, float friction, float restitution, uint64_t userMaterial, int flags) {
    b3HullData* hull = b3CreateHull((const b3Vec3*)points, count, B3_MAX_HULL_VERTICES);
    if (hull == NULL) return 0;
    b3ShapeDef def = shapeDefWithMaterial(density, friction, restitution, userMaterial, flags);
    b3ShapeId shape = b3CreateHullShape(bodyOf(body), &def, hull);
    b3DestroyHull(hull);
    return b3StoreShapeId(shape);
}

uint64_t b3Glue_AddBoxTransformed(uint64_t body, const float* half3, const float* center3, const float* quat4, float density, float friction, float restitution, uint64_t userMaterial, int flags) {
    b3Transform frame = { .p = { center3[0], center3[1], center3[2] }, .q = { .v = { quat4[0], quat4[1], quat4[2] }, .s = quat4[3] } };
    b3BoxHull box = b3MakeTransformedBoxHull(half3[0], half3[1], half3[2], frame);
    b3ShapeDef def = shapeDefWithMaterial(density, friction, restitution, userMaterial, flags);
    return b3StoreShapeId(b3CreateHullShape(bodyOf(body), &def, &box.base));
}

uint64_t b3Glue_ShapeUserMaterial(uint64_t shape) { return b3Shape_GetSurfaceMaterial(b3LoadShapeId(shape)).userMaterialId; }
