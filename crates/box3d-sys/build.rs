// Compiles Box3D and the glue with clang. On wasm32-unknown-unknown there is no libc, so a tiny one comes from
// include/libc + src/shim.c + src/lib.rs, and the SSE2 intrinsics Box3D uses map to WASM SIMD through include/sse.
// Needs clang with the wasm32 target on PATH (CC_wasm32_unknown_unknown=clang).
use std::path::PathBuf;

fn main() {
    let here = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo = here.join("../..");
    let box3d = repo.join("vendor/box3d");
    assert!(box3d.join("src/body.c").exists(), "vendor/box3d is empty: run `git submodule update --init`");

    let target = std::env::var("TARGET").unwrap();
    let wasm = target == "wasm32-unknown-unknown";

    let mut b = cc::Build::new();
    b.opt_level(3).warnings(false).include(box3d.join("include")).include(box3d.join("src")).include(repo.join("src/c"));
    if b.get_compiler().is_like_msvc() {
        b.flag("/std:c17").flag("/experimental:c11atomics");
    } else {
        b.std("gnu17");
    }
    if wasm {
        b.flag("-ffreestanding").flag("-msimd128").define("__SSE__", "1").define("__SSE2__", "1");
        // libc headers last-resort first: our shims must win over any host headers clang might find.
        b.flag("-nostdlibinc").include(here.join("include/libc")).include(here.join("include/sse"));
        b.file(here.join("src/shim.c"));
    }
    if !wasm {
        // wasm SIMD is 4 wide; keep the host build 4 wide too, so a native test runs the same code path as the browser.
        b.define("BOX3D_DISABLE_AVX2", None);
    }
    if std::env::var("BOX3D_SCALAR").is_ok() {
        b.define("BOX3D_DISABLE_SIMD", None);
    }
    for entry in std::fs::read_dir(box3d.join("src")).unwrap() {
        let p = entry.unwrap().path();
        if p.extension().map_or(false, |e| e == "c") {
            b.file(p);
        }
    }
    b.file(repo.join("src/c/box3d_glue.c")).file(repo.join("src/c/box3d_glue_ext.c"));
    b.compile("box3d");
    println!("cargo:rerun-if-changed=../../src/c");
    println!("cargo:rerun-if-changed=src/shim.c");
    println!("cargo:rerun-if-changed=../../vendor/box3d/src");
}
