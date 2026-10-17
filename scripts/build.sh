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
    -s 'EXPORTED_FUNCTIONS=["_malloc","_free"]'
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
emcc "${C_FLAGS[@]}" vendor/box3d/src/*.c src/c/box3d_glue.c src/c/box3d_glue_ext.c "${LINK_FLAGS[@]}" -o "$OUT_FILE"

echo "Build successful: $OUT_FILE"
