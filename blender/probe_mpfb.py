"""Probe MPFB base mesh: vertex groups + bone names of the default rig."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy


def dynamic_import(absolute_package_str, key):
    import importlib
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mpfb_mod = importlib.import_module(amod)
            if not hasattr(mpfb_mod, key):
                raise AttributeError(f"{amod} lacks {key}")
            return getattr(mpfb_mod, key)
    raise ValueError(f"No module ending in {absolute_package_str}")


bpy.ops.wm.read_factory_settings(use_empty=True)
HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
basemesh = HumanService.create_human()
rig = HumanService.add_builtin_rig(basemesh, "default")
print("RIG:", rig.name)
print("GROUPS:", sorted(basemesh.vertex_groups.keys()))
print("BONES:", sorted(rig.data.bones.keys()))
