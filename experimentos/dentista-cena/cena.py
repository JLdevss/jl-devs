"""Cena do hero de dentista: consultório pela manhã. Bandeja de inox escovado com espelho clínico
e sonda sobre papel sálvia, roletes de algodão, copo d'água e ramo de eucalipto. O sol entra pela
janela filtrado por folhas e o refletor do consultório acende com a rolagem.

Uso (Blender 5.x):
  blender -b --factory-startup --python cena.py -- --modo teste --frame 1 [--formato retrato]
  blender -b --factory-startup --python cena.py -- --modo final --formato paisagem [--inicio N --fim M]
Saída: ./render/<formato>/####.png  (teste: ./render/teste/<formato>_####.png)
"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Matrix

AQUI = os.path.dirname(os.path.abspath(__file__))

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(nome, padrao):
    return argv[argv.index(nome) + 1] if nome in argv else padrao
MODO = arg("--modo", "teste")
FORMATO = arg("--formato", "paisagem")
FRAME = int(arg("--frame", "1"))
AMOSTRAS = int(arg("--amostras", "48" if MODO == "teste" else "128"))
ESCALA = int(arg("--escala", "50" if MODO == "teste" else "100"))
INICIO = int(arg("--inicio", "1"))
FIM = int(arg("--fim", "120"))
N_FRAMES = int(arg("--quadros", "120"))

random.seed(5)

# ------------------------------------------------------------------ limpeza
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

# ------------------------------------------------------------------ helpers
def mat(nome):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]

def setin(bsdf, nome, valor):
    if nome in bsdf.inputs:
        bsdf.inputs[nome].default_value = valor

def mth(nodes, links, op, a, b=None, c=None):
    """Nó Math; a/b/c podem ser número ou saída de outro nó."""
    nd = nodes.new("ShaderNodeMath"); nd.operation = op
    for k, x in enumerate((a, b, c)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            nd.inputs[k].default_value = x
        else:
            links.new(x, nd.inputs[k])
    return nd.outputs[0]

def faixa(nodes, links, x, de, ate, para0=0.0, para1=1.0):
    """Map Range com clamp: leva x de [de, ate] para [para0, para1]."""
    nd = nodes.new("ShaderNodeMapRange"); nd.clamp = True
    links.new(x, nd.inputs[0])
    nd.inputs[1].default_value, nd.inputs[2].default_value = de, ate
    nd.inputs[3].default_value, nd.inputs[4].default_value = para0, para1
    return nd.outputs[0]

def entre(nodes, links, x, a, b, e=0.00015):
    """1 dentro de [a, b], 0 fora, com borda suave e."""
    return mth(nodes, links, "MULTIPLY", faixa(nodes, links, x, a - e, a), faixa(nodes, links, x, b, b + e, 1, 0))

def mistura(nodes, links, fator, c0, c1):
    nd = nodes.new("ShaderNodeMix"); nd.data_type = "RGBA"
    if isinstance(fator, (int, float)):
        nd.inputs[0].default_value = fator
    else:
        links.new(fator, nd.inputs[0])
    for idx, c in ((6, c0), (7, c1)):
        if isinstance(c, tuple):
            nd.inputs[idx].default_value = c
        else:
            links.new(c, nd.inputs[idx])
    return nd.outputs[2]

def atribuir(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)

def suave(obj, ang=40):
    for p in obj.data.polygons:
        p.use_smooth = True
    try:
        obj.data.set_sharp_from_angle(angle=math.radians(ang))
    except Exception:
        pass

def bevel(obj, larg, seg=3, ang=None):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = larg
    mod.segments = seg
    mod.limit_method = "ANGLE"
    if ang is not None:
        mod.angle_limit = math.radians(ang)
    return mod

def ativar(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

def aplicar(obj, mod):
    ativar(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)

def cubo(nome, tam, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = nome
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    return o

def cilindro(nome, r, prof, loc, rot=(0, 0, 0), verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=prof, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = nome
    return o

def cone(nome, r1, r2, prof, loc, rot=(0, 0, 0), verts=64):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=prof, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = nome
    return o

def esfera(nome, r, loc, seg=32, aneis=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=aneis, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = nome
    return o

def sem_tampa(obj):
    """Remove a face de cima (maior z) de um cilindro/cone: vira um copo para o Solidify."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    topo = max(bm.faces, key=lambda f: f.calc_center_median().z)
    bmesh.ops.delete(bm, geom=[topo], context="FACES")
    bm.to_mesh(obj.data); bm.free()

def rot_eixo(v):
    """Euler que leva o eixo Z local para a direção v."""
    return Vector(v).normalized().to_track_quat("Z", "Y").to_euler()

def segmento(nome, a, b, r, m, verts=32):
    """Cilindro de a até b."""
    a, b = Vector(a), Vector(b)
    o = cilindro(nome, r, (b - a).length, (a + b) / 2, rot_eixo(b - a), verts)
    atribuir(o, m); suave(o, 50)
    return o

def vidro_mat(nome, cor, ior):
    m, n, l, b = mat(nome)
    setin(b, "Base Color", cor); setin(b, "Roughness", 0.0); setin(b, "IOR", ior)
    setin(b, "Transmission Weight", 1.0)
    for attr, val in (("use_raytrace_refraction", True), ("surface_render_method", "DITHERED"), ("thickness_mode", "SLAB")):
        try:
            setattr(m, attr, val)
        except Exception as e:
            print("[vidro] ignorado", attr, e)
    return m

MESA_Z = 0.9

# ------------------------------------------------------------------ materiais
# Bancada de quartzo branco: nuvens suaves, pintas finas, polido com leve variação
m_quartzo, n, l, b = mat("quartzo")
co = n.new("ShaderNodeTexCoord")
nuv = n.new("ShaderNodeTexNoise"); nuv.inputs["Scale"].default_value = 2.5; nuv.inputs["Detail"].default_value = 6
l.new(co.outputs["Object"], nuv.inputs["Vector"])
vor = n.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 420
l.new(co.outputs["Object"], vor.inputs["Vector"])
pinta = faixa(n, l, vor.outputs["Distance"], 0.03, 0.09, 1.0, 0.0)
base_q = mistura(n, l, faixa(n, l, nuv.outputs["Fac"], 0.35, 0.65), (0.60, 0.59, 0.56, 1), (0.68, 0.67, 0.64, 1))
l.new(mistura(n, l, mth(n, l, "MULTIPLY", pinta, 0.55), base_q, (0.30, 0.29, 0.28, 1)), b.inputs["Base Color"])
l.new(faixa(n, l, nuv.outputs["Fac"], 0.3, 0.7, 0.07, 0.16), b.inputs["Roughness"])
bq = n.new("ShaderNodeBump"); bq.inputs["Strength"].default_value = 0.02
l.new(pinta, bq.inputs["Height"]); l.new(bq.outputs["Normal"], b.inputs["Normal"])

# Inox escovado (bandeja): riscos longos ao longo do X local
m_inox, n, l, b = mat("inox_escovado")
setin(b, "Metallic", 1.0); setin(b, "Base Color", (0.60, 0.60, 0.59, 1))
co = n.new("ShaderNodeTexCoord")
mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (3, 1400, 1400)
l.new(co.outputs["Object"], mp.inputs["Vector"])
risco = n.new("ShaderNodeTexNoise"); risco.inputs["Scale"].default_value = 1.0; risco.inputs["Detail"].default_value = 4
l.new(mp.outputs["Vector"], risco.inputs["Vector"])
mancha = n.new("ShaderNodeTexNoise"); mancha.inputs["Scale"].default_value = 30
l.new(co.outputs["Object"], mancha.inputs["Vector"])
rug = mth(n, l, "ADD", faixa(n, l, risco.outputs["Fac"], 0.3, 0.7, 0.12, 0.26), faixa(n, l, mancha.outputs["Fac"], 0.4, 0.7, 0.0, 0.06))
l.new(rug, b.inputs["Roughness"])
bi = n.new("ShaderNodeBump"); bi.inputs["Strength"].default_value = 0.015
l.new(risco.outputs["Fac"], bi.inputs["Height"]); l.new(bi.outputs["Normal"], b.inputs["Normal"])

# Aço polido (hastes, cabeça do espelho)
m_aco, n, l, b = mat("aco_polido")
setin(b, "Metallic", 1.0); setin(b, "Base Color", (0.63, 0.63, 0.62, 1))
mic = n.new("ShaderNodeTexNoise"); mic.inputs["Scale"].default_value = 900
l.new(faixa(n, l, mic.outputs["Fac"], 0.35, 0.65, 0.08, 0.15), b.inputs["Roughness"])

# Superfície do espelho clínico (primeira face)
m_espelho, n, l, b = mat("espelho")
setin(b, "Metallic", 1.0); setin(b, "Base Color", (0.95, 0.95, 0.95, 1)); setin(b, "Roughness", 0.0)

def m_serrilhado(nome, raio, meia):
    """Cabo com serrilha em diamante (knurl) só na pega; fora dela, aço liso acetinado.
    Coordenadas do próprio cilindro: eixo em Z local, ângulo pelo gradiente radial."""
    m, n, l, b = mat(nome)
    setin(b, "Metallic", 1.0)
    co = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(co.outputs["Object"], sep.inputs[0])
    rad = n.new("ShaderNodeTexGradient"); rad.gradient_type = "RADIAL"
    l.new(co.outputs["Object"], rad.inputs["Vector"])
    voltas = 28
    u = mth(n, l, "MULTIPLY", rad.outputs["Fac"], voltas)
    zz = mth(n, l, "MULTIPLY", sep.outputs["Z"], voltas / (2 * math.pi * raio))
    pa = mth(n, l, "PINGPONG", mth(n, l, "ADD", u, zz), 0.5)
    pb = mth(n, l, "PINGPONG", mth(n, l, "SUBTRACT", u, zz), 0.5)
    pico = mth(n, l, "MINIMUM", pa, pb)
    absz = mth(n, l, "ABSOLUTE", sep.outputs["Z"])
    na_pega = faixa(n, l, absz, meia - 0.0006, meia, 1, 0)
    # dois anéis gravados nas pontas da pega
    anel = mth(n, l, "ADD", entre(n, l, absz, meia + 0.0012, meia + 0.0022, 0.0002), 0)
    altura = mth(n, l, "SUBTRACT", mth(n, l, "ADD", mth(n, l, "MULTIPLY", pico, na_pega), mth(n, l, "MULTIPLY", mth(n, l, "SUBTRACT", 1, na_pega), 0.5)), mth(n, l, "MULTIPLY", anel, 0.4))
    bp = n.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.7; bp.inputs["Distance"].default_value = 0.0004
    l.new(altura, bp.inputs["Height"]); l.new(bp.outputs["Normal"], b.inputs["Normal"])
    l.new(mistura(n, l, faixa(n, l, altura, 0.05, 0.45), (0.30, 0.30, 0.30, 1), (0.62, 0.62, 0.61, 1)), b.inputs["Base Color"])
    l.new(faixa(n, l, na_pega, 0, 1, 0.16, 0.3), b.inputs["Roughness"])
    return m

def m_anelado(nome, meia):
    """Cabo sextavado da sonda: anéis finos na pega."""
    m, n, l, b = mat(nome)
    setin(b, "Metallic", 1.0); setin(b, "Base Color", (0.62, 0.62, 0.61, 1)); setin(b, "Roughness", 0.2)
    co = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(co.outputs["Object"], sep.inputs[0])
    absz = mth(n, l, "ABSOLUTE", sep.outputs["Z"])
    an = mth(n, l, "PINGPONG", mth(n, l, "MULTIPLY", sep.outputs["Z"], 900), 0.5)
    na_pega = faixa(n, l, absz, meia - 0.0005, meia, 1, 0)
    altura = mth(n, l, "ADD", mth(n, l, "MULTIPLY", an, na_pega), mth(n, l, "MULTIPLY", mth(n, l, "SUBTRACT", 1, na_pega), 0.5))
    bp = n.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.5; bp.inputs["Distance"].default_value = 0.0003
    l.new(altura, bp.inputs["Height"]); l.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m

def m_ponta_sonda(comp):
    """Ponta da sonda milimetrada: faixas pretas de 3 a 5 mm e de 7 a 10 mm a partir da ponta."""
    m, n, l, b = mat("ponta_sonda")
    co = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(co.outputs["Object"], sep.inputs[0])
    d = mth(n, l, "SUBTRACT", comp / 2, sep.outputs["Z"])
    marca = mth(n, l, "MINIMUM", mth(n, l, "ADD", entre(n, l, d, 0.003, 0.005), entre(n, l, d, 0.007, 0.010)), 1.0)
    l.new(mistura(n, l, marca, (0.62, 0.62, 0.61, 1), (0.015, 0.015, 0.016, 1)), b.inputs["Base Color"])
    l.new(faixa(n, l, marca, 0, 1, 1.0, 0.0), b.inputs["Metallic"])
    l.new(faixa(n, l, marca, 0, 1, 0.14, 0.35), b.inputs["Roughness"])
    return m

# Papel de bandeja sálvia, fibra fina e gofrado discreto
m_papel, n, l, b = mat("papel_salvia")
setin(b, "Base Color", (0.30, 0.42, 0.35, 1)); setin(b, "Roughness", 0.88)
setin(b, "Sheen Weight", 0.35); setin(b, "Sheen Tint", (0.85, 0.95, 0.9, 1))
co = n.new("ShaderNodeTexCoord")
fib = n.new("ShaderNodeTexNoise"); fib.inputs["Scale"].default_value = 1100; fib.inputs["Detail"].default_value = 3
l.new(co.outputs["Object"], fib.inputs["Vector"])
gof = n.new("ShaderNodeTexVoronoi"); gof.inputs["Scale"].default_value = 260
l.new(co.outputs["Object"], gof.inputs["Vector"])
alt_p = mth(n, l, "ADD", mth(n, l, "MULTIPLY", fib.outputs["Fac"], 0.5), mth(n, l, "MULTIPLY", gof.outputs["Distance"], 0.5))
bpp = n.new("ShaderNodeBump"); bpp.inputs["Strength"].default_value = 0.08
l.new(alt_p, bpp.inputs["Height"]); l.new(bpp.outputs["Normal"], b.inputs["Normal"])

# Algodão: fosco, aveludado, com leve espalhamento
m_algodao, n, l, b = mat("algodao")
setin(b, "Base Color", (0.86, 0.86, 0.84, 1)); setin(b, "Roughness", 1.0)
setin(b, "Sheen Weight", 0.8); setin(b, "Sheen Roughness", 0.6)
setin(b, "Subsurface Weight", 0.25); setin(b, "Subsurface Scale", 0.002)
fa = n.new("ShaderNodeTexNoise"); fa.inputs["Scale"].default_value = 2600; fa.inputs["Detail"].default_value = 8
ba = n.new("ShaderNodeBump"); ba.inputs["Strength"].default_value = 0.35
l.new(fa.outputs["Fac"], ba.inputs["Height"]); l.new(ba.outputs["Normal"], b.inputs["Normal"])

m_vidro = vidro_mat("vidro", (0.97, 0.99, 0.98, 1), 1.5)
m_agua = vidro_mat("agua", (0.93, 0.97, 1.0, 1), 1.333)

# Cerâmica de grés areia, esmalte acetinado com pintas de ferro
m_ceram, n, l, b = mat("ceramica")
co = n.new("ShaderNodeTexCoord")
vc = n.new("ShaderNodeTexVoronoi"); vc.inputs["Scale"].default_value = 180
l.new(co.outputs["Object"], vc.inputs["Vector"])
nc = n.new("ShaderNodeTexNoise"); nc.inputs["Scale"].default_value = 14
l.new(co.outputs["Object"], nc.inputs["Vector"])
base_c = mistura(n, l, faixa(n, l, nc.outputs["Fac"], 0.3, 0.7), (0.50, 0.45, 0.38, 1), (0.60, 0.55, 0.47, 1))
l.new(mistura(n, l, faixa(n, l, vc.outputs["Distance"], 0.04, 0.1, 0.85, 0.0), base_c, (0.12, 0.09, 0.07, 1)), b.inputs["Base Color"])
setin(b, "Roughness", 0.55); setin(b, "Coat Weight", 0.35); setin(b, "Coat Roughness", 0.28)

# Folha de eucalipto (verde-azulado com pruína; translúcida contra o sol)
m_folha, n, l, b = mat("folha")
co = n.new("ShaderNodeTexCoord")
nf = n.new("ShaderNodeTexNoise"); nf.inputs["Scale"].default_value = 160; nf.inputs["Detail"].default_value = 4
l.new(co.outputs["Object"], nf.inputs["Vector"])
l.new(mistura(n, l, faixa(n, l, nf.outputs["Fac"], 0.35, 0.65), (0.13, 0.22, 0.20, 1), (0.20, 0.31, 0.28, 1)), b.inputs["Base Color"])
setin(b, "Roughness", 0.5); setin(b, "Sheen Weight", 0.45); setin(b, "Sheen Tint", (0.8, 0.9, 0.92, 1))
setin(b, "Subsurface Weight", 0.35); setin(b, "Subsurface Scale", 0.003)
m_caule, n, l, b = mat("caule")
setin(b, "Base Color", (0.22, 0.17, 0.13, 1)); setin(b, "Roughness", 0.6)

# Parede de massa acrílica clara
m_parede, n, l, b = mat("parede")
setin(b, "Base Color", (0.46, 0.44, 0.41, 1)); setin(b, "Roughness", 0.92)
co = n.new("ShaderNodeTexCoord")
pw = n.new("ShaderNodeTexNoise"); pw.inputs["Scale"].default_value = 70; pw.inputs["Detail"].default_value = 8
l.new(co.outputs["Object"], pw.inputs["Vector"])
bw = n.new("ShaderNodeBump"); bw.inputs["Strength"].default_value = 0.05
l.new(pw.outputs["Fac"], bw.inputs["Height"]); l.new(bw.outputs["Normal"], b.inputs["Normal"])

m_laca, n, l, b = mat("laca_branca")  # armário e caixilho
setin(b, "Base Color", (0.80, 0.80, 0.78, 1)); setin(b, "Roughness", 0.35)

# Carvalho claro (prateleira ao fundo)
m_carv, n, l, b = mat("carvalho")
co = n.new("ShaderNodeTexCoord")
mpc = n.new("ShaderNodeMapping"); mpc.inputs["Scale"].default_value = (0.15, 1.0, 1.0)
l.new(co.outputs["Object"], mpc.inputs["Vector"])
wv = n.new("ShaderNodeTexWave"); wv.inputs["Scale"].default_value = 6.0; wv.inputs["Distortion"].default_value = 9.0
wv.bands_direction = "Y"; l.new(mpc.outputs["Vector"], wv.inputs["Vector"])
l.new(mistura(n, l, wv.outputs["Fac"], (0.32, 0.22, 0.13, 1), (0.48, 0.35, 0.22, 1)), b.inputs["Base Color"])
setin(b, "Roughness", 0.45)

def m_fosco(nome, cor, rug=0.8):
    m, n, l, b = mat(nome)
    setin(b, "Base Color", cor + (1,)); setin(b, "Roughness", rug)
    return m

# Exterior (desfocado): folhagem e céu claro, emissivo
m_fora = bpy.data.materials.new("exterior"); m_fora.use_nodes = True
nt = m_fora.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 3.2
cof = nt.nodes.new("ShaderNodeTexCoord")
nzf = nt.nodes.new("ShaderNodeTexNoise"); nzf.inputs["Scale"].default_value = 2.2; nzf.inputs["Detail"].default_value = 1
nt.links.new(cof.outputs["Object"], nzf.inputs["Vector"])
rmp = nt.nodes.new("ShaderNodeValToRGB")
rmp.color_ramp.elements[0].position = 0.30; rmp.color_ramp.elements[0].color = (0.10, 0.20, 0.07, 1)
rmp.color_ramp.elements[1].position = 0.72; rmp.color_ramp.elements[1].color = (0.80, 0.88, 0.98, 1)
rmp.color_ramp.elements.new(0.5).color = (0.26, 0.42, 0.14, 1)
nt.links.new(nzf.outputs["Fac"], rmp.inputs["Fac"]); nt.links.new(rmp.outputs["Color"], em.inputs["Color"])
nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs["Surface"])

# Cortina de voal: translúcida e meio transparente
m_voal = bpy.data.materials.new("voal"); m_voal.use_nodes = True
nt = m_voal.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
tl = nt.nodes.new("ShaderNodeBsdfTranslucent"); tl.inputs["Color"].default_value = (0.92, 0.91, 0.88, 1)
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
mx = nt.nodes.new("ShaderNodeMixShader"); mx.inputs[0].default_value = 0.55
nt.links.new(tl.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
nt.links.new(mx.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
try:
    m_voal.surface_render_method = "DITHERED"
except Exception:
    pass

m_folha_sombra = m_fosco("folha_sombra", (0.05, 0.08, 0.04))

# ------------------------------------------------------------------ bancada, armário, parede e janela
bancada = cubo("bancada", (2.8, 1.32, 0.04), (0.1, 0.16, MESA_Z - 0.02)); bevel(bancada, 0.004, 3); atribuir(bancada, m_quartzo)
armario = cubo("armario", (2.8, 0.02, MESA_Z - 0.06), (0.1, -0.46, (MESA_Z - 0.06) / 2)); atribuir(armario, m_laca)
piso = cubo("piso", (6, 6, 0.02), (0, 0, -0.01)); atribuir(piso, m_fosco("piso", (0.42, 0.40, 0.37), 0.5))

JAN_X0, JAN_X1 = -1.25, -0.25
JAN_Z0, JAN_Z1 = MESA_Z + 0.12, MESA_Z + 1.5
PAR_Y, PAR_E = 0.88, 0.12
for nome, x0, x1, z0, z1 in (("par_dir", JAN_X1, 2.4, 0, 3.0), ("par_esq", -2.6, JAN_X0, 0, 3.0),
                             ("par_baixo", JAN_X0, JAN_X1, 0, JAN_Z0), ("par_cima", JAN_X0, JAN_X1, JAN_Z1, 3.0)):
    p = cubo(nome, (x1 - x0, PAR_E, z1 - z0), ((x0 + x1) / 2, PAR_Y, (z0 + z1) / 2)); atribuir(p, m_parede)
# caixilho de alumínio branco: contorno, montante central e travessa
for nome, tam, loc in (("caix_v", (0.035, 0.05, JAN_Z1 - JAN_Z0), ((JAN_X0 + JAN_X1) / 2, PAR_Y + 0.02, (JAN_Z0 + JAN_Z1) / 2)),
                       ("caix_h", (JAN_X1 - JAN_X0, 0.05, 0.035), ((JAN_X0 + JAN_X1) / 2, PAR_Y + 0.02, JAN_Z0 + 0.95)),
                       ("caix_e", (0.04, 0.06, JAN_Z1 - JAN_Z0), (JAN_X0 + 0.02, PAR_Y + 0.02, (JAN_Z0 + JAN_Z1) / 2)),
                       ("caix_d", (0.04, 0.06, JAN_Z1 - JAN_Z0), (JAN_X1 - 0.02, PAR_Y + 0.02, (JAN_Z0 + JAN_Z1) / 2)),
                       ("caix_b", (JAN_X1 - JAN_X0, 0.06, 0.04), ((JAN_X0 + JAN_X1) / 2, PAR_Y + 0.02, JAN_Z0 + 0.02)),
                       ("caix_t", (JAN_X1 - JAN_X0, 0.06, 0.04), ((JAN_X0 + JAN_X1) / 2, PAR_Y + 0.02, JAN_Z1 - 0.02))):
    c = cubo(nome, tam, loc); bevel(c, 0.003, 2); atribuir(c, m_laca)
teto = cubo("teto", (6, 4, 0.02), (0, -0.6, 2.7)); atribuir(teto, m_fosco("teto", (0.72, 0.71, 0.68), 0.9))
fora = cubo("exterior", (7, 0.02, 5), (-0.6, 3.4, 2.0)); atribuir(fora, m_fora)
fora.visible_shadow = False

# voal à esquerda da janela, com pregas
bpy.ops.mesh.primitive_grid_add(x_subdivisions=120, y_subdivisions=8, size=1, location=(0, 0, 0))
voal = bpy.context.active_object; voal.name = "voal"
voal.scale = (0.5, 1.5, 1); bpy.ops.object.transform_apply(scale=True)
for v in voal.data.vertices:
    v.co.z += 0.022 * math.sin(v.co.x * 52) + 0.008 * math.sin(v.co.x * 131 + 1.3)
voal.rotation_euler = (math.radians(90), 0, 0)
voal.location = (JAN_X0 + 0.22, PAR_Y - 0.09, (JAN_Z0 + JAN_Z1) / 2 + 0.05)
atribuir(voal, m_voal); suave(voal, 80)

# prateleira de carvalho ao fundo à direita (vida no desfoque)
prat = cubo("prateleira", (0.9, 0.2, 0.03), (1.25, PAR_Y - PAR_E / 2 - 0.1, MESA_Z + 0.55)); bevel(prat, 0.003, 2); atribuir(prat, m_carv)
PZ = MESA_Z + 0.565
pote1 = cone("pote1", 0.045, 0.04, 0.13, (0.98, 0.70, PZ + 0.065)); atribuir(pote1, m_ceram); suave(pote1, 40)
pote2 = cone("pote2", 0.035, 0.03, 0.09, (1.10, 0.70, PZ + 0.045)); atribuir(pote2, m_fosco("pote_claro", (0.72, 0.71, 0.68), 0.4)); suave(pote2, 40)
zl = PZ
for i, (cor, w) in enumerate((((0.30, 0.38, 0.33), 0.028), ((0.62, 0.56, 0.46), 0.022), ((0.12, 0.16, 0.22), 0.03), ((0.70, 0.68, 0.62), 0.02))):
    lv = cubo(f"livro{i}", (0.15, 0.17 - i * 0.01, w), (1.42, 0.70, zl + w / 2), (0, 0, math.radians(random.uniform(-6, 6))))
    zl += w
    bevel(lv, 0.002, 2); atribuir(lv, m_fosco(f"capa{i}", cor, 0.7))

# ------------------------------------------------------------------ bandeja de inox
TX, TY, TR = 0.06, 0.06, math.radians(-10)
TL, TW, TH, PISO = 0.29, 0.19, 0.016, 0.0012
bandeja = cubo("bandeja", (TL, TW, TH), (0, 0, TH / 2))
mb = bevel(bandeja, 0.014, 8, 60); aplicar(bandeja, mb)
miolo = cubo("miolo", (TL - 0.018, TW - 0.018, 0.04), (0, 0, PISO + 0.02))
mm = bevel(miolo, 0.007, 6, 30); aplicar(miolo, mm)
bo = bandeja.modifiers.new("oco", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = miolo
try:
    bo.solver = "EXACT"
except Exception:
    pass
aplicar(bandeja, bo)
bpy.data.objects.remove(miolo, do_unlink=True)
bevel(bandeja, 0.0005, 2, 50)
suave(bandeja, 35); atribuir(bandeja, m_inox)
bandeja.location = (TX, TY, MESA_Z); bandeja.rotation_euler = (0, 0, TR)
M_BAND = Matrix.Translation((TX, TY, MESA_Z)) @ Matrix.Rotation(TR, 4, "Z")

# papel sálvia no fundo da bandeja, levemente ondulado
bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=40, size=1, location=(0, 0, 0))
papel = bpy.context.active_object; papel.name = "papel"
papel.scale = (TL - 0.028, TW - 0.028, 1); bpy.ops.object.transform_apply(scale=True)
rp = random.Random(3)
fases = [rp.uniform(0, 6.28) for _ in range(4)]
for v in papel.data.vertices:
    x, y = v.co.x, v.co.y
    v.co.z = 0.0005 * (math.sin(x * 60 + fases[0]) * math.sin(y * 45 + fases[1]) + 0.6 * math.sin(x * 140 + y * 90 + fases[2])) + 0.0011  # nunca abaixo do fundo da bandeja (o inox aparecia em "buracos")
papel.parent = bandeja; papel.location = (0, 0, PISO)
sp = papel.modifiers.new("esp", "SOLIDIFY"); sp.thickness = 0.0003
atribuir(papel, m_papel); suave(papel, 80)
SUP = PISO + 0.0016  # topo do papel, em coordenadas da bandeja

def na_bandeja(obj, x, y, z, rz=0.0, rx=0.0):
    obj.parent = bandeja
    obj.location = (x, y, z)
    obj.rotation_euler = (rx, 0, rz)

# ------------------------------------------------------------------ espelho clínico nº 5
def novo_vazio(nome):
    e = bpy.data.objects.new(nome, None); bpy.context.collection.objects.link(e)
    return e

R_CABO = 0.004
espelho = novo_vazio("espelho_clinico")
cabo = cilindro("cabo_espelho", R_CABO, 0.105, (0.0525, 0, 0), (0, math.radians(90), 0), 48)
bevel(cabo, 0.0008, 3); suave(cabo, 40); atribuir(cabo, m_serrilhado("serrilha", R_CABO, 0.032))
conico = cone("conico_espelho", R_CABO, 0.0015, 0.014, (0.112, 0, 0), (0, math.radians(90), 0), 48)
suave(conico, 40); atribuir(conico, m_aco)
A_HASTE = math.radians(14)
ini = Vector((0.119, 0, 0)); dh = Vector((math.cos(A_HASTE), 0, math.sin(A_HASTE)))
fim_h = ini + dh * 0.026
haste = segmento("haste_espelho", ini, fim_h, 0.00125, m_aco)
junta = esfera("junta_espelho", 0.00125, fim_h, 24, 12); atribuir(junta, m_aco); suave(junta, 80)
A_CAB = math.radians(4)  # face levemente voltada para o cabo: reflete o centro da janela
ud = Vector((math.cos(A_CAB), 0, math.sin(A_CAB)))
nrm = Vector((-math.sin(A_CAB), 0, math.cos(A_CAB)))
R_ESP = 0.0115
centro = fim_h + ud * (R_ESP + 0.0016)
pescoco = segmento("pescoco_espelho", fim_h, fim_h + ud * 0.0028, 0.0013, m_aco)
aro = cilindro("aro_espelho", R_ESP, 0.0026, centro, rot_eixo(nrm), 96)
bevel(aro, 0.0008, 4); suave(aro, 40); atribuir(aro, m_aco)
face = cilindro("face_espelho", R_ESP - 0.0011, 0.0003, centro + nrm * 0.00135, rot_eixo(nrm), 96)
atribuir(face, m_espelho)
for o in (cabo, conico, haste, junta, pescoco, aro, face):
    o.parent = espelho
na_bandeja(espelho, -0.118, -0.022, SUP + R_CABO, math.radians(4))

# ------------------------------------------------------------------ sonda periodontal milimetrada
sonda = novo_vazio("sonda")
R_SEX = 0.0045
cabo_s = cilindro("cabo_sonda", R_SEX, 0.1, (0.05, 0, 0), (0, math.radians(90), 0), 6)
bevel(cabo_s, 0.0009, 3); suave(cabo_s, 40); atribuir(cabo_s, m_anelado("anelado", 0.03))
con_s = cone("conico_sonda", R_SEX * 0.88, 0.0014, 0.014, (0.107, 0, 0), (0, math.radians(90), 0), 48)
suave(con_s, 40); atribuir(con_s, m_aco)
p0 = Vector((0.114, 0, 0))
p1 = p0 + Vector((math.cos(math.radians(10)), 0, math.sin(math.radians(10)))) * 0.022
p2 = p1 + Vector((math.cos(math.radians(-30)), 0, math.sin(math.radians(-30)))) * 0.012
COMP_PONTA = 0.012
dir3 = Vector((math.cos(math.radians(-62)), 0, math.sin(math.radians(-62))))
p3 = p2 + dir3 * COMP_PONTA
partes_s = [cabo_s, con_s,
            segmento("haste1_sonda", p0, p1, 0.0011, m_aco),
            segmento("haste2_sonda", p1, p2, 0.0009, m_aco)]
ponta = cilindro("ponta_sonda", 0.00055, COMP_PONTA, (p2 + p3) / 2, rot_eixo(dir3), 24)
atribuir(ponta, m_ponta_sonda(COMP_PONTA)); suave(ponta, 50); partes_s.append(ponta)
for i, (pp, rr) in enumerate(((p1, 0.0011), (p2, 0.0009), (p3, 0.00055))):
    j = esfera(f"junta_sonda{i}", rr, pp, 20, 10); atribuir(j, m_aco); suave(j, 80); partes_s.append(j)
for o in partes_s:
    o.parent = sonda
# deitada de lado (dobras no plano da bandeja), paralela ao espelho
na_bandeja(sonda, -0.112, 0.036, SUP + R_SEX * 0.87, math.radians(2), math.radians(90))

# ------------------------------------------------------------------ roletes de algodão
for i, (x, y, rz) in enumerate(((0.083, 0.012, 84), (0.096, 0.026, 97), (0.104, -0.012, 79))):
    rl = cilindro(f"rolete{i}", 0.0048, 0.038, (0, 0, 0), (0, math.radians(90), 0), 32)
    bpy.ops.object.transform_apply(rotation=True)
    mbv = bevel(rl, 0.0022, 4); aplicar(rl, mbv)
    ss = rl.modifiers.new("sub", "SUBSURF"); ss.levels = 2; ss.render_levels = 2; aplicar(rl, ss)
    tx = bpy.data.textures.new(f"fiapo{i}", "CLOUDS"); tx.noise_scale = 0.0016
    dp = rl.modifiers.new("fiapo", "DISPLACE"); dp.texture = tx; dp.strength = 0.0004; dp.texture_coords = "OBJECT"
    aplicar(rl, dp)
    suave(rl, 80); atribuir(rl, m_algodao)
    z = SUP + 0.0048 + (0.0085 if i == 1 else 0.0)
    na_bandeja(rl, x, y, z, math.radians(rz))

# ------------------------------------------------------------------ toalhas de linho dobradas (fundo à esquerda)
m_linho, n, l, b = mat("linho")
setin(b, "Base Color", (0.62, 0.62, 0.58, 1)); setin(b, "Roughness", 0.95)
setin(b, "Sheen Weight", 0.5); setin(b, "Sheen Roughness", 0.5)
co = n.new("ShaderNodeTexCoord")
tw1 = n.new("ShaderNodeTexWave"); tw1.inputs["Scale"].default_value = 900; tw1.bands_direction = "X"
tw2 = n.new("ShaderNodeTexWave"); tw2.inputs["Scale"].default_value = 900; tw2.bands_direction = "Y"
nl = n.new("ShaderNodeTexNoise"); nl.inputs["Scale"].default_value = 60
for t_ in (tw1, tw2, nl):
    l.new(co.outputs["Object"], t_.inputs["Vector"])
trama = mth(n, l, "ADD", mth(n, l, "MULTIPLY", tw1.outputs["Fac"], tw2.outputs["Fac"]), mth(n, l, "MULTIPLY", nl.outputs["Fac"], 0.6))
bl = n.new("ShaderNodeBump"); bl.inputs["Strength"].default_value = 0.25
l.new(trama, bl.inputs["Height"]); l.new(bl.outputs["Normal"], b.inputs["Normal"])
m_linho2, n2, l2, b2 = mat("linho_salvia")
setin(b2, "Base Color", (0.30, 0.40, 0.34, 1)); setin(b2, "Roughness", 0.95); setin(b2, "Sheen Weight", 0.5)
l2.new(n2.new("ShaderNodeBump").outputs["Normal"], b2.inputs["Normal"])
CX, CY = -0.20, 0.36
zt = MESA_Z
for i, (m_t, alt_t, rz_t) in enumerate(((m_linho2, 0.022, 14), (m_linho, 0.02, 9))):
    tl_ = cubo(f"toalha{i}", (0.2 - i * 0.008, 0.13 - i * 0.006, alt_t), (CX + i * 0.004, CY - i * 0.003, zt + alt_t / 2), (0, 0, math.radians(rz_t)))
    bv = bevel(tl_, alt_t * 0.45, 6); aplicar(tl_, bv)
    ss_ = tl_.modifiers.new("sub", "SUBSURF"); ss_.levels = 1; ss_.render_levels = 2
    tx_ = bpy.data.textures.new(f"dobra{i}", "CLOUDS"); tx_.noise_scale = 0.05
    dp_ = tl_.modifiers.new("dobra", "DISPLACE"); dp_.texture = tx_; dp_.strength = 0.0025; dp_.texture_coords = "OBJECT"
    suave(tl_, 80); atribuir(tl_, m_t)
    zt += alt_t

# ------------------------------------------------------------------ vaso com eucalipto (fundo à direita)
VX, VY = 0.30, 0.40
vaso = cone("vaso", 0.031, 0.024, 0.12, (VX, VY, MESA_Z + 0.06), verts=96)
sem_tampa(vaso)
sv = vaso.modifiers.new("parede", "SOLIDIFY"); sv.thickness = 0.004; sv.offset = -1; aplicar(vaso, sv)
bevel(vaso, 0.0015, 3, 50); suave(vaso, 40); atribuir(vaso, m_ceram)
re = random.Random(21)
BOCA = Vector((VX, VY, MESA_Z + 0.115))
for s_i in range(3):
    alt = re.uniform(0.2, 0.3)
    inclin = Vector((re.uniform(-0.1, 0.12), re.uniform(-0.12, 0.06), 0))
    pts = []
    for k in range(9):
        s = k / 8
        pts.append(BOCA + Vector((0, 0, -0.08)) + Vector((0, 0, (alt + 0.08) * s)) + inclin * (s * s) * alt * 1.6
                   + Vector((0.006 * math.sin(s * 7 + s_i), 0.006 * math.cos(s * 5 + s_i), 0)))
    cd = bpy.data.curves.new(f"caule{s_i}", "CURVE"); cd.dimensions = "3D"
    cd.bevel_depth = 0.0012; cd.bevel_resolution = 3
    sp_ = cd.splines.new("POLY"); sp_.points.add(len(pts) - 1)
    for p_, v_ in zip(sp_.points, pts):
        p_.co = (v_.x, v_.y, v_.z, 1)
    co_ = bpy.data.objects.new(f"caule{s_i}", cd); bpy.context.collection.objects.link(co_)
    cd.materials.append(m_caule)
    base_lado = Vector((1, 0, 0)).cross(Vector((0, 0, 1))).normalized()  # (0,-1,0)
    for k in range(3, 9):
        s = k / 8
        p_ = pts[k]
        tg = (pts[min(k + 1, 8)] - pts[k - 1]).normalized()
        lado0 = tg.cross(Vector((0.3, 0.2, 0.9)).normalized()).normalized()
        lado0 = Matrix.Rotation(k * math.pi / 2 + s_i, 3, tg) @ lado0  # pares cruzados
        rf = 0.016 * (1 - s) + 0.007 * s + re.uniform(-0.0015, 0.0015)
        for sinal in (1, -1):
            lado = lado0 * sinal
            nrm_f = Matrix.Rotation(re.uniform(-0.7, 0.7), 3, lado) @ tg.cross(lado).normalized()
            fo = esfera("folha", 1.0, (0, 0, 0), 24, 12)
            fo.scale = (rf, rf, rf * 0.07)
            fo.rotation_euler = rot_eixo(nrm_f)
            fo.location = p_ + lado * rf * 0.95
            atribuir(fo, m_folha); suave(fo, 80)

# ------------------------------------------------------------------ luzes
# sol da manhã entrando pela janela (atrás, à esquerda): contraluz nos objetos
para_sol = Vector((-0.60, 0.62, 0.50)).normalized()
sol_d = bpy.data.lights.new("sol", "SUN"); sol_d.angle = math.radians(0.8)
sol_d.color = (1.0, 0.91, 0.80); sol_d.energy = 3.0
sol = bpy.data.objects.new("sol", sol_d); bpy.context.collection.objects.link(sol)
sol.rotation_euler = para_sol.to_track_quat("Z", "Y").to_euler()

# folhas lá fora, entre o sol e a janela: sombra rendada e viva sobre a bancada (invisíveis à câmera)
copa = novo_vazio("copa")
copa.location = Vector((TX, TY, MESA_Z)) + para_sol * 2.6
u_ = para_sol.cross(Vector((0, 0, 1))).normalized(); v_ = u_.cross(para_sol).normalized()
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
folha_s = bpy.context.active_object; folha_s.name = "folha_sombra"
folha_s.scale = (0.075, 0.036, 1); bpy.ops.object.transform_apply(scale=True)
atribuir(folha_s, m_folha_sombra)
for attr in ("hide_probe_sphere", "hide_probe_volume", "hide_probe_plane"):
    if hasattr(folha_s, attr):
        setattr(folha_s, attr, True)
folha_s.visible_camera = False; folha_s.visible_glossy = False; folha_s.visible_diffuse = False
folha_s.hide_render = True  # só molde: as cópias abaixo é que fazem sombra
rf_ = random.Random(8)
for i in range(700):
    a_ = rf_.uniform(-0.75, 0.75); b_ = rf_.uniform(-0.6, 0.6)
    if (a_ / 0.75) ** 2 + (b_ / 0.6) ** 2 > 1 and rf_.random() < 0.8:
        continue
    if math.hypot(a_ + 0.02, b_ + 0.02) < 0.17:  # sombra cairia na bandeja (vira "adesivo")
        continue
    fs = folha_s.copy(); bpy.context.collection.objects.link(fs)
    fs.hide_render = False
    fs.location = u_ * a_ + v_ * b_ + para_sol * rf_.uniform(-0.3, 0.3)
    fs.rotation_euler = (rf_.uniform(0, 6.28), rf_.uniform(0, 6.28), rf_.uniform(0, 6.28))
    fs.parent = copa
    fs.visible_camera = False; fs.visible_glossy = False; fs.visible_diffuse = False
    for attr in ("hide_probe_sphere", "hide_probe_volume", "hide_probe_plane"):
        if hasattr(fs, attr):
            setattr(fs, attr, True)

# céu entrando pela janela (área fria grande na abertura)
ceu_d = bpy.data.lights.new("ceu_janela", "AREA"); ceu_d.shape = "RECTANGLE"
ceu_d.size = JAN_X1 - JAN_X0; ceu_d.size_y = JAN_Z1 - JAN_Z0
ceu_d.color = (0.78, 0.87, 1.0); ceu_d.energy = 7; ceu_d.specular_factor = 0.0
ceu = bpy.data.objects.new("ceu_janela", ceu_d); bpy.context.collection.objects.link(ceu)
ceu.location = ((JAN_X0 + JAN_X1) / 2, PAR_Y - PAR_E / 2 - 0.01, (JAN_Z0 + JAN_Z1) / 2)
ceu.rotation_euler = (math.radians(-90), 0, 0)  # -Z local aponta para -Y (para dentro da sala)

# refletor do consultório: acende com a rolagem, luz neutra e nítida sobre a bandeja
ref_d = bpy.data.lights.new("refletor", "AREA"); ref_d.shape = "DISK"; ref_d.size = 0.22
ref_d.color = (1.0, 0.97, 0.94); ref_d.energy = 0
refl = bpy.data.objects.new("refletor", ref_d); bpy.context.collection.objects.link(refl)
refl.location = (TX + 0.05, TY - 0.32, MESA_Z + 0.95)
refl.rotation_euler = (Vector((TX, TY, MESA_Z)) - refl.location).normalized().to_track_quat("-Z", "Y").to_euler()

# luminária de teto (painel): reflexos longos no inox
painel_d = bpy.data.lights.new("painel", "AREA"); painel_d.shape = "RECTANGLE"; painel_d.size = 1.2; painel_d.size_y = 0.45
painel_d.color = (1.0, 0.98, 0.95); painel_d.energy = 4; painel_d.diffuse_factor = 0.35; painel_d.volume_factor = 0.0
painel = bpy.data.objects.new("painel", painel_d); bpy.context.collection.objects.link(painel)
painel.location = (0.15, 0.45, MESA_Z + 1.35)

# rebatido quente das paredes do lado da câmera
reb_d = bpy.data.lights.new("rebatido", "AREA"); reb_d.shape = "RECTANGLE"; reb_d.size = 2.0; reb_d.size_y = 1.2
reb_d.color = (1.0, 0.95, 0.88); reb_d.energy = 3; reb_d.specular_factor = 0.25; reb_d.volume_factor = 0.0
reb = bpy.data.objects.new("rebatido", reb_d); bpy.context.collection.objects.link(reb)
reb.location = (0.9, -1.3, MESA_Z + 0.7)
reb.rotation_euler = (Vector((TX, TY, MESA_Z)) - reb.location).normalized().to_track_quat("-Z", "Y").to_euler()

# céu (mundo): preenchimento frio e claro
mundo = bpy.data.worlds.new("mundo"); cena.world = mundo; mundo.use_nodes = True
bg = mundo.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1); bg.inputs["Strength"].default_value = 0.05

# poeira no feixe de sol
m_po, n, l, b = mat("poeira")
setin(b, "Base Color", (0.9, 0.88, 0.84, 1)); setin(b, "Roughness", 0.9)
poeira = novo_vazio("poeira")
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.0004, location=(0, 0, 0))
grao = bpy.context.active_object; atribuir(grao, m_po)
rpo = random.Random(11)
for i in range(130):
    g = grao if i == 0 else grao.copy()
    if i:
        bpy.context.collection.objects.link(g)
    g.location = (rpo.uniform(-0.5, 0.4), rpo.uniform(0.0, 0.75), MESA_Z + rpo.uniform(0.03, 0.55))
    g.scale = (s := rpo.uniform(0.6, 1.4), s, s)
    g.parent = poeira

# névoa leve dentro da sala (feixes de sol visíveis)
vol = cubo("nevoa", (3.0, 1.5, 1.8), (-0.2, 0.08, MESA_Z + 0.6))
m_vol = bpy.data.materials.new("nevoa"); m_vol.use_nodes = True
nt = m_vol.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
pv = nt.nodes.new("ShaderNodeVolumePrincipled"); pv.inputs["Density"].default_value = 0.012
if "Anisotropy" in pv.inputs:
    pv.inputs["Anisotropy"].default_value = 0.5
nt.links.new(pv.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
atribuir(vol, m_vol)
vol.visible_shadow = False

# ------------------------------------------------------------------ câmera
bpy.context.view_layer.update()
MIR_C = face.matrix_world.translation.copy()
BANDEJA_C = M_BAND @ Vector((0.0, 0.01, 0.006))
# macro: câmera na direção em que o espelho reflete a janela com folhagem (frente-direita, ~27° de elevação)
DIR_MACRO = (Vector((0.45, -0.62, 0.64)) if FORMATO == "retrato" else Vector((0.55, -0.70, 0.45))).normalized()

# sondas de reflexão: o espelho e o inox refletem a sala (janela, teto) e não o cinza do mundo
for nome, loc, raio in (("sonda_espelho", MIR_C + Vector((0, 0, 0.01)), 0.2), ("sonda_sala", (0.0, 0.1, MESA_Z + 0.4), 2.5)):
    try:
        bpy.ops.object.lightprobe_add(type="SPHERE", location=loc)
        pr = bpy.context.active_object; pr.name = nome
        pr.data.influence_distance = raio
        pr.data.clip_start = 0.004
    except Exception as e:
        print("[sonda] ignorada", nome, e)

cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d); bpy.context.collection.objects.link(cam); cena.camera = cam
cam_d.dof.use_dof = True
cam_d.clip_start = 0.002  # macro a 10 cm: o padrão (0,1 m) recortava o espelho
cam_d.sensor_width = 36
alvo = novo_vazio("alvo")
tc = cam.constraints.new("TRACK_TO"); tc.target = alvo; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
foco = novo_vazio("foco")
cam_d.dof.focus_object = foco

def ease_io(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0, min(1, t)))
def lerp(a, b, t):
    return a + (b - a) * t
def lerpv(a, b, t):
    return Vector(a).lerp(Vector(b), t)

if FORMATO == "retrato":
    cena.render.resolution_x, cena.render.resolution_y = 1440, 2560
    C0, A0, L0, F0 = MIR_C + DIR_MACRO * 0.1, MIR_C + Vector((0, 0.006, 0)), 40, 4.0
    C1, A1, L1, F1 = (0.04, -0.62, MESA_Z + 0.40), (0.07, 0.18, MESA_Z + 0.10), 32, 2.8
else:
    cena.render.resolution_x, cena.render.resolution_y = 1920, 1080
    C0, A0, L0, F0 = MIR_C + DIR_MACRO * 0.115, MIR_C, 60, 4.0
    C1, A1, L1, F1 = (-0.22, -0.48, MESA_Z + 0.26), (-0.04, 0.16, MESA_Z + 0.04), 36, 2.8

for f in range(1, N_FRAMES + 1):
    t = (f - 1) / (N_FRAMES - 1)
    tc_ = ease_io(t)
    cam.location = lerpv(C0, C1, tc_) + Vector((0, 0, 0.01 * math.sin(t * math.pi)))
    alvo.location = lerpv(A0, A1, tc_)
    cam_d.lens = lerp(L0, L1, tc_)
    cam_d.dof.aperture_fstop = lerp(F0, F1, tc_)
    foco.location = lerpv(MIR_C, BANDEJA_C, ease_io(t * 1.15))
    cam.keyframe_insert("location", frame=f); alvo.keyframe_insert("location", frame=f)
    foco.keyframe_insert("location", frame=f)
    cam_d.keyframe_insert("lens", frame=f); cam_d.dof.keyframe_insert("aperture_fstop", frame=f)
    # refletor acende entre 15% e 60%; a manhã clareia; as folhas balançam devagar
    k = ease_io((t - 0.15) / 0.45)
    ref_d.energy = 14 * k; ref_d.keyframe_insert("energy", frame=f)
    sol_d.energy = lerp(4.2, 6.0, ease_io(t)); sol_d.keyframe_insert("energy", frame=f)
    copa.rotation_euler = (0, 0, math.radians(0.8) * math.sin(t * math.pi * 2.2))
    copa.keyframe_insert("rotation_euler", frame=f)
    poeira.location = (0.015 * t, -0.01 * t, 0.006 * math.sin(t * math.pi * 1.5))
    poeira.keyframe_insert("location", frame=f)

# ------------------------------------------------------------------ render
r = cena.render
r.engine = "BLENDER_EEVEE"
r.resolution_percentage = ESCALA
r.film_transparent = False
ee = cena.eevee
for attr, val in (("taa_render_samples", AMOSTRAS), ("use_raytracing", True), ("use_shadows", True),
                  ("shadow_ray_count", 3), ("shadow_step_count", 12), ("volumetric_tile_size", "4"),
                  ("volumetric_samples", 96), ("use_volumetric_shadows", True), ("volumetric_end", 6.0),
                  ("fast_gi_resolution", "2"), ("gi_cubemap_resolution", "1024")):
    try:
        setattr(ee, attr, val)
    except Exception as e:
        print("[eevee] ignorado", attr, e)
try:
    ee.ray_tracing_options.resolution_scale = "1"
    ee.ray_tracing_method = "SCREEN"
except Exception as e:
    print("[eevee] rt", e)
vs = cena.view_settings
vs.view_transform = "AgX"
for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
    try:
        vs.look = look; break
    except Exception:
        pass
vs.exposure = float(arg("--exposicao", "-0.6"))
r.image_settings.file_format = "PNG"
r.image_settings.color_depth = "16"
r.image_settings.compression = 30
cena.frame_start, cena.frame_end = INICIO, FIM

# Fotos fixas do consultório para as seções do site (mesma luz do último quadro: refletor aceso, manhã clara).
# blender -b --factory-startup --python cena.py -- --modo fotos [--fotos mesa,eucalipto] [--escala 50]
# nome: (largura, altura, câmera, alvo, foco, lente mm, f/)
FOTOS = {
    "mesa": (1800, 1200, (0.50, -0.32, MESA_Z + 0.11), (-0.12, 0.32, MESA_Z + 0.07), (TX + 0.05, TY, MESA_Z + 0.01), 50, 2.8),
    "janela": (1200, 1500, (0.10, -0.40, MESA_Z + 0.33), (-0.70, 0.82, MESA_Z + 0.33), (-0.85, 0.78, MESA_Z + 0.50), 35, 4.0),
    "eucalipto": (1200, 1500, (0.92, -0.45, MESA_Z + 0.215), (VX - 0.012, VY - 0.009, MESA_Z + 0.215), (VX + 0.018, VY - 0.025, MESA_Z + 0.08), 75, 2.8),
    "linho": (1200, 1500, (-0.08, -0.12, MESA_Z + 0.30), (CX - 0.01, CY + 0.04, MESA_Z + 0.005), (CX + 0.01, CY - 0.04, MESA_Z + 0.04), 60, 2.8),
    "bandeja": (1800, 1200, (TX - 0.031, TY - 0.175, MESA_Z + 0.84), (TX, TY, MESA_Z + 0.005), (TX, TY, MESA_Z + 0.005), 70, 8.0),
}

saida = os.path.join(AQUI, "render", {"final": FORMATO, "fotos": "fotos"}.get(MODO, "teste"))
os.makedirs(saida, exist_ok=True)
if MODO == "fotos":
    # fotos paradas não precisam do clima escuro do vídeo: exposição neutra e contraste base (fundo do site é claro)
    vs.exposure = float(arg("--exposicao", "0.4"))
    for look in ("AgX - Base Contrast", "Base Contrast"):
        try:
            vs.look = look; break
        except Exception:
            pass
    cena.frame_set(N_FRAMES)
    for ob in (cam, alvo, foco):
        ob.animation_data_clear()
    cam_d.animation_data_clear()
    nomes = [n for n in arg("--fotos", ",".join(FOTOS)).split(",") if n]
    for nome in nomes:
        w, h, c, a, fo, lente, fst = FOTOS[nome]
        r.resolution_x, r.resolution_y = w, h
        cam.location, alvo.location, foco.location = Vector(c), Vector(a), Vector(fo)
        cam_d.lens, cam_d.dof.aperture_fstop = lente, fst
        r.filepath = os.path.join(saida, f"{nome}.png")
        bpy.ops.render.render(write_still=True)
        print("[foto]", nome)
elif MODO == "teste":
    cena.frame_set(FRAME)
    r.filepath = os.path.join(saida, f"{FORMATO}_{FRAME:04d}.png")
    bpy.ops.render.render(write_still=True)
else:
    r.filepath = os.path.join(saida, "")
    bpy.ops.render.render(animation=True)
if "--salvar" in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, "cena.blend"))
print("FIM")
