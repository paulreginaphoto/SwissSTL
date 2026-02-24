"""
Generate STL mesh from terrain + optional buildings + optional roads.
Buildings are expected in LV95/LN02 (same CRS as terrain) — no grounding
heuristics needed when using DXF source data.
"""

import logging
import os
from typing import Optional

import numpy as np
import trimesh
from shapely import contains_xy
from shapely.geometry import Point, Polygon
from stl import mesh as stl_mesh

logger = logging.getLogger(__name__)

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "cache",
    "output",
)
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_GRID_DIM = 1200


def _build_terrain_faces(
    xx: np.ndarray, yy: np.ndarray, z: np.ndarray, base_z: float,
    clip_mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Build terrain solid: top surface + bottom plate + walls.

    If clip_mask is provided (bool array same shape as z), only quads where
    all 4 corners are inside the mask are generated.  Rectangular walls/base
    are omitted when a mask is active (caller provides polygon walls/base).
    """
    rows, cols = z.shape
    model_width = float(xx[0, -1])
    model_height = float(yy[0, 0])

    def _stack(x, y, zz):
        return np.stack([x, y, zz], axis=-1)

    tl = _stack(xx[:-1, :-1], yy[:-1, :-1], z[:-1, :-1])
    bl = _stack(xx[1:, :-1], yy[1:, :-1], z[1:, :-1])
    tr = _stack(xx[:-1, 1:], yy[:-1, 1:], z[:-1, 1:])
    br = _stack(xx[1:, 1:], yy[1:, 1:], z[1:, 1:])

    tri_a = np.stack([tl, bl, tr], axis=-2).reshape(-1, 3, 3)
    tri_b = np.stack([tr, bl, br], axis=-2).reshape(-1, 3, 3)

    if clip_mask is not None:
        quad_valid = (
            clip_mask[:-1, :-1] & clip_mask[:-1, 1:]
            & clip_mask[1:, :-1] & clip_mask[1:, 1:]
        ).ravel()
        tri_a = tri_a[quad_valid]
        tri_b = tri_b[quad_valid]

    top_faces = np.concatenate([tri_a, tri_b], axis=0)

    if clip_mask is not None:
        return top_faces.astype(np.float32)

    bottom = np.array([
        [[0, 0, base_z], [0, model_height, base_z], [model_width, 0, base_z]],
        [[model_width, 0, base_z], [0, model_height, base_z], [model_width, model_height, base_z]],
    ], dtype=np.float32)

    def _wall_strip(x0, y0, z0, x1, y1, z1, flip=False):
        bz = np.full_like(z0, base_z)
        p0 = _stack(x0, y0, z0)
        p1 = _stack(x1, y1, z1)
        p0b = _stack(x0, y0, bz)
        p1b = _stack(x1, y1, bz)
        if flip:
            a = np.stack([p0, p0b, p1], axis=-2)
            b = np.stack([p1, p0b, p1b], axis=-2)
        else:
            a = np.stack([p0, p1, p0b], axis=-2)
            b = np.stack([p1, p1b, p0b], axis=-2)
        return np.concatenate([a, b], axis=0)

    wall_top = _wall_strip(
        xx[0, :-1], yy[0, :-1], z[0, :-1],
        xx[0, 1:], yy[0, 1:], z[0, 1:])
    wall_bottom = _wall_strip(
        xx[-1, :-1], yy[-1, :-1], z[-1, :-1],
        xx[-1, 1:], yy[-1, 1:], z[-1, 1:], flip=True)
    wall_left = _wall_strip(
        xx[:-1, 0], yy[:-1, 0], z[:-1, 0],
        xx[1:, 0], yy[1:, 0], z[1:, 0], flip=True)
    wall_right = _wall_strip(
        xx[:-1, -1], yy[:-1, -1], z[:-1, -1],
        xx[1:, -1], yy[1:, -1], z[1:, -1])

    return np.concatenate(
        [top_faces, bottom, wall_top, wall_bottom, wall_left, wall_right],
        axis=0,
    ).astype(np.float32)


def _repair_building_mesh(verts_mm: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Repair building mesh: fix normals, remove degenerate/duplicate faces."""
    logger.info(f"Repairing building mesh: {len(verts_mm)} verts, {len(faces)} faces...")
    mesh = trimesh.Trimesh(vertices=verts_mm.astype(np.float64), faces=faces.astype(np.int32), process=False)
    initial_faces = len(mesh.faces)

    trimesh.repair.fix_normals(mesh, multibody=True)
    trimesh.repair.fix_inversion(mesh, multibody=True)

    nondegen = mesh.nondegenerate_faces()
    if not nondegen.all():
        mesh.update_faces(nondegen)
    unique = mesh.unique_faces()
    if len(unique) < len(mesh.faces):
        mesh.update_faces(unique)
    mesh.merge_vertices()
    nondegen2 = mesh.nondegenerate_faces()
    if not nondegen2.all():
        mesh.update_faces(nondegen2)

    logger.info(
        f"After building repair: {len(mesh.faces)} faces (from {initial_faces}), "
        f"{len(mesh.vertices)} verts, watertight={mesh.is_watertight}"
    )

    verts = np.asarray(mesh.vertices, dtype=np.float32)
    faces_idx = np.asarray(mesh.faces)
    out = verts[faces_idx]
    return out


def _apply_road_emboss(
    z: np.ndarray,
    road_polygons_lv95: list,
    terrain_lv95_bbox: tuple,
    road_raise_mm: float = 0.15,
) -> np.ndarray:
    """Emboss roads directly into terrain height grid (manifold-safe)."""
    if not road_polygons_lv95:
        return z

    rows, cols = z.shape
    target_cells = 1_200_000
    stride = int(np.ceil(np.sqrt((rows * cols) / target_cells))) if rows * cols > target_cells else 1

    if stride > 1:
        work_rows = int(np.ceil(rows / stride))
        work_cols = int(np.ceil(cols / stride))
    else:
        work_rows, work_cols = rows, cols
    min_e, min_n, max_e, max_n = terrain_lv95_bbox
    lv95_width = max_e - min_e
    lv95_height = max_n - min_n
    e_coords = np.linspace(min_e, max_e, work_cols, dtype=np.float64)
    n_coords = np.linspace(max_n, min_n, work_rows, dtype=np.float64)

    road_mask_work = np.zeros((work_rows, work_cols), dtype=bool)
    applied = 0

    for coords, _road_type in road_polygons_lv95:
        arr = np.asarray(coords, dtype=np.float64)
        if arr.shape[0] < 3:
            continue
        poly = Polygon(arr[:, :2])
        if poly.is_empty or not poly.is_valid:
            continue

        pmin_e, pmin_n, pmax_e, pmax_n = poly.bounds
        c0 = int(np.floor((pmin_e - min_e) / lv95_width * (work_cols - 1)))
        c1 = int(np.ceil((pmax_e - min_e) / lv95_width * (work_cols - 1)))
        r0 = int(np.floor((1.0 - (pmax_n - min_n) / lv95_height) * (work_rows - 1)))
        r1 = int(np.ceil((1.0 - (pmin_n - min_n) / lv95_height) * (work_rows - 1)))
        c0 = max(0, min(work_cols - 1, c0))
        c1 = max(0, min(work_cols - 1, c1))
        r0 = max(0, min(work_rows - 1, r0))
        r1 = max(0, min(work_rows - 1, r1))
        if c1 < c0 or r1 < r0:
            continue

        ee, nn = np.meshgrid(e_coords[c0 : c1 + 1], n_coords[r0 : r1 + 1])
        inside = contains_xy(poly, ee, nn)
        if np.any(inside):
            road_mask_work[r0 : r1 + 1, c0 : c1 + 1] |= inside
            applied += 1

    if stride > 1:
        road_mask = np.repeat(np.repeat(road_mask_work, stride, axis=0), stride, axis=1)[:rows, :cols]
    else:
        road_mask = road_mask_work

    if np.any(road_mask):
        z = z.copy()
        z[road_mask] += road_raise_mm
    logger.info(
        f"Road emboss: {road_mask.sum()} cells updated from {applied} polygons "
        f"(stride={stride}, work_grid={work_rows}x{work_cols})"
    )
    return z


def _fix_normals_global(all_face_data: np.ndarray) -> np.ndarray:
    """Global orientation/cleanup pass after merging all parts."""
    n_faces = len(all_face_data)
    all_verts = all_face_data.reshape(-1, 3).astype(np.float64)
    all_faces_idx = np.arange(3 * n_faces, dtype=np.int32).reshape(n_faces, 3)
    mesh = trimesh.Trimesh(vertices=all_verts, faces=all_faces_idx, process=False)
    mesh.merge_vertices()
    trimesh.repair.fix_normals(mesh, multibody=True)
    nondegen = mesh.nondegenerate_faces()
    if not nondegen.all():
        mesh.update_faces(nondegen)

    verts = np.asarray(mesh.vertices, dtype=np.float32)
    faces_idx = np.asarray(mesh.faces)
    out = verts[faces_idx]
    return out


def _compute_clip_mask(
    rows: int, cols: int,
    clip_polygon_lv95: list[list[float]],
    terrain_lv95_bbox: tuple,
) -> np.ndarray:
    """Return boolean mask (rows, cols) — True where cell centre is inside polygon."""
    min_e, min_n, max_e, max_n = terrain_lv95_bbox
    poly_coords = np.array(clip_polygon_lv95, dtype=np.float64)
    if poly_coords.shape[0] < 3:
        return np.ones((rows, cols), dtype=bool)

    poly = Polygon(poly_coords[:, :2])
    if poly.is_empty or not poly.is_valid:
        return np.ones((rows, cols), dtype=bool)

    e_coords = np.linspace(min_e, max_e, cols, dtype=np.float64)
    n_coords = np.linspace(max_n, min_n, rows, dtype=np.float64)
    ee, nn = np.meshgrid(e_coords, n_coords)

    inside = contains_xy(poly, ee, nn)
    logger.info(f"Clip mask: {int(inside.sum())}/{rows*cols} cells inside polygon")
    return inside


def _build_polygon_walls(
    clip_polygon_lv95: list[list[float]],
    terrain_lv95_bbox: tuple,
    xx: np.ndarray, yy: np.ndarray, z: np.ndarray,
    model_width_mm: float, height_mm: float,
    base_z: float,
) -> np.ndarray:
    """Build vertical walls along the clip polygon perimeter."""
    min_e, min_n, max_e, max_n = terrain_lv95_bbox
    lv95_width = max_e - min_e
    lv95_height = max_n - min_n
    rows, cols = z.shape

    poly_pts = np.array(clip_polygon_lv95, dtype=np.float64)
    n_pts = len(poly_pts)
    if n_pts < 3:
        return np.empty((0, 3, 3), dtype=np.float32)

    px = (poly_pts[:, 0] - min_e) / lv95_width * model_width_mm
    py = (poly_pts[:, 1] - min_n) / lv95_height * height_mm

    col_idx = np.clip(((poly_pts[:, 0] - min_e) / lv95_width * (cols - 1)).astype(int), 0, cols - 1)
    row_idx = np.clip(((max_n - poly_pts[:, 1]) / lv95_height * (rows - 1)).astype(int), 0, rows - 1)
    pz = z[row_idx, col_idx].astype(np.float32)

    faces = []
    for i in range(n_pts - 1):
        x0, y0, z0 = px[i], py[i], pz[i]
        x1, y1, z1 = px[i + 1], py[i + 1], pz[i + 1]
        faces.append([[x0, y0, z0], [x1, y1, z1], [x0, y0, base_z]])
        faces.append([[x1, y1, z1], [x1, y1, base_z], [x0, y0, base_z]])

    return np.array(faces, dtype=np.float32) if faces else np.empty((0, 3, 3), dtype=np.float32)


def _build_polygon_base(
    clip_polygon_lv95: list[list[float]],
    terrain_lv95_bbox: tuple,
    model_width_mm: float, height_mm: float,
    base_z: float,
) -> np.ndarray:
    """Build a flat base plate in the shape of the clip polygon."""
    from scipy.spatial import Delaunay

    min_e, min_n, max_e, max_n = terrain_lv95_bbox
    lv95_width = max_e - min_e
    lv95_height = max_n - min_n

    poly_pts = np.array(clip_polygon_lv95, dtype=np.float64)
    if poly_pts.shape[0] < 3:
        return np.empty((0, 3, 3), dtype=np.float32)

    px = (poly_pts[:, 0] - min_e) / lv95_width * model_width_mm
    py = (poly_pts[:, 1] - min_n) / lv95_height * height_mm
    pts2d = np.column_stack([px, py])

    if len(pts2d) > 3 and np.allclose(pts2d[0], pts2d[-1]):
        pts2d = pts2d[:-1]

    tri = Delaunay(pts2d)
    poly_shape = Polygon(pts2d)
    faces = []
    for simplex in tri.simplices:
        cx = pts2d[simplex, 0].mean()
        cy = pts2d[simplex, 1].mean()
        if poly_shape.contains(Point(cx, cy)):
            v0, v1, v2 = simplex
            faces.append([
                [pts2d[v0, 0], pts2d[v0, 1], base_z],
                [pts2d[v2, 0], pts2d[v2, 1], base_z],
                [pts2d[v1, 0], pts2d[v1, 1], base_z],
            ])

    return np.array(faces, dtype=np.float32) if faces else np.empty((0, 3, 3), dtype=np.float32)


SPLIT_FACE_LIMIT = 500_000


def _mesh_integrity_metrics(face_data: np.ndarray) -> dict:
    """Compute final STL integrity metrics.

    For meshes above SPLIT_FACE_LIMIT, skip the expensive mesh.split()
    call (requires graph traversal of all edges) and report components=-1.
    """
    verts = face_data.reshape(-1, 3).astype(np.float64)
    faces_idx = np.arange(len(face_data) * 3, dtype=np.int32).reshape(-1, 3)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces_idx, process=False)
    mesh.merge_vertices()

    eui = mesh.edges_unique_inverse
    edge_use = np.bincount(eui, minlength=len(mesh.edges_unique))
    boundary_edges = int(np.sum(edge_use == 1))

    nondeg = mesh.nondegenerate_faces()
    deg_faces = int((~nondeg).sum())

    if len(mesh.faces) <= SPLIT_FACE_LIMIT:
        comp_count = len(mesh.split(only_watertight=False))
    else:
        comp_count = -1
        logger.info(f"Skipping mesh.split() for {len(mesh.faces)} faces (limit={SPLIT_FACE_LIMIT})")

    return {
        "faces": int(len(mesh.faces)),
        "verts": int(len(mesh.vertices)),
        "watertight": bool(mesh.is_watertight),
        "boundary_edges": boundary_edges,
        "degenerate_faces": deg_faces,
        "components": int(comp_count),
    }


def generate_terrain_stl(
    elevation: np.ndarray,
    job_id: str,
    model_width_mm: float = 150.0,
    z_exaggeration: float = 1.0,
    base_height_mm: float = 3.0,
    building_verts_lv95: Optional[np.ndarray] = None,
    building_faces: Optional[np.ndarray] = None,
    terrain_lv95_bbox: Optional[tuple] = None,
    road_polygons_lv95: Optional[list] = None,
    on_progress=None,
    global_min_elev: Optional[float] = None,
    clip_polygon_lv95: Optional[list[list[float]]] = None,
) -> str:
    """Convert terrain + optional buildings + roads into a single STL file.

    Buildings are expected in LV95/LN02 (same CRS as the terrain elevation grid).
    The conversion to model coordinates (mm) uses the same formula for both
    terrain and buildings: subtract min_elev, multiply by z_scale.

    For multi-tile grids, pass global_min_elev (shared across all tiles) so
    the z reference is consistent and edges align when tiles are assembled.

    If clip_polygon_lv95 is provided (list of [E,N] coords), terrain cells
    outside the polygon are flattened to base level, creating a shaped model.
    """
    rows, cols = elevation.shape
    logger.info(f"Generating STL: {rows}x{cols} grid, {model_width_mm}mm target width")

    if max(rows, cols) > MAX_GRID_DIM:
        step = int(np.ceil(max(rows, cols) / MAX_GRID_DIM))
        elevation = elevation[::step, ::step]
        rows, cols = elevation.shape
        logger.info(f"Downsampled to {rows}x{cols} (step={step})")

    if terrain_lv95_bbox:
        min_e, min_n, max_e, max_n = terrain_lv95_bbox
        lv95_width = max_e - min_e
        lv95_height = max_n - min_n
    else:
        min_e = min_n = 0.0
        max_e = float(cols * 2.0)
        max_n = float(rows * 2.0)
        lv95_width = max_e - min_e
        lv95_height = max_n - min_n

    horizontal_scale = model_width_mm / lv95_width
    height_mm = lv95_height * horizontal_scale
    z_scale = horizontal_scale * z_exaggeration

    min_elev = global_min_elev if global_min_elev is not None else float(np.nanmin(elevation))
    z = (elevation - min_elev) * z_scale
    z = np.nan_to_num(z, nan=0.0).astype(np.float32)

    if road_polygons_lv95 and terrain_lv95_bbox:
        z = _apply_road_emboss(z, road_polygons_lv95, terrain_lv95_bbox, road_raise_mm=0.15)

    clip_mask = None
    if clip_polygon_lv95 and terrain_lv95_bbox:
        clip_mask = _compute_clip_mask(rows, cols, clip_polygon_lv95, terrain_lv95_bbox)

    base_z = -base_height_mm
    x = np.linspace(0, model_width_mm, cols, dtype=np.float32)
    y = np.linspace(0, height_mm, rows, dtype=np.float32)[::-1]
    xx, yy = np.meshgrid(x, y)

    logger.info(
        f"Model: {model_width_mm:.1f}x{height_mm:.1f}mm, "
        f"z_scale={z_scale:.4f} mm/m (exag={z_exaggeration}x), relief={z.max():.1f}mm"
    )
    if on_progress:
        on_progress(60)

    terrain_faces = _build_terrain_faces(xx, yy, z, base_z, clip_mask=clip_mask)
    logger.info(f"Terrain: {len(terrain_faces)} faces")
    if on_progress:
        on_progress(75)

    # --- Buildings: same CRS as terrain, direct coordinate mapping ---
    building_face_data = None
    if (
        building_verts_lv95 is not None
        and len(building_verts_lv95) > 0
        and building_faces is not None
        and len(building_faces) > 0
        and terrain_lv95_bbox is not None
    ):
        logger.info(f"Processing {len(building_verts_lv95)} building vertices (DXF/LV95)...")
        bv = building_verts_lv95.astype(np.float64, copy=True)
        bf_arr = building_faces.astype(np.int32, copy=False)

        bx = (bv[:, 0] - min_e) / lv95_width * model_width_mm
        by = (bv[:, 1] - min_n) / lv95_height * height_mm
        bz = (bv[:, 2] - min_elev) * z_scale

        margin = 0.5
        in_bounds = (
            (bx >= -margin) & (bx <= model_width_mm + margin)
            & (by >= -margin) & (by <= height_mm + margin)
        )

        if clip_polygon_lv95:
            clip_poly = Polygon(np.array(clip_polygon_lv95)[:, :2])
            if clip_poly.is_valid and not clip_poly.is_empty:
                in_poly = contains_xy(clip_poly, bv[:, 0], bv[:, 1])
                in_bounds = in_bounds & in_poly

        face_keep = in_bounds[bf_arr[:, 0]] & in_bounds[bf_arr[:, 1]] & in_bounds[bf_arr[:, 2]]
        valid_faces = bf_arr[face_keep]

        logger.info(f"Buildings: faces_kept={len(valid_faces)}/{len(bf_arr)}")

        if len(valid_faces) > 0:
            building_verts_mm = np.column_stack([bx, by, bz]).astype(np.float32)
            used_verts = np.unique(valid_faces.ravel())
            remap = np.full(len(building_verts_mm), -1, dtype=np.int32)
            remap[used_verts] = np.arange(len(used_verts), dtype=np.int32)
            compact_verts = building_verts_mm[used_verts]
            compact_faces = remap[valid_faces]
            building_face_data = _repair_building_mesh(compact_verts, compact_faces)
        else:
            logger.warning("No building faces within model bounds")

    if on_progress:
        on_progress(85)

    parts = [terrain_faces]

    if clip_mask is not None and clip_polygon_lv95 and terrain_lv95_bbox:
        poly_walls = _build_polygon_walls(
            clip_polygon_lv95, terrain_lv95_bbox, xx, yy, z,
            model_width_mm, height_mm, base_z,
        )
        poly_base = _build_polygon_base(
            clip_polygon_lv95, terrain_lv95_bbox,
            model_width_mm, height_mm, base_z,
        )
        if len(poly_walls) > 0:
            parts.append(poly_walls)
        if len(poly_base) > 0:
            parts.append(poly_base)
        logger.info(f"Polygon shape: {len(poly_walls)} wall faces, {len(poly_base)} base faces")

    if building_face_data is not None:
        parts.append(building_face_data)
    all_face_data = np.concatenate(parts)

    all_face_data = _fix_normals_global(all_face_data)
    integrity = _mesh_integrity_metrics(all_face_data)
    logger.info(
        "Mesh integrity: "
        f"watertight={integrity['watertight']} "
        f"boundary_edges={integrity['boundary_edges']} "
        f"degenerate_faces={integrity['degenerate_faces']} "
        f"components={integrity['components']}"
    )
    if integrity["boundary_edges"] > 100000:
        logger.warning("Mesh has high boundary edge count; slicer may still report repairable issues.")
    if integrity["boundary_edges"] > 400000 and clip_mask is None:
        raise RuntimeError(f"Mesh integrity too low (boundary edges={integrity['boundary_edges']}).")

    num_faces = len(all_face_data)
    result_mesh = stl_mesh.Mesh(np.zeros(num_faces, dtype=stl_mesh.Mesh.dtype))
    result_mesh.vectors = all_face_data  # pyright: ignore[reportAttributeAccessIssue]
    result_mesh.update_normals()  # pyright: ignore[reportAttributeAccessIssue]

    if on_progress:
        on_progress(95)

    output_path = os.path.join(OUTPUT_DIR, f"{job_id}.stl")
    result_mesh.save(output_path)  # pyright: ignore[reportAttributeAccessIssue]
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info(f"STL saved: {output_path} ({file_size_mb:.1f} MB, {num_faces} faces)")
    return output_path
