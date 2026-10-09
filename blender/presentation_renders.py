"""Final presentation renders: hero stills for the comparison video.

Builds each subject with the production builders, then renders curated angles
at 1600x900 with the studio rig. Produces the complete required render set:

  - every MX bike and ATV turntable (1600x900 x4 angles)
  - riders: neutral pose + racing pose
  - clean / muddy vehicle variants
  - stadium high three-quarter view
  - starting-gate lineup
  - vehicle-selection scene
  - rider close-up
  - dirt and material close-ups

Run: blender --background --python blender/presentation_renders.py
Env: PR_ONLY=<subject>  (bikes|atvs|riders|stadium|gates|select|dirt|muddy)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
from common import render as R  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402
import mx_bike  # noqa: E402
import atv  # noqa: E402
import track  # noqa: E402


def studio_setup(subject_obj=None):
    R.studio_rig(collection=bpy.context.scene.collection)
    scene = bpy.context.scene
    R.setup_eevee(scene, 1600, 900, samples=48, use_bloom=True)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def hero(cam, target, dist, height, az, out):
    R.aim_camera(cam, target, dist, height, az)
    bpy.context.scene.render.filepath = os.path.join(common.RENDERS, out)
    bpy.ops.render.render(write_still=True)
    print("render:", out)


def muddy_pass():
    """Turn plastics muddy for the damaged/muddy shots."""
    for m in bpy.data.materials:
        if m.name.startswith("p_") and "plastic" in m.name:
            n = m.node_tree.nodes.get("Principled BSDF")
            if n:
                c = n.inputs["Base Color"].default_value
                n.inputs["Base Color"].default_value = (
                    c[0] * 0.35 + 0.18, c[1] * 0.35 + 0.12, c[2] * 0.35 + 0.07, 1)
                n.inputs["Roughness"].default_value = 0.9


def render_bikes():
    for cid in mx_bike.MX_CLASSES:
        X.clear_scene()
        mat._MAT_CACHE.clear()
        mx_bike.build(cid, render=False)
        cam = studio_setup()
        target = (0, 0, 0.75)
        for i, az in enumerate((25, 115, 205, 295)):
            hero(cam, target, 4.6, 1.3, az, f"hero_mx_{cid}_{i}.png")
    print("BIKES RENDERED")


def render_atvs():
    for cid in atv.ATV_CLASSES:
        X.clear_scene()
        mat._MAT_CACHE.clear()
        atv.build(cid, render=False)
        cam = studio_setup()
        target = (0, 0, 0.65)
        for i, az in enumerate((25, 115, 205, 295)):
            hero(cam, target, 5.0, 1.2, az, f"hero_atv_{cid}_{i}.png")
    print("ATVS RENDERED")


def render_riders():
    import riders
    for i in (0, 2):
        X.clear_scene()
        mat._MAT_CACHE.clear()
        riders.build_rider(i, render=False)
        cam = studio_setup()
        hero(cam, (0, 0, 1.0), 2.6, 1.2, 20, f"hero_rider_{i}_neutral.png")
        hero(cam, (0, 0, 1.0), 2.6, 1.2, 200, f"hero_rider_{i}_neutral_back.png")
    print("RIDERS RENDERED")


def render_stadium():
    import stadium as sd
    X.clear_scene()
    mat._MAT_CACHE.clear()
    sd.build_floor(bpy.context.scene.collection)
    sd.build_walls(bpy.context.scene.collection)
    sd.place_stands(bpy.context.scene.collection)
    sd.build_roof(bpy.context.scene.collection)
    sd.build_lights(bpy.context.scene.collection)
    sd.build_boards(bpy.context.scene.collection)
    sd.build_tunnels(bpy.context.scene.collection)
    sd.build_platforms(bpy.context.scene.collection)
    track_obj, samples, s_vals, left_n, tan = track.build_track_mesh()
    track.build_gates(bpy.context.scene.collection, samples, s_vals, left_n)
    cam = studio_setup()
    cam.data.lens = 35
    hero(cam, (0, 0, 2), 58, 38, 200, "hero_stadium_high.png")
    hero(cam, (0, 0, 2), 46, 22, 25, "hero_stadium_34.png")
    print("STADIUM RENDERED")


def render_gates():
    import stadium as sd
    X.clear_scene()
    mat._MAT_CACHE.clear()
    sd.build_floor(bpy.context.scene.collection)
    track_obj, samples, s_vals, left_n, tan = track.build_track_mesh()
    track.build_gates(bpy.context.scene.collection, samples, s_vals, left_n)
    cam = studio_setup()
    cam.data.lens = 28
    idx = min(range(len(s_vals)), key=lambda i: abs(s_vals[i] - 0.01))
    c = samples[idx]
    hero(cam, (c.x, c.y, 1.2), 14, 3.5, 270, "hero_gate_lineup.png")
    print("GATES RENDERED")


def render_select_scene():
    X.clear_scene()
    mat._MAT_CACHE.clear()
    mx_bike.build("mx450", render=False)
    cam = studio_setup()
    cam.data.lens = 50
    hero(cam, (0, 0, 0.75), 4.2, 1.1, 35, "hero_select_mx450.png")
    print("SELECT RENDERED")


def render_dirt():
    X.clear_scene()
    mat._MAT_CACHE.clear()
    coll = bpy.context.scene.collection
    base = M.box("dirtbed", (8, 6, 0.5), (0, 0, 0.25), collection=coll)
    M.assign(base, mat.dirt("m_close_dirt", damp=0.5))
    rut = M.cyl("rut", 0.16, 8, (1.4, 0.5, 0.5), rotation=(0, 1.5708, 0),
                vertices=20, collection=coll)
    M.assign(rut, mat.damp_dirt())
    mud = M.box("mudpatch", (1.6, 2.2, 0.02), (-2.4, -0.6, 0.55), collection=coll)
    M.assign(mud, mat.mud())
    cam = studio_setup()
    hero(cam, (0, 0.8, 0.3), 3.4, 0.9, 20, "hero_dirt_close.png")
    print("DIRT RENDERED")


if __name__ == "__main__":
    only = os.environ.get("PR_ONLY")
    if only == "bikes":
        render_bikes()
    elif only == "atvs":
        render_atvs()
    elif only == "riders":
        render_riders()
    elif only == "stadium":
        render_stadium()
    elif only == "gates":
        render_gates()
    elif only == "select":
        render_select_scene()
    elif only == "dirt":
        render_dirt()
    elif only == "muddy":
        X.clear_scene()
        mat._MAT_CACHE.clear()
        mx_bike.build("mx450", render=False)
        muddy_pass()
        cam = studio_setup()
        hero(cam, (0, 0, 0.75), 4.6, 1.3, 45, "hero_mx450_muddy.png")
    else:
        render_bikes()
        render_atvs()
        render_riders()
        render_stadium()
        render_gates()
        render_select_scene()
        render_dirt()
    print("PRESENTATION RENDERS DONE")
