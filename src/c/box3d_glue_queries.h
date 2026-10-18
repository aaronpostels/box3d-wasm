// SPDX-License-Identifier: MIT
// Box3D glue, queries area: shape casts, overlaps, all-hits ray cast, and capsule mover collide and cast.
#pragma once

#include "box3d_glue.h"

// Shape kinds for casts and overlaps. `shape` holds the parameters, `shapeLen` its float count:
//   SPHERE   [radius]
//   BOX      [hx, hy, hz]                   (half extents, centred on origin)
//   CAPSULE  [halfHeight, radius]           (segment along Y)
//   HULL     [radius, x0, y0, z0, x1, ...]  (point cloud, up to B3_MAX_SHAPE_CAST_POINTS points)
enum {
    B3_GLUE_PROXY_SPHERE = 0,
    B3_GLUE_PROXY_BOX = 1,
    B3_GLUE_PROXY_CAPSULE = 2,
    B3_GLUE_PROXY_HULL = 3,
};

// Closest hit of a shape cast from origin3 along delta3. out7: fraction, point(3), normal(3).
// Returns the hit shape id, or 0 for a miss (or a proxy that does not fit).
B3_GLUE_EXPORT uint64_t b3Glue_CastShape(uint32_t world, int kind, const float* shape, int shapeLen, const float* origin3, const float* delta3, float* out7);

// Shapes whose bounds overlap the box given as aabb6 = min(3), max(3). Writes up to `max` ids and returns the total found.
B3_GLUE_EXPORT int b3Glue_OverlapAABB(uint32_t world, const float* aabb6, uint64_t* ids, int max);

// Shapes that overlap the proxy placed at origin3. Writes up to `max` ids and returns the total found.
B3_GLUE_EXPORT int b3Glue_OverlapShape(uint32_t world, int kind, const float* shape, int shapeLen, const float* origin3, uint64_t* ids, int max);

// Every shape a ray from origin3 along delta3 passes through, sorted by fraction. Per hit: ids[i] and out7[7 * i ..]
// (fraction, point(3), normal(3)). Writes up to `max` hits and returns the total found. When the total exceeds `max`,
// the kept hits are the `max` nearest, still sorted by fraction. A caller that wants every hit grows the buffer to the
// returned total and calls again (the Rust wrapper in box3d-sys does this).
B3_GLUE_EXPORT int b3Glue_CastRayAll(uint32_t world, const float* origin3, const float* delta3, uint64_t* ids, float* out7, int max);

// Planes a capsule mover touches. capsule7: center1(3), center2(3), radius, relative to origin3. `self` is a shape to
// ignore (0 for none). Per plane: ids[i] and planes4[4 * i ..] (normal(3), offset), normals point out of the shape.
// Writes up to `max` planes and returns the total found.
B3_GLUE_EXPORT int b3Glue_CollideMover(uint32_t world, const float* origin3, const float* capsule7, uint64_t self, uint64_t* ids, float* planes4, int max);

// Fraction (0..1) of delta3 that the capsule travels from origin3 before it hits something. Box3D's mover cast slides
// along surfaces it meets. `self` is a shape to ignore (0 for none).
B3_GLUE_EXPORT float b3Glue_CastMover(uint32_t world, const float* origin3, const float* capsule7, const float* delta3, uint64_t self);
