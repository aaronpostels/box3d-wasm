// Pure TypeScript type test, always runs (no Emscripten build needed). Two checks:
//  1. Drift of the raw module typings: every b3Glue_* export in the glue area headers (src/c/box3d_glue_{shapes,
//     joints,queries,filters,bodies}.h) is typed in RawBox3DModule (src/ts/types.ts) with the same parameter count,
//     and every typed _b3Glue_* name exists in some glue header.
//  2. Drift of the wrapper: a usage file pins the parameter and return types of every new Box3DWorld method with an
//     exact type-equality check, and tsc --noEmit must accept it. A deliberately wrong usage must be rejected, so a
//     check that silently accepts everything fails the test.
// tsc comes from the typescript devDependency (npm install).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

// ---- 1. raw typings against the glue headers ----

const AREA_HEADERS = ["shapes", "joints", "queries", "filters", "bodies"].map((a) => `src/c/box3d_glue_${a}.h`);
const declRe = /^B3_GLUE_EXPORT\b[^\n]*?\bb3Glue_(\w+)\(([^)]*)\)\s*;/gm;
const paramCount = (list) => {
    const t = list.trim();
    return t === "" || t === "void" ? 0 : t.split(",").length;
};

const headerDecls = new Map(); // name -> { params, file }
const headerFiles = readdirSync(new URL("src/c/", root)).filter((f) => f.endsWith(".h"));
for (const f of headerFiles) {
    for (const m of read(`src/c/${f}`).matchAll(declRe)) {
        headerDecls.set(m[1], { params: paramCount(m[2]), file: f });
    }
}

const rawTypes = read("src/ts/types.ts");
const typedDecls = new Map(); // name -> params
for (const m of rawTypes.matchAll(/\b_b3Glue_(\w+)\(([^)]*)\)\s*:/g)) {
    typedDecls.set(m[1], paramCount(m[2]));
}

const problems = [];
for (const rel of AREA_HEADERS) {
    const names = [...read(rel).matchAll(declRe)].map((m) => m[1]);
    assert.ok(names.length > 0, `${rel}: no B3_GLUE_EXPORT declarations parsed`);
    for (const name of names) {
        const want = headerDecls.get(name).params;
        if (!typedDecls.has(name)) {
            problems.push(`${rel}: b3Glue_${name} is not typed in RawBox3DModule`);
        } else if (typedDecls.get(name) !== want) {
            problems.push(`${rel}: b3Glue_${name} takes ${want} parameters in C, ${typedDecls.get(name)} in RawBox3DModule`);
        }
    }
}
for (const name of typedDecls.keys()) {
    if (!headerDecls.has(name)) problems.push(`RawBox3DModule types _b3Glue_${name}, which no glue header declares`);
}
assert.deepEqual(problems, [], `raw typings drifted from the glue headers:\n  ${problems.join("\n  ")}`);
console.log(`ok raw typings: ${typedDecls.size} _b3Glue_* names match ${headerDecls.size} glue header declarations`);

// ---- 2. wrapper signatures, checked by tsc ----

const require = createRequire(import.meta.url);
let tsc;
try {
    tsc = require.resolve("typescript/bin/tsc");
} catch {
    throw new Error("typescript is not installed: run npm install before the type test");
}

const srcIndex = new URL("src/ts/index.ts", root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const importPath = srcIndex.replace(/\.ts$/, ".js");

// Pins one public Box3DWorld method: its parameter tuple and its return type, both exact.
const pins = [
    ["addHull", "[BodyId, ArrayLike<number>, ShapeMaterialOptions?]", "ShapeId | null"],
    ["addBoxTransformed", "[BodyId, Vec3Tuple, BoxTransformedShapeOptions?]", "ShapeId | null"],
    ["getShapeUserMaterial", "[ShapeId]", "bigint"],
    ["isJointValid", "[JointId]", "boolean"],
    ["createSphericalJoint", "[BodyId, BodyId, JointOptions?]", "JointId"],
    ["createDistanceJoint", "[BodyId, BodyId, number, JointOptions?]", "JointId"],
    ["createWheelJoint", "[BodyId, BodyId, WheelJointOptions]", "JointId"],
    ["createMotorJoint", "[BodyId, BodyId, JointOptions?]", "JointId"],
    ["createFilterJoint", "[BodyId, BodyId]", "JointId"],
    ["getJointReaction", "[JointId]", "JointReaction"],
    ["setDistanceLength", "[JointId, number]", "void"],
    ["getDistanceCurrentLength", "[JointId]", "number"],
    ["setDistanceSpring", "[JointId, DistanceSpring]", "void"],
    ["setDistanceLengthRange", "[JointId, DistanceLengthRange]", "void"],
    ["setDistanceMotor", "[JointId, DistanceMotor]", "void"],
    ["setMotorVelocity", "[JointId, Vec3Tuple, Vec3Tuple?]", "void"],
    ["setMotorMaxForce", "[JointId, number, number]", "void"],
    ["setMotorSpring", "[JointId, MotorSpring]", "void"],
    ["setSphericalCone", "[JointId, boolean, number]", "void"],
    ["setSphericalTwist", "[JointId, boolean, number, number]", "void"],
    ["setSphericalSpring", "[JointId, SphericalSpring]", "void"],
    ["setSphericalMotor", "[JointId, SphericalMotor]", "void"],
    ["getSphericalAngles", "[JointId]", "SphericalAngles"],
    ["setWheelSuspension", "[JointId, WheelSuspension]", "void"],
    ["setWheelSpin", "[JointId, WheelSpin]", "void"],
    ["setWheelSteering", "[JointId, WheelSteering]", "void"],
    ["getWheelState", "[JointId]", "WheelState"],
    ["castShape", "[ProxyShape, Vec3Tuple, Vec3Tuple]", "ShapeHit | null"],
    ["overlapAABB", "[Vec3Tuple, Vec3Tuple, number?]", "ShapeId[]"],
    ["overlapShape", "[ProxyShape, Vec3Tuple, number?]", "ShapeId[]"],
    ["castRayAll", "[Vec3Tuple, Vec3Tuple, number?]", "ShapeHit[]"],
    ["collideMover", "[Vec3Tuple, MoverCapsule, ShapeId?, number?]", "MoverPlane[]"],
    ["castMover", "[Vec3Tuple, MoverCapsule, Vec3Tuple, ShapeId?]", "number"],
    ["setShapeFilter", "[ShapeId, ShapeFilter, boolean?]", "void"],
    ["getShapeFilter", "[ShapeId]", "ShapeFilter"],
    ["rayClosestFiltered", "[Vec3Tuple, Vec3Tuple, bigint, bigint]", "ShapeHit | null"],
    ["setLinearDamping", "[BodyId, number]", "void"],
    ["getLinearDamping", "[BodyId]", "number"],
    ["setAngularDamping", "[BodyId, number]", "void"],
    ["getAngularDamping", "[BodyId]", "number"],
    ["setGravityScale", "[BodyId, number]", "void"],
    ["getGravityScale", "[BodyId]", "number"],
    ["setMotionLocks", "[BodyId, MotionLocks]", "void"],
    ["getMotionLocks", "[BodyId]", "MotionLocks"],
    ["getMassData", "[BodyId]", "MassData"],
    ["setMassData", "[BodyId, MassData]", "void"],
    ["setBodyUserData", "[BodyId, number]", "void"],
    ["getBodyUserData", "[BodyId]", "number"],
    ["setBodyEnabled", "[BodyId, boolean]", "void"],
    ["isBodyEnabled", "[BodyId]", "boolean"],
    ["applyImpulses", "[BodyId[] | BigUint64Array, ArrayLike<number>, boolean?]", "void"],
];

const typeImports = [
    "Box3DWorld", "BodyId", "ShapeId", "JointId", "Vec3Tuple", "ShapeHit", "ShapeMaterialOptions",
    "BoxTransformedShapeOptions", "ProxyShape", "MoverCapsule", "MoverPlane", "ShapeFilter", "MotionLocks",
    "MassData", "JointOptions", "WheelJointOptions", "JointReaction", "DistanceSpring", "DistanceLengthRange",
    "DistanceMotor", "MotorSpring", "SphericalSpring", "SphericalMotor", "SphericalAngles", "WheelSuspension",
    "WheelSpin", "WheelSteering", "WheelState",
];

const header = [
    `import type { ${typeImports.join(", ")} } from "${importPath}";`,
    "type Expect<T extends true> = T;",
    "type Eq<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;",
    "type Fn<K extends keyof Box3DWorld> = Extract<Box3DWorld[K], (...args: any) => any>;",
];
const body = [];
for (const [name, params, ret] of pins) {
    body.push(`export type _P_${name} = Expect<Eq<Parameters<Fn<"${name}">>, ${params}>>;`);
    body.push(`export type _R_${name} = Expect<Eq<ReturnType<Fn<"${name}">>, ${ret}>>;`);
}
// A few real calls, so the file is also a usage example.
body.push(
    "export function usage(w: Box3DWorld, body: BodyId, joint: JointId): void {",
    "    const hull: ShapeId | null = w.addHull(body, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1], { userMaterial: 1n, isSensor: true });",
    "    const hits: ShapeHit[] = w.castRayAll([0, 20, 0], [0, -40, 0]);",
    "    const reaction: JointReaction = w.getJointReaction(joint);",
    "    w.applyImpulses([body], [0, 1, 0]);",
    "    void hull; void hits; void reaction;",
    "}",
);
const usageSource = [...header, ...body].join("\n") + "\n";

// A deliberately wrong call, which must be rejected.
const badSource = [
    `import type { Box3DWorld, ShapeHit } from "${importPath}";`,
    "export function bad(w: Box3DWorld): void {",
    "    const n: number = w.castRayAll([0, 0, 0], [0, 0, 0]);",
    "    void n;",
    "}",
    "",
].join("\n");

const tmp = mkdtempSync(join(tmpdir(), "box3d-ts-types-"));
const compile = (name, source) => {
    writeFileSync(join(tmp, `${name}.ts`), source);
    const config = join(tmp, `${name}.tsconfig.json`);
    writeFileSync(config, JSON.stringify({
        compilerOptions: {
            target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
            noEmit: true, skipLibCheck: true, types: [],
        },
        files: [join(tmp, `${name}.ts`)],
    }));
    try {
        execFileSync(process.execPath, [tsc, "-p", config], { stdio: "pipe", encoding: "utf8" });
        return { ok: true, out: "" };
    } catch (err) {
        return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
};

try {
    const good = compile("usage", usageSource);
    assert.ok(good.ok, `wrapper signatures drifted (tsc):\n${good.out}`);
    console.log(`ok wrapper signatures: ${pins.length} methods pinned, usage file accepted`);

    const bad = compile("bad", badSource);
    assert.ok(!bad.ok && /TS2322/.test(bad.out), `the deliberately wrong usage was not rejected:\n${bad.out}`);
    console.log("ok type check rejects a wrong usage");
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
