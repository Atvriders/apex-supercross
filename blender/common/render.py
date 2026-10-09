"""EEVEE presentation-render helpers (Cycles kernels require AVX2 and SIGILL
on this container's CPU, so all presentation renders use EEVEE via software
GL - llvmpipe)."""

import bpy
import math
import os

from . import mesh as M
from .materials import emissive, concrete, new_material


def setup_eevee(scene, res_x=1920, res_y=1080, samples=64, use_bloom=True):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    eevee = scene.eevee
    eevee.taa_render_samples = samples
    if hasattr(eevee, "use_bloom"):
        eevee.use_bloom = use_bloom
        if use_bloom:
            eevee.bloom_intensity = 0.04
    # Soft contact shadows + AO
    if hasattr(eevee, "use_shadows"):
        eevee.use_shadows = True
    if hasattr(eevee, "shadow_ray_count"):
        eevee.shadow_ray_count = 4
    if hasattr(eevee, "use_gtao"):
        eevee.use_gtao = True
        eevee.gtao_distance = 6.0
    if hasattr(eevee, "use_ssr"):
        eevee.use_ssr = True
    return scene


def studio_rig(floor_size=30, wall_height=12, collection=None):
    """Procedural studio: soft box key/fill/rim, dark backdrop, light floor."""
    bpy.ops.mesh.primitive_plane_add(size=floor_size, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "StudioFloor"
    fmat = new_material("StudioFloor")
    fmat.node_tree.nodes.clear()
    nodes = fmat.node_tree.nodes
    links = fmat.node_tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.55, 0.56, 0.58, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    floor.data.materials.append(fmat)
    try:
        floor.is_shadow_catcher = True
    except (AttributeError, TypeError):
        pass
    M.link(floor, collection)

    bpy.ops.mesh.primitive_plane_add(size=wall_height * 3,
                                     location=(0, 0, wall_height * 0.62))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=False)
    wall = bpy.context.active_object
    wall.name = "StudioBackdrop"
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.location = (0, -floor_size * 0.48, wall_height * 0.55)
    wall.data.materials.append(concrete())
    M.link(wall, collection)

    lights = []
    for name, loc, energy, size, rot in (
        ("Key", (6, -5, 7), 260, 5, (1.25, 0.15, 0.85)),
        ("Fill", (-6, 3, 5), 110, 7, (1.35, 0.05, -1.1)),
        ("Rim", (0, 7, 6), 150, 4, (1.5, 0.0, 3.1416)),
    ):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, type="AREA"))
        l.data.energy = energy
        l.data.size = size
        l.location = loc
        l.rotation_euler = rot
        M.link(l, collection)
        lights.append(l)
    return lights


def turntable_camera(target_location=(0, 1.0, 0), distance=4.5, height=1.6):
    cam = bpy.data.objects.new("TurntableCam", bpy.data.cameras.new("TurntableCam"))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.data.lens = 50
    return cam


def aim_camera(cam, target, distance, height, azimuth_deg):
    az = math.radians(azimuth_deg)
    cam.location = (
        target[0] + distance * math.sin(az),
        target[1] + distance * math.cos(az),
        target[2] + height,
    )
    from mathutils import Vector
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def render_turntable(scene, target_objects, out_prefix, frames=8,
                     distance=4.5, height=1.4, target=(0, 0.9, 0),
                     res=(1600, 900)):
    os.makedirs(os.path.dirname(out_prefix), exist_ok=True)
    setup_eevee(scene, res_x=res[0], res_y=res[1], samples=32)
    cam = turntable_camera(target, distance, height)
    paths = []
    for i in range(frames):
        az = 360.0 * i / frames
        aim_camera(cam, target, distance, height, az)
        path = f"{out_prefix}_{i:02d}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        print("render:", path)
    return paths


def render_still(scene, path, res=(1920, 1080), samples=64):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    setup_eevee(scene, res_x=res[0], res_y=res[1], samples=samples)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("render:", path)
    return path


def add_spot(scene, location, target, energy=3000, cone=35, collection=None):
    light = bpy.data.objects.new("Spot", bpy.data.lights.new("Spot", type="SPOT"))
    light.data.energy = energy
    light.data.spot_size = math.radians(cone)
    light.location = location
    light.data.use_nodes = False
    M.link(light, collection)
    bpy.context.view_layer.objects.active = light
    bpy.ops.object.constraint_add(type="TRACK_TO")
    tc = light.constraints["Track To"]
    tc.target = target
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    return light
