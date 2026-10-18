//! shapes area of box3d-sys: convex hulls, boxes with an offset and rotation, user material. The C side is
//! src/c/box3d_glue_shapes.c. Plain boxes, spheres and capsules with friction, density and flags are in lib.rs.
use crate::{Body, Shape, SHAPE_CONTACT_EVENTS, SHAPE_SENSOR};

extern "C" {
    /// `points` holds `count` xyz triples. Returns 0 when Box3D cannot build the hull.
    pub fn b3Glue_AddHull(body: Body, points: *const f32, count: i32, density: f32, friction: f32, restitution: f32, user_material: u64, flags: i32) -> Shape;
    /// `half3` are half extents, `center3` the box centre in the body frame, `quat4` its rotation (x y z w).
    pub fn b3Glue_AddBoxTransformed(body: Body, half3: *const f32, center3: *const f32, quat4: *const f32, density: f32, friction: f32, restitution: f32, user_material: u64, flags: i32) -> Shape;
    pub fn b3Glue_ShapeUserMaterial(shape: Shape) -> u64;
}

/// Material and flags of one shape.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapeParams {
    /// kg/m^3. The body mass is the sum over its shapes.
    pub density: f32,
    /// Combined with the other shape's friction as the geometric mean.
    pub friction: f32,
    /// Combined with the other shape's restitution as the maximum.
    pub restitution: f32,
    /// Passed to Box3D's friction and restitution callbacks and returned by queries. Box3D does not use it otherwise.
    pub user_material: u64,
    /// Reports overlaps and never pushes.
    pub sensor: bool,
    /// Reports contact begin and end events when either shape of the pair has this flag.
    pub contact_events: bool,
}

impl Default for ShapeParams {
    fn default() -> Self {
        Self { density: 1.0, friction: 0.5, restitution: 0.0, user_material: 0, sensor: false, contact_events: false }
    }
}

impl ShapeParams {
    fn flags(&self) -> i32 {
        (if self.sensor { SHAPE_SENSOR } else { 0 }) | (if self.contact_events { SHAPE_CONTACT_EVENTS } else { 0 })
    }
}

/// Adds the convex hull of `points` (at least 4, not coplanar) to `body`. None when Box3D rejects the points.
pub fn add_hull(body: Body, points: &[[f32; 3]], p: &ShapeParams) -> Option<Shape> {
    let shape = unsafe {
        b3Glue_AddHull(body, points.as_ptr() as *const f32, points.len() as i32, p.density, p.friction, p.restitution, p.user_material, p.flags())
    };
    (shape != 0).then_some(shape)
}

/// Adds a box centred at `center` in the body frame and turned by `rotation` (x y z w, unit length).
pub fn add_box_transformed(body: Body, half: [f32; 3], center: [f32; 3], rotation: [f32; 4], p: &ShapeParams) -> Option<Shape> {
    let shape = unsafe {
        b3Glue_AddBoxTransformed(
            body,
            half.as_ptr(),
            center.as_ptr(),
            rotation.as_ptr(),
            p.density,
            p.friction,
            p.restitution,
            p.user_material,
            p.flags(),
        )
    };
    (shape != 0).then_some(shape)
}

/// The user material the shape was made with.
pub fn user_material(shape: Shape) -> u64 {
    unsafe { b3Glue_ShapeUserMaterial(shape) }
}
