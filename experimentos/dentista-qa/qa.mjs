import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pausa } from 'node:timers/promises';
import { abrirChromium, aguardar } from './chromium.mjs';
import { prepararAuditoria } from './pagina.mjs';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const url = 'http://127.0.0.1:4173/dentista/';
const perfis = [
  { nome: 'desktop', largura: 1440, altura: 900, dpr: 1, mobile: false },
  { nome: 'mobile', largura: 390, altura: 844, dpr: 3, mobile: true }
];
const termos = [
  [/\bantes\s+e\s+depois\b/iu, 'antes e depois'],
  [/\bantes\s*\/\s*depois\b/iu, 'antes/depois'],
  [/\bresultado\s+garantido\b/iu, 'resultado garantido'],
  [/\bgarant\p{L}*/iu, 'garant'],
  [/\bo\s+melhor\b/iu, 'o melhor'],
  [/\ba\s+melhor\b/iu, 'a melhor'],
  [/R\s*\$/u, 'R$'],
  [/\bpre[çc]os?\b/iu, 'preço'],
  [/\bpromo\p{L}*/iu, 'promo'],
  [/\bdescontos?\b/iu, 'desconto'],
  [/\b100\s*%/u, '100%'],
  [/\bsem\s+dor\b/iu, 'sem dor'],
  [/\bindolor(?:es)?\b/iu, 'indolor']
];
const slug = texto => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54);
const normalizar = texto => texto.replace(/\s+/g, ' ').trim();
const unica = itens => [...new Set(itens)];
const celula = valor => String(valor).replaceAll('|', '\\|').replaceAll('\n', ' ');
const tabela = (titulos, linhas) => [
  '| ' + titulos.join(' | ') + ' |',
  '| ' + titulos.map(() => '---').join(' | ') + ' |',
  ...linhas.map(linha => '| ' + linha.map(celula).join(' | ') + ' |')
].join('\n');

function dataPasta(data) {
  const p = n => String(n).padStart(2, '0');
  return data.getFullYear() + p(data.getMonth() + 1) + p(data.getDate()) + '-' + p(data.getHours()) + p(data.getMinutes());
}

function verificarCFO(textos) {
  const achados = new Map();
  for (const texto of textos) {
    const corpo = normalizar(texto);
    for (const [expressao, termo] of termos) {
      for (const match of corpo.matchAll(new RegExp(expressao.source, expressao.flags + 'g'))) {
        const amostra = corpo.slice(Math.max(0, match.index - 38), match.index + match[0].length + 54).trim();
        achados.set(termo + '|' + amostra, { termo, amostra });
      }
    }
  }
  return [...achados.values()];
}

async function abrirPagina(browser, perfil) {
  const { mandar, avaliar } = browser;
  await mandar('Emulation.setDeviceMetricsOverride', {
    width: perfil.largura, height: perfil.altura, deviceScaleFactor: perfil.dpr, mobile: perfil.mobile
  });
  await mandar('Emulation.setTouchEmulationEnabled', { enabled: perfil.mobile, maxTouchPoints: 1 });
  await mandar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const destino = new URL(url);
  destino.searchParams.set('v', String(Date.now()));
  const nav = await mandar('Page.navigate', { url: destino.href });
  if (nav.errorText) throw new Error(nav.errorText);
  await aguardar(async () => {
    try {
      return await avaliar(`location.href === ${JSON.stringify(destino.href)} && document.readyState !== 'loading' && Boolean(document.querySelector('main'))`);
    } catch {
      return false;
    }
  }, 'HTML de ' + perfil.nome);
  await avaliar(`Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => true)`);
  await avaliar('(' + prepararAuditoria.toString() + ')()');
  await avaliar(`Promise.race([Promise.all([...document.images].filter(img => img.getClientRects().length).map(img => {
    if (img.loading === 'lazy') img.loading = 'eager';
    return img.decode().catch(() => {});
  })), new Promise(r => setTimeout(r, 3500))]).then(() => true)`);
  await pausa(260);
}

async function salvarCaptura(browser, pasta, arquivo, clip) {
  const r = await browser.mandar('Page.captureScreenshot', {
    format: 'webp', quality: 84, captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {})
  });
  await writeFile(join(pasta, arquivo), Buffer.from(r.data, 'base64'));
}

async function contrasteRaster(browser, itens, clip) {
  const { avaliar, mandar } = browser;
  if (!itens.length) return [];
  await avaliar(`(() => {
    const style = document.createElement('style');
    style.id = 'dentista-qa-fundo';
    style.textContent = '* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
    document.head.append(style);
  })()`);
  let dados;
  try {
    dados = (await mandar('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {})
    })).data;
  } finally {
    await avaliar('document.querySelector("#dentista-qa-fundo")?.remove()');
  }
  return avaliar(`dentistaQa.amostrarFundo(${JSON.stringify(dados)}, ${JSON.stringify(itens)}, ${JSON.stringify(clip || null)})`);
}

async function capturarHero(browser, pasta, perfil) {
  const { avaliar } = browser;
  const resultados = [], capturas = [], textos = [], pendencias = [], credenciais = [];
  const pin = await avaliar(`Boolean(window.ScrollTrigger?.getAll().some(t => t.pin && t.trigger?.matches('#hero,.hero')))`);
  for (const progresso of [0, 0.5, 1]) {
    const nome = progresso * 100 + '%';
    if (!pin && progresso) {
      pendencias.push('Pin do hero indisponível para a captura de ' + nome);
      continue;
    }
    await avaliar(`(() => {
      const t = window.ScrollTrigger?.getAll().find(x => x.pin && x.trigger?.matches('#hero,.hero'));
      const p = ${progresso};
      window.scrollTo({ top: t ? Math.round(t.start + (t.end - t.start) * p) : 0, behavior: 'instant' });
    })()`);
    if (pin) {
      try {
        await aguardar(() => avaliar(`(() => {
          const el = document.querySelector('#hero .hero-progresso span,.hero .hero-progresso span');
          return !el || Math.abs(new DOMMatrix(getComputedStyle(el).transform).a - ${progresso}) < 0.015;
        })()`), 'progresso de ' + nome, 2400);
      } catch {
        pendencias.push('O indicador do hero não confirmou ' + nome);
      }
    }
    await pausa(230);
    const arquivo = perfil.nome + '-hero-' + progresso * 100 + '.webp';
    await salvarCaptura(browser, pasta, arquivo);
    capturas.push({ arquivo, nome: 'Hero ' + nome });
    textos.push(await avaliar('document.body.innerText'));
    credenciais.push({ etapa: nome, ...await avaliar('dentistaQa.credenciais()') });
    const itens = await avaliar(`dentistaQa.textos(document.body, 'viewport').filter(x => x.complexo)`);
    resultados.push(...(await contrasteRaster(browser, itens)).map(x => ({ ...x, secao: x.secao + ' (hero ' + nome + ')' })));
  }
  return { resultados, capturas, textos, pendencias, credenciais };
}

async function capturarSecoes(browser, pasta, perfil, abertura) {
  const { avaliar } = browser;
  await avaliar(`scrollTo({top:0,behavior:'instant'})`);
  await pausa(180);
  const secoes = await avaliar('dentistaQa.partes()');
  const capturas = [], contraste = [];
  for (const secao of secoes) {
    const arquivo = perfil.nome + '-' + String(secao.ordem).padStart(2, '0') + '-' + slug(secao.nome) + '.webp';
    if (secao.hero) {
      if (abertura) {
        await writeFile(join(pasta, arquivo), await readFile(join(pasta, abertura.arquivo)));
        capturas.push({ arquivo, nome: secao.nome });
      }
      continue;
    }
    const clip = await avaliar(`(() => {
      const el = document.querySelectorAll('header,main > *,footer')[${secao.indice}];
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.floor(r.left + scrollX));
      const y = Math.max(0, Math.floor(r.top + scrollY));
      const scale = Math.min(1, 1/devicePixelRatio, 12000/r.height);
      return { x, y, width: Math.max(1,Math.min(document.documentElement.clientWidth-x,Math.ceil(r.width))), height: Math.max(1,Math.ceil(r.height)), scale };
    })()`);
    await salvarCaptura(browser, pasta, arquivo, clip);
    capturas.push({ arquivo, nome: secao.nome });
    const itens = await avaliar(`dentistaQa.textos(document.querySelectorAll('header,main > *,footer')[${secao.indice}], 'pagina').filter(x => x.complexo)`);
    contraste.push(...await contrasteRaster(browser, itens, clip));
  }
  return { capturas, contraste };
}

async function testarFoco(browser) {
  const { avaliar, mandar } = browser;
  await avaliar(`(() => { document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});dentistaQa.iniciarFoco(); })()`);
  await pausa(100);
  const passos = [];
  for (let i = 1; i <= 15; i++) {
    const tecla = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
    await mandar('Input.dispatchKeyEvent', { ...tecla, type: 'keyDown' });
    await mandar('Input.dispatchKeyEvent', { ...tecla, type: 'keyUp' });
    await pausa(60);
    const foco = await avaliar('dentistaQa.foco()');
    passos.push({ ordem: i, ...foco });
  }
  return passos;
}

async function montarFolha(browser, pasta, perfil, capturas) {
  await browser.mandar('Page.navigate', { url: 'about:blank' });
  await aguardar(() => browser.avaliar(`location.href === 'about:blank'`), 'área da folha de contato');
  const arquivos = await Promise.all(capturas.map(async c => ({
    nome: c.nome, dados: (await readFile(join(pasta, c.arquivo))).toString('base64')
  })));
  const dados = await browser.avaliar(`(async () => {
    const arquivos = ${JSON.stringify(arquivos)};
    const colunas = ${perfil.mobile ? 4 : 3};
    const w = ${perfil.mobile ? 220 : 340}, h = 320, margem = 16;
    const imagens = await Promise.all(arquivos.map(async arq => {
      const img = new Image();
      img.src = 'data:image/webp;base64,' + arq.dados;
      await img.decode();
      return img;
    }));
    const canvas = document.createElement('canvas');
    canvas.width = margem * 2 + colunas * w;
    canvas.height = 60 + Math.ceil(imagens.length / colunas) * h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e6ece7'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#18211f'; ctx.font = 'bold 20px system-ui';
    ctx.fillText('Dentista · ${perfil.nome} ${perfil.largura}×${perfil.altura} · DPR ${perfil.dpr}', margem, 30);
    for (const [i,img] of imagens.entries()) {
      const x = margem + i % colunas * w, y = 48 + Math.floor(i / colunas) * h;
      ctx.fillStyle = '#fff'; ctx.fillRect(x,y,w-12,h-13);
      const escala = Math.min((w-28)/img.width,(h-54)/img.height);
      ctx.drawImage(img,x + (w-12-img.width*escala)/2,y+8,img.width*escala,img.height*escala);
      ctx.fillStyle = '#18211f'; ctx.font = '14px system-ui';
      ctx.fillText(arquivos[i].nome,x+8,y+h-25,w-28);
    }
    return canvas.toDataURL('image/webp',0.88).split(',')[1];
  })()`);
  const arquivo = perfil.nome + '-contato.webp';
  await writeFile(join(pasta, arquivo), Buffer.from(dados, 'base64'));
  return arquivo;
}

function escreverRelatorio(pasta, dados) {
  const { resultado, problemas, erros, larguras, cfo, falha } = dados;
  const linhas = [
    '# QA do template dentista', '', 'Página verificada: ' + url, '',
    'Resultado: **' + (problemas.length ? 'FALHA' : 'APROVADO') + '**. Código de saída: ' + (problemas.length ? '1' : '0') + '.', ''
  ];
  if (problemas.length) linhas.push('## Regras bloqueadoras', '', ...problemas.map(x => '- ' + x), '');
  if (falha) linhas.push('A execução foi interrompida: ' + falha.message, '');
  linhas.push('## Largura', '', tabela(['Teste', 'Viewport', 'Documento', 'Excesso'], larguras.map(x => [x.nome, x.viewport + ' px', x.documento + ' px', Math.max(0, x.documento-x.viewport) + ' px'])), '');
  linhas.push('## Termos CFO no texto renderizado', '', cfo.length
    ? tabela(['Termo', 'Trecho'], cfo.map(x => [x.termo,x.amostra])) : 'Nenhuma ocorrência detectada.', '');
  linhas.push('## Console e rede', '', erros.length
    ? tabela(['Perfil', 'Erro'], erros.map(x => [x.perfil,x.mensagem])) : 'Nenhum erro capturado.', '');
  for (const item of resultado) {
    const falhas = item.contraste.filter(x => !x.complexo && x.proporcao < x.limite);
    const manual = item.contraste.filter(x => x.complexo);
    linhas.push('## ' + item.perfil.nome, '',
      (item.folha ? '[Folha de contato](' + item.folha + ')' : '') + ' ' + item.capturas.map(x => '[' + x.nome + '](' + x.arquivo + ')').join(' · '), '',
      '### Responsável técnico e CRO', '',
      tabela(['Hero', 'Perto do topo', 'Rodapé'], item.credenciais.map(x => [x.etapa,x.topo.junto ? x.topo.numero : 'par RT/CRO ausente',x.rodape.junto ? x.rodape.numero : 'par RT/CRO ausente'])), '',
      '### Imagens', '', item.imagens.length ? tabela(['Origem', 'Observação'], item.imagens.map(x => [x.origem,x.problema])) : 'As imagens visíveis carregaram e têm atributo alt.', '',
      '### Contraste de texto', '', 'Amostras: ' + item.contraste.length + '. Abaixo do mínimo: ' + falhas.length + '. Fundos complexos para revisão: ' + manual.length + '.', ''
    );
    if (falhas.length) linhas.push(tabela(['Seção', 'Elemento', 'Trecho', 'Medido', 'Mínimo'], falhas.map(x => [x.secao,x.elemento,x.trecho,x.proporcao.toFixed(2)+':1',x.limite+':1'])), '');
    if (manual.length) linhas.push(tabela(['Revisão visual do fundo', 'Trecho'], manual.map(x => [x.secao,x.trecho])), '');
    linhas.push('### Foco nos primeiros 15 Tabs', '', tabela(['Tab', 'Alvo', 'Indicador visível', 'Alvo encoberto'], item.foco.map(x => [x.ordem,x.alvo || '(sem foco na página)',x.indicador ? 'sim' : 'não',x.alvo ? x.encoberto ? 'sim' : 'não' : '—'])), '');
    if (item.perfil.mobile) linhas.push('### Alvos menores que 44 × 44 px', '',
      item.alvos.length ? tabela(['Alvo', 'Largura', 'Altura'], item.alvos.map(x => [x.alvo,x.largura+' px',x.altura+' px'])) : 'Nenhum alvo abaixo de 44 × 44 px.', '');
    if (item.pendencias.length) linhas.push(...item.pendencias.map(x => '- ' + x), '');
  }
  linhas.push('## Método e limites', '',
    'As regras bloqueadoras são termos CFO, ausência do par RT/CRO, erros de console ou rede e excesso horizontal em 360/390 px. O scanner CFO é lexical. O número de CRO é reconhecido pelo formato, inclusive quando provisório no modelo.', '',
    'O contraste usa cores CSS computadas e composição de fundos sólidos. Para fundos complexos nas seções e nas três etapas do hero, oculta o texto temporariamente e amostra o fundo rasterizado nos retângulos de texto. Itens sem amostras rasterizadas ficam sinalizados. A amostragem e os indicadores de foco heurísticos não substituem revisão manual. Alvos de 44 px são uma meta do projeto. [WCAG 2.2 — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)', '');
  return writeFile(join(pasta, 'relatorio.md'), linhas.join('\n'));
}

async function main() {
  const pasta = join(raiz, 'public/dentista/verification', dataPasta(new Date()));
  await mkdir(pasta, { recursive: true });
  const resultado = [], problemas = [], larguras = [], cfo = [];
  const consoleMap = new Map(), requisicoes = new Map();
  let perfilAtual = 'inicial', falha;
  let browser;
  function registrar(mensagem, imagem = false) {
    const chave = perfilAtual + '|' + mensagem;
    consoleMap.set(chave, { perfil: perfilAtual, mensagem, imagem });
  }
  try {
    const servidor = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    if (!servidor.ok) throw new Error('A página local respondeu HTTP ' + servidor.status);
    browser = await abrirChromium();
    browser.observar(({ method, params }) => {
      if (method === 'Runtime.exceptionThrown') {
        registrar(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
      } else if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
        registrar(params.args.map(x => x.value ?? x.description ?? x.type).join(' '));
      } else if (method === 'Log.entryAdded' && params.entry.level === 'error' && params.entry.source !== 'network') {
        registrar(params.entry.text + (params.entry.url ? ' · ' + params.entry.url : ''));
      } else if (method === 'Network.requestWillBeSent') {
        requisicoes.set(params.requestId, params.request.url);
      } else if (method === 'Network.responseReceived' && params.response.status >= 400) {
        registrar('HTTP ' + params.response.status + ' · ' + params.response.url, params.type === 'Image');
      } else if (method === 'Network.loadingFailed' && !params.canceled) {
        registrar(params.errorText + ' · ' + (requisicoes.get(params.requestId) || 'URL indisponível'), params.type === 'Image');
      }
    });
    for (const perfil of perfis) {
      perfilAtual = perfil.nome;
      await abrirPagina(browser, perfil);
      if (perfil.mobile) larguras.push({ nome: '390 px', ...await browser.avaliar('dentistaQa.medidaLargura()') });
      const hero = await capturarHero(browser, pasta, perfil);
      const secoes = await capturarSecoes(browser, pasta, perfil, hero.capturas[0]);
      const contraste = [...await browser.avaliar('dentistaQa.textos().filter(x => !x.complexo)'), ...hero.resultados, ...secoes.contraste];
      const imagens = await browser.avaliar('dentistaQa.imagens()');
      const alvos = perfil.mobile ? await browser.avaliar('dentistaQa.tamanhos()') : [];
      const foco = await testarFoco(browser);
      const capturas = [...hero.capturas, ...secoes.capturas];
      cfo.push(...verificarCFO(hero.textos));
      const item = { perfil, capturas, contraste, imagens, foco, alvos, credenciais: hero.credenciais, pendencias: hero.pendencias };
      resultado.push(item);
      item.folha = await montarFolha(browser, pasta, perfil, capturas);
    }
    perfilAtual = '360 px';
    await abrirPagina(browser, { ...perfis[1], largura: 360, nome: perfilAtual });
    larguras.push({ nome: perfilAtual, ...await browser.avaliar('dentistaQa.medidaLargura()') });
    await pausa(350);
  } catch (erro) {
    falha = erro;
    problemas.push('Falha operacional do QA.');
  } finally {
    await browser?.fechar().catch(erro => {
      falha ??= erro;
      problemas.push('A sessão temporária do Chromium não encerrou corretamente.');
    });
  }
  const erros = [...consoleMap.values()];
  for (const item of resultado) {
    item.imagens.push(...erros.filter(x => x.perfil === item.perfil.nome && x.imagem).map(x => ({
      origem: x.mensagem, problema: 'Solicitação de imagem falhou'
    })));
    for (const credencial of item.credenciais) {
      if (!credencial.topo.junto || !credencial.rodape.junto) {
        problemas.push('Par RT/CRO ausente em ' + item.perfil.nome + ', hero ' + credencial.etapa + '.');
      }
    }
  }
  const achados = [...new Map(cfo.map(x => [x.termo + '|' + x.amostra, x])).values()];
  if (achados.length) problemas.push('Termos CFO encontrados: ' + unica(achados.map(x => x.termo)).join(', ') + '.');
  if (erros.length) problemas.push(erros.length + ' erro(s) de console/rede.');
  for (const x of larguras) if (x.documento > x.viewport) problemas.push('Excesso horizontal no teste de ' + x.nome + ': ' + (x.documento-x.viewport) + ' px.');
  await escreverRelatorio(pasta, { resultado, problemas, erros, larguras, cfo: achados, falha });
  const contrastes = resultado.flatMap(x => x.contraste);
  const avisos = {
    imagens: resultado.flatMap(x => x.imagens).length,
    contraste: contrastes.filter(x => !x.complexo && x.proporcao < x.limite).length,
    fundos: contrastes.filter(x => x.complexo).length,
    foco: resultado.flatMap(x => x.foco).filter(x => !x.indicador || x.encoberto).length,
    alvos: resultado.flatMap(x => x.alvos).length
  };
  console.log('QA Dentista — ' + (problemas.length ? 'FALHA' : 'APROVADO'));
  console.log('Relatório: ' + relative(raiz, join(pasta, 'relatorio.md')));
  console.log('Largura: ' + larguras.map(x => x.nome + ' ' + x.documento + '/' + x.viewport + ' px').join(' · '));
  console.log('CFO: ' + achados.length + ' ocorrência(s) · Console/rede: ' + erros.length + ' erro(s)');
  console.log('Avisos: ' + Object.entries(avisos).map(([k,v]) => k + ' ' + v).join(' · '));
  for (const problema of problemas) console.log('- ' + problema);
  if (falha) console.error(falha.message);
  process.exitCode = problemas.length ? 1 : 0;
}

main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
