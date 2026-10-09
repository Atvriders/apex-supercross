"""Procedural PBR material library. Everything is built from Blender shader
nodes - no image textures, no downloads."""

import bpy


def new_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat


mat_new = new_material  # short alias used by factories


def _principled(mat, base, metallic=0.0, roughness=0.5, subsurface=0.0,
                ss_color=(0.8, 0.2, 0.1), specular=0.5, ior=1.45,
                emission=None, emission_strength=0.0, clearcoat=0.0,
                transmission=0.0):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (-200, 0)
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = specular
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Coat Weight"].default_value = clearcoat
    bsdf.inputs["Transmission Weight"].default_value = transmission
    if subsurface > 0:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
        bsdf.inputs["Subsurface Radius"].default_value = ss_color
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, bsdf, nodes, links


def add_noise_bump(mat, scale=8.0, strength=0.25, detail=6.0):
    """Attach a generic surface-noise bump to the material's BSDF."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.location = (-600, -200)
    noise.location = (-800, -200)
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return noise, bump


# ---------------------------------------------------------------------------
# Named materials
# ---------------------------------------------------------------------------
_MAT_CACHE = {}


def _cached(key, factory):
    if key not in _MAT_CACHE:
        _MAT_CACHE[key] = factory(key)
    return _MAT_CACHE[key]


def dirt(key="m_dirt", damp=0.35):
    def f(k):
        mat, bsdf, nodes, links = _principled(
            mat_new(k), (0.42, 0.28, 0.16), roughness=1.0)
        add_noise_bump(mat, scale=14.0, strength=0.6)
        noise2 = nodes.new("ShaderNodeTexNoise")
        noise2.inputs["Scale"].default_value = 40.0
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.52, 0.36, 0.21, 1.0)
        ramp.color_ramp.elements[1].color = (0.32, 0.2, 0.12, 1.0)
        links.new(noise2.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        return mat
    return _cached(key, f)


def damp_dirt(key="m_damp_dirt"):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), (0.24, 0.16, 0.09), roughness=0.75)
        add_noise_bump(mat, scale=10.0, strength=0.5)
        return mat
    return _cached(key, f)


def mud(key="m_mud"):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), (0.16, 0.11, 0.07), roughness=0.35)
        add_noise_bump(mat, scale=6.0, strength=0.8)
        return mat
    return _cached(key, f)


def concrete(key="m_concrete"):
    def f(k):
        mat, bsdf, nodes, links = _principled(
            mat_new(k), (0.55, 0.55, 0.56), roughness=0.85)
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 90.0
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.5, 0.5, 0.51, 1.0)
        ramp.color_ramp.elements[1].color = (0.62, 0.62, 0.63, 1.0)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        add_noise_bump(mat, scale=60.0, strength=0.15)
        return mat
    return _cached(key, f)


def painted_steel(key="m_painted_steel", color=(0.8, 0.1, 0.1)):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), color, metallic=0.85, roughness=0.35)
        add_noise_bump(mat, scale=200.0, strength=0.05)
        return mat
    return _cached(key, f)


def steel(key="m_steel"):
    return painted_steel(key, (0.62, 0.64, 0.66))


def aluminum(key="m_aluminum"):
    return painted_steel(key, (0.78, 0.8, 0.82))


def rubber(key="m_rubber"):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), (0.06, 0.06, 0.065), roughness=0.9)
        add_noise_bump(mat, scale=30.0, strength=0.3)
        return mat
    return _cached(key, f)


def plastic(key="m_plastic", color=(0.85, 0.3, 0.1)):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), color, roughness=0.25, clearcoat=0.6)
        return mat
    return _cached(key, f)


def carbon(key="m_carbon"):
    def f(k):
        mat, bsdf, nodes, links = _principled(
            mat_new(k), (0.08, 0.08, 0.1), metallic=0.4, roughness=0.3)
        wave = nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.inputs["Scale"].default_value = 6.0
        wave.inputs["Distortion"].default_value = 1.5
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.04, 0.04, 0.05, 1.0)
        ramp.color_ramp.elements[1].color = (0.14, 0.14, 0.16, 1.0)
        links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        return mat
    return _cached(key, f)


def fabric(key="m_fabric", color=(0.9, 0.1, 0.12), weave=40.0):
    def f(k):
        mat, bsdf, nodes, links = _principled(
            mat_new(k), color, roughness=0.95)
        wave = nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.inputs["Scale"].default_value = weave
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        links.new(wave.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return mat
    return _cached(key, f)


def leather(key="m_leather", color=(0.12, 0.1, 0.09)):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), color, roughness=0.6)
        add_noise_bump(mat, scale=90.0, strength=0.25)
        return mat
    return _cached(key, f)


def glass(key="m_glass"):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), (0.9, 0.95, 1.0), roughness=0.08,
            transmission=0.9, ior=1.5)
        return mat
    return _cached(key, f)


def stadium_seat(key="m_seat", color=(0.2, 0.3, 0.9)):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), color, roughness=0.6, clearcoat=0.2)
        return mat
    return _cached(key, f)


def tuff_foam(key="m_tuff"):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), (0.95, 0.93, 0.88), roughness=0.85)
        add_noise_bump(mat, scale=25.0, strength=0.4)
        return mat
    return _cached(key, f)


def skin(key="m_skin", tone=(0.62, 0.4, 0.3), sss=0.35):
    def f(k):
        mat, bsdf, nodes, links = _principled(
            mat_new(k), tone, roughness=0.55, subsurface=sss,
            ss_color=(1.0, 0.35, 0.25), specular=0.35)
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 500.0
        noise.inputs["Detail"].default_value = 12.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.08
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        return mat
    return _cached(key, f)


def emissive(key="m_emissive", color=(1, 1, 1), strength=8.0):
    def f(k):
        mat, bsdf, _, _ = _principled(
            mat_new(k), color, roughness=0.4,
            emission=color, emission_strength=strength)
        return mat
    return _cached(key, f)


def video_board(key="m_video_board", color=(0.1, 0.25, 0.6), strength=6.0):
    return emissive(key, color, strength)


def new_material_with_color(name, color, metallic=0.0, roughness=0.5):
    mat, _, _, _ = _principled(
        new_material(name), color, metallic=metallic, roughness=roughness)
    return mat
