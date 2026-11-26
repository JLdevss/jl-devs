"""Gera as páginas de SEO por ramo (public/<slug>/index.html) a partir de conteudo.json.

Uso (na raiz do repositório):
    python experimentos/seo-ramos/gerar.py

- conteudo.json: textos de cada página (título, descrição, seções, recursos, perguntas).
- Visual: public/inicio/ramos.css (mesmo sistema da home).
- Também reescreve public/sitemap.xml com a home e todas as páginas geradas.
Depois de criar uma página nova, adicione a rota limpa em next.config.ts.
"""
import html
import json
import os
from datetime import date
from urllib.parse import quote

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITE = "https://jldevs.online"
WA = "https://wa.me/5548988058940?text="
ORG = SITE + "/#organization"

PLANOS = [
    ("Básico", "R$ 350", "1 página com botão de WhatsApp"),
    ("Médio", "R$ 450", "até 5 páginas, galeria, formulário e mapa"),
    ("Completo", "R$ 700", "páginas sem limite, agenda ou reservas e painel"),
    ("Profissional", "R$ 900", "pagamento online ou mais de um idioma"),
    ("Premium", "R$ 999", "assistente com IA treinado com o seu negócio"),
    ("Empresarial", "R$ 1.100", "IA com pagamento online ou idiomas"),
]

NOMES = {
    "criacao-de-sites": ("Criação de sites", "Visão geral, planos e como funciona"),
    "site-para-pousada": ("Site para pousada", "Quartos e reserva direto no WhatsApp"),
    "site-para-dentista": ("Site para dentista", "Tratamentos, equipe e agendamento"),
    "site-para-clinica-de-estetica": ("Site para clínica de estética", "Tratamentos e avaliação pelo WhatsApp"),
    "site-para-advogado": ("Site para advogado", "Áreas de atuação e contato"),
    "site-para-construtora": ("Site para construtora", "Obras e lançamentos com impacto"),
    "site-para-imobiliaria": ("Site para imobiliária", "Lançamentos com seletor de andares"),
}

LOGO_DEFS = """<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="jl-corpo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EDFFC2"/><stop offset=".42" stop-color="#C1FC6D"/><stop offset=".8" stop-color="#8ED63A"/><stop offset="1" stop-color="#D2FF90"/></linearGradient>
  <symbol id="logo-jl" viewBox="0 -2 104 68"><g fill="url(#jl-corpo)" stroke="#4E8A16" stroke-width="1.4" stroke-linejoin="round">
    <path d="M36 0.5H42Q49 0.5 49 7.5V39C49 52.5 38.5 63 25.3 63C12 63 1.5 52.5 1.5 40V39.5Q1.5 33 8 33H11.5Q18 33 18 39.5C18 43.8 20.5 47 23.5 47C26.5 47 29 43.8 29 39V7.5Q29 0.5 36 0.5Z"/>
    <path d="M59 0.5H63.5Q70.5 0.5 70.5 7.5V40Q70.5 44.5 75 44.5H85Q92 44.5 92 51.5V56Q92 63 85 63H59Q52 63 52 56V7.5Q52 0.5 59 0.5Z"/></g>
    <circle cx="98" cy="58.5" r="4.6" fill="url(#jl-corpo)" stroke="#4E8A16" stroke-width=".9"/></symbol>
</defs></svg>"""

LOGO = '<a class="logo" href="/" aria-label="JL Devs, início"><svg aria-hidden="true" focusable="false"><use href="#logo-jl"/></svg><span class="word" aria-hidden="true">Devs</span></a>'

# Carrega a prévia do template depois que a página termina de carregar e ajusta a escala.
SCRIPT_PREVIA = """<script>
(function(){
  var f=document.getElementById('tpl-frame'), i=document.getElementById('tpl-iframe'); if(!f||!i) return;
  function fit(){var w=f.clientWidth,h=f.clientHeight;if(!w||!h)return;var vw=w<500?390:1280,s=w/vw;i.style.width=vw+'px';i.style.height=Math.ceil(h/s)+'px';i.style.transform='scale('+s+')'}
  fit(); if('ResizeObserver' in window) new ResizeObserver(fit).observe(f);
  function load(){i.src=i.dataset.src}
  if(document.readyState==='complete') setTimeout(load,600); else addEventListener('load',function(){setTimeout(load,600)});
})();
</script>"""


def e(s):
    return html.escape(s or "", quote=True)


def pagina(item, todos):
    slug, tpl = item["slug"], item.get("template")
    url = f"{SITE}/{slug}"
    nome_curto = NOMES.get(slug, (item["h1"], ""))[0]
    nicho = item.get("nicho") or "o meu negócio"
    wa = WA + quote(f"Oi, JG! Vim pela página \"{nome_curto}\" da JL Devs e quero um site para {nicho}.")
    hub = slug == "criacao-de-sites"

    grafo = [
        {"@type": "ProfessionalService", "@id": ORG, "name": "JL Devs", "url": SITE + "/"},
        {"@type": "WebPage", "@id": url + "#pagina", "url": url, "name": item["title"],
         "description": item["description"], "inLanguage": "pt-BR",
         "isPartOf": {"@id": SITE + "/#website"}, "breadcrumb": {"@id": url + "#trilha"}},
        {"@type": "BreadcrumbList", "@id": url + "#trilha", "itemListElement": (
            [{"@type": "ListItem", "position": 1, "name": "Início", "item": SITE + "/"}]
            + ([] if hub else [{"@type": "ListItem", "position": 2, "name": "Criação de sites", "item": SITE + "/criacao-de-sites"}])
            + [{"@type": "ListItem", "position": 2 if hub else 3, "name": nome_curto, "item": url}])},
        {"@type": "Service", "name": nome_curto, "serviceType": "Criação de sites",
         "description": item["description"], "provider": {"@id": ORG},
         "areaServed": [{"@type": "State", "name": "Santa Catarina"}, {"@type": "Country", "name": "Brasil"}],
         "offers": {"@type": "AggregateOffer", "priceCurrency": "BRL", "lowPrice": "350", "highPrice": "1100"}},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}}
            for f in item["faq"]]},
    ]
    ld = json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False, separators=(",", ":"))

    trilha = ['<li><a href="/">Início</a></li>']
    if not hub:
        trilha.append('<li><a href="/criacao-de-sites">Criação de sites</a></li>')
    trilha.append(f'<li aria-current="page">{e(nome_curto)}</li>')

    if tpl:
        lado = f"""<div class="browser glass">
        <div class="bar"><div class="lights" aria-hidden="true"><i></i><i></i><i></i></div><div class="url">jldevs.online/{e(tpl)}</div></div>
        <div class="frame" id="tpl-frame"><iframe id="tpl-iframe" title="Prévia do template de {e(nicho)}" data-src="/{e(tpl)}" loading="lazy"></iframe></div>
        <div class="under"><span>Template da JL Devs. É só um exemplo: o seu site pode ficar totalmente diferente.</span><a class="link" href="/{e(tpl)}" target="_blank" rel="noopener">Abrir template ↗</a></div>
      </div>"""
    else:
        lado = '<div class="browser glass"><p class="eyebrow" style="margin:6px 8px 4px">Sites por ramo</p><ul class="ramos" style="margin:8px">' + "".join(
            f'<li><a href="/{s}"><b>{e(n)}</b><span>{e(d)}</span></a></li>'
            for s, (n, d) in NOMES.items() if s != "criacao-de-sites") + "</ul></div>"

    secoes = "".join(f"""
<section><div class="wrap prose">
  <div><h2>{e(s["h2"])}</h2></div>
  <div class="body">{"".join(f"<p>{e(p)}</p>" for p in s["paragrafos"])}</div>
</div></section>""" for s in item["secoes"])

    recursos = "".join(f"<li>{e(r)}</li>" for r in item["recursos"])
    planos = "".join(f'<li><b>{n}</b><span class="p">{p}</span><span>{e(d)}</span></li>' for n, p, d in PLANOS)
    outros = "".join(
        f'<li><a href="/{s}"><b>{e(n)}</b><span>{e(d)}</span></a></li>'
        for s, (n, d) in NOMES.items() if s != slug)
    faq = "".join(f"<details><summary>{e(f['q'])}</summary><p>{e(f['a'])}</p></details>" for f in item["faq"])
    rodape_links = "".join(f'<li><a href="/{s}">{e(n)}</a></li>' for s, (n, _) in NOMES.items())

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(item["title"])}</title>
<meta name="description" content="{e(item["description"])}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#06120e">
<meta name="color-scheme" content="dark">
<meta name="geo.region" content="BR-SC">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JL Devs">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(item["title"])}">
<meta property="og:description" content="{e(item["description"])}">
<meta property="og:image" content="{SITE}/inicio/assets/jl-glass.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@1&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="/inicio/ramos.css">
<script type="application/ld+json">{ld}</script>
</head>
<body>
{LOGO_DEFS}
<div class="scene" aria-hidden="true"><div class="blob b1"></div><div class="blob b2"></div></div>
<div class="nav-shell wrap"><nav class="nav glass" aria-label="Menu principal">
  {LOGO}
  <ul class="nav-links">
    <li><a href="/">Início</a></li>
    <li><a href="/criacao-de-sites"{' aria-current="page"' if hub else ''}>Criação de sites</a></li>
    <li><a href="/#planos">Planos</a></li>
    <li><a href="/#orcamento">Orçamento</a></li>
  </ul>
  <a class="btn btn-lime" href="{wa}" target="_blank" rel="noopener">WhatsApp ↗</a>
</nav></div>

<main>
<section><div class="wrap">
  <ol class="crumbs" aria-label="Você está em">{"".join(trilha)}</ol>
  <div class="hero-grid">
    <div>
      <p class="eyebrow">JL Devs &nbsp;/&nbsp; Santa Catarina</p>
      <h1>{e(item["h1"])}</h1>
      <p class="lead">{e(item["lead"])}</p>
      <div class="actions">
        <a class="btn btn-lime" href="{wa}" target="_blank" rel="noopener">Pedir orçamento no WhatsApp ↗</a>
        <a class="btn btn-glass glass" href="/#rascunho">Ver um rascunho grátis</a>
      </div>
      <p class="price-hint">A partir de R$ 350. Pagamento único, sem mensalidade.</p>
    </div>
    {lado}
  </div>
</div></section>
{secoes}
<section><div class="wrap">
  <p class="eyebrow">O que entra</p>
  <h2>Recursos do site</h2>
  <ul class="recursos" style="margin-top:26px">{recursos}</ul>
</div></section>

<section><div class="wrap">
  <p class="eyebrow">Planos</p>
  <h2>Pagamento único, <em>sem mensalidade.</em></h2>
  <ul class="planos">{planos}</ul>
  <p class="muted" style="margin-top:18px">Simule o valor exato no <a class="link" href="/#orcamento">orçamento da home</a>.</p>
</div></section>

<section><div class="wrap">
  <p class="eyebrow">{"Sites por ramo" if hub else "Outros ramos"}</p>
  <h2>{"Escolha o seu ramo" if hub else "Também fazemos"}</h2>
  <ul class="ramos">{outros}</ul>
</div></section>

<section><div class="wrap prose">
  <div><p class="eyebrow">Perguntas frequentes</p><h2>Antes de <em>chamar.</em></h2></div>
  <div class="faq">{faq}</div>
</div></section>

<section><div class="wrap">
  <div class="final glass">
    <div><h2>Vamos montar o seu site?</h2><p>Conte o que você faz no WhatsApp e veja como vai ficar antes da gente programar.</p></div>
    <a class="btn btn-lime" href="{wa}" target="_blank" rel="noopener">Chamar no WhatsApp ↗</a>
  </div>
</div></section>
</main>

<footer><div class="wrap">
  <div class="foot">
    <div>{LOGO}<p class="muted" style="margin-top:14px;max-width:34ch">Criação de sites, sistemas e automações com IA para pequenos negócios em Santa Catarina.</p></div>
    <nav aria-label="Páginas"><p class="eyebrow">Páginas</p><ul>{rodape_links}</ul></nav>
    <div><p class="eyebrow">Contato</p><ul>
      <li><a href="https://wa.me/5548988058940" target="_blank" rel="noopener">JG Dev · (48) 98805-8940</a></li>
      <li><a href="https://wa.me/5548988767877" target="_blank" rel="noopener">LC Dev · (48) 98876-7877</a></li>
      <li><a href="https://www.instagram.com/jl.devs/" target="_blank" rel="noopener me">Instagram · @jl.devs</a></li>
    </ul></div>
  </div>
  <p class="foot-bottom">© 2026 JL Devs. Feito em Santa Catarina.</p>
</div></footer>
{SCRIPT_PREVIA if tpl else ""}
</body>
</html>
"""


def main():
    itens = json.load(open(os.path.join(os.path.dirname(__file__), "conteudo.json"), encoding="utf-8"))
    for item in itens:
        destino = os.path.join(RAIZ, "public", item["slug"], "index.html")
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8", newline="\n") as f:
            f.write(pagina(item, itens))
        print("ok", item["slug"], len(item["title"]), len(item["description"]))
    hoje = date.today().isoformat()
    urls = [("/", "1.0")] + [("/" + i["slug"], "0.9" if i["slug"] == "criacao-de-sites" else "0.8") for i in itens]
    corpo = "".join(
        f"  <url>\n    <loc>{SITE}{u}</loc>\n    <lastmod>{hoje}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>{p}</priority>\n  </url>\n"
        for u, p in urls)
    with open(os.path.join(RAIZ, "public", "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + corpo + "</urlset>\n")
    print("sitemap", len(urls), "urls")


if __name__ == "__main__":
    main()
