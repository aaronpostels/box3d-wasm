// TypeScript wrapper, new glue methods: shapes (hulls, transformed boxes, material and flags, user material), joints
// (spherical, distance, wheel, motor, filter with limits, springs, motors and reaction), queries (shape casts, overlaps,
// all-hits ray cast, capsule mover), filters (category, mask, group, query filter) and bodies (damping, gravity scale,
// motion locks, mass data, user data, enable and disable, batch impulses).
// The scenes mirror the smoke crate (crates/box3d-smoke: the #[test]s in its test module and run_queries, run_bodies,
// run_filters, run_shapes), so both sides check the same numbers. Needs the Emscripten build (npm run build:wasm and
// npm run build:ts). Without dist/ it skips. Only the wrapper methods are used; events are read through the raw module.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const built = ["box3d.js", "index.js"].filter((f) => !existsSync(new URL(`../dist/${f}`, import.meta.url)));
if (built.length > 0) {
    console.log(`skip ts_wrapper: dist/ is missing ${built.join(", ")} (run npm run build:wasm && npm run build:ts)`);
    process.exit(0);
}

const { default: factory } = await import("../dist/box3d.js");
const { Box3DWorld, BodyType, initBox3D } = await import("../dist/index.js");
const wasm = await initBox3D(factory);

const DT = 1 / 60;
const U64_MAX = 0xffffffffffffffffn;
const F32_MIN = -3.4028234663852886e38;
const F32_MAX = 3.4028234663852886e38;
const IDENT = [0, 0, 0, 1];
const QUARTER_Z = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const CUBE = [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const newWorld = (gravityY = 0) => new Box3DWorld(wasm, [0, gravityY, 0], { sleep: false, continuous: false });
const stepN = (w, n) => { for (let i = 0; i < n; i++) w.step(DT, 4); };
const pos = (w, b) => w.getTransform(b).position;
const rot = (w, b) => w.getTransform(b).rotation;
const linVel = (w, b) => w.getLinearVelocity(b);
const angVel = (w, b) => w.getAngularVelocity(b);
const sameIds = (a, b) => {
    const sort = (xs) => [...xs].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    assert.deepEqual(sort(a), sort(b));
};

// Static floor whose top face is at y = top, friction 0.6.
function floor(w, top) {
    const g = w.createBody({ type: BodyType.Static, position: [0, top - 1, 0] });
    w.createBoxShape(g, { halfWidth: 50, halfHeight: 1, halfDepth: 50, density: 1, friction: 0.6, restitution: 0 });
    return g;
}

// Dynamic body with one sphere of radius 0.5 (density 1, friction 0.5), moving at linear and angular velocity.
function ball(w, position, linear = [0, 0, 0], angular = [0, 0, 0], radius = 0.5) {
    const b = w.createBody({ type: BodyType.Dynamic, position });
    const s = w.createSphereShape(b, { radius, density: 1, friction: 0.5, restitution: 0 });
    w.setLinearVelocity(b, linear);
    w.setAngularVelocity(b, angular);
    return { b, s };
}

// Ids of the contact or sensor events of one step, read through the raw module (the wrapper has no event API).
function rawEvents(w, fn) {
    const max = 64;
    const out = wasm._malloc(max * 16);
    try {
        const n = fn(w.id, out, max);
        const ids = wasm.HEAPU64.subarray(out >>> 3, (out >>> 3) + 2 * n);
        return { count: n, ids: Array.from(ids) };
    } finally {
        wasm._free(out);
    }
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- shapes ----

test("hull rests on floor, rejects fewer than 4 points, mass = volume * density", () => {
    const w = newWorld(-10);
    floor(w, 0);
    const b = w.createBody({ type: BodyType.Dynamic, position: [0, 3, 0] });
    assert.equal(w.addHull(b, CUBE.slice(0, 9), { density: 2 }), null, "three points cannot make a hull");
    assert.notEqual(w.addHull(b, CUBE, { density: 2 }), null);
    stepN(w, 240);
    assert.ok(near(pos(w, b)[1], 0.5, 0.03), `cube centre y ${pos(w, b)[1]}`);
    assert.ok(near(w.getMassData(b).mass, 2, 1e-3), `mass ${w.getMassData(b).mass}, want 2`);
    w.destroy();
});

test("offset and rotated box sits where its transform says", () => {
    const w = newWorld(0);
    const b = w.createBody({ type: BodyType.Static });
    // Half extents 1 x 0.5 x 0.5, centre (3, 0, 0), turned 90 degrees: x spans [2.5, 3.5], y spans [-1, 1].
    assert.notEqual(w.addBoxTransformed(b, [1, 0.5, 0.5], { center: [3, 0, 0], rotation: QUARTER_Z }), null);
    stepN(w, 1);
    const hitIn = w.castRay([3.3, 10, 0], [0, -20, 0]);
    const hitOut = w.castRay([3.7, 10, 0], [0, -20, 0]); // unrotated, this would hit y = 0.5 instead of missing
    assert.ok(hitIn && near(hitIn.point[1], 1, 0.01), `top at ${hitIn?.point[1]}, want 1`);
    assert.equal(hitOut, null);
    w.destroy();
});

test("compound body mass is the sum of its shapes", () => {
    const w = newWorld(0);
    const b = w.createBody({ type: BodyType.Dynamic, position: [0, 5, 0] });
    // Unit cube at density 2: mass 2. Box of volume 2 at density 3, turned: mass 6.
    w.addBoxTransformed(b, [0.5, 0.5, 0.5], { center: [-1.5, 0, 0], density: 2 });
    assert.ok(near(w.getMassData(b).mass, 2, 1e-3));
    w.addBoxTransformed(b, [1, 0.5, 0.5], { center: [1.5, 0, 0], rotation: QUARTER_Z, density: 3 });
    assert.ok(near(w.getMassData(b).mass, 8, 1e-3), `compound mass ${w.getMassData(b).mass}, want 8`);
    w.destroy();
});

test("per-shape friction changes sliding distance", () => {
    const w = newWorld(0);
    floor(w, 0);
    // Both slide at 4 m/s on the same floor. Friction 0 mixes to 0; 0.9 mixes to about 0.73.
    const slick = w.createBody({ type: BodyType.Dynamic, position: [0, 0.5, 0] });
    const grippy = w.createBody({ type: BodyType.Dynamic, position: [0, 0.5, 5] });
    w.addBoxTransformed(slick, [0.5, 0.5, 0.5], { friction: 0, density: 1 });
    w.addBoxTransformed(grippy, [0.5, 0.5, 0.5], { friction: 0.9, density: 1 });
    w.setLinearVelocity(slick, [4, 0, 0]);
    w.setLinearVelocity(grippy, [4, 0, 0]);
    stepN(w, 60);
    const slickX = pos(w, slick)[0];
    const grippyX = pos(w, grippy)[0];
    assert.ok(slickX > 3.0 && grippyX < 2.0 && grippyX < 0.5 * slickX, `slick ${slickX}, grippy ${grippyX}`);
    w.destroy();
});

test("restitution changes the bounce", () => {
    const w = newWorld(-10);
    floor(w, 0);
    const bouncy = w.createBody({ type: BodyType.Dynamic, position: [-3, 3, 0] });
    const dead = w.createBody({ type: BodyType.Dynamic, position: [3, 3, 0] });
    w.addBoxTransformed(bouncy, [0.5, 0.5, 0.5], { restitution: 0.9, density: 1 });
    w.addBoxTransformed(dead, [0.5, 0.5, 0.5], { restitution: 0, density: 1 });
    let peakBouncy = 0;
    let peakDead = 0;
    for (let step = 0; step < 180; step++) {
        stepN(w, 1);
        if (step >= 60) {
            peakBouncy = Math.max(peakBouncy, pos(w, bouncy)[1]);
            peakDead = Math.max(peakDead, pos(w, dead)[1]);
        }
    }
    assert.ok(peakBouncy > 2.0 && peakDead < 0.8, `bounce peaks ${peakBouncy}, ${peakDead}`);
    w.destroy();
});

test("density sets the mass of a transformed box and a sphere", () => {
    const w = newWorld(0);
    const a = w.createBody({ type: BodyType.Dynamic, position: [0, 5, 0] });
    const b = w.createBody({ type: BodyType.Dynamic, position: [5, 5, 0] });
    w.addBoxTransformed(a, [0.5, 0.5, 0.5], { density: 3, friction: 0.5 }); // volume 1, density 3
    w.createSphereShape(b, { radius: 1, density: 2, friction: 0.5 });       // volume 4/3 pi, density 2
    assert.ok(near(w.getMassData(a).mass, 3, 1e-3));
    assert.ok(near(w.getMassData(b).mass, 2 * 4 / 3 * Math.PI, 1e-2));
    w.destroy();
});

test("sensor passes through but reports overlap", () => {
    const w = newWorld(-10);
    floor(w, -4);
    // A static sensor slab from y = -0.5 to 0.5, above a solid floor whose top is at y = -4.
    const slab = w.createBody({ type: BodyType.Static });
    w.addBoxTransformed(slab, [3, 0.5, 3], { isSensor: true, density: 1, friction: 0.5 });
    const falling = w.createBody({ type: BodyType.Dynamic, position: [0, 4, 0] });
    w.addBoxTransformed(falling, [0.5, 0.5, 0.5], { density: 1, friction: 0.5 });
    let begins = 0;
    for (let i = 0; i < 180; i++) {
        stepN(w, 1);
        begins += rawEvents(w, (id, out, max) => wasm._b3Glue_SensorBeginEvents(id, out, max)).count;
    }
    // It falls through the slab and lands on the floor: centre at -4 + 0.5.
    assert.ok(begins > 0, "sensor reported no begin events");
    assert.ok(near(pos(w, falling)[1], -3.5, 0.05), `landed at y ${pos(w, falling)[1]}`);
    w.destroy();
});

test("contact events flag gates the events", () => {
    const w = newWorld(-10);
    floor(w, 0);
    const quiet = w.createBody({ type: BodyType.Dynamic, position: [-5, 3, 0] });
    const loud = w.createBody({ type: BodyType.Dynamic, position: [5, 3, 0] });
    const quietShape = w.addBoxTransformed(quiet, [0.5, 0.5, 0.5], { density: 1, friction: 0.5, contactEvents: false });
    const loudShape = w.addBoxTransformed(loud, [0.5, 0.5, 0.5], { density: 1, friction: 0.5, contactEvents: true });
    let quietN = 0;
    let loudN = 0;
    for (let i = 0; i < 120; i++) {
        stepN(w, 1);
        const { ids } = rawEvents(w, (id, out, max) => wasm._b3Glue_ContactBeginEvents(id, out, max));
        for (const id of ids) {
            if (id === quietShape) quietN++;
            if (id === loudShape) loudN++;
        }
    }
    assert.equal(quietN, 0);
    assert.ok(loudN > 0, "flagged shape reported no contact events");
    w.destroy();
});

test("user material round-trips through the shape", () => {
    const w = newWorld(0);
    const b = w.createBody({ type: BodyType.Dynamic, position: [0, 3, 0] });
    const hull = w.addHull(b, CUBE, { userMaterial: 42n });
    const boxed = w.addBoxTransformed(b, [0.5, 0.5, 0.5], { center: [3, 0, 0], userMaterial: 7n });
    assert.notEqual(hull, null);
    assert.notEqual(boxed, null);
    assert.equal(w.getShapeUserMaterial(hull), 42n);
    assert.equal(w.getShapeUserMaterial(boxed), 7n);
    w.destroy();
});

// ---- joints ----

test("distance rod keeps its length and swings", () => {
    const w = newWorld(-10);
    const anchor = w.createBody({ type: BodyType.Static, position: [0, 10, 0] });
    const bob = ball(w, [1, 10, 0]).b;
    const j = w.createDistanceJoint(anchor, bob, 1);
    assert.ok(w.isJointValid(j));
    let minY = Infinity;
    for (let i = 0; i < 300; i++) {
        stepN(w, 1);
        const len = w.getDistanceCurrentLength(j);
        assert.ok(near(len, 1, 0.02), `rod length drifted to ${len}`);
        minY = Math.min(minY, pos(w, bob)[1]);
    }
    assert.ok(minY < 9, `pendulum never swung (lowest y ${minY})`);
    w.destroy();
});

test("distance motor pulls the length at speed", () => {
    const w = newWorld(0);
    const anchor = w.createBody({ type: BodyType.Static });
    const bob = ball(w, [1, 0, 0]).b;
    const j = w.createDistanceJoint(anchor, bob, 1);
    w.setDistanceSpring(j, { enable: true, hertz: 0, dampingRatio: 0, lowerForce: F32_MIN, upperForce: F32_MAX });
    w.setDistanceMotor(j, { enable: true, speed: 1, maxForce: 100 });
    stepN(w, 60);
    const len = w.getDistanceCurrentLength(j);
    assert.ok(near(len, 2, 0.15), `length after 1 s is ${len}, want about 2`);
    w.destroy();
});

test("distance length range stops outward motion", () => {
    const w = newWorld(0);
    const anchor = w.createBody({ type: BodyType.Static });
    const bob = ball(w, [1, 0, 0], [2, 0, 0], [0, 0, 0], 0.1).b;
    const j = w.createDistanceJoint(anchor, bob, 1);
    // Spring on with zero stiffness: the joint is free, so only the limit acts.
    w.setDistanceSpring(j, { enable: true, hertz: 0, dampingRatio: 0, lowerForce: F32_MIN, upperForce: F32_MAX });
    w.setDistanceLengthRange(j, { enable: true, minLength: 0.5, maxLength: 1.2 });
    let maxLen = 0;
    for (let i = 0; i < 120; i++) {
        stepN(w, 1);
        maxLen = Math.max(maxLen, w.getDistanceCurrentLength(j));
    }
    assert.ok(maxLen <= 1.25, `limit let the rope reach ${maxLen}`);
    assert.ok(maxLen >= 1.1, `bob should reach the limit, reached only ${maxLen}`);
    w.destroy();
});

test("distance spring oscillates about the rest length", () => {
    const w = newWorld(0);
    const anchor = w.createBody({ type: BodyType.Static });
    const bob = ball(w, [1.5, 0, 0], [0, 0, 0], [0, 0, 0], 0.1).b;
    const j = w.createDistanceJoint(anchor, bob, 1);
    w.setDistanceSpring(j, { enable: true, hertz: 2, dampingRatio: 0.2, lowerForce: F32_MIN, upperForce: F32_MAX });
    let minLen = Infinity;
    let crossings = 0;
    let wasAbove = true;
    for (let i = 0; i < 240; i++) {
        stepN(w, 1);
        const len = w.getDistanceCurrentLength(j);
        minLen = Math.min(minLen, len);
        const above = len > 1.0;
        if (above !== wasAbove) {
            crossings++;
            wasAbove = above;
        }
    }
    assert.ok(minLen < 0.95, `spring never compressed below rest length (min ${minLen})`);
    assert.ok(crossings >= 6, `spring crossed rest length ${crossings} times`);
    w.destroy();
});

test("distance rod reaction holds the bob's weight", () => {
    const w = newWorld(-10);
    const anchor = w.createBody({ type: BodyType.Static, position: [0, 10, 0] });
    const bob = ball(w, [0, 9, 0]).b;
    const j = w.createDistanceJoint(anchor, bob, 1);
    stepN(w, 200);
    const mass = w.getMassData(bob).mass;
    const r = w.getJointReaction(j);
    const force = Math.hypot(...r.force);
    assert.ok(near(force, mass * 10, 0.02 * mass * 10), `rod force ${force}, want weight ${mass * 10}`);
    w.destroy();
});

test("motor joint reaches its target velocity and its spring returns to target", () => {
    const w = newWorld(0);
    const anchor = w.createBody({ type: BodyType.Static });
    const b = ball(w, [0, 0, 0]).b;
    const j = w.createMotorJoint(anchor, b);
    w.setMotorMaxForce(j, 1e4, 1e4);
    w.setMotorVelocity(j, [2, 0, 0]);
    stepN(w, 60);
    const v = linVel(w, b);
    assert.ok(near(v[0], 2, 0.05) && near(v[1], 0, 0.05) && near(v[2], 0, 0.05), `velocity ${v}, want (2,0,0)`);
    w.destroy();

    // No velocity drive (zero max force), so only the position spring acts.
    const w2 = newWorld(0);
    const anchor2 = w2.createBody({ type: BodyType.Static });
    const b2 = ball(w2, [0.5, 0, 0]).b;
    const j2 = w2.createMotorJoint(anchor2, b2);
    w2.setMotorMaxForce(j2, 0, 0);
    w2.setMotorSpring(j2, {
        linearHertz: 2, linearDamping: 0.7, maxForce: 1e3,
        angularHertz: 2, angularDamping: 0.7, maxTorque: 1e3,
    });
    stepN(w2, 240);
    const p = pos(w2, b2);
    assert.ok(near(p[0], 0, 0.05) && near(p[1], 0, 0.05) && near(p[2], 0, 0.05), `spring left the body at ${p}`);
    w2.destroy();
});

test("filter joint lets bodies pass through", () => {
    const fall = (filter) => {
        const w = newWorld(-10);
        const ground = floor(w, 0);
        const resting = ball(w, [0, 0.4, 0]).b;
        const falling = ball(w, [5, 0.4, 0]).b;
        if (filter) w.createFilterJoint(ground, falling);
        stepN(w, 120);
        const out = [pos(w, resting)[1], pos(w, falling)[1]];
        w.destroy();
        return out;
    };
    const [restingNoFilter] = fall(false);
    const [restingFilter, fallingFilter] = fall(true);
    assert.ok(restingNoFilter > 0.3, `without a filter the ball should rest on the box, y=${restingNoFilter}`);
    assert.ok(restingFilter > 0.3 && fallingFilter < -2, `with a filter the ball should fall through, y=${fallingFilter}`);
});

test("spherical joint: cone limit, twist limit, spring to target, motor", () => {
    // Cone: body B spins about y, its z tilts away from frame A's z at 5 rad/s; the 0.3 rad cone must stop it.
    {
        const w = newWorld(0);
        const anchor = w.createBody({ type: BodyType.Static });
        const b = ball(w, [0, 0, 0], [0, 0, 0], [0, 5, 0]).b;
        const j = w.createSphericalJoint(anchor, b);
        w.setSphericalCone(j, true, 0.3);
        let maxCone = 0;
        for (let i = 0; i < 120; i++) {
            stepN(w, 1);
            if (i > 30) maxCone = Math.max(maxCone, w.getSphericalAngles(j).cone);
        }
        assert.ok(maxCone <= 0.35, `cone limit let the tilt reach ${maxCone} rad`);
        w.destroy();
    }
    // Twist: spin about frame z, the twist limit of +-0.3 rad must stop it.
    {
        const w = newWorld(0);
        const anchor = w.createBody({ type: BodyType.Static });
        const b = ball(w, [0, 0, 0], [0, 0, 0], [0, 0, 5]).b;
        const j = w.createSphericalJoint(anchor, b);
        w.setSphericalTwist(j, true, -0.3, 0.3);
        let maxTwist = 0;
        for (let i = 0; i < 120; i++) {
            stepN(w, 1);
            if (i > 30) maxTwist = Math.max(maxTwist, Math.abs(w.getSphericalAngles(j).twist));
        }
        assert.ok(maxTwist <= 0.35, `twist limit let the twist reach ${maxTwist} rad`);
        w.destroy();
    }
    // Spring: start rotated 0.5 rad about z; the spring pulls back to the identity target.
    {
        const w = newWorld(0);
        const anchor = w.createBody({ type: BodyType.Static });
        const half = 0.25;
        const b = w.createBody({ type: BodyType.Dynamic, rotation: [0, 0, Math.sin(half), Math.cos(half)] });
        w.createSphereShape(b, { radius: 0.5, density: 1, friction: 0.5 });
        const j = w.createSphericalJoint(anchor, b);
        w.setSphericalSpring(j, { enable: true, hertz: 2, dampingRatio: 0.5, targetRotation: IDENT });
        let maxTwist = 0;
        for (let i = 0; i < 240; i++) {
            stepN(w, 1);
            if (i > 0) maxTwist = Math.max(maxTwist, Math.abs(w.getSphericalAngles(j).twist));
        }
        assert.ok(maxTwist > 0.3, `the spring should see the 0.5 rad start, max twist ${maxTwist}`);
        const end = Math.abs(w.getSphericalAngles(j).twist);
        assert.ok(end < 0.05, `spring should settle at the target rotation, twist ${end}`);
        w.destroy();
    }
    // Motor: drives the relative angular velocity to (0, 0, 3).
    {
        const w = newWorld(0);
        const anchor = w.createBody({ type: BodyType.Static });
        const b = ball(w, [0, 0, 0]).b;
        const j = w.createSphericalJoint(anchor, b);
        w.setSphericalMotor(j, { enable: true, velocity: [0, 0, 3], maxTorque: 1e4 });
        stepN(w, 60);
        const v = angVel(w, b);
        assert.ok(near(v[2], 3, 0.05) && near(v[0], 0, 0.05) && near(v[1], 0, 0.05), `angular velocity ${v}, want (0,0,3)`);
        w.destroy();
    }
});

test("wheel joint: spin motor, suspension limit, steering", () => {
    {
        const w = newWorld(0);
        const chassis = w.createBody({ type: BodyType.Static });
        const wheel = ball(w, [0, 0, 0]).b;
        const j = w.createWheelJoint(chassis, wheel, { axis: [1, 0, 0] });
        w.setWheelSpin(j, { enable: true, speed: 5, maxTorque: 1e3 });
        stepN(w, 60);
        const spin = w.getWheelState(j).spinSpeed;
        assert.ok(near(spin, 5, 0.1), `spin speed ${spin}, want 5 rad/s`);
        assert.ok(near(Math.abs(angVel(w, wheel)[2]), 5, 0.1), `wheel angular velocity ${angVel(w, wheel)}`);
        w.destroy();
    }
    {
        const w = newWorld(-10);
        const chassis = w.createBody({ type: BodyType.Static });
        const wheel = ball(w, [0, 0, 0]).b;
        // Suspension along world y. Gravity pulls the wheel down; the lower limit at -0.1 m must hold it.
        const j = w.createWheelJoint(chassis, wheel, { axis: [0, 1, 0] });
        w.setWheelSuspension(j, { spring: false, hertz: 0, dampingRatio: 0, limit: true, lower: -0.1, upper: 0.1 });
        stepN(w, 120);
        const p = pos(w, wheel);
        assert.ok(near(p[1], -0.1, 0.02), `wheel should stop at the lower suspension limit, y=${p[1]}`);
        assert.ok(near(p[0], 0, 0.02) && near(p[2], 0, 0.02), `wheel should stay on the suspension line, at ${p}`);
        w.destroy();
    }
    {
        const w = newWorld(0);
        const chassis = w.createBody({ type: BodyType.Static });
        const wheel = ball(w, [0, 0, 0]).b;
        const j = w.createWheelJoint(chassis, wheel, { axis: [1, 0, 0] });
        w.setWheelSteering(j, {
            enable: true, hertz: 4, dampingRatio: 0.7, targetAngle: 0.4, maxTorque: 1e3,
            limit: false, lower: 0, upper: 0,
        });
        stepN(w, 120);
        const angle = w.getWheelState(j).steeringAngle;
        assert.ok(near(angle, 0.4, 0.02), `steering angle ${angle}, want 0.4 rad`);
        w.destroy();
    }
});

// ---- queries ----

test("shape casts, overlaps, all-hits ray cast and capsule mover (smoke run_queries scene)", () => {
    const w = newWorld(-10);
    const at = (x, y, z) => w.createBody({ type: BodyType.Static, position: [x, y, z] });
    const ground = w.createBoxShape(at(0, -1, 0), { halfWidth: 50, halfHeight: 1, halfDepth: 50, density: 1, friction: 0.5, restitution: 0 });
    const sphere = w.createSphereShape(at(0, 5, 0), { radius: 0.5, density: 1, friction: 0.5, restitution: 0 });
    const boxed = w.createBoxShape(at(10, 3, 0), { halfWidth: 1, halfHeight: 1, halfDepth: 1, density: 1, friction: 0.5, restitution: 0 });
    const capsule = w.createCapsuleShape(at(-10, 2, 0), { radius: 0.5, halfHeight: 1, density: 1, friction: 0.5, restitution: 0 });
    const row = [];
    for (let i = 0; i < 20; i++) {
        row.push(w.createSphereShape(at(20 + 0.5 * i, 5, 0), { radius: 0.1, density: 1, friction: 0.5, restitution: 0 }));
    }

    // Ray cast, all hits: sphere then ground, sorted by fraction.
    const hits = w.castRayAll([0, 20, 0], [0, -40, 0]);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].shape, sphere);
    assert.equal(hits[1].shape, ground);
    assert.ok(near(hits[0].fraction, 0.3625, 1e-4) && near(hits[1].fraction, 0.5, 1e-4));
    assert.ok(hits[0].normal[1] >= 0.99);
    // 20 hits; asking for room for 4 forces the wrapper to grow its buffer.
    const rowHits = w.castRayAll([15, 5, 0], [20, 0, 0], 4);
    assert.deepEqual(rowHits.map((h) => h.shape), row);
    assert.ok(near(rowHits[0].fraction, 0.245, 1e-4));
    assert.ok(rowHits.every((h, i) => i === 0 || rowHits[i - 1].fraction < h.fraction));

    // Overlap by AABB.
    assert.deepEqual(w.overlapAABB([-1, 4, -1], [1, 6, 1]), [sphere]);
    sameIds(w.overlapAABB([-11, -1, -2], [12, 3.8, 2]), [boxed, capsule, ground]);

    // Overlap by shape.
    assert.deepEqual(w.overlapShape({ kind: "sphere", radius: 1 }, [0, 5.2, 0]), [sphere]);
    assert.deepEqual(w.overlapShape({ kind: "box", halfExtents: [0.1, 0.1, 0.1] }, [-10, 2, 0]), [capsule]);
    assert.deepEqual(w.overlapShape({ kind: "hull", radius: 0.1, points: [9.5, 3, 0, 10, 3.5, 0, 10.5, 2.5, 0] }, [0, 0, 0]), [boxed]);
    assert.deepEqual(w.overlapShape({ kind: "capsule", halfHeight: 0.2, radius: 0.1 }, [-10, 2, 0]), [capsule]);
    assert.deepEqual(w.overlapShape({ kind: "sphere", radius: 1 }, [0, 20, 0]), []);
    // Overlap buffer growth: 20 small spheres in one box, asked for 4 at a time.
    assert.equal(w.overlapAABB([19, 4, -1], [31, 6, 1], 4).length, 20);

    // Shape cast, closest hit.
    let h = w.castShape({ kind: "sphere", radius: 0.5 }, [0, 20, 0], [0, -40, 0]);
    assert.ok(h && h.shape === sphere && near(h.fraction, 0.35, 1e-3) && h.normal[1] >= 0.99, `sphere cast ${JSON.stringify(h)}`);
    h = w.castShape({ kind: "box", halfExtents: [0.5, 0.5, 0.5] }, [10, 10, 0], [0, -20, 0]);
    assert.ok(h && h.shape === boxed && near(h.fraction, 0.275, 1e-3), `box cast ${JSON.stringify(h)}`);
    h = w.castShape({ kind: "capsule", halfHeight: 0.5, radius: 0.5 }, [-10, 10, 0], [0, -20, 0]);
    assert.ok(h && h.shape === capsule && near(h.fraction, 0.275, 1e-3), `capsule cast ${JSON.stringify(h)}`);
    h = w.castShape({ kind: "hull", radius: 0.1, points: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 0, 0.5, 0, 0.5, 0] }, [-30, 20, 0], [0, -40, 0]);
    assert.ok(h && h.shape === ground && near(h.fraction, 0.4975, 1e-3), `hull cast ${JSON.stringify(h)}`);
    assert.equal(w.castShape({ kind: "sphere", radius: 0.5 }, [-30, 20, 0], [0, -10, 0]), null);

    // Capsule mover: collide (penetrating the ground), self filter, and cast.
    const standing = { center1: [0, -1, 0], center2: [0, 1, 0], radius: 0.5 };
    assert.ok(w.collideMover([-30, 1, 0], standing).some((p) => p.shape === ground && p.normal[1] > 0.9));
    const low = { center1: [0, -0.5, 0], center2: [0, 0.5, 0], radius: 0.5 };
    assert.ok(w.collideMover([-10, 4, 0], low).some((p) => p.shape === capsule && p.normal[1] > 0.5));
    assert.ok(!w.collideMover([-10, 4, 0], low, capsule).some((p) => p.shape === capsule), "self shape must be ignored");
    // Capsule bottom is 2.0 above the ground, so a 10 m drop stops at fraction 0.2.
    assert.ok(near(w.castMover([-30, 3, 0], low, [0, -10, 0]), 0.2, 0.01));
    assert.ok(near(w.castMover([-30, 3, 0], low, [0, -10, 0], ground), 1, 1e-6));
    w.destroy();
});

// ---- filters ----

test("shape filter round trip, masks, groups and query filter", () => {
    {
        const w = newWorld(0);
        const b = w.createBody({ type: BodyType.Dynamic });
        const s = w.createSphereShape(b, { radius: 0.5, density: 1, friction: 0.5 });
        assert.deepEqual(w.getShapeFilter(s), { category: U64_MAX, mask: U64_MAX, group: 0 });
        const f = { category: 4n, mask: 0b1011n, group: -3 };
        w.setShapeFilter(s, f, true);
        assert.deepEqual(w.getShapeFilter(s), f);
        assert.throws(() => w.setShapeFilter(s, { category: 1n, mask: 1n, group: 2 ** 31 }), RangeError);
        w.destroy();
    }
    {
        // Masks: a pair whose masks exclude each other passes through; a default pair collides and bounces.
        const w = newWorld(0);
        const a = ball(w, [0, 5, 0], [1, 0, 0]);
        const b = ball(w, [0.6, 5, 0], [-1, 0, 0]);
        w.setShapeFilter(a.s, { category: 2n, mask: 1n, group: 0 }, true);
        w.setShapeFilter(b.s, { category: 4n, mask: 1n, group: 0 }, true);
        const c = ball(w, [0, 10, 0], [1, 0, 0]);
        const d = ball(w, [0.6, 10, 0], [-1, 0, 0]);
        stepN(w, 60);
        assert.ok(pos(w, a.b)[0] > pos(w, b.b)[0], "masked pair should pass through");
        assert.ok(pos(w, c.b)[0] < pos(w, d.b)[0], "default pair should collide and stay in order");
        w.destroy();
    }
    {
        // Groups: equal negative groups never collide (they pass through); equal positive groups always do.
        const w = newWorld(0);
        const e = ball(w, [0, 5, 0], [1, 0, 0]);
        const g = ball(w, [0.6, 5, 0], [-1, 0, 0]);
        const h = ball(w, [0, 10, 0], [1, 0, 0]);
        const k = ball(w, [0.6, 10, 0], [-1, 0, 0]);
        w.setShapeFilter(e.s, { category: U64_MAX, mask: U64_MAX, group: -1 }, true);
        w.setShapeFilter(g.s, { category: U64_MAX, mask: U64_MAX, group: -1 }, true);
        w.setShapeFilter(h.s, { category: U64_MAX, mask: U64_MAX, group: 1 }, true);
        w.setShapeFilter(k.s, { category: U64_MAX, mask: U64_MAX, group: 1 }, true);
        stepN(w, 60);
        assert.ok(pos(w, e.b)[0] > pos(w, g.b)[0], "negative group should pass through");
        assert.ok(pos(w, h.b)[0] < pos(w, k.b)[0], "positive group should collide");
        w.destroy();
    }
    {
        // Query filters: the closest hit is the upper box unless the query filter skips it.
        const w = newWorld(0);
        const upper = w.createBody({ type: BodyType.Static, position: [0, 10, 0] });
        const up = w.createBoxShape(upper, { halfWidth: 2, halfHeight: 2, halfDepth: 2, density: 1, friction: 0.5 });
        w.setShapeFilter(up, { category: 2n, mask: U64_MAX, group: 0 }, false);
        const lower = w.createBody({ type: BodyType.Static, position: [0, 5, 0] });
        const low = w.createBoxShape(lower, { halfWidth: 2, halfHeight: 2, halfDepth: 2, density: 1, friction: 0.5 });
        w.setShapeFilter(low, { category: 1n, mask: U64_MAX, group: 0 }, false);
        const origin = [0, 50, 0];
        const down = [0, -100, 0];
        assert.equal(w.castRayAll(origin, down)[0].shape, up);
        assert.equal(w.rayClosestFiltered(origin, down, 1n, 1n)?.shape, low, "accepts category 1 only");
        assert.equal(w.rayClosestFiltered(origin, down, 1n, 2n)?.shape, up, "accepts category 2 only");
        assert.equal(w.rayClosestFiltered(origin, down, 1n, 0n), null, "accepts nothing");
        w.destroy();
    }
});

// ---- bodies ----

test("damping, gravity scale, motion locks, mass data, user data, enable and disable, batch impulses", () => {
    {
        const w = newWorld(0);
        const free = ball(w, [0, 0, 0], [10, 0, 0], [0, 0, 10]).b;
        const damped = ball(w, [0, 5, 0], [10, 0, 0], [0, 0, 10]).b;
        w.setLinearDamping(damped, 2);
        w.setAngularDamping(damped, 2);
        assert.equal(w.getLinearDamping(damped), 2);
        assert.equal(w.getAngularDamping(free), 0);
        stepN(w, 60);
        assert.ok(linVel(w, free)[0] > 9.9 && angVel(w, free)[2] > 9.9, "free body keeps its speed");
        // Damped: about 10 * exp(-2) after 1 s.
        assert.ok(linVel(w, damped)[0] < 2 && angVel(w, damped)[2] < 2, "damped body slows down");
        w.destroy();
    }
    {
        const w = newWorld(-10);
        const floats = ball(w, [0, 10, 0]).b;
        const falls = ball(w, [5, 10, 0]).b;
        w.setGravityScale(floats, 0);
        assert.equal(w.getGravityScale(floats), 0);
        assert.equal(w.getGravityScale(falls), 1);
        stepN(w, 30);
        assert.ok(near(pos(w, floats)[1], 10, 1e-4), "scale 0 stays up");
        assert.ok(pos(w, falls)[1] < 9, "scale 1 falls");
        w.destroy();
    }
    {
        const w = newWorld(-10);
        const locked = ball(w, [0, 10, 0], [2, 0, 2]).b;
        w.setMotionLocks(locked, { linearX: true, linearY: true, linearZ: false, angularX: false, angularY: false, angularZ: false });
        const spinLocked = ball(w, [5, 10, 0], [0, 0, 0], [0, 0, 5]).b;
        w.setMotionLocks(spinLocked, { linearX: false, linearY: false, linearZ: false, angularX: false, angularY: false, angularZ: true });
        const spinFree = ball(w, [10, 10, 0], [0, 0, 0], [0, 0, 5]).b;
        assert.equal(w.getMotionLocks(locked).linearX, true);
        assert.equal(w.getMotionLocks(locked).angularZ, false);
        stepN(w, 30);
        const p = pos(w, locked);
        assert.ok(near(p[0], 0, 1e-4) && near(p[1], 10, 1e-4), `locked axes moved to ${p}`);
        assert.ok(p[2] > 0.5, "the free axis still moves");
        const r = rot(w, spinLocked);
        assert.ok(near(r[0], 0, 1e-4) && near(r[1], 0, 1e-4) && near(r[2], 0, 1e-4), `locked spin turned to ${r}`);
        assert.ok(Math.abs(rot(w, spinFree)[2]) > 0.1, "unlocked spin turns about z");
        w.destroy();
    }
    {
        const w = newWorld(0);
        const b = ball(w, [0, 0, 0]).b;
        assert.ok(near(w.getMassData(b).mass, 0.5236, 1e-3), `sphere mass ${w.getMassData(b).mass}`);
        w.setMassData(b, { mass: 3, center: [0.1, 0, 0], inertia: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
        const md = w.getMassData(b);
        assert.equal(md.mass, 3);
        assert.ok(near(md.center[0], 0.1, 1e-6));
        assert.deepEqual(md.inertia, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
        w.destroy();
    }
    {
        const w = newWorld(0);
        const b = ball(w, [0, 0, 0]).b;
        assert.equal(w.getBodyUserData(b), 0, "zero when never set");
        w.setBodyUserData(b, 0xdeadbeef);
        assert.equal(w.getBodyUserData(b), 0xdeadbeef);
        assert.throws(() => w.setBodyUserData(b, -1), RangeError);
        w.destroy();
    }
    {
        const w = newWorld(-10);
        const b = ball(w, [0, 5, 0]).b;
        w.setBodyEnabled(b, false);
        assert.equal(w.isBodyEnabled(b), false);
        stepN(w, 30);
        assert.ok(near(pos(w, b)[1], 5, 1e-4), "a disabled body does not move");
        w.setBodyEnabled(b, true);
        assert.equal(w.isBodyEnabled(b), true);
        stepN(w, 30);
        assert.ok(pos(w, b)[1] < 4.5, "enabled again, it falls");
        w.destroy();
    }
    {
        // Velocity change is impulse / mass, applied to each body of the batch.
        const w = newWorld(0);
        const a = ball(w, [0, 0, 0]).b;
        const c = ball(w, [10, 0, 0]).b;
        const m = w.getMassData(a).mass;
        w.applyImpulses([a, c], [1, 0, 0, 0, 2, 0]);
        assert.ok(near(linVel(w, a)[0], 1 / m, 1e-3), `impulse on a: ${linVel(w, a)}`);
        assert.ok(near(linVel(w, c)[1], 2 / m, 1e-3), `impulse on c: ${linVel(w, c)}`);
        w.applyImpulses(new BigUint64Array([a]), new Float32Array([0, 0, 0]));
        assert.throws(() => w.applyImpulses([a, c], [1, 0, 0]), RangeError);
        w.destroy();
    }
});

for (const [name, fn] of tests) {
    try {
        fn();
    } catch (err) {
        console.error(`not ok ${name}`);
        throw err;
    }
    console.log(`ok ${name}`);
}
console.log(`ok ts_wrapper: ${tests.length} tests`);
