/**
 * Cena de abertura, adaptada de /construtora/assets/obra-video.js.
 * A abertura pede o pôster. O app libera a mídia restante depois do carregamento,
 * em tempo ocioso e perto da cena. Cada MP4 é baixado uma vez para buscas em memória.
 */
const FPS = 30;
const LIMITE_CANVAS = 2560 * 1.1;
const clamp = n => Math.min(1, Math.max(0, n));
const blobs = new Map();

function obterBlob(src) {
  if (!blobs.has(src)) {
    blobs.set(src, fetch(src, { priority: 'low' })
      .then(resposta => resposta.ok ? resposta.blob() : null)
      .catch(() => null));
  }
  return blobs.get(src);
}

function permiteVideo() {
  const rede = navigator.connection;
  return !rede?.saveData && !['slow-2g', '2g'].includes(rede?.effectiveType);
}

async function permiteRetratoHD() {
  const rede = navigator.connection?.effectiveType;
  const memoria = navigator.deviceMemory;
  if ((devicePixelRatio || 1) < 2 || (rede && rede !== '4g' && rede !== 'unknown') || (memoria != null && memoria < 4)) {
    return false;
  }
  const capacidades = navigator.mediaCapabilities;
  if (typeof capacidades?.decodingInfo !== 'function') return true;
  try {
    const info = await capacidades.decodingInfo({
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="avc1.640033"',
        width: 1440,
        height: 2560,
        bitrate: 3000000,
        framerate: FPS
      }
    });
    return info.supported && info.smooth;
  } catch {
    return false;
  }
}

function carregarImagem(src, signal, prioritario) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const abortar = () => { img.removeAttribute('src'); terminar(signal.reason); };
    function terminar(erro) {
      img.onload = img.onerror = null;
      signal.removeEventListener('abort', abortar);
      if (erro) reject(erro);
      else resolve(img);
    }
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', abortar, { once: true });
    img.decoding = 'async';
    img.fetchPriority = prioritario ? 'high' : 'low';
    img.onload = () => terminar();
    img.onerror = () => terminar(new Error('Pôster indisponível'));
    img.src = src;
  });
}

export function createCena(canvas, { cena = {}, estatico = false, quadroFinal = false, agendarMidia, onFinal } = {}) {
  const ctx = canvas.getContext('2d');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.className = 'cena-video';
  video.setAttribute('aria-hidden', 'true');

  let liberar;
  const ready = new Promise(resolve => { liberar = resolve; });
  let carga, url, poster, ultimoQuadro;
  let retrato = false, fontesHorizontais = [], fontesPendentes = null, baixandoVideo = false;
  let aberturaCarregada = false, midiaIniciada = false;
  let perfilAtual = '', videoPronto = false, exibindoVideo = false, descartado = false;
  let progresso = 0, ativo = false, raf = 0;
  const foco = [0, 1].map(i => {
    const valor = cena.foco?.[i];
    return typeof valor === 'number' && Number.isFinite(valor) ? clamp(valor) : .5;
  });
  const mistura = p => clamp((p - .35) / .4);
  function desenhar(origem, opacidade = 1) {
    if (!origem || !ctx || !opacidade) return;
    const w = origem.videoWidth || origem.naturalWidth, h = origem.videoHeight || origem.naturalHeight;
    if (!w || !h) return;
    const { width: cw, height: ch } = canvas;
    const escala = Math.max(cw / w, ch / h), dw = w * escala, dh = h * escala;
    const focoAtual = h > w ? [.5, .5] : foco;
    const x = Math.min(0, Math.max(cw - dw, cw / 2 - focoAtual[0] * dw));
    const y = Math.min(0, Math.max(ch - dh, ch / 2 - focoAtual[1] * dh));
    ctx.globalAlpha = opacidade;
    ctx.drawImage(origem, x, y, dw, dh);
    ctx.globalAlpha = 1;
  }

  function redesenhar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (exibindoVideo) {
      desenhar(video);
    } else if (quadroFinal) {
      desenhar(ultimoQuadro || poster);
    } else if (estatico || !poster || !ultimoQuadro) {
      desenhar(poster || (aberturaCarregada && ultimoQuadro));
    } else {
      // Mantém a passagem da caneta para a mesa mesmo enquanto o MP4 não estiver pronto.
      desenhar(poster);
      desenhar(ultimoQuadro, mistura(progresso));
    }
  }

  function liberarVideo() {
    videoPronto = false;
    exibindoVideo = false;
    video.pause();
    if (video.hasAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  function decodificar(signal) {
    return new Promise((resolve, reject) => {
      const ok = () => terminar();
      const erro = () => terminar(new Error('Vídeo indisponível'));
      const abortar = () => terminar(signal.reason);
      function terminar(falha) {
        video.removeEventListener('loadeddata', ok);
        video.removeEventListener('error', erro);
        signal.removeEventListener('abort', abortar);
        if (falha) reject(falha);
        else resolve();
      }
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('error', erro, { once: true });
      signal.addEventListener('abort', abortar, { once: true });
      video.src = url;
      video.load();
    });
  }

  async function carregarQuadro(fontes, signal, prioritario) {
    const opcoes = new Set(fontes.filter(Boolean));
    for (const src of opcoes) {
      try {
        return await carregarImagem(src, signal, prioritario);
      } catch {
        if (signal.aborted) return;
      }
    }
  }

  async function fontesRetrato() {
    const hd = cena.videoRetrato, leve = cena.videoRetratoLeve;
    if (!hd || hd === leve) return leve ? [leve] : [];
    return [await permiteRetratoHD() && hd, leve].filter(Boolean);
  }

  async function carregarVideo(signal) {
    if (!fontesPendentes) {
      const fontes = retrato ? await fontesRetrato() : fontesHorizontais.slice();
      if (signal.aborted) return;
      fontesPendentes = fontes;
    }
    while (fontesPendentes.length && ativo && permiteVideo()) {
      const src = fontesPendentes.shift();
      try {
        const blob = await obterBlob(src);
        if (signal.aborted) return;
        if (!blob) continue;
        if (!video.isConnected) canvas.after(video);
        url = URL.createObjectURL(blob);
        await decodificar(signal);
        if (signal.aborted) return;
        if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Duração inválida');
        videoPronto = true;
        if (progresso <= .5 / (FPS * video.duration)) {
          exibindoVideo = true;
          redesenhar();
        }
        agendar();
        liberar('video');
        return;
      } catch {
        if (signal.aborted) return;
        liberarVideo();
      }
    }
  }

  async function carregarAbertura(vertical, signal) {
    const img = await carregarQuadro([vertical && cena.posterRetrato, cena.poster], signal, true);
    if (signal.aborted) return;
    poster = img;
    aberturaCarregada = true;
    if (!exibindoVideo) redesenhar();
    liberar(poster ? 'poster' : 'fallback');
    agendarMidia?.();
  }

  async function carregarEncerramento(vertical, signal) {
    const img = await carregarQuadro([vertical && cena.finalRetrato, cena.final], signal, quadroFinal);
    if (signal.aborted) return;
    ultimoQuadro = img;
    onFinal?.(img?.src || '');
    if (img && !exibindoVideo) redesenhar();
    if (img && quadroFinal) liberar('poster');
  }

  function carregarMidia() {
    if (descartado || quadroFinal || !aberturaCarregada) return;
    const { signal } = carga;
    if (!midiaIniciada) {
      midiaIniciada = true;
      carregarEncerramento(retrato, signal);
    }
    if (!estatico && ctx && !videoPronto && !baixandoVideo && fontesPendentes?.length !== 0 && permiteVideo()) {
      baixandoVideo = true;
      carregarVideo(signal).finally(() => { if (!signal.aborted) baixandoVideo = false; });
    }
  }

  function carregar() {
    carga?.abort();
    carga = new AbortController();
    const { signal } = carga;
    liberarVideo();
    poster = null;
    ultimoQuadro = null;
    aberturaCarregada = false;
    midiaIniciada = false;
    fontesPendentes = null;
    baixandoVideo = false;
    redesenhar();

    if (quadroFinal) {
      const vertical = retrato;
      carregarEncerramento(vertical, signal).then(() => {
        if (!signal.aborted && !ultimoQuadro) carregarAbertura(vertical, signal);
      });
    } else {
      carregarAbertura(retrato, signal);
    }
  }

  function resize() {
    if (descartado) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const escala = Math.min(dpr, LIMITE_CANVAS / Math.max(w, h, 1));
    const cw = Math.max(1, Math.round(w * escala)), ch = Math.max(1, Math.round(h * escala));
    const mudou = canvas.width !== cw || canvas.height !== ch;
    if (mudou) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    if (mudou) redesenhar();
    const vertical = innerWidth < 700 && h > w * 1.15
      && Boolean(cena.videoRetrato || cena.videoRetratoLeve || cena.posterRetrato || cena.finalRetrato);
    const horizontal = w >= 1050 && cw >= 1400 ? [cena.video, cena.videoMobile] : [cena.videoMobile, cena.video];
    const fontes = [...new Set(horizontal.filter(Boolean))];
    const perfil = vertical ? (dpr >= 2 ? 'retrato-dpr-alto' : 'retrato-dpr-baixo') : JSON.stringify(fontes);
    if (perfil !== perfilAtual) {
      perfilAtual = perfil;
      retrato = vertical;
      fontesHorizontais = fontes;
      carregar();
    }
  }

  function buscar() {
    raf = 0;
    if (!ativo || !videoPronto || video.seeking) return;
    const ultimo = Math.max(0, video.duration - .5 / FPS);
    const tempo = progresso * ultimo;
    if (Math.abs(video.currentTime - tempo) >= .5 / FPS) video.currentTime = tempo;
    else if (!exibindoVideo) { exibindoVideo = true; redesenhar(); }
  }

  function agendar() {
    if (ativo && videoPronto && !raf) raf = requestAnimationFrame(buscar);
  }

  video.addEventListener('seeked', () => {
    if (!videoPronto) return;
    exibindoVideo = true;
    redesenhar();
    agendar();
  });
  video.addEventListener('error', () => {
    if (!videoPronto) return;
    liberarVideo();
    redesenhar();
    if (fontesPendentes?.length) agendarMidia?.();
  });

  function stop() {
    ativo = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  return {
    setProgress(valor) {
      const proximo = Number.isFinite(valor) ? clamp(valor) : 0;
      if (progresso === proximo) return;
      const mudaImagem = !exibindoVideo && !estatico && mistura(progresso) !== mistura(proximo);
      progresso = proximo;
      if (mudaImagem) redesenhar();
      agendar();
    },
    carregarMidia,
    resize,
    start() { if (!descartado) { ativo = true; agendar(); } },
    stop,
    dispose() {
      if (descartado) return;
      descartado = true;
      stop();
      carga?.abort();
      liberarVideo();
      video.remove();
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      onFinal?.('');
      liberar('fallback');
    },
    ready
  };
}
