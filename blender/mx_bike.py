"""Build the six MX bike classes as GLB assets. Each class has genuinely
different proportions (wheelbase, wheels, frame, engine, exhaust) driven by
blender/common/specs.py.

Run: blender --background --python blender/mx_bike.py
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
from common.specs import MX_CLASSES  # noqa: E402

CLASS_COLORS = {
    "mx50": ((0.35, 0.78, 0.25), (0.95, 0.95, 0.95)),
    "mx85": ((0.95, 0.45, 0.08), (0.95, 0.95, 0.95)),
    "mx125": ((0.82, 0.10, 0.08), (0.95, 0.95, 0.95)),
    "mx250": ((0.10, 0.35, 0.85), (0.92, 0.92, 0.95)),
    "mx450": ((0.92, 0.78, 0.08), (0.08, 0.10, 0.12)),
    "mx500": ((0.08, 0.09, 0.10), (0.82, 0.10, 0.08)),
}
CLASS_NUMBERS = {"mx50": "2", "mx85": "14", "mx125": "33",
                 "mx250": "21", "mx450": "7", "mx500": "1"}


class MxBikeBuilder:
    def __init__(self, cid, spec):
        self.cid = cid
        self.s = spec
        self.wb = spec["wheelbase"]
        self.rf = spec["front_wheel_d"] / 2
        self.rr = spec["rear_wheel_d"] / 2
        self.fy = self.wb / 2      # front axle y
        self.ry = -self.wb / 2     # rear axle y
        self.axle_z = max(self.rf, self.rr)
        self.seat_top = spec["seat_height"] - 0.04
        primary, secondary = CLASS_COLORS[cid]
        self.c = dict(
            plastic=mat.plastic(f"p_{cid}_plastic", primary),
            plastic2=mat.plastic(f"p_{cid}_plastic2", secondary),
            black_plastic=mat.plastic(f"p_{cid}_black", (0.07, 0.07, 0.08)),
            plate=mat.plastic(f"p_{cid}_plate", (0.96, 0.96, 0.97)),
            frame=mat.aluminum(),
            steel=mat.steel(),
            alu=mat.aluminum(),
            rubber=mat.rubber(),
            seat=mat.leather(f"p_{cid}_seat", (0.08, 0.07, 0.07)),
            fork_lower=mat.painted_steel(f"p_{cid}_forklo", (0.62, 0.55, 0.35)),
            engine=mat.aluminum(),
            engine_dark=mat.painted_steel(f"p_{cid}_engd", (0.2, 0.2, 0.22)),
            exhaust=mat.painted_steel(f"p_{cid}_exh", (0.55, 0.57, 0.6)),
            carbon=mat.carbon(),
        )
        self.collection = bpy.context.scene.collection
        self.objs = []

    def o(self, obj, name=None):
        if name:
            obj.name = name
        self.objs.append(obj)
        return obj

    # -- wheels -------------------------------------------------------------
    def wheel(self, name, radius, tire_w, y, front=True):
        if not front:
            tire_w = self.s["tire_width"] * 1.15
        hub = M.empty(name, (0, y, self.axle_z), self.collection)
        self.objs.append(hub)
        tire = self.o(M.torus(f"{name}_tire", radius - tire_w * 0.45,
                              tire_w * 0.55, (0, y, self.axle_z),
                              rotation=(0, 1.5708, 0), minor_segments=10), f"{name}_tire")
        M.assign(tire, self.c["rubber"])
        tire.parent = hub
        rim_r = radius * 0.55
        rim = self.o(M.cyl(f"{name}_rim", rim_r, tire_w * 0.45, (0, y, self.axle_z),
                           rotation=(1.5708, 0, 0), vertices=18), f"{name}_rim")
        M.assign(rim, self.c["alu"])
        rim.parent = hub
        hubc = self.o(M.cyl(f"{name}_hub", tire_w * 0.22, tire_w * 0.9,
                            (0, y, self.axle_z), rotation=(1.5708, 0, 0),
                            vertices=12), f"{name}_hub")
        M.assign(hubc, self.c["steel"])
        hubc.parent = hub
        # knobby tread: two rows of lugs
        for k in range(14):
            a = 6.2832 * k / 14
            for side_x in (-1, 1):
                knob = self.o(M.box(f"{name}_knob_{k}_{side_x}",
                                    (tire_w * 0.32, 0.06, 0.045),
                                    (side_x * (radius - tire_w * 0.18),
                                     y, self.axle_z)), f"{name}_knob")
                M.assign(knob, self.c["rubber"])
                knob.rotation_euler = (0, a + side_x * 0.35, 0)
                knob.parent = hub
        disc = self.o(M.disc(f"{name}_disc", radius * 0.35, 0.008,
                             (tire_w * 0.62, y, self.axle_z), 16), f"{name}_disc")
        M.assign(disc, self.c["steel"])
        disc.parent = hub
        return hub

    # -- frame --------------------------------------------------------------
    def frame(self):
        s = self.s
        head = Vector((0, self.fy - 0.04, self.axle_z + self.rf * 1.5))
        seat_rear = Vector((0, self.ry + 0.10, self.seat_top + 0.06))
        pivot = Vector((0, self.ry + 0.32, self.axle_z + 0.05))
        tube_r = s["frame_tube"]
        M.tube_between(head, seat_rear, tube_r, "b_frame_spine", collection=self.collection)
        self.objs[-1].data.materials.append(self.c["frame"])
        M.tube_between(seat_rear, pivot + Vector((0, 0, 0.10)), tube_r,
                       "b_frame_seat_rail", collection=self.collection)
        self.objs[-1].data.materials.append(self.c["frame"])
        eng_top = Vector((0, self.ry + 0.16, self.axle_z + 0.05))
        M.tube_between(head, eng_top, tube_r, "b_frame_down", collection=self.collection)
        self.objs[-1].data.materials.append(self.c["frame"])
        # swingarm pivot axle
        self.o(M.cyl("b_swing_pivot", 0.014, s["bar_width"] * 0.5,
                     tuple(pivot), rotation=(1.5708, 0, 0), vertices=10),
               "b_swing_pivot")
        self.objs[-1].data.materials.append(self.c["steel"])
        # steering head tube
        self.o(M.cyl("b_head_tube", tube_r * 1.4, s["bar_width"] * 0.34,
                     tuple(head), rotation=(0, 1.5708, 0), vertices=10),
               "b_head_tube")
        self.objs[-1].data.materials.append(self.c["alu"])
        self.head = head
        self.pivot = pivot

    # -- front end ----------------------------------------------------------
    def front_end(self):
        s = self.s
        head = self.head
        axle = Vector((0, self.fy, self.axle_z))
        # forks: two tubes raked back 25 deg from head to axle
        rake = 0.4363  # 25 deg
        dir_v = (axle - head).normalized()
        mid = (head + axle) / 2
        for sx in (-1, 1):
            off = Vector((sx * s["bar_width"] * 0.24, 0, 0))
            upper = self.o(M.cyl(f"b_fork_upper_{sx}", 0.022,
                                 (axle - head).length * 0.55,
                                 head + off + dir_v * 0.1,
                                 rotation=dir_v.to_track_quat("Z", "Y").to_euler(),
                                 vertices=10), f"b_fork_upper_{sx}")
            M.assign(upper, self.c["alu"])
            lower = self.o(M.cyl(f"b_fork_lower_{sx}", 0.024,
                                 (axle - head).length * 0.5,
                                 mid + off, rotation=dir_v.to_track_quat("Z", "Y").to_euler(),
                                 vertices=10), f"b_fork_lower_{sx}")
            M.assign(lower, self.c["fork_lower"])
        # triple clamps
        for zz in (0.02, -0.06):
            clamp = self.o(M.box(f"b_clamp_{zz:.0f}", (s["bar_width"] * 0.62, 0.045, 0.035),
                                 (0, head.y + zz, head.z)), f"b_clamp")
            M.assign(clamp, self.c["alu"])
        # handlebar
        bar_y = head.y - 0.03
        bar_z = head.z + 0.16
        self.bar = self.o(M.cyl("b_handlebar", 0.016, s["bar_width"],
                                (0, bar_y, bar_z), rotation=(0, 1.5708, 0.1),
                                vertices=10), "b_handlebar")
        M.assign(self.bar, self.c["alu"])
        for sx in (-1, 1):
            grip = self.o(M.cyl(f"b_grip_{sx}", 0.02, 0.09,
                                (sx * s["bar_width"] / 2, bar_y, bar_z),
                                rotation=(0, 1.5708, 0), vertices=10), f"b_grip_{sx}")
            M.assign(grip, self.c["rubber"])
            lever = self.o(M.box(f"b_lever_{sx}", (0.012, 0.09, 0.012),
                                 (sx * (s["bar_width"] / 2 + 0.04), bar_y, bar_z + 0.01)),
                           f"b_lever_{sx}")
            M.assign(lever, self.c["steel"])
        self.grip_z = bar_z
        # hand anchors for the game
        for sx, name in ((-1, "b_grip_L"), (1, "b_grip_R")):
            e = M.empty(name, (sx * s["bar_width"] / 2, bar_y, bar_z), self.collection)
            self.objs.append(e)
        # front fender
        fender = self.o(M.arc_sheet("b_front_fender", self.rf + 0.03, 150,
                                    s["bar_width"] * 0.3,
                                    (0, self.fy + 0.02, self.axle_z + self.rf + 0.04),
                                    segments=14), "b_front_fender")
        M.assign(fender, self.c["plastic"])
        M.solid(fender, 0.006)
        M.bevel(fender, 0.01, 1)
        fender.rotation_euler = (0.35, 0, 1.5708)
        # front number plate
        plate = self.o(M.box("b_front_plate", (s["bar_width"] * 0.5, 0.012, 0.24),
                             (0, self.fy - 0.05, self.axle_z + self.rf * 1.6)),
                       "b_front_plate")
        M.assign(plate, self.c["plate"])
        M.bevel(plate, 0.008, 1)
        self._number(plate, "b_num_front", 0.001, 0.14)

    def _number(self, target, name, thickness, size):
        num = self.o(M.text_obj(name, CLASS_NUMBERS[self.cid], size, thickness,
                                (target.location.x, target.location.y,
                                 target.location.z + 0.005),
                                (0, 0, 0)), name)
        M.assign(num, mat.painted_steel(f"p_{name}_ink", (0.05, 0.05, 0.06)))
        num.rotation_euler = (1.5708, 0, 0)

    # -- engine & exhaust ---------------------------------------------------
    def engine(self):
        s = self.s
        es = s["engine_size"]  # (w, h, d)
        cy = self.ry + 0.18
        cz = self.axle_z + 0.02
        is_2t = "two-stroke" in s["engine"]
        case = self.o(M.box("b_engine_case", (es[0], es[2], es[1]),
                            (0, cy, cz)), "b_engine_case")
        M.assign(case, self.c["engine"])
        M.bevel(case, 0.03, 2)
        cyl_h = es[1] * 1.25
        cyl = self.o(M.box("b_engine_cyl", (es[0] * 0.7, es[2] * 0.7, cyl_h),
                           (0, cy - 0.02, cz + es[1] * 0.6)), "b_engine_cyl")
        M.assign(cyl, self.c["engine_dark"])
        M.bevel(cyl, 0.02, 1)
        head = self.o(M.box("b_engine_head", (es[0] * 0.8, es[2] * 0.8, es[1] * 0.35),
                            (0, cy - 0.03, cz + es[1] * 0.6 + cyl_h * 0.5)),
                      "b_engine_head")
        M.assign(head, self.c["alu"])
        M.bevel(head, 0.015, 1)
        # cooling fins
        n_fins = 5 if is_2t else 3
        for i in range(n_fins):
            fin = self.o(M.box(f"b_fin_{i}", (es[0] * 0.8, es[2] * 0.8, 0.012),
                               (0, cy - 0.02, cz + 0.10 + i * 0.035)), f"b_fin_{i}")
            M.assign(fin, self.c["alu"])
        # side covers
        for sx in (-1, 1):
            cover = self.o(M.disc(f"b_cover_{sx}", es[1] * 0.45, 0.02,
                                  (sx * es[0] / 2, cy, cz), 14), f"b_cover_{sx}")
            M.assign(cover, self.c["engine_dark"])
        # exhaust port at front of cylinder
        port = Vector((es[0] * 0.45, cy - es[2] * 0.45, cz + es[1] * 0.35))
        self.port = port
        self.exhaust(is_2t, port)

    def exhaust(self, is_2t, port):
        s = self.s
        sil_z = self.axle_z + 0.16
        sil_y = self.ry - 0.06
        length = s["exhaust_len"]
        x_side = s["bar_width"] * 0.30
        p2 = Vector((x_side, port.y - 0.10, port.z + 0.02))
        p3 = Vector((x_side, sil_y + 0.30, sil_z))
        p4 = Vector((x_side, sil_y, sil_z))
        if is_2t:
            # expansion chamber: cones
            c1 = self.o(M.cone("b_pipe_c1", 0.035, 0.09, 0.22, tuple(port),
                               collection=self.collection), "b_pipe_c1")
            c1.rotation_euler = (0.5, 0, 1.5708) if False else (1.5708, 0.5, 0)
            M.assign(c1, self.c["exhaust"])
            c1.location = tuple((port + p2) / 2)
            dir1 = (p2 - port).normalized()
            c1.rotation_euler = dir1.to_track_quat("Z", "Y").to_euler()
            c2 = self.o(M.cone("b_pipe_c2", 0.09, 0.04, 0.24, tuple((p2 + p3) / 2),
                               collection=self.collection), "b_pipe_c2")
            c2.rotation_euler = (p3 - p2).normalized().to_track_quat("Z", "Y").to_euler()
            M.assign(c2, self.c["exhaust"])
        else:
            h1 = self.o(M.tube_between(port, p2, 0.03, "b_header1", 10), "b_header1")
            M.assign(h1, self.c["exhaust"])
            h2 = self.o(M.tube_between(p2, p3, 0.035, "b_header2", 10), "b_header2")
            M.assign(h2, self.c["exhaust"])
        sil = self.o(M.cyl("b_silencer", 0.05, length, tuple(p4),
                           rotation=(1.5708, 0, 0), vertices=12), "b_silencer")
        M.assign(sil, self.c["exhaust"])
        sil.rotation_euler = (1.5708, 0, 0)
        M.bevel(sil, 0.02, 1)

    # -- swingarm + rear ----------------------------------------------------
    def rear(self):
        s = self.s
        pivot = self.pivot
        axle = Vector((0, self.ry, self.axle_z))
        for sx in (-1, 1):
            arm = self.o(M.tube_between(pivot + Vector((sx * s["bar_width"] * 0.2, 0, 0)),
                                        axle + Vector((sx * s["bar_width"] * 0.16, 0, 0)),
                                        0.022, f"b_swingarm_{sx}", 10), f"b_swingarm_{sx}")
            M.assign(arm, self.c["alu"])
        # axle blocks
        self.o(M.box("b_axle_block", (s["bar_width"] * 0.34, 0.05, 0.05),
                     (0, self.ry, self.axle_z)), "b_axle_block")
        self.objs[-1].data.materials.append(self.c["steel"])
        # shock
        shock = self.o(M.cyl("b_shock", 0.024, 0.28,
                             (0, self.ry + 0.18, self.axle_z + 0.26),
                             rotation=(0.5, 0, 0), vertices=10), "b_shock")
        M.assign(shock, self.c["fork_lower"])
        # chain guard
        guard = self.o(M.box("b_chain_guard", (0.035, 0.42, 0.12),
                             (s["bar_width"] * 0.26, self.ry + 0.10, self.axle_z + 0.04)),
                       "b_chain_guard")
        M.assign(guard, self.c["black_plastic"])
        # rear sprocket + disc
        sprocket = self.o(M.disc("b_sprocket", self.rr * 0.42, 0.012,
                                 (-s["bar_width"] * 0.30, self.ry, self.axle_z), 20),
                          "b_sprocket")
        M.assign(sprocket, self.c["steel"])

    # -- bodywork -----------------------------------------------------------
    def body(self):
        s = self.s
        # tank
        tank = self.o(M.box("b_tank", (s["bar_width"] * 0.36, 0.42, 0.20),
                            (0, self.ry + 0.42, self.axle_z + 0.38)), "b_tank")
        M.assign(tank, self.c["plastic"])
        M.bevel(tank, 0.07, 2)
        tank.rotation_euler = (0.12, 0, 0)
        # shrouds
        for sx in (-1, 1):
            shroud = self.o(M.box(f"b_shroud_{sx}", (0.02, 0.34, 0.30),
                                  (sx * s["bar_width"] * 0.30, self.ry + 0.30,
                                   self.axle_z + 0.30), ), f"b_shroud_{sx}")
            M.assign(shroud, self.c["plastic"])
            M.bevel(shroud, 0.04, 2)
            shroud.rotation_euler = (0.35, 0, sx * 0.25)
        # side plates
        for sx in (-1, 1):
            sp = self.o(M.box(f"b_sideplate_{sx}", (0.015, 0.34, 0.16),
                              (sx * s["bar_width"] * 0.26, self.ry + 0.16,
                               self.axle_z + 0.30)), f"b_sideplate_{sx}")
            M.assign(sp, self.c["plastic2"])
            M.bevel(sp, 0.02, 1)
            self._number(sp, f"b_num_side_{sx}", 0.001, 0.09)
        # seat
        seat = self.o(M.box("b_seat", (s["bar_width"] * 0.26, 0.5, 0.07),
                            (0, self.ry + 0.20, self.seat_top)), "b_seat")
        M.assign(seat, self.c["seat"])
        M.bevel(seat, 0.03, 2)
        seat.rotation_euler = (-0.06, 0, 0)
        # rear fender
        rf = self.o(M.arc_sheet("b_rear_fender", 0.42, 110,
                                s["bar_width"] * 0.24,
                                (0, self.ry - 0.10, self.axle_z + 0.34),
                                segments=12), "b_rear_fender")
        M.assign(rf, self.c["plastic"])
        M.solid(rf, 0.006)
        rf.rotation_euler = (-0.5, 0, 1.5708)
        # rider anchors
        e = M.empty("b_hip", (0, self.ry + 0.20, self.seat_top + 0.06), self.collection)
        self.objs.append(e)
        # footpegs
        for sx in (-1, 1):
            peg = self.o(M.box(f"b_peg_{sx}", (0.10, 0.025, 0.015),
                               (sx * s["bar_width"] * 0.22, self.ry + 0.34,
                                self.axle_z - 0.06)), f"b_peg_{sx}")
            M.assign(peg, self.c["steel"])


SMALL_PARTS = ("knob", "disc", "lever", "fin", "spoke", "grip", "num_")


def build(cid, render=False):
    X.clear_scene()
    mat._MAT_CACHE.clear()
    spec = MX_CLASSES[cid]
    b = MxBikeBuilder(cid, spec)
    hubs = dict(
        front=b.wheel("b_front_wheel", b.rf, spec["tire_width"], b.fy, front=True),
        rear=b.wheel("b_rear_wheel", b.rr, spec["tire_width"], b.ry, front=False),
    )
    b.frame()
    b.front_end()
    b.engine()
    b.rear()
    b.body()
    out_dir = os.path.join(common.ASSETS, "vehicles")
    path = os.path.join(out_dir, f"{cid}.glb")
    X.export_glb(path, objects=None)

    # LOD1: hierarchy-preserving reduced variant (drop knobs, discs, levers,
    # fins, grips, numbers) - empties stay so node names remain stable.
    bpy.ops.object.select_all(action="DESELECT")
    lod_objects = [o for o in bpy.context.scene.objects
                   if o.type == "EMPTY" or not any(p in o.name for p in SMALL_PARTS)]
    X.export_glb(path.replace(".glb", "_lod1.glb"), objects=lod_objects)

    if render:
        scene = bpy.context.scene
        R.studio_rig(collection=b.collection)
        R.render_turntable(scene, None,
                           os.path.join(common.RENDERS, f"turntable_{cid}"),
                           frames=4, distance=4.2, height=1.2,
                           target=(0, 0, 0.75), res=(800, 450))
    print("built:", cid)
    return path


if __name__ == "__main__":
    only = os.environ.get("MX_CLASS")
    do_render = os.environ.get("MX_RENDER") == "1"
    ids = [only] if only else list(MX_CLASSES)
    for cid in ids:
        build(cid, render=do_render)
    print("MX BIKES DONE")
