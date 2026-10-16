// SPDX-License-Identifier: MIT

import { RawBox3DModule } from "./types.js";
import { Box3DWorld } from "./world.js";

export * from "./types.js";
export * from "./world.js";

export type Box3DModuleFactory = (options?: Record<string, unknown>) => Promise<RawBox3DModule>;

/**
 * Initializes Box3D WASM instance using the generated Emscripten module factory.
 */
export async function initBox3D(
    factoryOrModule?: Box3DModuleFactory | RawBox3DModule,
    options?: Record<string, unknown>
): Promise<RawBox3DModule> {
    if (!factoryOrModule) {
        // Dynamic import fallback for standard dist output
        try {
            // @ts-ignore
            const mod = await import("../../dist/box3d.js");
            const factory = (mod.default ?? mod) as Box3DModuleFactory;
            return await factory(options);
        } catch (err) {
            throw new Error(
                "Could not auto-load 'dist/box3d.js'. Please build WASM first or pass the module factory explicitly: initBox3D(Box3DModuleFactory)."
            );
        }
    }

    if (typeof factoryOrModule === "function") {
        return await factoryOrModule(options);
    }

    return factoryOrModule;
}
