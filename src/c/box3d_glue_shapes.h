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

// Triangle mesh shape (static bodies only). `vertices` holds vertexCount xyz triples, `indices` 3 * triangleCount ints (CCW).
// `scale3` scales the mesh (NULL for 1 1 1). Box3D keeps pointing at the mesh data, so the glue owns it and frees it when
// the shape or the world is destroyed. Returns 0 when Box3D cannot build the mesh.
B3_GLUE_EXPORT uint64_t b3Glue_AddMesh(uint64_t body, const float* vertices, int vertexCount, const int32_t* indices, int triangleCount, const float* scale3, float friction, float restitution, uint64_t userMaterial, int flags);

// Height field shape (static bodies only). `heights` holds countX * countZ values (index = z * countX + x), `scale3` is
// the grid scale (all positive; NULL for 1 1 1). Heights are clamped to minHeight..maxHeight. Same ownership as b3Glue_AddMesh.
B3_GLUE_EXPORT uint64_t b3Glue_AddHeightfield(uint64_t body, const float* heights, int countX, int countZ, const float* scale3, float minHeight, float maxHeight, float friction, float restitution, uint64_t userMaterial, int flags);

// Free the mesh or height field data owned by a shape / by every shape of a world. Internal (not exported): called by DestroyShape and DestroyWorld.
void b3Glue_ReleaseShapeData(uint64_t shape);
void b3Glue_ReleaseWorldData(uint32_t world);

#ifdef __cplusplus
}
#endif
