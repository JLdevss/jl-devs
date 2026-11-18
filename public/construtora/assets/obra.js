/* ==========================================================================
 * obra.js — a obra que evolui com o scroll (peça central do hero)
 * --------------------------------------------------------------------------
 * ES module, three r170 (somente o core). Tudo procedural, sem assets externos.
 *
 *   createObra(canvas, { quality: 'high'|'low', reducedMotion, frames? })
 *     -> { setProgress(p), resize(), start(), stop(), dispose(), ready, stages: 6 }
 *
 * O estado da cena é FUNÇÃO PURA de p (0..1): não há timeline nem estado
 * acumulado. setProgress(0.3) depois de setProgress(0.9) dá exatamente o
 * mesmo quadro que ir direto a 0.3.
 *
 * TABELA DE JANELAS DE PROGRESSO (ajuste aqui)
 * --------------------------------------------------------------------------
 *  Etapa                     p início  p fim   O que acontece
 *  01 Terreno                0.00      0.16    terreno vazio, escavadeira cavando, gabarito
 *  02 Fundação               0.16      0.33    escavação, sapatas, baldrame, esperas, radier
 *  03 Estrutura              0.33      0.52    pilares, lajes, andaimes sobem
 *  04 Vedações & cobertura   0.52      0.70    paredes, platibanda, casa de máquinas
 *  05 Acabamentos            0.70      0.88    reboco branco, vidros, ripado, portas
 *  06 Entrega                0.88      1.00    calçamento, gramado, vegetação, luzes
 *
 * Cada elemento tem a própria janela [início, fim] no objeto J logo abaixo.
 * ========================================================================== */

import * as THREE from './vendor/three.module.min.js';

/** Etapas (mesma ordem de SITE.etapas). */
export const ETAPAS = [
  { id: 'terreno', de: 0.0, ate: 0.16 },
  { id: 'fundacao', de: 0.16, ate: 0.33 },
  { id: 'estrutura', de: 0.33, ate: 0.52 },
  { id: 'vedacoes', de: 0.52, ate: 0.7 },
  { id: 'acabamentos', de: 0.7, ate: 0.88 },
  { id: 'entrega', de: 0.88, ate: 1.0 },
];

/** Janelas de cada elemento: [entra_início, entra_fim] e, quando some, [sai_início, sai_fim]. */
const J = {
  // 01 Terreno
  gabarito: [0.05, 0.12], gabaritoSai: [0.36, 0.42],
  escavacao: [0.1, 0.17], escavacaoSai: [0.88, 0.92],
  monteTerra: [0.11, 0.18], monteTerraSai: [0.46, 0.52],
  // 02 Fundação
  sapatas: [0.17, 0.23], sapatasSai: [0.3, 0.335], // são "aterradas" quando o radier fecha
  baldrame: [0.21, 0.28],
  esperas: [0.24, 0.3],
  radier: [0.28, 0.335],
  materiais: [0.2, 0.26], materiaisSai: [0.85, 0.89],
  // 03 Estrutura
  pilaresTerreo: [0.34, 0.4],
  laje1: [0.395, 0.44],
  pilaresSuperior: [0.435, 0.48],
  lajeCobertura: [0.475, 0.52],
  andaimes: [0.37, 0.45], andaimesSai: [0.73, 0.8],
  // 04 Vedações & cobertura
  paredesTerreo: [0.52, 0.585],
  paredesSuperior: [0.58, 0.645],
  platibanda: [0.64, 0.68],
  casaMaquinas: [0.655, 0.7],
  // 05 Acabamentos
  pintura: [0.71, 0.79],
  interior: [0.72, 0.78],
  vidros: [0.76, 0.835],
  ripado: [0.8, 0.865],
  portas: [0.82, 0.87],
  guardaCorpo: [0.835, 0.88],
  // 06 Entrega
  calcamento: [0.88, 0.94],
  gramado: [0.895, 0.955],
  vegetacao: [0.925, 0.98],
  luzes: [0.94, 1.0],
  // Escavadeira
  excTrabalha: [0.015, 0.31], // cavando no canteiro (termina antes de a estrutura subir)
  excSai: [0.32, 0.38],       // sai pela direita
  excCruza: [0.5, 0.61],      // cruza o primeiro plano (direita -> esquerda), "cortina"
};

const DOIS_PI = Math.PI * 2;

/* ----------------------------- utilitários ------------------------------ */

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mix(a, b, t) { return a + (b - a) * t; }
function suave(t) { return t * t * (3 - 2 * t); }
/** 0 antes de a, 1 depois de b, suave no meio. */
function janela(p, a, b) {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return suave((p - a) / (b - a));
}
/** Desloca uma janela (para escalonar elementos repetidos). */
function desl(j, d) { return [j[0] + d, j[1] + d]; }

/** PRNG determinístico (mulberry32) — a cena é idêntica a cada carga. */
function prng(semente) {
  let s = semente >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Promessa com resolve/reject expostos. */
function criarPromessa() {
  let resolver, rejeitar;
  const promessa = new Promise((res, rej) => { resolver = res; rejeitar = rej; });
  promessa.catch(() => {}); // evita "unhandled rejection"; o app trata via ready
  return { promessa, resolver, rejeitar };
}

function progressoValido(p) {
  const n = Number(p);
  return Number.isFinite(n) ? clamp01(n) : 0;
}

/* ============================== API pública ============================== */

export function createObra(canvas, opcoes = {}) {
  const quality = opcoes.quality === 'low' ? 'low' : 'high';
  const reducedMotion = !!opcoes.reducedMotion;
  const frames = Array.isArray(opcoes.frames) ? opcoes.frames.filter(Boolean) : [];
  if (frames.length > 0) return criarSequencia(canvas, frames, { quality });
  return criarCena3D(canvas, { quality, reducedMotion });
}

export default createObra;

/** API inerte (quando a criação falha): métodos existem, ready rejeita. */
function apiFalha(erro) {
  const ready = Promise.reject(erro);
  ready.catch(() => {});
  const nada = () => {};
  return { setProgress: nada, resize: nada, start: nada, stop: nada, dispose: nada, ready, stages: 6 };
}

/* ====================== modo "frames" (sequência 2D) ===================== */
/* Para quando houver renders reais: crossfade entre quadros vizinhos.       */

function criarSequencia(canvas, urls, { quality }) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return apiFalha(new Error('obra.js: não foi possível criar o contexto 2D do canvas.'));

  const n = urls.length;
  const imagens = new Array(n).fill(null);
  const estado = new Uint8Array(n); // 0 pendente · 1 carregando · 2 pronto · 3 erro
  const dprMax = quality === 'low' ? 1.25 : 2;
  const pronto = criarPromessa();
  let p = 0, sujo = true, raf = 0, descartado = false, primeiro = false, erros = 0, emCurso = 0;

  // Ordem de carga: primeiro, último, depois uma passada grossa e o restante.
  const fila = [];
  const naFila = new Uint8Array(n);
  function enfileirar(i) { if (i >= 0 && i < n && !naFila[i]) { naFila[i] = 1; fila.push(i); } }
  enfileirar(0); enfileirar(n - 1);
  for (let passo = Math.max(1, n >> 2); passo >= 1; passo = passo >> 1) {
    for (let i = 0; i < n; i += passo) enfileirar(i);
    if (passo === 1) break;
  }

  function carregarProximos() {
    while (!descartado && emCurso < 3 && fila.length) {
      const i = fila.shift();
      const img = new Image();
      img.decoding = 'async';
      estado[i] = 1; emCurso++;
      img.onload = () => { emCurso--; imagens[i] = img; estado[i] = 2; sujo = true; if (!raf) desenhar(); carregarProximos(); };
      img.onerror = () => {
        emCurso--; estado[i] = 3; erros++;
        if (erros === n && !primeiro) pronto.rejeitar(new Error('obra.js: nenhum quadro da sequência pôde ser carregado.'));
        carregarProximos();
      };
      img.src = urls[i];
    }
  }

  /** Quadro pronto mais próximo de i (procura primeiro na direção dir). */
  function maisProximo(i, dir) {
    for (let d = 0; d < n; d++) {
      const a = i + d * dir, b = i - d * dir;
      if (a >= 0 && a < n && estado[a] === 2) return a;
      if (b >= 0 && b < n && estado[b] === 2) return b;
    }
    return -1;
  }

  function cover(img, alfa) {
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const e = Math.max(cw / iw, ch / ih);
    const dw = iw * e, dh = ih * e;
    ctx.globalAlpha = alfa;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function desenhar() {
    if (descartado) return;
    const f = p * (n - 1);
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), t = f - i0;
    const a = maisProximo(i0, -1), b = maisProximo(i1, 1);
    if (a < 0) return; // nada carregado ainda
    cover(imagens[a], 1);
    if (b >= 0 && b !== a && t > 0.001) cover(imagens[b], t);
    ctx.globalAlpha = 1;
    sujo = false;
    if (!primeiro) { primeiro = true; pronto.resolver(); }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    const w = Math.max(1, Math.round((canvas.clientWidth || window.innerWidth) * dpr));
    const h = Math.max(1, Math.round((canvas.clientHeight || window.innerHeight) * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    sujo = true;
    if (!raf) desenhar();
  }

  function laco() { raf = requestAnimationFrame(laco); if (sujo) desenhar(); }

  resize();
  carregarProximos();

  return {
    setProgress(v) { const np = progressoValido(v); if (np !== p) { p = np; sujo = true; if (!raf) desenhar(); } },
    resize,
    start() { if (!raf && !descartado) raf = requestAnimationFrame(laco); },
    stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    dispose() {
      descartado = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      fila.length = 0;
      for (let i = 0; i < n; i++) { if (imagens[i]) { imagens[i].onload = imagens[i].onerror = null; imagens[i] = null; } }
    },
    ready: pronto.promessa,
    stages: 6,
  };
}

/* =========================== modo 3D (padrão) ============================ */

function criarCena3D(canvas, { quality, reducedMotion }) {
  const alta = quality !== 'low';
  const pronto = criarPromessa();

  /* ------------------------------ renderer ------------------------------ */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance',
    });
  } catch (e) {
    return apiFalha(new Error('obra.js: WebGL indisponível neste dispositivo (' + (e && e.message ? e.message : e) + ').'));
  }
  const dprMax = alta ? 2 : 1.25;
  // Teto de pixels desenhados por quadro (só limita a superamostragem acima de 1x:
  // telas grandes de alta densidade não precisam de 8 MP com MSAA).
  const PIXELS_MAX = alta ? 6.0e6 : 2.2e6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // O mapa de sombra só depende de p (a luz é fixa): é refeito em aplicarProgresso,
  // não a cada quadro — quadros só de câmera (parallax) pulam o passe de sombra.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.3, 700);

  // Recursos para liberar no dispose()
  const texturas = [];
  const materiais = [];
  const geometrias = [];
  function M(mat) { materiais.push(mat); return mat; }
  function G(geo) { geometrias.push(geo); return geo; }

  /* ------------------------- céu de fim de tarde ------------------------ */
  // Direção do sol: baixo (~17°), vindo da direita e um pouco da frente,
  // para iluminar a fachada e jogar sombras longas para a esquerda/fundo.
  const DIR_SOL = new THREE.Vector3(0.898, 0.259, 0.357).normalize();
  const COR_HORIZONTE = new THREE.Color(0xf2b27e);

  const matCeu = M(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopo: { value: new THREE.Color(0x12356f) },
      uMeio: { value: new THREE.Color(0x6f9bd0) },
      uHorizonte: { value: COR_HORIZONTE },
      uChao: { value: new THREE.Color(0x6e5a48) },
      uCorSol: { value: new THREE.Color(0xffb46a) },
      uDirSol: { value: DIR_SOL },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = (modelMatrix * vec4(position, 0.0)).xyz;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uTopo; uniform vec3 uMeio; uniform vec3 uHorizonte; uniform vec3 uChao;',
      'uniform vec3 uCorSol; uniform vec3 uDirSol;',
      'varying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y, 0.0, 1.0);',
      '  // gradiente em três paradas: pêssego -> azul claro -> azul profundo',
      '  vec3 cor = mix(uHorizonte, uMeio, smoothstep(0.005, 0.13, h));',
      '  cor = mix(cor, uTopo, smoothstep(0.08, 0.62, h));',
      '  // faixa âmbar no horizonte, mais forte no azimute do sol',
      '  vec2 az = normalize(d.xz + vec2(1e-5));',
      '  vec2 azSol = normalize(uDirSol.xz);',
      '  float lado = pow(max(dot(az, azSol), 0.0), 2.0);',
      '  cor += uCorSol * 0.5 * lado * (1.0 - smoothstep(0.0, 0.2, h));',
      '  cor += uCorSol * 0.12 * pow(lado, 3.0) * (1.0 - smoothstep(0.0, 0.55, h));',
      '  // halo e disco do sol',
      '  float c = max(dot(d, uDirSol), 0.0);',
      '  cor += uCorSol * (0.55 * pow(c, 48.0) + 5.0 * pow(c, 1800.0));',
      '  // abaixo do horizonte: tom de terra (só aparece no envMap)',
      '  cor = mix(cor, uChao, smoothstep(0.0, -0.06, d.y));',
      '  gl_FragColor = vec4(cor, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  }));
  const ceu = new THREE.Mesh(G(new THREE.SphereGeometry(500, 32, 16)), matCeu);
  ceu.frustumCulled = false;
  ceu.renderOrder = -1;

  // envMap (reflexo dos vidros / luz ambiente) gerado a partir do próprio céu
  let alvoEnv = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cenaCeu = new THREE.Scene();
    cenaCeu.add(ceu);
    alvoEnv = pmrem.fromScene(cenaCeu, 0.02, 0.1, 1000);
    scene.environment = alvoEnv.texture;
    scene.environmentIntensity = 0.32;
    pmrem.dispose();
  } catch (e) { /* sem envMap: a cena continua válida, só menos reflexiva */ }
  scene.add(ceu);

  // Névoa leve casando com o horizonte
  scene.fog = new THREE.Fog(new THREE.Color(0xe6b08a), 38, 240);

  /* -------------------------------- luzes ------------------------------- */
  const hemi = new THREE.HemisphereLight(0xa6bde2, 0x7c6855, 1.15);
  scene.add(hemi);

  const sol = new THREE.DirectionalLight(0xffd0a2, 4.3);
  sol.position.copy(DIR_SOL).multiplyScalar(95).add(new THREE.Vector3(2, 0, 8));
  sol.target.position.set(2, 0, 8);
  sol.castShadow = true;
  const tamSombra = alta ? 2048 : 1024;
  sol.shadow.mapSize.set(tamSombra, tamSombra);
  sol.shadow.camera.left = -38; sol.shadow.camera.right = 38;
  sol.shadow.camera.top = 21; sol.shadow.camera.bottom = -11;
  sol.shadow.camera.near = 30; sol.shadow.camera.far = 160;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.03;
  scene.add(sol, sol.target);

  // Luzes internas quentes (acendem na entrega)
  const luzTerreo = new THREE.PointLight(0xffb46b, 0, 14, 2);
  luzTerreo.position.set(4, 2.7, -1.2);
  const luzSuperior = new THREE.PointLight(0xffb46b, 0, 14, 2);
  luzSuperior.position.set(2.5, 5.9, 0.8);
  scene.add(luzTerreo, luzSuperior);

  /* ----------------------- texturas procedurais ------------------------- */
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /** Ruído de pontos em canvas, ladrilhável (pontos na borda são repetidos). */
  function texturaRuido(base, tons, quantidade, semente, repetir, extra, nitida) {
    const T = 512;                 // tamanho lógico (o desenho é sempre o mesmo)
    const R = alta || nitida ? 512 : 256; // tamanho real do canvas: metade em 'low' (menos nas texturas com traço fino)
    const c = document.createElement('canvas');
    c.width = c.height = R;
    const g = c.getContext('2d');
    if (R !== T) g.scale(R / T, R / T);
    g.fillStyle = base;
    g.fillRect(0, 0, T, T);
    const r = prng(semente);
    for (let i = 0; i < quantidade; i++) {
      const x = r() * T, y = r() * T, raio = 0.6 + r() * r() * 9;
      g.fillStyle = 'rgba(' + tons[(r() * tons.length) | 0] + ',' + (0.04 + r() * 0.1).toFixed(3) + ')';
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const px = x + ox * T, py = y + oy * T;
          if (px < -raio || px > T + raio || py < -raio || py > T + raio) continue;
          g.beginPath(); g.arc(px, py, raio, 0, DOIS_PI); g.fill();
        }
      }
    }
    if (extra) extra(g, T, r);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repetir, repetir);
    t.anisotropy = aniso;
    texturas.push(t);
    return t;
  }

  /** Mancha suave (gradiente radial), repetida nas bordas para ladrilhar. */
  function mancha(g, T, x, y, raio, rgb, alfa, ladrilhar) {
    const n = ladrilhar ? 1 : 0;
    for (let ox = -n; ox <= n; ox++) {
      for (let oy = -n; oy <= n; oy++) {
        const px = x + ox * T, py = y + oy * T;
        if (px < -raio || px > T + raio || py < -raio || py > T + raio) continue;
        const gr = g.createRadialGradient(px, py, 0, px, py, raio);
        gr.addColorStop(0, 'rgba(' + rgb + ',' + alfa.toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = gr;
        g.fillRect(px - raio, py - raio, raio * 2, raio * 2);
      }
    }
  }

  // Terra batida: escura e suave — manchas largas + grão fino discreto.
  const texTerra = texturaRuido('#a8937c', ['92,76,60', '186,166,140'], 2600, 11, 30, (g, T, r) => {
    for (let i = 0; i < 90; i++) {
      mancha(g, T, r() * T, r() * T, 40 + r() * 110, r() < 0.55 ? '78,62,48' : '196,176,150', 0.05 + r() * 0.08, true);
    }
  });
  // Gramado escuro e dessaturado
  const texGrama = texturaRuido('#626b52', ['46,54,38', '110,116,88', '74,84,60'], 5000, 23, 1, (g, T, r) => {
    for (let i = 0; i < 40; i++) mancha(g, T, r() * T, r() * T, 50 + r() * 90, r() < 0.5 ? '30,36,26' : '96,100,78', 0.06 + r() * 0.08, true);
  });
  // Calçamento: placas grandes (4 x 4 por ladrilho), tom levemente variado e juntas finas
  const texPiso = texturaRuido('#d2ccc1', ['176,168,156', '236,232,224'], 900, 37, 1, (g, T, r) => {
    const n = 4, l = T / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = r();
        g.fillStyle = v < 0.5 ? 'rgba(90,82,72,' + (0.03 + v * 0.1).toFixed(3) + ')' : 'rgba(255,252,246,' + (v * 0.1).toFixed(3) + ')';
        g.fillRect(i * l, j * l, l, l);
      }
    }
    g.strokeStyle = 'rgba(96,88,78,0.7)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * l, 0); g.lineTo(i * l, T); g.stroke();
      g.beginPath(); g.moveTo(0, i * l); g.lineTo(T, i * l); g.stroke();
    }
  }, true); // juntas de 2 px: mantém 512 também em 'low'
  /** Material com a textura repetida conforme o tamanho real da peça (m por ladrilho). */
  function matLadrilhado(tex, larg, prof, ladrilho, rug) {
    const t = tex.clone();
    t.repeat.set(larg / ladrilho, prof / ladrilho);
    t.needsUpdate = true;
    texturas.push(t);
    return M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rug, metalness: 0, map: t }));
  }

  /** Textura de canvas avulsa (não repetida), para decalques. */
  function texturaDecalque(tam, desenhar) {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    desenhar(c.getContext('2d'), tam);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    texturas.push(t);
    return t;
  }
  /** Plano deitado no chão com decalque transparente (AO falso, rastros, vinheta, poças de luz). */
  function decalque(pai, tex, larg, prof, x, y, z, opacidade, aditivo) {
    const mat = M(new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: opacidade,
      blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    const m = new THREE.Mesh(G(new THREE.PlaneGeometry(larg, prof)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    pai.add(m);
    return m;
  }

  /* ------------------------------ materiais ----------------------------- */
  const COR = {
    concretoCru: new THREE.Color(0x9a9187),
    blocoCru: new THREE.Color(0xa6998a),
    reboco: new THREE.Color(0xece8e0),
    pisoClaro: new THREE.Color(0xd3cdc2),
  };
  function padrao(cor, rug, extra) {
    return M(new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: rug, metalness: 0 }, extra || {})));
  }
  const matTerra = padrao(0xffffff, 1, { map: texTerra });
  const matTerraEscura = padrao(0x8b7459, 1);
  const matEscavacao = padrao(0x6b5843, 1, { transparent: true, opacity: 0, depthWrite: false });
  const matMuro = padrao(0xdbd5c9, 0.92);
  const matArvore = padrao(0xffffff, 0.95);
  const matTronco = padrao(0x4b3b2e, 0.95);
  const matConcreto = padrao(COR.concretoCru.clone(), 0.9);   // estrutura: cru -> reboco
  const matAlvenaria = padrao(COR.blocoCru.clone(), 0.95);    // vedações: bloco -> reboco
  const matRadier = padrao(COR.concretoCru.clone(), 0.9);     // piso: cru -> claro
  const matFundacao = padrao(0x99948b, 0.95);
  const matFerro = padrao(0x6a4634, 0.8);
  const matAndaime = padrao(0x8d9297, 0.5, { metalness: 0.55 });
  const matTabua = padrao(0xb38c5c, 0.85);
  const matMadeira = padrao(0x5a3d29, 0.68);
  const matGrafite = padrao(0x38393b, 0.6, { metalness: 0.25 });
  const matAluminio = padrao(0x2a2c2e, 0.45, { metalness: 0.6 });
  const matVidro = M(new THREE.MeshPhysicalMaterial({
    // vidro escuro reflexivo: cor quase preta, sem metal, IOR alto para refletir o céu
    color: 0x05080a, roughness: 0.07, metalness: 0, ior: 2.3, transparent: true, opacity: 0.9,
    envMapIntensity: 3.2, emissive: 0xff9a48, emissiveIntensity: 0,
  }));
  const matVidroClaro = M(new THREE.MeshPhysicalMaterial({
    color: 0x9fb2b8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.32,
    envMapIntensity: 1.8, depthWrite: false,
  }));
  // interior: o brilho vem de um mapa (luz de teto caindo pelas paredes), não de uma cor chapada
  const texInterior = texturaDecalque(256, (g, S) => {
    g.fillStyle = '#0c0907';
    g.fillRect(0, 0, S, S);
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(255,178,104,0.95)');
    gr.addColorStop(0.35, 'rgba(255,150,80,0.5)');
    gr.addColorStop(1, 'rgba(200,100,50,0.1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    const r = prng(77);
    for (let i = 0; i < 7; i++) mancha(g, S, (i + 0.5 + (r() - 0.5) * 0.5) * (S / 7), S * 0.06, S * (0.12 + r() * 0.08), '255,226,180', 0.75, false);
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(10,7,5,' + (0.25 + r() * 0.3).toFixed(2) + ')'; g.fillRect(r() * S, S * (0.55 + r() * 0.2), S * (0.05 + r() * 0.12), S * 0.5); }
  });
  const matInterior = padrao(0x3a3029, 0.9, { emissive: 0xffffff, emissiveMap: texInterior, emissiveIntensity: 0 });
  const matSebe = padrao(0x34422b, 1);
  const matCopa = padrao(0x4f5a44, 1);
  const matSombraFriso = padrao(0x2a2725, 1);
  const matSpot = padrao(0x2a2725, 0.6, { emissive: 0xffc890, emissiveIntensity: 0 });
  const matAmarelo = padrao(0xe3a312, 0.55);
  const matMaqEscuro = padrao(0x4c4b4a, 0.8);
  const matVidroMaq = padrao(0x10161a, 0.1, { metalness: 0.3, envMapIntensity: 1.6 });
  const matSaco = padrao(0xcbc2b3, 0.95);
  const matBloco = padrao(0xaea79c, 0.95);
  const matLinha = M(new THREE.LineBasicMaterial({ color: 0xf4ecd8, transparent: true, opacity: 0 }));

  /* ------------------------- fábrica de geometria ----------------------- */
  // Caixas reaproveitadas por tamanho. "Âncora" define onde fica a origem:
  // -1 = face mínima, 0 = centro, 1 = face máxima (por eixo). O padrão é a
  // base (y = -1), para o elemento "crescer do chão" com scale.y.
  const cacheCaixas = new Map();
  function geoCaixa(w, h, d, ax, ay, az) {
    const k = w + '|' + h + '|' + d + '|' + ax + '|' + ay + '|' + az;
    let g = cacheCaixas.get(k);
    if (!g) {
      g = G(new THREE.BoxGeometry(w, h, d));
      g.translate((-ax * w) / 2, (-ay * h) / 2, (-az * d) / 2);
      cacheCaixas.set(k, g);
    }
    return g;
  }
  /** Cria uma caixa em (x, y, z) — por padrão y é a BASE. */
  function caixa(pai, mat, w, h, d, x, y, z, anc) {
    const a = anc || [0, -1, 0];
    const m = new THREE.Mesh(geoCaixa(w, h, d, a[0], a[1], a[2]), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    pai.add(m);
    return m;
  }

  /* ------------------- registro de animações por janela ----------------- */
  // modo: 'y' | 'x' | 'z' (escala no eixo, a partir da âncora), 'pop' (escala
  // uniforme) ou 'fade' (opacidade do material — material exclusivo).
  const animacoes = [];
  const SEM_SAIDA = [2, 3];
  function animar(obj, modo, entra, sai, max) {
    const s = sai || SEM_SAIDA;
    animacoes.push({ obj, modo, a: entra[0], b: entra[1], oa: s[0], ob: s[1], max: max === undefined ? 1 : max });
    return obj;
  }

  // Malhas instanciadas (ferragens, andaimes, ripas, árvores...).
  const instanciados = [];
  const _aux = new THREE.Object3D();
  const _cor = new THREE.Color();
  /** itens: { x, y, z, sx, sy, sz, ry?, a?, b?, oa?, ob? } — sem "a" = fixo. */
  /** zerar = true: instância fora da janela some por completo (escala 0), como um Mesh com visible = false. */
  function instanciar(pai, geo, mat, itens, modo, zerar) {
    const malha = new THREE.InstancedMesh(geo, mat, itens.length);
    malha.castShadow = true;
    malha.receiveShadow = true;
    malha.frustumCulled = false;
    let dinamico = false;
    // Limites das janelas do lote: fora deles o resultado é constante e não há o que recalcular.
    let minA = Infinity, maxB = -Infinity, minOa = Infinity, maxOb = -Infinity;
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (it.a === undefined) { it.a = -2; it.b = -1; } else dinamico = true;
      if (it.oa === undefined) { it.oa = 2; it.ob = 3; }
      if (it.ry === undefined) it.ry = 0;
      if (it.a < minA) minA = it.a;
      if (it.b > maxB) maxB = it.b;
      if (it.oa < minOa) minOa = it.oa;
      if (it.ob > maxOb) maxOb = it.ob;
    }
    let trecho = -2; // 0 = nada entrou · 1 = tudo no lugar · 2 = tudo saiu · -1 = em transição
    function atualizar(p) {
      const tr = p <= minA ? 0 : p >= maxOb ? 2 : (p >= maxB && p <= minOa) ? 1 : -1;
      if (tr !== -1 && tr === trecho) return; // mesmo trecho constante: matrizes já estão certas
      trecho = tr;
      let algum = false;
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i];
        const t = janela(p, it.a, it.b) * (1 - janela(p, it.oa, it.ob));
        if (t > 0.002) algum = true;
        const s = t > 0.001 ? t : 0.001;
        _aux.position.set(it.x, it.y, it.z);
        _aux.rotation.set(0, it.ry, 0);
        if (zerar && t <= 0.002) _aux.scale.set(0, 0, 0);
        else if (modo === 'pop') _aux.scale.set(it.sx * s, it.sy * s, it.sz * s);
        else _aux.scale.set(it.sx, it.sy * s, it.sz);
        _aux.updateMatrix();
        malha.setMatrixAt(i, _aux.matrix);
      }
      malha.instanceMatrix.needsUpdate = true;
      malha.visible = algum;
    }
    atualizar(0);
    if (dinamico) {
      malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanciados.push(atualizar);
    }
    pai.add(malha);
    return malha;
  }

  // Lotes de caixas: peças que compartilham material e modo de animação viram UMA
  // malha instanciada (1 draw call por passe em vez de 1 por peça). A geometria é
  // um cubo unitário ancorado na base; o tamanho vai na matriz da instância.
  function lote() { return []; }
  /** Mesmo contrato de caixa() + animar(): (w, h, d) em (x, base y, z), janela de entrada e de saída. */
  function noLote(itens, w, h, d, x, y, z, entra, sai) {
    const s = sai || SEM_SAIDA;
    itens.push({ x, y, z, sx: w, sy: h, sz: d, a: entra[0], b: entra[1], oa: s[0], ob: s[1] });
  }
  function fecharLote(pai, mat, itens, modo) {
    return instanciar(pai, geoCaixa(1, 1, 1, 0, -1, 0), mat, itens, modo || 'y', true);
  }

  /* =========================== TERRENO (fixo) =========================== */
  // Sistema: Y para cima, a fachada da casa olha para +Z (câmera), +X é a direita.
  const chao = new THREE.Mesh(G(new THREE.PlaneGeometry(520, 520)), matTerra);
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  scene.add(chao);

  // Muro baixo claro ao fundo
  caixa(scene, matMuro, 150, 1.9, 0.35, 5, 0, -24);
  caixa(scene, matMuro, 150.3, 0.08, 0.5, 5, 1.9, -24);

  // Rastros de máquina e manchas largas no terreno (decalque único, não repetido)
  (function marcasNoTerreno() {
    const AREA = 128; // metros cobertos pelo decalque, centrado na origem
    const tex = texturaDecalque(alta ? 2048 : 1024, (g, S) => {
      const e = S / AREA; // px por metro
      const X = (x) => (x + AREA / 2) * e, Z = (z) => (z + AREA / 2) * e;
      const r = prng(91);
      // manchas largas (umidade / terra remexida)
      for (let i = 0; i < 70; i++) {
        const x = -55 + r() * 100, z = -22 + r() * 70;
        mancha(g, S, X(x), Z(z), (3 + r() * 9) * e, r() < 0.7 ? '30,20,12' : '176,150,120', 0.05 + r() * 0.13, false);
      }
      // rastros de esteira: dois sulcos paralelos ao longo de curvas suaves
      function rastro(pts, alfa) {
        for (let lado = -1; lado <= 1; lado += 2) {
          for (let passada = 0; passada < 2; passada++) {
            g.beginPath();
            for (let i = 0; i < pts.length; i++) {
              const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
              const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
              const px = X(pts[i][0] - (dz / d) * 0.98 * lado), pz = Z(pts[i][1] + (dx / d) * 0.98 * lado);
              if (i === 0) g.moveTo(px, pz); else g.lineTo(px, pz);
            }
            g.lineJoin = 'round';
            if (passada === 0) { // sulco largo e difuso
              g.setLineDash([]);
              g.strokeStyle = 'rgba(28,18,10,' + alfa + ')';
              g.lineWidth = 0.62 * e;
            } else {             // marcas das sapatas da esteira
              g.setLineDash([0.16 * e, 0.2 * e]);
              g.strokeStyle = 'rgba(20,12,6,' + alfa * 0.9 + ')';
              g.lineWidth = 0.5 * e;
            }
            g.stroke();
          }
        }
        g.setLineDash([]);
      }
      function curva(p0, p1, p2, n) { // Bézier quadrática amostrada
        const o = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, u = 1 - t;
          o.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
        }
        return o;
      }
      rastro(curva([-1.6, 3.4], [10, 9.5], [44, 8.4], 40), 0.2);     // saída pela direita
      rastro(curva([14, 24.6], [-10, 24.6], [-50, 24.6], 30), 0.17); // travessia do primeiro plano
      rastro(curva([-48, 30], [-20, 12], [-3, 4.5], 40), 0.15);      // chegada ao canteiro
      rastro(curva([-40, 2], [-22, 20], [6, 34], 40), 0.1);          // manobra antiga
    });
    const d = decalque(scene, tex, AREA, AREA, 0, 0.006, 0, 1, false);
    d.renderOrder = 1;
  })();

  // Vinheta no chão: escurece o primeiro plano (vale para terra, gramado e calçamento)
  (function vinheta() {
    const tex = texturaDecalque(256, (g, S) => {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(18,12,8,0)');
      gr.addColorStop(0.45, 'rgba(18,12,8,0.1)');
      gr.addColorStop(1, 'rgba(18,12,8,0.36)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    });
    const d = decalque(scene, tex, 160, 44, -10, 0.09, 30, 1, false); // z de 8 a 52
    d.renderOrder = 3;
  })();

  // Ciprestes esguios e escuros ao longe (silhuetas irregulares, quase sem verde)
  (function arvores() {
    const r = prng(5);
    const copasItens = [];
    const troncos = [];
    const tons = [];
    function cipreste(x, z, h, gordura) {
      const raio = h * (0.075 + r() * 0.03) * (gordura || 1);
      copasItens.push({ x, y: 0.35, z, sx: raio * (0.85 + r() * 0.3), sy: h, sz: raio * (0.85 + r() * 0.3), ry: r() * 6 });
      troncos.push({ x, y: 0, z, sx: 0.11, sy: 0.6, sz: 0.11 });
      tons.push(0.75 + r() * 0.5);
    }
    // grupos irregulares bem atrás do muro (a névoa atenua)
    const passo = alta ? 9 : 17;
    for (let x = -70; x < 125; x += passo * (0.6 + r() * 1.0)) {
      const z = -38 - r() * 40;
      const n = 1 + ((r() * 3) | 0);
      for (let k = 0; k < n; k++) cipreste(x + k * (1.2 + r() * 1.6), z - k * r() * 2.5, 7.5 + r() * 5.5);
    }
    // poucas mais próximas, fora do miolo do quadro
    cipreste(-34, -15, 9.5);
    cipreste(-36.4, -17.5, 7.6);
    cipreste(32, -14, 10);
    // à direita, FORA do enquadramento: só para lançar sombras longas no primeiro plano
    // (em grupos mais cheios, para a sombra chegar em faixas largas e irregulares)
    cipreste(17, 27, 9, 1.5); cipreste(18.6, 28.4, 10.5, 1.6); cipreste(16.2, 29.3, 8, 1.4);
    cipreste(19.5, 19, 10.5, 1.6); cipreste(21.3, 20.2, 9, 1.5); cipreste(20.4, 17.4, 8, 1.3);
    cipreste(23, 12.5, 8.5, 1.4); cipreste(24.6, 13.8, 10, 1.5);

    // perfil em fuso (torneado), com leve irregularidade
    const perfil = [[0, 0], [0.5, 0.03], [0.86, 0.13], [1, 0.27], [0.93, 0.42], [0.98, 0.5], [0.76, 0.66], [0.55, 0.8], [0.26, 0.93], [0, 1]]
      .map((q) => new THREE.Vector2(q[0], q[1]));
    const geoCipreste = G(new THREE.LatheGeometry(perfil, 9));
    const geoTronco = G(new THREE.CylinderGeometry(1, 1.15, 1, 6));
    geoTronco.translate(0, 0.5, 0);
    const copas = instanciar(scene, geoCipreste, matArvore, copasItens, 'y');
    for (let i = 0; i < copasItens.length; i++) {
      _cor.setRGB(0.017 * tons[i], 0.026 * tons[i], 0.02 * tons[i]);
      copas.setColorAt(i, _cor);
    }
    if (copas.instanceColor) copas.instanceColor.needsUpdate = true;
    instanciar(scene, geoTronco, matTronco, troncos, 'y');
  })();

  /* ============================== CANTEIRO ============================== */
  const canteiro = new THREE.Group();
  scene.add(canteiro);

  // Níveis e eixos da casa (metros)
  const PISO = 0.35;          // topo do radier
  const PE = 3.0;             // pé-direito
  const Y_LAJE1 = PISO + PE;  // 3.35 base da laje do pavimento superior
  const Y_SUP = Y_LAJE1 + 0.3; // 3.65 piso superior
  const Y_COB = Y_SUP + PE;   // 6.65 base da laje de cobertura
  const Y_TOPO = Y_COB + 0.3; // 6.95

  // Posições dos pilares (x, z)
  const PIL_TERREO = [
    [0.15, -6.85], [4.5, -6.85], [9.85, -6.85], [0.15, -3], [9.85, -3],
    [0.15, 0.85], [4.5, 0.85], [9.85, 0.85], [14.35, -6.85], [14.35, -0.65],
  ];
  const PIL_SUPERIOR = [
    [-1.35, -6.85], [4.5, -6.85], [9.85, -6.85], [-1.35, -2], [9.85, -2],
    [-1.35, 2.85], [4.5, 2.85], [9.85, 2.85],
  ];

  // --- 01 · gabarito: estacas + linhas de marcação -----------------------
  (function gabarito() {
    const x0 = -1.4, x1 = 15.9, z0 = -8.4, z1 = 2.4, y = 0.55;
    const pts = [
      x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0, // retângulo
      4.5, y, z0, 4.5, y, z1, x0, y, -3, x1, y, -3, 9.85, y, z0, 9.85, y, z1,                 // eixos
    ];
    const geo = G(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const linhas = new THREE.LineSegments(geo, matLinha);
    canteiro.add(linhas);
    animar(linhas, 'fade', J.gabarito, J.gabaritoSai, 0.9);

    const pos = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [4.5, z0], [4.5, z1], [x0, -3], [x1, -3], [9.85, z0], [9.85, z1]];
    const itens = pos.map((q, i) => ({
      x: q[0], y: 0, z: q[1], sx: 1, sy: 1, sz: 1,
      a: J.gabarito[0] - 0.02 + i * 0.004, b: J.gabarito[0] + 0.02 + i * 0.004,
      oa: J.gabaritoSai[0], ob: J.gabaritoSai[1],
    }));
    instanciar(canteiro, geoCaixa(0.06, 0.8, 0.06, 0, -1, 0), matTabua, itens, 'y');
  })();

  // --- 01/02 · escavação (terra revolvida) e monte de terra ---------------
  const escavacao = new THREE.Mesh(G(new THREE.PlaneGeometry(16.6, 10)), matEscavacao);
  escavacao.rotation.x = -Math.PI / 2;
  escavacao.position.set(7.25, 0.015, -3);
  escavacao.receiveShadow = true;
  canteiro.add(escavacao);
  animar(escavacao, 'fade', J.escavacao, J.escavacaoSai, 0.85);

  const geoMonte = G(new THREE.SphereGeometry(1, 14, 8, 0, DOIS_PI, 0, Math.PI / 2));
  function monte(x, z, sx, sy, sz, atraso) {
    const m = new THREE.Mesh(geoMonte, matTerraEscura);
    m.position.set(x, 0, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    canteiro.add(g);
    animar(g, 'y', desl(J.monteTerra, atraso), J.monteTerraSai);
  }
  monte(-4.6, -3.2, 2.4, 1.15, 1.8, 0);
  monte(-3.4, -5.4, 1.7, 0.8, 1.4, 0.02);

  // --- 02 · fundação: sapatas, vigas baldrame, esperas, radier -----------
  const loteFundacao = lote();
  PIL_TERREO.forEach((q, i) => {
    noLote(loteFundacao, 1.1, 0.24, 1.1, q[0], 0, q[1], desl(J.sapatas, i * 0.004), J.sapatasSai);
  });
  [
    [14.5, 0.3, 7.25, -6.85], [10, 0.3, 5, 0.85], [4.5, 0.3, 12.25, -0.65], [10, 0.3, 5, -3], // ao longo de X
    [0.3, 8, 0.15, -3], [0.3, 8, 4.5, -3], [0.3, 8, 9.85, -3], [0.3, 6.5, 14.35, -3.75],      // ao longo de Z
  ].forEach((v, i) => {
    noLote(loteFundacao, v[0], 0.3, v[1], v[2], 0, v[3], desl(J.baldrame, i * 0.005));
  });
  fecharLote(canteiro, matFundacao, loteFundacao);

  (function esperas() {
    const itens = [];
    PIL_TERREO.forEach((q, i) => {
      for (let k = 0; k < 4; k++) {
        itens.push({
          x: q[0] + (k % 2 ? 0.09 : -0.09), y: 0, z: q[1] + (k < 2 ? 0.09 : -0.09),
          sx: 1, sy: 1.25 + ((i * 7 + k * 3) % 5) * 0.05, sz: 1,
          a: J.esperas[0] + i * 0.004, b: J.esperas[0] + 0.03 + i * 0.004,
        });
      }
    });
    const geo = G(new THREE.CylinderGeometry(0.014, 0.014, 1, 5));
    geo.translate(0, 0.5, 0);
    instanciar(canteiro, geo, matFerro, itens, 'y');
  })();

  // radier (laje de piso) — casa + garagem
  animar(caixa(canteiro, matRadier, 14.9, PISO, 8.4, 7.25, 0, -3), 'y', J.radier);

  // --- pilha de materiais (some na entrega) ------------------------------
  (function materiaisDeObra() {
    const g = new THREE.Group();
    g.position.set(13.2, 0, 5.2);
    g.rotation.y = -0.25;
    canteiro.add(g);
    for (let i = 0; i < 9; i++) { // sacos de cimento
      const nivel = (i / 3) | 0, col = i % 3;
      const s = caixa(g, matSaco, 0.62, 0.16, 0.42, -1.1 + col * 0.66 + (nivel % 2) * 0.08, nivel * 0.165, 0);
      s.rotation.y = ((i * 37) % 7 - 3) * 0.02;
    }
    caixa(g, matBloco, 1.2, 0.9, 1.0, 1.25, 0.12, -0.15);       // palete de blocos
    caixa(g, matTabua, 1.3, 0.12, 1.1, 1.25, 0, -0.15);          // palete
    const t1 = caixa(g, matTabua, 3.2, 0.05, 0.22, 0.1, 0, 1.2); // tábuas
    t1.rotation.y = 0.1;
    caixa(g, matTabua, 3.2, 0.05, 0.22, 0.2, 0.05, 1.25);
    caixa(g, matTabua, 3.2, 0.05, 0.22, 0.05, 0, 1.5);
    animar(g, 'pop', J.materiais, J.materiaisSai);
  })();

  /* ================================ CASA ================================ */
  const casa = new THREE.Group();
  scene.add(casa);

  // --- 03 · estrutura: pilares e lajes (concreto) -------------------------
  const loteConcreto = lote();
  PIL_TERREO.forEach((q, i) => {
    noLote(loteConcreto, 0.28, PE, 0.28, q[0], PISO, q[1], desl(J.pilaresTerreo, i * 0.003));
  });
  // lajes do 1º pavimento (casa em balanço à frente/esquerda; garagem = terraço)
  noLote(loteConcreto, 11.8, 0.3, 10.3, 4.25, Y_LAJE1, -2, J.laje1);
  noLote(loteConcreto, 4.5, 0.3, 6.8, 12.4, Y_LAJE1, -3.75, desl(J.laje1, 0.008));
  PIL_SUPERIOR.forEach((q, i) => {
    noLote(loteConcreto, 0.28, PE, 0.28, q[0], Y_SUP, q[1], desl(J.pilaresSuperior, i * 0.003));
  });
  noLote(loteConcreto, 11.8, 0.3, 10.3, 4.25, Y_COB, -2, J.lajeCobertura);
  fecharLote(casa, matConcreto, loteConcreto);

  // --- 04 · vedações (alvenaria) ------------------------------------------
  // [largura X, altura, profundidade Z, x, base y, z]
  const PAREDES_TERREO = [
    [10, PE, 0.3, 5, PISO, -6.85],        // fundos
    [0.3, PE, 8, 0.15, PISO, -3],         // lateral esquerda
    [0.3, PE, 8, 9.85, PISO, -3],         // lateral direita (divisa com a garagem)
    [3, PE, 0.3, 8.5, PISO, 0.85],        // frente (trecho da porta de entrada)
    [4.5, PE, 0.3, 12.25, PISO, -6.85],   // garagem fundos
    [0.3, PE, 6.5, 14.35, PISO, -3.75],   // garagem lateral
    [0.3, 2.6, 0.3, 10.15, PISO, -0.65],  // garagem ombreira
    [4.5, 0.4, 0.3, 12.25, PISO + 2.6, -0.65], // garagem verga
  ];
  const PAREDES_SUPERIOR = [
    [11.5, PE, 0.3, 4.25, Y_SUP, -6.85],  // fundos
    [0.3, PE, 2, -1.35, Y_SUP, -6],       // lateral esquerda (antes do rasgo de vidro)
    [0.3, PE, 6.5, -1.35, Y_SUP, -0.25],  // lateral esquerda (depois do rasgo)
    [0.3, PE, 5, 9.85, Y_SUP, -4.5],      // lateral direita
    [5, PE, 0.3, 7.5, Y_SUP, 2.85],       // frente (volume cego em balanço)
  ];
  const loteAlvenaria = lote();
  PAREDES_TERREO.forEach((w, i) => {
    noLote(loteAlvenaria, w[0], w[1], w[2], w[3], w[4], w[5], desl(J.paredesTerreo, i * 0.004));
  });
  PAREDES_SUPERIOR.forEach((w, i) => {
    noLote(loteAlvenaria, w[0], w[1], w[2], w[3], w[4], w[5], desl(J.paredesSuperior, i * 0.005));
  });
  // platibandas (cobertura e terraço da garagem)
  [
    [11.6, 0.5, 0.2, 4.25, Y_TOPO, 3.0], [11.6, 0.5, 0.2, 4.25, Y_TOPO, -7.0],
    [0.2, 0.5, 9.8, -1.5, Y_TOPO, -2], [0.2, 0.5, 9.8, 10.0, Y_TOPO, -2],
    [4.3, 0.25, 0.2, 12.4, Y_SUP, -7.0],
  ].forEach((w, i) => {
    noLote(loteAlvenaria, w[0], w[1], w[2], w[3], w[4], w[5], desl(J.platibanda, i * 0.004));
  });
  // casa de máquinas / caixa d'água sobre a cobertura
  noLote(loteAlvenaria, 2.4, 1.15, 2.4, 7.6, Y_TOPO, -5.2, J.casaMaquinas);
  fecharLote(casa, matAlvenaria, loteAlvenaria);

  // --- 03→05 · andaimes (sobem na estrutura, somem nos acabamentos) -------
  (function andaimes() {
    const postes = [], travessas = [], pranchas = [];
    const NIVEIS = [2.0, 4.0, 6.0, 7.7];
    const ALTURA = 7.9, VAO = 1.8;
    // Uma "linha" de andaime: n vãos a partir de (x, z) na direção (dx, dz),
    // com a segunda fileira de postes deslocada por (nx, nz).
    function linha(x, z, dx, dz, nx, nz, n, atraso) {
      const ry = dx ? 0 : -Math.PI / 2; // travessas são caixas ao longo de +X
      for (let i = 0; i <= n; i++) {
        const k = atraso + (i / n) * 0.035;
        const a = J.andaimes[0] + k, b = J.andaimes[1] + k;
        const oa = J.andaimesSai[0] + (0.035 - (i / n) * 0.035) + atraso, ob = oa + 0.04;
        const px = x + dx * VAO * i, pz = z + dz * VAO * i;
        for (let f = 0; f < 2; f++) {
          postes.push({ x: px + nx * f * 0.8, y: 0, z: pz + nz * f * 0.8, sx: 1, sy: ALTURA, sz: 1, a, b, oa, ob });
        }
        for (let l = 0; l < NIVEIS.length; l++) {
          const jl = l * 0.006;
          // travessa curta entre as duas fileiras
          travessas.push({
            x: px, y: NIVEIS[l], z: pz, sx: 0.8, sy: 1, sz: 1, ry: nx ? Math.PI : -Math.PI / 2,
            a: a + jl, b: b + jl, oa, ob,
          });
          // longarinas até o próximo poste
          if (i < n) {
            for (let f = 0; f < 2; f++) {
              travessas.push({
                x: px + nx * f * 0.8, y: NIVEIS[l], z: pz + nz * f * 0.8, sx: VAO, sy: 1, sz: 1, ry,
                a: a + jl, b: b + jl, oa, ob,
              });
            }
            // prancha de piso (menos no último nível, que é só guarda-corpo)
            if (l < 3) {
              pranchas.push({
                x: px + nx * 0.4 + dx * VAO * 0.5, y: NIVEIS[l] + 0.03, z: pz + nz * 0.4 + dz * VAO * 0.5,
                sx: dx ? VAO : 0.72, sy: 1, sz: dx ? 0.72 : VAO,
                a: a + jl + 0.01, b: b + jl + 0.01, oa, ob,
              });
            }
          }
        }
      }
    }
    linha(-2.5, 3.6, 1, 0, 0, 1, 7, 0);       // fachada frontal
    linha(-2.05, -7.4, 0, 1, -1, 0, 6, 0.01); // lateral esquerda

    const geoPoste = G(new THREE.CylinderGeometry(0.028, 0.028, 1, 6));
    geoPoste.translate(0, 0.5, 0);
    instanciar(casa, geoPoste, matAndaime, postes, 'y');
    // travessas "abrem" a partir de uma ponta: usa 'pop' com caixa ancorada em x mínimo
    instanciar(casa, geoCaixa(1, 0.045, 0.045, -1, 0, 0), matAndaime, travessas, 'pop');
    instanciar(casa, geoCaixa(1, 0.04, 1, 0, -1, 0), matTabua, pranchas, 'pop');
  })();

  // --- 05 · acabamentos ----------------------------------------------------
  // interior (painéis que recebem a luz quente no final)
  animar(caixa(casa, matInterior, 9.3, PE, 0.1, 5, PISO, -3.2), 'y', J.interior);
  animar(caixa(casa, matInterior, 10.6, PE, 0.1, 4.2, Y_SUP, -1.6), 'y', desl(J.interior, 0.01));
  animar(caixa(casa, matInterior, 0.1, PE, 4.4, 6.4, Y_SUP, 0.5), 'y', desl(J.interior, 0.015));

  // panos de vidro escuro [w, h, d, x, y, z]
  [
    [4.06, PE, 0.04, 2.33, PISO, 0.85],      // térreo frente A
    [2.36, PE, 0.04, 5.82, PISO, 0.85],      // térreo frente B
    [5.57, PE, 0.04, 1.575, Y_SUP, 2.85],    // superior frente (atrás do ripado)
    [0.04, PE, 4.57, 9.85, Y_SUP, 0.425],    // superior lateral -> terraço
    [0.04, PE, 1.5, -1.35, Y_SUP, -4.25],    // rasgo vertical na lateral esquerda
  ].forEach((v, i) => {
    animar(caixa(casa, matVidro, v[0], v[1], v[2], v[3], v[4], v[5]), 'y', desl(J.vidros, i * 0.008));
  });
  // montantes de alumínio escuro
  const loteAluminio = lote();
  [
    [0.33, PISO, 0.85, 0], [1.68, PISO, 0.85, 0], [3.03, PISO, 0.85, 0], [5.82, PISO, 0.85, 0], [6.97, PISO, 0.85, 0],
    [0.2, Y_SUP, 2.85, 0], [1.6, Y_SUP, 2.85, 0], [3.0, Y_SUP, 2.85, 0],
    [9.85, Y_SUP, -0.35, 1], [9.85, Y_SUP, 1.2, 1], [9.85, Y_SUP, 2.68, 1],
  ].forEach((v, i) => {
    if (v[3]) noLote(loteAluminio, 0.1, PE, 0.06, v[0], v[1], v[2], desl(J.vidros, 0.004 + i * 0.004));
    else noLote(loteAluminio, 0.06, PE, 0.1, v[0], v[1], v[2], desl(J.vidros, 0.004 + i * 0.004));
  });

  // ripado de madeira no pavimento superior (brise na frente do vidro)
  (function ripado() {
    const itens = [];
    const n = 21;
    for (let i = 0; i < n; i++) {
      const a = J.ripado[0] + (i / n) * (J.ripado[1] - J.ripado[0] - 0.02);
      itens.push({ x: -1.12 + i * 0.19, y: Y_SUP + 0.04, z: 3.06, sx: 1, sy: 1, sz: 1, a, b: a + 0.02 });
    }
    instanciar(casa, geoCaixa(0.07, PE - 0.08, 0.13, 0, -1, 0), matMadeira, itens, 'y');
  })();

  // portas: entrada (madeira) e garagem (painel ripado escuro)
  animar(caixa(casa, matMadeira, 1.15, 2.5, 0.08, 8.3, PISO, 1.02), 'y', J.portas);
  noLote(loteAluminio, 0.04, 0.9, 0.06, 7.9, PISO + 0.8, 1.09, desl(J.portas, 0.01)); // puxador
  fecharLote(casa, matAluminio, loteAluminio);
  animar(caixa(casa, matGrafite, 3.9, 2.6, 0.1, 12.25, PISO, -0.62), 'y', desl(J.portas, 0.01));

  // guarda-corpo de vidro no terraço (sobre a garagem) + corrimão
  animar(caixa(casa, matVidroClaro, 4.45, 1.05, 0.03, 12.4, Y_SUP, -0.45), 'y', J.guardaCorpo);
  animar(caixa(casa, matVidroClaro, 0.03, 1.05, 6.6, 14.55, Y_SUP, -3.75), 'y', desl(J.guardaCorpo, 0.008));
  animar(caixa(casa, matAluminio, 4.5, 0.04, 0.06, 12.4, Y_SUP + 1.05, -0.45), 'pop', desl(J.guardaCorpo, 0.012));
  animar(caixa(casa, matAluminio, 0.06, 0.04, 6.65, 14.55, Y_SUP + 1.05, -3.75), 'pop', desl(J.guardaCorpo, 0.016));

  /* ======================= 06 · ENTREGA: paisagismo ===================== */
  const paisagismo = new THREE.Group();
  scene.add(paisagismo);
  // Pátio de placas grandes à frente da casa: "desenrola" da casa para a rua (+Z).
  const ANC_Z = [0, -1, -1];
  function piso(larg, prof, x, z, anc, modo, jan) {
    return animar(caixa(paisagismo, matLadrilhado(texPiso, larg, prof, 9.6, 0.88), larg, 0.07, prof, x, 0, z, anc), modo, jan);
  }
  function grama(larg, prof, x, z, anc, modo, jan, alt) {
    return animar(caixa(paisagismo, matLadrilhado(texGrama, larg, prof, 7, 1), larg, alt || 0.045, prof, x, 0, z, anc), modo, jan);
  }
  piso(17.2, 3.2, 6.6, 1.2, ANC_Z, 'z', J.calcamento);                // varanda sob o balanço
  piso(37.2, 41.6, -3.4, 4.4, ANC_Z, 'z', desl(J.calcamento, 0.006)); // pátio até o primeiro plano
  // faixas de gramado escuro nas laterais (abrem a partir da casa)
  grama(45, 16.4, -0.2, -12, [1, -1, -1], 'x', J.gramado);            // lateral esquerda
  grama(38, 41.6, -22, 4.4, [1, -1, -1], 'x', desl(J.gramado, 0.01)); // além do pátio, à esquerda
  grama(30, 58, 15.2, -12, [-1, -1, -1], 'x', desl(J.gramado, 0.005)); // lateral direita
  grama(9, 6, -9.5, 9, ANC_Z, 'y', desl(J.gramado, 0.02), 0.14);      // canteiro elevado no pátio

  (function vegetacao() {
    const v0 = J.vegetacao[0];
    // sebes baixas, verde bem escuro
    const sebes = [
      { x: 2.6, y: 0.06, z: 4.75, sx: 9.0, sy: 0.5, sz: 0.55, a: v0, b: v0 + 0.035 },         // frente da varanda
      { x: 15.75, y: 0.04, z: 3.0, sx: 0.55, sy: 0.5, sz: 6.4, a: v0 + 0.01, b: v0 + 0.045 }, // ao lado do acesso
      { x: -6.5, y: 0.04, z: -4.5, sx: 0.55, sy: 0.7, sz: 5.5, a: v0 + 0.015, b: v0 + 0.05 }, // lateral esquerda
    ];
    instanciar(paisagismo, geoCaixa(1, 1, 1, 0, -1, 0), matSebe, sebes, 'y');

    // duas oliveiras de copa arredondada (várias esferas achatadas) + arbustos baixos
    const copas = [];
    const caules = [];
    const BOLHAS = [[0, 3.15, 0, 1.55, 0.95], [1.05, 2.95, 0.3, 1.0, 0.7], [-1.0, 3.05, -0.25, 1.05, 0.72], [0.1, 3.5, -0.6, 0.95, 0.6]];
    function oliveira(x, z, e, base, atraso) {
      const a = v0 + atraso;
      caules.push({ x, y: base, z, sx: 0.13 * e, sy: 2.6 * e, sz: 0.13 * e, a, b: a + 0.03 });
      BOLHAS.forEach((q, i) => {
        copas.push({
          x: x + q[0] * e, y: base + q[1] * e, z: z + q[2] * e, sx: q[3] * e, sy: q[4] * e, sz: q[3] * e, ry: i * 1.3,
          a: a + 0.012 + i * 0.004, b: a + 0.045 + i * 0.004,
        });
      });
    }
    function arbusto(x, z, raio, base, atraso) {
      const a = v0 + atraso;
      copas.push({ x, y: base + raio * 0.5, z, sx: raio, sy: raio * 0.62, sz: raio, a, b: a + 0.03 });
    }
    oliveira(-5.2, -2.6, 0.9, 0.04, 0.012); // lateral esquerda, junto à casa
    arbusto(-12.4, 10.6, 0.6, 0.14, 0.016);
    arbusto(-7.0, 13.6, 0.5, 0.14, 0.02);
    arbusto(-11.6, 13.4, 0.42, 0.14, 0.024);
    const geoCaule = G(new THREE.CylinderGeometry(0.75, 1, 1, 7));
    geoCaule.translate(0, 0.5, 0);
    instanciar(paisagismo, geoCaule, matTronco, caules, 'y');
    // copa orgânica: esfera com a superfície deformada (silhueta irregular, sem cara de "bola")
    const geoCopa = G(new THREE.SphereGeometry(1, 28, 18));
    const pos = geoCopa.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 1 + 0.07 * Math.sin(3.1 * x + 1.3) * Math.sin(2.7 * y + 0.4) + 0.05 * Math.sin(3.3 * z + 1.6 * x);
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geoCopa.computeVertexNormals();
    instanciar(paisagismo, geoCopa, matCopa, copas, 'pop');
  })();

  /* ---------------- detalhes de realismo: AO falso, frisos, spots -------- */
  // Sombra de contato sob a casa (retângulo difuso), entra junto com o radier.
  (function sombraDeContato() {
    const tex = texturaDecalque(256, (g, S) => {
      g.shadowColor = 'rgba(8,5,3,0.95)';
      g.shadowBlur = S * 0.11;
      g.fillStyle = 'rgba(8,5,3,0.75)';
      g.fillRect(S * 0.2, S * 0.2, S * 0.6, S * 0.6);
    });
    // área interna do decalque (60%) = projeção da casa com os balanços
    const d = decalque(scene, tex, 17.2 / 0.6, 10.6 / 0.6, 6.5, 0.08, -1.9, 0, false);
    d.renderOrder = 2;
    animar(d, 'fade', J.radier, null, 0.8);
  })();

  // Frisos de sombra sob as bordas das lajes (negativo/pingadeira).
  (function frisos() {
    const itens = lote();
    function anel(cx, cz, larg, prof, y, jan) {
      const e = 0.09, r = 0.03; // espessura e recuo em relação à borda da laje
      noLote(itens, larg - 2 * r, 0.035, e, cx, y, cz + prof / 2 - r - e / 2, jan);
      noLote(itens, larg - 2 * r, 0.035, e, cx, y, cz - prof / 2 + r + e / 2, jan);
      noLote(itens, e, 0.035, prof - 2 * r, cx - larg / 2 + r + e / 2, y, cz, jan);
      noLote(itens, e, 0.035, prof - 2 * r, cx + larg / 2 - r - e / 2, y, cz, jan);
    }
    anel(4.25, -2, 11.8, 10.3, Y_LAJE1 - 0.035, J.pintura);
    anel(4.25, -2, 11.8, 10.3, Y_COB - 0.035, desl(J.pintura, 0.01));
    anel(12.4, -3.75, 4.5, 6.8, Y_LAJE1 - 0.035, desl(J.pintura, 0.005));
    fecharLote(casa, matSombraFriso, itens);
  })();

  // Spots embutidos nos beirais + poças de luz quente no piso (acendem na entrega).
  const luzBeiral = new THREE.PointLight(0xffb878, 0, 11, 2);
  luzBeiral.position.set(3.6, 2.5, 2.2);
  scene.add(luzBeiral);
  (function spots() {
    const texPoca = texturaDecalque(128, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,176,100,1)');
      gr.addColorStop(0.5, 'rgba(255,150,70,0.35)');
      gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    });
    const pontos = [[-0.6, 2.15], [1.4, 2.15], [3.4, 2.15], [5.4, 2.15], [7.4, 2.15], [9.2, 2.15], [-0.75, -0.5], [-0.75, -3], [-0.75, -5.5]];
    const loteSpots = lote();
    pontos.forEach((q, i) => {
      noLote(loteSpots, 0.14, 0.02, 0.14, q[0], Y_LAJE1 - 0.02, q[1], J.portas);
      const d = decalque(scene, texPoca, 2.6, 2.6, q[0], 0.1, q[1], 0, true);
      d.renderOrder = 4;
      animar(d, 'fade', desl(J.luzes, i * 0.003), null, 0.42);
    });
    fecharLote(casa, matSpot, loteSpots, 'pop');
  })();


  /* ============================= ESCAVADEIRA ============================ */
  // Frente da máquina = +X local. Lança/braço/caçamba giram em Z (pitch).
  const exc = (function escavadeira() {
    const g = new THREE.Group();
    scene.add(g);
    const CX = [-1, 0, 0]; // caixa ancorada na face x mínima (pivô)
    caixa(g, matMaqEscuro, 3.5, 0.72, 0.6, 0, 0, 0.98);   // esteiras
    caixa(g, matMaqEscuro, 3.5, 0.72, 0.6, 0, 0, -0.98);
    caixa(g, matAmarelo, 2.5, 0.3, 1.5, 0, 0.42, 0);      // chassi
    const torre = new THREE.Group();
    torre.position.y = 0.86;
    g.add(torre);
    caixa(torre, matAmarelo, 3.0, 1.15, 2.2, -0.45, 0, 0);     // corpo / motor
    caixa(torre, matAmarelo, 0.45, 0.95, 2.1, -2.1, 0.08, 0);   // contrapeso
    caixa(torre, matAmarelo, 1.25, 0.55, 1.0, 0.45, 1.15, 0.58); // base da cabine
    caixa(torre, matVidroMaq, 1.15, 1.0, 0.94, 0.45, 1.7, 0.58); // vidros da cabine
    caixa(torre, matAmarelo, 1.3, 0.09, 1.05, 0.45, 2.7, 0.58);  // teto
    caixa(torre, matMaqEscuro, 0.16, 0.55, 0.16, -1.3, 1.15, -0.7); // escapamento
    const lanca = new THREE.Group();
    lanca.position.set(0.85, 0.85, -0.2);
    torre.add(lanca);
    caixa(lanca, matAmarelo, 3.7, 0.46, 0.34, 0, 0, 0, CX);
    caixa(lanca, matMaqEscuro, 1.9, 0.13, 0.13, 0.5, 0.32, 0, CX); // cilindro hidráulico
    const braco = new THREE.Group();
    braco.position.set(3.7, 0, 0);
    lanca.add(braco);
    caixa(braco, matAmarelo, 2.5, 0.34, 0.27, -0.15, 0, 0, CX);
    caixa(braco, matMaqEscuro, 1.3, 0.11, 0.11, 0.2, 0.25, 0, CX);
    const cacamba = new THREE.Group();
    cacamba.position.set(2.3, 0, 0);
    braco.add(cacamba);
    caixa(cacamba, matMaqEscuro, 0.95, 0.75, 0.9, -0.1, -0.2, 0, CX);
    caixa(cacamba, matMaqEscuro, 0.3, 0.12, 0.86, 0.8, -0.5, 0, CX); // dentes
    return { g, torre, lanca, braco, cacamba };
  })();

  // Poses (radianos): recolhida para andar; ciclo de escavação definido em poseEscavadeira
  const EXC_LOCAL = { x: -1.6, z: 3.4, yaw: 0.52 };
  const EXC_CICLOS = 5;

  function poseEscavadeira(p) {
    if (p >= J.excCruza[1]) { exc.g.visible = false; return; }
    exc.g.visible = true;
    let x, z, y = 0, yaw, giro = 0, aLanca = 0.95, aBraco = -2.15, aCacamba = -1.1; // recolhida
    if (p < J.excSai[0]) {
      // trabalhando: ciclo cavar -> girar -> despejar, função só de p
      const u = clamp01((p - J.excTrabalha[0]) / (J.excTrabalha[1] - J.excTrabalha[0]));
      const fi = u * EXC_CICLOS * DOIS_PI;
      const amp = janela(p, J.excTrabalha[0], J.excTrabalha[0] + 0.03) * (1 - janela(p, J.excTrabalha[1] - 0.03, J.excTrabalha[1]));
      x = EXC_LOCAL.x; z = EXC_LOCAL.z; yaw = EXC_LOCAL.yaw;
      giro = amp * 0.6 * Math.sin(fi * 0.5);
      aLanca = mix(aLanca, 0.4 + 0.32 * Math.sin(fi), amp);
      aBraco = mix(aBraco, -1.75 + 0.4 * Math.sin(fi - 1.0), amp);
      aCacamba = mix(aCacamba, -0.75 + 0.6 * Math.sin(fi - 1.9), amp);
    } else if (p < J.excCruza[0]) {
      // sai do canteiro pela direita
      const u = janela(p, J.excSai[0], J.excSai[1]);
      x = mix(EXC_LOCAL.x, 31, u * u);
      z = mix(EXC_LOCAL.z, 8.4, suave(clamp01(u * 2)));
      yaw = mix(EXC_LOCAL.yaw, 0, clamp01(u * 4));
    } else {
      // cruza o primeiro plano em velocidade constante (direita -> esquerda)
      const u = (p - J.excCruza[0]) / (J.excCruza[1] - J.excCruza[0]);
      x = mix(11, -27, u);
      z = 24.6;
      yaw = Math.PI;
      y = 0.02 * Math.sin(u * 60);
      aLanca += 0.03 * Math.sin(u * 45);
    }
    exc.g.position.set(x, y, z);
    exc.g.rotation.y = yaw;
    exc.torre.rotation.y = giro;
    exc.lanca.rotation.z = aLanca;
    exc.braco.rotation.z = aBraco;
    exc.cacamba.rotation.z = aCacamba;
  }

  /* ================== estado da cena = função pura de p ================= */
  let pAlvo = 0;        // último valor pedido em setProgress
  let pAplicado = -1;   // valor já refletido na cena

  function aplicarProgresso(p) {
    // 1) elementos com janela própria
    for (let i = 0; i < animacoes.length; i++) {
      const an = animacoes[i];
      const t = janela(p, an.a, an.b) * (1 - janela(p, an.oa, an.ob));
      const o = an.obj;
      o.visible = t > 0.002;
      if (an.modo === 'fade') { o.material.opacity = t * an.max; continue; }
      const s = t > 0.001 ? t : 0.001;
      if (an.modo === 'y') o.scale.y = s;
      else if (an.modo === 'z') o.scale.z = s;
      else if (an.modo === 'x') o.scale.x = s;
      else o.scale.setScalar(s);
    }
    // 2) elementos instanciados (esperas, andaimes, ripado, sebes...)
    for (let i = 0; i < instanciados.length; i++) instanciados[i](p);

    // 3) materiais: concreto/bloco cru -> reboco branco
    const tPint = janela(p, J.pintura[0], J.pintura[1]);
    matConcreto.color.lerpColors(COR.concretoCru, COR.reboco, tPint);
    matAlvenaria.color.lerpColors(COR.blocoCru, COR.reboco, tPint);
    matAlvenaria.roughness = 0.95 - 0.03 * tPint;
    matRadier.color.lerpColors(COR.concretoCru, COR.pisoClaro, tPint);

    // 4) vidros ganham corpo; luzes internas quentes acendem no final
    const tLuz = janela(p, J.luzes[0], J.luzes[1]);
    matVidro.opacity = 0.25 + 0.67 * janela(p, J.vidros[0], J.vidros[1]) - 0.14 * tLuz;
    matVidro.emissiveIntensity = 0.08 * tLuz;
    matSpot.emissiveIntensity = 7 * tLuz;
    luzBeiral.intensity = 16 * tLuz;
    luzBeiral.visible = tLuz > 0.001;
    matInterior.emissiveIntensity = 4.2 * tLuz;
    luzTerreo.intensity = 22 * tLuz;
    luzSuperior.intensity = 18 * tLuz;
    luzTerreo.visible = luzSuperior.visible = tLuz > 0.001;

    // 5) escavadeira
    poseEscavadeira(p);
    pAplicado = p;
    renderer.shadowMap.needsUpdate = true; // a geometria mudou: refaz o mapa de sombra neste quadro
  }

  /* -------------------------------- câmera ------------------------------ */
  // Fixa, altura humana, 3/4 frontal. Em retrato (mobile) abre o FOV e recua
  // para manter a casa inteira no quadro.
  const CAM_PAISAGEM = { pos: new THREE.Vector3(-16, 1.7, 33), alvo: new THREE.Vector3(1.0, 4.15, -3.2), fov: 35, dolly: 3.0 };
  const CAM_RETRATO = { pos: new THREE.Vector3(-9.5, 1.8, 44), alvo: new THREE.Vector3(6.6, 4.4, -2), fov: 50, dolly: 2.5 };
  const basePos = new THREE.Vector3();
  const baseAlvo = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _alvo = new THREE.Vector3();
  let dollyMax = CAM_PAISAGEM.dolly;

  function enquadrar(aspecto) {
    // 1.45 ou mais largo = paisagem pura; 0.62 ou mais estreito = retrato puro
    const t = suave(clamp01((1.45 - aspecto) / (1.45 - 0.62)));
    basePos.lerpVectors(CAM_PAISAGEM.pos, CAM_RETRATO.pos, t);
    baseAlvo.lerpVectors(CAM_PAISAGEM.alvo, CAM_RETRATO.alvo, t);
    dollyMax = mix(CAM_PAISAGEM.dolly, CAM_RETRATO.dolly, t);
    camera.fov = mix(CAM_PAISAGEM.fov, CAM_RETRATO.fov, t);
    camera.aspect = aspecto;
    // Em retrato o texto do site ocupa o meio/baixo da tela: desloca o quadro (lens shift, sem
    // mudar a perspectiva) para a casa subir até o céu livre acima do título.
    const shift = 0.3 * t;
    if (shift > 0.001) camera.setViewOffset(1000, 1000, 0, shift * 1000, 1000, 1000);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // Micro-parallax pelo ponteiro (amortecido). Desligado com reducedMotion.
  const ponteiro = { x: 0, y: 0, alvoX: 0, alvoY: 0 };
  const usaParallax = !reducedMotion && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

  function atualizarCamera() {
    _dir.subVectors(baseAlvo, basePos).normalize();
    const dolly = reducedMotion ? 0 : dollyMax * suave(pAlvo);
    camera.position.copy(basePos).addScaledVector(_dir, dolly);
    _alvo.copy(baseAlvo);
    if (usaParallax) {
      camera.position.x += ponteiro.x * 0.5;
      camera.position.y += ponteiro.y * 0.22;
      _alvo.x += ponteiro.x * 0.12;
      _alvo.y += ponteiro.y * 0.06;
    }
    camera.lookAt(_alvo);
  }

  function aoMoverPonteiro(e) {
    ponteiro.alvoX = (e.clientX / window.innerWidth) * 2 - 1;
    ponteiro.alvoY = -((e.clientY / window.innerHeight) * 2 - 1);
    agendar();
  }
  function aoSairPonteiro() { ponteiro.alvoX = 0; ponteiro.alvoY = 0; agendar(); }
  if (usaParallax) {
    window.addEventListener('pointermove', aoMoverPonteiro, { passive: true });
    document.addEventListener('pointerleave', aoSairPonteiro);
  }

  /* --------------------- render sob demanda (dirty flag) ---------------- */
  // O loop só existe enquanto há o que desenhar: start() liga o modo "ativo" e cada
  // mudança (progresso, ponteiro, resize) agenda UM quadro. Parado = zero callbacks.
  let sujo = true;
  let ativo = false;
  let raf = 0;
  let rafInicial = 0;
  let aquecimento = 0;
  let descartado = false;
  let contextoPerdido = false;
  let primeiroFrame = false;
  let largura = 0, altura = 0;

  function renderizar() {
    if (descartado || contextoPerdido) return;
    if (pAplicado !== pAlvo) aplicarProgresso(pAlvo);
    atualizarCamera();
    renderer.render(scene, camera);
    sujo = false;
    if (!primeiroFrame) { primeiroFrame = true; pronto.resolver(); agendarAquecimento(); }
  }

  // Compila os shaders de TODOS os materiais (inclusive os de peças ainda ocultas) nos
  // dois estados de luz (luzes quentes apagadas / acesas), fora do caminho do scroll.
  // Sem isso cada material compila na primeira vez que aparece e a rolagem engasga.
  function aquecerShaders() {
    aquecimento = 0;
    if (descartado || contextoPerdido) return;
    const acesas = luzTerreo.visible;
    try {
      renderer.compile(scene, camera);
      luzTerreo.visible = luzSuperior.visible = luzBeiral.visible = !acesas;
      renderer.compile(scene, camera);
    } catch (e) { /* aquecimento é opcional */ }
    luzTerreo.visible = luzSuperior.visible = luzBeiral.visible = acesas;
  }
  function agendarAquecimento() {
    if (typeof window.requestIdleCallback === 'function') {
      aquecimento = window.requestIdleCallback(aquecerShaders, { timeout: 1500 });
    } else {
      aquecimento = window.setTimeout(aquecerShaders, 300);
    }
  }

  function agendar() {
    if (ativo && !raf && !descartado) raf = requestAnimationFrame(laco);
  }

  function resize() {
    if (descartado) return;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
    const dprTela = window.devicePixelRatio || 1;
    let dpr = Math.min(dprTela, dprMax);
    // orçamento de pixels: reduz a superamostragem, nunca abaixo de 1x (ou do dpr da tela)
    const dprOrcamento = Math.sqrt(PIXELS_MAX / (w * h));
    if (dpr > dprOrcamento) dpr = Math.max(Math.min(1, dprTela), dprOrcamento);
    if (w === largura && h === altura && dpr === renderer.getPixelRatio()) return;
    largura = w; altura = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); // false: não mexe no CSS do canvas
    enquadrar(w / h);
    sujo = true;
    agendar();
  }

  function laco() {
    raf = 0;
    let convergindo = false;
    if (usaParallax) {
      // amortecimento; enquanto não convergir, continua renderizando
      const dx = ponteiro.alvoX - ponteiro.x, dy = ponteiro.alvoY - ponteiro.y;
      if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
        ponteiro.x += dx * 0.06;
        ponteiro.y += dy * 0.06;
        sujo = true;
        convergindo = true;
      }
    }
    if (sujo) renderizar();
    if (convergindo) agendar();
  }

  /* ----------------------- perda de contexto WebGL ---------------------- */
  function aoPerderContexto(e) {
    e.preventDefault(); // permite a restauração
    contextoPerdido = true;
    if (!primeiroFrame) pronto.rejeitar(new Error('obra.js: o contexto WebGL foi perdido antes do primeiro quadro.'));
  }
  function aoRestaurarContexto() {
    contextoPerdido = false;
    pAplicado = -1;
    sujo = true;
    if (ativo) agendar(); else renderizar();
  }
  canvas.addEventListener('webglcontextlost', aoPerderContexto, false);
  canvas.addEventListener('webglcontextrestored', aoRestaurarContexto, false);

  /* ---------------------------- primeiro quadro ------------------------- */
  // Espera um rAF para o layout do canvas existir; ready resolve em seguida.
  rafInicial = requestAnimationFrame(() => {
    rafInicial = 0;
    if (descartado) return;
    try {
      resize();
      renderizar();
      if (!primeiroFrame) throw new Error('contexto WebGL indisponível');
    } catch (e) {
      pronto.rejeitar(new Error('obra.js: falha ao renderizar a cena 3D (' + (e && e.message ? e.message : e) + ').'));
    }
  });

  /* --------------------------------- API -------------------------------- */
  return {
    setProgress(v) {
      const np = progressoValido(v);
      if (np === pAlvo) return;
      pAlvo = np;
      sujo = true; // a cena só é recalculada no próximo quadro do loop
      agendar();
    },
    resize,
    start() {
      if (ativo || descartado) return;
      ativo = true;
      sujo = true;
      agendar();
    },
    stop() {
      ativo = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    dispose() {
      if (descartado) return;
      descartado = true;
      ativo = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (rafInicial) { cancelAnimationFrame(rafInicial); rafInicial = 0; }
      if (aquecimento) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(aquecimento);
        else window.clearTimeout(aquecimento);
        aquecimento = 0;
      }
      if (!primeiroFrame) pronto.rejeitar(new Error('obra.js: descartada antes do primeiro quadro.'));
      window.removeEventListener('pointermove', aoMoverPonteiro);
      document.removeEventListener('pointerleave', aoSairPonteiro);
      canvas.removeEventListener('webglcontextlost', aoPerderContexto, false);
      canvas.removeEventListener('webglcontextrestored', aoRestaurarContexto, false);
      for (let i = 0; i < geometrias.length; i++) geometrias[i].dispose();
      for (let i = 0; i < materiais.length; i++) materiais[i].dispose();
      for (let i = 0; i < texturas.length; i++) texturas[i].dispose();
      scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      if (alvoEnv) alvoEnv.dispose();
      renderer.dispose();
    },
    ready: pronto.promessa,
    stages: 6,
  };
}
