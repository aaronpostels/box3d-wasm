# Build script for Box3D WebAssembly (PowerShell)
param(
    [switch]$Threads = $false,
    [switch]$Scalar = $false
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
Set-Location $repoDir

$distDir = Join-Path $repoDir "dist"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

$cSources = Get-ChildItem -Path "vendor/box3d/src/*.c" | Select-Object -ExpandProperty FullName
$cSources += (Resolve-Path "src/c/box3d_glue.c").Path

$cFlags = @(
    "-std=c17",
    "-O3",
    "-flto",
    "-I", "$repoDir/vendor/box3d/include",
    "-I", "$repoDir/vendor/box3d/src",
    "-I", "$repoDir/src/c"
)

if ($Scalar) {
    Write-Host "Building scalar flavor (no SIMD)..."
    $cFlags += @("-DBOX3D_DISABLE_SIMD")
    $outFile = "dist/box3d.scalar.js"
} else {
    Write-Host "Building SIMD flavor (SSE2 -> WASM SIMD128)..."
    $cFlags += @("-msimd128", "-msse2")
    $outFile = "dist/box3d.js"
}

$linkFlags = @(
    "-s", "WASM=1",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-s", "MALLOC=emmalloc",
    "-s", "MODULARIZE=1",
    "-s", "EXPORT_ES6=1",
    "-s", "EXPORT_NAME=Box3DModule",
    "-s", "WASM_BIGINT=1",
    "-s", 'EXPORTED_RUNTIME_METHODS=["HEAP8","HEAPU8","HEAP32","HEAPU32","HEAPF32","HEAP64","HEAPU64","_malloc","_free"]',
    "-s", 'EXPORTED_FUNCTIONS=["_malloc","_free","_b3Glue_CreateWorld","_b3Glue_DestroyWorld","_b3Glue_Step","_b3Glue_WorldIsValid","_b3Glue_CreateBody","_b3Glue_DestroyBody","_b3Glue_BodyIsValid","_b3Glue_CreateBoxShape","_b3Glue_CreateSphereShape","_b3Glue_CreateCapsuleShape","_b3Glue_DestroyShape","_b3Glue_GetTransform","_b3Glue_SetTransform","_b3Glue_GetBatchTransforms","_b3Glue_GetLinearVelocity","_b3Glue_SetLinearVelocity","_b3Glue_GetAngularVelocity","_b3Glue_SetAngularVelocity","_b3Glue_ApplyForce","_b3Glue_ApplyLinearImpulse","_b3Glue_ApplyAngularImpulse","_b3Glue_CastRayClosest"]'
)

if ($Threads) {
    Write-Host "Enabling multi-threading (-pthread)..."
    $linkFlags += @("-pthread", "-s", "USE_PTHREADS=1", "-s", "SHARED_MEMORY=1")
    $outFile = "dist/box3d.threads.js"
}

Write-Host "Invoking emcc..."
emcc @cFlags @cSources @linkFlags -o $outFile

Write-Host "Build finished: $outFile"
