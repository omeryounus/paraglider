"""
Reference-accurate ram-air canopy + seated pod-pilot for Aero Glide.

Sources (public, used as dimension/anatomy references — not copied IP):
  - Ozone Rush 6 MS (EN-B): 62 cells, projected span 9.23 m, flat span 11.71 m,
    projected AR 4.18, flat AR 5.7, hybrid 3/2 line set. We keep the game hang
    height (~3.15 m) and collapse 62 cells to 20 visual cells for a <15k-tri budget.
  - SkyNomad "Paraglider Structure": open LE intakes, A/B/C/D + brake galleries,
    ears/stabilo, sitting vs laying harness, carabiners / maillons / risers.
  - USPA ram-air anatomy: span/chord, cell walls, intake lips.
  - PolyHaven fabric_pattern_07 (CC0) as Skytex-like nylon albedo/normal/rough/AO.

  blender --background --python scripts/blender_generate_assets.py
"""

from __future__ import annotations

import math
import os
import traceback
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "models"
TEX = ROOT / "blender" / "tex"
BLEND = ROOT / "blender" / "paraglider_studio.blend"

# Rush 6 MS projected numbers, game-compressed hang height.
SPAN = 9.23
CHORD = 2.28
ARC = 1.62
CELLS = 24
CHORD_SEGS = 18
INTAKE_V = 0.11
CANOPY_Y = 3.15
RISER_L = Vector((-0.35, 0.0, 0.58))
RISER_R = Vector((0.35, 0.0, 0.58))

# Classic EN-B sport palette (navy ear / amber mid / crimson core).
NAVY = (0.10, 0.14, 0.34, 1.0)
AMBER = (0.92, 0.48, 0.10, 1.0)
CRIMSON = (0.78, 0.035, 0.12, 1.0)
WHITE = (0.93, 0.93, 0.94, 1.0)


def log(msg: str) -> None:
    print(f"[assets] {msg}", flush=True)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 8
    except Exception:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.74, 0.88, 1.0)
        bg.inputs[1].default_value = 0.55
    sun = bpy.data.lights.new("KeySun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(7)
    sun_obj = bpy.data.objects.new("KeySun", sun)
    sun_obj.rotation_euler = (math.radians(52), 0.0, math.radians(195))
    scene.collection.objects.link(sun_obj)


def set_input(node, name: str, value) -> None:
    sock = node.inputs.get(name)
    if sock is None:
        return
    try:
        sock.default_value = value
    except Exception:
        pass


def shade_smooth(obj: bpy.types.Object) -> None:
    mesh = getattr(obj, "data", None)
    if mesh is None or not hasattr(mesh, "polygons"):
        return
    for p in mesh.polygons:
        p.use_smooth = True
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(50)


def ensure_object(name: str, data) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def new_empty(name: str, loc: Vector, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.08
    empty.location = loc
    bpy.context.scene.collection.objects.link(empty)
    if parent:
        empty.parent = parent
    return empty


# ---------------------------------------------------------------------------
# Canopy — ram-air loft with open intakes, ribs, ears
# ---------------------------------------------------------------------------

def planform(u: float) -> tuple[float, float, float, float]:
    """u in -1..1 → (x span, local chord, z drop, aft sweep)."""
    s = abs(u)
    plan = math.sqrt(max(0.05, 1.0 - s * s * 0.96))
    taper = 0.40 + 0.60 * plan
    tip = 1.0 - max(0.0, s - 0.86) / 0.14 * 0.42
    chord = CHORD * taper * max(0.38, tip)
    x = u * (SPAN * 0.5)
    z_drop = -ARC * (u * u)
    sweep = s * s * 0.22 * chord
    return x, chord, z_drop, sweep


def naca_yt(x: float, t: float = 0.13) -> float:
    x = max(1e-5, min(1.0, x))
    return 5.0 * t * (
        0.2969 * math.sqrt(x)
        - 0.1260 * x
        - 0.3516 * x * x
        + 0.2843 * x ** 3
        - 0.1015 * x ** 4
    )


def naca_yc(x: float, m: float = 0.035, p: float = 0.38) -> float:
    if x < p:
        return m / p ** 2 * (2 * p * x - x * x)
    return m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * x - x * x)


def airfoil_point(u: float, v: float, upper: bool) -> Vector:
    """v=0 leading edge, v=1 trailing edge. Blender: +X span, +Y forward (LE), +Z up."""
    x, chord, z_drop, sweep = planform(u)
    camber = naca_yc(v) * chord
    thick = naca_yt(v) * chord
    if v > 0.92:
        thick *= (1.0 - v) / 0.08
    sign = 1.0 if upper else -0.78
    # inflate the cells a little so the ram-air volume reads
    puff = 0.012 * math.sin(math.pi * v) * (1.0 - abs(u) ** 1.4)
    y = (0.20 - v) * chord - sweep
    z = z_drop + camber + sign * thick + (puff if upper else -puff * 0.4)
    return Vector((x, y, z))


def panel_tint(u: float) -> tuple[float, float, float, float]:
    s = abs(u)
    if s > 0.94:
        return (0.58, 0.02, 0.06, 1.0)
    if s > 0.88:
        return (0.72, 0.035, 0.09, 1.0)
    return (0.84, 0.05, 0.12, 1.0)


def make_nylon(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (720, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (280, 0)
    set_input(bsdf, "Base Color", color)
    set_input(bsdf, "Roughness", 0.46)
    set_input(bsdf, "Metallic", 0.02)
    set_input(bsdf, "Specular IOR Level", 0.36)
    set_input(bsdf, "Sheen Weight", 0.42)
    set_input(bsdf, "Sheen Roughness", 0.38)
    set_input(bsdf, "Sheen Tint", (color[0] * 0.9 + 0.1, color[1] * 0.6, color[2] * 0.5, 1.0))
    set_input(bsdf, "Subsurface Weight", 0.10)
    set_input(bsdf, "Subsurface Radius", (0.7, 0.18, 0.12))
    set_input(bsdf, "Subsurface Scale", 0.03)
    set_input(bsdf, "Transmission Weight", 0.06)
    set_input(bsdf, "IOR", 1.46)
    set_input(bsdf, "Alpha", 1.0)
    col = nt.nodes.new("ShaderNodeRGB")
    col.location = (-200, 180)
    col.outputs[0].default_value = color

    # Prefer Terlenka (fine polyester) over the checkered towel maps.
    diff_path = TEX / "terlenka_diff_1k.jpg"
    nor_path = TEX / "terlenka_nor_gl_1k.jpg"
    rough_path = TEX / "terlenka_rough_1k.jpg"
    ao_path = TEX / "terlenka_ao_1k.jpg"
    if not nor_path.exists():
        nor_path = TEX / "fabric_pattern_07_nor_gl_1k.jpg"
        rough_path = TEX / "fabric_pattern_07_rough_1k.jpg"
        ao_path = TEX / "fabric_pattern_07_ao_1k.jpg"

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-860, 40)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-660, 40)
    # Fine polyester weave, not a picnic check.
    mapping.inputs["Scale"].default_value = (18.0, 8.0, 1.0)
    nt.links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    def img_node(path: Path, loc, noncolor=False):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.location = loc
        if path.exists():
            n.image = bpy.data.images.load(str(path), check_existing=True)
            if noncolor:
                n.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    # Keep panel paint as the albedo. Weave maps only add grain, not a printed pattern.
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_path.exists():
        rough = img_node(rough_path, (-420, -40), noncolor=True)
        rmix = nt.nodes.new("ShaderNodeMix")
        rmix.data_type = "FLOAT"
        rmix.location = (40, -40)
        rmix.inputs["A"].default_value = 0.46
        rmix.inputs["Factor"].default_value = 0.45
        nt.links.new(rough.outputs["Color"], rmix.inputs["B"])
        nt.links.new(rmix.outputs["Result"], bsdf.inputs["Roughness"])

    if nor_path.exists():
        nor = img_node(nor_path, (-420, -260), noncolor=True)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.location = (40, -260)
        nmap.inputs["Strength"].default_value = 0.28
        nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if ao_path.exists():
        ao = img_node(ao_path, (-420, -460), noncolor=True)
        mult = nt.nodes.new("ShaderNodeMix")
        mult.data_type = "RGBA"
        mult.blend_type = "MULTIPLY"
        mult.location = (160, 160)
        mult.inputs["Factor"].default_value = 0.18
        nt.links.new(col.outputs["Color"], mult.inputs["A"])
        nt.links.new(ao.outputs["Color"], mult.inputs["B"])
        nt.links.new(mult.outputs["Result"], bsdf.inputs["Base Color"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_interior_mat() -> bpy.types.Material:
    mat = bpy.data.materials.new("CellInterior")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.55, 0.12, 0.14, 1.0)
        set_input(bsdf, "Roughness", 0.72)
        set_input(bsdf, "Metallic", 0.0)
        set_input(bsdf, "Sheen Weight", 0.1)
    return mat


def build_canopy() -> bpy.types.Object:
    log("lofting ram-air canopy (open intakes, 20 visual cells, Rush 6 MS planform)")
    span_segs = CELLS
    cols = span_segs + 1
    rows_top = CHORD_SEGS + 1
    # bottom starts at INTAKE_V so the LE is an open mouth
    intake_row = max(2, int(round(INTAKE_V * CHORD_SEGS)))
    rows_bot = CHORD_SEGS - intake_row + 1

    us = [2.0 * i / span_segs - 1.0 for i in range(cols)]
    vs_top = [i / CHORD_SEGS for i in range(rows_top)]
    vs_bot = [intake_row / CHORD_SEGS + i / CHORD_SEGS for i in range(rows_bot)]
    # clamp last to 1
    vs_bot[-1] = 1.0
    vs_top[-1] = 1.0

    bm = bmesh.new()
    top: list[list[bmesh.types.BMVert]] = []
    bot: list[list[bmesh.types.BMVert]] = []

    def grid(vs, upper):
        rows = []
        for v in vs:
            row = []
            for u in us:
                row.append(bm.verts.new(airfoil_point(u, v, upper)))
            rows.append(row)
        return rows

    top = grid(vs_top, True)
    bot = grid(vs_bot, False)
    bm.verts.ensure_lookup_table()

    def quad(a, b, c, d):
        try:
            bm.faces.new((a, b, c, d))
        except ValueError:
            pass

    # upper sail
    for j in range(len(top) - 1):
        for i in range(cols - 1):
            quad(top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i])
    # lower sail (winding flipped so normals point down/out)
    for j in range(len(bot) - 1):
        for i in range(cols - 1):
            quad(bot[j][i], bot[j + 1][i], bot[j + 1][i + 1], bot[j][i + 1])
    # trailing-edge seam
    for i in range(cols - 1):
        quad(top[-1][i], top[-1][i + 1], bot[-1][i + 1], bot[-1][i])

    # cell ribs (every cell wall) — closed airfoil including the intake lip
    for i in range(cols):
        # stitch top-to-bottom along this station from intake aft
        for j in range(len(bot) - 1):
            # find matching top row: bot v starts at intake_row
            tj = j + intake_row
            if tj + 1 >= len(top):
                break
            quad(top[tj][i], bot[j][i], bot[j + 1][i], top[tj + 1][i])
        # closed LE on the two ear cells
        ear = i <= 1 or i >= cols - 2
        if ear:
            # fill LE from top[0] down around to bot[0]
            le_pts = [top[k][i] for k in range(intake_row + 1)]
            # add a mid-thickness nose vertex
            u = us[i]
            nose = bm.verts.new(airfoil_point(u, 0.0, True) + Vector((0.0, 0.01, -0.01)))
            for k in range(len(le_pts) - 1):
                try:
                    bm.faces.new((nose, le_pts[k], le_pts[k + 1]))
                except ValueError:
                    pass
            try:
                bm.faces.new((nose, le_pts[-1], bot[0][i]))
            except ValueError:
                pass

    # intake lips: hem around each open cell mouth
    for i in range(1, cols - 2):
        # mouth: top LE (row 0..intake) to bottom start
        a = top[0][i]
        b = top[0][i + 1]
        c = top[intake_row][i + 1]
        d = top[intake_row][i]
        e = bot[0][i + 1]
        f = bot[0][i]
        # upper lip (LE roll)
        for k in range(intake_row):
            quad(top[k][i], top[k][i + 1], top[k + 1][i + 1], top[k + 1][i])
        # vertical mouth sides already handled by ribs; add the lower lip
        quad(d, c, e, f)

    # wingtip stabilizer fins
    for sign in (-1.0, 1.0):
        u = 0.97 * sign
        root = airfoil_point(u, 0.35, True)
        tip = root + Vector((0.08 * sign, -0.05, -0.28))
        le = airfoil_point(u, 0.08, True) + Vector((0.04 * sign, 0.0, -0.04))
        te = airfoil_point(u, 0.72, True) + Vector((0.04 * sign, 0.0, -0.06))
        vr, vt, vl, ve = (bm.verts.new(p) for p in (root, tip, le, te))
        try:
            bm.faces.new((vr, vl, vt))
            bm.faces.new((vr, vt, ve))
            bm.faces.new((vl, ve, vt))
        except ValueError:
            pass

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # drop degenerate
    degenerates = [f for f in bm.faces if f.calc_area() < 1e-8]
    if degenerates:
        bmesh.ops.delete(bm, geom=degenerates, context="FACES")

    # UVs + material index by span
    uv_layer = bm.loops.layers.uv.new("UVMap")
    color_layer = bm.loops.layers.color.new("Col")
    for face in bm.faces:
        xs = [v.co.x for v in face.verts]
        u_mid = (sum(xs) / len(xs)) / (SPAN * 0.5)
        tint = panel_tint(max(-1.0, min(1.0, u_mid)))
        if abs(u_mid) > 0.82:
            face.material_index = 0
        elif abs(u_mid) > 0.48:
            face.material_index = 1
        else:
            face.material_index = 2
        for loop in face.loops:
            co = loop.vert.co
            u = (co.x / SPAN) + 0.5
            v = (0.5 - co.y / (CHORD * 1.2))
            loop[uv_layer].uv = (u, v)
            loop[color_layer] = tint

    mesh = bpy.data.meshes.new("CanopyMesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = ensure_object("Canopy", mesh)
    obj.data.materials.append(make_nylon("NylonNavy", NAVY))
    obj.data.materials.append(make_nylon("NylonAmber", AMBER))
    obj.data.materials.append(make_nylon("NylonCrimson", CRIMSON))
    shade_smooth(obj)
    add_rib_tapes(obj, us)
    log(f"  canopy verts={len(obj.data.vertices)} faces={len(obj.data.polygons)}")
    return obj


def add_rib_tapes(canopy: bpy.types.Object, us: list[float]) -> None:
    """Raised seam tapes along each cell wall so the ram-air cells read in-game."""
    tape_mat = make_nylon("NylonTape", (0.93, 0.93, 0.95, 1.0))
    bm = bmesh.new()
    half_w = 0.018
    for u in us:
        pts = [airfoil_point(u, v, True) for v in (0.02, 0.18, 0.38, 0.58, 0.78, 0.97)]
        for a, b in zip(pts, pts[1:]):
            tangent = (b - a)
            if tangent.length < 1e-5:
                continue
            tangent.normalize()
            side = Vector((1.0, 0.0, 0.0))
            up = tangent.cross(side)
            if up.length < 1e-5:
                up = Vector((0.0, 0.0, 1.0))
            else:
                up.normalize()
            nrm = up * 0.012
            lat = side * half_w
            v0 = bm.verts.new(a + nrm - lat)
            v1 = bm.verts.new(a + nrm + lat)
            v2 = bm.verts.new(b + nrm + lat)
            v3 = bm.verts.new(b + nrm - lat)
            try:
                bm.faces.new((v0, v1, v2, v3))
            except ValueError:
                pass
    if not bm.faces:
        bm.free()
        return
    mesh = bpy.data.meshes.new("RibTapesMesh")
    bm.to_mesh(mesh)
    bm.free()
    tape = ensure_object("RibTapes", mesh)
    tape.data.materials.append(tape_mat)
    tape.parent = canopy
    shade_smooth(tape)


def build_cascade_lines() -> bpy.types.Object:
    log("A/B/C/D cascade lines (A shortest / D longest, game hang height)")
    curve = bpy.data.curves.new("CascadeLines", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.0055
    curve.bevel_resolution = 1
    obj = ensure_object("CascadeLines", curve)

    # chord stations A B C D (fraction of chord from LE)
    stations = (("A", 0.16, -0.04), ("B", 0.38, 0.02), ("C", 0.62, 0.10), ("D", 0.82, 0.20))
    span_u = (-0.86, -0.70, -0.52, -0.34, -0.16, 0.16, 0.34, 0.52, 0.70, 0.86)
    # Cascades meet under the sail, then drop to the carabiners.
    gather_l = Vector((-0.48, 0.08, -0.85))
    gather_r = Vector((0.48, 0.08, -0.85))

    def add_seg(a: Vector, b: Vector) -> None:
        spl = curve.splines.new("POLY")
        spl.points.add(1)
        spl.points[0].co = (a.x, a.y, a.z, 1.0)
        spl.points[1].co = (b.x, b.y, b.z, 1.0)

    for u in span_u:
        side_l = u < 0
        mid = gather_l if side_l else gather_r
        end = RISER_L if side_l else RISER_R
        for name, v, extra in stations:
            src = airfoil_point(u, v, False)
            src.z -= 0.01
            # D lines a touch longer (more slack / higher AoA trim)
            mid_adj = mid + Vector((0.0, 0.0, extra * 0.15))
            add_seg(src, mid_adj)
            add_seg(mid_adj, end)

    # brake lines to trailing edge (thinner visual via same curve)
    for u in (-0.72, -0.40, -0.18, 0.18, 0.40, 0.72):
        src = airfoil_point(u, 0.97, False)
        end = RISER_L if u < 0 else RISER_R
        pulley = end + Vector((0.04 * (1 if u > 0 else -1), -0.08, 0.12))
        add_seg(src, pulley)
        add_seg(pulley, end)

    # stabilo
    for u in (-0.97, 0.97):
        src = airfoil_point(u, 0.45, False)
        end = RISER_L if u < 0 else RISER_R
        add_seg(src, end)

    mat = bpy.data.materials.new("DyneemaLine")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.05, 0.05, 0.055, 1.0)
        set_input(bsdf, "Roughness", 0.38)
        set_input(bsdf, "Metallic", 0.04)
    obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------------------
# Seated pod-harness pilot (game-scale, anatomical)
# ---------------------------------------------------------------------------

def principled(name: str, color, rough=0.55, metal=0.04, spec=0.4) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
        set_input(bsdf, "Roughness", rough)
        set_input(bsdf, "Metallic", metal)
        set_input(bsdf, "Specular IOR Level", spec)
    return mat


def add_mesh(name: str, verts, faces, mat, parent=None, loc=(0, 0, 0)) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = ensure_object(name, mesh)
    obj.location = loc
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    shade_smooth(obj)
    return obj


def icosphere(radius: float, subdivisions: int = 2) -> tuple[list[Vector], list[tuple]]:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bm.verts.ensure_lookup_table()
    verts = [v.co.copy() for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def uv_sphere(radius: float, segs=12, rings=8) -> tuple[list[Vector], list[tuple]]:
    verts: list[Vector] = []
    faces: list[tuple] = []
    for j in range(rings + 1):
        v = j / rings
        phi = v * math.pi
        for i in range(segs):
            u = i / segs
            th = u * math.pi * 2
            x = radius * math.sin(phi) * math.cos(th)
            y = radius * math.sin(phi) * math.sin(th)
            z = radius * math.cos(phi)
            verts.append(Vector((x, y, z)))
    def idx(i, j):
        return j * segs + (i % segs)
    for j in range(rings):
        for i in range(segs):
            a, b = idx(i, j), idx(i + 1, j)
            c, d = idx(i + 1, j + 1), idx(i, j + 1)
            faces.append((a, b, c, d))
    return verts, faces


def capsule_verts(radius: float, length: float, segs=8, rings=6) -> tuple[list[Vector], list[tuple]]:
    """Capsule along +Z, centered."""
    verts, faces = uv_sphere(radius, segs, rings)
    half = length * 0.5
    out = []
    for v in verts:
        z = v.z
        if z > 0:
            out.append(Vector((v.x, v.y, z + half)))
        else:
            out.append(Vector((v.x, v.y, z - half)))
    return out, faces


def transform_verts(verts: list[Vector], loc=Vector((0, 0, 0)), scale=Vector((1, 1, 1)), rot=None) -> list[Vector]:
    out = []
    for v in verts:
        q = Vector((v.x * scale.x, v.y * scale.y, v.z * scale.z))
        if rot:
            q.rotate(rot)
        out.append(q + loc)
    return out


def build_pilot() -> bpy.types.Object:
    log("building seated pod-harness pilot (reclined EN-B posture)")
    skin = principled("Skin", (0.78, 0.52, 0.36), rough=0.52)
    jacket = principled("Jacket", (0.14, 0.18, 0.24), rough=0.58, metal=0.08)
    pants = principled("Pants", (0.09, 0.10, 0.12), rough=0.66)
    carbon = principled("Carbon", (0.06, 0.07, 0.08), rough=0.30, metal=0.34)
    helmet_m = principled("Helmet", (0.08, 0.10, 0.13), rough=0.22, metal=0.38)
    visor_m = principled("Visor", (0.03, 0.06, 0.09), rough=0.08, metal=0.92, spec=0.9)
    boot_m = principled("Boot", (0.07, 0.07, 0.07), rough=0.4, metal=0.12)
    webbing = principled("Webbing", (0.12, 0.08, 0.05), rough=0.55, metal=0.02)
    metal = principled("Maillon", (0.72, 0.74, 0.76), rough=0.22, metal=0.88)
    toggle_m = principled("Toggle", (0.82, 0.12, 0.08), rough=0.35)

    root = new_empty("Pilot", Vector((0, 0, 0)))

    # --- Open Seated Harness (Anatomical Bucket Seat) ---
    # Curved lower seat bucket & back protector
    hv_v, hv_f = uv_sphere(0.32, 14, 10)
    hv_v = transform_verts(hv_v, loc=Vector((0.0, 0.04, 0.08)), scale=Vector((0.78, 0.88, 0.72)))
    add_mesh("HarnessBucket", hv_v, hv_f, carbon, parent=root)

    kf = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]

    # Seat bottom support
    sx, sy, sz = 0.19, 0.20, 0.03
    sv = [
        Vector((-sx, -sy, -sz)), Vector((sx, -sy, -sz)), Vector((sx, sy, -sz)), Vector((-sx, sy, -sz)),
        Vector((-sx, -sy, sz)), Vector((sx, -sy, sz)), Vector((sx, sy, sz)), Vector((-sx, sy, sz)),
    ]
    add_mesh("SeatPlate", transform_verts(sv, loc=Vector((0.0, 0.12, -0.02))), kf, carbon, parent=root)

    # --- Torso Rig (Seated Posture) ---
    torso = new_empty("Torso", Vector((0.0, 0.02, 0.18)), parent=root)
    torso.rotation_euler = Euler((math.radians(22), 0.0, 0.0), "XYZ")

    cv, cf = capsule_verts(0.15, 0.24, 10, 6)
    cv = transform_verts(cv, loc=Vector((0.0, 0.02, 0.18)), scale=Vector((1.18, 0.76, 1.0)))
    add_mesh("Chest", cv, cf, jacket, parent=torso)

    av, af = capsule_verts(0.13, 0.14, 8, 5)
    av = transform_verts(av, loc=Vector((0.0, 0.0, 0.02)), scale=Vector((1.08, 0.82, 1.0)))
    add_mesh("Abdomen", av, af, jacket, parent=torso)

    # Chest webbing strap with buckle
    strap_v, strap_f = uv_sphere(0.02, 8, 4)
    strap_v = transform_verts(strap_v, loc=Vector((0.0, 0.04, 0.18)), scale=Vector((8.4, 1.1, 1.2)))
    add_mesh("ChestStrap", strap_v, strap_f, webbing, parent=torso)

    # Head & Helmet
    head = new_empty("HeadShell", Vector((0.0, 0.04, 0.44)), parent=torso)
    nv, nf = capsule_verts(0.035, 0.04, 8, 4)
    add_mesh("Neck", transform_verts(nv, loc=Vector((0.0, 0.0, -0.04))), nf, skin, parent=head)
    hv, hf = uv_sphere(0.13, 14, 10)
    hv = transform_verts(hv, loc=Vector((0.0, 0.01, 0.06)), scale=Vector((1.02, 1.12, 1.10)))
    add_mesh("Helmet", hv, hf, helmet_m, parent=head)

    # Visor
    vv, vf = uv_sphere(0.115, 14, 8)
    vv = transform_verts(vv, loc=Vector((0.0, 0.045, 0.055)), scale=Vector((0.94, 0.55, 0.70)))
    add_mesh("Visor", vv, vf, visor_m, parent=head)

    fv, ff = uv_sphere(0.055, 8, 6)
    add_mesh("Face", transform_verts(fv, loc=Vector((0.0, 0.05, 0.02))), ff, skin, parent=head)
    eye = new_empty("Eye", Vector((0.0, 0.13, 0.05)), parent=head)

    # Arms holding brake toggles up near ear/riser height (as shown in reference photo)
    def make_arm(side: float, name: str) -> bpy.types.Object:
        arm = new_empty(name, Vector((side * 0.18, 0.02, 0.32)), parent=torso)
        # Reached upwards toward brake line pulleys
        arm.rotation_euler = Euler((math.radians(35), 0.0, math.radians(side * 28)), "XYZ")
        uv, uf = capsule_verts(0.04, 0.19, 7, 5)
        add_mesh(f"{name}_Upper", transform_verts(uv, loc=Vector((0.0, 0.08, 0.10))), uf, jacket, parent=arm)
        lv, lf = capsule_verts(0.034, 0.18, 7, 5)
        add_mesh(f"{name}_Lower", transform_verts(lv, loc=Vector((0.0, 0.18, 0.26))), lf, jacket, parent=arm)
        hv, hf = uv_sphere(0.036, 8, 6)
        hand = add_mesh(f"{name}_Hand", transform_verts(hv, loc=Vector((0.0, 0.24, 0.38))), hf, skin, parent=arm)
        # Red brake toggle
        tv, tf = uv_sphere(0.022, 8, 6)
        tv = transform_verts(tv, loc=Vector((0.0, 0.0, 0.0)), scale=Vector((1.8, 0.55, 1.8)))
        add_mesh(f"{name}_Toggle", tv, tf, toggle_m, parent=hand)
        return arm

    make_arm(-1.0, "LeftArm")
    make_arm(1.0, "RightArm")

    # --- Seated Legs (Thighs forward, knees bent ~60°, boots dangling in open air) ---
    for side, tag in ((-1.0, "L"), (1.0, "R")):
        # Thigh extending forward from seat plate
        tv, tf = capsule_verts(0.056, 0.28, 8, 5)
        tv = transform_verts(
            tv,
            loc=Vector((side * 0.11, 0.24, 0.02)),
            scale=Vector((1.0, 1.0, 1.0)),
            rot=Euler((math.radians(32), 0.0, math.radians(side * 5)), "XYZ"),
        )
        add_mesh(f"Thigh_{tag}", tv, tf, pants, parent=root)

        # Leg harness strap around thigh
        lsv, lsf = uv_sphere(0.06, 8, 4)
        lsv = transform_verts(lsv, loc=Vector((side * 0.11, 0.20, 0.02)), scale=Vector((1.05, 0.4, 1.05)))
        add_mesh(f"LegStrap_{tag}", lsv, lsf, webbing, parent=root)

        # Shin hanging downward with natural knee bend
        sv, sf = capsule_verts(0.046, 0.26, 8, 5)
        sv = transform_verts(
            sv,
            loc=Vector((side * 0.11, 0.38, -0.22)),
            scale=Vector((1.0, 1.0, 1.0)),
            rot=Euler((math.radians(-62), 0.0, math.radians(side * 3)), "XYZ"),
        )
        add_mesh(f"Shin_{tag}", sv, sf, pants, parent=root)

        # Boots at feet dangling freely
        bx, by, bz = 0.046, 0.11, 0.042
        bv = [
            Vector((-bx, -by, -bz)), Vector((bx, -by, -bz)), Vector((bx, by, -bz)), Vector((-bx, by, -bz)),
            Vector((-bx, -by, bz)), Vector((bx, -by, bz)), Vector((bx, by, bz)), Vector((-bx, by, bz)),
        ]
        add_mesh(
            f"Boot_{tag}",
            transform_verts(bv, loc=Vector((side * 0.11, 0.46, -0.42)), rot=Euler((math.radians(12), 0.0, 0.0), "XYZ")),
            kf,
            boot_m,
            parent=root,
        )

    # risers + carabiners
    left_r = new_empty("LeftRiser", RISER_L.copy(), parent=root)
    right_r = new_empty("RightRiser", RISER_R.copy(), parent=root)

    def carabiner(parent, name):
        verts: list[Vector] = []
        faces: list[tuple] = []
        major, minor, major_n, minor_n = 0.028, 0.006, 14, 6
        for i in range(major_n):
            a = (i / major_n) * math.pi * 2
            cx, cy = math.cos(a) * major, math.sin(a) * major
            for j in range(minor_n):
                b = (j / minor_n) * math.pi * 2
                px = (major + math.cos(b) * minor) * math.cos(a)
                py = (major + math.cos(b) * minor) * math.sin(a)
                pz = math.sin(b) * minor
                verts.append(Vector((px, py, pz)))
        for i in range(major_n):
            for j in range(minor_n):
                a = i * minor_n + j
                b = i * minor_n + (j + 1) % minor_n
                c = ((i + 1) % major_n) * minor_n + (j + 1) % minor_n
                d = ((i + 1) % major_n) * minor_n + j
                faces.append((a, b, c, d))
        obj = add_mesh(name, verts, faces, metal, parent=parent)
        obj.rotation_euler = Euler((math.radians(90), 0.0, 0.0), "XYZ")
        return obj

    carabiner(left_r, "Carabiner_L")
    carabiner(right_r, "Carabiner_R")

    # riser webbing strips from harness to carabiners
    for side, parent in ((-1.0, left_r), (1.0, right_r)):
        wv, wf = capsule_verts(0.01, 0.28, 6, 4)
        add_mesh(
            f"RiserWeb_{'L' if side < 0 else 'R'}",
            transform_verts(wv, loc=Vector((0.0, 0.0, -0.16))),
            wf,
            webbing,
            parent=parent,
        )

    # mark eye so glTF keeps the empty
    eye.empty_display_type = "SPHERE"
    eye.empty_display_size = 0.03
    log("  pilot hierarchy ready")
    return root


def select_hierarchy(obj: bpy.types.Object) -> list[bpy.types.Object]:
    out = [obj]
    for child in obj.children:
        out.extend(select_hierarchy(child))
    return out


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    active = None
    for obj in objects:
        try:
            obj.select_set(True)
            active = obj
        except Exception:
            pass
    if active:
        bpy.context.view_layer.objects.active = active
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_nla_strips=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    log(f"exported {path} ({path.stat().st_size} bytes)")


def export_fbx(path: Path, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        try:
            obj.select_set(True)
        except Exception:
            pass
    try:
        bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, apply_scale_options="FBX_SCALE_ALL")
        log(f"exported {path}")
    except Exception as exc:
        log(f"fbx skipped: {exc}")


def main() -> int:
    try:
        reset_scene()
        canopy = build_canopy()
        lines = build_cascade_lines()
        lines.parent = canopy
        pilot = build_pilot()

        OUT.mkdir(parents=True, exist_ok=True)
        (ROOT / "blender").mkdir(parents=True, exist_ok=True)

        # Game parents the canopy at hang height; keep the engine file at the origin.
        export_glb(OUT / "canopy.glb", [canopy, *canopy.children])
        export_glb(OUT / "pilot.glb", select_hierarchy(pilot))
        canopy.location.z = CANOPY_Y
        export_glb(OUT / "paraglider.glb", [canopy, *canopy.children, *select_hierarchy(pilot)])
        canopy.location.z = 0.0
        export_fbx(OUT / "canopy.fbx", [canopy])

        # keep a studio .blend for iteration
        try:
            bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
            log(f"saved {BLEND}")
        except Exception as exc:
            log(f"blend save skipped: {exc}")

        # report bounds so we can sanity-check orientation
        for obj in (canopy,):
            bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
            xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in bb])
            log(
                f"  {obj.name} bounds X[{min(xs):.2f},{max(xs):.2f}] "
                f"Y[{min(ys):.2f},{max(ys):.2f}] Z[{min(zs):.2f},{max(zs):.2f}]"
            )
        log("done")
        return 0
    except Exception:
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
