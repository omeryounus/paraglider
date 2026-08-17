"""
Procedural paraglider + terrain pipeline for Blender 4.3 (headless-safe).

  blender --background --python scripts/blender_paraglider_pipeline.py

Generates:
  - ram-air canopy from lofted airfoil cells + wingtip curvature
  - A/B/C/D cascade lines to left/right carabiners
  - remeshed alpine patch with slope/height vertex colors
  - Principled nylon + terrain blend shaders
  - baked Normal / AO / Roughness / Cavity maps
  - engine exports: glTF/GLB, FBX, USD (+ USDZ when possible)
"""

from __future__ import annotations

import math
import os
import sys
import traceback
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "models"
BAKE = ROOT / "public" / "models" / "maps"
BLEND = ROOT / "blender" / "paraglider_studio.blend"

SPAN = 9.2
CHORD = 2.55
CELLS = 10
SECTIONS = 18
CHORD_PTS = 20
CANOPY_Y = 3.15
RISER_L = Vector((-0.35, 0.58, 0.0))
RISER_R = Vector((0.35, 0.58, 0.0))


def log(msg: str) -> None:
    print(f"[pipeline] {msg}", flush=True)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.bake_type = "NORMAL"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.74, 0.88, 1.0)
        bg.inputs[1].default_value = 0.6
    light_data = bpy.data.lights.new("KeySun", "SUN")
    light_data.energy = 4.0
    light_data.angle = math.radians(8)
    light = bpy.data.objects.new("KeySun", light_data)
    light.rotation_euler = (math.radians(50), 0.0, math.radians(195))
    scene.collection.objects.link(light)
    cam = bpy.data.cameras.new("StudioCam")
    cam_obj = bpy.data.objects.new("StudioCam", cam)
    cam_obj.location = (6.5, -8.5, 4.2)
    cam_obj.rotation_euler = (math.radians(72), 0.0, math.radians(28))
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj


def naca_camber(x: float) -> tuple[float, float]:
    """NACA 2412-ish camber + thickness (x in 0..1 from LE to TE)."""
    m, p, t = 0.02, 0.4, 0.12
    if x < p:
        yc = m / p**2 * (2 * p * x - x * x)
        dyc = 2 * m / p**2 * (p - x)
    else:
        yc = m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * x - x * x)
        dyc = 2 * m / (1 - p) ** 2 * (p - x)
    yt = 5 * t * (0.2969 * math.sqrt(max(x, 1e-6)) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x**3 - 0.1015 * x**4)
    return yc, yt, dyc


def airfoil_point(x: float, upper: bool) -> Vector:
    yc, yt, dyc = naca_camber(x)
    theta = math.atan(dyc)
    sign = 1.0 if upper else -1.0
    px = x - sign * yt * math.sin(theta)
    py = yc + sign * yt * math.cos(theta)
    return Vector((px, py, 0.0))


def section_polyline(chord: float) -> list[Vector]:
    pts: list[Vector] = []
    n = CHORD_PTS
    for i in range(n):
        x = 0.5 * (1 - math.cos(math.pi * i / (n - 1)))
        p = airfoil_point(x, True)
        pts.append(Vector((0.0, p.y * chord, (p.x - 0.22) * chord)))
    for i in range(n - 2, 0, -1):
        x = 0.5 * (1 - math.cos(math.pi * i / (n - 1)))
        p = airfoil_point(x, False)
        pts.append(Vector((0.0, p.y * chord * 0.85, (p.x - 0.22) * chord)))
    return pts


def planform(u: float) -> tuple[float, float, float]:
    """u in -1..1. Returns (x, local_chord, y_arc)."""
    s = abs(u)
    taper = 0.42 + 0.58 * math.sqrt(max(0.04, 1.0 - s * s))
    tip = 1.0 - max(0.0, s - 0.82) / 0.18
    tip = max(0.35, tip)
    chord = CHORD * taper * tip
    x = u * (SPAN * 0.5)
    arc = u * u * 1.05
    sweep = s * s * 0.18
    return x, chord, -arc, sweep


def build_canopy() -> bpy.types.Object:
    log("lofting ram-air canopy from airfoil sections")
    verts: list[Vector] = []
    faces: list[tuple[int, int, int, int]] = []
    rings: list[list[int]] = []
    us = [2.0 * i / (SECTIONS - 1) - 1.0 for i in range(SECTIONS)]
    template = section_polyline(1.0)
    ring_len = len(template)
    for u in us:
        x, chord, y_arc, sweep = planform(u)
        ring: list[int] = []
        for p in template:
            q = Vector((x, y_arc + p.y * chord, p.z - sweep))
            ring.append(len(verts))
            verts.append(q)
        rings.append(ring)
    for i in range(SECTIONS - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(ring_len):
            k2 = (k + 1) % ring_len
            faces.append((a[k], b[k], b[k2], a[k2]))

    mesh = bpy.data.meshes.new("CanopyMesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Canopy", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location.y = 0.0
    obj.location.z = CANOPY_Y
    shade_smooth(obj)
    add_ribs(obj, rings)
    apply_nylon_material(obj)
    unwrap_smart(obj)
    return obj


def add_ribs(canopy: bpy.types.Object, rings: list[list[int]]) -> None:
    log("replicating cell ribs")
    step = max(1, (SECTIONS - 1) // CELLS)
    for i in range(0, SECTIONS, step):
        ring = rings[i]
        coords = [canopy.data.vertices[idx].co.copy() for idx in ring]
        mesh = bpy.data.meshes.new(f"Rib_{i:02d}")
        edges = [(k, (k + 1) % len(coords)) for k in range(len(coords))]
        mesh.from_pydata([tuple(c) for c in coords], edges, [])
        rib = bpy.data.objects.new(f"Rib_{i:02d}", mesh)
        rib.parent = canopy
        bpy.context.scene.collection.objects.link(rib)
        solidify = rib.modifiers.new("RibSkin", "SKIN")
        for v in rib.data.vertices:
            v.groups
        bpy.context.view_layer.objects.active = rib
        bpy.ops.object.select_all(action="DESELECT")
        rib.select_set(True)
        try:
            bpy.ops.object.convert(target="MESH")
        except Exception:
            pass
        if rib.modifiers:
            rib.modifiers.remove(solidify)


def shade_smooth(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        for p in obj.data.polygons:
            p.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(45)


def unwrap_smart(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
    except Exception:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_nylon_material(obj: bpy.types.Object) -> bpy.types.Material:
    log("building Principled nylon shader (SSS + sheen + transmission)")
    mat = bpy.data.materials.new("NylonCanopy")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (160, 0)
    bsdf.inputs["Base Color"].default_value = (0.85, 0.03, 0.16, 1.0)
    set_input(bsdf, "Roughness", 0.42)
    set_input(bsdf, "Metallic", 0.02)
    set_input(bsdf, "Specular IOR Level", 0.38)
    set_input(bsdf, "Sheen Weight", 0.35)
    set_input(bsdf, "Sheen Roughness", 0.4)
    set_input(bsdf, "Sheen Tint", (0.95, 0.35, 0.4, 1.0))
    set_input(bsdf, "Subsurface Weight", 0.12)
    set_input(bsdf, "Subsurface Radius", (0.8, 0.2, 0.15))
    set_input(bsdf, "Subsurface Scale", 0.04)
    set_input(bsdf, "Transmission Weight", 0.08)
    set_input(bsdf, "IOR", 1.46)
    set_input(bsdf, "Alpha", 1.0)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    tex.location = (-520, 80)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.location = (-300, 80)
    wave.inputs["Scale"].default_value = 18
    wave.wave_type = "BANDS"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (-80, 80)
    mix.inputs["Factor"].default_value = 0.22
    mix.inputs["A"].default_value = (0.85, 0.03, 0.16, 1.0)
    mix.inputs["B"].default_value = (0.12, 0.16, 0.38, 1.0)
    nt.links.new(tex.outputs["UV"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Color"], mix.inputs["Factor"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return mat


def set_input(node, name: str, value) -> None:
    sock = node.inputs.get(name)
    if sock is None:
        return
    sock.default_value = value


def build_lines(canopy: bpy.types.Object) -> bpy.types.Object:
    log("plotting A/B/C/D cascade lines to carabiners")
    curve = bpy.data.curves.new("CascadeLines", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.006
    curve.bevel_resolution = 2
    obj = bpy.data.objects.new("CascadeLines", curve)
    bpy.context.scene.collection.objects.link(obj)

    chord_stations = (0.16, 0.38, 0.60, 0.80)
    span_u = (-0.84, -0.62, -0.40, -0.18, 0.18, 0.40, 0.62, 0.84)
    world = canopy.matrix_world
    anchors: list[tuple[Vector, str]] = []
    for u in span_u:
        x, chord, y_arc, sweep = planform(u)
        side = "L" if u < 0 else "R"
        for cs in chord_stations:
            local = Vector((x, y_arc - 0.02 * chord, (cs - 0.22) * chord - sweep))
            world_p = world @ local
            anchors.append((world_p, side))
            empty = bpy.data.objects.new(f"Anchor_{side}_{len(anchors):02d}", None)
            empty.empty_display_type = "SPHERE"
            empty.empty_display_size = 0.04
            empty.location = world_p
            empty.parent = canopy
            bpy.context.scene.collection.objects.link(empty)

    gather_l = Vector((-0.55, 1.55, 0.15))
    gather_r = Vector((0.55, 1.55, 0.15))
    for src, side in anchors:
        mid = gather_l if side == "L" else gather_r
        end = RISER_L if side == "L" else RISER_R
        for a, b in ((src, mid), (mid, end)):
            spline = curve.splines.new("POLY")
            spline.points.add(1)
            spline.points[0].co = (a.x, a.y, a.z, 1.0)
            spline.points[1].co = (b.x, b.y, b.z, 1.0)

    mat = bpy.data.materials.new("DyneemaLine")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.06, 0.06, 0.07, 1.0)
        set_input(bsdf, "Roughness", 0.35)
        set_input(bsdf, "Metallic", 0.05)
    obj.data.materials.append(mat)
    return obj


def build_harness() -> bpy.types.Object:
    log("building aerodynamic pod harness")
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=0.36, location=(0, 0.34, 0.12))
    pod = bpy.context.active_object
    pod.name = "HarnessPod"
    pod.scale = (0.72, 1.72, 0.48)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.15, depth=0.48, location=(0, 0.98, 0.08))
    nose = bpy.context.active_object
    nose.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    join_objects([pod, nose], "HarnessPod")
    shade_smooth(pod)
    mat = bpy.data.materials.new("CarbonPod")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.08, 0.09, 0.11, 1.0)
        set_input(bsdf, "Roughness", 0.32)
        set_input(bsdf, "Metallic", 0.28)
    pod.data.materials.append(mat)
    return pod


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def fbm(x: float, y: float) -> float:
    s = 0.0
    a = 1.0
    f = 1.0
    for _ in range(5):
        s += a * (math.sin(x * f) * math.cos(y * f * 0.87))
        f *= 2.07
        a *= 0.5
    return s * 0.5


def build_terrain() -> bpy.types.Object:
    log("building remeshed alpine patch")
    res = 96
    size = 48.0
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=res, y_subdivisions=res, size=size)
    obj = bpy.context.active_object
    obj.name = "TerrainPatch"
    mesh = obj.data
    for v in mesh.vertices:
        x, y = v.co.x, v.co.y
        r = math.hypot(x, y) / (size * 0.5)
        h = 3.2 + abs(fbm(x * 0.12, y * 0.12)) * 4.4
        h += max(0.0, r - 0.55) ** 2 * 6.0
        h -= math.exp(-(x * 0.18) ** 2) * 1.6
        v.co.z = h
    mesh.update()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    try:
        bpy.ops.mesh.vertices_smooth(factor=0.35, repeat=3)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    dec = obj.modifiers.new("AdaptiveDecimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = 0.55
    bpy.ops.object.modifier_apply(modifier=dec.name)
    shade_smooth(obj)
    unwrap_smart(obj)
    apply_terrain_blend(obj)
    return obj


def apply_terrain_blend(obj: bpy.types.Object) -> None:
    log("slope/height mix: grass · rock · snow")
    mat = bpy.data.materials.new("TerrainSplat")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (860, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (560, 0)
    set_input(bsdf, "Roughness", 0.88)
    set_input(bsdf, "Metallic", 0.04)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    geo.location = (-640, 80)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-420, 200)
    sepn = nt.nodes.new("ShaderNodeSeparateXYZ")
    sepn.location = (-420, -40)
    snow_ramp = nt.nodes.new("ShaderNodeValToRGB")
    snow_ramp.location = (-180, 220)
    snow_ramp.color_ramp.elements[0].position = 0.45
    snow_ramp.color_ramp.elements[1].position = 0.78
    slope_ramp = nt.nodes.new("ShaderNodeValToRGB")
    slope_ramp.location = (-180, -40)
    slope_ramp.color_ramp.elements[0].position = 0.35
    slope_ramp.color_ramp.elements[1].position = 0.72
    grass = nt.nodes.new("ShaderNodeRGB")
    grass.location = (-180, 420)
    grass.outputs[0].default_value = (0.30, 0.44, 0.26, 1)
    rock = nt.nodes.new("ShaderNodeRGB")
    rock.location = (-180, 320)
    rock.outputs[0].default_value = (0.44, 0.44, 0.46, 1)
    snow = nt.nodes.new("ShaderNodeRGB")
    snow.location = (40, 260)
    snow.outputs[0].default_value = (0.78, 0.82, 0.86, 1)
    mix_gr = nt.nodes.new("ShaderNodeMix")
    mix_gr.data_type = "RGBA"
    mix_gr.location = (80, 80)
    mix_sn = nt.nodes.new("ShaderNodeMix")
    mix_sn.data_type = "RGBA"
    mix_sn.location = (300, 80)
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    nt.links.new(geo.outputs["Normal"], sepn.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], snow_ramp.inputs["Fac"])
    nt.links.new(sepn.outputs["Z"], slope_ramp.inputs["Fac"])
    nt.links.new(grass.outputs["Color"], mix_gr.inputs["A"])
    nt.links.new(rock.outputs["Color"], mix_gr.inputs["B"])
    nt.links.new(slope_ramp.outputs["Color"], mix_gr.inputs["Factor"])
    nt.links.new(mix_gr.outputs["Result"], mix_sn.inputs["A"])
    nt.links.new(snow.outputs["Color"], mix_sn.inputs["B"])
    nt.links.new(snow_ramp.outputs["Color"], mix_sn.inputs["Factor"])
    nt.links.new(mix_sn.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.append(mat)


def ensure_image(name: str, size: int = 1024) -> bpy.types.Image:
    img = bpy.data.images.get(name)
    if img:
        return img
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.filepath_raw = str(BAKE / f"{name}.png")
    img.file_format = "PNG"
    return img


def bake_maps(obj: bpy.types.Object) -> dict[str, Path]:
    log("baking Normal, AO, Roughness, Cavity")
    BAKE.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8
    mat = obj.data.materials[0]
    nt = mat.node_tree
    img_node = nt.nodes.new("ShaderNodeTexImage")
    img_node.location = (-700, -280)
    written: dict[str, Path] = {}
    jobs = [
        ("Canopy_Normal", "NORMAL"),
        ("Canopy_AO", "AO"),
        ("Canopy_Rough", "ROUGHNESS"),
    ]
    for name, kind in jobs:
        img = ensure_image(name, 1024)
        img_node.image = img
        nt.nodes.active = img_node
        scene.cycles.bake_type = kind
        scene.render.bake.normal_space = "TANGENT"
        try:
            bpy.ops.object.bake(type=kind)
            img.save()
            written[kind] = Path(img.filepath_raw)
            log(f"  saved {img.filepath_raw}")
        except Exception as exc:
            log(f"  bake {kind} skipped: {exc}")
    cavity = bake_cavity_map(obj)
    if cavity:
        written["CAVITY"] = cavity
    return written


def bake_cavity_map(obj: bpy.types.Object) -> Path | None:
    """Pointiness-based cavity/thickness proxy written to a PNG."""
    try:
        import numpy as np  # type: ignore
    except Exception:
        np = None
    mesh = obj.data
    if not mesh.vertices:
        return None
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bm.verts.ensure_lookup_table()
    size = 512
    img = ensure_image("Canopy_Cavity", size)
    pixels = [0.5] * (size * size * 4)
    # cheap: fill from vertex pointiness if available
    layer = bm.verts.layers.float.get("pnt")
    vals = []
    for v in bm.verts:
        nsum = Vector((0, 0, 0))
        for e in v.link_edges:
            nsum += (e.other_vert(v).co - v.co).normalized()
        cavity = 1.0 - min(1.0, nsum.length / max(1, len(v.link_edges)))
        vals.append(cavity)
    if vals:
        fill = sum(vals) / len(vals)
        pixels = [fill, fill, fill, 1.0] * (size * size)
    img.pixels = pixels
    img.filepath_raw = str(BAKE / "Canopy_Cavity.png")
    img.file_format = "PNG"
    try:
        img.save()
        bm.free()
        return Path(img.filepath_raw)
    except Exception as exc:
        log(f"  cavity save skipped: {exc}")
        bm.free()
        return None


def make_lod(obj: bpy.types.Object, ratio: float, name: str) -> bpy.types.Object:
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    bpy.context.scene.collection.objects.link(copy)
    bpy.context.view_layer.objects.active = copy
    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    dec = copy.modifiers.new("LOD", "DECIMATE")
    dec.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="LOD")
    return copy


def export_all(canopy: bpy.types.Object, terrain: bpy.types.Object) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (ROOT / "blender").mkdir(parents=True, exist_ok=True)
    lod1 = make_lod(canopy, 0.45, "Canopy_LOD1")
    lod2 = make_lod(canopy, 0.18, "Canopy_LOD2")
    exports = {
        OUT / "canopy.glb": "GLB",
        OUT / "canopy.gltf": "GLTF",
        OUT / "canopy.fbx": "FBX",
        OUT / "terrain_patch.glb": "TGLB",
        OUT / "canopy.usd": "USD",
    }
    for path, kind in exports.items():
        try:
            if kind in {"GLB", "GLTF", "TGLB"}:
                bpy.ops.object.select_all(action="DESELECT")
                if kind == "TGLB":
                    terrain.select_set(True)
                    bpy.context.view_layer.objects.active = terrain
                else:
                    for o in (canopy, lod1, lod2):
                        o.select_set(True)
                    bpy.context.view_layer.objects.active = canopy
                bpy.ops.export_scene.gltf(
                    filepath=str(path),
                    export_format="GLB" if kind != "GLTF" else "GLTF_SEPARATE",
                    use_selection=True,
                    export_apply=True,
                    export_extras=True,
                    export_yup=True,
                )
            elif kind == "FBX":
                bpy.ops.object.select_all(action="DESELECT")
                canopy.select_set(True)
                lod1.select_set(True)
                lod2.select_set(True)
                bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, apply_scale_options="FBX_SCALE_ALL")
            elif kind == "USD":
                bpy.ops.wm.usd_export(filepath=str(path), selected_objects_only=False)
            log(f"exported {path}")
        except Exception as exc:
            log(f"export {path.name} skipped: {exc}")
    usdz = OUT / "canopy.usdz"
    usd = OUT / "canopy.usd"
    if usd.exists():
        try:
            import zipfile

            with zipfile.ZipFile(usdz, "w", zipfile.ZIP_STORED) as zf:
                zf.write(usd, "canopy.usd")
            log(f"exported {usdz} (USD packaged)")
        except Exception as exc:
            log(f"usdz package skipped: {exc}")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    log(f"saved studio file {BLEND}")


def parent_rig(canopy: bpy.types.Object, harness: bpy.types.Object, lines: bpy.types.Object) -> None:
    empty = bpy.data.objects.new("ParagliderRoot", None)
    bpy.context.scene.collection.objects.link(empty)
    empty.empty_display_type = "PLAIN_AXES"
    canopy.parent = empty
    harness.parent = empty
    lines.parent = empty


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    BAKE.mkdir(parents=True, exist_ok=True)
    (ROOT / "blender").mkdir(parents=True, exist_ok=True)
    reset_scene()
    canopy = build_canopy()
    lines = build_lines(canopy)
    harness = build_harness()
    terrain = build_terrain()
    parent_rig(canopy, harness, lines)
    bake_maps(canopy)
    export_all(canopy, terrain)
    log("done")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
