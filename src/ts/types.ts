// SPDX-License-Identifier: MIT

export type WorldId = number;
export type BodyId = bigint;
export type ShapeId = bigint;

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
}
