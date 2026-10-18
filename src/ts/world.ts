// SPDX-License-Identifier: MIT

import {
    RawBox3DModule,
    WorldId,
    BodyId,
    ShapeId,
    BodyType,
    BodyTypeValue,
    Vec3Tuple,
    QuatTuple,
    Transform,
    BoxShapeOptions,
    SphereShapeOptions,
    CapsuleShapeOptions,
    RayHit,
    JointId,
    ShapeHit,
    ShapeMaterialOptions,
    BoxTransformedShapeOptions,
    ProxyShape,
    MoverCapsule,
    MoverPlane,
    ShapeFilter,
    MotionLocks,
    MassData,
    JointOptions,
    WheelJointOptions,
    JointReaction,
    DistanceSpring,
    DistanceLengthRange,
    DistanceMotor,
    MotorSpring,
    SphericalSpring,
    SphericalMotor,
    SphericalAngles,
    WheelSuspension,
    WheelSpin,
    WheelSteering,
    WheelState
} from "./types.js";

const ZERO3: Vec3Tuple = [0, 0, 0];
// Proxy kinds of box3d_glue_queries.h
const PROXY_SPHERE = 0;
const PROXY_BOX = 1;
const PROXY_CAPSULE = 2;
const PROXY_HULL = 3;
// B3_MAX_HULL_VERTICES in vendor/box3d/include/box3d/constants.h (also the shape cast point limit)
const MAX_HULL_POINTS = 128;

/** Three floats starting at index o of a plain array. */
function vec3At(f: readonly number[], o: number): Vec3Tuple {
    return [f[o], f[o + 1], f[o + 2]];
}

export class Box3DWorld {
    private static readonly EMPTY_FLOAT32 = new Float32Array(0);
    // Maximum allowable batch count (~67M bodies) to prevent 32-bit integer overflow in byte sizes
    private static readonly MAX_BATCH_COUNT = 0x03ffffff;

    private readonly wasm: RawBox3DModule;
    private readonly worldId: WorldId;
    private isDestroyed = false;

    // Preallocated scratch memory buffers for zero-GC single/batch queries
    private scratchPtr: number;
    private batchIdsPtr = 0;
    private batchFloatsPtr = 0;
    private batchCapacity = 0;
    private cachedWasmFloatView: Float32Array | null = null;

    constructor(wasm: RawBox3DModule, gravity: Vec3Tuple = [0, -9.81, 0], options: { sleep?: boolean; continuous?: boolean } = {}) {
        this.wasm = wasm;
        this.worldId = wasm._b3Glue_CreateWorld(gravity[0], gravity[1], gravity[2], (options.sleep ?? true) ? 1 : 0, (options.continuous ?? true) ? 1 : 0);
        if (wasm._b3Glue_WorldIsValid(this.worldId) === 0) {
            throw new Error("Box3DWorld: failed to create simulation world (maximum world count exceeded or invalid configuration).");
        }
        // Scratch buffer: 32 floats (128 bytes) for single-item queries
        this.scratchPtr = wasm._malloc(128);
        if (!this.scratchPtr) {
            wasm._b3Glue_DestroyWorld(this.worldId);
            throw new Error("Box3DWorld: failed to allocate scratch buffer (out of memory).");
        }
    }

    public get id(): WorldId {
        return this.worldId;
    }

    public step(timeStep: number = 1 / 60, subStepCount: number = 4): void {
        this.checkDestroyed();
        this.wasm._b3Glue_Step(this.worldId, timeStep, subStepCount);
    }

    public createBody(options: {
        type?: BodyTypeValue;
        position?: Vec3Tuple;
        rotation?: QuatTuple;
    } = {}): BodyId {
        this.checkDestroyed();
        const type = options.type ?? BodyType.Dynamic;
        const [px, py, pz] = options.position ?? [0, 0, 0];
        const [qx, qy, qz, qw] = options.rotation ?? [0, 0, 0, 1];

        return this.wasm._b3Glue_CreateBody(
            this.worldId,
            type,
            px, py, pz,
            qx, qy, qz, qw
        );
    }

    public destroyBody(bodyId: BodyId): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DestroyBody(bodyId);
    }

    public isBodyValid(bodyId: BodyId): boolean {
        this.checkDestroyed();
        return this.wasm._b3Glue_BodyIsValid(bodyId) !== 0;
    }

    public createBoxShape(bodyId: BodyId, options: BoxShapeOptions): ShapeId {
        this.checkDestroyed();
        return this.wasm._b3Glue_CreateBoxShape(
            bodyId,
            options.halfWidth,
            options.halfHeight,
            options.halfDepth,
            options.density ?? 1.0,
            options.friction ?? 0.6,
            options.restitution ?? 0.0
        );
    }

    public createSphereShape(bodyId: BodyId, options: SphereShapeOptions): ShapeId {
        this.checkDestroyed();
        return this.wasm._b3Glue_CreateSphereShape(
            bodyId,
            options.radius,
            options.density ?? 1.0,
            options.friction ?? 0.6,
            options.restitution ?? 0.0
        );
    }

    public createCapsuleShape(bodyId: BodyId, options: CapsuleShapeOptions): ShapeId {
        this.checkDestroyed();
        return this.wasm._b3Glue_CreateCapsuleShape(
            bodyId,
            options.radius,
            options.halfHeight,
            options.density ?? 1.0,
            options.friction ?? 0.6,
            options.restitution ?? 0.0
        );
    }

    public destroyShape(shapeId: ShapeId, updateBodyMass: boolean = true): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DestroyShape(shapeId, updateBodyMass);
    }

    public getTransform(bodyId: BodyId, outTransform?: Transform): Transform {
        this.checkDestroyed();
        this.wasm._b3Glue_GetTransform(bodyId, this.scratchPtr);
        const floatOffset = this.scratchPtr >>> 2;
        const h = this.wasm.HEAPF32;

        if (outTransform) {
            outTransform.position[0] = h[floatOffset + 0];
            outTransform.position[1] = h[floatOffset + 1];
            outTransform.position[2] = h[floatOffset + 2];
            outTransform.rotation[0] = h[floatOffset + 3];
            outTransform.rotation[1] = h[floatOffset + 4];
            outTransform.rotation[2] = h[floatOffset + 5];
            outTransform.rotation[3] = h[floatOffset + 6];
            return outTransform;
        }

        return {
            position: [h[floatOffset + 0], h[floatOffset + 1], h[floatOffset + 2]],
            rotation: [h[floatOffset + 3], h[floatOffset + 4], h[floatOffset + 5], h[floatOffset + 6]]
        };
    }

    public setTransform(bodyId: BodyId, position: Vec3Tuple, rotation: QuatTuple): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetTransform(
            bodyId,
            position[0], position[1], position[2],
            rotation[0], rotation[1], rotation[2], rotation[3]
        );
    }

    /**
     * Bulk transform synchronization: updates all given bodies into a contiguous Float32Array
     * in a single native call with 0 per-body JS invocation overhead.
     * Output format per body: 7 floats [px, py, pz, qx, qy, qz, qw].
     *
     * @param bodyIds Array or BigUint64Array of bodies to query.
     *        If this is a view on the WASM heap, create it after reserveBatchCapacity() and recreate it after heap growth.
     * @param targetBuffer Optional preallocated Float32Array to write into.
     *        - For guaranteed 0 allocations (even when body count fluctuates), pass an external Float32Array.
     *        - Only the first bodyIds.length * 7 entries contain current transforms; larger buffers may have a stale tail.
     *        - If passing a view on the WASM heap, call reserveBatchCapacity() first and create the view afterward.
     *          This prevents this method's batch-buffer allocation from growing memory. Other WASM allocations can
     *          still grow memory and invalidate non-shared heap views; recreate those views after any such growth.
     *        - If omitted, returns a capacity-sized direct view into WASM memory; only the first bodyIds.length * 7
     *          entries are current. It avoids allocations while batch capacity and WASM memory remain unchanged.
     *          A later sync overwrites it, and non-shared heap growth can detach it; copy it if retaining the data.
     */
    public syncBatchTransforms(bodyIds: BodyId[] | BigUint64Array, targetBuffer?: Float32Array): Float32Array {
        this.checkDestroyed();
        const count = bodyIds.length;
        if (count === 0) return targetBuffer ?? Box3DWorld.EMPTY_FLOAT32;

        const floatCount = count * 7;
        if (targetBuffer && targetBuffer.length < floatCount) {
            throw new RangeError(
                `Box3DWorld.syncBatchTransforms: targetBuffer length (${targetBuffer.length}) is smaller than required float count (${floatCount}).`
            );
        }

        this.ensureBatchCapacity(count);
        // Reserving buffers may grow non-shared WASM memory and detach a heap-backed target view.
        if (targetBuffer && targetBuffer.length < floatCount) {
            throw new RangeError(
                `Box3DWorld.syncBatchTransforms: targetBuffer length (${targetBuffer.length}) is smaller than required float count (${floatCount}).`
            );
        }
        if (bodyIds instanceof BigUint64Array && bodyIds.length !== count) {
            throw new RangeError("Box3DWorld.syncBatchTransforms: bodyIds view was detached during batch reservation; recreate it after reserving capacity.");
        }

        // Copy body IDs into WASM heap
        const idOffset = this.batchIdsPtr >>> 3;
        if (bodyIds instanceof BigUint64Array) {
            this.wasm.HEAPU64.set(bodyIds, idOffset);
        } else {
            for (let i = 0; i < count; ++i) {
                this.wasm.HEAPU64[idOffset + i] = bodyIds[i];
            }
        }

        // Native batch read
        this.wasm._b3Glue_GetBatchTransforms(this.batchIdsPtr, count, this.batchFloatsPtr);

        const floatOffset = this.batchFloatsPtr >>> 2;

        if (targetBuffer) {
            // Keep the copy safe if the native call caused memory growth and detached the target view.
            if (targetBuffer.length < floatCount) {
                throw new RangeError(
                    `Box3DWorld.syncBatchTransforms: targetBuffer length (${targetBuffer.length}) is smaller than required float count (${floatCount}).`
                );
            }
            const h = this.wasm.HEAPF32;
            // Reverse only when the destination starts inside the source range; this is safe for separate buffers too.
            if (
                targetBuffer.byteOffset > this.batchFloatsPtr &&
                targetBuffer.byteOffset < this.batchFloatsPtr + floatCount * 4
            ) {
                for (let i = floatCount - 1; i >= 0; --i) {
                    targetBuffer[i] = h[floatOffset + i];
                }
            } else {
                for (let i = 0; i < floatCount; ++i) {
                    targetBuffer[i] = h[floatOffset + i];
                }
            }
            return targetBuffer;
        }

        // Reuse the full-capacity view so count changes within this capacity do not allocate.
        if (
            !this.cachedWasmFloatView ||
            this.cachedWasmFloatView.buffer.byteLength === 0 ||
            this.cachedWasmFloatView.byteOffset !== this.batchFloatsPtr
        ) {
            this.cachedWasmFloatView = this.wasm.HEAPF32.subarray(
                floatOffset,
                floatOffset + this.batchCapacity * 7
            );
        }

        return this.cachedWasmFloatView;
    }

    /**
     * Pre-reserves internal batch memory for at least the given integer body count.
     * When using a target view on the WASM heap, call this before creating that view so batch-buffer allocation
     * does not grow memory during syncBatchTransforms. Other WASM allocations may still grow memory and invalidate
     * non-shared heap views.
     */
    public reserveBatchCapacity(capacity: number): void {
        this.checkDestroyed();
        this.ensureBatchCapacity(capacity);
    }

    public setLinearVelocity(bodyId: BodyId, v: Vec3Tuple): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetLinearVelocity(bodyId, v[0], v[1], v[2]);
    }

    public getLinearVelocity(bodyId: BodyId, outVec?: Vec3Tuple): Vec3Tuple {
        this.checkDestroyed();
        this.wasm._b3Glue_GetLinearVelocity(bodyId, this.scratchPtr);
        const o = this.scratchPtr >>> 2;
        const h = this.wasm.HEAPF32;
        if (outVec) {
            outVec[0] = h[o + 0];
            outVec[1] = h[o + 1];
            outVec[2] = h[o + 2];
            return outVec;
        }
        return [h[o + 0], h[o + 1], h[o + 2]];
    }

    public setAngularVelocity(bodyId: BodyId, w: Vec3Tuple): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetAngularVelocity(bodyId, w[0], w[1], w[2]);
    }

    public getAngularVelocity(bodyId: BodyId, outVec?: Vec3Tuple): Vec3Tuple {
        this.checkDestroyed();
        this.wasm._b3Glue_GetAngularVelocity(bodyId, this.scratchPtr);
        const o = this.scratchPtr >>> 2;
        const h = this.wasm.HEAPF32;
        if (outVec) {
            outVec[0] = h[o + 0];
            outVec[1] = h[o + 1];
            outVec[2] = h[o + 2];
            return outVec;
        }
        return [h[o + 0], h[o + 1], h[o + 2]];
    }

    public applyForce(bodyId: BodyId, force: Vec3Tuple, point: Vec3Tuple, wake: boolean = true): void {
        this.checkDestroyed();
        this.wasm._b3Glue_ApplyForce(bodyId, force[0], force[1], force[2], point[0], point[1], point[2], wake);
    }

    public applyLinearImpulse(bodyId: BodyId, impulse: Vec3Tuple, wake: boolean = true): void {
        this.checkDestroyed();
        this.wasm._b3Glue_ApplyLinearImpulse(bodyId, impulse[0], impulse[1], impulse[2], wake);
    }

    public applyAngularImpulse(bodyId: BodyId, impulse: Vec3Tuple, wake: boolean = true): void {
        this.checkDestroyed();
        this.wasm._b3Glue_ApplyAngularImpulse(bodyId, impulse[0], impulse[1], impulse[2], wake);
    }

    public castRay(origin: Vec3Tuple, translation: Vec3Tuple, outHit?: RayHit): RayHit | null {
        this.checkDestroyed();
        const hit = this.wasm._b3Glue_CastRayClosest(
            this.worldId,
            origin[0], origin[1], origin[2],
            translation[0], translation[1], translation[2],
            this.scratchPtr
        ) !== 0;

        if (!hit) {
            if (outHit) outHit.hit = false;
            return null;
        }

        const o = this.scratchPtr >>> 2;
        const h = this.wasm.HEAPF32;
        if (outHit) {
            outHit.hit = true;
            outHit.fraction = h[o + 1];
            outHit.point[0] = h[o + 2];
            outHit.point[1] = h[o + 3];
            outHit.point[2] = h[o + 4];
            outHit.normal[0] = h[o + 5];
            outHit.normal[1] = h[o + 6];
            outHit.normal[2] = h[o + 7];
            return outHit;
        }

        return {
            hit: true,
            fraction: h[o + 1],
            point: [h[o + 2], h[o + 3], h[o + 4]],
            normal: [h[o + 5], h[o + 6], h[o + 7]],
        };
    }

    // ---- shapes: hulls, transformed boxes, material, sensor and event flags, user material ----

    /**
     * Convex hull shape from a point cloud: flat x y z triples, 1 to 128 points; Box3D needs at least 4, not all
     * coplanar. Returns null when Box3D refuses the hull.
     */
    public addHull(bodyId: BodyId, points: ArrayLike<number>, options: ShapeMaterialOptions = {}): ShapeId | null {
        this.checkDestroyed();
        const count = Box3DWorld.pointCount(points);
        return this.withTemp([count * 12], ([pointsPtr]) => {
            this.writeF32(pointsPtr, points);
            const id = this.wasm._b3Glue_AddHull(
                bodyId, pointsPtr, count,
                options.density ?? 1.0, options.friction ?? 0.6, options.restitution ?? 0.0,
                options.userMaterial ?? 0n, Box3DWorld.shapeFlags(options)
            );
            return id === 0n ? null : id;
        });
    }

    /** Box with half extents, centred at options.center and turned by options.rotation, both in the body frame. */
    public addBoxTransformed(bodyId: BodyId, halfExtents: Vec3Tuple, options: BoxTransformedShapeOptions = {}): ShapeId | null {
        this.checkDestroyed();
        return this.withTemp([12, 12, 16], ([halfPtr, centerPtr, quatPtr]) => {
            this.writeF32(halfPtr, halfExtents);
            this.writeF32(centerPtr, options.center ?? ZERO3);
            this.writeF32(quatPtr, options.rotation ?? [0, 0, 0, 1]);
            const id = this.wasm._b3Glue_AddBoxTransformed(
                bodyId, halfPtr, centerPtr, quatPtr,
                options.density ?? 1.0, options.friction ?? 0.6, options.restitution ?? 0.0,
                options.userMaterial ?? 0n, Box3DWorld.shapeFlags(options)
            );
            return id === 0n ? null : id;
        });
    }

    /** The user material id the shape was made with (0n when none). */
    public getShapeUserMaterial(shapeId: ShapeId): bigint {
        this.checkDestroyed();
        return this.wasm._b3Glue_ShapeUserMaterial(shapeId);
    }

    // ---- joints: spherical, distance, wheel, motor, filter; limits, springs, motors; reaction ----

    public isJointValid(joint: JointId): boolean {
        this.checkDestroyed();
        return Boolean(this.wasm._b3Glue_JointIsValid(joint));
    }

    /** Ball joint: anchors on both bodies, free rotation about the anchor. */
    public createSphericalJoint(bodyA: BodyId, bodyB: BodyId, options: JointOptions = {}): JointId {
        this.checkDestroyed();
        return this.withAnchors(options, ZERO3, (a, b) => this.wasm._b3Glue_CreateSpherical(this.worldId, bodyA, bodyB, a, b));
    }

    /** Rod of the given length between two anchors (a rigid rod unless a spring is enabled). */
    public createDistanceJoint(bodyA: BodyId, bodyB: BodyId, length: number, options: JointOptions = {}): JointId {
        this.checkDestroyed();
        return this.withAnchors(options, ZERO3, (a, b) => this.wasm._b3Glue_CreateDistance(this.worldId, bodyA, bodyB, a, b, length));
    }

    /** Wheel: suspension along options.axis (body A frame), spin about the perpendicular wheel axis. */
    public createWheelJoint(bodyA: BodyId, bodyB: BodyId, options: WheelJointOptions): JointId {
        this.checkDestroyed();
        return this.withAnchors(options, options.axis, (a, b, axis) =>
            this.wasm._b3Glue_CreateWheel(this.worldId, bodyA, bodyB, a, b, axis));
    }

    /** Motor joint: drives body B's velocity relative to body A (see setMotorVelocity). */
    public createMotorJoint(bodyA: BodyId, bodyB: BodyId, options: JointOptions = {}): JointId {
        this.checkDestroyed();
        return this.withAnchors(options, ZERO3, (a, b) => this.wasm._b3Glue_CreateMotor(this.worldId, bodyA, bodyB, a, b));
    }

    /** Filter joint: the two bodies do not collide with each other. */
    public createFilterJoint(bodyA: BodyId, bodyB: BodyId): JointId {
        this.checkDestroyed();
        return this.wasm._b3Glue_CreateFilter(this.worldId, bodyA, bodyB);
    }

    /** Constraint force and torque the joint applies, as a reaction at the joint. */
    public getJointReaction(joint: JointId): JointReaction {
        this.checkDestroyed();
        return this.withTemp([24], ([p]) => {
            this.wasm._b3Glue_JointReaction(joint, p);
            const f = this.readF32(p, 6);
            return { force: vec3At(f, 0), torque: vec3At(f, 3) };
        });
    }

    public setDistanceLength(joint: JointId, length: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DistanceSetLength(joint, length);
    }

    public getDistanceCurrentLength(joint: JointId): number {
        this.checkDestroyed();
        return this.wasm._b3Glue_DistanceCurrentLength(joint);
    }

    /** Spring along the rod. Spring off means a rigid rod, which overrides the length range and the motor. */
    public setDistanceSpring(joint: JointId, s: DistanceSpring): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DistanceSetSpring(joint, s.enable, s.hertz, s.dampingRatio, s.lowerForce, s.upperForce);
    }

    public setDistanceLengthRange(joint: JointId, r: DistanceLengthRange): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DistanceSetLengthRange(joint, r.enable, r.minLength, r.maxLength);
    }

    public setDistanceMotor(joint: JointId, m: DistanceMotor): void {
        this.checkDestroyed();
        this.wasm._b3Glue_DistanceSetMotor(joint, m.enable, m.speed, m.maxForce);
    }

    /** Target relative velocity of body B: linear then angular. */
    public setMotorVelocity(joint: JointId, linear: Vec3Tuple, angular: Vec3Tuple = ZERO3): void {
        this.checkDestroyed();
        this.withTemp([24], ([p]) => {
            this.writeF32(p, [...linear, ...angular]);
            this.wasm._b3Glue_MotorSetVelocity(joint, p);
        });
    }

    public setMotorMaxForce(joint: JointId, maxForce: number, maxTorque: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_MotorSetMaxForce(joint, maxForce, maxTorque);
    }

    /** Position control: linear and angular spring (hertz, damping ratio) with their force and torque caps. */
    public setMotorSpring(joint: JointId, s: MotorSpring): void {
        this.checkDestroyed();
        this.wasm._b3Glue_MotorSetSpring(joint, s.linearHertz, s.linearDamping, s.maxForce, s.angularHertz, s.angularDamping, s.maxTorque);
    }

    /** Cone limit around frame A's z axis, in radians. */
    public setSphericalCone(joint: JointId, enable: boolean, angle: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SphericalSetCone(joint, enable, angle);
    }

    /** Twist limit around frame B's z axis, in radians. */
    public setSphericalTwist(joint: JointId, enable: boolean, lower: number, upper: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SphericalSetTwist(joint, enable, lower, upper);
    }

    public setSphericalSpring(joint: JointId, s: SphericalSpring): void {
        this.checkDestroyed();
        this.withTemp([16], ([q]) => {
            this.writeF32(q, s.targetRotation);
            this.wasm._b3Glue_SphericalSetSpring(joint, s.enable, s.hertz, s.dampingRatio, q);
        });
    }

    public setSphericalMotor(joint: JointId, m: SphericalMotor): void {
        this.checkDestroyed();
        this.withTemp([12], ([v]) => {
            this.writeF32(v, m.velocity);
            this.wasm._b3Glue_SphericalSetMotor(joint, m.enable, v, m.maxTorque);
        });
    }

    /** Current cone and twist angles, in radians. */
    public getSphericalAngles(joint: JointId): SphericalAngles {
        this.checkDestroyed();
        return this.withTemp([8], ([p]) => {
            this.wasm._b3Glue_SphericalAngles(joint, p);
            const f = this.readF32(p, 2);
            return { cone: f[0], twist: f[1] };
        });
    }

    public setWheelSuspension(joint: JointId, s: WheelSuspension): void {
        this.checkDestroyed();
        this.wasm._b3Glue_WheelSetSuspension(joint, s.spring, s.hertz, s.dampingRatio, s.limit, s.lower, s.upper);
    }

    public setWheelSpin(joint: JointId, s: WheelSpin): void {
        this.checkDestroyed();
        this.wasm._b3Glue_WheelSetSpin(joint, s.enable, s.speed, s.maxTorque);
    }

    public setWheelSteering(joint: JointId, s: WheelSteering): void {
        this.checkDestroyed();
        this.wasm._b3Glue_WheelSetSteering(joint, s.enable, s.hertz, s.dampingRatio, s.targetAngle, s.maxTorque, s.limit, s.lower, s.upper);
    }

    public getWheelState(joint: JointId): WheelState {
        this.checkDestroyed();
        return this.withTemp([12], ([p]) => {
            this.wasm._b3Glue_WheelState(joint, p);
            const f = this.readF32(p, 3);
            return { spinSpeed: f[0], steeringAngle: f[1], spinTorque: f[2] };
        });
    }

    // ---- queries: shape casts, overlaps, all-hits ray cast, capsule mover collide and cast ----

    /** Closest hit of a proxy swept from origin along translation. Null on a miss. */
    public castShape(proxy: ProxyShape, origin: Vec3Tuple, translation: Vec3Tuple): ShapeHit | null {
        this.checkDestroyed();
        const { kind, params } = Box3DWorld.encodeProxy(proxy);
        return this.withTemp([params.length * 4, 12, 12, 28], ([shapePtr, originPtr, deltaPtr, outPtr]) => {
            this.writeF32(shapePtr, params);
            this.writeF32(originPtr, origin);
            this.writeF32(deltaPtr, translation);
            const shape = this.wasm._b3Glue_CastShape(this.worldId, kind, shapePtr, params.length, originPtr, deltaPtr, outPtr);
            return shape === 0n ? null : this.readShapeHit(shape, outPtr);
        });
    }

    /** Shapes whose bounds overlap the box min..max. Grows its buffer when there are more than maxResults. */
    public overlapAABB(min: Vec3Tuple, max: Vec3Tuple, maxResults: number = 64): ShapeId[] {
        this.checkDestroyed();
        return this.withTemp([24], ([aabbPtr]) => {
            this.writeF32(aabbPtr, [min[0], min[1], min[2], max[0], max[1], max[2]]);
            return this.collectIds((idsPtr, cap) => this.wasm._b3Glue_OverlapAABB(this.worldId, aabbPtr, idsPtr, cap), maxResults);
        });
    }

    /** Shapes that overlap a proxy placed at origin. Grows its buffer when there are more than maxResults. */
    public overlapShape(proxy: ProxyShape, origin: Vec3Tuple, maxResults: number = 64): ShapeId[] {
        this.checkDestroyed();
        const { kind, params } = Box3DWorld.encodeProxy(proxy);
        return this.withTemp([params.length * 4, 12], ([shapePtr, originPtr]) => {
            this.writeF32(shapePtr, params);
            this.writeF32(originPtr, origin);
            return this.collectIds(
                (idsPtr, cap) => this.wasm._b3Glue_OverlapShape(this.worldId, kind, shapePtr, params.length, originPtr, idsPtr, cap),
                maxResults
            );
        });
    }

    /** Every shape a ray passes through, sorted by fraction along the ray. Grows its buffer when needed. */
    public castRayAll(origin: Vec3Tuple, translation: Vec3Tuple, maxHits: number = 32): ShapeHit[] {
        this.checkDestroyed();
        let cap = Math.max(1, maxHits);
        for (;;) {
            const result = this.withTemp([cap * 8, cap * 28, 12, 12], ([idsPtr, outPtr, originPtr, deltaPtr]) => {
                this.writeF32(originPtr, origin);
                this.writeF32(deltaPtr, translation);
                const total = this.wasm._b3Glue_CastRayAll(this.worldId, originPtr, deltaPtr, idsPtr, outPtr, cap);
                if (total > cap) return { total, hits: null };
                const ids = this.readU64(idsPtr, total);
                const f = this.readF32(outPtr, total * 7);
                const hits: ShapeHit[] = [];
                for (let i = 0; i < total; ++i) hits.push(Box3DWorld.hitFrom(ids[i], f, 7 * i));
                return { total, hits };
            });
            if (result.hits) return result.hits;
            cap = result.total;
        }
    }

    /** Planes a capsule mover touches at origin. Pass self to ignore one shape (the mover's own). */
    public collideMover(origin: Vec3Tuple, capsule: MoverCapsule, self?: ShapeId, maxPlanes: number = 32): MoverPlane[] {
        this.checkDestroyed();
        let cap = Math.max(1, maxPlanes);
        for (;;) {
            const result = this.withTemp([cap * 8, cap * 16, 12, 28], ([idsPtr, planesPtr, originPtr, capsulePtr]) => {
                this.writeF32(originPtr, origin);
                this.writeF32(capsulePtr, [...capsule.center1, ...capsule.center2, capsule.radius]);
                const total = this.wasm._b3Glue_CollideMover(this.worldId, originPtr, capsulePtr, self ?? 0n, idsPtr, planesPtr, cap);
                if (total > cap) return { total, planes: null };
                const ids = this.readU64(idsPtr, total);
                const f = this.readF32(planesPtr, total * 4);
                const planes: MoverPlane[] = [];
                for (let i = 0; i < total; ++i) {
                    planes.push({ shape: ids[i], normal: vec3At(f, 4 * i), offset: f[4 * i + 3] });
                }
                return { total, planes };
            });
            if (result.planes) return result.planes;
            cap = result.total;
        }
    }

    /** Fraction (0..1) of translation the capsule travels before it hits something; it slides along surfaces. */
    public castMover(origin: Vec3Tuple, capsule: MoverCapsule, translation: Vec3Tuple, self?: ShapeId): number {
        this.checkDestroyed();
        return this.withTemp([12, 28, 12], ([originPtr, capsulePtr, deltaPtr]) => {
            this.writeF32(originPtr, origin);
            this.writeF32(capsulePtr, [...capsule.center1, ...capsule.center2, capsule.radius]);
            this.writeF32(deltaPtr, translation);
            return this.wasm._b3Glue_CastMover(this.worldId, originPtr, capsulePtr, deltaPtr, self ?? 0n);
        });
    }

    // ---- filters: shape category, mask and group; filtered ray cast ----

    /**
     * Sets a shape's collision filter. invokeContacts rebuilds the shape's contacts now (pass true for a live shape).
     * group is a 32-bit integer.
     */
    public setShapeFilter(shapeId: ShapeId, filter: ShapeFilter, invokeContacts: boolean = true): void {
        this.checkDestroyed();
        if (!Number.isInteger(filter.group) || filter.group < -2147483648 || filter.group > 2147483647) {
            throw new RangeError(`Box3DWorld.setShapeFilter: group ${filter.group} is not a 32-bit integer.`);
        }
        this.wasm._b3Glue_SetShapeFilter(shapeId, filter.category, filter.mask, filter.group, invokeContacts);
    }

    public getShapeFilter(shapeId: ShapeId): ShapeFilter {
        this.checkDestroyed();
        return this.withTemp([24], ([p]) => {
            this.wasm._b3Glue_GetShapeFilter(shapeId, p);
            const [category, mask, group] = this.readU64(p, 3);
            return { category, mask, group: Number(BigInt.asIntN(32, group)) };
        });
    }

    /**
     * Closest hit that passes the query filter: a shape is hit when its category is in mask and its mask holds
     * category. Null when nothing is hit.
     */
    public rayClosestFiltered(origin: Vec3Tuple, translation: Vec3Tuple, category: bigint, mask: bigint): ShapeHit | null {
        this.checkDestroyed();
        return this.withTemp([12, 12, 28], ([originPtr, deltaPtr, outPtr]) => {
            this.writeF32(originPtr, origin);
            this.writeF32(deltaPtr, translation);
            const shape = this.wasm._b3Glue_RayClosestFiltered(this.worldId, originPtr, deltaPtr, category, mask, outPtr);
            return shape === 0n ? null : this.readShapeHit(shape, outPtr);
        });
    }

    // ---- bodies: damping, gravity scale, motion locks, mass data, user data, enable/disable, batch impulses ----

    public setLinearDamping(bodyId: BodyId, damping: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetLinearDamping(bodyId, damping);
    }

    public getLinearDamping(bodyId: BodyId): number {
        this.checkDestroyed();
        return this.wasm._b3Glue_GetLinearDamping(bodyId);
    }

    public setAngularDamping(bodyId: BodyId, damping: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetAngularDamping(bodyId, damping);
    }

    public getAngularDamping(bodyId: BodyId): number {
        this.checkDestroyed();
        return this.wasm._b3Glue_GetAngularDamping(bodyId);
    }

    /** Multiplier on world gravity for this body: 0 floats, 1 falls normally. */
    public setGravityScale(bodyId: BodyId, scale: number): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetGravityScale(bodyId, scale);
    }

    public getGravityScale(bodyId: BodyId): number {
        this.checkDestroyed();
        return this.wasm._b3Glue_GetGravityScale(bodyId);
    }

    public setMotionLocks(bodyId: BodyId, locks: MotionLocks): void {
        this.checkDestroyed();
        const bits = (locks.linearX ? 1 : 0) | (locks.linearY ? 2 : 0) | (locks.linearZ ? 4 : 0)
            | (locks.angularX ? 8 : 0) | (locks.angularY ? 16 : 0) | (locks.angularZ ? 32 : 0);
        this.wasm._b3Glue_SetMotionLocks(bodyId, bits);
    }

    public getMotionLocks(bodyId: BodyId): MotionLocks {
        this.checkDestroyed();
        const bits = this.wasm._b3Glue_GetMotionLocks(bodyId);
        return {
            linearX: (bits & 1) !== 0,
            linearY: (bits & 2) !== 0,
            linearZ: (bits & 4) !== 0,
            angularX: (bits & 8) !== 0,
            angularY: (bits & 16) !== 0,
            angularZ: (bits & 32) !== 0,
        };
    }

    public getMassData(bodyId: BodyId): MassData {
        this.checkDestroyed();
        return this.withTemp([52], ([p]) => {
            this.wasm._b3Glue_GetMassData(bodyId, p);
            const f = this.readF32(p, 13);
            return { mass: f[0], center: vec3At(f, 1), inertia: [vec3At(f, 4), vec3At(f, 7), vec3At(f, 10)] };
        });
    }

    /** Overrides the automatic mass until the body's shapes change. Inertia is three columns. */
    public setMassData(bodyId: BodyId, data: MassData): void {
        this.checkDestroyed();
        this.withTemp([12, 36], ([centerPtr, inertiaPtr]) => {
            this.writeF32(centerPtr, data.center);
            this.writeF32(inertiaPtr, [...data.inertia[0], ...data.inertia[1], ...data.inertia[2]]);
            this.wasm._b3Glue_SetMassData(bodyId, data.mass, centerPtr, inertiaPtr);
        });
    }

    /** Opaque 32-bit value the game owns (an entity id, an index). Zero when never set. */
    public setBodyUserData(bodyId: BodyId, value: number): void {
        this.checkDestroyed();
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
            throw new RangeError(`Box3DWorld.setBodyUserData: value ${value} is not an unsigned 32-bit integer.`);
        }
        this.wasm._b3Glue_SetBodyUserData(bodyId, value);
    }

    public getBodyUserData(bodyId: BodyId): number {
        this.checkDestroyed();
        return this.wasm._b3Glue_GetBodyUserData(bodyId) >>> 0;
    }

    /** Disabled bodies leave the simulation (expensive). Enabling again puts them back. */
    public setBodyEnabled(bodyId: BodyId, enabled: boolean): void {
        this.checkDestroyed();
        this.wasm._b3Glue_SetBodyEnabled(bodyId, enabled);
    }

    public isBodyEnabled(bodyId: BodyId): boolean {
        this.checkDestroyed();
        return Boolean(this.wasm._b3Glue_BodyIsEnabled(bodyId));
    }

    /**
     * One-shot impulses at the centres of mass: bodies[i] gets impulses[3i..3i+2]. Sleeping bodies wake only when
     * wake is set.
     */
    public applyImpulses(bodyIds: BodyId[] | BigUint64Array, impulses: ArrayLike<number>, wake: boolean = true): void {
        this.checkDestroyed();
        const count = bodyIds.length;
        if (impulses.length !== 3 * count) {
            throw new RangeError(`Box3DWorld.applyImpulses: ${count} bodies need ${3 * count} impulse floats, got ${impulses.length}.`);
        }
        if (count === 0) return;
        this.withTemp([count * 8, count * 12], ([idsPtr, impulsesPtr]) => {
            this.writeU64(idsPtr, bodyIds);
            this.writeF32(impulsesPtr, impulses);
            this.wasm._b3Glue_ApplyImpulses(idsPtr, impulsesPtr, count, wake);
        });
    }

    public destroy(): void {
        if (this.isDestroyed) return;
        this.wasm._free(this.scratchPtr);
        if (this.batchCapacity > 0) {
            this.wasm._free(this.batchIdsPtr);
            this.wasm._free(this.batchFloatsPtr);
        }
        this.cachedWasmFloatView = null;
        this.wasm._b3Glue_DestroyWorld(this.worldId);
        this.isDestroyed = true;
    }

    /**
     * Allocates one heap buffer per size, runs fn with their pointers and frees them all, even when fn throws.
     * Read heap views after any native call: Box3D may allocate and grow memory.
     */
    private withTemp<T>(sizes: number[], fn: (ptrs: number[]) => T): T {
        const ptrs: number[] = [];
        try {
            for (const size of sizes) {
                const ptr = this.wasm._malloc(Math.max(size, 8));
                if (!ptr) throw new Error("Box3DWorld: out of memory allocating a temporary buffer.");
                ptrs.push(ptr);
            }
            return fn(ptrs);
        } finally {
            for (const ptr of ptrs) this.wasm._free(ptr);
        }
    }

    private writeF32(ptr: number, values: ArrayLike<number>): void {
        const h = this.wasm.HEAPF32;
        const o = ptr >>> 2;
        for (let i = 0; i < values.length; ++i) h[o + i] = values[i];
    }

    private readF32(ptr: number, count: number): number[] {
        const h = this.wasm.HEAPF32;
        const o = ptr >>> 2;
        const out = new Array<number>(count);
        for (let i = 0; i < count; ++i) out[i] = h[o + i];
        return out;
    }

    private writeU64(ptr: number, values: ArrayLike<bigint>): void {
        const h = this.wasm.HEAPU64;
        const o = ptr >>> 3;
        for (let i = 0; i < values.length; ++i) h[o + i] = values[i];
    }

    private readU64(ptr: number, count: number): bigint[] {
        const h = this.wasm.HEAPU64;
        const o = ptr >>> 3;
        const out = new Array<bigint>(count);
        for (let i = 0; i < count; ++i) out[i] = h[o + i];
        return out;
    }

    /** Reads a ShapeHit from out7 at ptr: fraction, point, normal. */
    private readShapeHit(shape: ShapeId, ptr: number): ShapeHit {
        return Box3DWorld.hitFrom(shape, this.readF32(ptr, 7), 0);
    }

    private static hitFrom(shape: ShapeId, f: number[], o: number): ShapeHit {
        return { shape, fraction: f[o], point: vec3At(f, o + 1), normal: vec3At(f, o + 4) };
    }

    private static shapeFlags(options: ShapeMaterialOptions): number {
        return (options.isSensor ? 1 : 0) | (options.contactEvents ? 2 : 0);
    }

    private static pointCount(points: ArrayLike<number>): number {
        if (points.length === 0 || points.length % 3 !== 0 || points.length / 3 > MAX_HULL_POINTS) {
            throw new RangeError(
                `Box3DWorld: a hull takes 1 to ${MAX_HULL_POINTS} points as flat x y z triples (got ${points.length} numbers).`
            );
        }
        return points.length / 3;
    }

    /** Glue proxy kind and its parameters: sphere [r], box [hx hy hz], capsule [halfHeight r], hull [r, x y z ...]. */
    private static encodeProxy(proxy: ProxyShape): { kind: number; params: number[] } {
        switch (proxy.kind) {
            case "sphere":
                return { kind: PROXY_SPHERE, params: [proxy.radius] };
            case "box":
                return { kind: PROXY_BOX, params: [...proxy.halfExtents] };
            case "capsule":
                return { kind: PROXY_CAPSULE, params: [proxy.halfHeight, proxy.radius] };
            case "hull":
                Box3DWorld.pointCount(proxy.points);
                return { kind: PROXY_HULL, params: [proxy.radius, ...Array.from(proxy.points)] };
        }
    }

    /** Writes the two anchors (and an optional axis) to heap and passes their pointers to fn. */
    private withAnchors<T>(options: JointOptions, axis: Vec3Tuple, fn: (anchorA: number, anchorB: number, axisPtr: number) => T): T {
        return this.withTemp([12, 12, 12], ([a, b, c]) => {
            this.writeF32(a, options.anchorA ?? ZERO3);
            this.writeF32(b, options.anchorB ?? ZERO3);
            this.writeF32(c, axis);
            return fn(a, b, c);
        });
    }

    /**
     * Runs a glue query that writes up to cap ids and returns the total found. When the total is above cap the query
     * runs again with a buffer that holds all of them.
     */
    private collectIds(query: (idsPtr: number, cap: number) => number, initialCapacity: number): ShapeId[] {
        let cap = Math.max(1, initialCapacity);
        for (;;) {
            const result = this.withTemp([cap * 8], ([idsPtr]) => {
                const total = query(idsPtr, cap);
                if (total > cap) return { total, ids: null };
                return { total, ids: this.readU64(idsPtr, total) };
            });
            if (result.ids) return result.ids;
            cap = result.total;
        }
    }

    private ensureBatchCapacity(count: number): void {
        if (!Number.isSafeInteger(count) || count < 0 || count > Box3DWorld.MAX_BATCH_COUNT) {
            throw new RangeError(`Box3DWorld: batch count ${count} is out of bounds (max ${Box3DWorld.MAX_BATCH_COUNT}).`);
        }
        if (count <= this.batchCapacity) return;

        // Geometric growth (1.5x) with minimum 64 to eliminate allocator churn on incremental additions
        const geometricTarget = Math.ceil(this.batchCapacity * 1.5);
        const newCapacity = Math.min(Box3DWorld.MAX_BATCH_COUNT, Math.max(count, geometricTarget, 64));
        const newIdsPtr = this.wasm._malloc(newCapacity * 8);
        const newFloatsPtr = this.wasm._malloc(newCapacity * 28);

        if (!newIdsPtr || !newFloatsPtr) {
            if (newIdsPtr) this.wasm._free(newIdsPtr);
            if (newFloatsPtr) this.wasm._free(newFloatsPtr);
            throw new Error(`Box3DWorld: failed to allocate batch buffers for count ${count} (out of memory).`);
        }

        if (this.batchCapacity > 0) {
            this.wasm._free(this.batchIdsPtr);
            this.wasm._free(this.batchFloatsPtr);
        }

        this.batchCapacity = newCapacity;
        this.batchIdsPtr = newIdsPtr;
        this.batchFloatsPtr = newFloatsPtr;
        this.cachedWasmFloatView = null;
    }

    private checkDestroyed(): void {
        if (this.isDestroyed) {
            throw new Error("Box3DWorld has already been destroyed.");
        }
    }
}
