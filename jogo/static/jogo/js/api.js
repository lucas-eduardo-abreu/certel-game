/* Comunicação do totem com o servidor.
   Expõe window.CertelAPI com: config(), ranking(), iniciar(dados), finalizar(id, dados).
   Erros de regra (HTTP 400) chegam com `erro.negocio = true` e a mensagem do servidor.
   Na prévia do admin (rotas.previa), iniciar e finalizar não vão ao servidor. */
(function () {
  'use strict';

  var rotas = JSON.parse(document.getElementById('rotas').textContent);
  var meta = document.querySelector('meta[name="csrf-token"]');
  var csrf = meta ? meta.content : '';
  var UUID_ZERO = '00000000-0000-0000-0000-000000000000';
  var TEMPO_LIMITE_MS = 8000;

  function pedir(url, opcoes) {
    var controle = new AbortController();
    var relogio = setTimeout(function () { controle.abort(); }, TEMPO_LIMITE_MS);
    var base = {
      credentials: 'same-origin',
      signal: controle.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf }
    };
    return fetch(url, Object.assign(base, opcoes || {}))
      .then(function (resposta) {
        return resposta.json().catch(function () { return {}; }).then(function (corpo) {
          if (resposta.ok) { return corpo; }
          // Sessão expirada ou totem desativado: volta para o login.
          if (resposta.status === 401 || resposta.status === 403) { window.location.reload(); }
          var erro = new Error(corpo.erro || corpo.detail || 'Erro no servidor.');
          erro.negocio = resposta.status === 400;
          throw erro;
        });
      })
      .finally(function () { clearTimeout(relogio); });
  }

  var api = {
    config: function () { return pedir(rotas.config); },
    ranking: function () { return pedir(rotas.ranking); },
    iniciar: function (dados) {
      return pedir(rotas.iniciar, { method: 'POST', body: JSON.stringify(dados) });
    },
    finalizar: function (id, dados) {
      return pedir(rotas.finalizar.replace(UUID_ZERO, id), {
        method: 'POST',
        body: JSON.stringify(dados)
      });
    }
  };

  if (rotas.previa) {
    api.iniciar = function (dados) {
      return Promise.resolve({ id: UUID_ZERO, jogador: dados.nome });
    };
    api.finalizar = function (id, dados) {
      return api.ranking().then(function (corpo) {
        return { pontuacao: dados.pontuacao, posicao: null, jogador_id: null, ranking: corpo.ranking };
      });
    };
  }

  window.CertelAPI = api;
})();
