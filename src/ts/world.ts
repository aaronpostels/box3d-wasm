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
    RayHit
} from "./types.js";

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
