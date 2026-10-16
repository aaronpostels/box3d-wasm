// SPDX-License-Identifier: MIT
// Box3D WebAssembly High-Performance Glue Implementation

#include "box3d_glue.h"
#include <string.h>

static inline b3WorldId unpackWorldId(uint32_t val) {
    b3WorldId id;
    memcpy(&id, &val, sizeof(id));
    return id;
}

static inline uint32_t packWorldId(b3WorldId id) {
    uint32_t val = 0;
    memcpy(&val, &id, sizeof(id));
    return val;
}

static inline b3BodyId unpackBodyId(uint64_t val) {
    b3BodyId id;
    memcpy(&id, &val, sizeof(id));
    return id;
}

static inline uint64_t packBodyId(b3BodyId id) {
    uint64_t val = 0;
    memcpy(&val, &id, sizeof(id));
    return val;
}

static inline b3ShapeId unpackShapeId(uint64_t val) {
    b3ShapeId id;
    memcpy(&id, &val, sizeof(id));
    return id;
}

static inline uint64_t packShapeId(b3ShapeId id) {
    uint64_t val = 0;
    memcpy(&val, &id, sizeof(id));
    return val;
}

uint32_t b3Glue_CreateWorld(float gx, float gy, float gz) {
    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){ gx, gy, gz };
    b3WorldId worldId = b3CreateWorld(&def);
    return packWorldId(worldId);
}

void b3Glue_DestroyWorld(uint32_t worldIdRaw) {
    b3DestroyWorld(unpackWorldId(worldIdRaw));
}

void b3Glue_Step(uint32_t worldIdRaw, float timeStep, int subStepCount) {
    b3World_Step(unpackWorldId(worldIdRaw), timeStep, subStepCount);
}

bool b3Glue_WorldIsValid(uint32_t worldIdRaw) {
    return b3World_IsValid(unpackWorldId(worldIdRaw));
}

uint64_t b3Glue_CreateBody(uint32_t worldIdRaw, int type, float px, float py, float pz, float qx, float qy, float qz, float qw) {
    b3BodyDef def = b3DefaultBodyDef();
    def.type = (b3BodyType)type;
    def.position = (b3Pos){ px, py, pz };
    def.rotation = (b3Quat){ .v = { qx, qy, qz }, .s = qw };

    b3BodyId bodyId = b3CreateBody(unpackWorldId(worldIdRaw), &def);
    return packBodyId(bodyId);
}

void b3Glue_DestroyBody(uint64_t bodyIdRaw) {
    b3DestroyBody(unpackBodyId(bodyIdRaw));
}

bool b3Glue_BodyIsValid(uint64_t bodyIdRaw) {
    return b3Body_IsValid(unpackBodyId(bodyIdRaw));
}

uint64_t b3Glue_CreateBoxShape(uint64_t bodyIdRaw, float hx, float hy, float hz, float density, float friction, float restitution) {
    b3BodyId bodyId = unpackBodyId(bodyIdRaw);
    b3ShapeDef def = b3DefaultShapeDef();
    def.density = density;
    def.baseMaterial.friction = friction;
    def.baseMaterial.restitution = restitution;

    b3BoxHull box = b3MakeBoxHull(hx, hy, hz);
    b3ShapeId shapeId = b3CreateHullShape(bodyId, &def, &box.hullData);
    return packShapeId(shapeId);
}

uint64_t b3Glue_CreateSphereShape(uint64_t bodyIdRaw, float radius, float density, float friction, float restitution) {
    b3BodyId bodyId = unpackBodyId(bodyIdRaw);
    b3ShapeDef def = b3DefaultShapeDef();
    def.density = density;
    def.baseMaterial.friction = friction;
    def.baseMaterial.restitution = restitution;

    b3Sphere sphere = { .center = { 0.0f, 0.0f, 0.0f }, .radius = radius };
    b3ShapeId shapeId = b3CreateSphereShape(bodyId, &def, &sphere);
    return packShapeId(shapeId);
}

uint64_t b3Glue_CreateCapsuleShape(uint64_t bodyIdRaw, float radius, float halfHeight, float density, float friction, float restitution) {
    b3BodyId bodyId = unpackBodyId(bodyIdRaw);
    b3ShapeDef def = b3DefaultShapeDef();
    def.density = density;
    def.baseMaterial.friction = friction;
    def.baseMaterial.restitution = restitution;

    b3Capsule capsule = {
        .center1 = { 0.0f, -halfHeight, 0.0f },
        .center2 = { 0.0f, halfHeight, 0.0f },
        .radius = radius
    };
    b3ShapeId shapeId = b3CreateCapsuleShape(bodyId, &def, &capsule);
    return packShapeId(shapeId);
}

void b3Glue_DestroyShape(uint64_t shapeIdRaw, bool updateBodyMass) {
    b3DestroyShape(unpackShapeId(shapeIdRaw), updateBodyMass);
}

void b3Glue_GetTransform(uint64_t bodyIdRaw, float* out7) {
    b3WorldTransform t = b3Body_GetTransform(unpackBodyId(bodyIdRaw));
    out7[0] = (float)t.p.x;
    out7[1] = (float)t.p.y;
    out7[2] = (float)t.p.z;
    out7[3] = t.q.v.x;
    out7[4] = t.q.v.y;
    out7[5] = t.q.v.z;
    out7[6] = t.q.s;
}

void b3Glue_SetTransform(uint64_t bodyIdRaw, float px, float py, float pz, float qx, float qy, float qz, float qw) {
    b3Pos pos = { px, py, pz };
    b3Quat rot = { .v = { qx, qy, qz }, .s = qw };
    b3Body_SetTransform(unpackBodyId(bodyIdRaw), pos, rot);
}

// Bulk extract transforms into contiguous WASM memory. Zero per-body JS call overhead.
void b3Glue_GetBatchTransforms(const uint64_t* bodyIds, int count, float* outFloats) {
    for (int i = 0; i < count; ++i) {
        b3WorldTransform t = b3Body_GetTransform(unpackBodyId(bodyIds[i]));
        int offset = i * 7;
        outFloats[offset + 0] = (float)t.p.x;
        outFloats[offset + 1] = (float)t.p.y;
        outFloats[offset + 2] = (float)t.p.z;
        outFloats[offset + 3] = t.q.v.x;
        outFloats[offset + 4] = t.q.v.y;
        outFloats[offset + 5] = t.q.v.z;
        outFloats[offset + 6] = t.q.s;
    }
}

void b3Glue_GetLinearVelocity(uint64_t bodyIdRaw, float* out3) {
    b3Vec3 v = b3Body_GetLinearVelocity(unpackBodyId(bodyIdRaw));
    out3[0] = v.x;
    out3[1] = v.y;
    out3[2] = v.z;
}

void b3Glue_SetLinearVelocity(uint64_t bodyIdRaw, float vx, float vy, float vz) {
    b3Body_SetLinearVelocity(unpackBodyId(bodyIdRaw), (b3Vec3){ vx, vy, vz });
}

void b3Glue_GetAngularVelocity(uint64_t bodyIdRaw, float* out3) {
    b3Vec3 w = b3Body_GetAngularVelocity(unpackBodyId(bodyIdRaw));
    out3[0] = w.x;
    out3[1] = w.y;
    out3[2] = w.z;
}

void b3Glue_SetAngularVelocity(uint64_t bodyIdRaw, float wx, float wy, float wz) {
    b3Body_SetAngularVelocity(unpackBodyId(bodyIdRaw), (b3Vec3){ wx, wy, wz });
}

void b3Glue_ApplyForce(uint64_t bodyIdRaw, float fx, float fy, float fz, float px, float py, float pz, bool wake) {
    b3Body_ApplyForce(unpackBodyId(bodyIdRaw), (b3Vec3){ fx, fy, fz }, (b3Pos){ px, py, pz }, wake);
}

void b3Glue_ApplyLinearImpulse(uint64_t bodyIdRaw, float ix, float iy, float iz, bool wake) {
    b3Body_ApplyLinearImpulseToCenter(unpackBodyId(bodyIdRaw), (b3Vec3){ ix, iy, iz }, wake);
}

void b3Glue_ApplyAngularImpulse(uint64_t bodyIdRaw, float ax, float ay, float az, bool wake) {
    b3Body_ApplyAngularImpulse(unpackBodyId(bodyIdRaw), (b3Vec3){ ax, ay, az }, wake);
}

bool b3Glue_CastRayClosest(uint32_t worldIdRaw, float ox, float oy, float oz, float dx, float dy, float dz, float* outResult8) {
    b3RayResult r = b3World_CastRayClosest(
        unpackWorldId(worldIdRaw),
        (b3Pos){ ox, oy, oz },
        (b3Vec3){ dx, dy, dz },
        b3DefaultQueryFilter()
    );

    if (!r.hit) {
        return false;
    }

    outResult8[0] = 1.0f; // hit flag
    outResult8[1] = r.fraction;
    outResult8[2] = (float)r.point.x;
    outResult8[3] = (float)r.point.y;
    outResult8[4] = (float)r.point.z;
    outResult8[5] = r.normal.x;
    outResult8[6] = r.normal.y;
    outResult8[7] = r.normal.z;
    return true;
}
