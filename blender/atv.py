"""Build the five ATV classes as GLB assets. Distinct chassis widths,
wheelbases, tires and engines per class, driven by blender/common/specs.py.

Run: blender --background --python blender/atv.py  (env ATV_CLASS / ATV_RENDER)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import common  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402
from common import render as R  # noqa: E402
from common.specs import ATV_CLASSES  # noqa: E402

CLASS_COLORS = {
    "atv90": ((0.35, 0.78, 0.25), (0.95, 0.95, 0.95)),
    "atv250": ((0.95, 0.45, 0.08), (0.08, 0.08, 0.09)),
    "atv450": ((0.82, 0.10, 0.08), (0.95, 0.95, 0.95)),
    "atv700": ((0.10, 0.35, 0.85), (0.95, 0.95, 0.95)),
    "atvopen": ((0.08, 0.09, 0.10), (0.82, 0.10, 0.08)),
}
CLASS_NUMBERS = {"atv90": "2", "atv250": "11", "atv450": "27",
                 "atv700": "5", "atvopen": "9"}


class AtvBuilder:
    def __init__(self, cid, spec):
        self.cid = cid
        self.s = spec
        self.wb = spec["wheelbase"]
        self.tw = spec["track_width"]   # half-track used below
        self.r = spec["tire_d"] / 2
        self.tw2 = spec["tire_width"] / 2
        self.fy = self.wb / 2
        self.ry = -self.wb / 2
        self.axle_z = self.r
        self.chassis_z = spec["seat_height"] - 0.10
        primary, secondary = CLASS_COLORS[cid]
        pfx = f"p_{cid}"
        self.c = dict(
            plastic=mat.plastic(f"{pfx}_plastic", primary),
            plastic2=mat.plastic(f"{pfx}_plastic2", secondary),
            black=mat.plastic(f"{pfx}_black", (0.07, 0.07, 0.08)),
            plate=mat.plastic(f"{pfx}_plate", (0.96, 0.96, 0.97)),
            frame=mat.aluminum(),
            steel=mat.steel(),
            alu=mat.aluminum(),
            rubber=mat.rubber(),
            seat=mat.leather(f"{pfx}_seat", (0.08, 0.07, 0.07)),
            shock=mat.painted_steel(f"{pfx}_shock", (0.62, 0.55, 0.35)),
            engine=mat.aluminum(),
            engine_dark=mat.painted_steel(f"{pfx}_engd", (0.2, 0.2, 0.22)),
            exhaust=mat.painted_steel(f"{pfx}_exh", (0.55, 0.57, 0.6)),
        )
        self.collection = bpy.context.scene.collection
        self.objs = []

    def o(self, obj):
        self.objs.append(obj)
        return obj

    # -- wheels -------------------------------------------------------------
    def wheel(self, name, x, y, wide=False):
        hub = M.empty(name, (x, y, self.axle_z), self.collection)
        self.objs.append(hub)
        t = self.s["tire_width"] * (1.2 if wide else 1.0)
        tire = self.o(M.torus(f"{name}_tire", self.r - t * 0.42, t * 0.52,
                              (x, y, self.axle_z), rotation=(0, 1.5708, 0),
                              major_segments=24, minor_segments=10))
        M.assign(tire, self.c["rubber"])
        tire.parent = hub
        rim = self.o(M.cyl(f"{name}_rim", self.r * 0.5, t * 0.5, (x, y, self.axle_z),
                           rotation=(1.5708, 0, 0), vertices=16))
        M.assign(rim, self.c["alu"])
        rim.parent = hub
        for k in range(16):
            a = 6.2832 * k / 16
            for sx in (-1, 1):
                knob = self.o(M.box(f"{name}_knob_{k}_{sx}",
                                    (t * 0.30, 0.07, 0.05),
                                    (x + sx * (self.r - t * 0.16),
                                     y, self.axle_z)))
                M.assign(knob, self.c["rubber"])
                knob.rotation_euler = (0, a + sx * 0.35, 0)
                knob.parent = hub
        return hub

    # -- frame --------------------------------------------------------------
    def frame(self):
        s = self.s
        cz = self.chassis_z
        tube = 0.03
        # lower rails: four corners of the chassis box
        for sx in (-1, 1):
            self.o(M.tube_between((sx * self.tw * 0.45, self.fy - 0.12, cz - 0.10),
                           (sx * self.tw * 0.45, self.ry + 0.06, cz - 0.10),
                           tube, f"b_rail_{sx}", collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
        for sy in (self.fy - 0.12, self.ry + 0.06):
            self.o(M.tube_between((-self.tw * 0.45, sy, cz - 0.10),
                           (self.tw * 0.45, sy, cz - 0.10),
                           tube, f"b_cross_{sy:.1f}", collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
        # upper rails
        for sx in (-1, 1):
            self.o(M.tube_between((sx * self.tw * 0.36, self.fy - 0.14, cz + 0.10),
                           (sx * self.tw * 0.36, self.ry + 0.12, cz + 0.10),
                           tube, f"b_rail2_{sx}", collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
        # steering column
        head = Vector((0, self.fy + 0.10, cz + 0.32))
        self.o(M.tube_between(Vector((0, self.fy - 0.10, cz + 0.02)), head,
                       tube * 1.3, "b_steer_col", collection=self.collection))
        self.objs[-1].data.materials.append(self.c["alu"])
        self.head = head

    # -- suspension ---------------------------------------------------------
    def suspension(self):
        s = self.s
        cz = self.chassis_z
        for sx in (-1, 1):
            x = sx * self.tw * 0.47
            # A-arms
            self.o(M.tube_between((x * 0.55, self.fy, cz - 0.02),
                           (x, self.fy + 0.10, cz - 0.06),
                           0.022, f"b_aarm_lo_{sx}", 8, collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
            self.o(M.tube_between((x * 0.55, self.fy, cz + 0.14),
                           (x, self.fy + 0.12, cz + 0.04),
                           0.018, f"b_aarm_hi_{sx}", 8, collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
            shock = self.o(M.cyl(f"b_fshock_{sx}", 0.026, 0.30,
                                 (x * 0.8, self.fy + 0.02, cz + 0.22),
                                 rotation=(0.35, 0, sx * 0.4), vertices=10))
            M.assign(shock, self.c["shock"])
        # rear swingarm
        for sx in (-1, 1):
            self.o(M.tube_between((sx * self.tw * 0.3, self.ry + 0.24, cz - 0.04),
                           (sx * self.tw * 0.47, self.ry - 0.08, cz - 0.08),
                           0.024, f"b_swing_{sx}", 8, collection=self.collection))
            self.objs[-1].data.materials.append(self.c["frame"])
            shock = self.o(M.cyl(f"b_rshock_{sx}", 0.028, 0.34,
                                 (sx * self.tw * 0.34, self.ry + 0.16, cz + 0.26),
                                 rotation=(0.6, 0, sx * 0.3), vertices=10))
            M.assign(shock, self.c["shock"])
        # rear axle
        self.o(M.cyl("b_rear_axle", 0.02, self.tw * 1.02, (0, self.ry, self.axle_z),
                     rotation=(1.5708, 0, 0), vertices=10))
        self.objs[-1].data.materials.append(self.c["steel"])

    # -- engine & exhaust ---------------------------------------------------
    def engine(self):
        s = self.s
        es = (s["chassis"][0] * 0.5, s["chassis"][2] * 1.4, s["chassis"][1] * 0.9)
        cz = self.chassis_z
        cy = self.ry + 0.28
        case = self.o(M.box("b_engine", (es[0], es[1], es[2]), (0, cy, cz + 0.02)))
        M.assign(case, self.c["engine"])
        M.bevel(case, 0.04, 2)
        head = self.o(M.box("b_engine_head", (es[0] * 0.8, es[1] * 0.8, es[2] * 0.4),
                            (0, cy - 0.02, cz + es[2] * 0.7)))
        M.assign(head, self.c["engine_dark"])
        M.bevel(head, 0.02, 1)
        for i in range(4):
            fin = self.o(M.box(f"b_fin_{i}", (es[0] * 0.85, es[1] * 0.85, 0.012),
                               (0, cy - 0.02, cz + 0.10 + i * 0.04)))
            M.assign(fin, self.c["alu"])
        # exhaust: port to silencer on right side
        port = Vector((es[0] * 0.45, cy - es[1] * 0.45, cz + 0.05))
        p2 = Vector((self.tw * 0.4, cy - 0.10, cz + 0.05))
        p3 = Vector((self.tw * 0.4, self.ry - 0.05, cz + 0.12))
        self.o(M.tube_between(port, p2, 0.03, "b_exh1", 8, collection=self.collection))
        self.objs[-1].data.materials.append(self.c["exhaust"])
        self.o(M.tube_between(p2, p3, 0.035, "b_exh2", 8, collection=self.collection))
        self.objs[-1].data.materials.append(self.c["exhaust"])
        sil = self.o(M.cyl("b_silencer", 0.05, 0.4, tuple(p3),
                           rotation=(1.5708, 0, 0), vertices=12))
        M.assign(sil, self.c["exhaust"])
        sil.rotation_euler = (1.5708, 0, 0)

    # -- bodywork -----------------------------------------------------------
    def body(self):
        s = self.s
        cz = self.chassis_z
        # front hood (covers upper front)
        hood = self.o(M.box("b_hood", (self.tw * 0.72, 0.46, 0.18),
                            (0, self.fy + 0.02, cz + 0.38)))
        M.assign(hood, self.c["plastic"])
        M.bevel(hood, 0.06, 2)
        hood.rotation_euler = (0.25, 0, 0)
        # front fenders
        for sx in (-1, 1):
            f = self.o(M.arc_sheet(f"b_ffender_{sx}", self.r + 0.04, 130,
                                   self.tw * 0.34,
                                   (sx * self.tw * 0.47, self.fy + 0.02,
                                    self.axle_z + self.r + 0.03),
                                   segments=12))
            M.assign(f, self.c["plastic"])
            M.solid(f, 0.006)
            f.rotation_euler = (0.4, 0, 1.5708)
        # tank cover
        tank = self.o(M.box("b_tank", (self.tw * 0.4, 0.5, 0.22),
                            (0, self.ry + 0.34, cz + 0.44)))
        M.assign(tank, self.c["plastic"])
        M.bevel(tank, 0.06, 2)
        # seat
        seat = self.o(M.box("b_seat", (self.tw * 0.34, 0.55, 0.09),
                            (0, self.ry + 0.22, cz + 0.55)))
        M.assign(seat, self.c["seat"])
        M.bevel(seat, 0.04, 2)
        # rear fenders
        for sx in (-1, 1):
            f = self.o(M.arc_sheet(f"b_rfender_{sx}", self.r + 0.05, 140,
                                   self.tw * 0.36,
                                   (sx * self.tw * 0.47, self.ry - 0.02,
                                    self.axle_z + self.r + 0.03),
                                   segments=12))
            M.assign(f, self.c["plastic"])
            M.solid(f, 0.006)
            f.rotation_euler = (-0.5, 0, 1.5708)
        # front bumper
        bumper = self.o(M.tube_between(
            (-self.tw * 0.4, self.fy + 0.28, cz + 0.05),
            (self.tw * 0.4, self.fy + 0.28, cz + 0.05),
            0.022, "b_bumper", 8, collection=self.collection))
        M.assign(bumper, self.c["steel"])
        # front number plate
        plate = self.o(M.box("b_plate", (self.tw * 0.34, 0.014, 0.20),
                             (0, self.fy + 0.18, cz + 0.5)))
        M.assign(plate, self.c["plate"])
        M.bevel(plate, 0.006, 1)
        num = self.o(M.text_obj("b_num", CLASS_NUMBERS[self.cid], 0.12, 0.0012,
                                (0, self.fy + 0.18, cz + 0.5)))
        M.assign(num, mat.painted_steel(f"p_{self.cid}_ink", (0.05, 0.05, 0.06)))
        num.rotation_euler = (1.5708, 0, 0)
        num.location = (0, self.fy + 0.18, cz + 0.5)
        # handlebar
        bar = self.o(M.cyl("b_handlebar", 0.016, self.s["bar_width"],
                           (0, self.fy - 0.02, self.head.z + 0.02),
                           rotation=(0, 1.5708, 0.1), vertices=10))
        M.assign(bar, self.c["alu"])
        for sx in (-1, 1):
            grip = self.o(M.cyl(f"b_grip_{sx}", 0.021, 0.10,
                                (sx * self.s["bar_width"] / 2, self.fy - 0.02,
                                 self.head.z + 0.02), rotation=(0, 1.5708, 0),
                                vertices=10))
            M.assign(grip, self.c["rubber"])
            e = M.empty(f"b_grip_{'L' if sx < 0 else 'R'}",
                        (sx * self.s["bar_width"] / 2, self.fy - 0.02,
                         self.head.z + 0.02), self.collection)
            self.objs.append(e)
        # nerf bars + pegs
        for sx in (-1, 1):
            self.o(M.tube_between((sx * self.tw * 0.30, self.fy - 0.10, cz - 0.02),
                           (sx * self.tw * 0.42, self.ry + 0.02, cz - 0.02),
                           0.018, f"b_nerf_{sx}", 8, collection=self.collection))
            self.objs[-1].data.materials.append(self.c["steel"])
            peg = self.o(M.box(f"b_peg_{sx}", (0.10, 0.025, 0.015),
                               (sx * self.tw * 0.30, self.ry + 0.34, cz - 0.10)))
            M.assign(peg, self.c["steel"])
        e = M.empty("b_hip", (0, self.ry + 0.20, cz + 0.60), self.collection)
        self.objs.append(e)


SMALL_PARTS = ("knob", "fin", "grip", "num", "nerf", "peg")


def build(cid, render=False):
    X.clear_scene()
    mat._MAT_CACHE.clear()
    spec = ATV_CLASSES[cid]
    b = AtvBuilder(cid, spec)
    hx = spec["track_width"] * 0.47
    b.wheel("b_wheel_fl", -hx, b.fy)
    b.wheel("b_wheel_fr", hx, b.fy)
    b.wheel("b_wheel_rl", -hx, b.ry, wide=True)
    b.wheel("b_wheel_rr", hx, b.ry, wide=True)
    b.frame()
    b.suspension()
    b.engine()
    b.body()
    out_dir = os.path.join(common.ASSETS, "vehicles")
    path = os.path.join(out_dir, f"{cid}.glb")
    X.export_glb(path, objects=None)
    bpy.ops.object.select_all(action="DESELECT")
    lod_objects = [o for o in bpy.context.scene.objects
                   if o.type == "EMPTY" or not any(p in o.name for p in SMALL_PARTS)]
    X.export_glb(path.replace(".glb", "_lod1.glb"), objects=lod_objects)
    if render:
        R.studio_rig(collection=b.collection)
        R.render_turntable(bpy.context.scene, None,
                           os.path.join(common.RENDERS, f"turntable_{cid}"),
                           frames=4, distance=4.4, height=1.1,
                           target=(0, 0, 0.65), res=(800, 450))
    print("built:", cid)
    return path


if __name__ == "__main__":
    only = os.environ.get("ATV_CLASS")
    do_render = os.environ.get("ATV_RENDER") == "1"
    ids = [only] if only else list(ATV_CLASSES)
    for cid in ids:
        build(cid, render=do_render)
    print("ATVS DONE")
