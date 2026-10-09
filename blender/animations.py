"""Author MX/ATV rider animation clips on the MPFB default rig using IK
targets, bake them with visual keying, and export armature-only GLB clips
(one per clip) for retargeting by bone name at runtime.

Run: blender --background --python blender/animations.py
Env: ANIM_ONLY=clip_name ANIM_PREVIEW=1
"""
import importlib
import json
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
from common import export as X  # noqa: E402
from common import render as R  # noqa: E402

ANIM_DIR = os.path.join(common.ASSETS, "anim")
ANIM_MANIFEST = os.path.join(ANIM_DIR, "animations.json")

F = 60  # clip length in frames (2s at 30fps)


def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mod = importlib.import_module(amod)
            if not hasattr(mod, key):
                raise AttributeError(f"{amod} lacks {key}")
            return getattr(mod, key)
    raise ValueError(f"No module ending in {absolute_package_str}")


def setup_rig():
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    body = HumanService.create_human()
    rig = HumanService.add_builtin_rig(body, "default")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.delete()  # body not needed for clip export
    rig.name = "rider_rig"
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    return rig


IK_CHAINS = {
    "arm.L": ("lowerarm01.L", "upperarm02.L", "upperarm01.L", "clavicle.L"),
    "arm.R": ("lowerarm01.R", "upperarm02.R", "upperarm01.R", "clavicle.R"),
    "leg.L": ("lowerleg01.L", "upperleg02.L", "upperleg01.L", None),
    "leg.R": ("lowerleg01.R", "upperleg02.R", "upperleg01.R", None),
}

targets = {}
poles = {}


def add_ik(rig):
    """IK on lowerarm01 (chain 2) and lowerleg01 (chain 2) with pole targets."""
    for key, (ik_bone, p1, p2, top) in IK_CHAINS.items():
        t = bpy.data.objects.new(f"IK_{key}", None)
        bpy.context.scene.collection.objects.link(t)
        t.empty_display_size = 0.05
        targets[key] = t
        pole = bpy.data.objects.new(f"Pole_{key}", None)
        bpy.context.scene.collection.objects.link(pole)
        pole.empty_display_size = 0.05
        poles[key] = pole
        pb = rig.pose.bones[ik_bone]
        c = pb.constraints.new("IK")
        c.target = t
        c.chain_count = 2
        c.pole_target = pole
        c.pole_angle = 0.0
        # initial pole positions (elbows out, knees forward)
        if key.startswith("arm"):
            pole.location = (0.3 if "R" in key else -0.3, 0.15, 1.35)
        else:
            pole.location = (0.1 if "R" in key else -0.1, 0.35, 0.9)


def fk(rig, bone, x=None, y=None, z=None):
    pb = rig.pose.bones[bone]
    e = list(pb.rotation_euler)
    if x is not None:
        e[0] = x
    if y is not None:
        e[1] = y
    if z is not None:
        e[2] = z
    pb.rotation_euler = e


# ---------------------------------------------------------------------------
# Pose library. Rider sits on an imaginary bike: hips (0,0,0.78), feet on
# pegs (x=+-0.18, y=0.10, z=0.55), hands on bars (x=+-0.30, y=0.30, z=1.05).
# +Y forward, +Z up, +X right.
# ---------------------------------------------------------------------------
def base_riding(rig, lean=0.45, hip_z=0.78):
    fk(rig, "root", 0, 0, 0)
    rig.pose.bones["root"].location = (0, 0, hip_z)
    fk(rig, "spine01", lean * 0.25, 0, 0)
    fk(rig, "spine02", lean * 0.30, 0, 0)
    fk(rig, "spine03", lean * 0.35, 0, 0)
    fk(rig, "spine04", lean * 0.30, 0, 0)
    fk(rig, "spine05", -lean * 0.25, 0, 0)
    fk(rig, "neck01", -0.45, 0, 0)
    fk(rig, "neck02", -0.10, 0, 0)
    fk(rig, "head", -0.10, 0, 0)
    fk(rig, "clavicle.L", 0, -0.25, 0)
    fk(rig, "clavicle.R", 0, 0.25, 0)
    targets["arm.L"].location = (-0.30, 0.30, 1.02)
    targets["arm.R"].location = (0.30, 0.30, 1.02)
    targets["leg.L"].location = (-0.18, 0.10, 0.55)
    targets["leg.R"].location = (0.18, 0.10, 0.55)
    poles["arm.L"].location = (-0.42, 0.18, 1.20)
    poles["arm.R"].location = (0.42, 0.18, 1.20)
    poles["leg.L"].location = (-0.16, 0.42, 0.78)
    poles["leg.R"].location = (0.16, 0.42, 0.78)
    fk(rig, "wrist.L", 0.3, 0, 0)
    fk(rig, "wrist.R", 0.3, 0, 0)


def standing(rig):
    """Standing on pegs."""
    base_riding(rig, lean=0.25, hip_z=0.92)
    targets["leg.L"].location = (-0.18, 0.12, 0.62)
    targets["leg.R"].location = (0.18, 0.12, 0.62)
    fk(rig, "spine01", 0.35, 0, 0)
    fk(rig, "spine02", 0.2, 0, 0)
    fk(rig, "neck01", -0.5, 0, 0)


def side_lean(rig, amount, fwd=0.0):
    """Lean rider laterally (turn) + slight forward shift."""
    base_riding(rig, lean=0.45 + fwd)
    fk(rig, "root", 0, amount * 0.35, 0)
    fk(rig, "spine02", 0.1, 0, amount * 0.5)
    fk(rig, "spine03", 0.1, 0, amount * 0.6)
    fk(rig, "spine04", 0.1, 0, amount * 0.4)
    fk(rig, "neck01", -0.45, 0, -amount * 0.3)
    fk(rig, "head", -0.1, 0, -amount * 0.35)
    if amount > 0:  # right turn: right arm extended, left bent
        targets["arm.R"].location = (0.34, 0.34, 1.04)
        targets["arm.L"].location = (-0.26, 0.24, 1.00)
        targets["leg.R"].location = (0.20, 0.14, 0.55)
    else:
        targets["arm.L"].location = (-0.34, 0.34, 1.04)
        targets["arm.R"].location = (0.26, 0.24, 1.00)
        targets["leg.L"].location = (-0.20, 0.14, 0.55)


def arms_up(rig, amount=1.0):
    """Arms out/up (tricks)."""
    targets["arm.L"].location = (-0.42 * amount, 0.05, 1.42 * amount + 0.2)
    targets["arm.R"].location = (0.42 * amount, 0.05, 1.42 * amount + 0.2)
    poles["arm.L"].location = (-0.5, 0.1, 1.5)
    poles["arm.R"].location = (0.5, 0.1, 1.5)


def legs_out(rig, amount=1.0, back=False):
    """Legs extended off pegs (tricks)."""
    y_off = -0.35 if back else 0.45
    targets["leg.L"].location = (-0.30 * amount, y_off * amount, 0.62)
    targets["leg.R"].location = (0.30 * amount, y_off * amount, 0.62)


def set_ik(rig, state=True):
    for pb in rig.pose.bones:
        for c in pb.constraints:
            if c.type == "IK":
                c.influence = 1.0 if state else 0.0


# ---------------------------------------------------------------------------
# Clip definitions: {name: [ (frame, pose_fn, kwargs), ... ]}
# ---------------------------------------------------------------------------
CLIPS = {
    "menu_idle": [(0, "base", {}), (F, "base", {})],
    "gate_idle": [(0, "base", {"lean": 0.5}), (F, "base", {"lean": 0.5})],
    "ready": [(0, "base", {"lean": 0.55}), (F, "base", {"lean": 0.55})],
    "launch": [(0, "base", {"lean": 0.65, "hip_z": 0.74}),
               (F, "base", {"lean": 0.2, "hip_z": 0.8})],
    "ride_seated": [(0, "base", {}), (F, "base", {})],
    "ride_standing": [(0, "standing", {}), (F, "standing", {})],
    "brake_hard": [(0, "base", {"lean": 0.25}),
                   (F, "base", {"lean": 0.85})],
    "turn_left": [(0, "lean", {"amount": -1.0}), (F, "lean", {"amount": -1.0})],
    "turn_right": [(0, "lean", {"amount": 1.0}), (F, "lean", {"amount": 1.0})],
    "berm_left": [(0, "lean", {"amount": -1.4, "fwd": -0.1}),
                  (F, "lean", {"amount": -1.4, "fwd": -0.1})],
    "jump_preload": [(0, "base", {"lean": 0.3, "hip_z": 0.66}),
                     (F, "base", {"lean": 0.3, "hip_z": 0.66})],
    "airborne": [(0, "base", {"lean": 0.15}), (F, "base", {"lean": 0.15})],
    "nose_high": [(0, "base", {"lean": -0.4}), (F, "base", {"lean": -0.4})],
    "nose_low": [(0, "base", {"lean": 0.85}), (F, "base", {"lean": 0.85})],
    "whip_left": [(0, "lean", {"amount": -1.2}), (F, "lean", {"amount": -1.2})],
    "whip_right": [(0, "lean", {"amount": 1.2}), (F, "lean", {"amount": 1.2})],
    "scrub": [(0, "base", {"lean": 0.7, "hip_z": 0.68}),
              (F, "base", {"lean": 0.7, "hip_z": 0.68})],
    "landing": [(0, "base", {"lean": 0.4, "hip_z": 0.7}),
                (F, "base", {"lean": 0.4, "hip_z": 0.7})],
    "hard_landing": [(0, "base", {"lean": 0.55, "hip_z": 0.62}),
                     (F, "base", {"lean": 0.55, "hip_z": 0.62})],
    "wheelie": [(0, "base", {"lean": -0.5}), (F, "base", {"lean": -0.5})],
    "stoppie": [(0, "base", {"lean": 0.95, "hip_z": 0.86}),
                (F, "base", {"lean": 0.95, "hip_z": 0.86})],
    "no_hander": [(0, "trick", {"arms": 0.0, "legs": 0.0}),
                  (F, "trick", {"arms": 0.0, "legs": 0.0})],
    "no_footer": [(0, "trick", {"arms": 0.0, "legs": 0.9}),
                  (F, "trick", {"arms": 0.0, "legs": 0.9})],
    "cancan": [(0, "trick", {"arms": 0.0, "legs": 0.8}),
               (F, "trick", {"arms": 0.0, "legs": 0.8})],
    "nacnac": [(0, "trick", {"arms": 0.0, "legs": -0.8}),
               (F, "trick", {"arms": 0.0, "legs": -0.8})],
    "superman": [(0, "trick", {"arms": 0.6, "legs": -1.0}),
                 (F, "trick", {"arms": 0.6, "legs": -1.0})],
    "seat_grab": [(0, "trick", {"arms": -0.5, "legs": 0.0}),
                  (F, "trick", {"arms": -0.5, "legs": 0.0})],
    "heel_clicker": [(0, "trick", {"arms": 0.0, "legs": -1.2}),
                     (F, "trick", {"arms": 0.0, "legs": -1.2})],
    "backflip_tuck": [(0, "base", {"lean": 0.5, "hip_z": 0.7}),
                      (F, "base", {"lean": 0.5, "hip_z": 0.7})],
    "atv_seat_stand": [(0, "standing", {}), (F, "standing", {})],
    "atv_side_ext": [(0, "lean", {"amount": -1.2}),
                     (F, "lean", {"amount": -1.2})],
    "bail": [(0, "trick", {"arms": 1.0, "legs": 1.0}),
             (F, "trick", {"arms": 1.0, "legs": 1.0})],
}


def apply_pose(rig, name, kwargs):
    set_ik(rig, True)
    if name == "base":
        base_riding(rig, **kwargs)
    elif name == "standing":
        standing(rig)
    elif name == "lean":
        side_lean(rig, kwargs.get("amount", 0), kwargs.get("fwd", 0.0))
    elif name == "trick":
        base_riding(rig, lean=kwargs.get("lean", 0.3))
        set_ik(rig, False)
        if kwargs.get("arms", 0) > 0.4:
            arms_up(rig, kwargs["arms"])
        if kwargs.get("arms", 0) < -0.3:
            # seat grab: hands down/back
            fk(rig, "clavicle.L", 0, 0.8, 0)
            fk(rig, "clavicle.R", 0, -0.8, 0)
        if kwargs.get("legs", 0) != 0:
            legs_out(rig, abs(kwargs["legs"]), back=kwargs["legs"] < 0)


def key_all(rig, frame):
    for obj in list(targets.values()) + list(poles.values()):
        obj.keyframe_insert("location", frame=frame)
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_euler", frame=frame)
    rig.pose.bones["root"].keyframe_insert("location", frame=frame)


def bake_action(rig, name):
    scene = bpy.context.scene
    scene.frame_start = 0
    scene.frame_end = F
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(True)
    bpy.ops.nla.bake(frame_start=0, frame_end=F, only_selected=True,
                     visual_keying=True, clear_constraints=False,
                     use_current_action=True, bake_types={"POSE"})
    action = rig.animation_data.action
    action.name = name
    return action


def inspect_glb(path):
    """Return list of animation names in a GLB (json chunk)."""
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<4sII", f.read(12))
        assert magic == b"glTF"
        chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
        assert chunk_type == b"JSON"
        data = json.loads(f.read(chunk_len))
    return [a.get("name") for a in data.get("animations", [])]


def export_clip(rig, name):
    """Export armature-only GLB with the baked action."""
    os.makedirs(ANIM_DIR, exist_ok=True)
    path = os.path.join(ANIM_DIR, f"{name}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    X.export_glb(path, objects=[rig], apply_modifiers=False, y_up=True)
    anims = inspect_glb(path)
    print(f"clip {name}: animations={anims}")
    return path


def write_manifest(exported):
    manifest = {"clips": sorted(exported), "fps": 30.0, "frames": F}
    with open(ANIM_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1)
    print("manifest:", ANIM_MANIFEST)


if __name__ == "__main__":
    X.clear_scene()
    rig = setup_rig()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    add_ik(rig)
    only = os.environ.get("ANIM_ONLY")
    clip_list = [only] if only else list(CLIPS)
    exported = []
    for clip in clip_list:
        # reset pose
        for step in CLIPS[clip]:
            frame, pose_name, kwargs = step
            apply_pose(rig, pose_name, kwargs)
            key_all(rig, frame)
        bake_action(rig, clip)
        export_clip(rig, clip)
        exported.append(clip)
        # drop the action before the next clip
        bpy.ops.object.mode_set(mode="POSE")
        if rig.animation_data:
            rig.animation_data.action = None
    write_manifest(exported)
    print("ANIMATIONS DONE")
