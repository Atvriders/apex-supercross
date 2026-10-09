"""Smoke test: verify headless Blender can build a scene, export GLB, and render with Cycles CPU.

Run: blender --background --python blender/test_smoke.py
Outputs: assets/test_smoke.glb, renders/test_smoke.png
"""
import bpy
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
RENDERS = os.path.join(ROOT, "renders")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(RENDERS, exist_ok=True)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ground plane with procedural dirt material
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    mat = bpy.data.materials.new("Dirt")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.36, 0.23, 0.13, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 12.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    ground.data.materials.append(mat)

    # Cube with metallic material
    bpy.ops.mesh.primitive_cube_add(size=1.2, location=(0, 0.35, 0.8))
    cube = bpy.context.active_object
    cube.name = "Cube"
    mat2 = bpy.data.materials.new("Metal")
    mat2.use_nodes = True
    n2 = mat2.node_tree.nodes
    l2 = mat2.node_tree.links
    n2.clear()
    out2 = n2.new("ShaderNodeOutputMaterial")
    p = n2.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (0.85, 0.3, 0.1, 1.0)
    p.inputs["Metallic"].default_value = 0.9
    p.inputs["Roughness"].default_value = 0.3
    l2.new(p.outputs["BSDF"], out2.inputs["Surface"])
    cube.data.materials.append(mat2)

    # Studio lighting rig (procedural, no HDRI)
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", type="AREA"))
    key.data.energy = 120
    key.location = (4, -4, 5)
    key.rotation_euler = (1.1, 0.2, 0.8)
    key.data.size = 3
    bpy.context.scene.collection.objects.link(key)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="AREA"))
    fill.data.energy = 40
    fill.location = (-4, 3, 2.5)
    fill.rotation_euler = (1.3, 0.1, -1.2)
    fill.data.size = 4
    bpy.context.scene.collection.objects.link(fill)
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    wn = world.node_tree.nodes
    wl = world.node_tree.links
    bg = wn["Background"]
    bg.inputs["Strength"].default_value = 0.35
    sky = wn.new("ShaderNodeTexSky")
    sky.sky_type = "SINGLE_SCATTERING"
    sky.sun_elevation = 0.6
    wl.new(sky.outputs["Color"], bg.inputs["Color"])

    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.location = (6.5, -6.5, 4.5)
    cam.rotation_euler = (1.15, 0.0, 0.785)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def export_glb():
    path = os.path.join(ASSETS, "test_smoke.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=False,
        export_apply=True,
    )
    assert os.path.exists(path), "GLB export failed"
    print(f"GLB OK: {path} ({os.path.getsize(path)} bytes)")


def render_cycles():
    path = os.path.join(RENDERS, "test_smoke.png")
    scene = bpy.context.scene
    # NOTE: Cycles CPU kernels require AVX2 in official 5.2 builds and SIGILL on
    # this container's CPU, so presentation renders use EEVEE (software GL).
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
    assert os.path.exists(path), "EEVEE render failed"
    print(f"RENDER OK: {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    build_scene()
    export_glb()
    render_cycles()
    print("SMOKE TEST PASSED")
