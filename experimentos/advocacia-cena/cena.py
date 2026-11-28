"""Cena do hero de advocacia: mesa de nogueira ao anoitecer, código aberto, caneta-tinteiro,
códigos encadernados e abajur de banqueiro que acende com a rolagem.

Uso (Blender 5.x):
  blender -b --factory-startup --python cena.py -- --modo teste --frame 1
  blender -b --factory-startup --python cena.py -- --modo final --formato paisagem
  blender -b --factory-startup --python cena.py -- --modo final --formato retrato
Saída: ./render/<formato>/####.png
"""
import bpy, math, sys, os, random
from mathutils import Vector, Euler

AQUI = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(AQUI, "tex")

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

random.seed(7)

# ------------------------------------------------------------------ limpeza
bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

# ------------------------------------------------------------------ helpers de material
def mat(nome):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]

def setin(bsdf, nome, valor):
    if nome in bsdf.inputs:
        bsdf.inputs[nome].default_value = valor

def img_node(nodes, arquivo, nao_cor=False):
    n = nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(os.path.join(TEX, arquivo))
    if nao_cor:
        n.image.colorspace_settings.name = "Non-Color"
    return n

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

def bevel(obj, larg, seg=3):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = larg
    mod.segments = seg
    mod.limit_method = "ANGLE"
    return mod

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

# ------------------------------------------------------------------ materiais
# Nogueira: veios com wave distorcido por noise
m_noz, n, l, b = mat("nogueira")
coord = n.new("ShaderNodeTexCoord")
mapn = n.new("ShaderNodeMapping"); mapn.inputs["Scale"].default_value = (0.12, 1.0, 1.0)
l.new(coord.outputs["Object"], mapn.inputs["Vector"])
noise = n.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 3.0; noise.inputs["Detail"].default_value = 8
wave = n.new("ShaderNodeTexWave"); wave.inputs["Scale"].default_value = 5.0; wave.inputs["Distortion"].default_value = 11.0
wave.inputs["Detail"].default_value = 4; wave.inputs["Detail Scale"].default_value = 1.2
wave.bands_direction = "Y"
l.new(mapn.outputs["Vector"], wave.inputs["Vector"])
ramp = n.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.035, 0.017, 0.009, 1)
ramp.color_ramp.elements[1].color = (0.10, 0.048, 0.022, 1)
ramp.color_ramp.elements.new(0.55).color = (0.055, 0.026, 0.012, 1)
l.new(wave.outputs["Fac"], ramp.inputs["Fac"])
mixc = n.new("ShaderNodeMix"); mixc.data_type = "RGBA"; mixc.inputs[0].default_value = 0.08
l.new(ramp.outputs["Color"], mixc.inputs[6]); l.new(noise.outputs["Color"], mixc.inputs[7])
l.new(mixc.outputs[2], b.inputs["Base Color"])
rr = n.new("ShaderNodeMapRange"); rr.inputs[3].default_value = 0.22; rr.inputs[4].default_value = 0.42
l.new(wave.outputs["Fac"], rr.inputs[0]); l.new(rr.outputs[0], b.inputs["Roughness"])
setin(b, "Coat Weight", 0.25)
# verniz com marcas de uso: manchas suaves de rugosidade no coat (dá vida aos reflexos)
mancha = n.new("ShaderNodeTexNoise"); mancha.inputs["Scale"].default_value = 7.0; mancha.inputs["Detail"].default_value = 6
l.new(faixa(n, l, mancha.outputs["Fac"], 0.35, 0.7, 0.05, 0.24), b.inputs["Coat Roughness"])
bump = n.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.08
l.new(wave.outputs["Fac"], bump.inputs["Height"]); l.new(bump.outputs["Normal"], b.inputs["Normal"])

# Latão envelhecido
m_latao, n, l, b = mat("latao")
# latão envelhecido: menos amarelo, pátina escura nas áreas de pouco toque, riscos finos escovados
setin(b, "Metallic", 1.0)
nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18; nz.inputs["Detail"].default_value = 8
patina = faixa(n, l, nz.outputs["Fac"], 0.42, 0.68)
mixl = n.new("ShaderNodeMix"); mixl.data_type = "RGBA"
mixl.inputs[6].default_value = (0.36, 0.24, 0.10, 1); mixl.inputs[7].default_value = (0.66, 0.47, 0.22, 1)
l.new(patina, mixl.inputs[0]); l.new(mixl.outputs[2], b.inputs["Base Color"])
coord_l = n.new("ShaderNodeTexCoord"); esc = n.new("ShaderNodeMapping"); esc.inputs["Scale"].default_value = (1, 1, 900)
l.new(coord_l.outputs["Object"], esc.inputs["Vector"])
risco = n.new("ShaderNodeTexNoise"); risco.inputs["Scale"].default_value = 3; risco.inputs["Detail"].default_value = 4
l.new(esc.outputs["Vector"], risco.inputs["Vector"])
rug = mth(n, l, "ADD", faixa(n, l, risco.outputs["Fac"], 0.3, 0.7, 0.12, 0.26), faixa(n, l, patina, 0, 1, 0.14, 0.0))
l.new(rug, b.inputs["Roughness"])

m_ouro, n, l, b = mat("ouro")
setin(b, "Base Color", (0.95, 0.72, 0.36, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.18)

m_rodio, n, l, b = mat("rodio")
setin(b, "Base Color", (0.86, 0.87, 0.89, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.1)

m_ebonite, n, l, b = mat("ebonite")
setin(b, "Base Color", (0.008, 0.008, 0.009, 1)); setin(b, "Roughness", 0.32)

# Pena da caneta: ouro 18k com ponta em ródio (bicolor), arabescos gravados, fenda e furo de respiro.
# UV da malha da pena: U = comprimento (0 na base, ~2,4 na ponta), V = arco a partir do centro (unidades de 1 cm).
m_pena, n, l, b = mat("pena")
uvn = n.new("ShaderNodeUVMap"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(uvn.outputs["UV"], sep.inputs[0])
U, V = sep.outputs[0], sep.outputs[1]
absV = mth(n, l, "ABSOLUTE", V)
borda = mth(n, l, "MULTIPLY_ADD", mth(n, l, "MULTIPLY", V, V), 1.6, 1.25)
prata = faixa(n, l, mth(n, l, "SUBTRACT", U, borda), -0.008, 0.008)
arab = n.new("ShaderNodeTexWave"); arab.wave_type = "RINGS"; arab.inputs["Scale"].default_value = 7.5
arab.inputs["Distortion"].default_value = 5.0; arab.inputs["Detail"].default_value = 2
cmb = n.new("ShaderNodeCombineXYZ"); l.new(U, cmb.inputs[0]); l.new(V, cmb.inputs[1]); l.new(cmb.outputs[0], arab.inputs["Vector"])
linhas = mth(n, l, "MULTIPLY", faixa(n, l, arab.outputs["Fac"], 0.86, 0.93),
             mth(n, l, "MULTIPLY", faixa(n, l, U, 0.12, 0.2), faixa(n, l, U, 1.12, 1.04)))
fenda = mth(n, l, "MULTIPLY", faixa(n, l, absV, 0.008, 0.004), faixa(n, l, U, 1.0, 1.03))
dist = mth(n, l, "SQRT", mth(n, l, "ADD", mth(n, l, "POWER", mth(n, l, "SUBTRACT", U, 1.0), 2.0), mth(n, l, "MULTIPLY", V, V)))
furo = faixa(n, l, dist, 0.045, 0.035)
cav = mth(n, l, "MAXIMUM", fenda, furo)
c1 = n.new("ShaderNodeMix"); c1.data_type = "RGBA"
c1.inputs[6].default_value = (0.93, 0.70, 0.34, 1); c1.inputs[7].default_value = (0.84, 0.85, 0.87, 1)
l.new(prata, c1.inputs[0])
c2 = n.new("ShaderNodeMix"); c2.data_type = "RGBA"; c2.inputs[7].default_value = (0.38, 0.27, 0.12, 1)
l.new(linhas, c2.inputs[0]); l.new(c1.outputs[2], c2.inputs[6])
c3 = n.new("ShaderNodeMix"); c3.data_type = "RGBA"; c3.inputs[7].default_value = (0.005, 0.005, 0.005, 1)
l.new(cav, c3.inputs[0]); l.new(c2.outputs[2], c3.inputs[6]); l.new(c3.outputs[2], b.inputs["Base Color"])
l.new(mth(n, l, "SUBTRACT", 1.0, cav), b.inputs["Metallic"])
l.new(mth(n, l, "ADD", mth(n, l, "MULTIPLY_ADD", cav, 0.5, 0.11), mth(n, l, "MULTIPLY", linhas, 0.12)), b.inputs["Roughness"])
bpn = n.new("ShaderNodeBump"); bpn.inputs["Strength"].default_value = 0.35
l.new(mth(n, l, "SUBTRACT", mth(n, l, "MULTIPLY", linhas, 0.4), cav), bpn.inputs["Height"]); l.new(bpn.outputs["Normal"], b.inputs["Normal"])

# Laca preta da caneta
m_laca, n, l, b = mat("laca")
setin(b, "Base Color", (0.012, 0.012, 0.014, 1)); setin(b, "Roughness", 0.12)
setin(b, "Coat Weight", 1.0); setin(b, "Coat Roughness", 0.07)

# Páginas (textura impressa) e miolo (borda das folhas)
def m_pagina(nome, arq):
    m, n, l, b = mat(nome)
    t = img_node(n, arq)
    l.new(t.outputs["Color"], b.inputs["Base Color"])
    setin(b, "Roughness", 0.62)
    setin(b, "Subsurface Weight", 0.08)
    fibra = n.new("ShaderNodeTexNoise"); fibra.inputs["Scale"].default_value = 900; fibra.inputs["Detail"].default_value = 3
    bp = n.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.04
    l.new(fibra.outputs["Fac"], bp.inputs["Height"]); l.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m
m_pag_esq = m_pagina("pag_esq", "pagina_esq.jpg")
m_pag_dir = m_pagina("pag_dir", "pagina_dir.jpg")
m_timbrado = m_pagina("timbrado", "timbrado.jpg")

m_miolo, n, l, b = mat("miolo")
w2 = n.new("ShaderNodeTexWave"); w2.inputs["Scale"].default_value = 260; w2.bands_direction = "Z"
w2.inputs["Distortion"].default_value = 0.4
r2 = n.new("ShaderNodeValToRGB")
r2.color_ramp.elements[0].color = (0.55, 0.5, 0.42, 1); r2.color_ramp.elements[1].color = (0.86, 0.82, 0.72, 1)
l.new(w2.outputs["Fac"], r2.inputs["Fac"]); l.new(r2.outputs["Color"], b.inputs["Base Color"])
setin(b, "Roughness", 0.7)

def m_couro(nome, cor):
    m, n, l, b = mat(nome)
    setin(b, "Base Color", cor)
    nz = n.new("ShaderNodeTexVoronoi"); nz.inputs["Scale"].default_value = 420
    bp = n.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.12
    l.new(nz.outputs["Distance"], bp.inputs["Height"]); l.new(bp.outputs["Normal"], b.inputs["Normal"])
    setin(b, "Roughness", 0.48); setin(b, "Coat Weight", 0.2); setin(b, "Coat Roughness", 0.25)
    return m

def m_lombada(nome):
    """Couro da textura + dourado pela máscara."""
    m, n, l, b = mat(nome)
    t = img_node(n, nome + ".jpg")
    mk = img_node(n, nome + "_ouro.png", nao_cor=True)
    mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[7].default_value = (0.92, 0.68, 0.32, 1)
    l.new(mk.outputs["Color"], mix.inputs[0]); l.new(t.outputs["Color"], mix.inputs[6]); l.new(mix.outputs[2], b.inputs["Base Color"])
    l.new(mk.outputs["Color"], b.inputs["Metallic"])
    rmap = n.new("ShaderNodeMapRange"); rmap.inputs[3].default_value = 0.5; rmap.inputs[4].default_value = 0.22
    l.new(mk.outputs["Color"], rmap.inputs[0]); l.new(rmap.outputs[0], b.inputs["Roughness"])
    return m

# Vidro verde do abajur (cased glass: verde por fora, opalino por dentro)
m_vidro, n, l, b = mat("vidro_verde")
setin(b, "Base Color", (0.005, 0.06, 0.022, 1)); setin(b, "Roughness", 0.08)
setin(b, "Coat Weight", 1.0); setin(b, "Coat Roughness", 0.05)
setin(b, "Emission Color", (0.04, 0.42, 0.14, 1))
# aceso, o vidro verde brilha por transmissão: mais forte perto da borda de baixo (onde a luz sai)
# e mais fraco nas silhuetas (caminho mais longo dentro do vidro)
brilho = n.new("ShaderNodeValue"); brilho.outputs[0].default_value = 0.0
geo = n.new("ShaderNodeNewGeometry"); gz = n.new("ShaderNodeSeparateXYZ"); l.new(geo.outputs["Position"], gz.inputs[0])
lw = n.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.35
perto_borda = faixa(n, l, gz.outputs[2], 0.75 + 0.405, 0.75 + 0.335, 0.25, 1.0)
miolo_vidro = mth(n, l, "MULTIPLY_ADD", lw.outputs["Facing"], -0.6, 1.0)
l.new(mth(n, l, "MULTIPLY", brilho.outputs[0], mth(n, l, "MULTIPLY", perto_borda, miolo_vidro)), b.inputs["Emission Strength"])
EMI_VIDRO = brilho.outputs[0]

m_opal, n, l, b = mat("opalino")
setin(b, "Base Color", (0.95, 0.92, 0.85, 1)); setin(b, "Roughness", 0.4)
setin(b, "Emission Color", (1.0, 0.72, 0.42, 1)); setin(b, "Emission Strength", 0.0)
EMI_OPAL = b.inputs["Emission Strength"]

m_lamp, n, l, b = mat("lampada")
setin(b, "Base Color", (1, 0.85, 0.6, 1))
setin(b, "Emission Color", (1.0, 0.66, 0.34, 1)); setin(b, "Emission Strength", 0.0)
EMI_LAMP = b.inputs["Emission Strength"]

m_parede, n, l, b = mat("parede")
setin(b, "Base Color", (0.03, 0.028, 0.026, 1)); setin(b, "Roughness", 0.8)

m_feltro, n, l, b = mat("feltro")  # mata-borrão de couro verde-escuro
setin(b, "Base Color", (0.012, 0.026, 0.02, 1)); setin(b, "Roughness", 0.78)
vz = n.new("ShaderNodeTexNoise"); vz.inputs["Scale"].default_value = 300
bp = n.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.05
l.new(vz.outputs["Fac"], bp.inputs["Height"]); l.new(bp.outputs["Normal"], b.inputs["Normal"])

m_persiana, n, l, b = mat("persiana")
setin(b, "Base Color", (0.1, 0.1, 0.1, 1))

# ------------------------------------------------------------------ mesa
MESA_Z = 0.75
# tampo fundo (borda da frente em y=-0.75) para a câmera final nunca ver embaixo da mesa
tampo = cubo("tampo", (2.4, 1.6, 0.05), (0.1, 0.05, MESA_Z - 0.025))
bevel(tampo, 0.006); atribuir(tampo, m_noz)

pad = None and cubo("mata_borrao", (0.62, 0.44, 0.004), (0.02, -0.02, MESA_Z + 0.002))

# ------------------------------------------------------------------ livro aberto (código)
def bloco_paginas(nome, largura, prof, alt_borda, alt_crista, esquerda):
    """Bloco de folhas com o topo curvo (sobe da lombada, crista e cai na borda)."""
    N = 48
    verts, faces, uvs_top = [], [], []
    def ztop(t):  # t: 0 lombada -> 1 borda
        return alt_borda + (alt_crista - alt_borda) * math.sin(math.pi * min(1, t * 1.15)) ** 0.7 * (1 - 0.25 * t) - 0.004 * (1 - t) ** 6
    for i in range(N + 1):
        t = i / N
        x = (-t if esquerda else t) * largura
        zt = ztop(t)
        for y in (-prof / 2, prof / 2):
            verts.append((x, y, zt))     # topo
            verts.append((x, y, 0.0))    # base
    # índices: (i, y_idx, top/bottom) -> i*4 + y*2 + tb
    idx = lambda i, y, tb: i * 4 + y * 2 + tb
    for i in range(N):
        faces.append((idx(i, 0, 0), idx(i + 1, 0, 0), idx(i + 1, 1, 0), idx(i, 1, 0)))  # topo
        faces.append((idx(i, 0, 1), idx(i, 1, 1), idx(i + 1, 1, 1), idx(i + 1, 0, 1)))  # base
        faces.append((idx(i, 0, 0), idx(i, 0, 1), idx(i + 1, 0, 1), idx(i + 1, 0, 0)))  # frente
        faces.append((idx(i, 1, 0), idx(i + 1, 1, 0), idx(i + 1, 1, 1), idx(i, 1, 1)))  # fundo
    faces.append((idx(N, 0, 0), idx(N, 0, 1), idx(N, 1, 1), idx(N, 1, 0)))  # borda
    faces.append((idx(0, 0, 0), idx(0, 1, 0), idx(0, 1, 1), idx(0, 0, 1)))  # lombada
    if esquerda:
        faces = [tuple(reversed(f)) for f in faces]
    me = bpy.data.meshes.new(nome)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(nome, me)
    bpy.context.collection.objects.link(o)
    # UV: topo mapeado na página, laterais no miolo
    uv = me.uv_layers.new(name="UV")
    for poly in me.polygons:
        topo = poly.index % 4 == 0 and poly.index < N * 4
        if topo:
            o.data.polygons[poly.index].material_index = 0
        else:
            o.data.polygons[poly.index].material_index = 1
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            u = abs(v.x) / largura
            if esquerda:
                u = 1 - u
            uv.data[li].uv = (u, (v.y + prof / 2) / prof)
    for p in me.polygons:
        p.use_smooth = True
    return o

LIV_X, LIV_Y, LIV_Z = 0.04, 0.0, MESA_Z + 0.004
PW, PD = 0.165, 0.235
capa_m = m_couro("capa_livro", (0.07, 0.012, 0.012, 1))
capa = cubo("capa", (PW * 2 + 0.03, PD + 0.016, 0.006), (LIV_X, LIV_Y, LIV_Z + 0.003))
bevel(capa, 0.002, 2); atribuir(capa, capa_m)
for esq, mpag in ((True, m_pag_esq), (False, m_pag_dir)):
    bp_ = bloco_paginas("paginas_" + ("esq" if esq else "dir"), PW, PD, 0.012, 0.024, esq)
    bp_.location = (LIV_X + (-0.002 if esq else 0.002), LIV_Y, LIV_Z + 0.006)
    bp_.data.materials.append(mpag); bp_.data.materials.append(m_miolo)
    bp_.rotation_euler = (0, 0, math.radians(0.6 if esq else -0.6))
livro_rot = math.radians(-8)
for nome in ("capa", "paginas_esq", "paginas_dir"):
    o = bpy.data.objects[nome]
    # gira o conjunto em torno do centro do livro
    off = Vector(o.location) - Vector((LIV_X, LIV_Y, 0))
    off.rotate(Euler((0, 0, livro_rot)))
    o.location = Vector((LIV_X, LIV_Y, 0)) + off
    o.rotation_euler.z += livro_rot

# fita marcadora
fita_m = m_couro("fita", (0.25, 0.02, 0.02, 1))
fita = cubo("fita", (0.006, 0.09, 0.0006), (LIV_X + 0.004, LIV_Y - 0.15, MESA_Z + 0.01), (0, 0, livro_rot + 0.15))
atribuir(fita, fita_m)

# ------------------------------------------------------------------ caneta-tinteiro (sobre a página direita)
caneta = bpy.data.objects.new("caneta", None)
bpy.context.collection.objects.link(caneta)
partes = []
corpo = cilindro("corpo", 0.0068, 0.105, (0, 0, 0), (0, math.radians(90), 0)); atribuir(corpo, m_laca); partes.append(corpo)
anel = cilindro("anel", 0.0071, 0.004, (0.03, 0, 0), (0, math.radians(90), 0)); atribuir(anel, m_ouro); partes.append(anel)
anel2 = cilindro("anel2", 0.0071, 0.0025, (-0.045, 0, 0), (0, math.radians(90), 0)); atribuir(anel2, m_ouro); partes.append(anel2)
bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.0068, radius2=0.0045, depth=0.016, location=(-0.0605, 0, 0), rotation=(0, math.radians(-90), 0))
sec = bpy.context.active_object; atribuir(sec, m_laca); partes.append(sec)
def construir_pena():
    """Casca curva de pena-tinteiro: ombros largos, afina até a ponta e desce até tocar o papel."""
    L, X0 = 0.024, -0.066
    NS, NP = 72, 28
    verts, uvs, faces = [], [], []
    for i in range(NS + 1):
        s = i / NS
        hw = 0.0042 * max(0.0, 1 - s ** 1.8) ** 0.9 + 0.00022
        R = max(hw * 1.3, 0.0004)
        th = math.asin(min(1.0, hw / R))
        ztop = 0.0043 + (-0.00135 - 0.0043) * (s ** 1.25)
        zc = ztop - R
        for j in range(NP + 1):
            ph = -th + 2 * th * j / NP
            verts.append((X0 - s * L, R * math.sin(ph), zc + R * math.cos(ph)))
            uvs.append((s * L / 0.01, R * ph / 0.01))
    for i in range(NS):
        for j in range(NP):
            a = i * (NP + 1) + j
            faces.append((a, a + 1, a + NP + 2, a + NP + 1))
    me = bpy.data.meshes.new("pena"); me.from_pydata(verts, [], faces); me.update()
    uv = me.uv_layers.new(name="UV")
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    o = bpy.data.objects.new("pena", me); bpy.context.collection.objects.link(o)
    so = o.modifiers.new("esp", "SOLIDIFY"); so.thickness = 0.00028; so.offset = -1
    atribuir(o, m_pena)
    return o, Vector((X0 - L, 0, -0.00135))
pena, PONTA_LOCAL = construir_pena(); partes.append(pena)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.00042, location=PONTA_LOCAL + Vector((0.0003, 0, -0.00022)))
irid = bpy.context.active_object; atribuir(irid, m_rodio); partes.append(irid)
# alimentador de ebonite sob a pena
alim = cilindro("alimentador", 0.0031, 0.017, (-0.0705, 0, -0.0017), (0, math.radians(90), 0), 32)
alim.scale = (0.62, 1, 1); atribuir(alim, m_ebonite); partes.append(alim)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0068, location=(0.0525, 0, 0)); fim = bpy.context.active_object
fim.scale = (0.5, 1, 1); atribuir(fim, m_laca); partes.append(fim)
clip = cubo("clip", (0.04, 0.0018, 0.0012), (0.035, 0, 0.0075)); atribuir(clip, m_ouro); partes.append(clip)
for p in partes:
    if p is not pena:
        suave(p, 50)
    p.parent = caneta
# pena apontando o "Art. 5º" da página esquerda
_T = Vector((-0.112, 0.058, 0)); _T.rotate(Euler((0, 0, livro_rot)))
PENA_ALVO = Vector((LIV_X, LIV_Y, MESA_Z + 0.032)) + _T
caneta.rotation_euler = (math.radians(2), math.radians(-5), math.radians(-27))
_n = Vector((-0.08, 0, -0.002)); _n.rotate(caneta.rotation_euler)
caneta.location = PENA_ALVO - _n + Vector((0, 0, 0.004))

# ------------------------------------------------------------------ papel timbrado + códigos empilhados
folha = None and cubo("folha", (0.21, 0.297, 0.0004), (-0.36, -0.06, MESA_Z + 0.0045), (0, 0, math.radians(12)))

def livro_fechado(nome_tex, larg, alt, prof, loc, rotz):
    """Livro fechado deitado: lombada voltada para a câmera (-Y)."""
    capa_l = cubo("capa_" + nome_tex, (prof, alt, larg), loc, (0, 0, rotz))
    bevel(capa_l, 0.003, 3)
    m_l = m_lombada(nome_tex)
    capa_l.data.materials.append(m_l)
    # UV da lombada: projeta simples na face frontal
    me = capa_l.data
    uv = me.uv_layers[0]
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((v.z / larg) + 0.5, (v.x / prof) + 0.5)
    miolo = cubo("miolo_" + nome_tex, (prof - 0.012, alt - 0.006, larg - 0.008), (loc[0], loc[1] + 0.004, loc[2]), (0, 0, rotz))
    atribuir(miolo, m_miolo)
    return capa_l

# pilha atrás, à direita, perto do abajur
pz = MESA_Z
for i, (tx, larg, prof, alt, dx, rz) in enumerate([
    ("lombada_civil", 0.055, 0.25, 0.18, 0.0, 4),
    ("lombada_cpc", 0.048, 0.24, 0.175, 0.01, -3),
    ("lombada_penal", 0.042, 0.235, 0.17, -0.006, 7),
]):
    livro_fechado(tx, larg, alt, prof, (0.42 + dx, 0.3, pz + larg / 2), math.radians(rz))
    pz += larg
# códigos em pé no fundo, encostados
def livro_em_pe(tex, esp, alt, prof, x, y, incl=0):
    o = cubo("pe_" + tex, (esp, prof, alt), (x, y, MESA_Z + alt / 2), (0, math.radians(incl), 0))
    bevel(o, 0.003, 3)
    o.data.materials.append(m_lombada(tex))
    me = o.data; uv = me.uv_layers[0]
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / esp + 0.5, v.z / alt + 0.5)
    return o
xx = 0.58
for tx, esp, alt in [("lombada_cf", 0.05, 0.25), ("lombada_civil", 0.062, 0.26), ("lombada_cpc", 0.054, 0.255), ("lombada_penal", 0.046, 0.245), ("lombada_civil", 0.058, 0.26)]:
    livro_em_pe(tx, esp, alt, 0.18, xx, 0.62)
    xx += esp + 0.002

# ------------------------------------------------------------------ abajur de banqueiro
AB_X, AB_Y = 0.36, 0.08
base_ab = cilindro("ab_base", 0.075, 0.022, (AB_X, AB_Y, MESA_Z + 0.011)); bevel(base_ab, 0.006, 4); atribuir(base_ab, m_latao)
base2 = cilindro("ab_base2", 0.05, 0.02, (AB_X, AB_Y, MESA_Z + 0.03)); bevel(base2, 0.008, 4); atribuir(base2, m_latao)
haste = cilindro("ab_haste", 0.008, 0.32, (AB_X, AB_Y, MESA_Z + 0.2)); atribuir(haste, m_latao)
braco = cilindro("ab_braco", 0.006, 0.17, (AB_X, AB_Y, MESA_Z + 0.355), (0, math.radians(90), math.radians(-25))); atribuir(braco, m_latao)
# cúpula: meio-cilindro com espessura
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.076, depth=0.28, location=(AB_X, AB_Y - 0.04, MESA_Z + 0.33),
                                    rotation=(0, math.radians(90), math.radians(-25)))
cup = bpy.context.active_object; cup.name = "cupula"
bpy.ops.object.mode_set(mode="EDIT")
import bmesh
bm = bmesh.from_edit_mesh(cup.data)
for v in bm.verts:
    pass
# remove a metade de baixo (no espaço local, z<0 depois da rotação = coordenada local x do cilindro deitado)
loc_corte = [v for v in bm.verts if v.co.x > 0.01]
bmesh.ops.delete(bm, geom=loc_corte, context="VERTS")
bmesh.update_edit_mesh(cup.data)
bpy.ops.object.mode_set(mode="OBJECT")
sol = cup.modifiers.new("esp", "SOLIDIFY"); sol.thickness = 0.004; sol.material_offset = 1; sol.use_flip_normals = False
cup.data.materials.append(m_vidro); cup.data.materials.append(m_opal)
suave(cup, 60)
# tampas de latão nas pontas da cúpula (meio-disco), anéis na haste e corrente de puxar
EIXO = Vector((math.cos(math.radians(-25)), math.sin(math.radians(-25)), 0))
CUP_C = Vector((AB_X, AB_Y - 0.04, MESA_Z + 0.33))
for sgn in (-1, 1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.0805, depth=0.005, location=CUP_C + EIXO * (0.1425 * sgn),
                                        rotation=(0, math.radians(90), math.radians(-25)))
    tp = bpy.context.active_object; tp.name = "tampa_cupula"
    bm2 = bmesh.new(); bm2.from_mesh(tp.data)
    bmesh.ops.bisect_plane(bm2, geom=bm2.verts[:] + bm2.edges[:] + bm2.faces[:], plane_co=(0.004, 0, 0), plane_no=(1, 0, 0), clear_outer=True)
    bm2.to_mesh(tp.data); bm2.free()
    bevel(tp, 0.0012, 2); atribuir(tp, m_latao); suave(tp, 35)
for zz in (0.07, 0.215):
    anel_h = cilindro("anel_haste", 0.0115, 0.006, (AB_X, AB_Y, MESA_Z + zz)); bevel(anel_h, 0.002, 3); atribuir(anel_h, m_latao); suave(anel_h, 40)
P0 = CUP_C + EIXO * 0.075 + Vector((0, -0.032, -0.006))
for i in range(26):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.0015, location=P0 - Vector((0, 0, i * 0.0034)))
    conta = bpy.context.active_object; atribuir(conta, m_latao); suave(conta, 80)
puxador = cilindro("puxador", 0.0032, 0.014, P0 - Vector((0, 0, 26 * 0.0034 + 0.006)), verts=32)
bevel(puxador, 0.0012, 3); atribuir(puxador, m_latao); suave(puxador, 40)
# lâmpada
lamp_esf = None
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.014, location=(AB_X, AB_Y - 0.04, MESA_Z + 0.338))
lamp_esf = bpy.context.active_object; atribuir(lamp_esf, m_lamp)

# luz do abajur (área sob a cúpula, apontando para baixo)
luz_ab_d = bpy.data.lights.new("luz_abajur", "AREA")
luz_ab_d.shape = "RECTANGLE"; luz_ab_d.size = 0.26; luz_ab_d.size_y = 0.08
luz_ab_d.color = (1.0, 0.66, 0.36); luz_ab_d.energy = 0
luz_ab = bpy.data.objects.new("luz_abajur", luz_ab_d); bpy.context.collection.objects.link(luz_ab)
luz_ab.location = (AB_X, AB_Y - 0.04, MESA_Z + 0.318); luz_ab.rotation_euler = (0, 0, math.radians(-25))
try:
    luz_ab_d.use_soft_falloff = True
except Exception:
    pass
# luz de preenchimento quente (simula o rebatido no tampo)
pt_d = bpy.data.lights.new("rebatido", "POINT"); pt_d.energy = 0; pt_d.color = (1.0, 0.6, 0.32); pt_d.shadow_soft_size = 0.15
pt = bpy.data.objects.new("rebatido", pt_d); bpy.context.collection.objects.link(pt)
pt.location = (AB_X - 0.05, AB_Y - 0.1, MESA_Z + 0.2)

# ------------------------------------------------------------------ fundo: parede e estante desfocada
parede = cubo("parede", (6, 0.05, 4), (0, 1.9, 1.5)); atribuir(parede, m_parede)
cores_couro = [(0.09, 0.015, 0.015), (0.02, 0.05, 0.035), (0.02, 0.025, 0.06), (0.08, 0.045, 0.02), (0.04, 0.03, 0.025)]
couros = [m_couro(f"couro_{i}", c + (1,)) for i, c in enumerate(cores_couro)]
for prat_z in (0.55, 0.95, 1.35, 1.75):
    tab = cubo("prat", (3.2, 0.32, 0.03), (0.2, 1.72, prat_z - 0.015)); atribuir(tab, m_noz)
    x = -1.4
    while x < 1.8:
        w = random.uniform(0.03, 0.065); hh = random.uniform(0.24, 0.33)
        lv = cubo("lv", (w, 0.22, hh), (x + w / 2, 1.68, prat_z + hh / 2), (0, random.uniform(-0.03, 0.03), 0))
        atribuir(lv, random.choice(couros))
        # faixa dourada na lombada (gera brilho/bokeh)
        if random.random() < 0.7:
            fx = cubo("fx", (w * 0.8, 0.002, 0.006), (x + w / 2, 1.569, prat_z + hh * random.uniform(0.7, 0.85)))
            atribuir(fx, m_ouro)
        x += w + random.uniform(0.0, 0.006)
# abajur de piso quente ao fundo (bokeh)
bk_d = bpy.data.lights.new("fundo_quente", "POINT"); bk_d.energy = 6; bk_d.color = (1.0, 0.62, 0.3); bk_d.shadow_soft_size = 0.05
bk = bpy.data.objects.new("fundo_quente", bk_d); bpy.context.collection.objects.link(bk); bk.location = (1.3, 1.45, 1.25)

# ------------------------------------------------------------------ janela: luz fria do anoitecer pela persiana (à esquerda)
para_sol = Vector((-0.85, -0.25, 0.42)).normalized()
sol_d = bpy.data.lights.new("janela", "SUN"); sol_d.color = (0.56, 0.7, 1.0); sol_d.energy = 4.0; sol_d.angle = math.radians(0.8)
sol = bpy.data.objects.new("janela", sol_d); bpy.context.collection.objects.link(sol)
sol.rotation_euler = para_sol.to_track_quat("Z", "Y").to_euler()
centro_p = Vector((0.05, 0.05, MESA_Z + 0.05)) + para_sol * 1.3
for i in range(40):
    lam = cubo("lamina", (0.045, 2.0, 0.0015), (0, 0, 0))
    lam.location = centro_p + Vector((0, 0, (i - 20) * 0.042))
    lam.rotation_euler = (0, math.radians(-28), math.atan2(para_sol.y, para_sol.x))
    lam.visible_camera = False
    atribuir(lam, m_persiana)
sol_d.specular_factor = 0.35  # o sol pontual deixava um ponto branco duro no vidro
bk_d.specular_factor = 0.5
# softbox da janela: quase só reflexo (laca, vidro, latão e verniz ganham reflexos longos e realistas)
# maior e mais alta: reflexo macio (sem "adesivo" branco no vidro) e fora do primeiro plano da mesa
sb_d = bpy.data.lights.new("janela_reflexo", "AREA"); sb_d.shape = "RECTANGLE"; sb_d.size = 1.6; sb_d.size_y = 1.1
sb_d.color = (0.62, 0.74, 1.0); sb_d.energy = 30
sb_d.diffuse_factor = 0.12; sb_d.specular_factor = 1.0; sb_d.volume_factor = 0.0; sb_d.use_shadow = False
sb = bpy.data.objects.new("janela_reflexo", sb_d); bpy.context.collection.objects.link(sb)
alvo_sb = Vector((0.05, 0.05, MESA_Z + 0.05))
sb.location = alvo_sb + para_sol * 1.6 + Vector((0, 0, 0.6))
sb.rotation_euler = (alvo_sb - sb.location).normalized().to_track_quat("-Z", "Y").to_euler()

# tinteiro de vidro lapidado com tampa de latão, ao fundo à esquerda (reflexos viram bokeh no macro)
m_cristal = bpy.data.materials.new("cristal"); m_cristal.use_nodes = True
bc = m_cristal.node_tree.nodes["Principled BSDF"]
setin(bc, "Base Color", (0.92, 0.96, 0.95, 1)); setin(bc, "Roughness", 0.02); setin(bc, "IOR", 1.5)
setin(bc, "Transmission Weight", 1.0)
for attr, val in (("use_raytrace_refraction", True), ("surface_render_method", "DITHERED"), ("thickness_mode", "SLAB")):
    try:
        setattr(m_cristal, attr, val)
    except Exception as e:
        print("[cristal] ignorado", attr, e)
m_tinta, n, l, b = mat("tinta")
setin(b, "Base Color", (0.004, 0.006, 0.02, 1)); setin(b, "Roughness", 0.05)
TI_X, TI_Y, TI_R = -0.21, 0.43, math.radians(18)
pote = cubo("tinteiro", (0.066, 0.066, 0.052), (TI_X, TI_Y, MESA_Z + 0.026), (0, 0, TI_R)); bevel(pote, 0.007, 4); atribuir(pote, m_cristal); suave(pote, 30)
tinta = cubo("tinta", (0.052, 0.052, 0.03), (TI_X, TI_Y, MESA_Z + 0.019), (0, 0, TI_R)); bevel(tinta, 0.004, 2); atribuir(tinta, m_tinta)
gargalo = cilindro("gargalo", 0.015, 0.012, (TI_X, TI_Y, MESA_Z + 0.056)); atribuir(gargalo, m_cristal)
tampa_t = cilindro("tampa_tinteiro", 0.0185, 0.017, (TI_X, TI_Y, MESA_Z + 0.068)); bevel(tampa_t, 0.003, 3); atribuir(tampa_t, m_latao); suave(tampa_t, 40)

# poeira em suspensão: só aparece onde a luz pega (feixe da janela e cone do abajur)
m_po, n, l, b = mat("poeira")
setin(b, "Base Color", (0.85, 0.82, 0.76, 1)); setin(b, "Roughness", 0.9)
poeira = bpy.data.objects.new("poeira", None); bpy.context.collection.objects.link(poeira)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.00045, location=(0, 0, 0))
grao = bpy.context.active_object; atribuir(grao, m_po)
rp = random.Random(11)
for i in range(150):
    g = grao if i == 0 else grao.copy()
    if i:
        bpy.context.collection.objects.link(g)
    g.location = (rp.uniform(-0.45, 0.55), rp.uniform(0.1, 0.7), MESA_Z + rp.uniform(0.03, 0.5))
    g.scale = (s := rp.uniform(0.6, 1.4), s, s)
    g.parent = poeira

# céu: preenchimento azul muito baixo
mundo = bpy.data.worlds.new("mundo"); cena.world = mundo; mundo.use_nodes = True
bg = mundo.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (0.012, 0.016, 0.028, 1); bg.inputs["Strength"].default_value = 1.0

# volume (névoa leve para os feixes)
vol = cubo("nevoa", (5, 5, 3.5), (0, 0.5, 1.4))
m_vol = bpy.data.materials.new("nevoa"); m_vol.use_nodes = True
nt = m_vol.node_tree; nt.nodes.remove(nt.nodes["Principled BSDF"])
pv = nt.nodes.new("ShaderNodeVolumePrincipled"); pv.inputs["Density"].default_value = 0.035
pv.inputs["Anisotropy"].default_value = 0.45 if "Anisotropy" in pv.inputs else 0
nt.links.new(pv.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
atribuir(vol, m_vol)
vol.visible_shadow = False

# ------------------------------------------------------------------ câmera
cam_d = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_d); bpy.context.collection.objects.link(cam); cena.camera = cam
cam_d.dof.use_dof = True
cam_d.sensor_width = 36
alvo = bpy.data.objects.new("alvo", None); bpy.context.collection.objects.link(alvo)
tc = cam.constraints.new("TRACK_TO"); tc.target = alvo; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
foco = bpy.data.objects.new("foco", None); bpy.context.collection.objects.link(foco)
cam_d.dof.focus_object = foco

def ease(t):  # suave nas pontas (cinematográfico)
    return t * t * (3 - 2 * t) if t < 1 else 1.0
def ease_io(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0, min(1, t)))
def lerp(a, b, t):
    return a + (b - a) * t
def lerpv(a, b, t):
    return Vector(a).lerp(Vector(b), t)

PENA_PONTA = PENA_ALVO.copy()

if FORMATO == "retrato":
    # 1440x2560: nativo em celular de DPR 3 (a versão 1080x1920 sai desta por redução)
    cena.render.resolution_x, cena.render.resolution_y = 1440, 2560
    # retrato: assunto na metade de baixo, céu escuro em cima para o texto
    C0, A0, L0, F0 = PENA_ALVO + Vector((-0.02, -0.21, 0.14)), PENA_ALVO + Vector((0.0, 0.03, 0.0)), 48, 2.0
    # final mais afastado e centrado em x≈0,25: cúpula inteira dentro do quadro mesmo com o corte lateral
    # do object-fit: cover em celulares 19,5:9 (página direita, caneta e abajur visíveis)
    C1, A1, L1, F1 = (0.22, -1.3, MESA_Z + 0.55), (0.25, 0.12, MESA_Z + 0.18), 34, 2.4
else:
    cena.render.resolution_x, cena.render.resolution_y = 1920, 1080
    # paisagem: começa no macro da pena sobre o art. 5º; termina com o assunto no terço direito
    C0, A0, L0, F0 = PENA_ALVO + Vector((-0.015, -0.2, 0.1)), PENA_ALVO + Vector((-0.01, 0.015, 0.0)), 65, 2.0
    C1, A1, L1, F1 = (-0.24, -1.02, MESA_Z + 0.53), (0.06, 0.15, MESA_Z + 0.2), 36, 2.4

for f in range(1, N_FRAMES + 1):
    t = (f - 1) / (N_FRAMES - 1)
    tc_ = ease_io(t)
    cam.location = lerpv(C0, C1, tc_) + Vector((0, 0, 0.012 * math.sin(t * math.pi)))
    alvo.location = lerpv(A0, A1, tc_)
    cam_d.lens = lerp(L0, L1, tc_)
    cam_d.dof.aperture_fstop = lerp(F0, F1, tc_)
    # foco: da pena para o livro/abajur
    foco.location = lerpv(PENA_PONTA, (LIV_X + 0.12, LIV_Y + 0.06, MESA_Z + 0.06), ease_io(t * 1.1))
    cam.keyframe_insert("location", frame=f); alvo.keyframe_insert("location", frame=f)
    foco.keyframe_insert("location", frame=f)
    cam_d.keyframe_insert("lens", frame=f); cam_d.dof.keyframe_insert("aperture_fstop", frame=f)
    # abajur acende entre 18% e 60% (como incandescente esquentando); antes acendia tarde e o meio ficava escuro
    k = ease_io((t - 0.18) / 0.42)
    poeira.location = (0.018 * t, -0.012 * t, 0.006 * math.sin(t * math.pi * 1.5))
    poeira.keyframe_insert("location", frame=f)
    luz_ab_d.energy = 12 * k; luz_ab_d.keyframe_insert("energy", frame=f)
    pt_d.energy = 1.6 * k; pt_d.keyframe_insert("energy", frame=f)
    EMI_LAMP.default_value = 25 * k; EMI_LAMP.keyframe_insert("default_value", frame=f)
    EMI_OPAL.default_value = 1.6 * k; EMI_OPAL.keyframe_insert("default_value", frame=f)
    EMI_VIDRO.default_value = 0.35 * k; EMI_VIDRO.keyframe_insert("default_value", frame=f)
    # o anoitecer avança: a janela esfria e cai
    sol_d.energy = lerp(3.0, 2.2, ease_io(t)); sol_d.keyframe_insert("energy", frame=f)
    sb_d.energy = lerp(30, 20, ease_io(t)); sb_d.keyframe_insert("energy", frame=f)

# ------------------------------------------------------------------ render
r = cena.render
r.engine = "BLENDER_EEVEE"
r.resolution_percentage = ESCALA
r.film_transparent = False
ee = cena.eevee
for attr, val in (("taa_render_samples", AMOSTRAS), ("use_raytracing", True), ("use_shadows", True),
                  ("shadow_ray_count", 3), ("shadow_step_count", 12), ("volumetric_tile_size", "4"),
                  ("volumetric_samples", 96), ("use_volumetric_shadows", True), ("volumetric_end", 6.0),
                  ("use_gtao", True), ("fast_gi_resolution", "2")):
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
for look in ("AgX - Medium High Contrast", "AgX - Punchy", "Medium High Contrast"):
    try:
        vs.look = look; break
    except Exception:
        pass
vs.exposure = 0.0
r.image_settings.file_format = "PNG"
r.image_settings.color_depth = "16"  # 16 bits: o ffmpeg faz dithering ao reduzir e os degradês escuros não formam faixas
r.image_settings.compression = 30
cena.frame_start, cena.frame_end = INICIO, FIM

# granulação de filme leve no compositor? (fica para o ffmpeg)
saida = os.path.join(AQUI, "render", FORMATO if MODO == "final" else "teste")
os.makedirs(saida, exist_ok=True)
if MODO == "teste":
    cena.frame_set(FRAME)
    r.filepath = os.path.join(saida, f"{FORMATO}_{FRAME:04d}.png")
    bpy.ops.render.render(write_still=True)
else:
    r.filepath = os.path.join(saida, "")
    bpy.ops.render.render(animation=True)
if "--salvar" in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, "cena.blend"))
print("FIM")
