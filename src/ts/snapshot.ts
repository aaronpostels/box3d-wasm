// SPDX-License-Identifier: MIT

import { RawBox3DModule, WorldId, BodyId } from "./types.js";

/** Saves the full state of a world as bytes (a Box3D world image). */
export function takeSnapshot(wasm: RawBox3DModule, world: WorldId): Uint8Array {
    const rec = wasm._b3Glue_SnapshotTake(world);
    try {
        const data = wasm._b3Glue_SnapshotData(rec);
        return wasm.HEAPU8.slice(data, data + wasm._b3Glue_SnapshotSize(rec));
    } finally {
        wasm._b3Glue_SnapshotFree(rec);
    }
}

/**
 * A world stood up from snapshot bytes. The player owns the world: destroy the player to destroy the world.
 * restoreInPlace() puts the world back to the bytes it was created from without changing the world id, so a game can
 * reset to a saved state cheaply. To go to a different snapshot, create a new player.
 */
export class Box3DSnapshotPlayer {
    private player: number;

    constructor(private readonly wasm: RawBox3DModule, bytes: Uint8Array) {
        const copy = wasm._malloc(Math.max(bytes.length, 8));
        if (!copy) throw new Error("Box3DSnapshotPlayer: out of memory.");
        try {
            wasm.HEAPU8.set(bytes, copy);
            this.player = wasm._b3Glue_RestoreCreate(copy, bytes.length); // Box3D copies the bytes
        } finally {
            wasm._free(copy);
        }
        if (!this.player) throw new Error("Box3DSnapshotPlayer: Box3D rejected the snapshot bytes.");
    }

    public get worldId(): WorldId {
        return this.wasm._b3Glue_RestoreWorld(this.player);
    }

    /** Body ids in the order they were created in the saved world (the first is often a ground body). */
    public bodyIds(): BodyId[] {
        const ids: BodyId[] = [];
        for (let i = 0, n = this.wasm._b3Glue_RestoreBodyCount(this.player); i < n; ++i) {
            ids.push(this.wasm._b3Glue_RestoreBodyId(this.player, i));
        }
        return ids;
    }

    public step(timeStep: number = 1 / 60, subStepCount: number = 4): void {
        this.wasm._b3Glue_Step(this.worldId, timeStep, subStepCount);
    }

    /** Resets the world to the creation snapshot; world id and body ids stay valid. False if Box3D could not restore. */
    public restoreInPlace(): boolean {
        return Boolean(this.wasm._b3Glue_RestoreInPlace(this.player));
    }

    public destroy(): void {
        if (!this.player) return;
        this.wasm._b3Glue_RestoreDestroy(this.player);
        this.player = 0;
    }
}
