"""Mesh construction helpers for the Blender pipeline."""

import bpy
import math


def link(obj, collection=None):
    if collection is None:
        collection = bpy.context.scene.collection
    if obj.name not in collection.objects:
        collection.objects.link(obj)
    return obj


def unlink_all(obj):
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)


def box(name, size=(1, 1, 1), location=(0, 0, 0), collection=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return link(obj, collection)


def cyl(name, radius=0.1, depth=1.0, location=(0, 0, 0), rotation=(0, 0, 0),
        vertices=24, collection=None):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=vertices,
        location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return link(obj, collection)


def sphere(name, radius=0.5, location=(0, 0, 0), collection=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location,
                                         segments=24, ring_count=12)
    obj = bpy.context.active_object
    obj.name = name
    return link(obj, collection)


def torus(name, major=1.0, minor=0.1, location=(0, 0, 0), rotation=(0, 0, 0),
          major_segments=36, minor_segments=12, collection=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        major_segments=major_segments, minor_segments=minor_segments,
        location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return link(obj, collection)


def bevel(obj, width=0.01, segments=2, angle=0.5):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = angle
    return mod


def solid(obj, thickness=0.01):
    mod = obj.modifiers.new("Solid", "SOLIDIFY")
    mod.thickness = thickness
    return mod


def mirror(obj, axis="X"):
    mod = obj.modifiers.new("Mirror", "MIRROR")
    if axis == "X":
        mod.use_axis[0] = True
    elif axis == "Y":
        mod.use_axis[1] = True
    else:
        mod.use_axis[2] = True
    return mod


def origin_to_geometry(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth(obj, angle=40.0):
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(angle)
    for p in obj.data.polygons:
        p.use_smooth = True


def shade_flat(obj):
    obj.data.use_auto_smooth = False
    for p in obj.data.polygons:
        p.use_smooth = False


def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def rotate(obj, euler, apply=False):
    obj.rotation_euler = euler
    if apply:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(rotation=True)


def parent(child, parent_obj):
    child.parent = parent_obj
    child.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def dup(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    return copy


def decimate(obj, ratio=0.5):
    """Return a decimated copy (LOD)."""
    copy = dup(obj, obj.name + "_lod")
    mod = copy.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = copy
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return copy


def join(objects, name):
    """Join meshes into one object; returns result."""
    keep = objects[0]
    keep.name = name
    bpy.context.view_layer.objects.active = keep
    for o in objects[1:]:
        o.select_set(True)
    keep.select_set(True)
    bpy.ops.object.join()
    return keep


def hide_render(obj, hide=True):
    obj.hide_render = hide


def tube_between(p1, p2, radius, name, vertices=16, collection=None):
    """Cylinder spanning two 3D points."""
    from mathutils import Vector
    v1, v2 = Vector(p1), Vector(p2)
    delta = v2 - v1
    length = delta.length
    if length < 1e-6:
        return cyl(name, radius, 0.02, p1, collection=collection)
    obj = cyl(name, radius, length, (v1 + v2) / 2, vertices=vertices,
              collection=collection)
    obj.rotation_euler = delta.normalized().to_track_quat("Z", "Y").to_euler()
    return obj


def disc(name, radius, thickness, location=(0, 0, 0), vertices=24,
         collection=None):
    return cyl(name, radius, thickness, location, vertices=vertices,
               collection=collection)


def cone(name, r1, r2, depth, location=(0, 0, 0), rotation=(0, 0, 0),
         vertices=24, collection=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                    vertices=vertices,
                                    location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    return link(obj, collection)


def arc_sheet(name, radius, angle_deg, width, location=(0, 0, 0),
              rotation=(0, 0, 0), segments=16, collection=None):
    """Curved sheet (fenders): arc of a cylinder wall, +Z up, arc in XZ plane."""
    import math as _m
    a = _m.radians(angle_deg)
    verts = []
    for i in range(segments + 1):
        t = a * i / segments - a / 2
        x = radius * _m.sin(t)
        z = radius * (_m.cos(t) - 1)
        verts.append((x, -width / 2, z))
        verts.append((x, width / 2, z))
    faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(segments)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    return link(obj, collection)


def text_obj(name, text, size=0.1, extrude=0.01, location=(0, 0, 0),
             rotation=(1.5708, 0, 0), collection=None):
    """3D text using Blender's bundled font, extruded."""
    curve = bpy.data.curves.new(name, type="FONT")
    curve.body = text
    curve.extrude = extrude
    curve.size = size
    obj = bpy.data.objects.new(name, curve)
    obj.location = location
    obj.rotation_euler = rotation
    link(obj, collection)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def empty(name, location=(0, 0, 0), collection=None):
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    obj.empty_display_size = 0.05
    return link(obj, collection)
