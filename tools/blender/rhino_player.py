"""Bygger en stiliseret naesehorns-fodboldspiller i Blender og eksporterer den som .glb.

Koer:
    blender --background --python tools/blender/rhino_player.py -- [--render] [--samples 250]
eller med bpy-modulet:
    python tools/blender/rhino_player.py [--render] [--samples 250] [--res 1000] [--views front,back]

Output:
    assets/models/rhino_player.glb
    assets/models/ball.glb
    assets/textures/*.png                (genererede teksturer)
    assets/previews/rhino_player_*.png   (kun med --render)
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "assets", "models")
TEXTURES = os.path.join(ROOT, "assets", "textures")
PREVIEWS = os.path.join(ROOT, "assets", "previews")

# Holdfarver - ret her for at lave andre hold
JERSEY = (0.80, 0.05, 0.06)
JERSEY_STRIPE = (0.42, 0.02, 0.04)
TRIM = (0.95, 0.95, 0.95)
SHORTS = (0.95, 0.95, 0.95)
SOCKS = (0.80, 0.05, 0.06)
CREST = (0.95, 0.68, 0.10)
SKIN = (0.42, 0.44, 0.48)
SKIN_DARK = (0.24, 0.25, 0.29)
HORN = (0.90, 0.84, 0.68)
BOOT = (0.04, 0.04, 0.05)
NUMBER = "7"

STUD = 0.03  # figuren loeftes, saa knopperne staar paa jorden
LITE = False  # True: faerre polygoner (lette modeller til langsomme enheder)


# ---------------------------------------------------------------- teksturer
def _fractal(n, beta, seed):
    """Fliselagt fraktalstoej i intervallet 0..1."""
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx ** 2 + fy ** 2)
    r[0, 0] = 1
    spec = (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n))) / r ** beta
    spec[0, 0] = 0
    x = np.fft.ifft2(spec).real
    return (x - x.min()) / (x.max() - x.min())


def _normal_from_height(h, strength):
    du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dv = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-du, -dv, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def _save(name, rgb, non_color=False):
    h, w, _ = rgb.shape
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], -1).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(TEXTURES, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def _srgb(c):
    return np.asarray(c, dtype=np.float64) ** (1 / 2.2)


def make_textures(n=1024):
    os.makedirs(TEXTURES, exist_ok=True)
    tex = {}
    # Naesehornshud: grov, med revner
    base = _fractal(n, 1.7, 1)
    cracks = (1 - np.abs(2 * _fractal(n, 1.15, 2) - 1)) ** 28
    grain = _fractal(n, 0.7, 3)
    height = 0.5 * base - 0.35 * cracks + 0.15 * grain
    shade = (0.80 + 0.22 * base) * (1 - 0.35 * cracks) * (0.95 + 0.10 * grain)
    tex["skin_color"] = _save("skin_color", shade[..., None] * _srgb(SKIN)[None, None, :])
    tex["skin_normal"] = _save("skin_normal", _normal_from_height(height, 7.0), True)
    # Stof: vaevet struktur
    u, v = np.meshgrid(np.arange(n) / n, np.arange(n) / n)
    weave = 0.5 + 0.5 * np.sin(2 * np.pi * u * 128) * np.sin(2 * np.pi * v * 128)
    tex["fabric_normal"] = _save("fabric_normal", _normal_from_height(weave + 0.3 * grain, 1.6), True)
    # Troeje: lodrette striber
    stripe = (np.floor(u * 8) % 2)[..., None]
    col = stripe * _srgb(JERSEY_STRIPE) + (1 - stripe) * _srgb(JERSEY)
    tex["jersey_color"] = _save("jersey_color", col * (0.94 + 0.12 * grain[..., None]))
    return tex


# ---------------------------------------------------------------- helpers
_mats = {}


def mat(name, color, rough=0.6, color_img=None, normal_img=None, normal_strength=1.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if color_img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = color_img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if normal_img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    _mats[name] = m
    return m


def _smooth(obj):
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))


def blob(name, loc, scale, material, group, rot=(0, 0, 0)):
    """Ellipsoide."""
    size = max(scale)
    seg = 12 if size < 0.05 else 20 if size < 0.2 else 32
    if LITE:
        seg = 6 if size < 0.05 else 10 if size < 0.2 else 16
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    o.name = name
    o.data.materials.append(material)
    _smooth(o)
    group.append(o)
    return o


def limb(name, p1, p2, r1, r2, material, group, caps=True):
    """Tilspidset roer fra p1 til p2 med kugler i enderne."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cone_add(vertices=10 if LITE else 24, radius1=r1, radius2=r2, depth=d.length,
                                    location=(p1 + p2) / 2)
    o = bpy.context.object
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    o.name = name
    o.data.materials.append(material)
    _smooth(o)
    group.append(o)
    if caps:
        if r1 > 0.02:
            blob(name + "_a", p1, (r1, r1, r1), material, group)
        if r2 > 0.02:
            blob(name + "_b", p2, (r2, r2, r2), material, group)
    return o


def ring(name, loc, direction, major, minor, material, group, scale=(1, 1, 1)):
    """Hudfold: torus vinkelret paa 'direction'."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc,
                                     major_segments=16 if LITE else 32, minor_segments=6 if LITE else 10)
    o = bpy.context.object
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(direction)).to_euler()
    o.scale = scale
    o.name = name
    o.data.materials.append(material)
    group.append(o)
    return o


def _select(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def _apply(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def join(name, objs):
    _select(objs)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def box_uv(obj, size):
    """Kasse-projektion: UV ud fra fladens dominerende retning."""
    me = obj.data
    nl, npoly = len(me.loops), len(me.polygons)
    normals = np.empty(npoly * 3)
    me.polygons.foreach_get("normal", normals)
    totals = np.empty(npoly, dtype=np.int32)
    me.polygons.foreach_get("loop_total", totals)
    axis = np.repeat(np.abs(normals.reshape(-1, 3)).argmax(1), totals)
    vidx = np.empty(nl, dtype=np.int32)
    me.loops.foreach_get("vertex_index", vidx)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[vidx]
    uv = np.where((axis == 0)[:, None], co[:, [1, 2]],
                  np.where((axis == 1)[:, None], co[:, [0, 2]], co[:, [0, 1]])) / size
    layer = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    layer.data.foreach_set("uv", uv.ravel())


def front_uv(obj):
    """Plan projektion forfra, saa striber loeber lodret hele vejen rundt."""
    me = obj.data
    vidx = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", vidx)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[vidx]
    uv = np.stack([co[:, 0] + 0.5 + 1 / 16, co[:, 2]], -1)
    layer = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    layer.data.foreach_set("uv", uv.ravel())


def fuse(name, objs, material, parent, voxel=0.012, smooth=8, keep=0.12, cutters=(), uv="box"):
    """Smelter dele sammen til en glat, sammenhaengende overflade."""
    o = join(name, objs)
    o.data.materials.clear()
    o.data.materials.append(material)
    m = o.modifiers.new("remesh", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = voxel * (1.3 if LITE else 1.0)
    _apply(o, m)
    for c in cutters:
        m = o.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
        _apply(o, m)
        bpy.data.objects.remove(c)
    m = o.modifiers.new("smooth", "SMOOTH")
    m.factor = 0.5
    m.iterations = smooth
    _apply(o, m)
    m = o.modifiers.new("decimate", "DECIMATE")
    m.ratio = keep * (0.35 if LITE else 1.0)
    _apply(o, m)
    _smooth(o)
    if uv == "front":
        front_uv(o)
    else:
        box_uv(o, 0.6)
    o.parent = parent
    return o


def decal(name, obj, material, parent, target, offset=0.012):
    """Laegger et fladt maerke (tal, logo) ned paa troejens overflade."""
    bpy.context.view_layer.objects.active = obj
    obj.name = name
    obj.data.materials.append(material)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.mesh.subdivide(number_cuts=3)
    bpy.ops.mesh.subdivide(number_cuts=2)
    bpy.ops.object.mode_set(mode="OBJECT")
    sw = obj.modifiers.new("wrap", "SHRINKWRAP")
    sw.target = target
    sw.wrap_method = "PROJECT"
    sw.use_project_z = True
    sw.use_positive_direction = True
    sw.use_negative_direction = True
    sw.offset = offset
    obj.parent = parent
    return obj


def number(name, text, loc, size, material, parent, target, back=False):
    bpy.ops.object.text_add(location=loc)
    o = bpy.context.object
    o.data.body = text
    o.data.size = size
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.rotation_euler = (math.radians(90), 0, math.radians(180) if back else 0)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    # Centrer tallet praecist (skrifttypens egen centrering er skaev)
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    co -= (co.max(0) + co.min(0)) / 2
    o.data.vertices.foreach_set("co", co.ravel())
    return decal(name, o, material, parent, target)


def disc(name, loc, radius, material, parent, target, offset):
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=radius, fill_type="NGON", location=loc,
                                      rotation=(math.radians(90), 0, 0))
    return decal(name, bpy.context.object, material, parent, target, offset)


# ---------------------------------------------------------------- model
def build_player(tex):
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "RhinoPlayer"

    skin = mat("Skin", SKIN, 0.8, tex["skin_color"], tex["skin_normal"], 1.0)
    skin_dark = mat("SkinDark", SKIN_DARK, 0.8)
    jersey = mat("Jersey", JERSEY, 0.6, tex["jersey_color"], tex["fabric_normal"], 0.6)
    shorts = mat("Shorts", SHORTS, 0.6, None, tex["fabric_normal"], 0.6)
    socks = mat("Socks", SOCKS, 0.65)
    trim = mat("Trim", TRIM, 0.55)
    crest = mat("Crest", CREST, 0.3)
    horn = mat("Horn", HORN, 0.35)
    boot = mat("Boot", BOOT, 0.3)
    white = mat("EyeWhite", (1, 1, 1), 0.2)
    iris = mat("Iris", (0.25, 0.12, 0.03), 0.2)
    black = mat("Black", (0.01, 0.01, 0.01), 0.2)

    hard = []      # dele der beholder skarpe former
    g_jersey, g_shorts, g_head, g_horn, g_horn2 = [], [], [], [], []

    # ---- ben, stroemper og stoevler
    for s, side in ((-1, "L"), (1, "R")):
        x = 0.27 * s
        g_leg = []
        limb("Thigh", (x, 0, 0.80), (x, -0.01, 0.50), 0.20, 0.17, skin, g_leg)
        blob("Knee", (x, -0.07, 0.57), (0.13, 0.12, 0.10), skin, g_leg)
        ring("KneeFold1", (x, -0.01, 0.60), (0, 0, 1), 0.175, 0.022, skin, g_leg)
        ring("KneeFold2", (x, -0.01, 0.545), (0, 0, 1), 0.165, 0.020, skin, g_leg)
        fuse(f"Leg_{side}", g_leg, skin, root, keep=0.25)

        limb(f"Sock_{side}", (x, -0.01, 0.50), (x, 0, 0.16), 0.165, 0.14, socks, hard)
        blob(f"SockTop_{side}", (x, -0.01, 0.50), (0.195, 0.195, 0.06), trim, hard)
        blob(f"SockBand_{side}", (x, -0.01, 0.43), (0.168, 0.168, 0.02), trim, hard)
        blob(f"Boot_{side}", (x, -0.10, 0.09), (0.17, 0.29, 0.10), boot, hard)
        blob(f"BootSole_{side}", (x, -0.10, 0.035), (0.175, 0.295, 0.035), trim, hard)
        blob(f"BootStripe_{side}", (x + 0.165 * s, -0.12, 0.10), (0.012, 0.13, 0.03), trim, hard)
        for i, dy in enumerate((-0.09, -0.14, -0.19)):
            z = 0.09 + 0.10 * math.sqrt(1 - (dy / 0.29) ** 2)
            blob(f"Lace_{side}{i}", (x, -0.10 + dy, z), (0.075, 0.012, 0.012), trim, hard)
        for i, (sx, sy) in enumerate(((-0.07, -0.30), (0.07, -0.30), (-0.09, -0.14),
                                      (0.09, -0.14), (-0.08, 0.06), (0.08, 0.06))):
            limb(f"Stud_{side}{i}", (x + sx, sy, 0.02), (x + sx, sy, -STUD), 0.022, 0.014,
                 trim, hard, caps=False)
        limb("ShortsLeg", (x, 0, 0.86), (x, 0, 0.60), 0.25, 0.235, shorts, g_shorts, caps=False)

    # ---- shorts og troeje
    blob("Shorts", (0, 0, 0.84), (0.53, 0.43, 0.24), shorts, g_shorts)
    blob("Torso", (0, 0, 1.22), (0.56, 0.46, 0.50), jersey, g_jersey)
    blob("Hem", (0, 0, 0.93), (0.55, 0.45, 0.12), jersey, g_jersey)
    blob("Collar", (0, -0.02, 1.64), (0.30, 0.28, 0.07), trim, hard)

    # ---- arme
    for s, side in ((-1, "L"), (1, "R")):
        sh = Vector((0.52 * s, 0, 1.48))
        el = Vector((0.74 * s, -0.02, 1.20))
        ha = Vector((0.80 * s, -0.12, 0.92))
        mid = Vector(((sh.x + el.x) / 2, -0.01, 1.34))
        blob("Sleeve", sh, (0.22, 0.21, 0.21), jersey, g_jersey)
        limb("SleeveArm", sh, mid, 0.19, 0.17, jersey, g_jersey)
        blob(f"Cuff_{side}", mid, (0.20, 0.20, 0.20), trim, hard)

        g_arm = []
        limb("Arm", mid, el, 0.15, 0.14, skin, g_arm)
        limb("Forearm", el, ha, 0.14, 0.13, skin, g_arm)
        blob("Hand", ha, (0.15, 0.16, 0.15), skin, g_arm)
        fa = ha - el
        ring("ElbowFold1", el + fa * 0.10, fa, 0.135, 0.020, skin, g_arm)
        ring("ElbowFold2", el - (el - mid) * 0.12, el - mid, 0.14, 0.020, skin, g_arm)
        ring("WristFold", el + fa * 0.72, fa, 0.125, 0.018, skin, g_arm)
        for i, dx in enumerate((-0.085, 0.0, 0.085)):
            blob("Toe", (ha.x + dx, ha.y - 0.07, ha.z - 0.07), (0.06, 0.07, 0.07), skin, g_arm)
            blob(f"Nail_{side}{i}", (ha.x + dx, ha.y - 0.115, ha.z - 0.095), (0.042, 0.035, 0.045),
                 horn, hard)
        fuse(f"Arm_{side}", g_arm, skin, root, keep=0.2)

    # ---- nakke og hoved
    limb("Neck", (0, 0, 1.58), (0, -0.06, 1.82), 0.27, 0.27, skin, g_head)
    blob("NeckHump", (0, 0.13, 1.76), (0.30, 0.22, 0.22), skin, g_head)
    ring("NeckFold1", (0, -0.02, 1.725), (0, 0.15, 1), 0.275, 0.028, skin, g_head)
    ring("NeckFold2", (0, -0.04, 1.80), (0, 0.15, 1), 0.27, 0.025, skin, g_head)
    blob("Head", (0, -0.08, 1.95), (0.37, 0.40, 0.34), skin, g_head)
    blob("Jaw", (0, -0.22, 1.78), (0.30, 0.30, 0.20), skin, g_head)
    blob("Snout", (0, -0.50, 1.80), (0.27, 0.40, 0.23), skin, g_head, rot=(math.radians(14), 0, 0))
    blob("Lip", (0, -0.80, 1.66), (0.21, 0.13, 0.10), skin, g_head)
    ring("SnoutFold", (0, -0.40, 1.83), (0, 1, -0.25), 0.25, 0.02, skin, g_head, scale=(1.05, 0.93, 1))
    blob("HornBase", (0, -0.76, 1.88), (0.15, 0.15, 0.06), skin, g_head, rot=(math.radians(18), 0, 0))
    for s in (-1, 1):
        ear_rot = (math.radians(-12), math.radians(24 * s), 0)
        blob("Ear", (0.29 * s, 0.12, 2.30), (0.10, 0.05, 0.17), skin, g_head, rot=ear_rot)
        blob(f"EarInner{s}", (0.287 * s, 0.078, 2.30), (0.062, 0.022, 0.115), skin_dark, hard, rot=ear_rot)
        blob("Brow", (0.22 * s, -0.385, 2.135), (0.12, 0.06, 0.035), skin, g_head,
             rot=(0, math.radians(-18 * s), 0))
        blob("Eyelid", (0.22 * s, -0.355, 2.075), (0.095, 0.075, 0.06), skin, g_head,
             rot=(0, math.radians(-12 * s), 0))
        blob("Cheek", (0.24 * s, -0.30, 1.88), (0.13, 0.14, 0.11), skin, g_head)
        ring("EyeFold", (0.24 * s, -0.36, 1.985), (0.3 * s, -1, 0.1), 0.085, 0.012, skin, g_head)
        blob(f"Eye{s}", (0.22 * s, -0.37, 2.03), (0.075, 0.06, 0.085), white, hard)
        blob(f"Iris{s}", (0.215 * s, -0.405, 2.025), (0.05, 0.03, 0.06), iris, hard)
        blob(f"Pupil{s}", (0.213 * s, -0.425, 2.022), (0.028, 0.016, 0.036), black, hard)
        blob(f"Glint{s}", (0.213 * s + 0.018, -0.437, 2.04), (0.009, 0.006, 0.009), white, hard)

    # Mund: en smal spalte skaaret ind i snuden
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(0, -0.62, 1.685),
                                         rotation=(math.radians(20), 0, 0))
    mouth = bpy.context.object
    mouth.scale = (0.31, 0.31, 0.016)
    head = fuse("Head", g_head, skin, root, voxel=0.011, smooth=6, keep=0.22, cutters=[mouth])
    for s in (-1, 1):
        ok, hit, _, _ = head.ray_cast((0.10 * s, -2.0, 1.765), (0, 1, 0))
        y = hit.y if ok else -0.86
        blob(f"Nostril{s}", (0.10 * s, y + 0.014, 1.765), (0.030, 0.018, 0.024), black, hard)

    # ---- horn (let krummet)
    pts = [(0, -0.74, 1.87), (0, -0.83, 2.05), (0, -0.87, 2.22), (0, -0.855, 2.40)]
    rad = [0.12, 0.088, 0.052, 0.008]
    for i in range(3):
        limb("HornSeg", pts[i], pts[i + 1], rad[i], rad[i + 1], horn, g_horn)
    fuse("Horn", g_horn, horn, root, voxel=0.008, smooth=6, keep=0.15)
    limb("Horn2Seg", (0, -0.48, 1.98), (0, -0.52, 2.10), 0.085, 0.05, horn, g_horn2)
    limb("Horn2Seg", (0, -0.52, 2.10), (0, -0.515, 2.21), 0.05, 0.008, horn, g_horn2)
    fuse("HornSmall", g_horn2, horn, root, voxel=0.008, smooth=6, keep=0.15)

    # ---- hale
    limb("Tail", (0, 0.38, 0.90), (0, 0.60, 0.70), 0.045, 0.03, skin_dark, hard)
    blob("TailTuft", (0, 0.63, 0.66), (0.06, 0.07, 0.09), black, hard)

    # ---- sammensmeltning af toej
    jersey_obj = fuse("Jersey", g_jersey, jersey, root, uv="front")
    fuse("Shorts", g_shorts, shorts, root)

    # ---- tal og klublogo
    number("NumberFront", NUMBER, (0.20, -0.47, 1.36), 0.20, trim, root, jersey_obj)
    number("NumberBack", NUMBER, (0, 0.47, 1.25), 0.42, trim, root, jersey_obj, back=True)
    disc("CrestOuter", (-0.20, -0.47, 1.38), 0.075, crest, root, jersey_obj, 0.010)
    disc("CrestInner", (-0.20, -0.47, 1.38), 0.052, mat("CrestRed", JERSEY_STRIPE, 0.4), root, jersey_obj, 0.014)
    disc("CrestDot", (-0.20, -0.47, 1.38), 0.022, horn, root, jersey_obj, 0.018)

    details = join("Details", hard)
    details.parent = root
    root.location.z = STUD
    return root


def build_ball(loc=(0.62, -0.55, 0.17), r=0.17):
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "Ball"
    white = mat("BallWhite", (0.97, 0.97, 0.97), 0.4)
    black = mat("Black", (0.01, 0.01, 0.01), 0.2)
    parts = []
    blob("BallBody", (0, 0, 0), (r, r, r), white, parts)
    phi = (1 + 5 ** 0.5) / 2
    dirs = []
    for a in (-1, 1):
        for b in (-phi, phi):
            dirs += [(0, a, b), (a, b, 0), (b, 0, a)]
    for i, d in enumerate(dirs):
        v = Vector(d).normalized()
        blob(f"BallPatch{i}", v * (r * 0.62), (r * 0.42,) * 3, black, parts)
    join("BallMesh", parts).parent = root
    root.location = loc
    return root


def export(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_apply=True,
                              export_image_format="JPEG")


def triangles(root):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for c in root.children_recursive:
        if c.type == "MESH":
            me = c.evaluated_get(dg).data
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
    return total


# ---------------------------------------------------------------- render
VIEWS = {
    "front": ((2.4, -5.2, 1.7), (0.1, 0, 1.18), 55),
    "side": ((-5.6, -1.0, 1.5), (0.0, 0, 1.18), 55),
    "back": ((2.6, 5.0, 1.9), (0.1, 0, 1.18), 55),
    "face": ((1.1, -2.6, 2.1), (0.0, -0.35, 1.95), 60),
}


def render_previews(samples, res, views):
    bpy.ops.mesh.primitive_plane_add(size=40)
    bpy.context.object.data.materials.append(mat("Grass", (0.10, 0.42, 0.12), 0.9))
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(35)))
    bpy.context.object.data.energy = 3.5
    bpy.context.object.data.angle = math.radians(3)
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.78, 0.95, 1)
    bg.inputs[1].default_value = 1.0
    scene = bpy.context.scene
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = False
    scene.render.resolution_x = res
    scene.render.resolution_y = int(res * 1.125)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    for name in views:
        loc, target, lens = VIEWS[name]
        cam.data.lens = lens
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEWS, f"rhino_player_{name}.png")
        bpy.ops.render.render(write_still=True)


def _arg(args, flag, default):
    return args[args.index(flag) + 1] if flag in args else default


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(PREVIEWS, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tex = make_textures()
    player = build_player(tex)
    ball = build_ball()
    print("TRIANGLES player:", triangles(player), "ball:", triangles(ball))
    export(player, os.path.join(MODELS, "rhino_player.glb"))
    ball_loc = ball.location.copy()
    ball.location = (0, 0, 0)
    export(ball, os.path.join(MODELS, "ball.glb"))
    ball.location = ball_loc
    if "--render" in args:
        render_previews(int(_arg(args, "--samples", 250)), int(_arg(args, "--res", 1000)),
                        _arg(args, "--views", "front,side,back,face").split(","))


if __name__ == "__main__":
    main()
