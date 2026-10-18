//! filters area of box3d-sys: shape collision filters (category, mask, group) and filtered ray casts.
//! The C side is src/c/box3d_glue_filters.c.
use super::{Shape, World};

/// Collision filter of a shape. Shapes collide when each one's category is in the other's mask. A non-zero group
/// overrides the masks: equal positive groups always collide, equal negative groups never do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Filter {
    pub category: u64,
    pub mask: u64,
    pub group: i32,
}

/// Box3D's default: every category bit, collides with everything, no group.
pub const DEFAULT_FILTER: Filter = Filter { category: u64::MAX, mask: u64::MAX, group: 0 };

extern "C" {
    pub fn b3Glue_SetShapeFilter(shape: Shape, category: u64, mask: u64, group: i32, invoke_contacts: bool);
    pub fn b3Glue_GetShapeFilter(shape: Shape, out3: *mut u64);
    pub fn b3Glue_RayClosestFiltered(world: World, origin: *const f32, d: *const f32, category: u64, mask: u64, out7: *mut f32) -> Shape;
}

/// `invoke_contacts` rebuilds the shape's contacts now; pass true for a shape already in a running world.
pub fn set_shape_filter(shape: Shape, filter: Filter, invoke_contacts: bool) {
    unsafe { b3Glue_SetShapeFilter(shape, filter.category, filter.mask, filter.group, invoke_contacts) }
}

pub fn shape_filter(shape: Shape) -> Filter {
    let mut o = [0u64; 3];
    unsafe { b3Glue_GetShapeFilter(shape, o.as_mut_ptr()) };
    Filter { category: o[0], mask: o[1], group: o[2] as i64 as i32 }
}

/// Closest hit that passes the query filter: a shape is hit when its category is in `mask` and its mask holds `category`.
/// Returns the shape and `[fraction, px, py, pz, nx, ny, nz]`, or None when nothing is hit.
pub fn ray_closest_filtered(world: World, origin: [f32; 3], d: [f32; 3], category: u64, mask: u64) -> Option<(Shape, [f32; 7])> {
    let mut out = [0.0f32; 7];
    let shape = unsafe { b3Glue_RayClosestFiltered(world, origin.as_ptr(), d.as_ptr(), category, mask, out.as_mut_ptr()) };
    (shape != 0).then_some((shape, out))
}
