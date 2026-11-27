(function () {
'use strict';
const C = CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const MARCA = /\[TROCAR\]/g;
const limpo = s => String(s == null ? '' : s).replace(MARCA, '').replace(/\s+/g, ' ').trim();
const movimento = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const modoLimpo = params.has('limpo');
const previa = C.modoPrevia && !modoLimpo;
const pendentes = new Set();
const estado = { area: '', modo: '', processo: '' };
const waLinks = [];

/* ---------- ícones (traço único, 1.5) ---------- */
const ICONS = {
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z M14.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z',
  lock: 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3 M7 10.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z',
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7'
};
const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

/* ---------- construtor de DOM (escapa tudo, sem innerHTML com dados) ---------- */
function add(el, kids) { kids.flat(Infinity).forEach(k => { if (k == null || k === false) return; el.append(k instanceof Node ? k : document.createTextNode(k)); }); }
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids); return el;
}
function vetor(d, preenchido) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', preenchido ? 'currentColor' : 'none');
  if (!preenchido) {
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  path.setAttribute('d', d);
  svg.append(path);
  return h('span', { class: 'ico', 'aria-hidden': 'true' }, svg);
}
const icon = n => vetor(ICONS[n], false);
const waIcon = () => vetor(WA_PATH, true);

/* ---------- textos ---------- */
function vals() { const n = C.negocio; return { nome: limpo(n.nome), cidade: limpo(n.cidade), bairro: limpo(n.bairro), uf: limpo(n.uf) }; }
function fill(str, extra) {
  const v = Object.assign(vals(), extra || {});
  return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (k in v ? limpo(v[k]) : m));
}
function rich(s) {
  const f = document.createDocumentFragment();
  String(s).split(/(\*[^*]+\*)/).forEach(p => {
    if (/^\*[^*]+\*$/.test(p)) f.append(h('em', null, p.slice(1, -1)));
    else if (p) f.append(p);
  });
  return f;
}

/* ---------- módulos (flags dos planos) ---------- */
function on(mod) {
  const v = C.planos.modulos[mod];
  if (v === true || v === false) return v;
  const p = C.planos.presets[C.planos.ativo] || {};
  return !!p[mod];
}
const areasAtivas = () => (C.areas || []).filter(a => a && a.nome && a.atua !== false);

/* ---------- cores: tema, contraste ---------- */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgb = x => { let s = x.replace('#', ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); const n = parseInt(s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = a => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]); };
const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const toHex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
const cor = { primaria: '#15253D', secundaria: '#D8D2C6', fundo: '#FAFAF8', texto: '#1A2130', destaque: '#B08D57' };
Object.keys(cor).forEach(k => { if (HEX.test(C.cores[k] || '')) cor[k] = C.cores[k]; else if (k !== 'destaque' || C.cores[k]) console.warn('[template] cor inválida em CONFIG.cores.' + k + ' — use HEX, ex. #15253D'); });



function contraste(bg, cores, minimo = 4.5) {
  const ideal = cores.find(c => ratio(bg, c) >= minimo);
  return ideal || cores.reduce((a, b) => ratio(bg, a) > ratio(bg, b) ? a : b);
}

function aplicarTema() {
  const r = document.documentElement.style;
  const { primaria, secundaria, fundo, texto, destaque } = cor;
  const ink = mix(primaria, '#06090D', .73);
  const papel = mix(fundo, secundaria, .22);
  const onInk = contraste(ink, [fundo, '#FFFFFF', '#000000'], 7);
  const onPaper = contraste(fundo, [texto, '#17191C', '#FFFFFF', '#000000']);
  const muted = contraste(fundo, [mix(onPaper, fundo, .28), onPaper]);
  const tintText = contraste(papel, [onPaper, '#17191C', '#FFFFFF', '#000000']);
  const accent = (bg, fg, min) => contraste(bg, [destaque, mix(destaque, fg, .33), mix(destaque, fg, .6), fg], min);
  const theme = {
    primaria, fundo, texto: onPaper, papel, 'papel-texto': tintText, muted, ink, 'ink-texto': onInk,
    'ink-muted': contraste(ink, [mix(onInk, ink, .22), onInk], 7),
    'cta-texto': contraste(primaria, [fundo, texto, '#FFFFFF', '#000000']),
    brass: destaque, 'brass-paper': accent(fundo, onPaper, 4.5), 'brass-tint': accent(papel, tintText, 4.5),
    'brass-ink': accent(ink, onInk, 4.5),
    rule: mix(fundo, onPaper, .24), 'rule-ink': mix(ink, onInk, .3),
    'controle-papel': contraste(papel, [mix(papel, tintText, .52), tintText], 3)
  };
  Object.entries(theme).forEach(([k, v]) => r.setProperty('--' + k, v));
  $('meta[name="theme-color"]').content = ink;
  const ini = limpo(C.negocio.nome).toUpperCase().match(/^\p{L}/u)?.[0] || 'A';
  const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${ink}"/><path d="M10 9v46" stroke="${destaque}"/><text x="36" y="46" font-family="Georgia,serif" font-size="37" text-anchor="middle" fill="${onInk}">${ini}</text></svg>`;
  $('link[rel="icon"]').href = 'data:image/svg+xml,' + encodeURIComponent(fav);
}

function placeholder(portrait, i = 0) {
  const bg = mix(cor.secundaria, cor.primaria, [.13, .25, .19, .3][i % 4]);
  const stroke = contraste(bg, [cor.primaria, '#1C2023', '#FFFFFF']);
  const desenho = portrait
    ? '<circle cx="400" cy="355" r="110"/><path d="M195 794V710a205 205 0 0 1 410 0v84"/><rect x="72" y="72" width="656" height="856"/>'
    : '<path d="M68 615h1064M174 615V262h264v353m0-203h588v203M272 615V359h96v256m237-203v203m137-203v203m137-203v203"/><path d="M68 653h1064M68 693h1064"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${portrait ? '800 1000' : '1200 900'}"><rect width="100%" height="100%" fill="${bg}"/><g fill="none" stroke="${stroke}" opacity=".38" stroke-width="2">${desenho}</g></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function foto(src, { alt, rotulo, i, retrato = false, eager = false }) {
  const img = h('img', {
    alt: limpo(alt) ? (modoLimpo ? limpo(alt) : alt) : rotulo,
    width: retrato ? 800 : 1200, height: retrato ? 1000 : 900,
    loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null
  });
  const usarPlaceholder = () => {
    img.src = placeholder(retrato, i);
    img.alt = 'Foto pendente: ' + rotulo;
    img.dataset.pendente = '';
    if (img.isConnected) atualizarPendencias();
  };
  if (src) {
    if (/\[TROCAR\]/.test(alt || '')) pendentes.add(alt);
    img.addEventListener('error', usarPlaceholder, { once: true });
    img.src = src;
  } else usarPlaceholder();
  return img;
}
/* ---------- WhatsApp ---------- */
const numero = String(C.whatsapp.numero || '').replace(/\D/g, '');
const numeroPendente = !numero || /^55\d{2}0{7,}$/.test(numero) || /^5500/.test(numero);
function detalhesFrase(comArea) {
  if (!on('consultaRapida')) return '';
  const p = [];
  if (comArea && estado.area) p.push('Área: ' + estado.area);
  if (estado.modo) p.push('Prefiro atendimento ' + estado.modo.toLowerCase());
  if (estado.processo === 'sim') p.push('Já existe um processo em andamento');
  if (estado.processo === 'nao') p.push('Ainda não há processo');
  if (estado.processo === 'naosei') p.push('Não sei se já existe processo');
  return p.length ? ' ' + p.join('. ') + '.' : '';
}
function waUrl(tpl, extra, comArea) {
  const msg = fill(String(tpl).replace('{detalhes}', '§DET§'), extra).replace('§DET§', detalhesFrase(comArea)).replace(/\s+/g, ' ').trim();
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(msg);
}
function registra(a, tpl, extra, comArea) { waLinks.push({ a, tpl: tpl || C.whatsapp.mensagem, extra: extra || {}, comArea: comArea !== false }); return a; }
function waBtn(o) {
  const a = h('a', { class: 'btn ' + (o.cls || 'btn--cta'), href: '#', target: '_blank', rel: 'noopener noreferrer' },
    waIcon(), h('span', null, o.texto), h('span', { class: 'vh' }, ' (abre o WhatsApp em outra aba)'));
  return registra(a, o.tpl, o.extra, o.comArea);
}
function refreshWa() { waLinks.forEach(l => { l.a.href = waUrl(l.tpl, l.extra, l.comArea); }); }

/* ---------- contato, endereço ---------- */
function telHref() { let d = String(C.contato.telefone || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return 'tel:+' + d; }
function mapsUrl() {
  if (C.links.googleMaps) return C.links.googleMaps;
  const n = C.negocio;
  const q = [limpo(n.rua), limpo(n.bairro), limpo(n.cidade), limpo(n.uf)].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
const enderecoLinhas = () => {
  const n = C.negocio;
  return [n.rua, h('br'), n.bairro, n.bairro ? ', ' : '', n.cidade, '/', n.uf, h('br'), 'CEP ', n.cep];
};


function secHead(id, titulo, intro, extra) {
  return h('div', { class: 'sec-head' },
    h('h2', { id: id + '-t' }, rich(fill(titulo))),
    intro ? h('p', { class: 'lead' }, rich(fill(intro))) : null, extra);
}

function sec(id, cls, ...body) {
  return h('section', { id, class: 'sec ' + cls, 'aria-labelledby': id + '-t' }, h('div', { class: 'container' }, body));
}

function menuIcon() {
  return h('span', { class: 'menu-icon', 'aria-hidden': 'true' });
}

function cabecalho(navItens) {
  const topo = $('#topo');
  const nav = h('nav', { id: 'menu', class: 'nav', 'aria-label': 'Seções da página' },
    [...navItens, { id: 'contato', label: 'Contato' }].map(n => h('a', { href: '#' + n.id }, n.label)));
  const toggle = h('button', { type: 'button', class: 'menu-toggle', 'aria-controls': 'menu', 'aria-expanded': 'false' }, 'Menu', menuIcon());
  function menu(aberto, voltar = false) {
    topo.toggleAttribute('data-menu', aberto);
    toggle.setAttribute('aria-expanded', String(aberto));
    if (voltar) toggle.focus();
  }
  toggle.addEventListener('click', () => menu(!topo.hasAttribute('data-menu')));
  topo.addEventListener('keydown', e => {
    if (e.key === 'Escape' && topo.hasAttribute('data-menu')) menu(false, true);
  });
  nav.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link || !topo.hasAttribute('data-menu')) return;
    menu(false);
    const destino = $(link.hash);
    destino.setAttribute('tabindex', '-1');
    destino.focus({ preventScroll: true });
  });
  document.addEventListener('pointerdown', e => {
    if (topo.hasAttribute('data-menu') && !topo.contains(e.target)) menu(false);
  });
  topo.append(h('div', { class: 'container topo-in' },
    h('a', { class: 'marca', href: '#hero', onclick: () => menu(false) }, C.negocio.nome),
    toggle, nav, waBtn({ texto: C.textos.botaoCurto, cls: 'btn--nav' })));
}

const responsavel = () => [
  h('strong', null, C.responsavel?.nome || '[TROCAR] Nome do(a) advogado(a)'),
  h('span', { class: 'tnum' }, C.responsavel?.oab || '[TROCAR] OAB/UF 000.000')
];
const cenaConfig = C.hero.cena?.ativa ? C.hero.cena : null;

function hero() {
  const tx = C.textos;
  const titulo = fill(tx.heroTitulo).split(/\r?\n/).filter(Boolean);
  const temFoto = !cenaConfig && C.hero.foto;
  return h('section', { id: 'hero', class: 'hero escura hero--intro' + (cenaConfig || temFoto ? '' : ' hero--texto'), 'aria-labelledby': 'h1' },
    h('div', { class: 'hero-media' },
      cenaConfig ? h('canvas', { id: 'cena', 'aria-hidden': 'true' }) : null,
      temFoto ? h('div', { class: 'hero-foto' }, foto(C.hero.foto, { alt: C.hero.alt, rotulo: 'Advogado(a) ou escritório', retrato: true, eager: true })) : null),
    h('div', { class: 'container hero-in' },
      h('div', { class: 'hero-texto' },
        h('p', { class: 'hero-marca' }, C.negocio.nome),
        h('h1', { id: 'h1' }, titulo.map((line, i) => h('span', { class: 'hero-linha', style: '--linha:' + i }, rich(line)))),
        h('div', { class: 'hero-complemento' },
          h('p', { class: 'hero-lead' }, rich(fill(tx.heroSubtitulo))),
          h('div', { class: 'hero-acoes' },
            waBtn({ texto: tx.botaoPrincipal, cls: 'btn--claro' }),
            on('areas') && areasAtivas().length ? h('a', { class: 'text-link', href: '#areas' }, tx.verAreas) : null))),
      h('div', { class: 'hero-rodape' },
        cenaConfig ? h('div', { class: 'hero-fecho' },
          C.formaAtendimento ? h('p', { class: 'hero-nota' }, rich(fill(C.formaAtendimento))) : null,
          waBtn({ texto: tx.botaoPrincipal, cls: 'btn--claro' })) : null,
        h('p', { class: 'hero-ficha hero-responsavel' }, responsavel()))),
    cenaConfig ? h('div', { class: 'hero-progresso', 'aria-hidden': 'true' }, h('span')) : null);
}

function horasLista() {
  return (C.horarios || []).map(x => h('span', { class: 'horario' }, h('span', null, fill(x.dias)), ' ', h('span', { class: 'tnum' }, fill(x.horas))));
}

function registro() {
  const n = C.negocio, hrs = horasLista();
  return h('div', { class: 'registro' }, h('dl', { class: 'container registro-in' },
    h('div', null, h('dt', null, 'Responsável'), h('dd', null, responsavel())),
    C.formaAtendimento ? h('div', null, h('dt', null, 'Forma de atendimento'), h('dd', null, rich(fill(C.formaAtendimento)))) : null,
    hrs.length ? h('div', null, h('dt', null, 'Horário'), h('dd', null, hrs)) : null,
    n.cidade ? h('div', null, h('dt', null, 'Localização'), h('dd', null, n.cidade, '/', n.uf)) : null));
}

function consultaRapida() {
  if (!on('consultaRapida')) return null;
  const select = h('select', { id: 'f-area', onchange: e => { estado.area = e.target.value; refreshWa(); } },
    h('option', { value: '' }, 'Escolha a área'),
    areasAtivas().map(a => h('option', { value: limpo(fill(a.nome)) }, limpo(fill(a.nome)))),
    h('option', { value: 'outro assunto' }, 'Outro assunto / não sei'));
  const grupo = (nome, legenda, opcoes, chave) => h('fieldset', { class: 'grupo' }, h('legend', null, legenda),
    h('div', { class: 'opcoes' }, opcoes.map(([v, t]) => h('label', { class: 'opcao' },
      h('input', { type: 'radio', name: nome, value: v, onchange: () => { estado[chave] = v; refreshWa(); } }), h('span', null, t)))));
  const mods = (C.modalidades || []).filter(Boolean);
  return sec('consulta', 'sec--papel',
    h('div', { class: 'colunas consulta-in' },
      secHead('consulta', C.textos.consultaTitulo, C.textos.consultaIntro),
      h('div', { class: 'consulta-form' },
        h('div', { class: 'campo' }, h('label', { for: 'f-area' }, 'Área do assunto'), select),
        h('div', { class: 'consulta-opcoes' },
          mods.length > 1 ? grupo('modo', 'Atendimento preferido', mods.map(m => [m, m]), 'modo') : null,
          grupo('processo', 'Já existe processo?', [['sim', 'Sim'], ['nao', 'Não'], ['naosei', 'Não sei']], 'processo')),
        h('p', { class: 'aviso' }, icon('lock'), h('span', null, rich(fill(C.textos.consultaAviso)))),
        waBtn({ texto: C.textos.botaoPrincipal }))));
}

function romano(n) {
  const pares = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  return pares.map(([v, sinal]) => {
    const vezes = Math.floor(n / v);
    n %= v;
    return sinal.repeat(vezes);
  }).join('');
}

function areaRow(area, indice) {
  const id = 'area-corpo-' + indice;
  const conteudo = [
    area.texto ? h('p', null, rich(fill(area.texto))) : null,
    on('linksArea') ? registra(h('a', { class: 'text-link', href: '#', target: '_blank', rel: 'noopener noreferrer' },
      C.textos.botaoArea, h('span', { class: 'vh' }, ': ' + limpo(fill(area.nome)) + ', pelo WhatsApp (abre em outra aba)')),
      C.whatsapp.mensagemArea, { area: fill(area.nome) }, false) : null
  ].filter(Boolean);
  const rotulo = [h('span', { class: 'area-nome' }, rich(fill(area.nome))),
    h('span', { class: 'area-pontos', 'aria-hidden': 'true' }),
    h('span', { class: 'area-num', 'aria-hidden': 'true' }, romano(indice + 1)),
    h('span', { class: conteudo.length ? 'mais' : 'mais mais--vazio', 'aria-hidden': 'true' })];
  if (!conteudo.length) return h('li', { class: 'area' }, h('h3', { class: 'area-linha' }, rotulo));

  const button = h('button', { class: 'area-linha', type: 'button', 'aria-controls': id, 'aria-expanded': 'false' }, rotulo);
  const inner = h('div', { class: 'area-miolo' }, h('div', { class: 'area-texto' }, conteudo));
  const painel = h('div', { id, class: 'area-painel', inert: true }, inner);
  const row = h('li', { class: 'area' }, h('h3', null, button), painel);
  let fixo = false, hover = false, foco = false, suprimido = false;
  function atualizar() {
    const aberto = fixo || (!suprimido && (hover || foco));
    button.setAttribute('aria-expanded', String(aberto));
    row.toggleAttribute('data-aberto', aberto);
    painel.inert = !aberto;
    if (!hover && !foco) suprimido = false;
  }
  row.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hover = true; atualizar(); } });
  row.addEventListener('pointerleave', () => { hover = false; atualizar(); });
  row.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) { foco = true; atualizar(); } });
  row.addEventListener('focusout', e => { if (!row.contains(e.relatedTarget)) { foco = false; atualizar(); } });
  button.addEventListener('click', () => {
    if (fixo || (button.matches(':focus-visible') && row.hasAttribute('data-aberto'))) {
      fixo = false;
      suprimido = true;
    } else {
      fixo = true;
      suprimido = false;
    }
    atualizar();
  });
  row.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !row.hasAttribute('data-aberto')) return;
    button.focus();
    fixo = false;
    suprimido = true;
    atualizar();
  });
  return row;
}

function areas() {
  const lista = areasAtivas();
  if (!on('areas') || !lista.length) return null;
  return sec('areas', 'sec-areas', h('div', { class: 'colunas' },
    secHead('areas', C.textos.areasTitulo, C.textos.areasIntro),
    h('ol', { class: 'areas', role: 'list' }, lista.map(areaRow))));
}

function sobre() {
  const s = C.sobre;
  if (!on('sobre') || !s?.paragrafos?.length) return null;
  const [abertura, ...resto] = s.paragrafos;
  return sec('sobre', 'sec--escura escura',
    h('div', { class: 'colunas sobre-in' },
      h('div', null, secHead('sobre', s.titulo),
        s.foto !== false ? h('figure', { class: 'sobre-foto' }, foto(s.foto, { alt: s.alt, rotulo: 'Escritório', i: 2 })) : null),
      h('div', { class: 'sobre-texto' },
        h('p', { class: 'sobre-abertura' }, rich(fill(abertura))),
        resto.map(p => h('p', null, rich(fill(p)))))));
}

function primeiroAtendimento() {
  const p = C.primeiroAtendimento || [];
  if (!on('primeiroAtendimento') || !p.length) return null;
  return sec('atendimento', 'sec-passos', secHead('atendimento', C.textos.atendimentoTitulo, C.textos.atendimentoIntro),
    h('ol', { class: 'passos', role: 'list', style: '--passos:' + Math.min(p.length, 3) },
      p.slice(0, 3).map((s, i) => h('li', { class: 'passo' },
        h('span', { class: 'passo-n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        h('h3', null, rich(fill(s.titulo))), h('p', null, rich(fill(s.texto)))))));
}

function advogados() {
  const lista = (C.advogados || []).filter(p => p?.nome);
  if (!on('advogados') || !lista.length) return null;
  const tx = C.textos;
  const titulo = lista.length > 1 ? tx.advogadosTitulo.replace('Advogado *responsável*', 'Advogados *responsáveis*') : tx.advogadosTitulo;
  return sec('advogados', 'sec--papel',
    h('div', { class: 'colunas' }, secHead('advogados', titulo, tx.advogadosIntro),
      h('ul', { class: 'advs' + (lista.length === 1 ? ' advs--um' : ''), role: 'list' },
        lista.map((p, i) => h('li', { class: 'adv' },
          p.foto !== false ? h('figure', { class: 'adv-foto' }, foto(p.foto, { alt: p.alt || p.nome, rotulo: limpo(p.nome), retrato: true, i })) : null,
          h('div', { class: 'adv-txt' }, h('h3', null, rich(fill(p.nome))),
            p.oab ? h('p', { class: 'adv-oab tnum' }, p.oab) : null,
            p.areas ? h('p', { class: 'adv-areas' }, rich(fill(p.areas))) : null,
            p.bio ? h('p', null, rich(fill(p.bio))) : null))))));
}

const lbItens = [];
function galeria() {
  if (!on('galeria') || !C.galeria.length) return null;
  const usaLb = on('lightbox');
  const tiles = C.galeria.map((g, i) => {
    const figura = h('figure', { class: 'tile' },
      h('div', { class: 'tile-imagem' }),
      g.rotulo || (!usaLb && g.legenda) ? h('figcaption', null, rich(fill(g.rotulo)), !usaLb && g.legenda ? h('span', null, rich(fill(g.legenda))) : null) : null);
    const img = foto(g.src, { alt: g.alt, rotulo: g.rotulo || 'Foto do escritório', i });
    const alvo = $('.tile-imagem', figura);
    if (!usaLb || !g.src) alvo.append(img);
    else {
      const idx = lbItens.length;
      lbItens.push({ src: g.src, alt: limpo(g.alt) || g.rotulo || '', legenda: fill(g.legenda), w: 1200, h: 900 });
      alvo.append(h('button', { type: 'button', class: 'tile-zoom', 'aria-label': 'Ampliar foto: ' + limpo(g.alt || g.rotulo || 'foto ' + (i + 1)), onclick: () => abrirLb(idx) },
        img, h('span', { class: 'mais', 'aria-hidden': 'true' })));
    }
    return figura;
  });
  return sec('galeria', 'sec-galeria', secHead('galeria', C.textos.galeriaTitulo, C.textos.galeriaIntro),
    h('div', { class: 'galeria' + (tiles.length >= 3 ? ' galeria--editorial' : '') }, tiles));
}

function avaliacoes() {
  const lista = (C.avaliacoes || []).filter(a => a?.texto);
  if (!on('avaliacoes') || !lista.length) return null;
  console.warn('[template] Depoimentos de clientes são vedados pelo Provimento 205/2021. Mantenha o módulo avaliacoes desligado.');
  return sec('avaliacoes', 'sec--papel', secHead('avaliacoes', C.textos.avaliacoesTitulo, C.textos.avaliacoesIntro),
    lista.map(a => h('figure', { class: 'aval' }, h('blockquote', null, rich(fill(a.texto))), h('figcaption', null, rich(fill(a.autor))))));
}

function faq() {
  if (!on('faq') || !C.faq.length) return null;
  return sec('perguntas', 'sec-faq',
    h('div', { class: 'colunas faq-in' },
      secHead('perguntas', C.textos.faqTitulo, C.textos.faqIntro, waBtn({ texto: C.textos.faqBotao, cls: 'btn--linha' })),
      h('div', { class: 'faq-lista' }, C.faq.map(f => h('details', null,
        h('summary', null, h('span', null, rich(fill(f.p))), h('span', { class: 'mais', 'aria-hidden': 'true' })),
        h('p', { class: 'faq-resp' }, rich(fill(f.r))))))));
}

function contatoLinks() {
  const tel = telHref();
  return [
    tel ? h('a', { href: tel }, C.contato.telefone) : null,
    C.contato.email ? h('a', { href: 'mailto:' + limpo(C.contato.email) }, C.contato.email) : null
  ].filter(Boolean);
}

function novoLink(href, ...conteudo) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, conteudo,
    h('span', { class: 'vh' }, ' (abre em outra aba)'));
}

function localizacao() {
  if (!on('localizacao')) return null;
  const hrs = horasLista(), links = contatoLinks();
  const bloco = (label, ...valor) => h('div', null, h('dt', null, label), h('dd', null, valor));
  const mapa = on('mapa') ? h('div', { class: 'mapa' }, C.links.mapaEmbed
    ? h('iframe', { src: C.links.mapaEmbed, title: 'Mapa com a localização de ' + limpo(C.negocio.nome), loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: true })
    : h('div', { class: 'mapa-vazio' }, icon('pin'), h('p', null, '[TROCAR] Mapa do escritório'), novoLink(mapsUrl(), 'Consultar endereço no Google Maps'))) : null;
  return sec('localizacao', 'sec--papel',
    h('div', { class: 'local' + (mapa ? ' local--mapa' : '') },
      h('div', null, secHead('localizacao', C.textos.localTitulo),
        h('dl', { class: 'dados' },
          bloco('Endereço', enderecoLinhas()),
          hrs.length ? bloco('Horário de atendimento', hrs) : null,
          C.formaAtendimento ? bloco('Forma de atendimento', rich(fill(C.formaAtendimento))) : null,
          links.length ? bloco('Contato', links) : null),
        h('div', { class: 'local-acoes' }, novoLink(mapsUrl(), icon('pin'), 'Abrir no Google Maps'))),
      mapa));
}

function ctaFinal() {
  return sec('contato', 'escura final',
    h('div', { class: 'final-in' },
      secHead('contato', C.textos.ctaFinalTitulo, C.textos.ctaFinalTexto),
      waBtn({ texto: C.textos.botaoPrincipal, cls: 'btn--claro' }),
      h('div', { class: 'final-contato' }, contatoLinks())));
}

function rodape() {
  const f = C.rodape;
  const redes = on('redes') ? [[C.links.instagram, 'Instagram'], [C.links.linkedin, 'LinkedIn']].filter(([url]) => url) : [];
  $('#rodape').append(h('div', { class: 'container' },
    h('div', { class: 'rodape-grid' },
      h('div', null, h('a', { class: 'logo', href: '#hero' }, C.negocio.nome), f.frase ? h('p', null, rich(fill(f.frase))) : null),
      h('div', null, h('h2', null, 'Contato'),
        h('ul', { role: 'list' },
          h('li', null, registra(novoLink('#', 'Falar pelo WhatsApp'))),
          contatoLinks().map(link => h('li', null, link)),
          redes.map(([url, nome]) => h('li', null, novoLink(url, nome))))),
      h('div', null, h('h2', null, 'Endereço e horário'), h('ul', { role: 'list' },
        h('li', null, enderecoLinhas()), horasLista().map(hora => h('li', null, hora)),
        h('li', null, novoLink(mapsUrl(), 'Ver no mapa'))))),
    h('div', { class: 'rodape-ficha' },
      h('div', { class: 'resp-rodape' }, h('span', null, 'Responsável'), responsavel()),
      h('div', { class: 'rodape-legal' },
        f.razaoSocial ? h('span', null, f.razaoSocial) : null,
        f.cnpj ? h('span', { class: 'tnum' }, 'CNPJ ', f.cnpj) : null,
        f.registroSociedade ? h('span', { class: 'tnum' }, f.registroSociedade) : null)),
    h('div', { class: 'rodape-base' },
      h('span', null, '© ' + new Date().getFullYear() + ' ', C.negocio.nome),
      f.credito ? (f.creditoUrl ? novoLink(f.creditoUrl, f.credito) : h('span', null, f.credito)) : null)));
}

function flutuante() {
  if (!on('botaoFlutuante')) return;
  const el = $('#flutuante');
  el.append(waIcon(), h('span', { class: 'vh' }, C.textos.botaoCurto + ' (abre em outra aba)'));
  registra(el);
}

/* ---------- lightbox ---------- */
let lbI = 0;
function abrirLb(i) { const d = $('#lightbox'); lbI = i; mostrarLb(); if (!d.open) d.showModal(); }
function mostrarLb() {
  const d = $('#lightbox'), it = lbItens[lbI]; if (!it) return;
  const img = $('img', d); img.width = it.w; img.height = it.h; img.src = it.src; img.alt = it.alt;
  $('figcaption', d).textContent = it.legenda || '';
  d.setAttribute('aria-label', 'Galeria de fotos, foto ' + (lbI + 1) + ' de ' + lbItens.length);
}
function iniciarLb() {
  const d = $('#lightbox'), primeira = lbItens[0];
  $('figure', d).prepend(h('img', { src: primeira.src, alt: primeira.alt, width: primeira.w, height: primeira.h, decoding: 'async' }));
  $('[data-lb=x]', d).append(icon('close')); $('[data-lb=prev]', d).append(icon('prev')); $('[data-lb=next]', d).append(icon('next'));
  const nav = k => { lbI = (lbI + k + lbItens.length) % lbItens.length; mostrarLb(); };
  d.addEventListener('click', e => { const b = e.target.closest('[data-lb]'); if (b) { const k = b.dataset.lb; if (k === 'x') d.close(); else nav(k === 'next' ? 1 : -1); } else if (e.target === d) d.close(); });
  d.addEventListener('keydown', e => { if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); });
  let x0 = null;
  d.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; }, { passive: true });
  d.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) nav(dx < 0 ? 1 : -1); x0 = null; }, { passive: true });
}

/* ---------- SEO: head + JSON-LD ---------- */
function metaSet(sel, attr, val) { const m = $(sel); if (m && val) m.setAttribute(attr, val); }
function seo() {
  const s = C.seo, titulo = fill(s.titulo), desc = fill(s.descricao);
  document.title = titulo;
  metaSet('meta[name="description"]', 'content', desc);
  metaSet('meta[property="og:title"]', 'content', titulo);
  metaSet('meta[property="og:description"]', 'content', desc);
  metaSet('meta[property="og:site_name"]', 'content', C.negocio.nome);
  if (s.urlSite) { metaSet('link[rel="canonical"]', 'href', s.urlSite); metaSet('meta[property="og:url"]', 'content', s.urlSite); }
  if (s.imagemOg) metaSet('meta[property="og:image"]', 'content', s.imagemOg);
}
function jsonld() {
  const n = C.negocio, abs = u => /^https?:\/\//.test(u || '') ? u : undefined, completo = on('jsonLdCompleto');
  const horas = (C.horariosSchema || []).filter(x => x && x.abre && x.fecha && (x.dias || []).length)
    .map(x => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: x.dias, opens: x.abre, closes: x.fecha }));
  const advs = (C.advogados || []).filter(p => p && p.nome);
  const o = {
    '@context': 'https://schema.org', '@type': n.tipoSchema || 'LegalService',
    name: n.nome, description: fill(C.seo.descricao), url: abs(C.seo.urlSite),
    image: abs(C.seo.imagemOg) || abs(C.hero.foto),
    telephone: numeroPendente ? undefined : '+' + numero,
    email: C.contato.email ? limpo(C.contato.email) : undefined,
    address: { '@type': 'PostalAddress', streetAddress: n.rua, addressLocality: n.cidade, addressRegion: n.uf, postalCode: n.cep, addressCountry: 'BR' },
    geo: n.coordenadas ? { '@type': 'GeoCoordinates', latitude: n.coordenadas.lat, longitude: n.coordenadas.lng } : undefined,
    areaServed: limpo(n.cidade) ? { '@type': 'City', name: n.cidade } : undefined,
    hasMap: mapsUrl(),
    openingHoursSpecification: horas.length ? horas : undefined,
    sameAs: [C.links.instagram, C.links.linkedin].filter(Boolean),
    knowsAbout: completo && on('areas') && areasAtivas().length ? areasAtivas().map(a => a.nome) : undefined,
    employee: completo && on('advogados') && advs.length ? advs.map(p => ({ '@type': 'Person', name: p.nome, jobTitle: 'Advogado(a)', identifier: p.oab || undefined })) : undefined
  };
  if (!o.sameAs.length) delete o.sameAs;
  const s = h('script', { type: 'application/ld+json' }); s.textContent = JSON.stringify(o); document.head.append(s);
}


function iniciarCena() {
  const canvas = $('#cena');
  if (!canvas) return;
  const heroEl = $('#hero'), progresso = $('.hero-progresso span'), final = $('.final');
  const observaHero = 'IntersectionObserver' in window;
  let cena, tween, geracao = 0, pertoDoHero = !observaHero;
  let paginaCarregada = document.readyState === 'complete', midiaAgendada = false;
  const { gsap, ScrollTrigger } = window;
  if (gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }
  function atualizar(p) {
    cena?.setProgress(p);
    progresso.style.transform = 'scaleX(' + p + ')';
    const saida = Math.min(1, Math.max(0, (p - .35) / .25));
    const entrada = Math.max(0, (p - .75) / .25);
    heroEl.style.setProperty('--hero-saida', String(saida));
    heroEl.style.setProperty('--hero-entrada', String(entrada));
    heroEl.toggleAttribute('data-copia-oculta', p >= .6);
    heroEl.toggleAttribute('data-fecho', p > .75);
  }
  function agendarMidia() {
    if (!cena || !paginaCarregada || !pertoDoHero || document.hidden || midiaAgendada || movimento.matches) return;
    midiaAgendada = true;
    const carregar = () => {
      midiaAgendada = false;
      if (pertoDoHero && !document.hidden && !movimento.matches) cena?.carregarMidia();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(carregar);
    else setTimeout(carregar, 800);
  }
  function sincronizar() {
    if (pertoDoHero && !document.hidden) {
      cena?.start();
      agendarMidia();
    } else cena?.stop();
  }
  function ajustarPin() {
    const cabe = heroEl.offsetHeight <= innerHeight + 2 && innerHeight >= 510;
    const podeFixar = !movimento.matches && cabe && gsap && ScrollTrigger;
    if (podeFixar && !tween) {
      const proxy = { p: 0 };
      tween = gsap.to(proxy, {
        p: 1, ease: 'none', onUpdate: () => atualizar(proxy.p),
        scrollTrigger: {
          trigger: heroEl, start: 'top top',
          end: () => '+=' + Math.round(innerHeight * (innerWidth >= 700 ? 2.5 : 1.8)),
          pin: true, pinSpacing: true, scrub: .6, anticipatePin: 1
        }
      });
    } else if (!podeFixar && tween) {
      tween.scrollTrigger.kill(true);
      tween.kill();
      tween = null;
      atualizar(0);
    }
    heroEl.classList.toggle('hero--fixa', Boolean(tween));
    return Boolean(tween);
  }
  async function configurar() {
    const atual = ++geracao;
    const fixada = ajustarPin();
    cena?.dispose();
    cena = null;
    try {
      const { createCena } = await import('/advocacia/assets/cena-video.js');
      if (atual !== geracao) return;
      cena = createCena(canvas, {
        cena: cenaConfig, estatico: !fixada, quadroFinal: movimento.matches,
        agendarMidia,
        onFinal: src => final.style.setProperty('--quadro-final', src ? 'url(' + JSON.stringify(src) + ')' : 'none')
      });
      const p = tween ? tween.progress() : 0;
      atualizar(p);
      sincronizar();
    } catch {
      // O fundo da abertura também funciona sem o módulo de vídeo.
    }
  }
  let frame = 0;
  function redimensionar() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const eraFixa = Boolean(tween);
      if (ajustarPin() !== eraFixa) configurar();
      else cena?.resize();
    });
  }
  configurar();
  document.fonts?.ready.then(redimensionar);
  document.fonts?.addEventListener('loadingdone', redimensionar);
  addEventListener('resize', redimensionar, { passive: true });
  if (!paginaCarregada) addEventListener('load', () => {
    paginaCarregada = true;
    agendarMidia();
  }, { once: true });
  movimento.addEventListener('change', configurar);
  document.addEventListener('visibilitychange', sincronizar);
  if (observaHero) {
    new IntersectionObserver(([entry]) => {
      pertoDoHero = entry.isIntersecting;
      sincronizar();
    }, { rootMargin: '180px 0px' }).observe(heroEl);
  }
  addEventListener('pagehide', e => { if (!e.persisted) cena?.dispose(); });
}

function comportamentos() {
  const topo = $('#topo'), heroEl = $('#hero'), flutuanteEl = $('#flutuante');
  let frame = 0;
  function atualizar() {
    frame = 0;
    const passou = heroEl.getBoundingClientRect().bottom <= topo.offsetHeight + 1;
    topo.toggleAttribute('data-solido', passou);
    if (on('botaoFlutuante')) flutuanteEl.hidden = !passou;
  }
  function agendar() {
    if (!frame) frame = requestAnimationFrame(atualizar);
  }
  addEventListener('scroll', agendar, { passive: true });
  addEventListener('resize', agendar, { passive: true });
  addEventListener('pageshow', agendar);
  atualizar();

  const passos = $('.passos');
  if (passos && 'IntersectionObserver' in window && !movimento.matches) {
    passos.classList.add('passos--animado');
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      passos.classList.add('passos--visivel');
      obs.disconnect();
    }, { threshold: .1 });
    obs.observe(passos);
  }
  // A abertura e a animação CSS já estão visíveis enquanto os scripts de scroll carregam.
  document.addEventListener('DOMContentLoaded', iniciarCena, { once: true });
}

let contador, fotosPendentes = 0, total = 0;
function atualizarPendencias() {
  fotosPendentes = document.querySelectorAll('img[data-pendente]').length;
  if ((total || fotosPendentes || numeroPendente || pendentes.size) && !$('meta[name="robots"][data-template]')) {
    document.head.append(h('meta', { name: 'robots', content: 'noindex, nofollow', 'data-template': true }));
  }
  if (contador) contador.textContent = 'Prévia: ' + total + ' [TROCAR], ' + fotosPendentes + ' fotos' + (numeroPendente ? ', WhatsApp pendente' : '');
}

function pendencias() {
  const visiveis = /\[TROCAR\]/;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => !n.parentElement?.closest('script, style, noscript, option') && visiveis.test(n.nodeValue)
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
  });
  const nos = [];
  while (w.nextNode()) nos.push(w.currentNode);
  nos.forEach(n => {
    const partes = n.nodeValue.split(MARCA);
    total += partes.length - 1;
    if (modoLimpo) n.nodeValue = partes.join('').replace(/^\s+/, '');
    else if (previa) {
      const f = document.createDocumentFragment();
      partes.forEach((p, i) => {
        if (i) f.append(h('mark', { class: 'pend' }, 'Trocar'));
        if (p) f.append(i ? p.replace(/^ /, '') : p);
      });
      n.replaceWith(f);
    }
  });
  const metadados = [...document.head.querySelectorAll('meta[content], link[rel="canonical"]')]
    .map(el => el.getAttribute('content') || el.getAttribute('href'));
  const dados = [C.whatsapp.mensagem, on('linksArea') && on('areas') ? C.whatsapp.mensagemArea : '', ...metadados];
  dados.filter(x => visiveis.test(x || '')).forEach(x => pendentes.add(x));
  if (modoLimpo) document.title = limpo(document.title);
  if (previa) {
    let k = -1;
    contador = h('span');
    const bt = h('button', { type: 'button', class: 'previa' },
      h('span', { class: 'previa-ponto', 'aria-hidden': 'true' }), contador,
      h('span', { class: 'vh' }, '. Ir para a próxima pendência'));
    bt.addEventListener('click', () => {
      const marcas = Array.from(document.querySelectorAll('mark.pend, img[data-pendente]')).filter(x => !x.closest('.nav, .hero-nota'));
      if (!marcas.length) return;
      k = (k + 1) % marcas.length;
      const alvo = marcas[k], detalhes = alvo.closest('details'), painel = alvo.closest('.area-painel');
      if (detalhes) detalhes.open = true;
      if (painel?.inert) $('.area-linha', painel.closest('.area')).click();
      alvo.scrollIntoView({ block: 'center', behavior: movimento.matches ? 'instant' : 'smooth' });
      alvo.classList.add('pend-foco');
      setTimeout(() => alvo.classList.remove('pend-foco'), 1600);
    });
    document.body.append(bt);
  }
  atualizarPendencias();
}

function montar() {
  aplicarTema();
  seo();
  const main = $('#conteudo');
  const pagina = document.createDocumentFragment();
  add(pagina, [hero(), registro(), consultaRapida(), areas(), sobre(), primeiroAtendimento(), advogados(),
    galeria(), avaliacoes(), faq(), localizacao(), ctaFinal()]);
  main.replaceChildren(pagina);
  const nav = [['areas', 'areas'], ['atendimento', 'atendimento'], ['advogados', 'advogados'], ['perguntas', 'faq']]
    .filter(([id]) => $('#' + id)).map(([id, key]) => ({ id, label: C.textos.nav[key] }));
  cabecalho(nav);
  rodape();
  flutuante();
  if (lbItens.length) iniciarLb();
  refreshWa();
  jsonld();
  pendencias();
  comportamentos();
}

montar();
})();
