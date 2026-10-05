/* Versão de demonstração de api.js: mesma interface (window.CertelAPI), sem
   servidor. O ranking fica só neste navegador. Usada por scripts/gerar_demo.py. */
(function () {
  'use strict';

  var CHAVE = 'certel_demo_ranking';
  var config = JSON.parse(document.getElementById('configuracao').textContent);
  var SEMENTE = [
    { jogador_id: 's1', nome: 'Rafael D.', pontuacao: 3200, totem: 'Totem 2' },
    { jogador_id: 's2', nome: 'André B.', pontuacao: 3100, totem: 'Totem 1' },
    { jogador_id: 's3', nome: 'Letícia F.', pontuacao: 2000, totem: 'Totem 3' },
    { jogador_id: 's4', nome: 'Mariana S.', pontuacao: 1500, totem: 'Totem 1' },
    { jogador_id: 's5', nome: 'Fernanda L.', pontuacao: 1200, totem: 'Totem 2' },
    { jogador_id: 's6', nome: 'Bruna S.', pontuacao: 1100, totem: 'Totem 3' },
    { jogador_id: 's7', nome: 'Tiago M.', pontuacao: 900, totem: 'Totem 1' }
  ];

  function ler() {
    try {
      var salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (Array.isArray(salvo)) { return salvo; }
    } catch (e) { /* sem armazenamento: usa a semente */ }
    return SEMENTE.slice();
  }

  function gravar(lista) {
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch (e) { /* ignora */ }
  }

  var jogadores = ler();
  var partidas = {};

  function nomePublico(nome) {
    var partes = nome.trim().toLowerCase().split(/\s+/).map(function (parte) {
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    });
    return partes.length > 1 ? partes[0] + ' ' + partes[partes.length - 1].charAt(0) + '.' : partes[0];
  }

  function classificar() {
    return jogadores
      .map(function (jogador, ordem) { return { jogador: jogador, ordem: ordem }; })
      .sort(function (a, b) { return b.jogador.pontuacao - a.jogador.pontuacao || a.ordem - b.ordem; })
      .map(function (item, indice) { return Object.assign({ posicao: indice + 1 }, item.jogador); });
  }

  function resolver(valor) {
    return new Promise(function (ok) { setTimeout(function () { ok(valor); }, 150); });
  }

  window.CertelAPI = {
    config: function () { return resolver(config); },
    ranking: function () {
      return resolver({ titulo: config.titulo, ranking: classificar().slice(0, config.tamanho_ranking) });
    },
    iniciar: function (dados) {
      var id = 'p' + Date.now();
      partidas[id] = { chave: dados.telefone || id, nome: nomePublico(dados.nome) };
      return resolver({ id: id, jogador: partidas[id].nome });
    },
    finalizar: function (id, dados) {
      var partida = partidas[id];
      var jogador = jogadores.filter(function (j) { return j.jogador_id === partida.chave; })[0];
      if (!jogador) {
        jogador = { jogador_id: partida.chave, nome: partida.nome, pontuacao: dados.pontuacao, totem: 'Demonstração' };
        jogadores.push(jogador);
      } else if (dados.pontuacao > jogador.pontuacao) {
        // Novo recorde: vai para o fim da fila de desempate, como no servidor.
        jogadores.splice(jogadores.indexOf(jogador), 1);
        jogador.pontuacao = dados.pontuacao;
        jogadores.push(jogador);
      }
      jogador.nome = partida.nome;
      gravar(jogadores);
      var ranking = classificar();
      var meu = ranking.filter(function (linha) { return linha.jogador_id === partida.chave; })[0];
      return resolver({
        pontuacao: dados.pontuacao,
        melhor_pontuacao: meu.pontuacao,
        posicao: meu.posicao,
        jogador_id: partida.chave,
        ranking: ranking.slice(0, config.tamanho_ranking)
      });
    }
  };
})();
