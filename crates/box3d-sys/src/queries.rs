//! queries area of box3d-sys: shape casts, overlaps, all-hits ray cast, and capsule mover collide and cast.
//! The C side is src/c/box3d_glue_queries.c. The raw externs are below; the safe wrappers allocate the output buffers
//! and grow them when the glue reports more results than fit. The world and shape ids must be live.
use crate::{Shape, World};

pub const PROXY_SPHERE: i32 = 0;
pub const PROXY_BOX: i32 = 1;
pub const PROXY_CAPSULE: i32 = 2;
pub const PROXY_HULL: i32 = 3;

extern "C" {
    /// Closest hit of a shape cast. `shape` holds the proxy parameters (see `Proxy`), `out7`: fraction, point, normal.
    pub fn b3Glue_CastShape(world: World, kind: i32, shape: *const f32, shape_len: i32, origin3: *const f32, delta3: *const f32, out7: *mut f32) -> Shape;
    /// `aabb6` is min(3), max(3). Writes up to `max` ids, returns the total.
    pub fn b3Glue_OverlapAABB(world: World, aabb6: *const f32, ids: *mut u64, max: i32) -> i32;
    pub fn b3Glue_OverlapShape(world: World, kind: i32, shape: *const f32, shape_len: i32, origin3: *const f32, ids: *mut u64, max: i32) -> i32;
    /// Per hit: `ids[i]` and `out7[7 * i ..]` (fraction, point, normal), sorted by fraction. Returns the total.
    /// When the total exceeds `max`, the `max` nearest hits are kept, still sorted (see the C header).
    pub fn b3Glue_CastRayAll(world: World, origin3: *const f32, delta3: *const f32, ids: *mut u64, out7: *mut f32, max: i32) -> i32;
    /// `capsule7` is center1, center2, radius. Per plane: `ids[i]` and `planes4[4 * i ..]` (normal, offset).
    pub fn b3Glue_CollideMover(world: World, origin3: *const f32, capsule7: *const f32, self_shape: Shape, ids: *mut u64, planes4: *mut f32, max: i32) -> i32;
    pub fn b3Glue_CastMover(world: World, origin3: *const f32, capsule7: *const f32, delta3: *const f32, self_shape: Shape) -> f32;
}

/// A convex shape for casts and overlaps. Centred on the query origin.
#[derive(Clone, Copy, Debug)]
pub enum Proxy<'a> {
    Sphere { radius: f32 },
    /// Half extents.
    Box { half: [f32; 3] },
    /// Segment along Y from -half_height to +half_height, with a radius around it.
    Capsule { half_height: f32, radius: f32 },
    /// Point cloud with a radius. Up to 128 points; more gives no result.
    Hull { radius: f32, points: &'a [[f32; 3]] },
}

impl Proxy<'_> {
    fn encode(&self) -> (i32, Vec<f32>) {
        match *self {
            Proxy::Sphere { radius } => (PROXY_SPHERE, vec![radius]),
            Proxy::Box { half } => (PROXY_BOX, half.to_vec()),
            Proxy::Capsule { half_height, radius } => (PROXY_CAPSULE, vec![half_height, radius]),
            Proxy::Hull { radius, points } => {
                let mut v = Vec::with_capacity(1 + 3 * points.len());
                v.push(radius);
                for p in points {
                    v.extend_from_slice(p);
                }
                (PROXY_HULL, v)
            }
        }
    }
}

/// A capsule for the mover, relative to the query origin.
#[derive(Clone, Copy, Debug)]
pub struct Capsule {
    pub center1: [f32; 3],
    pub center2: [f32; 3],
    pub radius: f32,
}

impl Capsule {
    fn encode(&self) -> [f32; 7] {
        let (a, b) = (self.center1, self.center2);
        [a[0], a[1], a[2], b[0], b[1], b[2], self.radius]
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ShapeHit {
    pub shape: Shape,
    pub fraction: f32,
    pub point: [f32; 3],
    pub normal: [f32; 3],
}

#[derive(Clone, Copy, Debug)]
pub struct RayHit {
    pub shape: Shape,
    pub fraction: f32,
    pub point: [f32; 3],
    pub normal: [f32; 3],
}

#[derive(Clone, Copy, Debug)]
pub struct PlaneHit {
    pub shape: Shape,
    /// Outward normal of the shape at the contact.
    pub normal: [f32; 3],
    pub offset: f32,
}

/// Closest hit of `proxy` swept from `origin` along `delta`. None on a miss.
pub fn cast_shape(world: World, proxy: &Proxy, origin: [f32; 3], delta: [f32; 3]) -> Option<ShapeHit> {
    let (kind, params) = proxy.encode();
    let mut out = [0.0f32; 7];
    let shape = unsafe { b3Glue_CastShape(world, kind, params.as_ptr(), params.len() as i32, origin.as_ptr(), delta.as_ptr(), out.as_mut_ptr()) };
    (shape != 0).then(|| ShapeHit { shape, fraction: out[0], point: [out[1], out[2], out[3]], normal: [out[4], out[5], out[6]] })
}

/// Shapes whose bounds overlap the box with corners `min` and `max`.
pub fn overlap_aabb(world: World, min: [f32; 3], max: [f32; 3]) -> Vec<Shape> {
    let aabb = [min[0], min[1], min[2], max[0], max[1], max[2]];
    collect_ids(|ids, cap| unsafe { b3Glue_OverlapAABB(world, aabb.as_ptr(), ids, cap) })
}

/// Shapes that overlap `proxy` placed at `origin`.
pub fn overlap_shape(world: World, proxy: &Proxy, origin: [f32; 3]) -> Vec<Shape> {
    let (kind, params) = proxy.encode();
    collect_ids(|ids, cap| unsafe { b3Glue_OverlapShape(world, kind, params.as_ptr(), params.len() as i32, origin.as_ptr(), ids, cap) })
}

/// Every shape a ray from `origin` along `delta` passes through, nearest first.
/// The wrapper grows the buffer to the total and calls again, so the returned hits are all of them, sorted. A glue
/// call with a smaller buffer keeps the nearest hits that fit.
pub fn cast_ray_all(world: World, origin: [f32; 3], delta: [f32; 3]) -> Vec<RayHit> {
    let mut cap = 16usize;
    loop {
        let mut ids = vec![0u64; cap];
        let mut out = vec![0.0f32; 7 * cap];
        let total = unsafe { b3Glue_CastRayAll(world, origin.as_ptr(), delta.as_ptr(), ids.as_mut_ptr(), out.as_mut_ptr(), cap as i32) } as usize;
        if total > cap {
            cap = total;
            continue;
        }
        return (0..total)
            .map(|i| {
                let o = &out[7 * i..7 * i + 7];
                RayHit { shape: ids[i], fraction: o[0], point: [o[1], o[2], o[3]], normal: [o[4], o[5], o[6]] }
            })
            .collect();
    }
}

/// Planes a capsule mover touches at `origin`. `self_shape` is ignored when given.
pub fn collide_mover(world: World, origin: [f32; 3], capsule: Capsule, self_shape: Option<Shape>) -> Vec<PlaneHit> {
    let c7 = capsule.encode();
    let mut cap = 16usize;
    loop {
        let mut ids = vec![0u64; cap];
        let mut planes = vec![0.0f32; 4 * cap];
        let total = unsafe {
            b3Glue_CollideMover(world, origin.as_ptr(), c7.as_ptr(), self_shape.unwrap_or(0), ids.as_mut_ptr(), planes.as_mut_ptr(), cap as i32)
        } as usize;
        if total > cap {
            cap = total;
            continue;
        }
        return (0..total)
            .map(|i| {
                let p = &planes[4 * i..4 * i + 4];
                PlaneHit { shape: ids[i], normal: [p[0], p[1], p[2]], offset: p[3] }
            })
            .collect();
    }
}

/// Fraction (0..1) of `delta` the capsule can travel from `origin`. `self_shape` is ignored when given.
pub fn cast_mover(world: World, origin: [f32; 3], capsule: Capsule, delta: [f32; 3], self_shape: Option<Shape>) -> f32 {
    let c7 = capsule.encode();
    unsafe { b3Glue_CastMover(world, origin.as_ptr(), c7.as_ptr(), delta.as_ptr(), self_shape.unwrap_or(0)) }
}

/// Runs a glue overlap call with a buffer, growing it once when the glue reports more ids than fit.
fn collect_ids(mut call: impl FnMut(*mut u64, i32) -> i32) -> Vec<Shape> {
    let mut cap = 16usize;
    loop {
        let mut ids = vec![0u64; cap];
        let total = call(ids.as_mut_ptr(), cap as i32) as usize;
        if total > cap {
            cap = total;
            continue;
        }
        ids.truncate(total);
        return ids;
    }
}
