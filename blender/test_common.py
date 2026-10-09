"""Validate blender/common modules work together in headless Blender."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: F401
import common.materials as mat  # noqa: F401
import common.mesh as mesh  # noqa: F401
import common.export as exp  # noqa: F401
import common.render as rend  # noqa: F401
import common.specs as specs  # noqa: F401

import bpy

exp.clear_scene()
coll = bpy.context.scene.collection

floor = mesh.box("floor", (6, 6, 0.1), (0, 0, -0.05), collection=coll)
mesh.assign(floor, mat.concrete())
bike = mesh.cyl("body", 0.2, 1.2, (0, 0.6, 0), collection=coll)
mesh.assign(bike, mat.plastic("m_test_plastic", (0.9, 0.15, 0.05)))
wheel = mesh.torus("wheel", 0.35, 0.12, (0, 0.35, 0.8), collection=coll)
mesh.assign(wheel, mat.rubber())
wheel2 = mesh.torus("wheel2", 0.35, 0.12, (0, 0.35, -0.8), collection=coll)
mesh.assign(wheel2, mat.rubber())

rend.studio_rig(collection=coll)
scene = bpy.context.scene
rend.setup_eevee(scene, 640, 360, samples=16, use_bloom=False)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
coll.objects.link(cam)
scene.camera = cam
rend.aim_camera(cam, (0, 0.6, 0), 4.5, 1.4, 30)
scene.render.filepath = os.path.join(common.RENDERS, "common_test.png")
bpy.ops.render.render(write_still=True)

exp.export_glb(os.path.join(common.ASSETS, "common_test.glb"), objects=None)
specs.write_vehicle_manifest()
print("COMMON LIB OK")
