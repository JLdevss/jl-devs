"""Gera as texturas da cena do hero de advocacia (páginas do livro, lombadas, papel timbrado).

Uso: python gen_textures.py   -> grava em ./tex/
Texto: art. 5º da Constituição Federal (texto oficial, livre de direitos autorais — Lei 9.610/98, art. 8º, IV).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random

AQUI = Path(__file__).parent
TEX = AQUI / "tex"
TEX.mkdir(exist_ok=True)
F = "C:/Windows/Fonts/"

PAPEL = (236, 228, 210)
TINTA = (38, 34, 30)


def fonte(nome, tam):
    return ImageFont.truetype(F + nome, tam)


def justificar(draw, texto, x, y, largura, fnt, entrelinha, recuo=0, ultima_esq=True):
    palavras = texto.split()
    linhas, atual = [], []
    for p in palavras:
        teste = " ".join(atual + [p])
        lim = largura - (recuo if not linhas else 0)
        if draw.textlength(teste, font=fnt) <= lim or not atual:
            atual.append(p)
        else:
            linhas.append(atual)
            atual = [p]
    if atual:
        linhas.append(atual)
    for i, ln in enumerate(linhas):
        x0 = x + (recuo if i == 0 else 0)
        lim = largura - (recuo if i == 0 else 0)
        if i == len(linhas) - 1 and ultima_esq or len(ln) == 1:
            draw.text((x0, y), " ".join(ln), font=fnt, fill=TINTA)
        else:
            larg_p = sum(draw.textlength(p, font=fnt) for p in ln)
            esp = (lim - larg_p) / (len(ln) - 1)
            cx = x0
            for p in ln:
                draw.text((cx, y), p, font=fnt, fill=TINTA)
                cx += draw.textlength(p, font=fnt) + esp
        y += entrelinha
    return y


def envelhecer(img, seed):
    """Leve variação de tom do papel, para não parecer chapado."""
    rnd = random.Random(seed)
    w, h = img.size
    ruido = Image.effect_noise((w // 8, h // 8), 18).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
    base = Image.new("RGB", (w, h), (226, 214, 190))
    img = Image.composite(img, base, ruido.point(lambda v: 200 + v // 5))
    return img


PAG_W, PAG_H = 1600, 2240
M_EXT, M_INT, M_TOP = 170, 150, 190


def pagina(itens, num, esquerda, seed):
    img = Image.new("RGB", (PAG_W, PAG_H), PAPEL)
    d = ImageDraw.Draw(img)
    corpo = fonte("georgia.ttf", 44)
    corpo_b = fonte("georgiab.ttf", 44)
    cab = fonte("georgia.ttf", 30)
    x = M_EXT if esquerda else M_INT
    larg = PAG_W - M_EXT - M_INT
    # cabeço corrido
    titulo_cab = "CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL"
    tw = d.textlength(titulo_cab, font=cab)
    d.text((x + (larg - tw) / 2, 110), titulo_cab, font=cab, fill=(90, 80, 70))
    d.line((x, 160, x + larg, 160), fill=(120, 108, 92), width=2)
    y = M_TOP + 30
    for tipo, txt in itens:
        if tipo == "titulo":
            f = fonte("georgiab.ttf", 46)
            w = d.textlength(txt, font=f)
            d.text((x + (larg - w) / 2, y), txt, font=f, fill=TINTA)
            y += 66
        elif tipo == "sub":
            f = fonte("georgiai.ttf", 44)
            w = d.textlength(txt, font=f)
            d.text((x + (larg - w) / 2, y), txt, font=f, fill=TINTA)
            y += 92
        elif tipo == "art":
            rot, resto = txt.split(" ", 2)[0:2], txt.split(" ", 2)[2]
            rotulo = " ".join(rot) + " "
            d.text((x + 60, y), rotulo, font=corpo_b, fill=TINTA)
            rw = d.textlength(rotulo, font=corpo_b)
            y = justificar(d, resto, x, y, larg, corpo, 68, recuo=60 + rw) + 22
        else:
            y = justificar(d, txt, x, y, larg, corpo, 68, recuo=60) + 22
        if y > PAG_H - 230:
            break
    n = str(num)
    nw = d.textlength(n, font=cab)
    d.text((x if esquerda else x + larg - nw, PAG_H - 140), n, font=cab, fill=(90, 80, 70))
    img = envelhecer(img, seed)
    return img


ESQ = [
    ("titulo", "TÍTULO II"),
    ("sub", "Dos Direitos e Garantias Fundamentais"),
    ("titulo", "CAPÍTULO I"),
    ("sub", "Dos Direitos e Deveres Individuais e Coletivos"),
    ("art", "Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade, nos termos seguintes:"),
    ("inc", "I – homens e mulheres são iguais em direitos e obrigações, nos termos desta Constituição;"),
    ("inc", "II – ninguém será obrigado a fazer ou deixar de fazer alguma coisa senão em virtude de lei;"),
    ("inc", "III – ninguém será submetido a tortura nem a tratamento desumano ou degradante;"),
    ("inc", "IV – é livre a manifestação do pensamento, sendo vedado o anonimato;"),
    ("inc", "V – é assegurado o direito de resposta, proporcional ao agravo, além da indenização por dano material, moral ou à imagem;"),
    ("inc", "VI – é inviolável a liberdade de consciência e de crença, sendo assegurado o livre exercício dos cultos religiosos e garantida, na forma da lei, a proteção aos locais de culto e a suas liturgias;"),
]
DIR = [
    ("inc", "VII – é assegurada, nos termos da lei, a prestação de assistência religiosa nas entidades civis e militares de internação coletiva;"),
    ("inc", "VIII – ninguém será privado de direitos por motivo de crença religiosa ou de convicção filosófica ou política, salvo se as invocar para eximir-se de obrigação legal a todos imposta e recusar-se a cumprir prestação alternativa, fixada em lei;"),
    ("inc", "IX – é livre a expressão da atividade intelectual, artística, científica e de comunicação, independentemente de censura ou licença;"),
    ("inc", "X – são invioláveis a intimidade, a vida privada, a honra e a imagem das pessoas, assegurado o direito a indenização pelo dano material ou moral decorrente de sua violação;"),
    ("inc", "XI – a casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial;"),
    ("inc", "XII – é inviolável o sigilo da correspondência e das comunicações telegráficas, de dados e das comunicações telefônicas, salvo, no último caso, por ordem judicial, nas hipóteses e na forma que a lei estabelecer para fins de investigação criminal ou instrução processual penal;"),
    ("inc", "XIII – é livre o exercício de qualquer trabalho, ofício ou profissão, atendidas as qualificações profissionais que a lei estabelecer;"),
    ("inc", "XIV – é assegurado a todos o acesso à informação e resguardado o sigilo da fonte, quando necessário ao exercício profissional;"),
]


def lombada(texto, sub, cor, nome, seed):
    """Lombada de couro com letreiro dourado. Gera cor (RGB) e máscara do dourado (L)."""
    W, H = 512, 2048
    rnd = random.Random(seed)
    base = Image.new("RGB", (W, H), cor)
    ruido = Image.effect_noise((W // 4, H // 4), 40).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    escuro = Image.new("RGB", (W, H), tuple(int(c * 0.62) for c in cor))
    base = Image.composite(base, escuro, ruido.point(lambda v: 140 + v // 3))
    mask = Image.new("L", (W, H), 0)
    dm = ImageDraw.Draw(mask)
    # nervuras (faixas douradas)
    for yy in (230, 290, 1650, 1710):
        dm.rectangle((30, yy, W - 30, yy + 10), fill=255)
        dm.rectangle((30, yy + 22, W - 30, yy + 26), fill=255)
    # texto girado (lido de cima para baixo, como nas lombadas brasileiras)
    tx = Image.new("L", (1300, 300), 0)
    dt = ImageDraw.Draw(tx)
    f = fonte("timesbd.ttf", 120)
    fs = fonte("times.ttf", 78)
    w = dt.textlength(texto, font=f)
    dt.text(((1300 - w) / 2, 20), texto, font=f, fill=255)
    w2 = dt.textlength(sub, font=fs)
    dt.text(((1300 - w2) / 2, 170), sub, font=fs, fill=255)
    tx = tx.rotate(-90, expand=True)
    mask.paste(tx, ((W - tx.width) // 2, (H - tx.height) // 2), tx)
    # desgaste do dourado
    gasto = Image.effect_noise((W, H), 70).point(lambda v: 255 if v > 70 else 0)
    from PIL import ImageChops
    mask = ImageChops.multiply(mask, gasto).filter(ImageFilter.GaussianBlur(0.8))
    base.save(TEX / f"{nome}.jpg", quality=92)
    mask.save(TEX / f"{nome}_ouro.png")


def timbrado():
    W, H = 1700, 2200
    img = Image.new("RGB", (W, H), (240, 236, 226))
    d = ImageDraw.Draw(img)
    f = fonte("georgia.ttf", 40)
    fb = fonte("georgiab.ttf", 46)
    d.line((160, 260, W - 160, 260), fill=(150, 126, 84), width=3)
    d.text((160, 170), "PARECER", font=fb, fill=TINTA)
    texto = ("Em atenção à consulta formulada, passamos a expor os caminhos possíveis para o caso, "
             "com a indicação dos documentos necessários, dos prazos aplicáveis e das alternativas "
             "disponíveis, para que a decisão seja tomada com plena clareza. ") * 5
    justificar(d, texto, 160, 360, W - 320, f, 66, recuo=60)
    img = envelhecer(img, 9)
    img.save(TEX / "timbrado.jpg", quality=92)


if __name__ == "__main__":
    pagina(ESQ, 18, True, 1).save(TEX / "pagina_esq.jpg", quality=93)
    pagina(DIR, 19, False, 2).save(TEX / "pagina_dir.jpg", quality=93)
    lombada("CÓDIGO CIVIL", "Lei nº 10.406", (92, 22, 24), "lombada_civil", 3)
    lombada("CÓDIGO PENAL", "Decreto-Lei nº 2.848", (24, 48, 36), "lombada_penal", 4)
    lombada("CONSTITUIÇÃO", "Federal de 1988", (28, 30, 52), "lombada_cf", 5)
    lombada("PROCESSO CIVIL", "Lei nº 13.105", (70, 40, 22), "lombada_cpc", 6)
    timbrado()
    print("ok", sorted(p.name for p in TEX.iterdir()))
