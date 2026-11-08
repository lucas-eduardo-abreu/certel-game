/* Sons do jogo, sintetizados no navegador (Web Audio), sem arquivos de áudio:
   efeitos (toque, coleta, dano...) e a música da partida.

   Expõe window.CertelSom. O navegador só libera áudio depois de um toque:
   chame destravar() dentro de um evento de toque/clique.

   A música é uma composição original em dó maior (8 compassos em laço), com
   melodia, baixo e percussão. Para trocar a melodia, edite MELODIA e BAIXO. */
(function () {
  'use strict';

  var contexto = null;
  var efeitosLigados = true;
  var musicaLigada = true;
  var ruido = null;

  function obterContexto() {
    if (!contexto) {
      var Classe = window.AudioContext || window.webkitAudioContext;
      if (!Classe) { return null; }
      try { contexto = new Classe(); } catch (e) { return null; }
    }
    if (contexto.state === 'suspended') { contexto.resume().catch(function () {}); }
    return contexto;
  }

  /* Toca uma nota. opcoes: em (instante absoluto), atraso, onda, volume, ate (glissando), destino. */
  function nota(frequencia, duracao, opcoes) {
    var ctx = obterContexto();
    if (!ctx) { return; }
    opcoes = opcoes || {};
    var inicio = opcoes.em !== undefined ? opcoes.em : ctx.currentTime + (opcoes.atraso || 0);
    var oscilador = ctx.createOscillator();
    var ganho = ctx.createGain();
    oscilador.type = opcoes.onda || 'triangle';
    oscilador.frequency.setValueAtTime(frequencia, inicio);
    if (opcoes.ate) { oscilador.frequency.exponentialRampToValueAtTime(opcoes.ate, inicio + duracao); }
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(opcoes.volume || 0.22, inicio + 0.015);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    oscilador.connect(ganho).connect(opcoes.destino || ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao + 0.03);
  }

  /* Chiado curto (ruído filtrado) para caixa e chimbal. */
  function chiado(em, duracao, corte, volume, destino) {
    var ctx = contexto;
    if (!ruido) {
      ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      var amostras = ruido.getChannelData(0);
      for (var i = 0; i < amostras.length; i++) { amostras[i] = Math.random() * 2 - 1; }
    }
    var fonte = ctx.createBufferSource();
    var filtro = ctx.createBiquadFilter();
    var ganho = ctx.createGain();
    fonte.buffer = ruido;
    filtro.type = 'highpass';
    filtro.frequency.value = corte;
    ganho.gain.setValueAtTime(volume, em);
    ganho.gain.exponentialRampToValueAtTime(0.0001, em + duracao);
    fonte.connect(filtro).connect(ganho).connect(destino);
    fonte.start(em);
    fonte.stop(em + duracao + 0.02);
  }

  function tom(frequencia, duracao, opcoes) {
    if (efeitosLigados) { nota(frequencia, duracao, opcoes); }
  }

  /* ---------------- Música da partida ---------------- */

  var BPM = 132;
  var COLCHEIA = 60 / BPM / 2;        // cada passo da grade é uma colcheia
  var ACELERA_POR_NIVEL = 0.12;       // +12% de andamento a cada dobra de velocidade
  var VOLUME_MUSICA = 0.55;

  // Notas em número MIDI (60 = dó central), 0 = pausa. Oito colcheias por compasso.
  var MELODIA = [
    76, 0, 79, 0, 84, 0, 79, 76,      // Dó
    74, 0, 79, 0, 83, 0, 79, 74,      // Sol
    72, 0, 76, 0, 81, 0, 76, 72,      // Lá menor
    77, 81, 84, 81, 77, 0, 79, 0,     // Fá
    76, 0, 79, 0, 84, 0, 88, 0,       // Dó
    86, 0, 83, 0, 79, 0, 83, 86,      // Sol
    84, 81, 77, 81, 84, 0, 81, 0,     // Fá
    83, 0, 86, 0, 79, 79, 83, 86      // Sol (volta ao começo)
  ];
  var BAIXO = [48, 43, 45, 41, 48, 43, 41, 43];   // tônica de cada compasso

  var musica = { relogio: null, ganho: null, passo: 0, proximo: 0, andamento: 1 };

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function tocarPasso(passo, em, duracao) {
    var destino = musica.ganho;
    var tempo = passo % 8;
    var melodia = MELODIA[passo];
    if (melodia) { nota(hz(melodia), duracao * 0.9, { em: em, onda: 'square', volume: 0.05, destino: destino }); }
    if (tempo % 2 === 0) {
      // Baixo saltitante: tônica e oitava alternadas.
      var grave = BAIXO[Math.floor(passo / 8)] + (tempo % 4 === 2 ? 12 : 0);
      nota(hz(grave), duracao * 1.6, { em: em, onda: 'triangle', volume: 0.12, destino: destino });
    }
    if (tempo === 0 || tempo === 4) { nota(150, 0.13, { em: em, onda: 'sine', ate: 45, volume: 0.2, destino: destino }); }
    if (tempo === 2 || tempo === 6) { chiado(em, 0.09, 1800, 0.06, destino); }
    if (tempo % 2 === 1) { chiado(em, 0.03, 7000, 0.025, destino); }
  }

  /* Agenda as notas um pouco à frente do relógio de áudio, para o ritmo não oscilar. */
  function agendar() {
    while (musica.proximo < contexto.currentTime + 0.15) {
      var duracao = COLCHEIA / musica.andamento;
      tocarPasso(musica.passo, musica.proximo, duracao);
      musica.proximo += duracao;
      musica.passo = (musica.passo + 1) % MELODIA.length;
    }
  }

  function pararMusica() {
    if (!musica.relogio) { return; }
    clearInterval(musica.relogio);
    musica.relogio = null;
    var ganho = musica.ganho;
    musica.ganho = null;
    ganho.gain.setTargetAtTime(0.0001, contexto.currentTime, 0.08);
    setTimeout(function () { ganho.disconnect(); }, 600);
  }

  function iniciarMusica() {
    pararMusica();
    var ctx = musicaLigada ? obterContexto() : null;
    if (!ctx) { return; }
    musica.ganho = ctx.createGain();
    musica.ganho.gain.value = VOLUME_MUSICA;
    musica.ganho.connect(ctx.destination);
    musica.passo = 0;
    musica.andamento = 1;
    musica.proximo = ctx.currentTime + 0.06;
    musica.relogio = setInterval(agendar, 25);
    agendar();
  }

  window.CertelSom = {
    ligar: function (valor) { efeitosLigados = !!valor; },
    ligarMusica: function (valor) {
      musicaLigada = !!valor;
      if (!musicaLigada) { pararMusica(); }
    },
    destravar: function () { obterContexto(); },
    musica: {
      iniciar: iniciarMusica,
      parar: pararMusica,
      // A música acompanha a velocidade da rua.
      andamento: function (nivel) { musica.andamento = 1 + ACELERA_POR_NIVEL * (nivel || 0); },
      tocando: function () { return !!musica.relogio; },
      passo: function () { return musica.passo; }
    },
    toque: function () { tom(520, 0.06, { volume: 0.12 }); },
    // O tom sobe um pouco a cada nível de multiplicador.
    coleta: function (multiplicador) {
      var fator = Math.pow(1.06, Math.min((multiplicador || 1) - 1, 8));
      tom(784 * fator, 0.09);
      tom(1175 * fator, 0.14, { atraso: 0.07 });
    },
    acelerar: function () { tom(180, 0.4, { onda: 'sawtooth', ate: 1100, volume: 0.14 }); },
    multiplicador: function () {
      [784, 988, 1175, 1568].forEach(function (f, i) { tom(f, 0.16, { atraso: i * 0.07, volume: 0.2 }); });
    },
    dano: function () { tom(220, 0.28, { onda: 'sawtooth', ate: 70, volume: 0.26 }); },
    contagem: function () { tom(440, 0.14, { onda: 'square', volume: 0.14 }); },
    largada: function () { tom(880, 0.4, { onda: 'square', volume: 0.16 }); },
    fim: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tom(f, 0.22, { atraso: i * 0.12 }); });
    }
  };
})();
