"""Apex Coliseum: arena bowl, stands, roof, lighting trusses, video boards,
scoreboard, tunnels, paddock garages, camera platforms, speaker arrays.
Bakes per-vertex AO into vertex colors and writes stadium_data.json
(lamp/board/seat-slot placements for the game).

Run: blender --background --python blender/stadium.py
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import common  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402

FLOOR_X, FLOOR_Y = 80.0, 52.0   # arena floor (Blender X/Y)
WALL_H = 2.2
ROOF_Z = 20.0
WALL_X = FLOOR_X / 2 + 2.0      # 42
WALL_Y = FLOOR_Y / 2 + 2.0      # 28

STANDS_ROWS = 6
ROW_D = 0.85
ROW_H = 0.45
BLOCK_W = 2.4

AO_DIRS = (
    (0.577, 0.577, 0.577), (-0.577, 0.577, 0.577), (0.577, -0.577, 0.577),
    (-0.577, -0.577, 0.577), (0.577, 0.577, -0.577), (-0.577, 0.577, -0.577),
    (0.577, -0.577, -0.577), (-0.577, -0.577, -0.577),
)

seat_slots = []
lamp_positions = []
board_info = {}


def _objs_of_types(scene, types):
    out = []
    for o in scene.objects:
        if o.type in types and o.data is not None:
            out.append(o)
    return out


# ---------------------------------------------------------------------------
def build_floor(coll):
    floor = M.box("floor", (FLOOR_X, FLOOR_Y, 0.10), (0, 0, -0.05), collection=coll)
    M.assign(floor, mat.dirt("m_floor_dirt", damp=0.2))
    return floor


def build_walls(coll):
    for sx, wall_len, pos in (
        (1, WALL_X * 2, (0, WALL_Y, WALL_H / 2)),
        (-1, WALL_X * 2, (0, -WALL_Y, WALL_H / 2)),
    ):
        w = M.box(f"wall_y_{sx}", (wall_len, 0.25, WALL_H), pos, collection=coll)
        M.assign(w, mat.concrete())
    for sy, wall_len, pos in (
        (1, FLOOR_Y, (WALL_X, 0, WALL_H / 2)),
        (-1, FLOOR_Y, (-WALL_X, 0, WALL_H / 2)),
    ):
        w = M.box(f"wall_x_{sy}", (0.25, wall_len, WALL_H), pos, collection=coll)
        M.assign(w, mat.concrete())
    # barrier stripe
    for side, length, center, rot in (
        ("n", WALL_X * 2, (0, WALL_Y + 0.13, 1.1), (1.5708, 0, 0)),
        ("s", WALL_X * 2, (0, -WALL_Y - 0.13, 1.1), (1.5708, 0, 0)),
        ("e", FLOOR_Y, (WALL_X + 0.13, 0, 1.1), (0, 1.5708, 0)),
        ("w", FLOOR_Y, (-WALL_X - 0.13, 0, 1.1), (0, 1.5708, 0)),
    ):
        stripe = M.box(f"barrier_{side}", (length, 0.04, 0.5), center, collection=coll)
        stripe.rotation_euler = rot
        M.assign(stripe, mat.painted_steel("m_barrier", (0.85, 0.15, 0.1)))


def build_stand_block():
    """One linked-duplicable stand block mesh (6 rising rows with seats)."""
    verts = []
    faces = []

    def box3(x0, x1, y0, y1, z0, z1):
        i = len(verts)
        verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                      (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6),
             (1, 2, 6, 5), (3, 0, 4, 7)]
        faces.extend([(a + i, b + i, c + i, d + i) for a, b, c, d in f])

    for r in range(STANDS_ROWS):
        y0 = r * ROW_D
        y1 = y0 + ROW_D
        z0 = r * ROW_H
        z1 = z0 + ROW_H
        box3(0, BLOCK_W, y0, y1, z0, z1)          # riser wedge
        box3(0, BLOCK_W, y1 - 0.12, y1, z1, z1 + 0.45)   # seat back
        box3(0.15, BLOCK_W - 0.15, y0 + 0.18, y0 + 0.55, z1, z1 + 0.10)  # seat
    mesh = bpy.data.meshes.new("stand_block")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("stand_block", mesh)
    return obj


def place_stands(coll):
    block = build_stand_block()
    # north + south
    for side, y_wall in ((1, WALL_Y + 0.3), (-1, -WALL_Y - 0.3)):
        y0 = y_wall
        for xi in range(-16, 17):
            x = xi * BLOCK_W
            o = bpy.data.objects.new(f"stand_{'n' if side > 0 else 's'}_{xi}",
                                     block.data)
            coll.objects.link(o)
            o.location = (x, y0, 0)
            if side > 0:
                o.rotation_euler = (0, 0, math.pi)
            for r in range(STANDS_ROWS):
                for sx in (0.35, 1.2, 2.05):
                    seat_slots.append([
                        round(x + sx, 3),
                        round(y0 - r * ROW_D - ROW_D * 0.55, 3),
                        round(r * ROW_H + ROW_H + 0.10, 3)])
    # east + west
    for side, x_wall in ((1, WALL_X + 0.3), (-1, -WALL_X - 0.3)):
        for yi in range(-9, 10):
            y = yi * BLOCK_W
            o = bpy.data.objects.new(f"stand_{'e' if side > 0 else 'w'}_{yi}",
                                     block.data)
            coll.objects.link(o)
            o.location = (x_wall, y, 0)
            o.rotation_euler = (0, 0, math.pi / 2 if side > 0 else -math.pi / 2)
            for r in range(STANDS_ROWS):
                for sx in (0.35, 1.2, 2.05):
                    seat_slots.append([
                        round(x_wall - (r * ROW_D + ROW_D * 0.55) * side, 3),
                        round(y + sx, 3),
                        round(r * ROW_H + ROW_H + 0.10, 3)])


def build_roof(coll):
    roof = M.box("roof", (WALL_X * 2 + 6, WALL_Y * 2 + 6, 0.30),
                 (0, 0, ROOF_Z + 0.15), collection=coll)
    M.assign(roof, mat.painted_steel("m_roof", (0.18, 0.19, 0.21)))
    # truss grid under roof
    for x in range(-40, 41, 8):
        t = M.box(f"truss_x_{x}", (0.5, WALL_Y * 2, 0.5), (x, 0, ROOF_Z - 1.0),
                  collection=coll)
        M.assign(t, mat.steel())
    for y in range(-24, 25, 8):
        t = M.box(f"truss_y_{y}", (WALL_X * 2, 0.5, 0.5), (0, y, ROOF_Z - 1.0),
                  collection=coll)
        M.assign(t, mat.steel())


def build_lights(coll):
    """4 lighting trusses with emissive lamp heads; records positions."""
    for y in (-14, 0, 14):
        rail = M.box(f"lightrail_{y}", (WALL_X * 2 - 4, 0.3, 0.3), (0, y, 16.2),
                     collection=coll)
        M.assign(rail, mat.steel())
        for x in range(-36, 37, 6):
            lamp = M.box(f"lamp_{y}_{x}", (1.6, 0.5, 0.3), (x, y, 16.0),
                         collection=coll)
            M.assign(lamp, mat.emissive(f"m_lamp_{y}_{x}", (1.0, 0.95, 0.85), 10))
            lamp_positions.append([x, y, 15.8])


def build_boards(coll):
    # north main video board
    board = M.box("video_board_n", (26.0, 0.25, 5.0), (0, WALL_Y - 0.15, 7.0),
                  collection=coll)
    M.assign(board, mat.video_board("m_vb_n", (0.08, 0.2, 0.5), 5))
    board_info["video_board_n"] = dict(pos=[0, WALL_Y - 0.15, 7.0],
                                       size=[26.0, 5.0], axis="y", facing=-1)
    board = M.box("video_board_s", (16.0, 0.25, 3.6), (0, -WALL_Y + 0.15, 6.5),
                  collection=coll)
    M.assign(board, mat.video_board("m_vb_s", (0.08, 0.2, 0.5), 5))
    board_info["video_board_s"] = dict(pos=[0, -WALL_Y + 0.15, 6.5],
                                       size=[16.0, 3.6], axis="y", facing=1)
    # scoreboard west
    sb = M.box("scoreboard", (8.0, 0.3, 3.0), (-WALL_X + 0.15, 0, 6.0),
               collection=coll)
    M.assign(sb, mat.emissive("m_score", (0.05, 0.05, 0.06), 3))
    board_info["scoreboard"] = dict(pos=[-WALL_X + 0.15, 0, 6.0],
                                    size=[8.0, 3.0], axis="x", facing=1)
    for i in range(3):
        strip = M.box(f"sb_strip_{i}", (6.5, 0.05, 0.4),
                      (-WALL_X + 0.20, -2.4 + 2.4 * i, 6.0), collection=coll)
        M.assign(strip, mat.emissive(f"m_sbs_{i}", (0.9, 0.15, 0.1), 8))


def build_tunnels(coll):
    """Vehicle entrance tunnel south + paddock garages."""
    tw, th = 8.0, 4.6
    tunnel_len = WALL_Y - FLOOR_Y / 2 + 8
    for sx, x_off in ((-1, tw / 2 + 0.15), (1, -tw / 2 - 0.15)):
        seg = M.box(f"tunnel_wall_{sx}", (0.25, tunnel_len, th),
                    (x_off, FLOOR_Y / 2 - 4, th / 2), collection=coll)
        M.assign(seg, mat.concrete())
    top = M.box("tunnel_roof", (tw + 0.5, tunnel_len, 0.25),
                (0, FLOOR_Y / 2 - 4, th), collection=coll)
    M.assign(top, mat.concrete())
    # paddock slab + garages behind south wall
    slab = M.box("paddock_slab", (46.0, 10.0, 0.10), (0, FLOOR_Y / 2 + 7, 0.0),
                 collection=coll)
    M.assign(slab, mat.concrete())
    for i in range(6):
        gx = -19 + i * 7.6
        garage = M.box(f"garage_{i}", (6.6, 4.6, 3.4),
                       (gx, FLOOR_Y / 2 + 9.6, 1.7), collection=coll)
        M.assign(garage, mat.painted_steel(f"m_gar_{i}", (0.35, 0.37, 0.40)))
        door = M.box(f"garage_door_{i}", (5.4, 0.06, 2.7),
                     (gx, FLOOR_Y / 2 + 7.0, 1.35), collection=coll)
        M.assign(door, mat.painted_steel(f"m_gard_{i}", (0.75, 0.3, 0.1)))
        M.bevel(garage, 0.04, 1)


def build_platforms(coll):
    for sx in (-1, 1):
        x = sx * 30
        tower = M.box(f"cam_tower_{sx}", (1.2, 1.2, 5.0), (x, -20, 2.5),
                      collection=coll)
        M.assign(tower, mat.steel())
        plat = M.box(f"cam_platform_{sx}", (2.4, 2.4, 0.2), (x, -20, 5.0),
                     collection=coll)
        M.assign(plat, mat.painted_steel(f"m_camp_{sx}", (0.8, 0.6, 0.2)))
        cam = M.box(f"cam_unit_{sx}", (0.5, 0.3, 0.25), (x, -20, 5.3),
                    collection=coll)
        M.assign(cam, mat.painted_steel("m_camunit", (0.05, 0.05, 0.06)))
    # speaker arrays at truss ends
    for (x, y) in ((-34, -18), (34, -18), (-34, 18), (34, 18)):
        for i in range(3):
            spk = M.box(f"speaker_{x}_{y}_{i}", (1.2, 0.9, 0.9),
                        (x, y + i * 1.0, 14.8), collection=coll)
            M.assign(spk, mat.painted_steel(f"m_spk_{x}_{y}_{i}", (0.1, 0.1, 0.12)))


def bake_vertex_ao(scene):
    """Raycast AO into vertex colors of static meshes."""
    meshes = _objs_of_types(scene, {"MESH"})
    trees = []
    for o in meshes:
        try:
            trees.append((o, BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())))
        except Exception:
            pass
    total = 0
    for o, tree in trees:
        mesh = o.data
        vcol = mesh.color_attributes.new(name="AO", type="FLOAT_COLOR",
                                         domain="POINT")
        for i, v in enumerate(mesh.vertices):
            nrm = v.normal
            hit = 0
            for d in AO_DIRS:
                if d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2] < 0.05:
                    continue
                loc, _, _, _ = tree.ray_cast(v.co + Vector(d) * 0.02, Vector(d), 12.0)
                if loc is not None:
                    hit += 1
            ao = 1.0 - hit / 8.0
            vcol.data[i].color = (ao, ao, ao, 1.0)
            total += 1
    print(f"vertex AO baked on {total} verts")


def write_stadium_data():
    data = {
        "stadium": "Apex Coliseum",
        "floor": [FLOOR_X, FLOOR_Y],
        "lamp_positions": lamp_positions,
        "boards": board_info,
        "seat_slots": seat_slots,
        "roof_z": ROOF_Z,
    }
    out = os.path.join(common.ASSETS, "stadium", "stadium_data.json")
    with open(out, "w") as f:
        json.dump(data, f, indent=1)
    print("stadium_data:", out, len(seat_slots), "seat slots")


if __name__ == "__main__":
    X.clear_scene()
    mat._MAT_CACHE.clear()
    coll = bpy.context.scene.collection
    build_floor(coll)
    build_walls(coll)
    place_stands(coll)
    build_roof(coll)
    build_lights(coll)
    build_boards(coll)
    build_tunnels(coll)
    build_platforms(coll)
    if os.environ.get("STADIUM_AO") != "0":
        bake_vertex_ao(bpy.context.scene)
    write_stadium_data()
    out = os.path.join(common.ASSETS, "stadium", "stadium.glb")
    X.export_glb(out, objects=None, y_up=False)
    print("STADIUM DONE")
