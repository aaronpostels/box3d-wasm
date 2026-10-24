// SPDX-License-Identifier: MIT
// Box3D glue, shapes area. Same conventions as box3d_glue_ext.c: flat C API, numbers and pointers only.

#include "box3d_glue_shapes.h"
#include <stdlib.h>

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

// ---- mesh and height field ----
// Box3D holds a pointer to the data for the lifetime of the shape, so each shape's data sits in this table until released.
// ponytail: linear scan, fine for the few static terrain shapes a world has; use a hash if thousands of meshes.
typedef struct { uint64_t shape; uint32_t world; bool isMesh; void* data; } OwnedData;
static OwnedData* owned;
static int ownedCount, ownedCap;

static void keep(uint64_t shape, bool isMesh, void* data) {
    if (ownedCount == ownedCap) {
        ownedCap = ownedCap ? ownedCap * 2 : 8;
        owned = (OwnedData*)realloc(owned, sizeof(OwnedData) * ownedCap);
    }
    owned[ownedCount++] = (OwnedData){ shape, b3StoreWorldId(b3Shape_GetWorld(b3LoadShapeId(shape))), isMesh, data };
}

static void freeData(OwnedData* o) {
    if (o->isMesh) b3DestroyMesh((b3MeshData*)o->data);
    else b3DestroyHeightField((b3HeightFieldData*)o->data);
}

void b3Glue_ReleaseShapeData(uint64_t shape) {
    for (int i = 0; i < ownedCount; ++i) {
        if (owned[i].shape == shape) { freeData(&owned[i]); owned[i] = owned[--ownedCount]; return; }
    }
}

void b3Glue_ReleaseWorldData(uint32_t world) {
    for (int i = ownedCount - 1; i >= 0; --i) {
        if (owned[i].world == world) { freeData(&owned[i]); owned[i] = owned[--ownedCount]; }
    }
}

static b3Vec3 scaleOf(const float* s) { return s ? (b3Vec3){ s[0], s[1], s[2] } : (b3Vec3){ 1, 1, 1 }; }

uint64_t b3Glue_AddMesh(uint64_t body, const float* vertices, int vertexCount, const int32_t* indices, int triangleCount, const float* scale3, float friction, float restitution, uint64_t userMaterial, int flags) {
    b3MeshDef md = { 0 };
    md.vertices = (b3Vec3*)vertices;
    md.indices = (int32_t*)indices;
    md.vertexCount = vertexCount;
    md.triangleCount = triangleCount;
    b3MeshData* mesh = b3CreateMesh(&md, NULL, 0);
    if (mesh == NULL) return 0;
    b3ShapeDef def = shapeDefWithMaterial(0.0f, friction, restitution, userMaterial, flags);
    uint64_t shape = b3StoreShapeId(b3CreateMeshShape(bodyOf(body), &def, mesh, scaleOf(scale3)));
    if (shape == 0) { b3DestroyMesh(mesh); return 0; }
    keep(shape, true, mesh);
    return shape;
}

uint64_t b3Glue_AddHeightfield(uint64_t body, const float* heights, int countX, int countZ, const float* scale3, float minHeight, float maxHeight, float friction, float restitution, uint64_t userMaterial, int flags) {
    b3HeightFieldDef hd = { 0 };
    hd.heights = (float*)heights;
    hd.countX = countX;
    hd.countZ = countZ;
    hd.scale = scaleOf(scale3);
    hd.globalMinimumHeight = minHeight;
    hd.globalMaximumHeight = maxHeight;
    b3HeightFieldData* hf = b3CreateHeightField(&hd);
    if (hf == NULL) return 0;
    b3ShapeDef def = shapeDefWithMaterial(0.0f, friction, restitution, userMaterial, flags);
    uint64_t shape = b3StoreShapeId(b3CreateHeightFieldShape(bodyOf(body), &def, hf));
    if (shape == 0) { b3DestroyHeightField(hf); return 0; }
    keep(shape, false, hf);
    return shape;
}
