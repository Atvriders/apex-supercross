"""Verify headless MPFB2 human creation + built-in rig + GLB export.
Run: blender --background --python blender/test_mpfb.py
"""
import bpy
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mpfb_mod = importlib.import_module(amod)
            if not hasattr(mpfb_mod, key):
                raise AttributeError(f"Module {amod} does not have attribute {key}")
            return getattr(mpfb_mod, key)
    raise ValueError(f"No module found with name ending in {absolute_package_str}")


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    HumanObjectProps = dynamic_import("mpfb.entities.objectproperties", "HumanObjectProperties")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")
    print("services imported OK")

    basemesh = HumanService.create_human()
    print("human created:", basemesh.name)
    HumanObjectProps.set_value("gender", 0.6, entity_reference=basemesh)
    HumanObjectProps.set_value("muscle", 0.35, entity_reference=basemesh)
    HumanObjectProps.set_value("weight", 0.45, entity_reference=basemesh)
    HumanObjectProps.set_value("height", 0.55, entity_reference=basemesh)
    TargetService.reapply_macro_details(basemesh)
    print("macro targets applied")

    rig = HumanService.add_builtin_rig(basemesh, "default")
    print("rig added:", rig.name)
    print("bones:", len(rig.data.bones))

    dims = basemesh.dimensions
    print(f"dims: {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f}")

    out = os.path.join(ROOT, "assets", "test_human.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True)
    print("GLB:", out, os.path.getsize(out), "bytes")
    print("MPFB TEST PASSED")
