// SPDX-License-Identifier: MIT
// Box3D glue, queries area. Flat C API: numbers and pointers only, like the rest of the glue.
// Output buffers are caller-owned. A query writes at most `max` entries and returns the total it found, so a caller
// that sees a total above `max` can grow its buffer and ask again.

#include "box3d_glue_queries.h"

static b3WorldId worldOf(uint32_t world) { return b3LoadWorldId(world); }
static b3Pos posOf(const float* p) { return (b3Pos){ p[0], p[1], p[2] }; }
static b3Vec3 vecOf(const float* v) { return (b3Vec3){ v[0], v[1], v[2] }; }

// Builds the point cloud and radius of a shape kind. Returns 0 when the kind is unknown, the parameters are short
// (len is the float count of s), or the hull is too big.
static int buildProxy(int kind, const float* s, int len, b3Vec3* pts, b3ShapeProxy* proxy) {
    switch (kind) {
    case B3_GLUE_PROXY_SPHERE:
        if (len < 1) return 0;
        pts[0] = (b3Vec3){ 0.0f, 0.0f, 0.0f };
        proxy->count = 1;
        proxy->radius = s[0];
        break;
    case B3_GLUE_PROXY_BOX:
        if (len < 3) return 0;
        for (int i = 0; i < 8; ++i) {
            pts[i] = (b3Vec3){ (i & 1) ? s[0] : -s[0], (i & 2) ? s[1] : -s[1], (i & 4) ? s[2] : -s[2] };
        }
        proxy->count = 8;
        proxy->radius = 0.0f;
        break;
    case B3_GLUE_PROXY_CAPSULE:
        if (len < 2) return 0;
        pts[0] = (b3Vec3){ 0.0f, -s[0], 0.0f };
        pts[1] = (b3Vec3){ 0.0f, s[0], 0.0f };
        proxy->count = 2;
        proxy->radius = s[1];
        break;
    case B3_GLUE_PROXY_HULL: {
        if (len < 1) return 0;
        int n = (len - 1) / 3;
        if (n < 1 || n > B3_MAX_SHAPE_CAST_POINTS) return 0;
        for (int i = 0; i < n; ++i) pts[i] = vecOf(s + 1 + 3 * i);
        proxy->count = n;
        proxy->radius = s[0];
        break;
    }
    default:
        return 0;
    }
    proxy->points = pts;
    return 1;
}

// ---- shape cast ----

typedef struct {
    float fraction;
    int hit;
    b3ShapeId shape;
    b3Pos point;
    b3Vec3 normal;
} ClosestCast;

// Keeps the closest hit and clips the cast to it, so later hits must be nearer.
static float keepClosest(b3ShapeId shapeId, b3Pos point, b3Vec3 normal, float fraction, uint64_t material, int tri, int child, void* ctx) {
    ClosestCast* c = (ClosestCast*)ctx;
    if (fraction < c->fraction) {
        c->fraction = fraction;
        c->hit = 1;
        c->shape = shapeId;
        c->point = point;
        c->normal = normal;
    }
    return c->fraction;
}

uint64_t b3Glue_CastShape(uint32_t world, int kind, const float* shape, int shapeLen, const float* origin3, const float* delta3, float* out7) {
    b3Vec3 pts[B3_MAX_SHAPE_CAST_POINTS];
    b3ShapeProxy proxy;
    if (!buildProxy(kind, shape, shapeLen, pts, &proxy)) return 0;
    ClosestCast c = { .fraction = 1.0f, .hit = 0 };
    b3World_CastShape(worldOf(world), posOf(origin3), &proxy, vecOf(delta3), b3DefaultQueryFilter(), keepClosest, &c);
    if (!c.hit) return 0;
    out7[0] = c.fraction;
    out7[1] = (float)c.point.x; out7[2] = (float)c.point.y; out7[3] = (float)c.point.z;
    out7[4] = c.normal.x; out7[5] = c.normal.y; out7[6] = c.normal.z;
    return b3StoreShapeId(c.shape);
}

// ---- overlaps ----

typedef struct {
    uint64_t* ids;
    int max;
    int count;
} IdCollector;

static bool collectId(b3ShapeId shapeId, void* ctx) {
    IdCollector* c = (IdCollector*)ctx;
    if (c->count < c->max) c->ids[c->count] = b3StoreShapeId(shapeId);
    c->count++;
    return true;
}

int b3Glue_OverlapAABB(uint32_t world, const float* aabb6, uint64_t* ids, int max) {
    IdCollector c = { ids, max, 0 };
    b3AABB box = { vecOf(aabb6), vecOf(aabb6 + 3) };
    b3World_OverlapAABB(worldOf(world), box, b3DefaultQueryFilter(), collectId, &c);
    return c.count;
}

int b3Glue_OverlapShape(uint32_t world, int kind, const float* shape, int shapeLen, const float* origin3, uint64_t* ids, int max) {
    b3Vec3 pts[B3_MAX_SHAPE_CAST_POINTS];
    b3ShapeProxy proxy;
    if (!buildProxy(kind, shape, shapeLen, pts, &proxy)) return 0;
    IdCollector c = { ids, max, 0 };
    b3World_OverlapShape(worldOf(world), posOf(origin3), &proxy, b3DefaultQueryFilter(), collectId, &c);
    return c.count;
}

// ---- ray cast, all hits ----

typedef struct {
    uint64_t* ids;
    float* out7;
    int max;
    int count;
} RayHitCollector;

// Keeps the `max` nearest hits, sorted by fraction, in the caller's buffer. Hits arrive in traversal order, so each one
// is inserted at its sorted place; once the buffer is full, a hit only enters by displacing the farthest kept hit.
// Returning 1 keeps the ray unclipped, so every hit along it is reported.
static float collectRayHit(b3ShapeId shapeId, b3Pos point, b3Vec3 normal, float fraction, uint64_t material, int tri, int child, void* ctx) {
    RayHitCollector* c = (RayHitCollector*)ctx;
    int stored = c->count < c->max ? c->count : c->max;
    c->count++;
    if (c->max <= 0) return 1.0f;
    if (stored == c->max && !(fraction < c->out7[7 * (c->max - 1)])) return 1.0f;
    int j = stored < c->max ? stored : c->max - 1;
    while (j > 0 && c->out7[7 * (j - 1)] > fraction) {
        c->ids[j] = c->ids[j - 1];
        for (int k = 0; k < 7; ++k) c->out7[7 * j + k] = c->out7[7 * (j - 1) + k];
        --j;
    }
    float* o = c->out7 + 7 * j;
    c->ids[j] = b3StoreShapeId(shapeId);
    o[0] = fraction;
    o[1] = (float)point.x; o[2] = (float)point.y; o[3] = (float)point.z;
    o[4] = normal.x; o[5] = normal.y; o[6] = normal.z;
    return 1.0f;
}

int b3Glue_CastRayAll(uint32_t world, const float* origin3, const float* delta3, uint64_t* ids, float* out7, int max) {
    RayHitCollector c = { ids, out7, max, 0 };
    b3World_CastRay(worldOf(world), posOf(origin3), vecOf(delta3), b3DefaultQueryFilter(), collectRayHit, &c);
    return c.count;
}

// ---- capsule mover ----

static b3Capsule capsuleOf(const float* c7) {
    return (b3Capsule){ .center1 = vecOf(c7), .center2 = vecOf(c7 + 3), .radius = c7[6] };
}

// Shape to ignore, if any. `has` is 0 when the caller passed no shape.
typedef struct {
    int has;
    b3ShapeId self;
} SelfFilter;

static SelfFilter selfOf(uint64_t self) {
    SelfFilter s = { self != 0, { 0 } };
    if (s.has) s.self = b3LoadShapeId(self);
    return s;
}

static bool notSelf(b3ShapeId shapeId, void* ctx) {
    SelfFilter* s = (SelfFilter*)ctx;
    return !(s->has && B3_ID_EQUALS(shapeId, s->self));
}

typedef struct {
    uint64_t* ids;
    float* planes4;
    int max;
    int count;
    SelfFilter self;
} PlaneCollector;

static bool collectPlanes(b3ShapeId shapeId, const b3PlaneResult* results, int n, void* ctx) {
    PlaneCollector* c = (PlaneCollector*)ctx;
    if (!notSelf(shapeId, &c->self)) return true;
    for (int i = 0; i < n; ++i, ++c->count) {
        if (c->count >= c->max) continue;
        float* p = c->planes4 + 4 * c->count;
        p[0] = results[i].plane.normal.x; p[1] = results[i].plane.normal.y; p[2] = results[i].plane.normal.z;
        p[3] = results[i].plane.offset;
        c->ids[c->count] = b3StoreShapeId(shapeId);
    }
    return true;
}

int b3Glue_CollideMover(uint32_t world, const float* origin3, const float* capsule7, uint64_t self, uint64_t* ids, float* planes4, int max) {
    b3Capsule cap = capsuleOf(capsule7);
    PlaneCollector c = { ids, planes4, max, 0, selfOf(self) };
    b3World_CollideMover(worldOf(world), posOf(origin3), &cap, b3DefaultQueryFilter(), collectPlanes, &c);
    return c.count;
}

float b3Glue_CastMover(uint32_t world, const float* origin3, const float* capsule7, const float* delta3, uint64_t self) {
    b3Capsule cap = capsuleOf(capsule7);
    SelfFilter s = selfOf(self);
    return b3World_CastMover(worldOf(world), posOf(origin3), &cap, vecOf(delta3), b3DefaultQueryFilter(), notSelf, &s);
}
