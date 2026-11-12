/* Sorteio do telão: os nomes passam na vertical e param no vencedor.
   O vencedor é sorteado no servidor (POST /api/roleta/); a tela só anima a
   faixa até o nome que veio na resposta. Tipos: "diario" (quem jogou no dia
   escolhido; um sorteio por dia) e "geral" (todos). Quem já foi sorteado não
   entra de novo no mesmo sorteio. */
(function () {
  'use strict';

  var $ = function (seletor) { return document.querySelector(seletor); };
  var dados = JSON.parse($('#roleta-dados').textContent);
  var meta = document.querySelector('meta[name="csrf-token"]');
  var csrf = meta ? meta.content : '';

  var ATUALIZAR_MS = 15000;
  var LINHAS = 7;              // nomes visíveis na janela (ímpar)
  var CENTRO = (LINHAS - 1) / 2;
  var GIRO_LIVRE_MS = 1500;    // tempo mínimo passando rápido antes de frear
  var VELOCIDADE = 16;         // nomes por segundo no giro livre
  var LINHAS_FREANDO = 30;     // quantos nomes ainda passam enquanto freia

  var janela = $('#sorteio-janela');
  var faixa = $('#sorteio-faixa');
  var estado = {
    tipo: dados.tipo,
    dia: null, // sem dia, o servidor usa hoje (fuso do evento)
    nomes: [],      // participantes (amostra vinda do servidor)
    faixa: [],      // o que passa na janela: os nomes e, se forem poucos, linhas vazias
    encerrado: false,
    pos: 0,    // qual nome está no topo da janela (a fração é quanto já subiu)
    girando: false
  };

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) { el.className = classe; }
    if (texto !== undefined) { el.textContent = texto; }
    return el;
  }

  function modulo(a, n) { return ((a % n) + n) % n; }

  function diaFormatado(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function hojeIso() {
    var d = new Date();
    var mes = String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() + '-' + mes + '-' + String(d.getDate()).padStart(2, '0');
  }

  function pedir(url, opcoes) {
    var base = {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf }
    };
    return fetch(url, Object.assign(base, opcoes || {})).then(function (resposta) {
      return resposta.json().catch(function () { return {}; }).then(function (corpo) {
        if (resposta.ok) { return corpo; }
        // Sessão expirada: recarrega para cair no login.
        if (resposta.status === 401 || resposta.status === 403) { window.location.reload(); }
        throw new Error(corpo.erro || corpo.detail || 'Erro no servidor.');
      });
    });
  }

  /* ---------------- Faixa de nomes ----------------
     Uma faixa "infinita": só existem LINHAS + 1 elementos, e a cada quadro
     eles recebem os nomes a partir de `estado.pos`. O nome da linha CENTRO
     é o que fica sob a mira. */

  function montarLinhas() {
    faixa.textContent = '';
    for (var i = 0; i <= LINHAS; i++) { faixa.appendChild(elemento('li')); }
  }

  function desenhar() {
    var linhas = faixa.children;
    var nomes = estado.faixa;
    var base = Math.floor(estado.pos);
    var fracao = estado.pos - base;
    var noMeio = CENTRO + (fracao >= 0.5 ? 1 : 0);
    for (var i = 0; i < linhas.length; i++) {
      var texto = '';
      if (nomes.length) { texto = nomes[modulo(base + i, nomes.length)]; }
      else if (i === CENTRO) { texto = 'Ninguém para sortear'; }
      linhas[i].textContent = texto;
      linhas[i].classList.toggle('centro', i === noMeio);
    }
    // Cada linha ocupa 1/(LINHAS + 1) da altura da faixa.
    faixa.style.transform = 'translateY(' + (-fracao * 100 / (LINHAS + 1)) + '%)';
  }

  /* Com poucos nomes, completa a volta com linhas vazias para o mesmo nome
     nunca aparecer duas vezes na janela ao mesmo tempo. */
  function montarFaixa() {
    var lista = estado.nomes.slice();
    if (lista.length) {
      while (lista.length < LINHAS + 1) { lista.push(''); }
    }
    estado.faixa = lista;
  }

  function montarNomes(nomes) {
    estado.nomes = nomes.slice();
    montarFaixa();
    // Em repouso, o primeiro nome fica sob a mira.
    estado.pos = estado.faixa.length ? modulo(-CENTRO, estado.faixa.length) : 0;
    desenhar();
  }

  /* ---------------- Estado vindo do servidor ---------------- */

  function urlEstado() {
    var params = new URLSearchParams({ tipo: estado.tipo });
    if (estado.tipo === 'diario' && estado.dia) { params.set('dia', estado.dia); }
    return dados.api + '?' + params.toString();
  }

  function desenharDias(dias) {
    var select = $('#roleta-dia');
    var lista = dias.slice();
    if (lista.indexOf(hojeIso()) === -1) { lista.unshift(hojeIso()); }
    if (estado.dia && lista.indexOf(estado.dia) === -1) { lista.unshift(estado.dia); }
    select.textContent = '';
    lista.forEach(function (iso) {
      var opcao = elemento('option', '', iso === hojeIso() ? 'Hoje, ' + diaFormatado(iso) : diaFormatado(iso));
      opcao.value = iso;
      select.appendChild(opcao);
    });
    select.value = estado.dia;
  }

  function desenharGanhadores(sorteios) {
    var ol = $('#roleta-ganhadores');
    ol.textContent = '';
    if (!sorteios.length) {
      ol.appendChild(elemento('li', 'vazio', 'Ninguém sorteado ainda.'));
      return;
    }
    sorteios.forEach(function (s) {
      var li = elemento('li');
      li.appendChild(elemento('span', 'nome', s.nome));
      if (s.telefone_final) { li.appendChild(elemento('span', 'telefone', 'final ' + s.telefone_final)); }
      ol.appendChild(li);
    });
  }

  function aplicarEstado(corpo) {
    estado.dia = corpo.dia;
    if (corpo.tipo === 'diario') { desenharDias(corpo.dias); }
    var total = corpo.total;
    var texto = total === 1
      ? '1 pessoa concorrendo'
      : total.toLocaleString('pt-BR') + ' pessoas concorrendo';
    if (corpo.somente_top) { texto += ' · top ' + corpo.somente_top + ' do ranking'; }
    $('#roleta-total').textContent = texto;
    desenharGanhadores(corpo.sorteios);
    montarNomes(corpo.nomes);
    estado.encerrado = Boolean(corpo.encerrado);
    var botao = $('#roleta-girar');
    botao.textContent = estado.encerrado ? 'Sorteio do dia já feito' : 'Sortear';
    botao.disabled = !total || estado.encerrado;
  }

  /* Não redesenha durante o sorteio nem com o vencedor na tela (a faixa fica parada nele). */
  function ocupado() {
    return estado.girando || !$('#roleta-resultado').hidden;
  }

  function atualizar() {
    if (ocupado()) { return Promise.resolve(); }
    return pedir(urlEstado())
      .then(function (corpo) { if (!ocupado()) { aplicarEstado(corpo); } })
      .catch(function (erro) { $('#roleta-erro').textContent = erro.message; });
  }

  /* ---------------- Sorteio ---------------- */

  function animar(passo) {
    return new Promise(function (resolver) {
      var anterior = null;
      function quadro(agora) {
        if (anterior === null) { anterior = agora; }
        var continuar = passo(agora, (agora - anterior) / 1000);
        anterior = agora;
        desenhar();
        if (continuar) { requestAnimationFrame(quadro); } else { resolver(); }
      }
      requestAnimationFrame(quadro);
    });
  }

  /* Posição final (inteira) que deixa o nome `indice` sob a mira. */
  function posicaoAlvo(indice) {
    var alvo = Math.ceil(estado.pos + LINHAS_FREANDO);
    return alvo + modulo(indice - CENTRO - alvo, estado.faixa.length);
  }

  /* Freia da velocidade atual até `alvo` com ease-out cúbico (a derivada inicial casa com o giro livre). */
  function frearAte(alvo) {
    var inicio = estado.pos;
    var distancia = alvo - inicio;
    var duracao = 3 * distancia / VELOCIDADE;
    var t0 = null;
    return animar(function (agora) {
      if (t0 === null) { t0 = agora; }
      var t = Math.min(1, (agora - t0) / 1000 / duracao);
      estado.pos = inicio + distancia * (1 - Math.pow(1 - t, 3));
      janela.classList.toggle('rapido', t < 0.45);
      return t < 1;
    });
  }

  /* Garante o vencedor na faixa (a lista é uma amostra) e devolve a posição dele. */
  function indiceDoVencedor(nome) {
    var indices = [];
    estado.faixa.forEach(function (n, i) { if (n === nome) { indices.push(i); } });
    if (indices.length) { return indices[Math.floor(Math.random() * indices.length)]; }
    // Fora da amostra: entra no lugar de outro nome (nunca numa linha vazia).
    var cheios = [];
    estado.faixa.forEach(function (n, i) { if (n) { cheios.push(i); } });
    var indice = cheios[Math.floor(Math.random() * cheios.length)];
    estado.faixa[indice] = nome;
    return indice;
  }

  function mostrarVencedor(sorteio) {
    $('#roleta-resultado-nome').textContent = sorteio.nome;
    var info = sorteio.telefone_final ? 'Telefone final ' + sorteio.telefone_final + ' · ' : '';
    info += 'entre ' + sorteio.participantes.toLocaleString('pt-BR') + ' participantes';
    $('#roleta-resultado-info').textContent = info;
    $('#roleta-resultado').hidden = false;
    $('#roleta-resultado-fechar').focus();
  }

  // No celular a página rola: traz a janela inteira para a tela antes de sortear.
  function mostrarJanela() {
    var caixa = janela.getBoundingClientRect();
    if (caixa.top < 0 || caixa.bottom > window.innerHeight) {
      janela.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function sortear() {
    if (estado.girando || !estado.nomes.length || estado.encerrado) { return; }
    estado.girando = true;
    $('#roleta-girar').disabled = true;
    $('#roleta-erro').textContent = '';
    janela.classList.remove('parou');
    janela.classList.add('rapido');
    mostrarJanela();

    var resposta = null;
    var inicio = performance.now();
    var pedido = pedir(dados.api, {
      method: 'POST',
      body: JSON.stringify({ tipo: estado.tipo, dia: estado.dia })
    }).then(function (corpo) { resposta = { ok: corpo.sorteio }; }, function (erro) { resposta = { erro: erro }; });

    // Os nomes passam rápido até o servidor responder (e por um tempo mínimo).
    animar(function (agora, dt) {
      estado.pos += VELOCIDADE * dt;
      return !(resposta && agora - inicio >= GIRO_LIVRE_MS);
    })
      .then(function () { return pedido; })
      .then(function () {
        if (resposta.erro) {
          $('#roleta-erro').textContent = resposta.erro.message;
          return frearAte(Math.ceil(estado.pos + 6));
        }
        var indice = indiceDoVencedor(resposta.ok.nome_curto);
        return frearAte(posicaoAlvo(indice)).then(function () {
          janela.classList.add('parou');
          mostrarVencedor(resposta.ok);
        });
      })
      .then(function () {
        janela.classList.remove('rapido');
        estado.girando = false;
        $('#roleta-girar').disabled = estado.encerrado;
        return atualizar();
      });
  }

  /* ---------------- Ligações ---------------- */

  function iniciar() {
    var titulos = { diario: 'Sorteio do dia', geral: 'Sorteio geral' };
    $('#roleta-titulo').textContent = titulos[estado.tipo];
    document.title = titulos[estado.tipo] + ' — ' + document.title.split(' — ').pop();
    $('#roleta-dia-campo').hidden = estado.tipo !== 'diario';

    Array.prototype.forEach.call(document.querySelectorAll('[data-tipo]'), function (aba) {
      var ativa = aba.dataset.tipo === estado.tipo;
      aba.setAttribute('aria-selected', ativa ? 'true' : 'false');
      aba.addEventListener('click', function () {
        if (!ativa && !estado.girando) {
          window.location.href = dados.url + (aba.dataset.tipo === 'geral' ? '?tipo=geral' : '');
        }
      });
    });

    $('#roleta-dia').addEventListener('change', function (evento) {
      estado.dia = evento.target.value;
      atualizar();
    });
    $('#roleta-girar').addEventListener('click', sortear);
    $('#roleta-resultado-fechar').addEventListener('click', function () {
      $('#roleta-resultado').hidden = true;
      janela.classList.remove('parou');
      $('#roleta-girar').focus();
      atualizar();
    });

    montarLinhas();
    desenhar();
    atualizar();
    setInterval(atualizar, ATUALIZAR_MS);
  }

  iniciar();
})();
