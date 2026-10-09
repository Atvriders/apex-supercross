"""Trackside props + spectator crowd variants. Each prop is its own GLB so
the game can instance them via track/stadium placement data.

Run: blender --background --python blender/props.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402

PROPS = os.path.join(common.ASSETS, "props")


def _reset():
    X.clear_scene()
    mat._MAT_CACHE.clear()


def tuff_block():
    _reset()
    coll = bpy.context.scene.collection
    b = M.box("tuff_block", (1.6, 0.7, 0.7), (0, 0, 0.35), collection=coll)
    M.assign(b, mat.tuff_foam())
    M.bevel(b, 0.05, 1)
    top = M.box("tuff_top", (1.6, 0.7, 0.10), (0, 0, 0.72), collection=coll)
    M.assign(top, mat.painted_steel("m_tufftop", (0.85, 0.16, 0.12)))
    X.export_glb(os.path.join(PROPS, "tuff_block.glb"), objects=None, y_up=False)


def marker():
    _reset()
    coll = bpy.context.scene.collection
    pole = M.cyl("marker", 0.025, 1.1, (0, 0, 0.55), vertices=8, collection=coll)
    M.assign(pole, mat.painted_steel("m_marker", (0.95, 0.95, 0.97)))
    top = M.box("marker_head", (0.30, 0.06, 0.22), (0, 0, 1.08), collection=coll)
    M.assign(top, mat.painted_steel("m_markerh", (0.9, 0.28, 0.10)))
    X.export_glb(os.path.join(PROPS, "marker.glb"), objects=None, y_up=False)


def water_truck():
    _reset()
    coll = bpy.context.scene.collection
    body = M.box("truck_body", (2.4, 4.6, 1.4), (0, 0, 1.4), collection=coll)
    M.assign(body, mat.painted_steel("m_wt_body", (0.75, 0.76, 0.78)))
    M.bevel(body, 0.1, 2)
    tank = M.cyl("water_tank", 0.85, 3.8, (0, -0.2, 2.2), rotation=(1.5708, 0, 0),
                 vertices=16, collection=coll)
    M.assign(tank, mat.painted_steel("m_wt_tank", (0.2, 0.35, 0.6)))
    cab = M.box("truck_cab", (2.2, 1.5, 1.5), (0, 2.5, 1.6), collection=coll)
    M.assign(cab, mat.painted_steel("m_wt_cab", (0.85, 0.86, 0.88)))
    for i, (x, y) in enumerate(((-1.0, -1.7), (1.0, -1.7), (-1.0, 1.7), (1.0, 1.7))):
        wh = M.cyl(f"wt_wheel_{i}", 0.55, 0.35, (x, y, 0.55),
                   rotation=(1.5708, 0, 0), vertices=14, collection=coll)
        M.assign(wh, mat.rubber())
    X.export_glb(os.path.join(PROPS, "water_truck.glb"), objects=None, y_up=False)


def tractor():
    _reset()
    coll = bpy.context.scene.collection
    body = M.box("tractor_body", (1.6, 2.2, 1.1), (0, 0, 1.0), collection=coll)
    M.assign(body, mat.painted_steel("m_tr_body", (0.95, 0.7, 0.1)))
    M.bevel(body, 0.08, 2)
    cab = M.box("tractor_cab", (1.5, 1.3, 1.2), (0, -1.2, 1.8), collection=coll)
    M.assign(cab, mat.glass())
    scoop = M.box("tractor_scoop", (2.0, 1.4, 0.7), (0, 1.7, 0.8), collection=coll)
    M.assign(scoop, mat.painted_steel("m_tr_scoop", (0.2, 0.2, 0.22)))
    for i, (x, y) in enumerate(((-1.3, -0.8), (1.3, -0.8), (-1.3, 0.8), (1.3, 0.8))):
        wh = M.cyl(f"tr_wheel_{i}", 0.5, 0.4, (x, y, 0.5),
                   rotation=(1.5708, 0, 0), vertices=14, collection=coll)
        M.assign(wh, mat.rubber())
    X.export_glb(os.path.join(PROPS, "tractor.glb"), objects=None, y_up=False)


def dirt_pile():
    _reset()
    coll = bpy.context.scene.collection
    base = M.box("dirt_pile", (4.0, 3.0, 1.2), (0, 0, 0.6), collection=coll)
    M.assign(base, mat.dirt("m_pile_dirt", damp=0.5))
    M.bevel(base, 0.5, 3)
    top = M.box("dirt_pile_top", (2.2, 1.6, 0.8), (0.3, 0.2, 1.5), collection=coll)
    M.assign(top, mat.dirt("m_pile_dirt2", damp=0.6))
    M.bevel(top, 0.4, 2)
    X.export_glb(os.path.join(PROPS, "dirt_pile.glb"), objects=None, y_up=False)


SPECTATOR_COLORS = (
    (0.85, 0.15, 0.1), (0.1, 0.3, 0.75), (0.95, 0.75, 0.1),
    (0.1, 0.6, 0.3), (0.9, 0.9, 0.9), (0.2, 0.2, 0.25),
)


def spectators():
    """4 seated crowd variants; each its own mesh for instancing."""
    _reset()
    coll = bpy.context.scene.collection
    for v in range(4):
        shirt = SPECTATOR_COLORS[v]
        skin = mat.skin(f"m_spec_skin_{v}", (0.62, 0.42, 0.33), sss=0.2)
        shirt_m = mat.fabric(f"m_spec_shirt_{v}", shirt, weave=60)
        pants = mat.fabric(f"m_spec_pants_{v}", (0.15, 0.16, 0.2), weave=60)
        legs = M.box(f"spec{v}_legs", (0.24, 0.34, 0.34), (0, 0, 0.30),
                     collection=coll)
        M.assign(legs, pants)
        M.bevel(legs, 0.04, 1)
        torso = M.box(f"spec{v}_torso", (0.34, 0.22, 0.40), (0, -0.05, 0.66),
                      collection=coll)
        M.assign(torso, shirt_m)
        M.bevel(torso, 0.05, 2)
        head = M.box(f"spec{v}_head", (0.20, 0.20, 0.22), (0, -0.06, 0.95),
                     collection=coll)
        M.assign(head, skin)
        M.bevel(head, 0.06, 2)
        for sx in (-1, 1):
            arm = M.box(f"spec{v}_arm_{sx}", (0.12, 0.14, 0.42),
                        (sx * 0.23, 0.02, 0.62), collection=coll)
            M.assign(arm, shirt_m)
            arm.rotation_euler = (0.35, 0, sx * 0.2)
        objs = [o for o in coll.objects]
        root = bpy.data.objects.new(f"spectator_{v}", None)
        coll.objects.link(root)
        for o in objs:
            o.parent = root
        sel = [root] + objs
        X.export_glb(os.path.join(PROPS, f"spectator_{v}.glb"),
                     objects=sel, y_up=False)
        X.clear_scene()
        mat._MAT_CACHE.clear()
        coll = bpy.context.scene.collection


if __name__ == "__main__":
    tuff_block()
    marker()
    water_truck()
    tractor()
    dirt_pile()
    spectators()
    print("PROPS DONE")
