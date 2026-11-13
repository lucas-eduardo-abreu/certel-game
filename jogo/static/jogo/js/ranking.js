/* Telão do ranking: busca o ranking do dia a cada 5 s (zera à meia-noite) e destaca o que mudou. */
(function () {
  'use strict';

  var INTERVALO_MS = 5000;
  var lista = document.getElementById('telao-ranking');
  var aviso = document.getElementById('telao-aviso');
  var titulo = document.getElementById('telao-titulo');
  var anterior = null;

  function milhar(numero) { return Number(numero).toLocaleString('pt-BR'); }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) { el.className = classe; }
    if (texto !== undefined) { el.textContent = texto; }
    return el;
  }

  function desenhar(ranking) {
    var atual = {};
    lista.textContent = '';
    if (!ranking.length) {
      lista.appendChild(elemento('li', 'vazio', 'Ninguém jogou ainda. Jogue em um dos totens para aparecer aqui.'));
    }
    ranking.forEach(function (linha) {
      var assinatura = linha.posicao + ':' + linha.pontuacao;
      atual[linha.jogador_id] = assinatura;
      var li = elemento('li');
      if (anterior && anterior[linha.jogador_id] !== assinatura) { li.className = 'mudou'; }
      li.appendChild(elemento('span', 'lugar', linha.posicao + 'º'));
      li.appendChild(elemento('span', 'nome', linha.nome));
      li.appendChild(elemento('span', 'totem', linha.totem));
      li.appendChild(elemento('span', 'pontos', milhar(linha.pontuacao)));
      lista.appendChild(li);
    });
    anterior = atual;
  }

  function atualizar() {
    fetch(window.CERTEL_RANKING_URL, { cache: 'no-store' })
      .then(function (resposta) {
        // Sessão expirada: recarrega para cair no login.
        if (resposta.status === 401 || resposta.status === 403) { window.location.reload(); }
        if (!resposta.ok) { throw new Error('HTTP ' + resposta.status); }
        return resposta.json();
      })
      .then(function (dados) {
        aviso.hidden = true;
        titulo.textContent = dados.titulo;
        desenhar(dados.ranking);
      })
      .catch(function () { aviso.hidden = false; });
  }

  atualizar();
  setInterval(atualizar, INTERVALO_MS);
})();
