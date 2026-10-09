"""Preview a pose with the armature rendered as bones."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

import common
import common.render as R
from animations import (setup_rig, add_ik, base_riding, side_lean, standing,
                        arms_up, legs_out, set_ik)

import importlib.util
spec = importlib.util.spec_from_file_location(
    "anim", os.path.join(os.path.dirname(os.path.abspath(__file__)), "animations.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

X = common.export
X.clear_scene()
rig = mod.setup_rig()
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
mod.add_ik(rig)
pose_name = os.environ.get("PREVIEW_POSE", "base")
kwargs = {}
if pose_name == "lean":
    mod.side_lean(rig, -1.0)
elif pose_name == "standing":
    mod.standing(rig)
else:
    mod.base_riding(rig)

rig.data.display_type = "OCTAHEDRAL"
scene = bpy.context.scene
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (0.0, -2.6, 1.1)
from mathutils import Vector
cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
R.setup_eevee(scene, 800, 600, samples=16, use_bloom=False)
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.filepath = os.path.join(common.RENDERS, "pose_check.png")
bpy.ops.render.render(write_still=True)
print("POSE RENDER DONE")
