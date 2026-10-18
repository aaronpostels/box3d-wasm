// SPDX-License-Identifier: MIT

export type WorldId = number;
export type BodyId = bigint;
export type ShapeId = bigint;
export type JointId = bigint;

export const BodyType = {
    Static: 0,
    Kinematic: 1,
    Dynamic: 2,
} as const;

export type BodyTypeValue = typeof BodyType[keyof typeof BodyType];

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number]; // [x, y, z, w]

export interface Transform {
    position: Vec3Tuple;
    rotation: QuatTuple;
}

export interface RayHit {
    hit: boolean;
    fraction: number;
    point: Vec3Tuple;
    normal: Vec3Tuple;
}

export interface BoxShapeOptions {
    halfWidth: number;
    halfHeight: number;
    halfDepth: number;
    density?: number;
    friction?: number;
    restitution?: number;
}

export interface SphereShapeOptions {
    radius: number;
    density?: number;
    friction?: number;
    restitution?: number;
}

export interface CapsuleShapeOptions {
    radius: number;
    halfHeight: number;
    density?: number;
    friction?: number;
    restitution?: number;
}

/** Material and flags for shapes made from hulls or transformed boxes. */
export interface ShapeMaterialOptions {
    density?: number;
    friction?: number;
    restitution?: number;
    /** Opaque 64-bit id Box3D passes to the friction and restitution callbacks. Default 0n. */
    userMaterial?: bigint;
    /** Sensor shapes pass through other shapes and report overlap events. */
    isSensor?: boolean;
    /** Contact begin and end events are reported for this shape. */
    contactEvents?: boolean;
}

export interface BoxTransformedShapeOptions extends ShapeMaterialOptions {
    /** Box centre in the body frame. Default origin. */
    center?: Vec3Tuple;
    /** Box rotation in the body frame, unit quaternion [x, y, z, w]. Default identity. */
    rotation?: QuatTuple;
}

/** A shape hit from a shape cast, an all-hits ray cast or a filtered ray cast. */
export interface ShapeHit {
    shape: ShapeId;
    fraction: number;
    point: Vec3Tuple;
    normal: Vec3Tuple;
}

/**
 * Proxy used by shape casts and overlaps: sphere, box, capsule or hull. A hull is a point cloud (flat x y z triples,
 * at most 128 points, the Box3D limit). Box half extents are centred on the origin.
 */
export type ProxyShape =
    | { kind: "sphere"; radius: number }
    | { kind: "box"; halfExtents: Vec3Tuple }
    | { kind: "capsule"; halfHeight: number; radius: number }
    | { kind: "hull"; radius: number; points: ArrayLike<number> };

/** Capsule for the character mover, from centre1 to centre2 with a radius. */
export interface MoverCapsule {
    center1: Vec3Tuple;
    center2: Vec3Tuple;
    radius: number;
}

/** A plane a capsule mover touches. The normal points out of the shape. */
export interface MoverPlane {
    shape: ShapeId;
    normal: Vec3Tuple;
    offset: number;
}

/**
 * Collision filter. Shapes collide when each category is in the other's mask. A non-zero group wins over the masks:
 * equal positive groups always collide, equal negative groups never do.
 */
export interface ShapeFilter {
    category: bigint;
    mask: bigint;
    group: number;
}

export interface MotionLocks {
    linearX: boolean;
    linearY: boolean;
    linearZ: boolean;
    angularX: boolean;
    angularY: boolean;
    angularZ: boolean;
}

/** Mass, centre of mass and inertia tensor, as three columns. */
export interface MassData {
    mass: number;
    center: Vec3Tuple;
    inertia: [Vec3Tuple, Vec3Tuple, Vec3Tuple];
}

export interface JointOptions {
    /** Anchor on body A in its local frame. Default origin. */
    anchorA?: Vec3Tuple;
    /** Anchor on body B in its local frame. Default origin. */
    anchorB?: Vec3Tuple;
}

export interface WheelJointOptions extends JointOptions {
    /** Suspension direction in body A's local frame. Required: a zero axis is not a direction. */
    axis: Vec3Tuple;
}

export interface JointReaction {
    force: Vec3Tuple;
    torque: Vec3Tuple;
}

export interface DistanceSpring {
    enable: boolean;
    hertz: number;
    dampingRatio: number;
    lowerForce: number;
    upperForce: number;
}

export interface DistanceLengthRange {
    enable: boolean;
    minLength: number;
    maxLength: number;
}

export interface DistanceMotor {
    enable: boolean;
    speed: number;
    maxForce: number;
}

export interface MotorSpring {
    linearHertz: number;
    linearDamping: number;
    maxForce: number;
    angularHertz: number;
    angularDamping: number;
    maxTorque: number;
}

export interface SphericalSpring {
    enable: boolean;
    hertz: number;
    dampingRatio: number;
    /** Target rotation of frame B relative to frame A, [x, y, z, w]. */
    targetRotation: QuatTuple;
}

export interface SphericalMotor {
    enable: boolean;
    /** Relative angular velocity (B minus A) the motor drives toward. */
    velocity: Vec3Tuple;
    maxTorque: number;
}

export interface SphericalAngles {
    cone: number;
    twist: number;
}

export interface WheelSuspension {
    spring: boolean;
    hertz: number;
    dampingRatio: number;
    limit: boolean;
    lower: number;
    upper: number;
}

export interface WheelSpin {
    enable: boolean;
    speed: number;
    maxTorque: number;
}

export interface WheelSteering {
    enable: boolean;
    hertz: number;
    dampingRatio: number;
    targetAngle: number;
    maxTorque: number;
    limit: boolean;
    lower: number;
    upper: number;
}

export interface WheelState {
    spinSpeed: number;
    steeringAngle: number;
    spinTorque: number;
}

export interface RawBox3DModule {
    HEAP8: Int8Array;
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    HEAPU32: Uint32Array;
    HEAPF32: Float32Array;
    HEAP64: BigInt64Array;
    HEAPU64: BigUint64Array;

    _malloc(bytes: number): number;
    _free(ptr: number): void;

    _b3Glue_CreateWorld(gx: number, gy: number, gz: number, enableSleep: number, enableContinuous: number): number;
    _b3Glue_DestroyWorld(worldId: number): void;
    _b3Glue_Step(worldId: number, timeStep: number, subStepCount: number): void;
    _b3Glue_WorldIsValid(worldId: number): number;

    _b3Glue_CreateBody(worldId: number, type: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number): bigint;
    _b3Glue_DestroyBody(bodyId: bigint): void;
    _b3Glue_BodyIsValid(bodyId: bigint): number;

    _b3Glue_CreateBoxShape(bodyId: bigint, hx: number, hy: number, hz: number, density: number, friction: number, restitution: number): bigint;
    _b3Glue_CreateSphereShape(bodyId: bigint, radius: number, density: number, friction: number, restitution: number): bigint;
    _b3Glue_CreateCapsuleShape(bodyId: bigint, radius: number, halfHeight: number, density: number, friction: number, restitution: number): bigint;
    _b3Glue_DestroyShape(shapeId: bigint, updateMass: boolean | number): void;

    _b3Glue_GetTransform(bodyId: bigint, outPtr7: number): void;
    _b3Glue_SetTransform(bodyId: bigint, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number): void;
    _b3Glue_GetBatchTransforms(bodyIdsPtr: number, count: number, outFloatsPtr: number): void;

    _b3Glue_GetLinearVelocity(bodyId: bigint, outPtr3: number): void;
    _b3Glue_SetLinearVelocity(bodyId: bigint, vx: number, vy: number, vz: number): void;
    _b3Glue_GetAngularVelocity(bodyId: bigint, outPtr3: number): void;
    _b3Glue_SetAngularVelocity(bodyId: bigint, wx: number, wy: number, wz: number): void;

    _b3Glue_ApplyForce(bodyId: bigint, fx: number, fy: number, fz: number, px: number, py: number, pz: number, wake: boolean | number): void;
    _b3Glue_ApplyLinearImpulse(bodyId: bigint, ix: number, iy: number, iz: number, wake: boolean | number): void;
    _b3Glue_ApplyAngularImpulse(bodyId: bigint, ax: number, ay: number, az: number, wake: boolean | number): void;

    _b3Glue_CastRayClosest(worldId: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, outPtr8: number): number;

    // Engine-grade API (box3d_glue_ext.c): bodies with velocity, shapes with flags, joints, events, batch state, character mover, snapshot.
    _b3Glue_Configure(world: number, sleeping: boolean | number, continuous: boolean | number): void;
    _b3Glue_SetBodyMass(body: bigint, mass: number): void;
    _b3Glue_MoveCharacter(world: number, selfShape: bigint, pos3: number, halfHeight: number, radius: number, delta3: number, groundNormalY: number): number;
    _b3Glue_JointIsValid(joint: bigint): boolean | number;
    _b3Glue_SetGravity(world: number, gx: number, gy: number, gz: number): void;
    _b3Glue_CreateBodyEx(world: number, type: number, pose7: number, vel6: number, flags: number): bigint;
    _b3Glue_GetBatchState(ids: number, count: number, out: number): void;
    _b3Glue_SetTargetTransform(body: bigint, pose7: number, dt: number): void;
    _b3Glue_BodyMass(body: bigint): number;
    _b3Glue_BodyIsAwake(body: bigint): boolean | number;
    _b3Glue_AddBox(body: bigint, hx: number, hy: number, hz: number, density: number, friction: number, restitution: number, flags: number): bigint;
    _b3Glue_AddSphere(body: bigint, radius: number, density: number, friction: number, restitution: number, flags: number): bigint;
    _b3Glue_AddCapsule(body: bigint, halfHeight: number, radius: number, density: number, friction: number, restitution: number, flags: number): bigint;
    _b3Glue_ShapeBody(shape: bigint): bigint;
    _b3Glue_CreateWeld(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number): bigint;
    _b3Glue_CreateRevolute(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number, axis: number, limited: number, lo: number, hi: number): bigint;
    _b3Glue_CreatePrismatic(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number, axis: number, limited: number, lo: number, hi: number): bigint;
    _b3Glue_ContactBeginEvents(world: number, out: number, max: number): number;
    _b3Glue_ContactEndEvents(world: number, out: number, max: number): number;
    _b3Glue_SensorBeginEvents(world: number, out: number, max: number): number;
    _b3Glue_SensorEndEvents(world: number, out: number, max: number): number;
    _b3Glue_RayClosest(world: number, origin: number, d: number, out7: number): bigint;
    _b3Glue_SnapshotTake(world: number): number;
    _b3Glue_SnapshotData(rec: number): number;
    _b3Glue_SnapshotSize(rec: number): number;
    _b3Glue_SnapshotFree(rec: number): void;
    _b3Glue_RestoreCreate(data: number, size: number): number;
    _b3Glue_RestoreWorld(p: number): number;
    _b3Glue_RestoreBodyCount(p: number): number;
    _b3Glue_RestoreBodyId(p: number, i: number): bigint;
    _b3Glue_RestoreDestroy(p: number): void;

    // Glue area files (src/c/box3d_glue_<area>.h): shapes, joints, queries, filters, bodies. Pointers are byte offsets.
    _b3Glue_AddHull(body: bigint, points: number, count: number, density: number, friction: number, restitution: number, userMaterial: bigint, flags: number): bigint;
    _b3Glue_AddBoxTransformed(body: bigint, half3: number, center3: number, quat4: number, density: number, friction: number, restitution: number, userMaterial: bigint, flags: number): bigint;
    _b3Glue_ShapeUserMaterial(shape: bigint): bigint;

    _b3Glue_CreateSpherical(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number): bigint;
    _b3Glue_CreateDistance(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number, length: number): bigint;
    _b3Glue_CreateWheel(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number, axis: number): bigint;
    _b3Glue_CreateMotor(world: number, a: bigint, b: bigint, anchorA: number, anchorB: number): bigint;
    _b3Glue_CreateFilter(world: number, a: bigint, b: bigint): bigint;
    _b3Glue_JointReaction(joint: bigint, out6: number): void;
    _b3Glue_DistanceSetLength(joint: bigint, length: number): void;
    _b3Glue_DistanceCurrentLength(joint: bigint): number;
    _b3Glue_DistanceSetSpring(joint: bigint, enable: boolean | number, hertz: number, dampingRatio: number, lowerForce: number, upperForce: number): void;
    _b3Glue_DistanceSetLengthRange(joint: bigint, enable: boolean | number, minLength: number, maxLength: number): void;
    _b3Glue_DistanceSetMotor(joint: bigint, enable: boolean | number, speed: number, maxForce: number): void;
    _b3Glue_MotorSetVelocity(joint: bigint, vel6: number): void;
    _b3Glue_MotorSetMaxForce(joint: bigint, maxForce: number, maxTorque: number): void;
    _b3Glue_MotorSetSpring(joint: bigint, linearHertz: number, linearDamping: number, maxForce: number, angularHertz: number, angularDamping: number, maxTorque: number): void;
    _b3Glue_SphericalSetCone(joint: bigint, enable: boolean | number, angle: number): void;
    _b3Glue_SphericalSetTwist(joint: bigint, enable: boolean | number, lower: number, upper: number): void;
    _b3Glue_SphericalSetSpring(joint: bigint, enable: boolean | number, hertz: number, dampingRatio: number, targetQuat4: number): void;
    _b3Glue_SphericalSetMotor(joint: bigint, enable: boolean | number, vel3: number, maxTorque: number): void;
    _b3Glue_SphericalAngles(joint: bigint, out2: number): void;
    _b3Glue_WheelSetSuspension(joint: bigint, enableSpring: boolean | number, hertz: number, dampingRatio: number, enableLimit: boolean | number, lower: number, upper: number): void;
    _b3Glue_WheelSetSpin(joint: bigint, enable: boolean | number, speed: number, maxTorque: number): void;
    _b3Glue_WheelSetSteering(joint: bigint, enable: boolean | number, hertz: number, dampingRatio: number, targetAngle: number, maxTorque: number, enableLimit: boolean | number, lower: number, upper: number): void;
    _b3Glue_WheelState(joint: bigint, out3: number): void;

    _b3Glue_CastShape(world: number, kind: number, shape: number, shapeLen: number, origin3: number, delta3: number, out7: number): bigint;
    _b3Glue_OverlapAABB(world: number, aabb6: number, ids: number, max: number): number;
    _b3Glue_OverlapShape(world: number, kind: number, shape: number, shapeLen: number, origin3: number, ids: number, max: number): number;
    _b3Glue_CastRayAll(world: number, origin3: number, delta3: number, ids: number, out7: number, max: number): number;
    _b3Glue_CollideMover(world: number, origin3: number, capsule7: number, self: bigint, ids: number, planes4: number, max: number): number;
    _b3Glue_CastMover(world: number, origin3: number, capsule7: number, delta3: number, self: bigint): number;

    _b3Glue_SetShapeFilter(shape: bigint, category: bigint, mask: bigint, group: number, invokeContacts: boolean | number): void;
    _b3Glue_GetShapeFilter(shape: bigint, out3: number): void;
    _b3Glue_RayClosestFiltered(world: number, origin: number, d: number, category: bigint, mask: bigint, out7: number): bigint;

    _b3Glue_SetLinearDamping(body: bigint, damping: number): void;
    _b3Glue_GetLinearDamping(body: bigint): number;
    _b3Glue_SetAngularDamping(body: bigint, damping: number): void;
    _b3Glue_GetAngularDamping(body: bigint): number;
    _b3Glue_SetGravityScale(body: bigint, scale: number): void;
    _b3Glue_GetGravityScale(body: bigint): number;
    _b3Glue_SetMotionLocks(body: bigint, locks: number): void;
    _b3Glue_GetMotionLocks(body: bigint): number;
    _b3Glue_GetMassData(body: bigint, out13: number): void;
    _b3Glue_SetMassData(body: bigint, mass: number, center3: number, inertia9: number): void;
    _b3Glue_SetBodyUserData(body: bigint, value: number): void;
    _b3Glue_GetBodyUserData(body: bigint): number;
    _b3Glue_SetBodyEnabled(body: bigint, enabled: boolean | number): void;
    _b3Glue_BodyIsEnabled(body: bigint): boolean | number;
    _b3Glue_ApplyImpulses(bodies: number, impulses3: number, count: number, wake: boolean | number): void;
}
