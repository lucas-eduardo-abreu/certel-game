/* Efeitos sonoros sintetizados (Web Audio), sem arquivos de áudio.
   Expõe window.CertelSom. O navegador só libera áudio depois de um toque:
   chame destravar() dentro de um evento de toque/clique. */
(function () {
  'use strict';

  var contexto = null;
  var ligado = true;

  function garantir() {
    if (!ligado) { return null; }
    if (!contexto) {
      var Classe = window.AudioContext || window.webkitAudioContext;
      if (!Classe) { return null; }
      try { contexto = new Classe(); } catch (e) { return null; }
    }
    if (contexto.state === 'suspended') { contexto.resume().catch(function () {}); }
    return contexto;
  }

  function tom(frequencia, duracao, opcoes) {
    var ctx = garantir();
    if (!ctx) { return; }
    opcoes = opcoes || {};
    var inicio = ctx.currentTime + (opcoes.atraso || 0);
    var oscilador = ctx.createOscillator();
    var ganho = ctx.createGain();
    oscilador.type = opcoes.onda || 'triangle';
    oscilador.frequency.setValueAtTime(frequencia, inicio);
    if (opcoes.ate) { oscilador.frequency.exponentialRampToValueAtTime(opcoes.ate, inicio + duracao); }
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(opcoes.volume || 0.22, inicio + 0.015);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    oscilador.connect(ganho).connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao + 0.03);
  }

  window.CertelSom = {
    ligar: function (valor) { ligado = !!valor; },
    destravar: function () { garantir(); },
    toque: function () { tom(520, 0.06, { volume: 0.12 }); },
    coleta: function () {
      tom(784, 0.09);
      tom(1175, 0.14, { atraso: 0.07 });
    },
    dano: function () { tom(220, 0.28, { onda: 'sawtooth', ate: 70, volume: 0.26 }); },
    contagem: function () { tom(440, 0.14, { onda: 'square', volume: 0.14 }); },
    largada: function () { tom(880, 0.4, { onda: 'square', volume: 0.16 }); },
    fim: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tom(f, 0.22, { atraso: i * 0.12 }); });
    }
  };
})();
