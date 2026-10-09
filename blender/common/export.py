"""GLB export + scene management helpers."""

import bpy
import os


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.3
    return world


def export_glb(path, objects=None, apply_modifiers=True, y_up=True):
    """Export given objects (or the whole scene) to GLB. Returns path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if objects is not None:
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
    kw = dict(
        filepath=path,
        export_format="GLB",
        export_apply=apply_modifiers,
        export_yup=y_up,
        use_selection=(objects is not None),
    )
    # Opt in to compression when the exporter supports it (Blender 5.x ships
    # draco + meshopt bridges, but attribute names vary by build). Prefer
    # meshopt; fall back to the legacy draco flag.
    op = bpy.ops.export_scene.gltf
    if hasattr(op, "export_using_mesh_compression"):
        kw["export_using_mesh_compression"] = "MESHOPT"
    elif hasattr(op, "export_draco_mesh_compression_enable"):
        kw["export_draco_mesh_compression_enable"] = True
    bpy.ops.export_scene.gltf(**kw)
    if not os.path.exists(path):
        raise RuntimeError(f"GLB export failed: {path}")
    print(f"GLB: {path} ({os.path.getsize(path) // 1024} KB)")
    return path


def collection_of(name, parent=None):
    if parent is None:
        parent = bpy.context.scene.collection
    coll = bpy.data.collections.new(name)
    parent.children.link(coll)
    return coll
