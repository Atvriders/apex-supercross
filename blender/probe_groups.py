"""Probe which MPFB vertex groups actually cover the body regions."""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import bmesh


def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mod = importlib.import_module(amod)
            if not hasattr(mod, key):
                raise AttributeError(f"{amod} lacks {key}")
            return getattr(mod, key)
    raise ValueError(f"No module ending in {absolute_package_str}")


bpy.ops.wm.read_factory_settings(use_empty=True)
HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
body = HumanService.create_human()
HumanService.add_builtin_rig(body, "default")
groups = body.vertex_groups
bm = bmesh.new()
bm.from_mesh(body.data)
layers = bm.verts.layers.deform.verify()
total = len(bm.verts)
regions = {
    "jersey": ("spine", "chest", "upperarm", "lowerarm", "wrist", "clavicle",
               "shoulder", "pelvis", "neck", "breast"),
    "pants": ("upperleg", "lowerleg", "pelvis"),
    "boots": ("foot", "lowerleg02", "toe"),
    "gloves": ("wrist", "metacarpal", "finger", "lowerarm02"),
    "knees": ("lowerleg01",),
}
for rname, subs in regions.items():
    keep = [gi for gi, g in enumerate(groups)
            if any(s in g.name.lower() for s in subs)]
    cnt = 0
    for v in bm.verts:
        if any(v[layers].get(gi, 0.0) > 0.15 for gi in keep):
            cnt += 1
    print(f"{rname}: groups={keep} verts={cnt}/{total}")
# total coverage of all body groups
for gname in ("upperleg01.L", "lowerleg01.L", "lowerleg02.L", "foot.L",
              "upperarm01.L", "lowerarm01.L", "wrist.L", "spine01"):
    gi = groups.find(gname)
    cnt = sum(1 for v in bm.verts if v[layers].get(gi, 0.0) > 0.15) if gi >= 0 else -1
    print(f"  {gname}: idx={gi} verts={cnt}")
bm.free()
