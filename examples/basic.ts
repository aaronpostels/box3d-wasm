// SPDX-License-Identifier: MIT
// Example: Basic Box3D Simulation with Batch Sync

import { initBox3D, Box3DWorld, BodyType } from "../src/ts/index.js";

async function main() {
    console.log("Initializing Box3D WASM...");
    const wasm = await initBox3D();
    const world = new Box3DWorld(wasm, [0, -9.81, 0]);

    console.log("World created with ID:", world.id);

    // 1. Create static ground box
    const groundId = world.createBody({
        type: BodyType.Static,
        position: [0, -1, 0]
    });
    world.createBoxShape(groundId, {
        halfWidth: 50,
        halfHeight: 1,
        halfDepth: 50,
        friction: 0.7
    });

    // 2. Create dynamic falling sphere
    const sphereId = world.createBody({
        type: BodyType.Dynamic,
        position: [0, 10, 0]
    });
    world.createSphereShape(sphereId, {
        radius: 0.5,
        density: 1.0,
        restitution: 0.5
    });

    // 3. Pre-allocate batch transform array for all active bodies
    const bodyIds = [groundId, sphereId];
    const transformsBuffer = new Float32Array(bodyIds.length * 7);

    console.log("Starting simulation loop (60 steps)...");
    for (let step = 0; step < 60; ++step) {
        world.step(1 / 60, 4);

        // Bulk sync: updates transformsBuffer with 0 GC allocations
        world.syncBatchTransforms(bodyIds, transformsBuffer);

        if (step % 10 === 0) {
            const sphereY = transformsBuffer[7 + 1]; // Body index 1, Y coordinate
            console.log(`Step ${step}: Sphere Y = ${sphereY.toFixed(3)} m`);
        }
    }

    // Raycast test: check ray from above sphere to ground
    const hit = world.castRay([0, 5, 0], [0, -10, 0]);
    if (hit) {
        console.log(`Raycast hit at point: [${hit.point.map(p => p.toFixed(2)).join(", ")}], fraction: ${hit.fraction.toFixed(2)}`);
    }

    world.destroy();
    console.log("Cleaned up Box3D world.");
}

main().catch(console.error);
