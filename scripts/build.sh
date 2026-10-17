#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

mkdir -p dist

FLAVOR="${1:-simd}"

C_FLAGS=(
    -std=gnu17
    -O3
    -flto
    -I "$REPO_DIR/vendor/box3d/include"
    -I "$REPO_DIR/vendor/box3d/src"
    -I "$REPO_DIR/src/c"
)

LINK_FLAGS=(
    -s WASM=1
    -s ALLOW_MEMORY_GROWTH=1
    -s MALLOC=emmalloc
    -s MODULARIZE=1
    -s EXPORT_ES6=1
    -s EXPORT_NAME=Box3DModule
    -s WASM_BIGINT=1
    -s 'EXPORTED_RUNTIME_METHODS=["HEAP8","HEAPU8","HEAP32","HEAPU32","HEAPF32","HEAP64","HEAPU64"]'
    -s 'EXPORTED_FUNCTIONS=["_malloc","_free","_b3Glue_CreateWorld","_b3Glue_DestroyWorld","_b3Glue_Step","_b3Glue_WorldIsValid","_b3Glue_CreateBody","_b3Glue_DestroyBody","_b3Glue_BodyIsValid","_b3Glue_CreateBoxShape","_b3Glue_CreateSphereShape","_b3Glue_CreateCapsuleShape","_b3Glue_DestroyShape","_b3Glue_GetTransform","_b3Glue_SetTransform","_b3Glue_GetBatchTransforms","_b3Glue_GetLinearVelocity","_b3Glue_SetLinearVelocity","_b3Glue_GetAngularVelocity","_b3Glue_SetAngularVelocity","_b3Glue_ApplyForce","_b3Glue_ApplyLinearImpulse","_b3Glue_ApplyAngularImpulse","_b3Glue_CastRayClosest"]'
)

OUT_FILE="dist/box3d.js"

if [ "$FLAVOR" = "scalar" ]; then
    echo "Building scalar flavor (no SIMD)..."
    C_FLAGS+=(-DBOX3D_DISABLE_SIMD)
    OUT_FILE="dist/box3d.scalar.js"
elif [ "$FLAVOR" = "threads" ]; then
    echo "Building threaded SIMD flavor (-pthread)..."
    C_FLAGS+=(-msimd128 -msse2)
    LINK_FLAGS+=(-pthread -s USE_PTHREADS=1 -s SHARED_MEMORY=1)
    OUT_FILE="dist/box3d.threads.js"
else
    echo "Building standard SIMD flavor (SSE2 -> WASM SIMD128)..."
    C_FLAGS+=(-msimd128 -msse2)
fi

echo "Compiling with emcc..."
emcc "${C_FLAGS[@]}" vendor/box3d/src/*.c src/c/box3d_glue.c "${LINK_FLAGS[@]}" -o "$OUT_FILE"

echo "Build successful: $OUT_FILE"
