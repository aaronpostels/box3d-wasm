// SPDX-License-Identifier: MIT
// Box3D glue, part 2: what a game engine needs on top of the basics. Flat C API: numbers and pointers only,
// so the same file serves JS (Emscripten) and Rust (wasm32-unknown-unknown) without struct layouts on the caller side.

#include "box3d_glue.h"
#include "recording.h"
#include "replay.h"

static inline b3BodyId bodyOf(uint64_t v) { return b3LoadBodyId(v); }

// ---- world ----

void b3Glue_SetGravity(uint32_t world, float gx, float gy, float gz) {
    b3World_SetGravity(b3LoadWorldId(world), (b3Vec3){ gx, gy, gz });
}

// ---- bodies ----

// flags: bit 0 sleeping allowed, bit 1 bullet (continuous against dynamic bodies), bit 2 start asleep.
uint64_t b3Glue_CreateBodyEx(uint32_t world, int type, const float* pose7, const float* vel6, int flags) {
    b3BodyDef def = b3DefaultBodyDef();
    def.type = (b3BodyType)type;
    def.position = (b3Pos){ pose7[0], pose7[1], pose7[2] };
    def.rotation = (b3Quat){ .v = { pose7[3], pose7[4], pose7[5] }, .s = pose7[6] };
    def.linearVelocity = (b3Vec3){ vel6[0], vel6[1], vel6[2] };
    def.angularVelocity = (b3Vec3){ vel6[3], vel6[4], vel6[5] };
    def.enableSleep = (flags & 1) != 0;
    def.isBullet = (flags & 2) != 0;
    def.isAwake = (flags & 4) == 0; // bit 2: start asleep (a built structure that needs no settling)
    return b3StoreBodyId(b3CreateBody(b3LoadWorldId(world), &def));
}

// State of many bodies at once: position(3) rotation(4) linear velocity(3) angular velocity(3) = 13 floats each.
void b3Glue_GetBatchState(const uint64_t* ids, int count, float* out) {
    for (int i = 0; i < count; ++i) {
        b3BodyId id = bodyOf(ids[i]);
        b3WorldTransform t = b3Body_GetTransform(id);
        b3Vec3 v = b3Body_GetLinearVelocity(id);
        b3Vec3 w = b3Body_GetAngularVelocity(id);
        float* o = out + i * 13;
        o[0] = (float)t.p.x; o[1] = (float)t.p.y; o[2] = (float)t.p.z;
        o[3] = t.q.v.x; o[4] = t.q.v.y; o[5] = t.q.v.z; o[6] = t.q.s;
        o[7] = v.x; o[8] = v.y; o[9] = v.z;
        o[10] = w.x; o[11] = w.y; o[12] = w.z;
    }
}

// Moves a kinematic body to a pose over the step, so it carries what it touches.
void b3Glue_SetTargetTransform(uint64_t body, const float* pose7, float dt) {
    b3WorldTransform t;
    t.p = (b3Pos){ pose7[0], pose7[1], pose7[2] };
    t.q = (b3Quat){ .v = { pose7[3], pose7[4], pose7[5] }, .s = pose7[6] };
    b3Body_SetTargetTransform(bodyOf(body), t, dt, true);
}

float b3Glue_BodyMass(uint64_t body) { return b3Body_GetMass(bodyOf(body)); }
bool b3Glue_BodyIsAwake(uint64_t body) { return b3Body_IsAwake(bodyOf(body)); }

// ---- shapes ----

// flags: bit 0 sensor (reports overlaps, pushes nothing), bit 1 contact events.
static b3ShapeDef shapeDef(float density, float friction, float restitution, int flags) {
    b3ShapeDef def = b3DefaultShapeDef();
    def.density = density;
    def.baseMaterial.friction = friction;
    def.baseMaterial.restitution = restitution;
    def.isSensor = (flags & 1) != 0;
    def.enableSensorEvents = true;
    def.enableContactEvents = (flags & 2) != 0;
    return def;
}

uint64_t b3Glue_AddBox(uint64_t body, float hx, float hy, float hz, float density, float friction, float restitution, int flags) {
    b3ShapeDef def = shapeDef(density, friction, restitution, flags);
    b3BoxHull box = b3MakeBoxHull(hx, hy, hz);
    return b3StoreShapeId(b3CreateHullShape(bodyOf(body), &def, &box.base));
}

uint64_t b3Glue_AddSphere(uint64_t body, float radius, float density, float friction, float restitution, int flags) {
    b3ShapeDef def = shapeDef(density, friction, restitution, flags);
    b3Sphere s = { .center = { 0, 0, 0 }, .radius = radius };
    return b3StoreShapeId(b3CreateSphereShape(bodyOf(body), &def, &s));
}

// Capsule along y, like rapier capsule_y.
uint64_t b3Glue_AddCapsule(uint64_t body, float halfHeight, float radius, float density, float friction, float restitution, int flags) {
    b3ShapeDef def = shapeDef(density, friction, restitution, flags);
    b3Capsule c = { .center1 = { 0, -halfHeight, 0 }, .center2 = { 0, halfHeight, 0 }, .radius = radius };
    return b3StoreShapeId(b3CreateCapsuleShape(bodyOf(body), &def, &c));
}

uint64_t b3Glue_ShapeBody(uint64_t shape) { return b3StoreBodyId(b3Shape_GetBody(b3LoadShapeId(shape))); }

// ---- joints ----

static b3Quat axisFrame(const float* axis, b3Vec3 from) {
    b3Vec3 to = b3Normalize((b3Vec3){ axis[0], axis[1], axis[2] });
    if (b3LengthSquared(to) < 0.5f) to = from;
    return b3ComputeQuatBetweenUnitVectors(from, to);
}

static void jointBase(b3JointDef* base, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, b3Quat q) {
    base->bodyIdA = bodyOf(a);
    base->bodyIdB = bodyOf(b);
    base->localFrameA = (b3Transform){ .p = { anchorA[0], anchorA[1], anchorA[2] }, .q = q };
    base->localFrameB = (b3Transform){ .p = { anchorB[0], anchorB[1], anchorB[2] }, .q = q };
    base->collideConnected = false;
}

uint64_t b3Glue_CreateWeld(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB) {
    b3WeldJointDef def = b3DefaultWeldJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, b3Quat_identity);
    return b3StoreJointId(b3CreateWeldJoint(b3LoadWorldId(world), &def));
}

// Hinge about `axis` (the same axis in both bodies frames, like the rapier path). Box3D hinge turns about frame z.
uint64_t b3Glue_CreateRevolute(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis, int limited, float lo, float hi) {
    b3RevoluteJointDef def = b3DefaultRevoluteJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, axisFrame(axis, (b3Vec3){ 0, 0, 1 }));
    def.enableLimit = limited != 0;
    def.lowerAngle = lo;
    def.upperAngle = hi;
    return b3StoreJointId(b3CreateRevoluteJoint(b3LoadWorldId(world), &def));
}

// Slider along `axis`. Box3D slider moves along frame x.
uint64_t b3Glue_CreatePrismatic(uint32_t world, uint64_t a, uint64_t b, const float* anchorA, const float* anchorB, const float* axis, int limited, float lo, float hi) {
    b3PrismaticJointDef def = b3DefaultPrismaticJointDef();
    jointBase(&def.base, a, b, anchorA, anchorB, axisFrame(axis, (b3Vec3){ 1, 0, 0 }));
    def.enableLimit = limited != 0;
    def.lowerTranslation = lo;
    def.upperTranslation = hi;
    return b3StoreJointId(b3CreatePrismaticJoint(b3LoadWorldId(world), &def));
}

// ---- events (valid until the next step) ----

// Pairs of shape ids, 2 per event. Returns the count written, at most `max`.
int b3Glue_ContactBeginEvents(uint32_t world, uint64_t* out, int max) {
    b3ContactEvents ev = b3World_GetContactEvents(b3LoadWorldId(world));
    int n = ev.beginCount < max ? ev.beginCount : max;
    for (int i = 0; i < n; ++i) {
        out[2 * i] = b3StoreShapeId(ev.beginEvents[i].shapeIdA);
        out[2 * i + 1] = b3StoreShapeId(ev.beginEvents[i].shapeIdB);
    }
    return n;
}

int b3Glue_ContactEndEvents(uint32_t world, uint64_t* out, int max) {
    b3ContactEvents ev = b3World_GetContactEvents(b3LoadWorldId(world));
    int n = ev.endCount < max ? ev.endCount : max;
    for (int i = 0; i < n; ++i) {
        out[2 * i] = b3StoreShapeId(ev.endEvents[i].shapeIdA);
        out[2 * i + 1] = b3StoreShapeId(ev.endEvents[i].shapeIdB);
    }
    return n;
}

// Sensor pairs: (sensor shape, visitor shape).
int b3Glue_SensorBeginEvents(uint32_t world, uint64_t* out, int max) {
    b3SensorEvents ev = b3World_GetSensorEvents(b3LoadWorldId(world));
    int n = ev.beginCount < max ? ev.beginCount : max;
    for (int i = 0; i < n; ++i) {
        out[2 * i] = b3StoreShapeId(ev.beginEvents[i].sensorShapeId);
        out[2 * i + 1] = b3StoreShapeId(ev.beginEvents[i].visitorShapeId);
    }
    return n;
}

int b3Glue_SensorEndEvents(uint32_t world, uint64_t* out, int max) {
    b3SensorEvents ev = b3World_GetSensorEvents(b3LoadWorldId(world));
    int n = ev.endCount < max ? ev.endCount : max;
    for (int i = 0; i < n; ++i) {
        out[2 * i] = b3StoreShapeId(ev.endEvents[i].sensorShapeId);
        out[2 * i + 1] = b3StoreShapeId(ev.endEvents[i].visitorShapeId);
    }
    return n;
}

// ---- ray ----

// out: fraction, point(3), normal(3). Returns the hit shape id, or 0 for a miss. `d` is the full ray vector.
uint64_t b3Glue_RayClosest(uint32_t world, const float* origin, const float* d, float* out7) {
    b3RayResult r = b3World_CastRayClosest(b3LoadWorldId(world), (b3Pos){ origin[0], origin[1], origin[2] }, (b3Vec3){ d[0], d[1], d[2] }, b3DefaultQueryFilter());
    if (!r.hit) return 0;
    out7[0] = r.fraction;
    out7[1] = (float)r.point.x; out7[2] = (float)r.point.y; out7[3] = (float)r.point.z;
    out7[4] = r.normal.x; out7[5] = r.normal.y; out7[6] = r.normal.z;
    return b3StoreShapeId(r.shapeId);
}

// ---- snapshot: the world as bytes, and back ----
// Box3D writes a full world image when a recording starts. A restore reads that image into a fresh world.

b3Recording* b3Glue_SnapshotTake(uint32_t world) {
    b3Recording* rec = b3CreateRecording(0);
    b3World_StartRecording(b3LoadWorldId(world), rec);
    b3World_StopRecording(b3LoadWorldId(world));
    return rec;
}
const uint8_t* b3Glue_SnapshotData(const b3Recording* rec) { return b3Recording_GetData(rec); }
int b3Glue_SnapshotSize(const b3Recording* rec) { return b3Recording_GetSize(rec); }
void b3Glue_SnapshotFree(b3Recording* rec) { b3DestroyRecording(rec); }

// Stands up a world from snapshot bytes. The returned player owns that world; destroy the player to destroy the world.
b3RecPlayer* b3Glue_RestoreCreate(const uint8_t* data, int size) { return b3CreatePlayer(data, size, 1); }
uint32_t b3Glue_RestoreWorld(b3RecPlayer* p) { return b3StoreWorldId(b3RecPlayer_GetWorldId(p)); }
int b3Glue_RestoreBodyCount(const b3RecPlayer* p) { return b3RecPlayer_GetBodyCount(p); }
uint64_t b3Glue_RestoreBodyId(const b3RecPlayer* p, int i) { return b3StoreBodyId(b3RecPlayer_GetBodyId(p, i)); }
void b3Glue_RestoreDestroy(b3RecPlayer* p) { b3DestroyPlayer(p); }

bool b3Glue_JointIsValid(uint64_t joint) { return b3Joint_IsValid(b3LoadJointId(joint)); }

// ---- character mover ----
// Quake-style movement with Box3D planes: gather the planes the capsule touches, solve for a position that satisfies
// them, sweep there, repeat. The character own shape is skipped.

#define GLUE_MAX_PLANES 32

typedef struct {
    b3ShapeId self;
    b3CollisionPlane planes[GLUE_MAX_PLANES];
    int count;
} MoverContext;

static bool collectPlanes(b3ShapeId shapeId, const b3PlaneResult* results, int n, void* ctx) {
    MoverContext* c = (MoverContext*)ctx;
    if (B3_ID_EQUALS(shapeId, c->self)) return true;
    for (int i = 0; i < n && c->count < GLUE_MAX_PLANES; ++i) {
        c->planes[c->count++] = (b3CollisionPlane){ .plane = results[i].plane, .pushLimit = 3.4e38f, .push = 0.0f, .clipVelocity = true };
    }
    return true;
}

static bool acceptShape(b3ShapeId shapeId, void* ctx) {
    return !B3_ID_EQUALS(shapeId, ((MoverContext*)ctx)->self);
}

static void gather(b3WorldId w, MoverContext* c, const float* pos, const b3Capsule* cap) {
    c->count = 0;
    b3World_CollideMover(w, (b3Pos){ pos[0], pos[1], pos[2] }, cap, b3DefaultQueryFilter(), collectPlanes, c);
}

// pos3 is read and written. Returns 1 when the character stands on something whose normal points up at least
// `groundNormalY` (cosine of the steepest slope), else 0.
int b3Glue_MoveCharacter(uint32_t world, uint64_t selfShape, float* pos3, float halfHeight, float radius, const float* delta3, float groundNormalY) {
    b3WorldId w = b3LoadWorldId(world);
    b3Capsule cap = { .center1 = { 0, -halfHeight, 0 }, .center2 = { 0, halfHeight, 0 }, .radius = radius };
    MoverContext c;
    c.self = b3LoadShapeId(selfShape);
    float target[3] = { pos3[0] + delta3[0], pos3[1] + delta3[1], pos3[2] + delta3[2] };

    // Settle: with no movement the solver only pushes the capsule out of whatever it overlaps.
    gather(w, &c, pos3, &cap);
    if (c.count > 0) {
        b3PlaneSolverResult s = b3SolvePlanes((b3Vec3){ 0, 0, 0 }, c.planes, c.count);
        pos3[0] += s.delta.x; pos3[1] += s.delta.y; pos3[2] += s.delta.z;
    }
    for (int i = 0; i < 5; ++i) {
        gather(w, &c, pos3, &cap);
        b3Vec3 remaining = { target[0] - pos3[0], target[1] - pos3[1], target[2] - pos3[2] };
        b3Vec3 step = remaining;
        if (c.count > 0) step = b3SolvePlanes(remaining, c.planes, c.count).delta;
        if (b3LengthSquared(step) < 1e-10f) break;
        float fraction = b3World_CastMover(w, (b3Pos){ pos3[0], pos3[1], pos3[2] }, &cap, step, b3DefaultQueryFilter(), acceptShape, &c);
        pos3[0] += step.x * fraction; pos3[1] += step.y * fraction; pos3[2] += step.z * fraction;
        if (fraction >= 1.0f) break;
    }
    gather(w, &c, pos3, &cap);
    for (int i = 0; i < c.count; ++i) {
        if (c.planes[i].plane.normal.y >= groundNormalY) return 1;
    }
    return 0;
}

// Sets the mass and scales the inertia with it, so a body keeps its shape of resistance to turning.
void b3Glue_SetBodyMass(uint64_t body, float mass) {
    b3BodyId id = bodyOf(body);
    b3MassData m = b3Body_GetMassData(id);
    if (m.mass <= 0.0f) return;
    float k = mass / m.mass;
    m.mass = mass;
    m.inertia = b3MulSM(k, m.inertia);
    b3Body_SetMassData(id, m);
}

void b3Glue_Configure(uint32_t world, bool sleeping, bool continuous) {
    b3World_EnableSleeping(b3LoadWorldId(world), sleeping);
    b3World_EnableContinuous(b3LoadWorldId(world), continuous);
}

// Contact stiffness (Hz), damping ratio and the fastest push-out speed (m/s). Stiffer contacts make tall stacks sag less.
void b3Glue_SetContactTuning(uint32_t world, float hertz, float dampingRatio, float pushSpeed) {
    b3World_SetContactTuning(b3LoadWorldId(world), hertz, dampingRatio, pushSpeed);
}

// A body falls asleep when it moves slower than this (m/s) for half a second. Higher puts piles to sleep sooner.
void b3Glue_SetSleepThreshold(uint64_t body, float threshold) {
    b3Body_SetSleepThreshold(bodyOf(body), threshold);
}

// ---- task system ----
// Box3D can hand its parallel work to the host: `enqueue` starts a task and returns a handle, `finish` blocks until it is done.
// The world then splits its solver over `workers` tasks (the calling thread is worker 0). Works on any world, also a restored one.

#include "physics_world.h"

void b3Glue_SetTaskSystem(uint32_t world, int workers, b3EnqueueTaskCallback* enqueue, b3FinishTaskCallback* finish) {
    b3WorldId id = b3LoadWorldId(world);
    b3World* w = b3GetWorldFromId(id);
    if (w == NULL || workers < 2 || enqueue == NULL || finish == NULL) return;
    w->enqueueTaskFcn = enqueue;
    w->finishTaskFcn = finish;
    w->userTaskContext = NULL;
    b3World_SetWorkerCount(id, workers);
}

int b3Glue_WorkerCount(uint32_t world) { return b3World_GetWorkerCount(b3LoadWorldId(world)); }

