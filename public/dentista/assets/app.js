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
const estado = { trat: '', periodo: '', primeira: '' };
const waLinks = [];
const pendentes = new Set();

/* ---------- ícones (traço único, 1.6) ---------- */
const DENTE = 'M8 3.2c-2.4 0-4.2 1.9-4.2 4.5 0 1.9.6 3.2 1.2 4.7.6 1.6.8 3.7 1.3 6 .4 1.7 1 2.6 1.9 2.6 1 0 1.4-1 1.7-2.7.3-1.6.7-3.2 2.1-3.2s1.8 1.6 2.1 3.2c.3 1.7.7 2.7 1.7 2.7.9 0 1.5-.9 1.9-2.6.5-2.3.7-4.4 1.3-6 .6-1.5 1.2-2.8 1.2-4.7 0-2.6-1.8-4.5-4.2-4.5-1.7 0-2.4.9-4 .9s-2.3-.9-4-.9z';
const ICONS = {
  dente: `<path d="${DENTE}"/>`,
  limpeza: '<path d="M4 20l8.5-8.5"/><path d="M11.5 9.5l4-4a2.1 2.1 0 0 1 3 3l-4 4z"/><path d="M13.6 7.4l3 3M15.6 5.4l3 3"/><path d="M5 5.5v2M4 6.5h2M8 2.8v1.4M7.3 3.5h1.4"/>',
  clareamento: `<g transform="translate(-1.2 1.4) scale(.88)"><path d="${DENTE}"/></g><path d="M19.6 1.8v4M17.6 3.8h4"/><path d="M21 8.6v1.6M20.2 9.4h1.6"/>`,
  ortodontia: `<path d="${DENTE}"/><path d="M4.6 10.2h14.8"/><rect x="7" y="8.9" width="2.6" height="2.6" rx=".5"/><rect x="14.4" y="8.9" width="2.6" height="2.6" rx=".5"/>`,
  implante: '<path d="M6.2 4.8c0-.9.7-1.6 1.6-1.6 1.6 0 2.5.8 4.2.8s2.6-.8 4.2-.8c.9 0 1.6.7 1.6 1.6 0 2.2-1 3.8-2 4.4H8.2c-1-.6-2-2.2-2-4.4z"/><path d="M12 9.2V21"/><path d="M9 12h6M9.5 15h5M10 18h4"/>',
  crianca: `<g transform="translate(1.8 2.6) scale(.85)"><path d="${DENTE}"/></g><path d="M10.3 10.6c.5.6 1 .9 1.7.9s1.2-.3 1.7-.9"/><path d="M10 8.2h.01M14 8.2h.01"/>`,
  urgencia: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 14.5h4"/>',
  acesso: '<circle cx="12" cy="4.6" r="1.6"/><path d="M8 9h8M12 9v5l-3 6M12 14l3 6"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".7" fill="currentColor"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7.5l8 6 8-6"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.3a11 11 0 0 0 5.7 5.7L15 13l4 1.5V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/>'
};
const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

/* ---------- construtor de DOM (escapa tudo, sem innerHTML com dados) ---------- */
function add(el, kids) { kids.flat(Infinity).forEach(k => { if (k == null || k === false) return; el.append(k instanceof Node ? k : document.createTextNode(k)); }); }
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids); return el;
}
const icon = (n, cls) => h('span', { class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true',
  html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.dente}</svg>` });
const waIcon = () => h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${WA_PATH}"/></svg>` });

/* ---------- textos ---------- */
function vals() {
  const n = C.negocio;
  return { nome: limpo(n.nome), cidade: limpo(n.cidade), bairro: limpo(n.bairro), uf: limpo(n.uf), convenios: (C.convenios || []).map(limpo).join(', ') };
}
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
const servicosAtivos = () => (C.servicos || []).filter(s => s && s.nome && s.oferece !== false);

/* ---------- cores: tema, contraste ---------- */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgb = x => { let s = x.replace('#', ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); const n = parseInt(s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = a => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]); };
const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const toHex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
const cor = { primaria: '#2F4F44', secundaria: '#DCE5DE', fundo: '#F4F3EF', texto: '#18221F' };
Object.keys(cor).forEach(k => { if (HEX.test(C.cores[k] || '')) cor[k] = C.cores[k]; else console.warn('[template] cor inválida em CONFIG.cores.' + k + ' — use HEX, ex. #0B6E78'); });


function contraste(bg, cores, minimo = 4.5) {
  const ideal = cores.find(c => ratio(bg, c) >= minimo);
  return ideal || cores.reduce((a, b) => ratio(bg, a) > ratio(bg, b) ? a : b);
}


function aplicarTema() {
  const { primaria, secundaria, fundo, texto } = cor;
  const papel = mix(fundo, '#FFFFFF', .48);
  const tinta = contraste(fundo, [texto, '#18221F', '#FFFFFF', '#000000']);
  const veu = mix(fundo, '#FFFFFF', .65);
  const heroTinta = contraste(veu, [texto, '#18221F', '#000000'], 8);
  const salvia = mix(fundo, secundaria, .73);
  const tema = {
    primaria, secundaria, fundo, texto: tinta, papel, salvia, veu,
    'texto-salvia': contraste(salvia, [tinta, '#18221F', '#FFFFFF', '#000000']),
    'texto-papel': contraste(papel, [tinta, '#18221F', '#FFFFFF', '#000000']),
    'hero-tinta': heroTinta,
    'hero-acento': contraste(mix(veu, '#000000', .16), [primaria, heroTinta, '#000000'], 5),
    'cta-texto': contraste(primaria, ['#FFFFFF', tinta, '#000000']),
    'texto-suave': contraste(fundo, [mix(fundo, tinta, .71), tinta]),
    acento: contraste(fundo, [primaria, tinta]),
    foco: contraste(fundo, [primaria, tinta], 4.5),
    linha: mix(fundo, tinta, .34),
    controle: contraste(papel, [mix(papel, tinta, .55), tinta], 3),
    pedra: mix(fundo, tinta, .48),
    'sala-clara': mix(veu, secundaria, .35),
    'sala-fundo': mix(secundaria, primaria, .22)
  };
  Object.entries(tema).forEach(([k,v]) => document.documentElement.style.setProperty('--'+k,v));
  $('meta[name="theme-color"]').content = fundo;
  const ini = limpo(C.negocio.nome).toUpperCase().match(/^\p{L}/u)?.[0] || 'C';
  const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="24" fill="${primaria}"/><text x="32" y="45" font-family="Georgia,serif" font-size="38" text-anchor="middle" fill="${tema['cta-texto']}">${ini}</text></svg>`;
  $('link[rel="icon"]').href = 'data:image/svg+xml,' + encodeURIComponent(fav);
}

function placeholder(tipo, indice) {
  const tom = [.06, .14, .09, .18][indice % 4];
  const fundo = mix(cor.secundaria, cor.primaria, tom);
  const papel = mix(cor.fundo, cor.secundaria, .2);
  const retrato = tipo === 'retrato';
  const arte = retrato
    ? '<path d="M128 378V184a112 112 0 0 1 224 0v194Z" fill="url(#l)" stroke="none"/><circle cx="240" cy="181" r="37"/><path d="M164 313a76 76 0 0 1 152 0"/><path d="M155 367h170"/>'
    : indice % 2
      ? '<path d="M0 315H680M64 315V87h186v228m-93-228v228m-93-133h186m102 133v-79a79 79 0 0 1 158 0v79"/><path d="M394 315v-62a37 37 0 0 1 74 0v62"/>'
      : '<path d="M0 315H680M86 315V200q0-24 24-24h181q24 0 24 24v115m0-36h222m-97 0v-53m-49 0h98m-130 89v-35m178 35v-35"/><path d="M371 61h145v107H371zM443 61v107"/>';
  const size = retrato ? '480 520' : '680 420';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size}"><defs><linearGradient id="l" x2="1" y2="1"><stop stop-color="${papel}"/><stop offset="1" stop-color="${fundo}"/></linearGradient></defs><rect width="100%" height="100%" fill="${fundo}"/><path d="M0 0H680L495 420H0Z" fill="url(#l)" opacity=".7"/><g fill="none" stroke="${cor.primaria}" stroke-width="1.45" opacity=".46" ${retrato ? 'transform="translate(0 38)"' : ''}>${arte}</g></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function foto(src, { alt, rotulo, indice = 0, tipo = 'ambiente' }) {
  const retrato = tipo === 'retrato';
  const img = h('img', { alt: limpo(alt) || rotulo, width: retrato ? 480 : 680, height: retrato ? 520 : 420, loading: 'lazy', decoding: 'async' });
  const usarPlaceholder = () => {
    img.src = placeholder(tipo, indice);
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
function detalhesFrase(comTratamento) {
  if (!on('consultaRapida')) return '';
  const p = [];
  if (comTratamento && estado.trat) p.push('Tenho interesse em: ' + estado.trat);
  if (estado.periodo) p.push('Prefiro o período da ' + estado.periodo.toLowerCase());
  if (estado.primeira === 'sim') p.push('É minha primeira consulta na clínica');
  if (estado.primeira === 'nao') p.push('Já sou paciente da clínica');
  return p.length ? ' ' + p.join('. ') + '.' : '';
}
function waUrl(tpl, extra, comTratamento) {
  const msg = fill(tpl, extra).replaceAll('{detalhes}', detalhesFrase(comTratamento)).replace(/\s+/g, ' ').trim();
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(msg);
}
function registra(a, tpl, extra, comTratamento) { waLinks.push({ a, tpl: tpl || C.whatsapp.mensagem, extra: extra || {}, comTratamento: comTratamento !== false }); return a; }
function waBtn(o) {
  const a = h('a', { class: 'btn ' + (o.cls || 'btn--cta'), href: '#', target: '_blank', rel: 'noopener noreferrer' },
    waIcon(), h('span', null, prosa(o.texto)), h('span', { class: 'vh' }, ' (abre o WhatsApp em outra aba)'));
  return registra(a, o.tpl, o.extra, o.comTratamento);
}
function refreshWa() { waLinks.forEach(l => { l.a.href = waUrl(l.tpl, l.extra, l.comTratamento); }); }

/* ---------- contato, endereço ---------- */
function telHref() { let d = String(C.contato.telefone || '').replace(/\D/g, ''); if (!d) return ''; if (d.length <= 11) d = '55' + d; return 'tel:+' + d; }
function mapsUrl() {
  if (C.links.googleMaps) return C.links.googleMaps;
  const n = C.negocio;
  const q = [limpo(n.rua), limpo(n.bairro), limpo(n.cidade), limpo(n.uf)].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
const enderecoLinhas = () => { const n = C.negocio; return [n.rua, h('br'), n.bairro, n.bairro ? ', ' : '', n.cidade, '/', n.uf, h('br'), 'CEP ', n.cep]; };


function prosa(str) {
  return rich(fill(str));
}

function secHead(id, titulo, intro, classe = '') {
  return h('div', { class: 'sec-head ' + classe },
    h('h2', { id: id + '-t' }, prosa(titulo)),
    intro ? h('p', { class: 'lead' }, prosa(intro)) : null);
}

function sec(id, cls, ...body) {
  return h('section', { id, class: 'sec ' + cls, 'aria-labelledby': id + '-t' }, h('div', { class: 'container' }, body));
}

function novoLink(url, ...kids) {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
    kids, h('span', { class: 'vh' }, ' (abre em outra aba)'));
}

function marca() {
  return h('a', { class: 'marca', href: '#hero' }, h('span', { class: 'marca-sinal' }, icon('dente')),
    h('span', { class: 'marca-nome' }, C.negocio.nome));
}

function cabecalho(navItens) {
  const topo = $('#topo');
  const links = navItens.map(n => h('a', { href: '#' + n.id }, prosa(n.label)));
  const nav = h('nav', { id: 'menu', class: 'nav', 'aria-label': 'Seções da página' },
    links, waBtn({ texto: C.textos.botaoCurto, cls: 'btn--nav-mobile' }));
  const toggle = h('button', { type: 'button', class: 'menu-toggle', 'aria-controls': 'menu', 'aria-expanded': 'false' },
    'Menu', h('span', { class: 'menu-icon', 'aria-hidden': 'true' }));
  function menu(aberto, voltar = false) {
    topo.toggleAttribute('data-menu', aberto);
    toggle.setAttribute('aria-expanded', String(aberto));
    if (voltar) toggle.focus();
  }
  toggle.addEventListener('click', () => menu(!topo.hasAttribute('data-menu')));
  topo.addEventListener('keydown', e => {
    if (e.key === 'Escape' && topo.hasAttribute('data-menu')) menu(false, true);
  });
  links.forEach(link => link.addEventListener('click', () => {
    if (!topo.hasAttribute('data-menu')) return;
    menu(false);
    const destino = $(link.hash);
    destino.setAttribute('tabindex', '-1');
    destino.focus({ preventScroll: true });
  }));
  document.addEventListener('pointerdown', e => {
    if (topo.hasAttribute('data-menu') && !topo.contains(e.target)) menu(false);
  });
  const assinatura = marca();
  assinatura.addEventListener('click', () => menu(false));
  topo.append(h('div', { class: 'container topo-in' }, assinatura, toggle, nav,
    waBtn({ texto: C.textos.botaoCurto, cls: 'btn--nav' })));
}

function registroRT(classe) {
  const rt = C.responsavelTecnico;
  return h('p', { class: 'registro-rt ' + classe },
    h('span', { class: 'rt-rotulo' }, 'Responsável técnico'),
    h('strong', null, rt?.nome || '[TROCAR] Nome do responsável técnico'),
    h('span', { class: 'tnum' }, rt?.cro || '[TROCAR] CRO-UF 00000'));
}

const cenaConfig = C.hero.cena?.ativa ? C.hero.cena : null;

function hero() {
  const t = C.textos;
  const titulo = fill(t.heroTitulo).split(/\r?\n/).filter(Boolean);
  const temServicos = on('servicos') && servicosAtivos().length;
  const abertura = t.heroAbertura ?? 'O cuidado começa pela *escuta*.';
  return h('section', { class: 'hero', id: 'hero', 'aria-labelledby': 'h1' },
    h('div', { class: 'hero-media', 'aria-hidden': 'true' }, cenaConfig ? h('canvas', { id: 'cena' }) : null),
    h('div', { class: 'container hero-in' },
      h('div', { class: 'hero-palco' },
        cenaConfig && abertura ? h('div', { class: 'hero-abertura' },
          h('p', { class: 'hero-frase', 'aria-hidden': 'true' }, prosa(abertura)),
          temServicos ? h('a', { class: 'text-link', href: '#tratamentos' }, prosa(t.verServicos)) : null) : null,
        h('div', { class: 'hero-principal' },
          C.negocio.nicho ? h('p', { class: 'hero-nicho' }, prosa(C.negocio.nicho)) : null,
          h('h1', { id: 'h1' }, titulo.map((linha, i) => [i ? ' ' : '', h('span', null, rich(linha))])),
          h('p', { class: 'hero-lead' }, prosa(t.heroSubtitulo)),
          h('div', { class: 'hero-acoes' },
            waBtn({ texto: t.botaoPrincipal }),
            temServicos ? h('a', { class: 'text-link', href: '#tratamentos' }, prosa(t.verServicos)) : null))),
      h('div', { class: 'hero-base' },
        cenaConfig ? h('div', { class: 'hero-fecho' },
          h('p', null, prosa(t.ctaFinalTitulo)), waBtn({ texto: t.botaoPrincipal })) : null,
        registroRT('hero-rt'))),
    cenaConfig ? h('div', { class: 'hero-progresso', 'aria-hidden': 'true' }, h('span')) : null);
}

function horarios() {
  return (C.horarios || []).map(x => h('span', { class: 'horario tnum' }, fill(x.dias), ', ', fill(x.horas)));
}

function fatos() {
  const n = C.negocio, hr = horarios()[0];
  return h('div', { class: 'fatos' },
    h('ul', { class: 'container fatos-in', role: 'list', 'aria-label': 'Informações rápidas' },
      h('li', null, icon('pin'), h('span', null, n.bairro, ', ', n.cidade, '/', n.uf)),
      hr ? h('li', null, icon('clock'), hr) : null,
      C.convenios?.length ? h('li', null, icon('card'), h('span', null, 'Convênios: ', C.convenios.join(', '))) : null));
}

function servicos() {
  const itens = servicosAtivos();
  if (!on('servicos') || !itens.length) return null;
  return sec('tratamentos', 'sec-tratamentos',
    secHead('tratamentos', C.textos.servicosTitulo, C.textos.servicosIntro, 'sec-head--lado'),
    h('ul', { class: 'tratamentos', role: 'list' }, itens.map(item => {
      const nome = fill(item.nome);
      const link = on('linksServico') ? novoLink('#', prosa(C.textos.botaoServico),
        h('span', { class: 'vh' }, ' de ' + limpo(nome) + ' pelo WhatsApp')) : null;
      if (link) {
        link.className = 'text-link tratamento-link';
        registra(link, C.whatsapp.mensagemServico, { servico: nome }, false);
      }
      return h('li', { class: 'tratamento' },
        h('div', { class: 'tratamento-icone' }, icon(item.icone)),
        h('h3', null, rich(nome)),
        item.texto ? h('p', null, prosa(item.texto)) : null,
        link);
    })));
}

function primeiraConsulta() {
  const passos = (C.primeiraConsulta || []).slice(0, 3);
  if (!on('primeiraConsulta') || !passos.length) return null;
  return sec('primeira-consulta', 'sec-primeira',
    h('div', { class: 'primeira-in' },
      secHead('primeira-consulta', C.textos.primeiraTitulo, C.textos.primeiraIntro),
      h('ol', { class: 'passos', role: 'list', style: '--passos:' + passos.length }, passos.map((s, i) =>
        h('li', { class: 'passo' },
          h('span', { class: 'passo-numero', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
          h('h3', null, prosa(s.titulo)), h('p', null, prosa(s.texto)))))));
}

function sobre() {
  const s = C.sobre;
  if (!on('sobre') || !s?.paragrafos?.length) return null;
  const principal = C.hero.foto || s.foto;
  const fotos = [
    principal || s.foto !== false ? foto(principal, {
      alt: C.hero.foto ? C.hero.alt : s.alt, rotulo: 'Ambiente da clínica', tipo: C.hero.foto ? 'retrato' : 'ambiente'
    }) : null,
    C.hero.foto && s.foto && s.foto !== C.hero.foto ? foto(s.foto, { alt: s.alt, rotulo: 'Consultório', indice: 1 }) : null
  ].filter(Boolean);
  const [abre, ...resto] = s.paragrafos;
  return sec('sobre', 'sec-sobre',
    h('div', { class: 'sobre-in' + (fotos.length ? '' : ' sobre-in--texto') },
      h('div', { class: 'sobre-texto' },
        secHead('sobre', s.titulo),
        h('p', { class: 'sobre-abre' }, prosa(abre)),
        resto.map(p => h('p', null, prosa(p))),
        s.assinatura ? h('p', { class: 'assinatura' }, prosa(s.assinatura)) : null),
      fotos.length ? h('div', { class: 'sobre-fotos' }, fotos.map(img => h('figure', null, img))) : null));
}

function equipe() {
  const lista = (C.equipe || []).filter(p => p?.nome);
  if (!on('equipe') || !lista.length) return null;
  return sec('equipe', 'sec-equipe',
    secHead('equipe', C.textos.equipeTitulo, C.textos.equipeIntro, 'sec-head--lado'),
    h('ul', { class: 'equipe', role: 'list' }, lista.map((p, i) => h('li', { class: 'membro' },
      p.foto !== false ? h('figure', { class: 'membro-foto' }, foto(p.foto, {
        alt: p.alt || p.nome, rotulo: limpo(p.nome) || 'Profissional', tipo: 'retrato', indice: i
      })) : null,
      h('div', { class: 'membro-texto' },
        h('h3', null, prosa(p.nome)),
        p.cro ? h('p', { class: 'membro-cro tnum' }, p.cro) : null,
        p.especialidade ? h('p', null, prosa(p.especialidade)) : null,
        p.bio ? h('p', { class: 'membro-bio' }, prosa(p.bio)) : null)))));
}

const lbItens = [];
function galeria() {
  if (!on('galeria') || !C.galeria?.length) return null;
  const tiles = C.galeria.map((g, i) => {
    const img = foto(g.src, { alt: g.alt, rotulo: g.rotulo || 'Foto da clínica', indice: i });
    const amplia = on('lightbox') && Boolean(g.src);
    const idx = lbItens.length;
    if (amplia) lbItens.push({ src: g.src, alt: limpo(g.alt) || g.rotulo || '', legenda: fill(g.legenda), w: 1200, h: 900 });
    const media = amplia
      ? h('button', { type: 'button', class: 'tile-zoom', 'aria-label': 'Ampliar: ' + limpo(g.rotulo || g.alt || 'foto da clínica'), onclick: () => abrirLb(idx) }, img,
        h('span', { class: 'tile-mais', 'aria-hidden': 'true' }, '+'))
      : img;
    return h('figure', { class: 'tile' },
      h('div', { class: 'tile-media' }, media),
      g.rotulo || g.legenda ? h('figcaption', null, g.rotulo ? h('strong', null, prosa(g.rotulo)) : null,
        g.legenda ? h('span', null, prosa(g.legenda)) : null) : null);
  });
  return sec('galeria', 'sec-galeria',
    secHead('galeria', C.textos.galeriaTitulo, C.textos.galeriaIntro, 'sec-head--lado'),
    h('div', { class: 'galeria' + (tiles.length >= 3 ? ' galeria--editorial' : '') }, tiles));
}

function avaliacoes() {
  const itens = (C.avaliacoes || []).filter(a => a?.texto);
  if (!on('avaliacoes') || !itens.length) return null;
  return sec('avaliacoes', 'sec-avaliacoes',
    secHead('avaliacoes', C.textos.avaliacoesTitulo, C.textos.avaliacoesIntro),
    h('div', { class: 'avaliacoes' }, itens.map(a => h('figure', { class: 'avaliacao' },
      h('blockquote', null, '“', prosa(a.texto), '”'),
      h('figcaption', null, a.autor ? h('strong', null, prosa(a.autor)) : null,
        a.origem ? h('span', null, prosa(a.origem)) : null, a.link ? novoLink(a.link, 'Ver relato original') : null)))));
}

function faq() {
  if (!on('faq') || !C.faq?.length) return null;
  return sec('perguntas', 'sec-faq',
    h('div', { class: 'faq-in' },
      h('div', { class: 'faq-info' }, secHead('perguntas', C.textos.faqTitulo, C.textos.faqIntro),
        waBtn({ texto: C.textos.faqBotao, cls: 'btn--linha' })),
      h('div', { class: 'faq' }, C.faq.map(f =>
        h('details', null,
          h('summary', null, h('span', null, prosa(f.p)), h('span', { class: 'sinal-mais', 'aria-hidden': 'true' })),
          h('p', null, prosa(f.r)))))));
}

function contatos() {
  const tel = telHref();
  return [
    tel ? h('a', { href: tel }, C.contato.telefone) : null,
    C.contato.email ? h('a', { href: 'mailto:' + limpo(C.contato.email) }, C.contato.email) : null
  ].filter(Boolean);
}

function localizacao() {
  if (!on('localizacao')) return null;
  const n = C.negocio, hrs = horarios();
  const info = (nome, desenho, ...texto) => h('div', null, h('dt', null, icon(desenho), nome), h('dd', null, texto));
  const mapa = on('mapa') ? h('div', { class: 'mapa' }, C.links.mapaEmbed
    ? h('iframe', { src: C.links.mapaEmbed, title: 'Mapa com a localização de ' + limpo(n.nome), loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: true })
    : h('div', { class: 'mapa-vazio' }, icon('pin'), h('span', null, '[TROCAR] Mapa da clínica'), novoLink(mapsUrl(), 'Abrir no Google Maps'))) : null;
  return sec('localizacao', 'sec-local',
    h('div', { class: 'local' + (mapa ? ' local--mapa' : '') },
      h('div', { class: 'local-info' },
        secHead('localizacao', C.textos.localTitulo),
        h('dl', { class: 'dados' },
          info('Endereço', 'pin', enderecoLinhas()),
          hrs.length ? info('Horário de atendimento', 'clock', hrs) : null,
          n.acessibilidade ? info('Acessibilidade', 'acesso', prosa(n.acessibilidade)) : null,
          C.convenios?.length ? info('Convênios', 'card', C.convenios.join(', ')) : null),
        h('div', { class: 'local-acoes' }, novoLink(mapsUrl(), 'Ver rota no Google Maps'), contatos())),
      mapa));
}

function consultaRapida() {
  if (!on('consultaRapida')) return null;
  const atualiza = (chave, valor) => { estado[chave] = valor; refreshWa(); };
  const sel = h('select', { id: 'f-trat', onchange: e => atualiza('trat', e.target.value) },
    h('option', { value: '' }, 'Escolha um tratamento'),
    servicosAtivos().map(s => {
      const nome = limpo(fill(s.nome));
      return h('option', { value: nome }, nome);
    }), h('option', { value: 'uma avaliação geral' }, 'Ainda não sei, quero uma avaliação'));
  const grupo = (nome, legenda, opcoes) => h('fieldset', { class: 'grupo' },
    h('legend', null, legenda),
    h('div', { class: 'opcoes' }, opcoes.map(([valor, texto]) => h('label', { class: 'opcao' },
      h('input', { type: 'radio', name: nome, value: valor, onchange: () => atualiza(nome, valor) }),
      h('span', null, texto)))));
  const periodos = (C.periodos || []).filter(Boolean);
  return h('section', { class: 'consulta', id: 'consulta', 'aria-labelledby': 'consulta-t' },
    secHead('consulta', C.textos.consultaTitulo, C.textos.consultaIntro),
    h('div', { class: 'consulta-form' },
      h('div', { class: 'campo' }, h('label', { for: 'f-trat' }, 'Tratamento'), sel),
      h('div', { class: 'consulta-opcoes' },
        periodos.length ? grupo('periodo', 'Período preferido', periodos.map(p => [p, p])) : null,
        grupo('primeira', 'Primeira consulta aqui?', [['sim', 'Sim'], ['nao', 'Já sou paciente']])),
      waBtn({ texto: C.textos.botaoPrincipal })));
}

function ctaFinal() {
  const consulta = consultaRapida();
  return sec('agendar', 'final',
    h('div', { class: 'final-in' + (consulta ? ' final-in--consulta' : '') },
      h('div', { class: 'final-texto' },
        secHead('agendar', C.textos.ctaFinalTitulo, C.textos.ctaFinalTexto),
        consulta ? null : waBtn({ texto: C.textos.botaoPrincipal }),
        h('div', { class: 'final-contato' }, contatos())),
      consulta));
}

function rodape() {
  const f = C.rodape;
  const redes = on('instagram') ? [[C.links.instagram, 'Instagram'], [C.links.facebook, 'Facebook']].filter(([url]) => url) : [];
  $('#rodape').append(h('div', { class: 'container' },
    h('div', { class: 'rodape-in' },
      h('div', null, marca(), f.frase ? h('p', { class: 'rodape-frase' }, prosa(f.frase)) : null),
      h('div', null, h('h2', null, 'Contato'),
        h('ul', { role: 'list' }, h('li', null, registra(novoLink('#', 'Agendar pelo WhatsApp'))),
          contatos().map(link => h('li', null, link)), redes.map(([url, nome]) => h('li', null, novoLink(url, nome))))),
      h('div', null, h('h2', null, 'Endereço e horário'),
        h('ul', { role: 'list' }, h('li', null, enderecoLinhas()),
          horarios().map(hora => h('li', null, hora)), h('li', null, novoLink(mapsUrl(), 'Ver no mapa'))))),
    h('div', { class: 'rodape-registro' },
      registroRT('rt-rodape'),
      h('div', { class: 'rodape-legal' },
        f.razaoSocial ? h('span', null, prosa(f.razaoSocial)) : null,
        f.cnpj ? h('span', { class: 'tnum' }, 'CNPJ ', f.cnpj) : null,
        f.croClinica ? h('span', { class: 'tnum' }, 'Inscrição da clínica: ', f.croClinica) : null)),
    h('div', { class: 'rodape-base' },
      h('span', null, '© ' + new Date().getFullYear(), ' ', C.negocio.nome),
      f.credito ? (f.creditoUrl ? novoLink(f.creditoUrl, f.credito) : h('span', null, f.credito)) : null)));
}

function flutuante() {
  if (!on('botaoFlutuante')) return;
  const a = $('#flutuante');
  a.append(waIcon(), h('span', { class: 'vh' }, C.textos.botaoCurto + ' (abre o WhatsApp em outra aba)'));
  registra(a);
}

let lbI = 0;
function abrirLb(i) { const d = $('#lightbox'); lbI = i; mostrarLb(); if (!d.open) d.showModal(); }
function mostrarLb() {
  const d = $('#lightbox'), it = lbItens[lbI]; if (!it) return;
  const img = $('img', d); img.width = it.w; img.height = it.h; img.src = it.src; img.alt = it.alt;
  $('figcaption', d).textContent = it.legenda || '';
  d.setAttribute('aria-label', 'Galeria de fotos, foto ' + (lbI + 1) + ' de ' + lbItens.length);
}
function iniciarLb() {
  const d = $('#lightbox');
  $('figure', d).prepend(h('img', { alt: '', decoding: 'async' }));
  $('[data-lb=prev]', d).hidden = $('[data-lb=next]', d).hidden = lbItens.length < 2;
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
  const equipeL = (C.equipe || []).filter(p => p && p.nome);
  const o = {
    '@context': 'https://schema.org', '@type': n.tipoSchema || 'Dentist',
    name: limpo(n.nome), description: limpo(fill(C.seo.descricao)), url: abs(C.seo.urlSite),
    image: abs(C.seo.imagemOg) || abs(C.hero.foto) || abs(C.sobre?.foto),
    telephone: numeroPendente ? undefined : '+' + numero,
    email: C.contato.email ? limpo(C.contato.email) : undefined,
    address: { '@type': 'PostalAddress', streetAddress: limpo(n.rua), addressLocality: limpo(n.cidade), addressRegion: limpo(n.uf), postalCode: limpo(n.cep), addressCountry: 'BR' },
    geo: n.coordenadas ? { '@type': 'GeoCoordinates', latitude: n.coordenadas.lat, longitude: n.coordenadas.lng } : undefined,
    hasMap: mapsUrl(),
    openingHoursSpecification: horas.length ? horas : undefined,
    sameAs: [C.links.instagram, C.links.facebook].filter(Boolean),
    hasOfferCatalog: completo && on('servicos') && servicosAtivos().length ? {
      '@type': 'OfferCatalog', name: limpo(fill(C.textos.servicosTitulo)).replaceAll('*', ''),
      itemListElement: servicosAtivos().map(s => ({
        '@type': 'Offer', itemOffered: { '@type': 'Service', name: limpo(fill(s.nome)), description: limpo(fill(s.texto)) || undefined }
      }))
    } : undefined,
    employee: completo && on('equipe') && equipeL.length ? equipeL.map(p => ({ '@type': 'Person', name: limpo(p.nome), jobTitle: limpo(p.especialidade) || undefined, identifier: limpo(p.cro) || undefined })) : undefined
  };
  if (!o.sameAs.length) delete o.sameAs;
  $('#schema-dentista').textContent = JSON.stringify(o);
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
    heroEl.dataset.etapa = p < .17 ? 'abertura' : p < .81 ? 'consulta' : 'encerramento';
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
          end: () => '+=' + Math.round(innerHeight * (innerWidth >= 700 ? 2.2 : 1.55)),
          pin: true, pinSpacing: true, scrub: .6, anticipatePin: 1
        }
      });
    } else if (!podeFixar && tween) {
      tween.scrollTrigger.kill(true);
      tween.kill();
      tween = null;
      atualizar(0);
      delete heroEl.dataset.etapa;
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
      const { createCena } = await import('/dentista/assets/cena-video.js');
      if (atual !== geracao) return;
      cena = createCena(canvas, {
        cena: cenaConfig, estatico: !fixada, quadroFinal: movimento.matches,
        agendarMidia,
        onFinal: src => final.style.setProperty('--quadro-final', src ? 'url(' + JSON.stringify(src) + ')' : 'none')
      });
      const p = tween ? tween.progress() : 0;
      atualizar(p);
      if (!tween) delete heroEl.dataset.etapa;
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
  const dados = [C.whatsapp.mensagem, on('linksServico') && on('servicos') ? C.whatsapp.mensagemServico : '', ...metadados];
  dados.filter(x => visiveis.test(x || '')).forEach(x => pendentes.add(x));
  if (modoLimpo) document.title = limpo(document.title);
  if (previa) {
    let k = -1;
    contador = h('span');
    const bt = h('button', { type: 'button', class: 'previa' },
      h('span', { class: 'previa-ponto', 'aria-hidden': 'true' }), contador,
      h('span', { class: 'vh' }, '. Ir para a próxima pendência'));
    bt.addEventListener('click', () => {
      const marcas = Array.from(document.querySelectorAll('mark.pend, img[data-pendente]')).filter(x => !x.closest('.nav') && getComputedStyle(x).visibility !== 'hidden' && !x.closest('[data-etapa=abertura] .hero-principal,[data-etapa=encerramento] .hero-principal'));
      if (!marcas.length) return;
      k = (k + 1) % marcas.length;
      const alvo = marcas[k], detalhes = alvo.closest('details');
      if (detalhes) detalhes.open = true;
      alvo.scrollIntoView({ block: 'center', behavior: movimento.matches ? 'instant' : 'smooth' });
      alvo.classList.add('pend-foco');
      setTimeout(() => alvo.classList.remove('pend-foco'), 1600);
    });
    document.body.append(bt);
  }
  atualizarPendencias();
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
  const agendar = () => { if (!frame) frame = requestAnimationFrame(atualizar); };
  addEventListener('scroll', agendar, { passive: true });
  addEventListener('resize', agendar, { passive: true });
  addEventListener('pageshow', agendar);
  atualizar();
  document.addEventListener('DOMContentLoaded', iniciarCena, { once: true });
}

function montar() {
  aplicarTema();
  seo();
  add($('#conteudo'), [hero(), fatos(), servicos(), primeiraConsulta(), sobre(),
    equipe(), galeria(), avaliacoes(), faq(), localizacao(), ctaFinal()]);
  const nav = [['tratamentos', 'servicos'], ['equipe', 'equipe'], ['perguntas', 'faq'], ['localizacao', 'local']]
    .filter(([id]) => $('#' + id)).map(([id, k]) => ({ id, label: C.textos.nav[k] }));
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
