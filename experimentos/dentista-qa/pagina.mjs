// Esta função também é executada no Chromium, sem dependências do Node.
export function prepararAuditoria() {
  const controle = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [tabindex], iframe';
  const topo = 'header, [role=banner], #hero, .hero, #fatos, .fatos, main > :first-child';
  const limpar = texto => texto?.replace(/\s+/g, ' ').trim() || '';
  const nome = el => (limpar(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.name) || el.localName).slice(0, 100);
  const nomeSecao = el => limpar(el.querySelector('h1,h2')?.innerText)
    || (el.matches('#fatos,.fatos') ? 'Informações da clínica' : el.getAttribute('aria-label') || el.id || el.localName);
  const descrever = el => nome(el) + (el.id ? ' (#' + el.id + ')' : ' (' + el.localName + ')');
  const visivel = el => el && !el.closest('[inert], [hidden]') && el.checkVisibility({
    checkVisibilityCSS: true, checkOpacity: true, contentVisibilityAuto: true
  }) && el.getClientRects().length;
  function cortado(el) {
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.clip === 'rect(0px, 0px, 0px, 0px)' || /^inset\(50%(?:\s+50%)*\)$/.test(s.clipPath)
          || (s.overflow === 'hidden' && n.clientWidth <= 1 && n.clientHeight <= 1 && s.position === 'absolute')) {
        return true;
      }
    }
    return false;
  }

  const tela = document.createElement('canvas');
  tela.width = tela.height = 1;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  const cores = new Map();
  function rgba(cor) {
    if (!cores.has(cor)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'transparent';
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      cores.set(cor, [r, g, b, a / 255]);
    }
    return cores.get(cor);
  }
  function sobre(frente, fundo) {
    const a = frente[3] + fundo[3] * (1 - frente[3]);
    if (!a) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (frente[i] * frente[3] + fundo[i] * fundo[3] * (1 - frente[3])) / a).concat(a);
  }
  const linear = v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
  const luminancia = rgb => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
  function contraste(a, b) {
    const x = luminancia(a), y = luminancia(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function camadas(el, fg) {
    let fundo = [0, 0, 0, 0], frente = fg, opacidade = 1;
    let complexo = false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const bg = rgba(s.backgroundColor);
      if (fundo[3] < 1) {
        const imagem = s.backgroundImage !== 'none';
        const pseudo = ['::before', '::after'].some(p => {
          const ps = getComputedStyle(n, p);
          return ps.content !== 'none' && (ps.backgroundImage !== 'none' || rgba(ps.backgroundColor)[3] > 0);
        });
        complexo ||= imagem || pseudo || n.matches('#hero, .hero') && !!n.querySelector('canvas, video');
      }
      complexo ||= s.mixBlendMode !== 'normal' || s.filter !== 'none' || s.backdropFilter !== 'none';
      fundo = sobre(fundo, bg);
      frente = sobre(frente, bg);
      opacidade *= Number(s.opacity);
      fundo[3] *= Number(s.opacity);
      frente[3] *= Number(s.opacity);
    }
    return {
      complexo, opacidade,
      proporcao: contraste(sobre(frente, [255, 255, 255, 1]), sobre(fundo, [255, 255, 255, 1]))
    };
  }
  function textos(raiz = document.body, modo = '') {
    const itens = [];
    const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let no; (no = caminhante.nextNode());) {
      const trecho = limpar(no.textContent);
      const el = no.parentElement;
      if (!trecho || !el || el.closest('script,style,template,noscript,svg,select,option,:disabled,.pessoa-foto--iniciais[aria-hidden=true]')
          || !visivel(el) || cortado(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(no);
      const caixas = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      if (!caixas.length || modo === 'viewport' && !caixas.some(r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue;
      const s = getComputedStyle(el);
      const fg = rgba(s.color);
      if (!fg[3]) continue;
      const tamanho = parseFloat(s.fontSize);
      const peso = Number(s.fontWeight);
      const limite = tamanho >= 24 || tamanho >= 56 / 3 && peso >= 700 ? 3 : 4.5;
      itens.push({
        trecho: trecho.slice(0, 100), elemento: el.localName,
        secao: nomeSecao(el.closest('main > *, header, footer') || document.body),
        limite, fg, ...camadas(el, fg),
        ...(modo ? { caixas: caixas.map(r => modo === 'pagina'
          ? [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]
          : [r.left, r.top, r.right, r.bottom]) } : {})
      });
    }
    return itens;
  }

  async function amostrarFundo(dadosPng, itens, recorte) {
    const imagem = new Image();
    imagem.src = 'data:image/png;base64,' + dadosPng;
    await imagem.decode();
    const pixels = document.createElement('canvas');
    pixels.width = recorte?.width || innerWidth;
    pixels.height = recorte?.height || innerHeight;
    const dx = recorte?.x || 0, dy = recorte?.y || 0;
    const raster = pixels.getContext('2d', { willReadFrequently: true });
    raster.drawImage(imagem, 0, 0, pixels.width, pixels.height);
    const { data } = raster.getImageData(0, 0, pixels.width, pixels.height);
    return itens.map(({ caixas, fg, opacidade, ...item }) => {
      let minimo = Infinity;
      for (const caixa of caixas) {
        const [esquerda, topo, direita, baixo] = caixa.map((v, i) => v - (i % 2 ? dy : dx));
        for (let y = Math.max(0, Math.ceil(topo)); y < Math.min(pixels.height, baixo); y += 2) {
          for (let x = Math.max(0, Math.ceil(esquerda)); x < Math.min(pixels.width, direita); x += 2) {
            const i = (y * pixels.width + x) * 4;
            const fundo = [data[i], data[i + 1], data[i + 2], 1];
            const frente = sobre([fg[0], fg[1], fg[2], fg[3] * opacidade], fundo);
            minimo = Math.min(minimo, contraste(frente, fundo));
          }
        }
      }
      return Number.isFinite(minimo) ? { ...item, complexo: false, proporcao: minimo } : item;
    });
  }

  function tamanhos() {
    return [...document.querySelectorAll(controle)].flatMap(el => {
      if (el.matches(':disabled,[aria-disabled=true]') || el.tabIndex < 0 && !el.matches('summary,[role=button],[role=link]')) return [];
      const caixa = el.matches('input[type=radio],input[type=checkbox]') && el.labels?.length ? el.labels[0] : el;
      if (!visivel(caixa) || cortado(caixa)) return [];
      const { width, height, bottom, right } = caixa.getBoundingClientRect();
      if (bottom <= 0 || right <= 0 || width >= 44 && height >= 44) return [];
      return [{ alvo: descrever(caixa), largura: Math.round(width * 10) / 10, altura: Math.round(height * 10) / 10 }];
    });
  }
  function imagens() {
    return [...document.images].filter(img => visivel(img) && !cortado(img)).flatMap(img => {
      const url = img.currentSrc || img.getAttribute('src') || '(sem URL)';
      const origem = url.startsWith('data:') ? 'Imagem embutida' : url;
      const problemas = [];
      if (!img.hasAttribute('alt')) problemas.push('atributo alt ausente');
      if (img.complete && !img.naturalWidth || !img.complete) {
        problemas.push(img.complete ? 'imagem sem pixels após carregamento' : 'carga não concluída');
      }
      return problemas.map(problema => ({ origem, problema }));
    });
  }
  function medidaLargura() {
    const raiz = document.documentElement;
    return { viewport: raiz.clientWidth, documento: Math.max(raiz.scrollWidth, document.body.scrollWidth) };
  }
  function credenciais() {
    const cro = /\bcro\s*[-/]?\s*(?:[a-z]{2}\b\s*[-/]?\s*)?(?:n[º°o.]\s*)?[:.]?\s*(\d+(?:\.\d{3})*)\b/i;
    const cargo = /respons[aá]vel\s+t[eé]cnic[oa]/i;
    const verificar = elementos => {
      const blocos = elementos.filter(visivel).map(el => limpar(el.innerText));
      const par = blocos.find(t => cargo.test(t) && cro.test(t));
      return {
        cargo: blocos.some(t => cargo.test(t)), cro: blocos.some(t => cro.test(t)),
        junto: Boolean(par), numero: par?.match(cro)?.[0] || ''
      };
    };
    return { topo: verificar([...document.querySelectorAll(topo)]), rodape: verificar([...document.querySelectorAll('footer,[role=contentinfo]')]) };
  }
  const antesFoco = new WeakMap();
  function assinaturaFoco(el, pseudo) {
    const s = getComputedStyle(el, pseudo);
    return {
      contorno: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && rgba(s.outlineColor)[3] > 0,
      sombra: s.boxShadow, borda: s.borderColor, fundo: s.backgroundColor, cor: s.color,
      decoracao: s.textDecorationLine
    };
  }
  function estilosFoco(el) {
    const vizinhos = [el.labels?.[0], el.nextElementSibling, el.parentElement, el.parentElement?.parentElement];
    return [assinaturaFoco(el), assinaturaFoco(el, '::before'), assinaturaFoco(el, '::after'),
      ...vizinhos.map(v => v && assinaturaFoco(v))];
  }
  function iniciarFoco() {
    for (const el of document.querySelectorAll(controle)) {
      antesFoco.set(el, {
        estilos: estilosFoco(el),
        estavaFora: el.getBoundingClientRect().bottom <= 0
      });
    }
  }
  function foco() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const rotulo = el.labels?.[0] || el;
    const anterior = antesFoco.get(el);
    const estilos = estilosFoco(el);
    const r = rotulo.getBoundingClientRect();
    const pontos = [[r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
    const encoberto = !pontos.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit && (rotulo.contains(hit) || el.contains(hit));
    });
    const indicador = estilos.some((s, i) => {
      if (!s) return false;
      const antes = anterior?.estilos[i];
      return antes ? JSON.stringify(s) !== JSON.stringify(antes) : s.contorno;
    }) || Boolean(anterior?.estavaFora && r.top >= 0 && el.matches(':focus-visible'));
    return { alvo: descrever(el), indicador, encoberto };
  }

  function partes() {
    return [...document.querySelectorAll('header,main > *,footer')].filter(visivel).map((el, i) => {
      const hero = el.matches('#hero,.hero') || el.matches('.pin-spacer') && el.querySelector('#hero,.hero');
      return { indice: [...document.querySelectorAll('header,main > *,footer')].indexOf(el),
        nome: hero ? 'Hero (abertura)' : el.matches('header') ? 'Cabeçalho' : el.matches('footer') ? 'Rodapé' : nomeSecao(el),
        ordem: i + 1, hero: Boolean(hero) };
    });
  }
  globalThis.dentistaQa = { textos, amostrarFundo, tamanhos, imagens, medidaLargura, credenciais, iniciarFoco, foco, partes };
}
