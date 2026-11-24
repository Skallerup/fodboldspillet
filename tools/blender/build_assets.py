"""Bygger alle spillets 3D-modeller i Blender og eksporterer dem som .glb.

Koer:
    blender --background --python tools/blender/build_assets.py -- [--render]
eller med bpy-modulet:
    python tools/blender/build_assets.py [--render] [--cards]
    python tools/blender/build_assets.py --lite     (lette figurer: char_<navn>_lite.glb)

Output (assets/models/):
    char_rhino.glb, char_lion.glb, char_croc.glb, char_panda.glb
        Hver figur bestaar af bevaegelige dele: Body, Head, ArmL, ArmR, LegL, LegR.
        Materialerne Jersey, Shorts, Socks, Trim og Number farves/udskiftes i spillet.
    ball.glb
    stadium.glb
        Dele: Pitch, Ground, Goal, Goal2, Boards, Flags, Trees, StandsSmall, StandsBig, Roof, Banners, Floodlights
    trophy.glb (Cup, Stand), mascot.glb (MascotBody, WingL, WingR)
    assets/kits/*.jpg (troejemoenstre)
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rhino_player as rp  # noqa: E402  (genbruger hjaelpefunktionerne)
from rhino_player import blob, fuse, join, limb, mat, ring  # noqa: E402

MODELS = rp.MODELS
PREVIEWS = rp.PREVIEWS
rp.TEXTURES = os.path.join(rp.ROOT, "assets", "textures", "game")

HORN = (0.90, 0.84, 0.68)
ANIMALS = {
    "rhino": dict(skin=(0.42, 0.44, 0.48), style="rough", limb=None),
    "lion": dict(skin=(0.80, 0.50, 0.16), style="fur", limb=None),
    "croc": dict(skin=(0.16, 0.42, 0.12), style="scales", limb=None),
    "panda": dict(skin=(0.90, 0.90, 0.88), style="fur", limb=(0.03, 0.03, 0.035)),
    # hemmelige figurer, der laases op i spillet
    "shark": dict(skin=(0.28, 0.44, 0.60), style="fur", limb=None),
    "dragon": dict(skin=(0.62, 0.07, 0.06), style="scales", limb=None),
    "robot": dict(skin=(0.60, 0.64, 0.70), style="fur", limb=None),
}
PIVOTS = {
    "Body": (0, 0, 0.90),
    "Head": (0, -0.02, 1.62),
    "ArmL": (0.52, 0, 1.48),
    "ArmR": (-0.52, 0, 1.48),
    "LegL": (0.27, 0, 0.82),
    "LegR": (-0.27, 0, 0.82),
}
FUSE = dict(voxel=0.02, smooth=6, keep=0.15)


# ---------------------------------------------------------------- teksturer
def make_textures(n=512):
    os.makedirs(rp.TEXTURES, exist_ok=True)
    tex = {}
    base = rp._fractal(n, 1.7, 1)
    grain = rp._fractal(n, 0.7, 3)
    u, v = np.meshgrid(np.arange(n) / n, np.arange(n) / n)
    for kind, cfg in ANIMALS.items():
        if cfg["style"] == "rough":
            cracks = (1 - np.abs(2 * rp._fractal(n, 1.15, 2) - 1)) ** 28
            height = 0.5 * base - 0.35 * cracks + 0.15 * grain
            shade = (0.80 + 0.22 * base) * (1 - 0.35 * cracks) * (0.95 + 0.10 * grain)
            strength = 5.0
        elif cfg["style"] == "scales":
            row = np.floor(v * 16)
            cell = (np.abs(np.sin(np.pi * (u * 16 + 0.5 * (row % 2)))) * np.abs(np.sin(np.pi * v * 16))) ** 0.45
            height = cell + 0.2 * grain
            shade = (0.84 + 0.20 * cell) * (0.90 + 0.18 * base)
            strength = 2.5
        else:  # fur
            height = grain
            shade = (0.90 + 0.12 * grain) * (0.95 + 0.08 * base)
            strength = 2.0
        col = shade[..., None] * rp._srgb(cfg["skin"])[None, None, :]
        tex[kind] = (rp._save(f"g_skin_{kind}", col),
                     rp._save(f"g_skin_{kind}_n", rp._normal_from_height(height, strength), True))
    weave = 0.5 + 0.5 * np.sin(2 * np.pi * u * 64) * np.sin(2 * np.pi * v * 64)
    tex["fabric_n"] = rp._save("g_fabric_n", rp._normal_from_height(weave + 0.3 * grain, 1.2), True)
    # Graatonet stribemoenster: farves i spillet med spillerens troejefarve
    stripe = (np.floor(u * 8) % 2)
    grey = (1.0 - 0.30 * stripe) * (0.95 + 0.08 * grain)
    tex["jersey"] = rp._save("g_jersey", np.repeat(grey[..., None], 3, -1))
    return tex


def kit_textures(n=512):
    """Graatonede troejemoenstre til butikken (farves i spillet). Gemmes i assets/kits/."""
    out = os.path.join(rp.ROOT, "assets", "kits")
    os.makedirs(out, exist_ok=True)
    grain = rp._fractal(n, 0.7, 3)
    u, v = np.meshgrid(np.arange(n) / n, np.arange(n) / n)
    shade = 0.95 + 0.08 * grain
    diag = (u + v) % 1.0
    designs = {
        "ensfarvet": np.ones_like(u),
        "ringe": 1.0 - 0.32 * (np.floor(v * 8) % 2),
        "skraa": 1.0 - 0.50 * (np.abs(diag - 0.5) < 0.11),
        "tern": 1.0 - 0.30 * ((np.floor(u * 6) + np.floor(v * 6)) % 2),
    }
    for name, grey in designs.items():
        rgb = np.repeat((grey * shade)[..., None], 3, -1)
        _save_jpg(os.path.join(out, name + ".jpg"), rgb)
    lines = 0.5 + 0.5 * np.sin(2 * np.pi * (u - v) * 24)
    gold = np.array([1.0, 0.76, 0.22])[None, None, :] * (0.80 + 0.22 * lines * shade)[..., None]
    gold[np.abs(diag - 0.5) < 0.09] = (1.0, 0.95, 0.72)
    _save_jpg(os.path.join(out, "guld.jpg"), gold)


def _save_jpg(path, rgb):
    h, w, _ = rgb.shape
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], -1).astype(np.float32)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "JPEG"
    img.save()


def pitch_texture():
    w, h = 1024, 1536          # 40 x 60 enheder
    x = (np.arange(w) + 0.5) / w * 40 - 20
    y = (np.arange(h) + 0.5) / h * 60 - 30
    X, Y = np.meshgrid(x, y)
    noise = rp._fractal(1024, 1.2, 7)
    noise = np.vstack([noise, noise[:512]])
    band = (np.floor((Y + 30) / 5) % 2)
    g = np.stack([0.10 + 0.03 * band, 0.44 + 0.09 * band, 0.13 + 0.03 * band], -1)
    g = g * (0.9 + 0.2 * noise[..., None])
    lw = 0.09
    line = np.zeros_like(X, dtype=bool)

    def seg_x(yc, x0, x1):
        return (np.abs(Y - yc) < lw) & (X >= x0 - lw) & (X <= x1 + lw)

    def seg_y(xc, y0, y1):
        return (np.abs(X - xc) < lw) & (Y >= y0 - lw) & (Y <= y1 + lw)

    line |= seg_x(-29, -19, 19) | seg_x(29, -19, 19) | seg_x(0, -19, 19)
    line |= seg_y(-19, -29, 29) | seg_y(19, -29, 29)
    r = np.sqrt(X ** 2 + Y ** 2)
    line |= (np.abs(r - 5) < lw) | (r < 0.22)
    for sgn in (-1, 1):
        gl = 29 * sgn
        line |= seg_x(gl - 9 * sgn, -11, 11) | seg_y(-11, min(gl, gl - 9 * sgn), max(gl, gl - 9 * sgn))
        line |= seg_y(11, min(gl, gl - 9 * sgn), max(gl, gl - 9 * sgn))
        line |= seg_x(gl - 3.5 * sgn, -6, 6) | seg_y(-6, min(gl, gl - 3.5 * sgn), max(gl, gl - 3.5 * sgn))
        line |= seg_y(6, min(gl, gl - 3.5 * sgn), max(gl, gl - 3.5 * sgn))
        spot = gl - 6 * sgn
        rs = np.sqrt(X ** 2 + (Y - spot) ** 2)
        line |= rs < 0.22
        line |= (np.abs(rs - 5) < lw) & ((Y - (gl - 9 * sgn)) * -sgn > 0)
    g[line] = (0.93, 0.95, 0.93)
    return rp._save("g_pitch", g ** (1 / 2.2))


def crowd_texture():
    n, cols, rows = 512, 24, 16
    rng = np.random.default_rng(5)
    img = np.zeros((n, n, 3)) + np.array([0.05, 0.06, 0.10])
    palette = np.array([[0.95, 0.80, 0.10], [0.85, 0.12, 0.12], [0.95, 0.95, 0.95], [0.15, 0.35, 0.85],
                        [0.85, 0.62, 0.45], [0.45, 0.30, 0.20], [0.10, 0.60, 0.25]])
    yy, xx = np.mgrid[0:n, 0:n]
    cw, ch = n / cols, n / rows
    for r in range(rows):
        for c in range(cols):
            if rng.random() < 0.08:
                continue
            cx = (c + 0.5 + (0.5 if r % 2 else 0)) * cw % n
            cy = (r + 0.55) * ch
            col = palette[rng.integers(len(palette))]
            body = (np.abs(xx - cx) < cw * 0.36) & (yy > cy - ch * 0.5) & (yy < cy + ch * 0.1)
            img[body] = col * 0.8
            head = (xx - cx) ** 2 + (yy - (cy + ch * 0.22)) ** 2 < (cw * 0.24) ** 2
            img[head] = palette[4 + rng.integers(2)]
    return rp._save("g_crowd", img ** (1 / 2.2))


# ---------------------------------------------------------------- helpers
def front_y(obj, x, z, default=-0.4):
    """Y-koordinat for overfladens forside (figuren kigger mod -Y)."""
    bpy.context.view_layer.update()
    ok, hit, _, _ = obj.ray_cast((x, -3.0, z), (0, 1, 0))
    return hit.y if ok else default


def set_pivot(obj, p):
    p = Vector(p)
    obj.data.transform(Matrix.Translation(-p))
    obj.location = p


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def patch(name, loc, size, material, target, back=False):
    """Krum flade paa troejen til roegnummeret (UV 0..1)."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=8, y_subdivisions=8, size=size, location=loc,
                                    rotation=(math.radians(90), 0, math.radians(180) if back else 0))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    sw = o.modifiers.new("wrap", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = "PROJECT"
    sw.use_project_z = True
    sw.use_positive_direction = True
    sw.use_negative_direction = True
    sw.offset = 0.014
    apply_modifiers(o)
    rp._smooth(o)
    return o


def eye(hard, head, x, z, M, size=1.0, iris=None, pupil=(0.028, 0.016, 0.036)):
    y = front_y(head, x, z)
    s = 1 if x > 0 else -1
    blob("Eye", (x, y + 0.03 * size, z), (0.075 * size, 0.06 * size, 0.085 * size), M["white"], hard)
    blob("Iris", (x * 0.98, y - 0.005 * size, z - 0.005), (0.05 * size, 0.03 * size, 0.06 * size),
         iris or M["iris"], hard)
    blob("Pupil", (x * 0.97, y - 0.025 * size, z - 0.008), tuple(p * size for p in pupil), M["black"], hard)
    if not rp.LITE:
        blob("Glint", (x * 0.97 + 0.018 * s, y - 0.038 * size, z + 0.012), (0.009, 0.006, 0.009), M["white"], hard)


def brows(g, M, x, y, z, tilt=18):
    for s in (-1, 1):
        blob("Brow", (x * s, y, z), (0.12, 0.06, 0.035), M["skin"], g, rot=(0, math.radians(-tilt * s), 0))


# ---------------------------------------------------------------- hoveder
def head_rhino(M):
    g, hard = [], []
    limb("Neck", (0, 0, 1.58), (0, -0.06, 1.82), 0.27, 0.27, M["skin"], g)
    ring("NeckFold", (0, -0.03, 1.76), (0, 0.15, 1), 0.275, 0.028, M["skin"], g)
    blob("Head", (0, -0.08, 1.95), (0.37, 0.40, 0.34), M["skin"], g)
    blob("Jaw", (0, -0.22, 1.78), (0.30, 0.30, 0.20), M["skin"], g)
    blob("Snout", (0, -0.50, 1.80), (0.27, 0.40, 0.23), M["skin"], g, rot=(math.radians(14), 0, 0))
    blob("Lip", (0, -0.80, 1.66), (0.21, 0.13, 0.10), M["skin"], g)
    ring("SnoutFold", (0, -0.40, 1.83), (0, 1, -0.25), 0.25, 0.02, M["skin"], g, scale=(1.05, 0.93, 1))
    brows(g, M, 0.22, -0.385, 2.135)
    for s in (-1, 1):
        rot = (math.radians(-12), math.radians(24 * s), 0)
        blob("Ear", (0.29 * s, 0.12, 2.30), (0.10, 0.05, 0.17), M["skin"], g, rot=rot)
        blob("EarInner", (0.287 * s, 0.078, 2.30), (0.062, 0.022, 0.115), M["dark"], hard, rot=rot)
        blob("Eyelid", (0.22 * s, -0.355, 2.075), (0.095, 0.075, 0.06), M["skin"], g,
             rot=(0, math.radians(-12 * s), 0))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, -0.62, 1.685),
                                         rotation=(math.radians(20), 0, 0))
    mouth = bpy.context.object
    mouth.scale = (0.31, 0.31, 0.018)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2, cutters=[mouth])
    for s in (-1, 1):
        eye(hard, head, 0.22 * s, 2.03, M)
        y = front_y(head, 0.10 * s, 1.765, -0.86)
        blob("Nostril", (0.10 * s, y + 0.014, 1.765), (0.030, 0.018, 0.024), M["black"], hard)
    gh = []
    pts = [(0, -0.74, 1.87), (0, -0.83, 2.05), (0, -0.87, 2.22), (0, -0.855, 2.40)]
    rad = [0.12, 0.088, 0.052, 0.008]
    for i in range(3):
        limb("HornSeg", pts[i], pts[i + 1], rad[i], rad[i + 1], M["horn"], gh)
    horn = fuse("Horn", gh, M["horn"], None, voxel=0.012, smooth=5, keep=0.2)
    limb("Horn2", (0, -0.48, 1.98), (0, -0.515, 2.21), 0.08, 0.008, M["horn"], hard, caps=False)
    tail = []
    limb("Tail", (0, 0.38, 0.90), (0, 0.60, 0.70), 0.045, 0.03, M["dark"], tail)
    blob("TailTuft", (0, 0.63, 0.66), (0.06, 0.07, 0.09), M["black"], tail)
    return [head, horn] + hard, tail


def head_lion(M):
    g, hard, gm = [], [], []
    mane = mat("Mane", (0.36, 0.14, 0.03), 0.9)
    cream = mat("Cream", (0.95, 0.84, 0.62), 0.8)
    nose = mat("NoseDark", (0.12, 0.05, 0.03), 0.4)
    limb("Neck", (0, 0, 1.58), (0, -0.04, 1.82), 0.22, 0.22, M["skin"], g)
    blob("Head", (0, -0.08, 2.00), (0.36, 0.34, 0.33), M["skin"], g)
    blob("Jaw", (0, -0.20, 1.87), (0.27, 0.25, 0.19), M["skin"], g)
    brows(g, M, 0.17, -0.365, 2.15, tilt=16)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2)
    for k in range(12):
        a = 2 * math.pi * k / 12
        blob("ManeTuft", (0.41 * math.cos(a), 0.05, 1.99 + 0.41 * math.sin(a)), (0.17, 0.15, 0.17), mane, gm)
    blob("ManeBack", (0, 0.20, 1.98), (0.44, 0.27, 0.44), mane, gm)
    blob("ManeChest", (0, -0.12, 1.66), (0.22, 0.16, 0.14), mane, gm)
    mane_obj = fuse("Mane", gm, mane, None, voxel=0.022, smooth=4, keep=0.15)
    for s in (-1, 1):
        blob("Ear", (0.30 * s, -0.11, 2.31), (0.10, 0.05, 0.10), M["skin"], hard)
        blob("EarInner", (0.30 * s, -0.15, 2.31), (0.06, 0.02, 0.06), cream, hard)
        eye(hard, head, 0.15 * s, 2.07, M, size=0.9, iris=mat("IrisAmber", (0.75, 0.40, 0.02), 0.2))
        y = front_y(head, 0.085 * s, 1.90)
        blob("Cheek", (0.085 * s, y + 0.01, 1.90), (0.115, 0.10, 0.09), cream, hard)
    y = front_y(head, 0.0, 1.90)
    blob("Chin", (0, y + 0.02, 1.83), (0.09, 0.08, 0.06), cream, hard)
    blob("Nose", (0, y - 0.065, 1.965), (0.065, 0.045, 0.04), nose, hard)
    blob("MouthLine", (0, y - 0.088, 1.905), (0.008, 0.012, 0.035), M["black"], hard)
    tail = []
    limb("Tail", (0, 0.38, 0.90), (0, 0.66, 0.74), 0.035, 0.03, M["skin"], tail)
    limb("Tail2", (0, 0.66, 0.74), (0, 0.82, 0.92), 0.03, 0.028, M["skin"], tail)
    blob("TailTuft", (0, 0.85, 0.97), (0.07, 0.07, 0.10), mane, tail)
    return [head, mane_obj] + hard, tail


def head_croc(M):
    g, hard = [], []
    spike = mat("Spike", (0.07, 0.24, 0.07), 0.7)
    limb("Neck", (0, 0, 1.58), (0, -0.04, 1.82), 0.25, 0.25, M["skin"], g)
    blob("Head", (0, -0.05, 1.94), (0.33, 0.34, 0.27), M["skin"], g)
    blob("Snout", (0, -0.52, 1.85), (0.23, 0.50, 0.15), M["skin"], g)
    blob("NoseBump", (0, -0.93, 1.93), (0.12, 0.09, 0.07), M["skin"], g)
    for s in (-1, 1):
        blob("EyeBump", (0.17 * s, -0.18, 2.14), (0.115, 0.12, 0.10), M["skin"], g)
    brows(g, M, 0.17, -0.27, 2.235, tilt=20)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, -0.57, 1.835),
                                         rotation=(math.radians(5), 0, 0))
    mouth = bpy.context.object
    mouth.scale = (0.30, 0.52, 0.016)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2, cutters=[mouth])
    yellow = mat("IrisYellow", (0.95, 0.80, 0.05), 0.2)
    for s in (-1, 1):
        eye(hard, head, 0.17 * s, 2.15, M, size=0.85, iris=yellow, pupil=(0.012, 0.016, 0.046))
        blob("Nostril", (0.045 * s, -0.965, 1.985), (0.02, 0.02, 0.012), M["black"], hard)
        for y in (-0.93, -0.85, -0.76, -0.66, -0.56, -0.46):
            x = 0.23 * math.sqrt(max(0.0, 1 - ((y + 0.52) / 0.50) ** 2)) * s
            limb("Tooth", (x, y, 1.845), (x * 1.03, y, 1.775), 0.022, 0.004, M["white"], hard, caps=False)
        limb("ToothFront", (0.06 * s, -1.0, 1.845), (0.06 * s, -1.01, 1.78), 0.022, 0.004, M["white"], hard,
             caps=False)
    for p1, p2 in (((0, 0.18, 2.12), (0, 0.24, 2.30)), ((0, 0.25, 1.95), (0, 0.38, 2.06)),
                   ((0, 0.0, 2.19), (0, 0.02, 2.33))):
        limb("Spike", p1, p2, 0.065, 0.006, spike, hard, caps=False)
    gt = []
    limb("Tail", (0, 0.30, 0.92), (0, 0.75, 0.62), 0.17, 0.11, M["skin"], gt)
    limb("Tail2", (0, 0.75, 0.62), (0, 1.15, 0.52), 0.11, 0.03, M["skin"], gt)
    tail = [fuse("TailSkin", gt, M["skin"], None, **FUSE)]
    for p1, p2 in (((0, 0.52, 0.86), (0, 0.58, 1.02)), ((0, 0.74, 0.70), (0, 0.80, 0.84)),
                   ((0, 0.95, 0.61), (0, 1.0, 0.72))):
        limb("TailSpike", p1, p2, 0.05, 0.006, spike, tail, caps=False)
    return [head] + hard, tail


def head_panda(M):
    g, hard = [], []
    limb("Neck", (0, 0, 1.58), (0, -0.04, 1.82), 0.22, 0.22, M["skin"], g)
    blob("Head", (0, -0.06, 2.00), (0.40, 0.36, 0.35), M["skin"], g)
    blob("Muzzle", (0, -0.35, 1.91), (0.17, 0.13, 0.12), M["skin"], g)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2)
    for s in (-1, 1):
        blob("Ear", (0.30 * s, 0.0, 2.31), (0.125, 0.07, 0.125), M["black"], hard)
        y = front_y(head, 0.16 * s, 2.06)
        blob("EyePatch", (0.16 * s, y + 0.022, 2.05), (0.095, 0.04, 0.125), M["black"], hard,
             rot=(0, math.radians(-25 * s), 0))
        blob("Eye", (0.155 * s, y - 0.012, 2.065), (0.048, 0.03, 0.052), M["white"], hard)
        blob("Pupil", (0.152 * s, y - 0.034, 2.062), (0.026, 0.014, 0.03), M["black"], hard)
        blob("Glint", (0.152 * s + 0.012 * s, y - 0.045, 2.075), (0.008, 0.005, 0.008), M["white"], hard)
    y = front_y(head, 0.0, 1.95)
    blob("Nose", (0, y - 0.005, 1.955), (0.06, 0.035, 0.04), M["black"], hard)
    y = front_y(head, 0.0, 1.89)
    blob("MouthLine", (0, y, 1.895), (0.008, 0.012, 0.035), M["black"], hard)
    tail = []
    blob("Tail", (0, 0.45, 0.88), (0.09, 0.09, 0.09), M["skin"], tail)
    return [head] + hard, tail


def glow(name, color, strength=2.5):
    m = mat(name, color, 0.3)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    for key, val in (("Emission Color", (*color, 1.0)), ("Emission Strength", strength)):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    return m


def head_shark(M):
    g, hard = [], []
    limb("Neck", (0, 0, 1.58), (0, -0.04, 1.82), 0.25, 0.25, M["skin"], g)
    blob("Head", (0, -0.05, 1.95), (0.36, 0.38, 0.33), M["skin"], g)
    blob("Snout", (0, -0.46, 1.98), (0.26, 0.42, 0.20), M["skin"], g, rot=(math.radians(-6), 0, 0))
    limb("Nose", (0, -0.62, 2.00), (0, -1.02, 2.07), 0.19, 0.03, M["skin"], g)
    blob("Jaw", (0, -0.30, 1.80), (0.26, 0.30, 0.14), M["skin"], g)
    blob("Fin", (0, 0.14, 2.44), (0.05, 0.20, 0.36), M["skin"], g, rot=(math.radians(-24), 0, 0))
    brows(g, M, 0.20, -0.36, 2.17, tilt=22)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, -0.50, 1.865),
                                         rotation=(math.radians(8), 0, 0))
    mouth = bpy.context.object
    mouth.scale = (0.31, 0.42, 0.018)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2, cutters=[mouth])
    for s in (-1, 1):
        eye(hard, head, 0.20 * s, 2.07, M, size=0.75, iris=M["black"])
        for y in (-0.84, -0.76, -0.66, -0.55, -0.44):
            x = 0.25 * math.sqrt(max(0.0, 1 - ((y + 0.46) / 0.42) ** 2)) * s
            z = 1.885 + (y + 0.46) * -0.12
            limb("Tooth", (x, y, z), (x, y, z - 0.075), 0.026, 0.003, M["white"], hard, caps=False)
        for i in range(3):
            blob("Gill", (0.352 * s, 0.02 + 0.07 * i, 1.90), (0.012, 0.014, 0.09), M["dark"], hard)
    gt = []
    limb("Tail", (0, 0.32, 0.92), (0, 0.80, 0.82), 0.15, 0.06, M["skin"], gt)
    blob("TailUp", (0, 0.92, 1.04), (0.04, 0.13, 0.30), M["skin"], gt, rot=(math.radians(28), 0, 0))
    blob("TailDown", (0, 0.90, 0.66), (0.04, 0.11, 0.19), M["skin"], gt, rot=(math.radians(-28), 0, 0))
    return [head] + hard, [fuse("TailSkin", gt, M["skin"], None, **FUSE)]


def head_dragon(M):
    g, hard = [], []
    spike = mat("DragonSpike", (0.30, 0.02, 0.02), 0.7)
    yellow = mat("IrisYellow", (0.95, 0.80, 0.05), 0.2)
    limb("Neck", (0, 0, 1.58), (0, -0.04, 1.82), 0.24, 0.24, M["skin"], g)
    blob("Head", (0, -0.05, 1.96), (0.34, 0.36, 0.31), M["skin"], g)
    blob("Snout", (0, -0.50, 1.91), (0.24, 0.40, 0.18), M["skin"], g)
    blob("Jaw", (0, -0.42, 1.79), (0.21, 0.34, 0.10), M["skin"], g)
    for s in (-1, 1):
        blob("NoseBump", (0.11 * s, -0.82, 2.02), (0.085, 0.085, 0.06), M["skin"], g)
        blob("EyeRidge", (0.19 * s, -0.20, 2.17), (0.12, 0.14, 0.08), M["skin"], g)
    brows(g, M, 0.19, -0.30, 2.25, tilt=22)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, -0.55, 1.842),
                                         rotation=(math.radians(5), 0, 0))
    mouth = bpy.context.object
    mouth.scale = (0.30, 0.45, 0.016)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=5, keep=0.2, cutters=[mouth])
    for s in (-1, 1):
        eye(hard, head, 0.19 * s, 2.15, M, size=0.85, iris=yellow, pupil=(0.012, 0.016, 0.046))
        blob("Nostril", (0.11 * s, -0.897, 2.03), (0.025, 0.02, 0.02), M["black"], hard)
        pts = [(0.20 * s, 0.0, 2.20), (0.30 * s, 0.22, 2.50), (0.33 * s, 0.48, 2.63)]
        limb("Horn", pts[0], pts[1], 0.09, 0.055, M["horn"], hard)
        limb("HornTip", pts[1], pts[2], 0.055, 0.008, M["horn"], hard, caps=False)
        blob("Frill", (0.345 * s, 0.06, 1.98), (0.03, 0.15, 0.17), spike, hard, rot=(0, 0, math.radians(-25 * s)))
        limb("Fang", (0.13 * s, -0.87, 1.85), (0.13 * s, -0.88, 1.75), 0.03, 0.004, M["white"], hard, caps=False)
        for y in (-0.72, -0.58):
            x = 0.24 * math.sqrt(max(0.0, 1 - ((y + 0.50) / 0.40) ** 2)) * s
            limb("Tooth", (x, y, 1.85), (x, y, 1.79), 0.02, 0.004, M["white"], hard, caps=False)
    for p1, p2 in (((0, 0.02, 2.24), (0, 0.06, 2.42)), ((0, 0.20, 2.14), (0, 0.30, 2.30)), ((0, 0.28, 1.95), (0, 0.42, 2.05))):
        limb("Spike", p1, p2, 0.065, 0.006, spike, hard, caps=False)
    gt = []
    limb("Tail", (0, 0.30, 0.92), (0, 0.75, 0.66), 0.15, 0.09, M["skin"], gt)
    limb("Tail2", (0, 0.75, 0.66), (0, 1.15, 0.76), 0.09, 0.035, M["skin"], gt)
    tail = [fuse("TailSkin", gt, M["skin"], None, **FUSE)]
    limb("TailTip", (0, 1.10, 0.75), (0, 1.42, 0.86), 0.14, 0.01, spike, tail, caps=False)
    for s in (-1, 1):
        blob("Wing", (0.46 * s, 0.52, 1.58), (0.36, 0.03, 0.26), spike, tail, rot=(0, math.radians(18 * s), math.radians(-28 * s)))
        limb("WingBone", (0.14 * s, 0.44, 1.42), (0.80 * s, 0.70, 1.82), 0.04, 0.015, M["skin"], tail, caps=False)
    return [head] + hard, tail


def head_robot(M):
    g, hard = [], []
    dark = mat("RobotDark", (0.07, 0.08, 0.10), 0.4)
    cyan = glow("RobotGlow", (0.15, 0.85, 1.0))
    red = glow("RobotRed", (1.0, 0.10, 0.08), 2.0)
    box("Head", (0, -0.05, 2.02), (0.78, 0.70, 0.60), M["skin"], g)
    box("Jaw", (0, -0.07, 1.74), (0.58, 0.56, 0.16), M["skin"], g)
    head = fuse("HeadSkin", g, M["skin"], None, voxel=0.016, smooth=6, keep=0.2)
    limb("Neck", (0, 0, 1.56), (0, -0.03, 1.72), 0.13, 0.13, dark, hard, caps=False)
    y = front_y(head, 0.0, 2.07)
    box("Visor", (0, y + 0.012, 2.07), (0.62, 0.06, 0.24), dark, hard)
    for s in (-1, 1):
        blob("EyeGlow", (0.15 * s, y - 0.012, 2.07), (0.078, 0.025, 0.078), cyan, hard)
        limb("EarBolt", (0.37 * s, -0.05, 2.02), (0.47 * s, -0.05, 2.02), 0.11, 0.09, dark, hard, caps=False)
        blob("EarLamp", (0.475 * s, -0.05, 2.02), (0.02, 0.05, 0.05), red, hard)
    yb = front_y(head, 0.0, 1.86)
    for x in (-0.15, -0.075, 0.0, 0.075, 0.15):
        box("Grille", (x, yb + 0.005, 1.86), (0.035, 0.03, 0.11), dark, hard)
    limb("Antenna", (0, 0, 2.28), (0, 0, 2.62), 0.022, 0.018, dark, hard, caps=False)
    blob("AntennaBall", (0, 0, 2.66), (0.065, 0.065, 0.065), red, hard)
    tail = []
    box("Backpack", (0, 0.47, 1.28), (0.42, 0.16, 0.50), dark, tail)
    blob("PackLamp", (0, 0.555, 1.38), (0.06, 0.02, 0.06), cyan, tail)
    return [head] + hard, tail


HEADS = {"rhino": head_rhino, "lion": head_lion, "croc": head_croc, "panda": head_panda,
         "shark": head_shark, "dragon": head_dragon, "robot": head_robot}


# ---------------------------------------------------------------- figur
def build_character(kind, tex):
    cfg = ANIMALS[kind]
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = f"Char_{kind}"
    if rp.LITE:   # ingen normal-teksturer i de lette modeller
        tex = {k: ((v[0], None) if isinstance(v, tuple) else (None if k == "fabric_n" else v)) for k, v in tex.items()}
    skin = mat(f"Skin_{kind}", cfg["skin"], 0.8, tex[kind][0], tex[kind][1], 0.8)
    limb_mat = mat(f"Limb_{kind}", cfg["limb"], 0.8, None, tex[kind][1], 0.6) if cfg["limb"] else skin
    number = mat("Number", (1, 1, 1), 0.6)
    number.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.0
    M = dict(
        skin=skin, limb=limb_mat,
        dark=mat("SkinDark", (0.24, 0.25, 0.29), 0.8),
        jersey=mat("Jersey", (1, 1, 1), 0.6, tex["jersey"], tex["fabric_n"], 0.6),
        shorts=mat("Shorts", (1, 1, 1), 0.6, None, tex["fabric_n"], 0.6),
        socks=mat("Socks", (1, 1, 1), 0.65), trim=mat("Trim", (1, 1, 1), 0.55),
        white=mat("White", (0.95, 0.95, 0.95), 0.4), boot=mat("Boot", (0.04, 0.04, 0.05), 0.3),
        horn=mat("Horn", HORN, 0.35), iris=mat("Iris", (0.25, 0.12, 0.03), 0.2),
        black=mat("Black", (0.01, 0.01, 0.01), 0.2), crest=mat("Crest", (0.95, 0.68, 0.10), 0.3),
    )
    parts = {k: [] for k in PIVOTS}

    # ben
    for s, side in ((-1, "R"), (1, "L")):
        x = 0.27 * s
        P = parts["Leg" + side]
        g = []
        limb("Thigh", (x, 0, 0.80), (x, -0.01, 0.50), 0.20, 0.17, M["limb"], g)
        blob("Knee", (x, -0.07, 0.57), (0.13, 0.12, 0.10), M["limb"], g)
        P.append(fuse("LegSkin", g, M["limb"], None, voxel=0.02, smooth=5, keep=0.2))
        limb("Sock", (x, -0.01, 0.50), (x, 0, 0.16), 0.165, 0.14, M["socks"], P)
        blob("SockTop", (x, -0.01, 0.50), (0.195, 0.195, 0.06), M["trim"], P)
        blob("Boot", (x, -0.10, 0.09), (0.17, 0.29, 0.10), M["boot"], P)
        blob("BootSole", (x, -0.10, 0.035), (0.175, 0.295, 0.035), M["white"], P)
        for dy in (() if rp.LITE else (-0.09, -0.14, -0.19)):
            z = 0.09 + 0.10 * math.sqrt(1 - (dy / 0.29) ** 2)
            blob("Lace", (x, -0.10 + dy, z), (0.075, 0.012, 0.012), M["white"], P)
        if not rp.LITE:
            blob("BootStripe", (x + 0.165 * s, -0.12, 0.10), (0.012, 0.13, 0.03), M["white"], P)
        for sx, sy in (() if rp.LITE else ((-0.07, -0.30), (0.07, -0.30), (-0.09, -0.14), (0.09, -0.14), (-0.08, 0.06), (0.08, 0.06))):
            limb("Stud", (x + sx, sy, 0.02), (x + sx, sy, -rp.STUD), 0.022, 0.014, M["white"], P, caps=False)

    # krop
    B = parts["Body"]
    g = []
    blob("Torso", (0, 0, 1.22), (0.56, 0.46, 0.50), M["jersey"], g)
    blob("Hem", (0, 0, 0.93), (0.55, 0.45, 0.12), M["jersey"], g)
    jersey = fuse("JerseyMesh", g, M["jersey"], None, uv="front", **FUSE)
    B.append(jersey)
    g = []
    blob("Shorts", (0, 0, 0.84), (0.53, 0.43, 0.24), M["shorts"], g)
    for s in (-1, 1):
        limb("ShortsLeg", (0.27 * s, 0, 0.86), (0.27 * s, 0, 0.60), 0.25, 0.235, M["shorts"], g, caps=False)
    B.append(fuse("ShortsMesh", g, M["shorts"], None, **FUSE))
    blob("Collar", (0, -0.02, 1.64), (0.30, 0.28, 0.07), M["trim"], B)
    y = front_y(jersey, -0.20, 1.38)
    blob("Crest", (-0.20, y, 1.38), (0.075, 0.014, 0.075), M["crest"], B)
    blob("CrestDot", (-0.20, y - 0.008, 1.38), (0.045, 0.012, 0.045), M["boot"], B)
    B.append(patch("NumberFront", (0.20, -0.62, 1.36), 0.22, number, jersey))
    B.append(patch("NumberBack", (0, 0.62, 1.25), 0.50, number, jersey, back=True))

    # arme
    for s, side in ((-1, "R"), (1, "L")):
        P = parts["Arm" + side]
        sh = Vector((0.52 * s, 0, 1.48))
        el = Vector((0.74 * s, -0.02, 1.20))
        ha = Vector((0.80 * s, -0.12, 0.92))
        mid = Vector(((sh.x + el.x) / 2, -0.01, 1.34))
        g = []
        blob("Sleeve", sh, (0.22, 0.21, 0.21), M["jersey"], g)
        limb("SleeveArm", sh, mid, 0.19, 0.17, M["jersey"], g)
        P.append(fuse("SleeveMesh", g, M["jersey"], None, uv="front", **FUSE))
        blob("Cuff", mid, (0.20, 0.20, 0.20), M["trim"], P)
        g = []
        limb("Arm", mid, el, 0.15, 0.14, M["limb"], g)
        limb("Forearm", el, ha, 0.14, 0.13, M["limb"], g)
        blob("Hand", ha, (0.15, 0.16, 0.15), M["limb"], g)
        for dx in (-0.085, 0.0, 0.085):
            blob("Toe", (ha.x + dx, ha.y - 0.07, ha.z - 0.07), (0.06, 0.07, 0.07), M["limb"], g)
            blob("Nail", (ha.x + dx, ha.y - 0.115, ha.z - 0.095), (0.042, 0.035, 0.045), M["horn"], P)
        P.append(fuse("ArmSkin", g, M["limb"], None, voxel=0.02, smooth=5, keep=0.2))

    head_objs, tail_objs = HEADS[kind](M)
    parts["Head"] += head_objs
    B += tail_objs

    for name, objs in parts.items():
        o = join(name, objs)
        set_pivot(o, PIVOTS[name])
        o.parent = root
    root.location.z = rp.STUD
    return root


# ---------------------------------------------------------------- pokal og maskot
def build_trophy():
    """Pokal (Cup) og bord (Stand). Pokalen farves bronze/soelv/guld i spillet."""
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "Trophy"
    gold = mat("Cup", (1.0, 0.74, 0.18), 0.25)
    inner = mat("CupInner", (0.35, 0.22, 0.03), 0.5)
    wood = mat("CupBase", (0.13, 0.07, 0.04), 0.6)
    g = []
    limb("Base", (0, 0, 0), (0, 0, 0.12), 0.22, 0.20, wood, g, caps=False)
    limb("Stem", (0, 0, 0.12), (0, 0, 0.42), 0.055, 0.04, gold, g, caps=False)
    blob("Knob", (0, 0, 0.27), (0.075, 0.075, 0.05), gold, g)
    limb("Bowl", (0, 0, 0.40), (0, 0, 0.86), 0.07, 0.27, gold, g, caps=False)
    ring("Rim", (0, 0, 0.86), (0, 0, 1), 0.27, 0.025, gold, g)
    blob("Inside", (0, 0, 0.855), (0.25, 0.25, 0.015), inner, g)
    for s in (-1, 1):
        ring("Handle", (0.30 * s, 0, 0.66), (0, 1, 0), 0.12, 0.024, gold, g)
    for o in g:
        rp._smooth(o)
    join("Cup", g).parent = root
    g = []
    box("Top", (0, 0, 0.90), (2.9, 0.75, 0.08), wood, g)
    for x in (-1.3, 1.3):
        for y in (-0.28, 0.28):
            box("Leg", (x, y, 0.43), (0.09, 0.09, 0.86), wood, g)
    box("Cloth", (0, 0, 0.945), (2.5, 0.5, 0.012), mat("CupCloth", (0.75, 0.06, 0.10), 0.8), g)
    join("Stand", g).parent = root
    return root


def build_mascot():
    """Maskotten Oerni: en stor gul fugl med bevaegelige vinger (WingL, WingR)."""
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "Mascot"
    yellow = mat("MascotYellow", (0.98, 0.78, 0.08), 0.8)
    dark = mat("MascotDark", (0.80, 0.45, 0.02), 0.8)
    orange = mat("MascotOrange", (0.95, 0.40, 0.03), 0.5)
    white = mat("White", (0.95, 0.95, 0.95), 0.4)
    M = dict(white=white, iris=mat("Iris", (0.25, 0.12, 0.03), 0.2), black=mat("Black", (0.01, 0.01, 0.01), 0.2))
    g, hard = [], []
    blob("Body", (0, 0, 1.0), (0.58, 0.52, 0.72), yellow, g)
    blob("Head", (0, -0.05, 1.92), (0.46, 0.43, 0.43), yellow, g)
    body = fuse("MascotSkin", g, yellow, None, voxel=0.022, smooth=5, keep=0.15)
    blob("Belly", (0, -0.30, 0.95), (0.40, 0.28, 0.52), white, hard)
    limb("Beak", (0, -0.42, 1.86), (0, -0.86, 1.78), 0.17, 0.02, orange, hard, caps=False)
    for s in (-1, 1):
        eye(hard, body, 0.17 * s, 2.02, M, size=1.15)
        blob("Brow", (0.17 * s, -0.40, 2.17), (0.13, 0.05, 0.035), dark, hard, rot=(0, math.radians(-20 * s), 0))
        limb("Leg", (0.22 * s, 0, 0.40), (0.22 * s, 0, 0.06), 0.06, 0.05, orange, hard, caps=False)
        blob("Foot", (0.22 * s, -0.14, 0.06), (0.20, 0.30, 0.06), orange, hard)
    for x, h in ((-0.12, 0.26), (0.0, 0.36), (0.12, 0.26)):
        limb("Tuft", (x, 0.02, 2.28), (x * 1.6, 0.10, 2.28 + h), 0.07, 0.01, dark, hard, caps=False)
    for i in range(3):
        limb("TailFeather", (0, 0.42, 0.75), ((i - 1) * 0.25, 0.80, 0.95 + 0.1 * (i == 1)), 0.10, 0.02, dark, hard, caps=False)
    o = join("MascotBody", [body] + hard)
    o.parent = root
    for s, side in ((1, "L"), (-1, "R")):
        w = []
        blob("Wing", (0.66 * s, 0.0, 1.10), (0.14, 0.30, 0.50), dark, w, rot=(0, math.radians(-16 * s), 0))
        blob("WingTip", (0.74 * s, 0.02, 0.72), (0.10, 0.22, 0.24), yellow, w, rot=(0, math.radians(-16 * s), 0))
        wo = join("Wing" + side, w)
        set_pivot(wo, (0.52 * s, 0, 1.50))
        wo.parent = root
    return root


# ---------------------------------------------------------------- stadion
def box(name, loc, size, material, group, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    o.name = name
    o.data.materials.append(material)
    group.append(o)
    return o


def wedge(name, a, b, n, depth, h0, h1, concrete, crowd, group):
    """Tribune langs linjen a-b, der stiger fra h0 til h1 udad i retningen n."""
    a, b, n = Vector(a), Vector(b), Vector(n)
    length = (b - a).length
    pts = []
    for p in (a, b):
        q = p + n * depth
        pts += [(p.x, p.y, 0), (p.x, p.y, h0), (q.x, q.y, h1), (q.x, q.y, 0)]
    faces = [(1, 5, 6, 2), (0, 4, 5, 1), (3, 2, 6, 7), (0, 1, 2, 3), (4, 7, 6, 5)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts, [], faces)
    me.materials.append(concrete)
    me.materials.append(crowd)
    me.polygons[0].material_index = 1
    uv = me.uv_layers.new(name="UVMap")
    slope = math.hypot(depth, h1 - h0)
    ur, vr = length / 10.0, max(1, round(slope / 6.6))
    for i, c in enumerate(((0, 0), (ur, 0), (ur, vr), (0, vr))):
        uv.data[me.polygons[0].loop_start + i].uv = c
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    group.append(o)
    return o


def text(name, body, loc, size, rotz, material, group):
    bpy.ops.object.text_add(location=loc)
    o = bpy.context.object
    o.data.body = body
    o.data.size = size
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.extrude = 0.02
    o.rotation_euler = (math.radians(90), 0, math.radians(rotz))
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    group.append(o)
    return o


def build_goal(name, sign, white, net_mat):
    """Maal paa maallinjen y = 29*sign, aabning mod banens midte."""
    g = []
    yl, yb, h, hw = 29 * sign, 31.2 * sign, 3.4, 5.0
    for x in (-hw, hw):
        limb("Post", (x, yl, 0), (x, yl, h), 0.09, 0.09, white, g, caps=False)
        limb("BackPost", (x, yb, 0), (x, yb, h * 0.75), 0.05, 0.05, white, g, caps=False)
        limb("TopBar", (x, yl, h), (x, yb, h * 0.75), 0.05, 0.05, white, g, caps=False)
    limb("Crossbar", (-hw - 0.09, yl, h), (hw + 0.09, yl, h), 0.09, 0.09, white, g, caps=False)
    limb("BackBar", (-hw, yb, h * 0.75), (hw, yb, h * 0.75), 0.05, 0.05, white, g, caps=False)

    def net(verts_fn, nx, ny):
        pts = [verts_fn(i / nx, j / ny) for j in range(ny + 1) for i in range(nx + 1)]
        faces = [(j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i)
                 for j in range(ny) for i in range(nx)]
        me = bpy.data.meshes.new("Net")
        me.from_pydata(pts, [], faces)
        me.materials.append(net_mat)
        o = bpy.data.objects.new("Net", me)
        bpy.context.collection.objects.link(o)
        w = o.modifiers.new("wire", "WIREFRAME")
        w.thickness = 0.035
        w.use_replace = True
        apply_modifiers(o)
        g.append(o)

    net(lambda u, v: (-hw + 2 * hw * u, yb, h * 0.75 * v), 20, 6)
    net(lambda u, v: (-hw + 2 * hw * u, yl + (yb - yl) * v, h - h * 0.25 * v), 20, 4)
    for x in (-hw, hw):
        net(lambda u, v, x=x: (x, yl + (yb - yl) * u, (h - h * 0.25 * u) * v), 4, 6)
    return join(name, g)


def build_stadium():
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "Stadium"
    white = mat("White", (0.95, 0.95, 0.95), 0.4)
    concrete = mat("Concrete", (0.45, 0.47, 0.50), 0.9)
    crowd = mat("Crowd", (1, 1, 1), 0.9, crowd_texture())
    steel = mat("Steel", (0.20, 0.22, 0.26), 0.5)
    parts = {}

    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    p = bpy.context.object
    p.scale = (40, 60, 1)
    p.data.materials.append(mat("PitchMat", (1, 1, 1), 0.95, pitch_texture()))
    parts["Pitch"] = [p]
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.03))
    p = bpy.context.object
    p.scale = (220, 240, 1)
    p.data.materials.append(mat("GroundMat", (0.07, 0.30, 0.09), 1.0))
    parts["Ground"] = [p]

    parts["Goal"] = [build_goal("GoalMesh", -1, white, mat("Net", (0.85, 0.87, 0.90), 0.7))]
    parts["Goal2"] = [build_goal("Goal2Mesh", 1, white, mat("Net", (0.85, 0.87, 0.90), 0.7))]

    # bander med tekst
    g = []
    cols = [mat("BoardA", (0.98, 0.78, 0.05), 0.5), mat("BoardB", (0.04, 0.10, 0.28), 0.5),
            mat("BoardC", (0.80, 0.07, 0.10), 0.5)]
    words = ["PLUS", "MINUS", "GANGE", "DIVIDER", "MATEMATIK", "LIGAEN"]
    k = 0
    for sx in (-1, 1):
        for i in range(10):
            y = -27 + i * 6
            m = cols[k % 3]
            box("Board", (22 * sx, y, 0.5), (0.15, 5.9, 1.0), m, g)
            ink = white if m is not cols[0] else cols[1]
            text("BoardText", words[k % 6], (22 * sx - 0.09 * sx, y, 0.5), 0.62, -90 * sx, ink, g)
            k += 1
    for sy in (-1, 1):
        for i in range(7):
            x = -18 + i * 6
            m = cols[k % 3]
            box("Board", (x, 34 * sy, 0.5), (5.9, 0.15, 1.0), m, g)
            ink = white if m is not cols[0] else cols[1]
            text("BoardText", words[k % 6], (x, 34 * sy - 0.09 * sy, 0.5), 0.62, 0 if sy > 0 else 180, ink, g)
            k += 1
    parts["Boards"] = g

    g = []
    red = mat("FlagRed", (0.85, 0.08, 0.10), 0.6)
    for x in (-19, 19):
        for y in (-29, 29):
            limb("FlagPole", (x, y, 0), (x, y, 1.6), 0.03, 0.03, white, g, caps=False)
            box("Flag", (x + 0.25, y, 1.42), (0.5, 0.02, 0.32), red, g)
    parts["Flags"] = g

    g = []
    trunk = mat("Trunk", (0.25, 0.14, 0.06), 0.9)
    leaf = [mat("LeafA", (0.08, 0.36, 0.10), 0.9), mat("LeafB", (0.12, 0.44, 0.14), 0.9)]
    spots = [(sx * 38, y) for sx in (-1, 1) for y in range(-48, 49, 12)] + \
            [(x, sy * 52) for sy in (-1, 1) for x in range(-30, 31, 12)]
    for i, (x, y) in enumerate(spots):
        hgt = 5.5 + (i * 37 % 10) * 0.25
        limb("Trunk", (x, y, 0), (x, y, 1.8), 0.35, 0.3, trunk, g, caps=False)
        limb("Leaf", (x, y, 1.4), (x, y, hgt), 2.0, 0.05, leaf[i % 2], g, caps=False)
        limb("Leaf2", (x, y, 3.0), (x, y, hgt + 1.2), 1.5, 0.05, leaf[(i + 1) % 2], g, caps=False)
    parts["Trees"] = g

    # tribuner
    small, big, roof = [], [], []
    sides = [((-25, -30), (-25, 30), (-1, 0)), ((25, 30), (25, -30), (1, 0)),
             ((22, -37), (-22, -37), (0, -1)), ((-22, 37), (22, 37), (0, 1))]
    roof_mat = mat("RoofMat", (0.92, 0.93, 0.96), 0.4)
    for a, b, n in sides:
        wedge("StandSmall", a, b, n, 6.0, 1.2, 4.2, concrete, crowd, small)
        nv = Vector((n[0], n[1]))
        a2, b2 = Vector(a) + nv * 6.6, Vector(b) + nv * 6.6
        ext = (b2 - a2).normalized() * 6.0
        a2, b2 = a2 - ext, b2 + ext
        wedge("StandBig", a2, b2, n, 10.0, 5.2, 13.5, concrete, crowd, big)
        mid = (a2 + b2) / 2 + nv * 5.0
        length = (b2 - a2).length
        size = (11.5, length, 0.3) if n[0] else (length, 11.5, 0.3)
        tilt = (0, math.radians(8 * n[0]), 0) if n[0] else (math.radians(-8 * n[1]), 0, 0)
        box("RoofSlab", (mid.x, mid.y, 16.8), size, roof_mat, roof, rot=tilt)
        for t in (0.05, 0.5, 0.95):
            q = a2 + (b2 - a2) * t + nv * 9.8
            limb("RoofPillar", (q.x, q.y, 13.0), (q.x, q.y, 17.4), 0.18, 0.18, steel, roof, caps=False)
    parts["StandsSmall"] = small
    parts["StandsBig"] = big
    parts["Roof"] = roof

    # flag i spillerens farver (farves i spillet)
    g = []
    f1, f2 = mat("TeamFlag1", (0.85, 0.08, 0.10), 0.7), mat("TeamFlag2", (0.95, 0.95, 0.95), 0.7)
    k = 0
    for sx in (-1, 1):
        for y in range(-24, 25, 8):
            limb("BannerPole", (31 * sx, y, 4.2), (31 * sx, y, 8.6), 0.08, 0.06, steel, g, caps=False)
            box("Banner", (31 * sx, y + 1.45, 7.6), (0.06, 2.8, 1.8), (f1, f2)[k % 2], g)
            k += 1
    for sy in (-1, 1):
        for x in range(-16, 17, 8):
            limb("BannerPole", (x, 43 * sy, 4.2), (x, 43 * sy, 8.6), 0.08, 0.06, steel, g, caps=False)
            box("Banner", (x + 1.45, 43 * sy, 7.6), (2.8, 0.06, 1.8), (f1, f2)[k % 2], g)
            k += 1
    parts["Banners"] = g

    g = []
    lamp = mat("Lamp", (1.0, 0.97, 0.85), 0.3)
    bsdf = lamp.node_tree.nodes["Principled BSDF"]
    for key, val in (("Emission Color", (1.0, 0.95, 0.80, 1.0)), ("Emission Strength", 3.0)):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = 40 * sx, 52 * sy
            limb("Mast", (x, y, 0), (x, y, 24), 0.35, 0.22, steel, g, caps=False)
            ang = math.atan2(-y, -x) - math.pi / 2
            box("LampFrame", (x, y, 25.2), (5.0, 0.5, 3.0), steel, g, rot=(math.radians(-20), 0, ang))
            d = Vector((-x, -y, 0)).normalized() * 0.3
            box("LampPanel", (x + d.x, y + d.y, 25.1), (4.6, 0.2, 2.6), lamp, g, rot=(math.radians(-20), 0, ang))
    parts["Floodlights"] = g

    for name, objs in parts.items():
        o = join(name, objs)
        o.parent = root
    return root


# ---------------------------------------------------------------- eksport / render
def export(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=82)


def render(path, cam_loc, target, lens=50, res=(1400, 800), samples=32):
    scene = bpy.context.scene
    if "PreviewSun" not in bpy.data.objects:
        bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(35)))
        bpy.context.object.name = "PreviewSun"
        bpy.context.object.data.energy = 3.5
        world = bpy.data.worlds.new("World")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.78, 0.95, 1)
        scene.world = world
        bpy.ops.object.camera_add()
        bpy.context.object.name = "PreviewCam"
        scene.camera = bpy.context.object
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = res
    cam = bpy.data.objects["PreviewCam"]
    cam.data.lens = lens
    cam.data.clip_end = 500
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _lin(hexcol):
    h = hexcol.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def render_cards(chars, mascot, trophy):
    """Renderer et billede til hvert samlekort i assets/cards/cards.json."""
    import json
    folder = os.path.join(rp.ROOT, "assets", "cards")
    cards = json.load(open(os.path.join(folder, "cards.json"), encoding="utf-8"))
    scene = bpy.context.scene
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(55), 0, math.radians(30)))
    bpy.context.object.data.energy = 3.0
    world = bpy.data.worlds.new("CardWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.90, 1.0, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 40
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x, scene.render.resolution_y = 360, 450
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 85
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = 50
    scene.camera = cam
    # troejen farves her med en multiply-node (i spillet goer three.js det samme)
    jersey = bpy.data.materials["Jersey"]
    nt = jersey.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = bsdf.inputs["Base Color"].links[0].from_node
    stripes = tex.image
    gold = bpy.data.images.load(os.path.join(rp.ROOT, "assets", "kits", "guld.jpg"))
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    def colour(name, rgb):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1.0)

    spots = {}
    for i, (kind, root) in enumerate(chars.items()):
        root.location = (300 + 14 * i, 0, rp.STUD)
        spots[kind] = root
    mascot.location = (300 + 14 * 8, 0, 0)
    spots["mascot"] = mascot
    trophy.location = (300 + 14 * 9, 0, 0)
    for c in trophy.children:
        if c.name.startswith("Stand"):
            c.hide_render = True
        else:
            c.scale = (2.6, 2.6, 2.6)
    spots["trophy"] = trophy
    poses = {"klar": (0.12, -0.12), "vink": (2.5, -0.15), "jubel": (2.5, -2.5), "maalmand": (1.2, -1.2)}
    for card in cards:
        root = spots[card["figur"]]
        guld = card["sjaeldenhed"] == "guld"
        c1, c2 = _lin(card["farve1"]), _lin(card["farve2"])
        tex.image = gold if guld else stripes
        mix.inputs[7].default_value = (1, 1, 1, 1) if guld else (*c1, 1.0)
        colour("Socks", c1)
        colour("Shorts", c2)
        colour("Trim", c2)
        left, right = poses[card["pose"]]
        for ch in root.children:
            if ch.name.startswith("ArmL"):
                ch.rotation_euler = (0, -left, 0)
            elif ch.name.startswith("ArmR"):
                ch.rotation_euler = (0, -right, 0)
        cx = root.location.x
        if card["figur"] == "trophy":
            loc, target = (cx + 0.9, -5.6, 2.0), (cx, 0, 1.2)
        else:
            loc, target = (cx + 0.8, -3.9, 2.0), (cx, 0, 1.75)
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(folder, card["id"] + ".webp")
        bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(PREVIEWS, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rp.LITE = "--lite" in args
    tex = make_textures()
    if rp.LITE:   # kun figurerne, i en let udgave: char_<navn>_lite.glb
        for kind in ANIMALS:
            root = build_character(kind, tex)
            print("TRIANGLES lite", kind, rp.triangles(root))
            export(root, os.path.join(MODELS, f"char_{kind}_lite.glb"))
        return
    chars = {}
    for kind in ANIMALS:
        root = build_character(kind, tex)
        print("TRIANGLES", kind, rp.triangles(root))
        export(root, os.path.join(MODELS, f"char_{kind}.glb"))
        chars[kind] = root
    ball = rp.build_ball(loc=(0, 0, 0))
    export(ball, os.path.join(MODELS, "ball.glb"))
    kit_textures()
    trophy, mascot = build_trophy(), build_mascot()
    export(trophy, os.path.join(MODELS, "trophy.glb"))
    export(mascot, os.path.join(MODELS, "mascot.glb"))
    stadium = build_stadium()
    print("TRIANGLES stadium", rp.triangles(stadium))
    export(stadium, os.path.join(MODELS, "stadium.glb"))
    if "--cards" in args:
        render_cards(chars, mascot, trophy)
    if "--render" in args:
        for i, c in enumerate(chars.values()):
            c.location.x = (i - 1.5) * 1.9
            c.location.y = -19
        ball.location = (0, -21, 0.17)
        render(os.path.join(PREVIEWS, "game_characters.png"), (1.2, -31.5, 2.1), (0, -19, 1.25), lens=60)
        if "--all" in args:
            render(os.path.join(PREVIEWS, "game_stadium.png"), (30, 62, 34), (0, -4, 0), lens=30)
            render(os.path.join(PREVIEWS, "game_goal.png"), (0, -12, 2.2), (0, -29, 1.6), lens=28)


if __name__ == "__main__":
    main()
