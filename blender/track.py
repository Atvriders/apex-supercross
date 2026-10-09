"""Original supercross track: spline-driven ribbon mesh with berms, jumps,
whoops, rhythm, split lanes; starting gates; timing gate; heightfield bake;
and track_data.json for the game (AI lines, checkpoints, placements).

Run: blender --background --python blender/track.py
"""
import json
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector, kdtree  # noqa: E402

import common  # noqa: E402
from common import materials as mat  # noqa: E402
from common import mesh as M  # noqa: E402
from common import export as X  # noqa: E402

# ---------------------------------------------------------------------------
# Track layout (original). Blender coords: X east, Y north, Z up.
# ---------------------------------------------------------------------------
CONTROL_POINTS = [
    (-18.0, -9.0),    # start straight (south end)
    (-18.0, 0.0),
    (-15.0, 7.5),     # first turn (left berm, into east)
    (-7.0, 12.5),
    (0.0, 13.5),
    (10.0, 13.5),     # rhythm straight eastbound
    (17.5, 9.5),      # turn 2 (left, into south)
    (18.5, 0.0),
    (17.5, -8.0),     # whoops straight southbound
    (12.0, -12.5),
    (0.0, -13.5),     # 180 berm (right, into north)
    (-11.0, -12.0),
    (-14.5, -8.5),
    (-16.5, -6.5),    # merge back to start straight
]
# close loop back to first point automatically

N_SAMPLES = 480

# feature positions along normalized s (0..1)
START_LINE_S = 0.005
GATE_S = 0.012
RHYTHM_S0, RHYTHM_S1 = 0.26, 0.42     # 4 doubles
TABLE_S = 0.465
WHOOPS_S0, WHOOPS_S1 = 0.60, 0.72      # 8 whoops
STEPUP_S = 0.775
SPLIT_S0, SPLIT_S1 = 0.81, 0.905       # split lane: rollers / double
FINISH_JUMP_S = 0.975                  # finish table onto start straight

N_GATES = 13
CHECKPOINTS = [0.0, 0.14, 0.30, 0.44, 0.56, 0.70, 0.80, 0.90]


def _catmull(points, samples_per_seg):
    """Closed Catmull-Rom through every control point."""
    n = len(points)
    pts = [points[-1]] + points + [points[0], points[1]]
    out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for j in range(samples_per_seg):
            t = j / samples_per_seg
            t2, t3 = t * t, t * t * t
            out.append(Vector((
                0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
                0.0)))
    out.append(out[0])
    return out


def _arc(samples):
    """Cumulative arc length, normalized to 0..1."""
    acc = [0.0]
    for i in range(1, len(samples)):
        acc.append(acc[-1] + (samples[i] - samples[i - 1]).length)
    total = acc[-1]
    return [a / total for a in acc]


# ---------------------------------------------------------------------------
# Height / width / bank functions
# ---------------------------------------------------------------------------
def _bump_face(ss, s0, w, h, flat):
    """Ramp up -> flat -> ramp down profile starting at s0."""
    if ss < s0 or ss > s0 + 2 * w + flat:
        return 0.0
    t = (ss - s0) / w
    if t < 1.0:
        return h * (0.5 - 0.5 * math.cos(math.pi * t))
    if t < 1.0 + flat / w:
        return h
    t2 = (ss - s0 - w - flat) / w
    return h * (0.5 + 0.5 * math.cos(math.pi * t2))


def _roller(ss, s0, width, h):
    if ss < s0 or ss > s0 + width:
        return 0.0
    return h * (0.5 - 0.5 * math.cos(2 * math.pi * (ss - s0) / width))


def base_height(ss):
    z = 0.0
    # rhythm: 4 doubles
    for i in range(4):
        s0 = RHYTHM_S0 + i * (RHYTHM_S1 - RHYTHM_S0) / 4
        z += _bump_face(ss, s0, 0.018, 0.95, 0.012)
    # tabletop
    z += _bump_face(ss, TABLE_S, 0.020, 1.15, 0.010)
    # whoops: 8 half-sine bumps
    for i in range(8):
        s0 = WHOOPS_S0 + i * (WHOOPS_S1 - WHOOPS_S0) / 8
        z += _roller(ss, s0, (WHOOPS_S1 - WHOOPS_S0) / 8 * 1.6, 0.45)
    # step-up
    z += _bump_face(ss, STEPUP_S, 0.022, 1.35, 0.045)
    # finish table
    z += _bump_face(ss, FINISH_JUMP_S, 0.016, 1.20, 0.008)
    return z


def lane_height(ss, t):
    """Lateral-dependent height: split-lane section only."""
    if not (SPLIT_S0 <= ss <= SPLIT_S1):
        return 0.0
    if t < -0.05:  # lane A: three rollers
        span = (SPLIT_S1 - SPLIT_S0) / 3
        z = 0.0
        for i in range(3):
            s0 = SPLIT_S0 + i * span
            z += _roller(ss, s0, span * 1.4, 0.42)
        return z
    if t > 0.05:  # lane B: one double
        return _bump_face(ss, SPLIT_S0 + 0.01, 0.018, 1.05, 0.012)
    return 0.0


def width_at(ss):
    if ss < 0.07:
        return 8.5
    if SPLIT_S0 - 0.02 <= ss <= SPLIT_S1 + 0.02:
        return 10.0
    return 6.2


def bank_at(ss):
    def hump(s0, s1, a):
        if s0 <= ss <= s1:
            return a * (0.5 - 0.5 * math.cos(2 * math.pi * (ss - s0) / (s1 - s0)))
        return 0.0
    # left-turn berms bank positive (left edge high) - first turn
    z = hump(0.105, 0.185, 0.52)
    z += hump(0.49, 0.57, 0.46)
    z += hump(0.91, 0.97, 0.58)   # 180 right-hand berm (right edge high)
    return z


def to_game(bv):
    """Blender (x, y, z) -> game (x, y, z): Y-up conversion applied by
    exporter (x, z, -y)."""
    return (bv[0], bv[2], -bv[1])


# ---------------------------------------------------------------------------
# Mesh construction
# ---------------------------------------------------------------------------
def build_track_mesh():
    pts = [Vector((p[0], p[1], 0.0)) for p in CONTROL_POINTS]
    samples = _catmull(pts, 12)
    s_vals = _arc(samples)
    n = len(samples)

    # per-sample tangent/normal
    tan = []
    for i in range(n):
        a = samples[(i - 1) % n]
        b = samples[(i + 1) % n]
        d = b - a
        tan.append(d.normalized() if d.length > 1e-9 else Vector((0, 1, 0)))
    left_n = [Vector((t.y, -t.x, 0)) for t in tan]

    rows = [-1.0, -0.33, 0.33, 1.0]  # cross-section offsets
    verts = []
    faces = []
    uvs = []
    for i in range(n):
        ss = s_vals[i]
        w = width_at(ss)
        bank = bank_at(ss)
        c = samples[i]
        zc = base_height(ss)
        for ri, t in enumerate(rows):
            edge_z = zc + math.sin(bank) * (w / 2) * t + lane_height(ss, t)
            if abs(t) == 1.0:
                edge_z += 0.06  # slightly raised edges (berm lips)
            if SPLIT_S0 <= ss <= SPLIT_S1 and abs(t) <= 0.34:
                edge_z += 0.10 * (1 - abs(t * 3))  # lane divider ridge
            pos = c + left_n[i] * (w / 2 * t)
            verts.append(Vector((pos.x, pos.y, edge_z)))
            uvs.append((ss * 6.0, (t + 1) * 0.5))
    for i in range(n):
        i2 = (i + 1) % n
        for ri in range(len(rows) - 1):
            a = i * len(rows) + ri
            b = a + 1
            c = i2 * len(rows) + ri + 1
            d = c - 1
            faces.append((a, b, c, d))

    mesh = bpy.data.meshes.new("TrackRibbon")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("track", mesh)
    bpy.context.scene.collection.objects.link(obj)
    # UVs
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for i, uv in enumerate(uvs):
        uv_layer.data[i].uv = uv
    for p in mesh.polygons:
        p.use_smooth = True
    m = bpy.data.materials.new("TrackDirt")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.46, 0.31, 0.18, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    nodes.new("ShaderNodeNewGeometry")
    m.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mesh.materials.append(m)
    return obj, samples, s_vals, left_n, tan


def build_gates(collection, samples, s_vals, left_n):
    """Starting gate beam + 13 drop gates at GATE_S."""
    idx = min(range(len(s_vals)), key=lambda i: abs(s_vals[i] - GATE_S))
    c = samples[idx]
    n = left_n[idx]
    w = width_at(s_vals[idx])
    beam = M.box("start_beam", (w + 0.6, 0.18, 0.18),
                 (c.x, c.y, 1.85), collection=collection)
    M.assign(beam, mat.painted_steel("m_beam", (0.85, 0.86, 0.88)))
    gates = []
    for i in range(N_GATES):
        t = -0.5 + (i + 0.5) / N_GATES
        pos = c + n * (w * t)
        g = M.box(f"gate_{i:02d}", (0.9, 0.05, 1.7), (pos.x, pos.y, 0.85),
                  collection=collection)
        M.assign(g, mat.painted_steel(f"m_gate_{i}", (0.9, 0.28, 0.10)))
        gates.append(g)
    # timing gate over start line
    idx2 = min(range(len(s_vals)), key=lambda i: abs(s_vals[i] - START_LINE_S))
    c2 = samples[idx2]
    n2 = left_n[idx2]
    w2 = width_at(s_vals[idx2])
    for sx in (-1, 1):
        pole = M.box("timing_pole", (0.15, 0.15, 4.2),
                     (c2.x + n2.x * w2 / 2 * sx, c2.y + n2.y * w2 / 2 * sx, 2.1),
                     collection=collection)
        M.assign(pole, mat.painted_steel("m_tp", (0.1, 0.12, 0.15)))
    bar = M.box("timing_bar", (w2 + 0.6, 0.35, 0.25), (c2.x, c2.y, 4.2),
                collection=collection)
    M.assign(bar, mat.painted_steel("m_tb", (0.1, 0.12, 0.15)))
    return gates


def rasterize_heightfield(samples, s_vals, left_n):
    """Bake a heightfield grid in game coordinates from the ribbon surface."""
    kd = kdtree.KDTree(len(samples) * 3)
    for i in range(len(samples)):
        ss = s_vals[i]
        w = width_at(ss)
        bank = bank_at(ss)
        zc = base_height(ss)
        for ri, t in enumerate((-1.0, 0.0, 1.0)):
            pos = samples[i] + left_n[i] * (w / 2 * t)
            z = zc + math.sin(bank) * (w / 2) * t + lane_height(ss, t)
            kd.insert((pos.x, pos.y, z), i * 3 + ri)
    kd.balance()
    # game-space bounds: x in [-24, 24], z (=-y) in [-18, 18]
    x0, x1, z0, z1 = -24.0, 24.0, -18.0, 18.0
    nx, nz = 192, 144
    dx = (x1 - x0) / (nx - 1)
    dz = (z1 - z0) / (nz - 1)
    grid = []
    for j in range(nz):
        gz = z0 + j * dz
        for i in range(nx):
            gx = x0 + i * dx
            # back to blender: bx=gx, by=-gz
            _, _, z = kd.find((gx, -gz, 0.0))[0]
            grid.append(z)
    out = os.path.join(common.ASSETS, "stadium", "heightfield.bin")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(struct.pack("<6f", float(nx), float(nz), x0, z0, dx, dz))
        f.write(struct.pack(f"<{len(grid)}f", *grid))
    print("heightfield:", out, len(grid), "cells")
    return dict(nx=nx, nz=nz, x0=x0, z0=z0, dx=dx, dz=dz)


def write_track_data(samples, s_vals, left_n, tan, hf):
    """track_data.json in game coordinates: spline, checkpoints, AI lines,
    gates, tuff blocks, markers."""
    def sample_line(t_off, every=6):
        line = []
        for i in range(0, len(samples), every):
            ss = s_vals[i]
            w = width_at(ss)
            bank = bank_at(ss)
            zc = base_height(ss)
            pos = samples[i] + left_n[i] * (w / 2 * t_off)
            z = zc + math.sin(bank) * (w / 2) * t_off + lane_height(ss, t_off)
            g = to_game((pos.x, pos.y, z))
            line.append([round(g[0], 3), round(g[1], 3), round(g[2], 3)])
        return line

    gates = []
    idx = min(range(len(s_vals)), key=lambda i: abs(s_vals[i] - GATE_S))
    c = samples[idx]
    n = left_n[idx]
    w = width_at(s_vals[idx])
    for i in range(N_GATES):
        t = -0.5 + (i + 0.5) / N_GATES
        pos = c + n * (w * t)
        g = to_game((pos.x, pos.y, 0.0))
        gates.append([round(g[0], 3), round(g[1], 3), round(g[2], 3), t])

    # tuff blocks on the outside of berms + track perimeter
    tuffs = []
    for s0, s1, side in ((0.10, 0.19, -1), (0.48, 0.58, -1), (0.90, 0.975, 1),
                         (0.20, 0.45, 1), (0.62, 0.76, 1), (0.78, 0.81, -1)):
        for ss in [s0 + (s1 - s0) * k / 8 for k in range(9)]:
            i = min(range(len(s_vals)), key=lambda k: abs(s_vals[k] - ss))
            pos = samples[i] + left_n[i] * (width_at(ss) / 2 * side * 1.18)
            g = to_game((pos.x, pos.y, 0.0))
            tuffs.append([round(g[0], 3), round(g[1], 3), round(g[2], 3),
                          round(math.atan2(-tan[i].y, -tan[i].x) * side * -1, 3)])

    markers = []
    for ss in [0.03 + k * 0.06 for k in range(15)]:
        i = min(range(len(s_vals)), key=lambda k: abs(s_vals[k] - ss))
        for side in (-1, 1):
            pos = samples[i] + left_n[i] * (width_at(ss) / 2 * side * 1.08)
            g = to_game((pos.x, pos.y, 0.0))
            markers.append([round(g[0], 3), round(g[1], 3), round(g[2], 3)])

    data = {
        "track_name": "The Anvil",
        "stadium": "Apex Coliseum",
        "length_m": round(sum(
            (samples[(i + 1) % len(samples)] - samples[i]).length
            for i in range(len(samples))), 1),
        "heightfield": hf,
        "start_s": START_LINE_S,
        "gate_s": GATE_S,
        "n_gates": N_GATES,
        "gates": gates,
        "checkpoints": CHECKPOINTS,
        "center_line": sample_line(0.0),
        "ai_line_left": sample_line(-0.55),
        "ai_line_right": sample_line(0.55),
        "ai_line_inside": sample_line(-0.30),
        "tuff_blocks": tuffs,
        "markers": markers,
        "sections": {
            "rhythm": [RHYTHM_S0, RHYTHM_S1],
            "whoops": [WHOOPS_S0, WHOOPS_S1],
            "split": [SPLIT_S0, SPLIT_S1],
            "finish_jump": FINISH_JUMP_S,
        },
    }
    out = os.path.join(common.ASSETS, "stadium", "track_data.json")
    with open(out, "w") as f:
        json.dump(data, f, indent=1)
    print("track_data:", out)
    return data


if __name__ == "__main__":
    X.clear_scene()
    mat._MAT_CACHE.clear()
    track, samples, s_vals, left_n, tan = build_track_mesh()
    coll = bpy.context.scene.collection
    build_gates(coll, samples, s_vals, left_n)
    hf = rasterize_heightfield(samples, s_vals, left_n)
    write_track_data(samples, s_vals, left_n, tan, hf)
    out = os.path.join(common.ASSETS, "stadium", "track.glb")
    X.export_glb(out, objects=None, y_up=False)
    if os.environ.get("TRACK_RENDER") == "1":
        scene = bpy.context.scene
        cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
        coll.objects.link(cam)
        scene.camera = cam
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 52
        cam.location = (0.0, 0.0, 42.0)
        cam.rotation_euler = (0, 0, 0)
        import common.render as R
        R.setup_eevee(scene, 1600, 1200, samples=16, use_bloom=False)
        scene.render.filepath = os.path.join(common.RENDERS, "track_top.png")
        bpy.ops.render.render(write_still=True)
        cam2 = bpy.data.objects.new("Cam2", bpy.data.cameras.new("Cam2"))
        coll.objects.link(cam2)
        scene.camera = cam2
        cam2.location = (-32.0, -30.0, 22.0)
        from mathutils import Vector as _V
        cam2.rotation_euler = (_V((0, 0, 0)) - cam2.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(common.RENDERS, "track_persp.png")
        bpy.ops.render.render(write_still=True)
    print("TRACK DONE")
