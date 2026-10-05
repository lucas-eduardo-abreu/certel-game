/* Motor do jogo (canvas 2D).

   A rua rola de cima para baixo e o mascote anda para os lados na parte de
   baixo da tela. Ícones da Certel somam pontos; perigos tiram pontos.

   Uso:
     var motor = new CertelMotor(canvas, imagens, {
       duracao: 45, pontosAcerto: 100, pontosErro: 100,
       aoPontuar: function (pontos, delta) {},
       aoTempo: function (restante, fracao) {},
       aoTerminar: function (resultado) {}   // { pontos, coletados, atingidos }
     });
     motor.iniciar();

   `imagens` = { mascote: Image, bons: [Image], ruins: [Image] }.

   Atenção: INTERVALO_FINAL nunca pode ficar abaixo de INTERVALO_MINIMO_ITENS
   em jogo/services.py — é com ele que o servidor calcula a pontuação máxima. */
(function () {
  'use strict';

  var LARGURA = 720;
  var ALTURA = 1280;

  var PISTA_ESQ = 96;
  var PISTA_DIR = 624;
  var FAIXAS = 4;
  var LARGURA_FAIXA = (PISTA_DIR - PISTA_ESQ) / FAIXAS;

  var JOGADOR_Y = 1050;        // onde ficam os pés do mascote
  var JOGADOR_ALTURA = 300;
  var JOGADOR_MARGEM = 56;     // distância mínima do meio-fio
  var ALCANCE_X = JOGADOR_ALTURA * 0.4;   // meia-largura da área de contato com os itens
  var ALCANCE_Y = JOGADOR_ALTURA * 0.58;  // meia-altura da área de contato
  var VELOCIDADE_SETAS = 640;  // px/s segurando uma seta
  var VELOCIDADE_DEDO = 1500;  // px/s seguindo o dedo

  var TAMANHO_ITEM = 112;
  var VELOCIDADE_INICIAL = 380;
  var VELOCIDADE_FINAL = 780;
  var INTERVALO_INICIAL = 0.95;
  var INTERVALO_FINAL = 0.45;
  var CHANCE_PERIGO_INICIAL = 0.28;
  var CHANCE_PERIGO_FINAL = 0.42;

  var COR = {
    asfalto: '#a9b0c6',
    asfaltoBorda: '#9aa2ba',
    faixa: '#f4f6fb',
    calcada: '#d8dcea',
    calcadaJunta: '#c5cadb',
    meioFio: '#7f88a3',
    grama: '#b5e3bd',
    copa: '#2fa866',
    copaLuz: '#56c487',
    poste: '#6b4a2f',
    fio: '#2b2f3a',
    verde: '#00a650',
    azul: '#244a90',
    amarelo: '#ffc20e',
    perigo: '#e4002b'
  };

  function misturar(a, b, t) { return a + (b - a) * t; }
  function limitar(v, minimo, maximo) { return Math.max(minimo, Math.min(maximo, v)); }
  function suave(t) { return t * t * (3 - 2 * t); }

  function embaralhar(lista) {
    var copia = lista.slice();
    for (var i = copia.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
  }

  function Motor(canvas, imagens, opcoes) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imagens = imagens;
    this.opcoes = opcoes || {};
    this.rodando = false;
    this._quadro = this._quadro.bind(this);
    this.ajustarResolucao();
    this._zerar();
    this._desenhar();
  }

  /* Ajusta a resolução interna do canvas à escala real do palco na tela. */
  Motor.prototype.ajustarResolucao = function (escalaPalco) {
    var fator = limitar((escalaPalco || 1) * (window.devicePixelRatio || 1), 1, 2);
    this.canvas.width = Math.round(LARGURA * fator);
    this.canvas.height = Math.round(ALTURA * fator);
    this.fator = fator;
  };

  Motor.prototype._zerar = function () {
    this.tempo = 0;
    this.duracao = this.opcoes.duracao || 45;
    this.pontos = 0;
    this.coletados = 0;
    this.atingidos = 0;
    this.percorrido = 0;
    this.itens = [];
    this.flutuantes = [];
    this.particulas = [];
    this.proximoItem = 0.6;
    this.ultimaFaixa = -1;
    this.perigosSeguidos = 0;
    this.itensGerados = 0;
    this.baralho = [];
    this.jogador = { x: LARGURA / 2, vx: 0, pulo: 0, dano: 0 };
    this.direcao = 0;
    this.alvoX = null;
    this.tremor = 0;
    this.terminado = false;
  };

  Motor.prototype.iniciar = function () {
    this._zerar();
    this.rodando = true;
    this.ultimoInstante = performance.now();
    if (this.opcoes.aoPontuar) { this.opcoes.aoPontuar(0, 0); }
    if (this.opcoes.aoTempo) { this.opcoes.aoTempo(this.duracao, 1); }
    requestAnimationFrame(this._quadro);
  };

  Motor.prototype.parar = function () { this.rodando = false; };

  /* Zera a partida e desenha o primeiro quadro (usado durante a contagem regressiva). */
  Motor.prototype.preparar = function () {
    this._zerar();
    this._desenhar();
  };

  /* Entrada: -1 (esquerda), 0 (parado) ou 1 (direita), enquanto a seta estiver pressionada. */
  Motor.prototype.definirDirecao = function (direcao) {
    this.direcao = direcao;
    if (direcao !== 0) { this.alvoX = null; }
  };

  /* Entrada: posição x (em coordenadas do palco) do dedo arrastando na pista; null ao soltar. */
  Motor.prototype.definirAlvo = function (x) { this.alvoX = x; };

  Motor.prototype._quadro = function (agora) {
    if (!this.rodando) { return; }
    var dt = Math.min(0.05, (agora - this.ultimoInstante) / 1000);
    this.ultimoInstante = agora;
    if (dt > 0) { this._atualizar(dt); }
    this._desenhar();
    if (this.rodando) { requestAnimationFrame(this._quadro); }
  };

  Motor.prototype._atualizar = function (dt) {
    this.tempo += dt;
    var progresso = limitar(this.tempo / this.duracao, 0, 1);
    var velocidade = misturar(VELOCIDADE_INICIAL, VELOCIDADE_FINAL, suave(progresso));
    this.percorrido += velocidade * dt;

    this._moverJogador(dt);

    // Geração de itens.
    this.proximoItem -= dt;
    if (this.proximoItem <= 0 && !this.terminado) {
      this._gerarItem(progresso);
      this.proximoItem += misturar(INTERVALO_INICIAL, INTERVALO_FINAL, progresso);
    }

    // Itens descem junto com a rua.
    var jogador = this.jogador;
    var centroY = JOGADOR_Y - JOGADOR_ALTURA * 0.46;
    for (var i = this.itens.length - 1; i >= 0; i--) {
      var item = this.itens[i];
      item.y += velocidade * dt;
      item.idade += dt;
      var dx = (item.x - jogador.x) / ALCANCE_X;
      var dy = (item.y - centroY) / ALCANCE_Y;
      if (dx * dx + dy * dy < 1) {
        this._colidir(item);
        this.itens.splice(i, 1);
      } else if (item.y > ALTURA + TAMANHO_ITEM) {
        this.itens.splice(i, 1);
      }
    }

    // Efeitos.
    for (var f = this.flutuantes.length - 1; f >= 0; f--) {
      var flutuante = this.flutuantes[f];
      flutuante.vida -= dt;
      flutuante.y -= 150 * dt;
      if (flutuante.vida <= 0) { this.flutuantes.splice(f, 1); }
    }
    for (var p = this.particulas.length - 1; p >= 0; p--) {
      var particula = this.particulas[p];
      particula.vida -= dt;
      particula.x += particula.vx * dt;
      particula.y += particula.vy * dt;
      particula.vy += 900 * dt;
      if (particula.vida <= 0) { this.particulas.splice(p, 1); }
    }
    jogador.pulo = Math.max(0, jogador.pulo - dt);
    jogador.dano = Math.max(0, jogador.dano - dt);
    this.tremor = Math.max(0, this.tremor - dt);

    // Cronômetro.
    var restante = Math.max(0, this.duracao - this.tempo);
    if (this.opcoes.aoTempo) { this.opcoes.aoTempo(restante, restante / this.duracao); }
    if (restante <= 0 && !this.terminado) {
      this.terminado = true;
      this.rodando = false;
      if (this.opcoes.aoTerminar) {
        this.opcoes.aoTerminar({
          pontos: this.pontos,
          coletados: this.coletados,
          atingidos: this.atingidos
        });
      }
    }
  };

  Motor.prototype._moverJogador = function (dt) {
    var jogador = this.jogador;
    var anterior = jogador.x;
    if (this.direcao !== 0) {
      jogador.x += this.direcao * VELOCIDADE_SETAS * dt;
    } else if (this.alvoX !== null) {
      var falta = this.alvoX - jogador.x;
      var passo = VELOCIDADE_DEDO * dt;
      jogador.x += Math.abs(falta) <= passo ? falta : Math.sign(falta) * passo;
    }
    jogador.x = limitar(jogador.x, PISTA_ESQ + JOGADOR_MARGEM, PISTA_DIR - JOGADOR_MARGEM);
    var vx = dt > 0 ? (jogador.x - anterior) / dt : 0;
    jogador.vx = misturar(jogador.vx, vx, Math.min(1, dt * 12));
  };

  Motor.prototype._gerarItem = function (progresso) {
    // Nunca repete a faixa anterior: obriga o jogador a se mexer.
    var faixa;
    do { faixa = Math.floor(Math.random() * FAIXAS); } while (faixa === this.ultimaFaixa);
    this.ultimaFaixa = faixa;

    // Os dois primeiros são sempre bons e nunca vêm três perigos seguidos.
    var chance = misturar(CHANCE_PERIGO_INICIAL, CHANCE_PERIGO_FINAL, progresso);
    var perigo = this.itensGerados >= 2 && this.perigosSeguidos < 2 && Math.random() < chance;
    this.perigosSeguidos = perigo ? this.perigosSeguidos + 1 : 0;
    this.itensGerados += 1;

    var imagem;
    if (perigo) {
      imagem = this.imagens.ruins[Math.floor(Math.random() * this.imagens.ruins.length)];
    } else {
      // Baralho embaralhado: todos os ícones aparecem na mesma proporção.
      if (!this.baralho.length) { this.baralho = embaralhar(this.imagens.bons); }
      imagem = this.baralho.pop();
    }

    this.itens.push({
      x: PISTA_ESQ + LARGURA_FAIXA * (faixa + 0.5) + (Math.random() - 0.5) * 30,
      y: -TAMANHO_ITEM,
      perigo: perigo,
      imagem: imagem,
      idade: 0,
      fase: Math.random() * 6.28
    });
  };

  Motor.prototype._colidir = function (item) {
    var delta;
    if (item.perigo) {
      delta = -Math.min(this.opcoes.pontosErro || 0, this.pontos);
      this.atingidos += 1;
      this.jogador.dano = 0.55;
      this.tremor = 0.35;
      if (window.CertelSom) { window.CertelSom.dano(); }
    } else {
      delta = this.opcoes.pontosAcerto || 100;
      this.coletados += 1;
      this.jogador.pulo = 0.28;
      if (window.CertelSom) { window.CertelSom.coleta(); }
    }
    this.pontos += delta;

    var rotulo = item.perigo ? '\u2212' + (this.opcoes.pontosErro || 0) : '+' + delta;
    this.flutuantes.push({ x: item.x, y: item.y - 40, texto: rotulo, perigo: item.perigo, vida: 0.9 });

    var cores = item.perigo
      ? [COR.perigo, COR.amarelo, '#1b1b24']
      : [COR.verde, COR.amarelo, '#ffffff', COR.azul];
    for (var i = 0; i < 12; i++) {
      var angulo = Math.random() * 6.28;
      var forca = 220 + Math.random() * 320;
      this.particulas.push({
        x: item.x,
        y: item.y,
        vx: Math.cos(angulo) * forca,
        vy: Math.sin(angulo) * forca - 220,
        raio: 6 + Math.random() * 8,
        cor: cores[i % cores.length],
        vida: 0.5 + Math.random() * 0.25
      });
    }
    if (this.opcoes.aoPontuar) { this.opcoes.aoPontuar(this.pontos, delta, item.perigo); }
  };

  /* ---------------- Desenho ---------------- */

  Motor.prototype._desenhar = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.fator, 0, 0, this.fator, 0, 0);
    ctx.save();
    if (this.tremor > 0) {
      var amplitude = this.tremor * 34;
      ctx.translate((Math.random() - 0.5) * amplitude, (Math.random() - 0.5) * amplitude);
    }
    this._desenharRua(ctx);
    this._desenharItens(ctx);
    this._desenharJogador(ctx);
    this._desenharEfeitos(ctx);
    ctx.restore();
  };

  /* Desenha um elemento que se repete a cada `periodo` px ao longo da rua. */
  Motor.prototype._repetir = function (periodo, deslocamento, margem, desenhar) {
    var base = ((this.percorrido + deslocamento) % periodo + periodo) % periodo;
    for (var y = base - periodo; y < ALTURA + margem; y += periodo) {
      if (y > -margem) { desenhar(y); }
    }
  };

  Motor.prototype._desenharRua = function (ctx) {
    var self = this;

    // Gramado, calçadas e asfalto.
    ctx.fillStyle = COR.grama;
    ctx.fillRect(-20, -20, LARGURA + 40, ALTURA + 40);
    ctx.fillStyle = COR.calcada;
    ctx.fillRect(40, -20, PISTA_ESQ - 40, ALTURA + 40);
    ctx.fillRect(PISTA_DIR, -20, LARGURA - 40 - PISTA_DIR, ALTURA + 40);
    ctx.fillStyle = COR.asfalto;
    ctx.fillRect(PISTA_ESQ, -20, PISTA_DIR - PISTA_ESQ, ALTURA + 40);

    // Juntas da calçada.
    ctx.strokeStyle = COR.calcadaJunta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    this._repetir(88, 0, 10, function (y) {
      ctx.moveTo(40, y); ctx.lineTo(PISTA_ESQ, y);
      ctx.moveTo(PISTA_DIR, y); ctx.lineTo(LARGURA - 40, y);
    });
    ctx.stroke();

    // Meio-fio.
    ctx.fillStyle = COR.meioFio;
    ctx.fillRect(PISTA_ESQ - 8, -20, 8, ALTURA + 40);
    ctx.fillRect(PISTA_DIR, -20, 8, ALTURA + 40);

    // Divisórias de faixa.
    ctx.fillStyle = COR.faixa;
    this._repetir(150, 0, 80, function (y) {
      for (var faixa = 1; faixa < FAIXAS; faixa++) {
        ctx.fillRect(PISTA_ESQ + LARGURA_FAIXA * faixa - 5, y, 10, 72);
      }
    });

    // Faixa de pedestres.
    this._repetir(1500, 400, 140, function (y) {
      ctx.fillStyle = COR.asfaltoBorda;
      ctx.fillRect(PISTA_ESQ, y - 14, PISTA_DIR - PISTA_ESQ, 128);
      ctx.fillStyle = COR.faixa;
      for (var x = PISTA_ESQ + 14; x < PISTA_DIR - 20; x += 46) {
        ctx.fillRect(x, y, 26, 100);
      }
    });

    // Rede elétrica na calçada esquerda: fio contínuo e postes.
    ctx.strokeStyle = COR.fio;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(58, -20); ctx.lineTo(58, ALTURA + 20);
    ctx.moveTo(74, -20); ctx.lineTo(74, ALTURA + 20);
    ctx.stroke();
    this._repetir(620, 120, 60, function (y) { self._desenharPoste(ctx, 66, y); });

    // Árvores no gramado.
    this._repetir(540, 300, 90, function (y) { self._desenharArvore(ctx, 14, y, 46); });
    this._repetir(430, 60, 90, function (y) { self._desenharArvore(ctx, LARGURA - 20, y, 52); });
    this._repetir(430, 270, 60, function (y) { self._desenharArvore(ctx, LARGURA - 64, y, 26); });
  };

  Motor.prototype._desenharPoste = function (ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x + 6, y + 8, 30, 12, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = COR.poste;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x - 28, y - 7, 56, 14, 5); } else { ctx.rect(x - 28, y - 7, 56, 14); }
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COR.amarelo;
    ctx.beginPath(); ctx.arc(x - 8, y, 4, 0, 6.28); ctx.arc(x + 8, y, 4, 0, 6.28); ctx.fill();
  };

  Motor.prototype._desenharArvore = function (ctx, x, y, raio) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(x + raio * 0.2, y + raio * 0.25, raio, raio * 0.9, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = COR.copa;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, raio, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COR.copaLuz;
    ctx.beginPath(); ctx.arc(x - raio * 0.28, y - raio * 0.3, raio * 0.42, 0, 6.28); ctx.fill();
  };

  Motor.prototype._desenharItens = function (ctx) {
    for (var i = 0; i < this.itens.length; i++) {
      var item = this.itens[i];
      var entrada = Math.min(1, item.idade * 5);
      var escala = entrada * (1 + Math.sin(item.idade * 6 + item.fase) * 0.04);
      var giro = item.perigo ? Math.sin(item.idade * 9 + item.fase) * 0.16 : 0;
      var tamanho = TAMANHO_ITEM * escala * (item.perigo ? 1.12 : 1);

      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(item.x + 6, item.y + TAMANHO_ITEM * 0.48, tamanho * 0.42, tamanho * 0.14, 0, 0, 6.28);
      ctx.fill();

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(giro);
      ctx.drawImage(item.imagem, -tamanho / 2, -tamanho / 2, tamanho, tamanho);
      ctx.restore();
    }
  };

  Motor.prototype._desenharJogador = function (ctx) {
    var jogador = this.jogador;
    var imagem = this.imagens.mascote;
    var altura = JOGADOR_ALTURA;
    var largura = altura * (imagem.width / imagem.height);

    // Corrida sugerida por quique, inclinação e leve esmaga-estica.
    var passada = this.rodando || this.tempo > 0 ? Math.abs(Math.sin(this.tempo * 9)) : 0;
    var quique = passada * 14;
    var salto = jogador.pulo > 0 ? Math.sin((jogador.pulo / 0.28) * Math.PI) * 34 : 0;
    var inclinacao = limitar(jogador.vx / VELOCIDADE_SETAS, -1, 1) * 0.13;
    var estica = 1 + passada * 0.03 + (jogador.pulo > 0 ? 0.06 : 0);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(jogador.x, JOGADOR_Y - 4, 74 - quique - salto * 0.5, 18 - quique * 0.3, 0, 0, 6.28);
    ctx.fill();

    ctx.save();
    ctx.translate(jogador.x, JOGADOR_Y - quique - salto);
    ctx.rotate(inclinacao);
    if (jogador.dano > 0) {
      ctx.rotate(Math.sin(jogador.dano * 40) * 0.12);
      ctx.globalAlpha = Math.sin(jogador.dano * 36) > 0 ? 0.45 : 1;
    }
    ctx.scale(1 / estica, estica);
    ctx.drawImage(imagem, -largura * 0.52, -altura, largura, altura);
    ctx.restore();
  };

  Motor.prototype._desenharEfeitos = function (ctx) {
    var i;
    for (i = 0; i < this.particulas.length; i++) {
      var particula = this.particulas[i];
      ctx.globalAlpha = limitar(particula.vida * 3, 0, 1);
      ctx.fillStyle = particula.cor;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(particula.x, particula.y, particula.raio, 0, 6.28); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (i = 0; i < this.flutuantes.length; i++) {
      var flutuante = this.flutuantes[i];
      var surgimento = Math.min(1, (0.9 - flutuante.vida) * 8);
      ctx.globalAlpha = limitar(flutuante.vida * 3, 0, 1);
      ctx.font = '800 ' + Math.round(72 * (0.6 + 0.4 * surgimento)) + 'px "Baloo 2", sans-serif';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#000';
      ctx.strokeText(flutuante.texto, flutuante.x, flutuante.y);
      ctx.fillStyle = flutuante.perigo ? '#ff5470' : '#ffffff';
      ctx.fillText(flutuante.texto, flutuante.x, flutuante.y);
    }
    ctx.globalAlpha = 1;
  };

  Motor.LARGURA = LARGURA;
  Motor.ALTURA = ALTURA;
  window.CertelMotor = Motor;
})();
