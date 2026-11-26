/*
 * Chame aplicar após o carregamento do iframe.
 * Pousada: #quartos .quartos-grid > .quarto, .quarto-corpo h3.
 * Dentista: #equipe .equipe > .membro, #tratamentos .servs > .serv.
 * Estética: #profissionais .profs > .prof, #tratamentos .trat-lista > .trat,
 *           #tratamentos [role="tablist"], #tratamentos [role="tabpanel"].
 * Advocacia: #advogados .advs > .adv, #areas .areas > .area.
 * Nos quatro: h3 nos cartões, textos de body (incluindo .marca e .logo),
 *             title, meta description/OG, mark.pend, button.previa,
 *             img[data-pendente] e a[href^="https://wa.me/"].
 * Construtora: title e .footer__wordmark[data-bind="marca.nome"].
 * Imobiliária: nenhum. A marca ONYX faz parte do empreendimento e das imagens.
 */
(function () {
  'use strict';

  const modelos = {
    pousada: {
      tipo: /pousada|hotel|hospedagem|chal[eé]s?/i,
      marca: 'Nome da Pousada',
      listas: { quartos: '#quartos .quartos-grid > .quarto' }
    },
    dentista: {
      tipo: /cl[ií]nica odontol[oó]gica|consult[oó]rio odontol[oó]gico|dentistas?|odontologia/i,
      marca: 'Nome da Clínica',
      listas: { dentistas: '#equipe .equipe > .membro', tratamentos: '#tratamentos .servs > .serv' },
      servicos: 'tratamentos'
    },
    estetica: {
      tipo: /cl[ií]nica de est[eé]tica|cl[ií]nica est[eé]tica|est[eé]tica|sal[aã]o de beleza|spa/i,
      marca: 'Nome da Clínica',
      listas: { profissionais: '#profissionais .profs > .prof', tratamentos: '#tratamentos .trat-lista > .trat' },
      servicos: 'tratamentos'
    },
    advocacia: {
      tipo: /escrit[oó]rio de advocacia|advocacia|advogad[oa]s?/i,
      marca: 'Nome do Escritório',
      listas: { advogados: '#advogados .advs > .adv', areas: '#areas .areas > .area' },
      servicos: 'areas'
    },
    construtora: { tipo: /construtora|incorporadora|empresa de constru[cç][aã]o/i },
    imobiliaria: { tipo: /imobili[aá]ria|corretor(?:a)? de im[oó]veis/i }
  };
  const contaveis = {
    quartos: 'quartos?',
    dentistas: 'dentistas?',
    tratamentos: '(?:tratamentos?|procedimentos?|servi[cç]os?)',
    profissionais: 'profissiona(?:l|is)',
    esteticistas: 'esteticistas?',
    advogados: 'advogad[oa]s?',
    areas: '[aá]reas?(?: de atua[cç][aã]o)?'
  };
  const numeros = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10
  };
  const letrasEDigitos = 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
  const palavra = '[' + letrasEDigitos + ']';
  const caractere = new RegExp(palavra);
  const inicioMaiusculo = /^[A-ZÀ-ÖØ-Þ]/;
  const fimCampo = /[,;.!?]|(?:^|\s)(?:em|no|na|com|oferece(?:mos)?|atende(?:mos)?|chamad[oa]|denominad[oa]|especializad[oa]|de(?=\s+\d))\s/i;
  const marcaPendente = /\[TROCAR\]/g;
  const marcaTexto = '\\[TROCAR\\]\\s*';
  const servicoExplicito = /(?:^|[\s,;])(?:oferece(?:mos)?|atua(?:mos)? em|trabalha(?:mos)? com|especializad[oa] em|com (?:servi[cç]os|tratamentos) de|servi[cç]os\s*:|tratamentos\s*:|[aá]reas(?: de atua[cç][aã]o)?\s*:)\s*/i;
  const areaJuridica = /^(?:(?:direito )?(?:trabalhista|previdenci[aá]ri[oa]|c[ií]vel|empresarial)|direito do consumidor|fam[ií]lia e sucess[oõ]es)(?![\wÀ-ÿ])/i;

  function semAcentos(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function campo(texto) {
    if (typeof texto !== 'string') return '';
    return texto.trim().replace(/\s+/g, ' ');
  }

  function trecho(texto) {
    const citado = texto.match(/^(?:"([^"]+)"|“([^”]+)”|'([^']+)')/);
    return campo(citado ? citado[1] || citado[2] || citado[3] : texto.split(fimCampo, 1)[0]);
  }

  function comPrefixo(texto, prefixo) {
    const achado = prefixo.exec(texto);
    return achado ? trecho(texto.slice(achado.index + achado[0].length)) : '';
  }

  function pareceNomeProprio(valor) {
    return inicioMaiusculo.test(valor) && valor.split(/\s+/).every(palavra =>
      inicioMaiusculo.test(palavra) || /^(?:de|do|da|dos|das|e|&)$/i.test(palavra));
  }

  function quantidade(texto, unidade) {
    const numero = '\\d+|' + Object.keys(numeros).join('|');
    const padrao = new RegExp('(?:^|\\s|[,;])(' + numero + ')\\s+' + unidade + '(?!' + palavra + ')', 'gi');
    const valores = new Set();
    let achado;
    while ((achado = padrao.exec(texto))) {
      const antes = texto.slice(0, achado.index);
      if (/(?:\d|\b(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez))\s*(?:a|ou|e|[-–,])?\s*$/i.test(antes) ||
          /(?:\bat[eé]|cerca de|mais de|menos de|pelo menos|entre|[+\-–])\s*$/i.test(antes)) continue;
      const valor = achado[1].toLowerCase();
      valores.add(/^\d+$/.test(valor) ? Number(valor) : numeros[valor]);
    }
    if (valores.size === 1) {
      const valor = valores.values().next().value;
      if (Number.isSafeInteger(valor)) return valor;
    }
  }

  function analisar(descricao) {
    let texto = campo(descricao).normalize('NFC');
    if (!texto) return {};
    const info = {};
    let inicio;
    for (const [segmento, modelo] of Object.entries(modelos)) {
      const achado = new RegExp('(?:^|[^' + letrasEDigitos + '])(?:' + modelo.tipo.source + ')(?!' + palavra + ')', 'i').exec(texto);
      if (!achado) continue;
      if (!inicio || achado.index < inicio.index) {
        info.segmento = segmento;
        inicio = achado;
      }
    }
    const complemento = inicio ? texto.slice(inicio.index + inicio[0].length).trim() : '';
    const nomeExplicito = comPrefixo(texto, /(?:^|\s)(?:chamad[oa]|denominad[oa]|de nome|nome\s*:)\s*/i);
    const nomePossivel = trecho(complemento);
    const pareceNome = pareceNomeProprio(nomePossivel) &&
      !/^(?:De|Do|Da|Dos|Das|E|Para)(?:\s|$)/i.test(nomePossivel) &&
      !(info.segmento === 'advocacia' && areaJuridica.test(nomePossivel));
    if (nomeExplicito || pareceNome) {
      info.nome = nomeExplicito || nomePossivel;
      texto = texto.replace(info.nome, ' ');
    }

    const cidade = comPrefixo(texto, /(?:^|\s)(?:cidade de|cidade\s*:)\s*/i);
    const bairro = comPrefixo(texto, /(?:^|\s)bairro(?:\s*:\s*|\s+(?:(?:de|do|da)\s+)?)/i);
    const local = comPrefixo(texto, /(?:^|\s)em\s+/i);
    const praia = comPrefixo(texto, /(?:^|\s)(?:na|no)\s+(?=Pinheira(?:\s|[,;.!?]|$)|praia\s)/i);
    const semUf = valor => valor.replace(/\s*[/–-]\s*[A-Z]{2}$/, '').trim();
    const localNomeado = pareceNomeProprio(semUf(local)) && !/^(?:[A-Z]{2}|Brasil|Santa Catarina)$/.test(semUf(local));
    const localPraia = /^(?:pinheira$|praia\s)/i.test(semUf(local));
    if (cidade || (localNomeado && !localPraia)) info.cidade = semUf(cidade || local);
    if (bairro || praia || localPraia) info.bairro = semUf(bairro || praia || local);

    const quantidades = {};
    for (const [chave, unidade] of Object.entries(contaveis)) {
      const total = quantidade(texto, unidade);
      if (total !== undefined) quantidades[chave] = total;
    }
    if (Object.keys(quantidades).length) info.quantidades = quantidades;

    const lista = servicoExplicito.exec(texto);
    const afirmativo = lista && !/\b(?:n[aã]o|nunca)\s*$/i.test(texto.slice(0, lista.index));
    const especialidade = info.segmento === 'advocacia' && complemento.match(areaJuridica);
    const servicos = afirmativo ? texto.slice(lista.index + lista[0].length)
      .split(/(?:\s+(?:em|com|no|na|chamad[oa])\s+)|[;.!?]/i, 1)[0]
      .split(/,|\s+e\s+(?!sucess[oõ]es\b|preven[cç][aã]o\b)/i)
      .map(campo).filter(item => /[A-Za-zÀ-ÿ]/.test(item) && !/^(?:\d|(?:n[aã]o|sem|exceto)\s)/i.test(item)) : [];
    if (especialidade) servicos.unshift(especialidade[0]);
    if (servicos.length) info.servicos = Array.from(new Set(servicos));
    return info;
  }

  function nosTexto(doc, raiz) {
    const walker = doc.createTreeWalker(raiz, 4); // SHOW_TEXT no documento do iframe.
    const nos = [];
    while (walker.nextNode()) {
      const no = walker.currentNode;
      if (!no.parentElement.closest('script, style, noscript, mark.pend, button.previa')) nos.push(no);
    }
    return nos;
  }

  function termosDe(modelo, info) {
    return [
      [modelo.marca, campo(info.nome)],
      ['Cidade', campo(info.cidade)],
      [modelo === modelos.pousada ? 'Bairro ou praia' : 'Bairro', campo(info.bairro)]
    ].filter(([, valor]) => valor);
  }

  function atualizarTexto(doc, termos) {
    if (!termos.length) return;
    const valores = new Map(termos);
    const padrao = new RegExp('(' + marcaTexto + ')?(' + Array.from(valores.keys()).join('|') + ')(?!' + palavra + ')', 'g');
    const trocar = (texto, aoTrocar) => texto.replace(padrao, (original, marca, chave, indice) => {
      if (indice > 0 && caractere.test(texto[indice - 1])) return original;
      if (aoTrocar) aoTrocar(indice);
      return valores.get(chave);
    });

    nosTexto(doc, doc.body).forEach(no => {
      const anterior = no.previousSibling;
      const novo = trocar(no.nodeValue, indice => {
        if (!no.nodeValue.slice(0, indice).trim() && anterior && anterior.nodeType === 1 && anterior.matches('mark.pend')) {
          anterior.remove();
          no.parentElement.classList.remove('pend-foco');
        }
      });
      if (novo !== no.nodeValue) no.nodeValue = novo;
    });
    doc.title = trocar(doc.title);
    doc.querySelectorAll('meta[name="description"], meta[property="og:site_name"], meta[property="og:title"], meta[property="og:description"]').forEach(meta => {
      const conteudo = meta.getAttribute('content');
      if (conteudo) meta.setAttribute('content', trocar(conteudo));
    });
  }

  function ocultar(item, oculto) {
    item.hidden = oculto;
    item.toggleAttribute('data-jl-oculto', oculto);
    if (oculto) item.style.setProperty('display', 'none', 'important');
    else item.style.removeProperty('display');
  }

  function rotuloServico(texto) {
    return semAcentos(campo(texto)).replace(/^(?:direito (?!do consumidor$)(?:de |do )?|area de )/, '')
      .replace(/^(?:implante(?:s)?(?: dentari[oa]s?)?)$/, 'implantes')
      .replace(/^clareamento dental$/, 'clareamento')
      .replace(/^limpeza$/, 'limpeza e prevencao')
      .replace(/^previdenciaria$/, 'previdenciario');
  }

  function ajustarLista(doc, seletor, quantidade, servicos) {
    const itens = Array.from(doc.querySelectorAll(seletor));
    if (!itens.length) return false;
    const titulos = Array.isArray(servicos) ? servicos.map(rotuloServico).filter(Boolean) : [];
    const preferidos = itens.filter(item => {
      const titulo = item.querySelector('h3');
      return titulo && titulos.includes(rotuloServico(titulo.textContent));
    });
    const total = Number.isSafeInteger(quantidade) && quantidade >= 0 ? Math.min(quantidade, 8) : undefined;
    if (total === undefined && !preferidos.length) return false;

    const ordem = preferidos.concat(itens.filter(item => !preferidos.includes(item)));
    const modelo = ordem[ordem.length - 1];
    while (ordem.length < total) {
      const clone = modelo.cloneNode(true);
      // A animação original só observa os cartões montados pelo template.
      clone.classList.remove('rev', 'pend-foco');
      modelo.parentElement.appendChild(clone);
      ordem.push(clone);
    }
    ordem.forEach((item, indice) => {
      const fora = indice >= (total === undefined ? preferidos.length : total);
      ocultar(item, fora);
      const titulo = item.querySelector('h3');
      if (fora || !titulo) return;
      const atual = campo(titulo.textContent.replace(marcaPendente, '').replace(/^Trocar\s*/, ''));
      const numero = atual.match(/^(.*\S)\s+\d+$/);
      if (!numero) return;
      const novo = numero[1] + ' ' + (indice + 1);
      titulo.textContent = novo;
      titulo.classList.remove('pend-foco');
      item.querySelectorAll('a[href^="https://wa.me/"]').forEach(link => {
        const url = new URL(link.href);
        const mensagem = url.searchParams.get('text');
        if (!mensagem || !mensagem.includes('“' + atual + '”')) return;
        url.searchParams.set('text', mensagem.replace('“' + atual + '”', '“' + novo + '”'));
        link.href = url.toString();
      });
    });
    return true;
  }

  function reunirTratamentos(doc) {
    const secao = doc.getElementById('tratamentos');
    const abas = secao.querySelector('[role="tablist"]');
    if (!abas) return;
    // A lista personalizada pode reunir itens de categorias diferentes.
    const lista = doc.createElement('ul');
    lista.className = 'trat-lista';
    secao.querySelectorAll('.trat-lista > .trat').forEach(item => lista.appendChild(item));
    abas.replaceWith(lista);
    secao.querySelectorAll('[role="tabpanel"]').forEach(painel => painel.remove());
  }

  function atualizarBadge(doc) {
    const badge = doc.querySelector('button.previa');
    if (!badge) return;
    const dentroDaLista = item => !item.closest('[data-jl-oculto]');
    const textos = Array.from(doc.querySelectorAll('mark.pend')).filter(dentroDaLista).length +
      nosTexto(doc, doc.body).reduce((total, no) => total +
        (dentroDaLista(no.parentElement) ? (no.nodeValue.match(marcaPendente) || []).length : 0), 0);
    const fotos = Array.from(doc.querySelectorAll('img[data-pendente]')).filter(dentroDaLista).length;
    const rotulo = badge.querySelector('span');
    const no = rotulo && rotulo.firstChild;
    if (!no || no.nodeType !== 3) return;
    const whatsapp = /· WhatsApp/.test(no.nodeValue);
    no.nodeValue = no.nodeValue
      .replace(/(Prévia:\s*|Faltam\s+)\d+(?=\s*\[TROCAR\])/, (_, inicio) => inicio + textos)
      .replace(/\d+(?=\s+fotos\b)/, String(fotos));
    ocultar(badge, !textos && !fotos && !whatsapp);
  }

  function aplicar(doc, template, info) {
    try {
      if (!doc || !doc.body || !info || !Object.prototype.hasOwnProperty.call(modelos, template)) return;
      const modelo = modelos[template];
      if (template === 'construtora') {
        const nome = campo(info.nome);
        if (!nome) return;
        doc.querySelectorAll('.footer__wordmark[data-bind="marca.nome"]').forEach(el => {
          if (el.textContent.trim() === 'ARQUEN') el.textContent = nome;
        });
        doc.title = doc.title.replace(/^ARQUEN\b/i, () => nome);
        return;
      }
      if (!modelo.listas) return;

      const termos = termosDe(modelo, info);
      atualizarTexto(doc, termos);
      const quantidades = info.quantidades || {};
      let mudouLista = false;
      for (const [chave, seletor] of Object.entries(modelo.listas)) {
        const servicos = chave === modelo.servicos ? info.servicos : undefined;
        const mudou = ajustarLista(doc, seletor, quantidades[chave], servicos);
        if (mudou && template === 'estetica' && chave === 'tratamentos') reunirTratamentos(doc);
        mudouLista = mudouLista || mudou;
      }
      if (termos.length || mudouLista) atualizarBadge(doc);
    } catch {
      // Uma prévia incompleta não deve interromper a página principal.
    }
  }

  window.JLPersonaliza = { analisar, aplicar };
}());
