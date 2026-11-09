/* Roleta de sorteio do telão.
   O vencedor é sorteado no servidor (POST /api/roleta/); a tela só gira a roda
   até o nome que veio na resposta. Tipos: "diario" (quem jogou no dia escolhido)
   e "geral" (todos). Quem já foi sorteado não entra de novo no mesmo sorteio. */
(function () {
  'use strict';

  var $ = function (seletor) { return document.querySelector(seletor); };
  var dados = JSON.parse($('#roleta-dados').textContent);
  var meta = document.querySelector('meta[name="csrf-token"]');
  var csrf = meta ? meta.content : '';

  var ATUALIZAR_MS = 15000;
  var MIN_FATIAS = 8;
  var GIRO_LIVRE_MS = 1200;          // giro mínimo antes de começar a frear
  var VELOCIDADE = 2.2 * 2 * Math.PI; // rad/s no giro livre
  var VOLTAS_FREANDO = 4;
  var CORES = [
    { fundo: '#04a64b', texto: '#ffffff' },
    { fundo: '#004899', texto: '#ffffff' },
    { fundo: '#ffc20e', texto: '#000000' },
    { fundo: '#ffffff', texto: '#000000' }
  ];

  var canvas = $('#roleta-canvas');
  var ctx = canvas.getContext('2d');
  var estado = {
    tipo: dados.tipo,
    dia: null, // sem dia, o servidor usa hoje (fuso do evento)
    fatias: [],
    angulo: 0,
    girando: false
  };

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) { el.className = classe; }
    if (texto !== undefined) { el.textContent = texto; }
    return el;
  }

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

  /* ---------------- Desenho da roda ---------------- */

  function ajustarCanvas() {
    var lado = canvas.getBoundingClientRect().width;
    var escala = window.devicePixelRatio || 1;
    canvas.width = Math.round(lado * escala);
    canvas.height = Math.round(lado * escala);
    desenhar();
  }

  function desenhar() {
    var tamanho = canvas.width;
    var raio = tamanho / 2;
    var borda = Math.max(4, tamanho * 0.012);
    ctx.clearRect(0, 0, tamanho, tamanho);
    ctx.save();
    ctx.translate(raio, raio);

    var fatias = estado.fatias.length ? estado.fatias : ['Ninguém para sortear'];
    var passo = 2 * Math.PI / fatias.length;
    var r = raio - borda;
    var fonte = Math.max(12, Math.min(r * 0.085, r * passo * 0.42));
    ctx.font = '800 ' + fonte + 'px Boston, Montserrat, "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    fatias.forEach(function (nome, i) {
      var inicio = estado.angulo + i * passo;
      var cor = estado.fatias.length ? CORES[i % CORES.length] : { fundo: '#a9b0c6', texto: '#000000' };
      // Com número ímpar de fatias, evita duas fatias da mesma cor lado a lado.
      if (estado.fatias.length && i === fatias.length - 1 && i % CORES.length === 0) { cor = CORES[2]; }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, inicio, inicio + passo);
      ctx.closePath();
      ctx.fillStyle = cor.fundo;
      ctx.fill();
      ctx.lineWidth = borda * 0.5;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.save();
      ctx.rotate(inicio + passo / 2);
      ctx.fillStyle = cor.texto;
      var texto = nome.length > 16 ? nome.slice(0, 15) + '…' : nome;
      ctx.fillText(texto, r * 0.92, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.lineWidth = borda;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.restore();
  }

  /* Monta as fatias: repete os nomes até um mínimo, para a roda não ficar vazia. */
  function montarFatias(nomes) {
    var fatias = nomes.slice();
    while (fatias.length && fatias.length < MIN_FATIAS) { fatias = fatias.concat(nomes); }
    estado.fatias = fatias.slice(0, Math.max(MIN_FATIAS, nomes.length));
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
    $('#roleta-total').textContent = total === 1
      ? '1 pessoa concorrendo'
      : total.toLocaleString('pt-BR') + ' pessoas concorrendo';
    desenharGanhadores(corpo.sorteios);
    montarFatias(corpo.nomes);
    $('#roleta-girar').disabled = !total;
  }

  /* Não redesenha durante o giro nem com o vencedor na tela (a roda fica parada nele). */
  function ocupado() {
    return estado.girando || !$('#roleta-resultado').hidden;
  }

  function atualizar() {
    if (ocupado()) { return Promise.resolve(); }
    return pedir(urlEstado())
      .then(function (corpo) { if (!ocupado()) { aplicarEstado(corpo); } })
      .catch(function (erro) { $('#roleta-erro').textContent = erro.message; });
  }

  /* ---------------- Giro ---------------- */

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

  /* Ângulo final para que o meio da fatia `indice` pare sob o ponteiro (topo). */
  function anguloAlvo(indice) {
    var passo = 2 * Math.PI / estado.fatias.length;
    var folga = (Math.random() - 0.5) * passo * 0.6;
    var alvo = -Math.PI / 2 - (indice + 0.5) * passo + folga;
    var minimo = estado.angulo + VOLTAS_FREANDO * 2 * Math.PI;
    while (alvo < minimo) { alvo += 2 * Math.PI; }
    return alvo;
  }

  /* Freia da velocidade atual até `alvo` com ease-out cúbico (a derivada inicial casa com o giro livre). */
  function frearAte(alvo) {
    var inicio = estado.angulo;
    var distancia = alvo - inicio;
    var duracao = 3 * distancia / VELOCIDADE;
    var t0 = null;
    return animar(function (agora) {
      if (t0 === null) { t0 = agora; }
      var t = Math.min(1, (agora - t0) / 1000 / duracao);
      estado.angulo = inicio + distancia * (1 - Math.pow(1 - t, 3));
      return t < 1;
    });
  }

  /* Coloca o vencedor em uma fatia (se já estiver na roda, usa uma das dele). */
  function fatiaDoVencedor(nome) {
    var indices = [];
    estado.fatias.forEach(function (n, i) { if (n === nome) { indices.push(i); } });
    if (indices.length) { return indices[Math.floor(Math.random() * indices.length)]; }
    var indice = Math.floor(Math.random() * estado.fatias.length);
    estado.fatias[indice] = nome;
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

  // No celular a página rola: traz a roda inteira para a tela antes de girar.
  function mostrarRoda() {
    var caixa = $('.roleta-roda').getBoundingClientRect();
    if (caixa.top < 0 || caixa.bottom > window.innerHeight) {
      $('.roleta-roda').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function girar() {
    if (estado.girando || !estado.fatias.length) { return; }
    estado.girando = true;
    $('#roleta-girar').disabled = true;
    $('#roleta-erro').textContent = '';
    mostrarRoda();

    var resposta = null;
    var inicio = performance.now();
    var pedido = pedir(dados.api, {
      method: 'POST',
      body: JSON.stringify({ tipo: estado.tipo, dia: estado.dia })
    }).then(function (corpo) { resposta = { ok: corpo.sorteio }; }, function (erro) { resposta = { erro: erro }; });

    // Gira livre até o servidor responder (e por um tempo mínimo).
    animar(function (agora, dt) {
      estado.angulo += VELOCIDADE * dt;
      return !(resposta && agora - inicio >= GIRO_LIVRE_MS);
    })
      .then(function () { return pedido; })
      .then(function () {
        if (resposta.erro) {
          $('#roleta-erro').textContent = resposta.erro.message;
          return frearAte(estado.angulo + 2 * Math.PI);
        }
        var indice = fatiaDoVencedor(resposta.ok.nome_curto);
        return frearAte(anguloAlvo(indice)).then(function () { mostrarVencedor(resposta.ok); });
      })
      .then(function () {
        estado.angulo %= 2 * Math.PI;
        estado.girando = false;
        $('#roleta-girar').disabled = false;
        return atualizar();
      });
  }

  /* ---------------- Ligações ---------------- */

  function iniciar() {
    var titulos = { diario: 'Roleta do dia', geral: 'Roleta geral' };
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
    $('#roleta-girar').addEventListener('click', girar);
    $('#roleta-resultado-fechar').addEventListener('click', function () {
      $('#roleta-resultado').hidden = true;
      $('#roleta-girar').focus();
      atualizar();
    });

    window.addEventListener('resize', ajustarCanvas);
    ajustarCanvas();
    atualizar();
    setInterval(atualizar, ATUALIZAR_MS);
  }

  iniciar();
})();
