// SPDX-License-Identifier: MIT
// Box3D glue, bodies area. Same conventions as box3d_glue_ext.c: flat numbers and pointers only.

#include "box3d_glue_bodies.h"

static inline b3BodyId bodyId(uint64_t v) { return b3LoadBodyId(v); }

void b3Glue_SetLinearDamping(uint64_t body, float damping) { b3Body_SetLinearDamping(bodyId(body), damping); }
float b3Glue_GetLinearDamping(uint64_t body) { return b3Body_GetLinearDamping(bodyId(body)); }
void b3Glue_SetAngularDamping(uint64_t body, float damping) { b3Body_SetAngularDamping(bodyId(body), damping); }
float b3Glue_GetAngularDamping(uint64_t body) { return b3Body_GetAngularDamping(bodyId(body)); }
void b3Glue_SetGravityScale(uint64_t body, float scale) { b3Body_SetGravityScale(bodyId(body), scale); }
float b3Glue_GetGravityScale(uint64_t body) { return b3Body_GetGravityScale(bodyId(body)); }

void b3Glue_SetMotionLocks(uint64_t body, int locks) {
    b3MotionLocks m = {
        .linearX = (locks & 1) != 0,
        .linearY = (locks & 2) != 0,
        .linearZ = (locks & 4) != 0,
        .angularX = (locks & 8) != 0,
        .angularY = (locks & 16) != 0,
        .angularZ = (locks & 32) != 0,
    };
    b3Body_SetMotionLocks(bodyId(body), m);
}

int b3Glue_GetMotionLocks(uint64_t body) {
    b3MotionLocks m = b3Body_GetMotionLocks(bodyId(body));
    return (m.linearX ? 1 : 0) | (m.linearY ? 2 : 0) | (m.linearZ ? 4 : 0) |
           (m.angularX ? 8 : 0) | (m.angularY ? 16 : 0) | (m.angularZ ? 32 : 0);
}

void b3Glue_GetMassData(uint64_t body, float* out13) {
    b3MassData md = b3Body_GetMassData(bodyId(body));
    out13[0] = md.mass;
    out13[1] = md.center.x; out13[2] = md.center.y; out13[3] = md.center.z;
    out13[4] = md.inertia.cx.x; out13[5] = md.inertia.cx.y; out13[6] = md.inertia.cx.z;
    out13[7] = md.inertia.cy.x; out13[8] = md.inertia.cy.y; out13[9] = md.inertia.cy.z;
    out13[10] = md.inertia.cz.x; out13[11] = md.inertia.cz.y; out13[12] = md.inertia.cz.z;
}

void b3Glue_SetMassData(uint64_t body, float mass, const float* center3, const float* inertia9) {
    b3MassData md;
    md.mass = mass;
    md.center = (b3Vec3){ center3[0], center3[1], center3[2] };
    md.inertia.cx = (b3Vec3){ inertia9[0], inertia9[1], inertia9[2] };
    md.inertia.cy = (b3Vec3){ inertia9[3], inertia9[4], inertia9[5] };
    md.inertia.cz = (b3Vec3){ inertia9[6], inertia9[7], inertia9[8] };
    b3Body_SetMassData(bodyId(body), md);
}

// Box3D stores a void*, which is 32 bits on wasm32: the value is a 32-bit integer (an entity id, an index).
void b3Glue_SetBodyUserData(uint64_t body, uint32_t value) { b3Body_SetUserData(bodyId(body), (void*)(uintptr_t)value); }
uint32_t b3Glue_GetBodyUserData(uint64_t body) { return (uint32_t)(uintptr_t)b3Body_GetUserData(bodyId(body)); }

void b3Glue_SetBodyEnabled(uint64_t body, bool enabled) {
    if (enabled) b3Body_Enable(bodyId(body));
    else b3Body_Disable(bodyId(body));
}
bool b3Glue_BodyIsEnabled(uint64_t body) { return b3Body_IsEnabled(bodyId(body)); }

void b3Glue_ApplyImpulses(const uint64_t* bodies, const float* impulses3, int count, bool wake) {
    for (int i = 0; i < count; ++i) {
        const float* p = impulses3 + 3 * i;
        b3Body_ApplyLinearImpulseToCenter(bodyId(bodies[i]), (b3Vec3){ p[0], p[1], p[2] }, wake);
    }
}
