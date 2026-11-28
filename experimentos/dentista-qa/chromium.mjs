import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as pausa } from 'node:timers/promises';

export async function aguardar(condicao, descricao, limite = 8000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limite) {
    const valor = await condicao();
    if (valor) return valor;
    await pausa(75);
  }
  throw new Error('Tempo esgotado ao aguardar ' + descricao);
}

function navegadorInstalado() {
  const raiz = process.env.ProgramFiles || 'C:/Program Files';
  const raiz86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const candidatos = [
    process.env.DENTISTA_QA_CHROME,
    join(raiz, 'Google/Chrome/Application/chrome.exe'),
    join(raiz86, 'Microsoft/Edge/Application/msedge.exe'),
    join(raiz, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ];
  const executavel = candidatos.find(c => c && existsSync(c));
  if (!executavel) throw new Error('Informe o caminho do Chrome ou Edge em DENTISTA_QA_CHROME.');
  return executavel;
}

export async function abrirChromium() {
  const executavel = navegadorInstalado();
  const raiz = await realpath(tmpdir());
  const perfil = await mkdtemp(join(raiz, 'dentista-qa-'));
  const filho = spawn(executavel, [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--user-data-dir=' + perfil, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let erroProcesso;
  filho.on('error', erro => { erroProcesso = erro; });
  let ws;
  let sequencia = 0;
  const pendentes = new Map(), observadores = new Set();
  function mandar(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequencia;
      const timeout = setTimeout(() => {
        pendentes.delete(id);
        reject(new Error('Tempo esgotado no DevTools: ' + method));
      }, 22000);
      pendentes.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function avaliar(expression) {
    const resposta = await mandar('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (resposta.exceptionDetails) {
      const { exception, text } = resposta.exceptionDetails;
      throw new Error(exception?.description || text);
    }
    return resposta.result.value;
  }
  async function fechar() {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: ++sequencia, method: 'Browser.close' }));
      ws.close();
    }
    if (filho.exitCode === null && !erroProcesso) {
      await aguardar(() => filho.exitCode !== null || filho.signalCode, 'encerramento do Chromium', 2200)
        .catch(() => filho.kill());
    }
    const alvo = await realpath(perfil);
    if (dirname(alvo) !== raiz || !basename(alvo).startsWith('dentista-qa-')) {
      throw new Error('Perfil temporário saiu do diretório esperado: ' + alvo);
    }
    await rm(alvo, { recursive: true, force: true, maxRetries: 5, retryDelay: 180 });
  }
  try {
    const arquivoPorta = join(perfil, 'DevToolsActivePort');
    const porta = await aguardar(async () => {
      if (erroProcesso) throw erroProcesso;
      if (filho.exitCode !== null) throw new Error('Chromium encerrou antes de abrir o DevTools.');
      if (existsSync(arquivoPorta)) return (await readFile(arquivoPorta, 'utf8')).split(/\r?\n/)[0];
    }, 'porta do Chromium', 10000);
    const abas = await (await fetch('http://127.0.0.1:' + porta + '/json/list')).json();
    ws = new WebSocket(abas.find(aba => aba.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', ({ data }) => {
      const mensagem = JSON.parse(data);
      const resposta = pendentes.get(mensagem.id);
      if (resposta) {
        clearTimeout(resposta.timeout);
        pendentes.delete(mensagem.id);
        if (mensagem.error) resposta.reject(new Error(mensagem.error.message));
        else resposta.resolve(mensagem.result);
      } else if (mensagem.method) {
        for (const observar of observadores) observar(mensagem);
      }
    });
    ws.addEventListener('close', () => {
      for (const resposta of pendentes.values()) {
        clearTimeout(resposta.timeout);
        resposta.reject(new Error('Conexão com o DevTools fechada.'));
      }
      pendentes.clear();
    });
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(metodo => mandar(metodo)));
    await mandar('Network.setCacheDisabled', { cacheDisabled: true });
    return { mandar, avaliar, observar: fn => observadores.add(fn), fechar };
  } catch (erro) {
    await fechar().catch(() => {});
    throw erro;
  }
}
