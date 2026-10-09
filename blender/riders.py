"""Original riders: MPFB2-generated humans with fully procedural gear
(helmet, goggles, jersey, pants, gloves, boots, chest protector, knee guards,
eyes, brows, hair cap). Gear is built as fattened body-region shells that
inherit MPFB skin weights, so everything deforms with the built-in rig.

Run: blender --background --python blender/riders.py
Env: RIDER_INDEX (single), RIDER_RENDER=1
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import bmesh  # noqa: E402

import common  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402
from common import render as R  # noqa: E402

RIDERS = [
    # (name, number, gender, race mix, height, muscle, weight, age, gear colors)
    ("J. Callahan", "7", 1.0, (0.60, 0.30, 0.10), 0.55, 0.50, 0.45, 0.40,
     ((0.82, 0.10, 0.08), (0.95, 0.95, 0.95), (0.10, 0.12, 0.14),
      (0.62, 0.42, 0.33))),
    ("M. Okafor", "21", 1.0, (0.25, 0.75, 0.0), 0.50, 0.62, 0.55, 0.42,
     ((0.95, 0.62, 0.08), (0.08, 0.09, 0.10), (0.95, 0.95, 0.95),
      (0.30, 0.18, 0.12))),
    ("R. Delgado", "44", 0.0, (0.50, 0.20, 0.30), 0.45, 0.32, 0.35, 0.35,
     ((0.10, 0.35, 0.85), (0.95, 0.95, 0.95), (0.10, 0.12, 0.14),
      (0.55, 0.35, 0.26))),
    ("S. Tran", "86", 1.0, (0.30, 0.0, 0.70), 0.60, 0.45, 0.50, 0.38,
     ((0.35, 0.78, 0.25), (0.95, 0.95, 0.95), (0.08, 0.09, 0.10),
      (0.60, 0.40, 0.30))),
]

RIDERS_DIR = os.path.join(common.ASSETS, "riders")


def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mod = importlib.import_module(amod)
            if not hasattr(mod, key):
                raise AttributeError(f"{amod} lacks {key}")
            return getattr(mod, key)
    raise ValueError(f"No module ending in {absolute_package_str}")


def make_human(rider_spec):
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    HumanObjectProps = dynamic_import("mpfb.entities.objectproperties",
                                      "HumanObjectProperties")
    TargetService = dynamic_import("mpfb.services.targetservice",
                                   "TargetService")
    name, num, gender, race, height, muscle, weight, age, colors = rider_spec
    basemesh = HumanService.create_human()
    props = dict(
        gender=gender, height=height, muscle=muscle, weight=weight, age=age,
        caucasian=race[0], african=race[1], asian=race[2],
    )
    for k, v in props.items():
        HumanObjectProps.set_value(k, v, entity_reference=basemesh)
    TargetService.reapply_macro_details(basemesh)
    # face variety via nose/chin micro targets (fuzzy-matched names)
    loc = dynamic_import("mpfb.services.locationservice", "LocationService")
    target_root = loc.get_mpfb_data("targets")
    available = []
    for dirpath, _dirs, files in os.walk(target_root):
        for fn in files:
            if fn.endswith(".target.gz"):
                available.append(os.path.join(dirpath, fn))
    wants = {
        0: ("nose", "volume-incr"),
        1: ("nose", "width-incr"),
        2: ("nose", "volume-decr"),
        3: ("cheek", "volume-incr"),
    }
    idx = RIDERS.index(rider_spec)
    want = wants.get(idx)
    if want:
        for cand in available:
            if want[0] in cand.lower() and want[1] in cand.lower():
                try:
                    TargetService.load_target(basemesh, cand, weight=0.55)
                    print("target applied:", os.path.basename(cand))
                except Exception as e:
                    print("target skip:", cand, e)
                break
    rig = HumanService.add_builtin_rig(basemesh, "default")
    return basemesh, rig, colors


# ---------------------------------------------------------------------------
# Gear shells: fattened body regions with copied vertex groups
# ---------------------------------------------------------------------------
def shell_from_groups(body, group_substrings, name, fatten, material):
    """Duplicate body, keep only vertices in matching groups, fatten, assign
    material. Preserves vertex groups => deforms with the armature."""
    src = body.data
    mesh = src.copy()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    keep = []
    for gi, g in enumerate(body.vertex_groups):
        obj.vertex_groups.new(name=g.name)
        if any(s in g.name.lower() for s in group_substrings):
            keep.append(gi)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    layers = bm.verts.layers.deform.verify()
    to_delete = []
    for v in bm.verts:
        if not any(v[layers].get(gi, 0.0) > 0.15 for gi in keep):
            to_delete.append(v)
    bmesh.ops.delete(bm, geom=to_delete, context="VERTS")
    # fatten along normals
    bmesh.ops.inset_individual(bm, faces=[f for f in bm.faces], thickness=fatten)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.materials.append(material)
    # armature modifier with copied weights
    mod = obj.modifiers.new("Armature", "ARMATURE")
    return obj


def finish_skinned(obj, armature):
    obj.parent = armature
    obj.modifiers["Armature"].object = armature
    return obj


def build_gear(body, armature, colors):
    jc, pc, tc, tone = colors
    jersey = mat.fabric("m_jersey", jc, weave=48)
    pants = mat.fabric("m_pants", pc, weave=48)
    boots = mat.leather("m_boots", (0.05, 0.045, 0.04))
    gloves = mat.fabric("m_gloves", tc, weave=70)
    dark = mat.plastic("m_dark_gear", (0.06, 0.06, 0.07))
    armor = mat.plastic("m_chest", tc)
    skin_m = mat.skin("m_rider_skin", tone, sss=0.3)

    gear = {}
    gear["jersey"] = finish_skinned(shell_from_groups(
        body, ("spine", "chest", "upperarm", "lowerarm", "wrist", "clavicle",
               "shoulder", "pelvis", "neck", "breast"),
        "jersey", 0.010, jersey), armature)
    gear["pants"] = finish_skinned(shell_from_groups(
        body, ("upperleg", "lowerleg", "pelvis"), "pants", 0.011, pants), armature)
    gear["boots"] = finish_skinned(shell_from_groups(
        body, ("foot", "lowerleg02", "toe"), "boots", 0.014, boots), armature)
    gear["gloves"] = finish_skinned(shell_from_groups(
        body, ("wrist", "metacarpal", "finger", "lowerarm02"), "gloves",
        0.010, gloves), armature)
    gear["knees"] = finish_skinned(shell_from_groups(
        body, ("lowerleg01",), "knee_guards", 0.020, dark), armature)
    return gear, skin_m


def build_head_gear(body, armature, colors, skin_m):
    """Eyes, brows, hair cap, helmet, goggles - parented to the head bone."""
    jc, pc, tc, tone = colors
    head_bone = armature.data.bones["head"]
    head_pos = armature.matrix_world @ head_bone.head_local

    eyes = []
    head_parts = []
    for side in ("L", "R"):
        bone_name = f"eye.{side}"
        if bone_name not in armature.data.bones:
            continue
        eye_bone = armature.data.bones[bone_name]
        pos = armature.matrix_world @ eye_bone.head_local
        e = M.sphere(f"eye_{side}", 0.012, tuple(pos))
        eyes.append(e)
        mat_e = mat.new_material_with_color(f"m_eye_{side}", (0.95, 0.95, 0.95),
                                            roughness=0.05)
        e.data.materials.append(mat_e)
        iris = M.sphere(f"iris_{side}", 0.006, tuple(pos))
        mat_i = mat.new_material_with_color(f"m_iris_{side}", (0.2, 0.12, 0.08),
                                            roughness=0.15)
        iris.data.materials.append(mat_i)
        # brow
        brow = M.box(f"brow_{side}", (0.030, 0.006, 0.005),
                     (pos.x, pos.y + 0.013, pos.z + 0.012))
        brow.data.materials.append(
            mat.new_material_with_color("m_brow", (0.1, 0.07, 0.05), roughness=0.9))
        eyes.append(iris)
        eyes.append(brow)
        head_parts.extend([e, iris, brow])
    for part in head_parts:
        vg = part.vertex_groups.new(name="head")
        for v in part.data.vertices:
            vg.add([v.index], 1.0, "REPLACE")
        mod = part.modifiers.new("Armature", "ARMATURE")
        mod.object = armature
        part.parent = armature

    # hair cap under the helmet
    hair = finish_skinned(shell_from_groups(
        body, ("scalp",), "hair_cap", 0.006,
        mat.new_material_with_color("m_hair", (0.12, 0.09, 0.06), roughness=0.9)),
        armature)

    # helmet: shell + visor + goggles + strap, rigid -> head bone
    shell = M.sphere("helmet_shell", 0.12, (head_pos.x, head_pos.y + 0.015,
                                            head_pos.z + 0.035))
    shell.scale = (0.95, 1.02, 1.05)
    bpy.ops.object.transform_apply(scale=True)
    shell.data.materials.append(mat.plastic("m_helmet", jc))
    visor = M.arc_sheet("helmet_visor", 0.15, 150, 0.16,
                        (head_pos.x, head_pos.y - 0.05, head_pos.z + 0.05))
    visor.data.materials.append(mat.plastic("m_visor", tc))
    visor.rotation_euler = (0, 0, 1.5708)
    gog = M.box("goggles", (0.13, 0.028, 0.045),
                (head_pos.x, head_pos.y + 0.052, head_pos.z + 0.015))
    gog.data.materials.append(mat.plastic("m_goggles", (0.55, 0.65, 0.75)))
    strap = M.torus("goggle_strap", 0.105, 0.012,
                    (head_pos.x, head_pos.y + 0.02, head_pos.z + 0.02),
                    rotation=(0, 1.5708, 0))
    strap.data.materials.append(mat.rubber())
    for part in (shell, visor, gog, strap):
        vg = part.vertex_groups.new(name="head")
        for v in part.data.vertices:
            vg.add([v.index], 1.0, "REPLACE")
        mod = part.modifiers.new("Armature", "ARMATURE")
        mod.object = armature
        part.parent = armature
    return eyes, hair


def decimate_for_lod(body, gear, ratio):
    for obj in [body] + list(gear.values()):
        obj.modifiers.new("Decimate", "DECIMATE").ratio = ratio


def export_rider(body, rig, gear, index, name):
    os.makedirs(RIDERS_DIR, exist_ok=True)
    full = os.path.join(RIDERS_DIR, f"rider_{index}.glb")
    X.export_glb(full, objects=None)
    # LOD1
    decimate_for_lod(body, gear, 0.45)
    lod = os.path.join(RIDERS_DIR, f"rider_{index}_lod1.glb")
    X.export_glb(lod, objects=None)
    print("rider exported:", full)
    return full


def build_rider(index, render=False):
    X.clear_scene()
    mat._MAT_CACHE.clear()
    spec = RIDERS[index]
    body, rig, colors = make_human(spec)
    body.name = f"body_{index}"
    rig.name = f"rig_{index}"
    gear, skin_m = build_gear(body, rig, colors)
    body.data.materials.clear()
    body.data.materials.append(skin_m)
    eyes, hair = build_head_gear(body, rig, colors, skin_m)
    # chest protector (rigid, follows spine bones) - positioned at the chest
    jc, pc, tc, tone = colors
    chest = M.box(f"chest_protector", (0.30, 0.10, 0.34), (0, 0, 0))
    chest.data.materials.append(mat.plastic("m_cp", tc))
    spine3 = rig.data.bones.get("spine03")
    chest_pos = rig.matrix_world @ spine3.head_local if spine3 else rig.location
    chest.location = chest_pos
    chest.parent = rig
    for part in (chest,):
        vg = part.vertex_groups.new(name="spine03")
        for v in part.data.vertices:
            vg.add([v.index], 1.0, "REPLACE")
        mod = part.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
    gear["chest"] = chest
    export_rider(body, rig, gear, index, spec[0])
    if render:
        R.studio_rig()
        R.render_turntable(bpy.context.scene, None,
                           os.path.join(common.RENDERS, f"turntable_rider_{index}"),
                           frames=4, distance=2.8, height=1.3,
                           target=(0, 0, 1.0), res=(800, 450))
    print("rider built:", spec[0])


if __name__ == "__main__":
    only = os.environ.get("RIDER_INDEX")
    do_render = os.environ.get("RIDER_RENDER") == "1"
    if only is not None:
        build_rider(int(only), render=do_render)
    else:
        for i in range(len(RIDERS)):
            build_rider(i, render=do_render)
    print("RIDERS DONE")
