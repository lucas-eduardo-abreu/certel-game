/* Motor do jogo (canvas 2D).

   A rua rola de cima para baixo e o mascote anda para os lados na parte de
   baixo da tela. Ícones da Certel somam pontos; perigos tiram pontos.

   Multiplicador: a cada `itensPorMultiplicador` ícones pegos em seguida, os
   próximos valem mais (5 seguidos = 2x, 10 = 3x...). Encostar em um perigo
   zera a sequência. Deixar um ícone passar não zera.

   Uso:
     var motor = new CertelMotor(canvas, imagens, {
       duracao: 45, pontosAcerto: 100, pontosErro: 300, itensPorMultiplicador: 5,
       pontosPorDobra: 1000, dobrasMaximas: 2,
       chancePerigoInicial: 0.25, chancePerigoAumento: 0.08,
       aoVelocidade: function (nivel, evento) {},   // evento: 'subiu', 'caiu' ou null
       aoPontuar: function (pontos, delta, perigo) {},
       aoSequencia: function (sequencia, multiplicador, evento) {},  // evento: 'subiu', 'perdeu' ou null
       aoTempo: function (restante, fracao) {},
       aoTerminar: function (resultado) {}   // { pontos, coletados, atingidos }
     });
     motor.iniciar();

   `imagens` = { mascote: Image, corrida: Image (opcional), bons: [Image], ruins: [Image] }.
   `corrida` é a folha de sprites do mascote 3D correndo de costas; sem ela, o
   jogo usa a ilustração de frente (`mascote`).

   Velocidade: a rua dobra de velocidade a cada `pontosPorDobra` pontos
   (1000 = 2x, 2000 = 4x...), até `dobrasMaximas` dobras. O nível acompanha a
   pontuação atual: se ela cair abaixo da marca, a rua desacelera.

   Perigos: a proporção de perigos começa em `chancePerigoInicial` e sobe
   `chancePerigoAumento` a cada `pontosPorDobra` pontos, até 65%. Mesmo no
   teto nunca vêm três perigos seguidos nem dois itens na mesma faixa.

   Cenário: rua de cidade vista de cima, em quarteirões com prédios,
   cruzamentos e calçada arborizada (ver "Rua de cidade", mais abaixo).

   Atenção: VELOCIDADE_BASE, PRIMEIRO_ITEM, ESPACAMENTO_ITENS e INTERVALO_MINIMO
   têm cópia em jogo/services.py — é com eles que o servidor calcula a
   pontuação máxima. Se mudar aqui, mude lá. */
(function () {
  'use strict';

  var LARGURA = 720;
  var ALTURA = 1280;

  var PISTA_ESQ = 120;
  var PISTA_DIR = 600;
  var FAIXAS = 4;
  var LARGURA_FAIXA = (PISTA_DIR - PISTA_ESQ) / FAIXAS;

  var JOGADOR_Y = 1050;        // onde ficam os pés do mascote
  var JOGADOR_ALTURA = 300;
  var JOGADOR_MARGEM = 56;     // distância mínima do meio-fio
  var ALCANCE_X = JOGADOR_ALTURA * 0.4;   // meia-largura da área de contato com os itens
  var ALCANCE_Y = JOGADOR_ALTURA * 0.58;  // meia-altura da área de contato
  var VELOCIDADE_SETAS = 640;  // px/s segurando uma seta
  var VELOCIDADE_DEDO = 1500;  // px/s seguindo o dedo

  // Folha de sprites da corrida (gerada por scripts/mascote3d/gerar_sprites.py).
  var SPRITE_QUADROS = 16;
  var SPRITE_COLUNAS = 4;
  var SPRITE_L = 384;
  var SPRITE_A = 512;
  var SPRITE_ANCORA_X = 192;    // ponto do chão sob o boneco, dentro do quadro
  var SPRITE_ANCORA_Y = 446.3;
  var SPRITE_ESCALA = (JOGADOR_ALTURA * 1.12) / SPRITE_A;
  var PASSADAS_BASE = 1.5;      // ciclos de corrida por segundo na velocidade inicial
  var PASSADAS_MAXIMO = 3.2;

  var TAMANHO_ITEM = 112;
  var VELOCIDADE_BASE = 380;   // px/s da rua no começo; dobra a cada `pontosPorDobra`
  var PRIMEIRO_ITEM = 0.6;     // segundos até o primeiro item
  var ESPACAMENTO_ITENS = 360; // distância (px de rua) entre um item e o seguinte
  var INTERVALO_MINIMO = 0.32; // mas nunca menos que isto, em segundos, entre dois itens
  var CHANCE_PERIGO_MAXIMA = 0.65; // teto da proporção de perigos entre os itens

  // Mesma pilha de fontes do CSS (base.css): Boston quando instalada, senão Montserrat.
  var FONTE = '"Boston", "Montserrat", "Segoe UI", Arial, sans-serif';

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
    copaEscura: '#23935a',
    terra: '#a47148',
    poste: '#6b4a2f',
    fio: '#2b2f3a',
    verde: '#04a64b',
    azul: '#004899',
    amarelo: '#ffc20e',
    perigo: '#e4002b'
  };

  function misturar(a, b, t) { return a + (b - a) * t; }
  function limitar(v, minimo, maximo) { return Math.max(minimo, Math.min(maximo, v)); }

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
    this._quadras = null; // os quarteirões pré-desenhados dependem da resolução
  };

  Motor.prototype._zerar = function () {
    this.tempo = 0;
    this.duracao = this.opcoes.duracao || 45;
    this.pontos = 0;
    this.coletados = 0;
    this.atingidos = 0;
    this.sequencia = 0;       // ícones pegos em seguida, sem encostar em perigo
    this.maiorSequencia = 0;
    this.percorrido = 0;
    this.passada = 0;
    this.nivel = 0;           // dobras de velocidade em vigor
    this.marcas = 0;          // quantas vezes a pontuação atual passou de `pontosPorDobra`
    this.ritmo = 1;           // velocidade atual / inicial (acompanha o nível com suavidade)
    this.itens = [];
    this.flutuantes = [];
    this.particulas = [];
    this.proximoItem = PRIMEIRO_ITEM;
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
    if (this.opcoes.aoSequencia) { this.opcoes.aoSequencia(0, 1, null); }
    if (this.opcoes.aoVelocidade) { this.opcoes.aoVelocidade(0, null); }
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
    // A velocidade persegue o nível atual em vez de saltar de uma vez.
    this.ritmo = misturar(this.ritmo, Math.pow(2, this.nivel), Math.min(1, dt * 3.5));
    var velocidade = VELOCIDADE_BASE * this.ritmo;
    this.percorrido += velocidade * dt;
    this.passada = (this.passada + Math.min(PASSADAS_MAXIMO, PASSADAS_BASE * Math.sqrt(this.ritmo)) * dt) % 1;

    this._moverJogador(dt);

    // Geração de itens.
    this.proximoItem -= dt;
    if (this.proximoItem <= 0 && !this.terminado) {
      this._gerarItem();
      this.proximoItem += Math.max(INTERVALO_MINIMO, ESPACAMENTO_ITENS / (VELOCIDADE_BASE * Math.pow(2, this.nivel)));
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
      if (flutuante.tipo !== 'aviso') { flutuante.y -= 150 * dt; }
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
          atingidos: this.atingidos,
          maiorSequencia: this.maiorSequencia
        });
      }
    }
  };

  Motor.prototype._moverJogador = function (dt) {
    var jogador = this.jogador;
    var anterior = jogador.x;
    // Com a rua mais rápida, o mascote também anda mais rápido para os lados.
    var agilidade = Math.sqrt(this.ritmo);
    if (this.direcao !== 0) {
      jogador.x += this.direcao * VELOCIDADE_SETAS * agilidade * dt;
    } else if (this.alvoX !== null) {
      var falta = this.alvoX - jogador.x;
      var passo = VELOCIDADE_DEDO * agilidade * dt;
      jogador.x += Math.abs(falta) <= passo ? falta : Math.sign(falta) * passo;
    }
    jogador.x = limitar(jogador.x, PISTA_ESQ + JOGADOR_MARGEM, PISTA_DIR - JOGADOR_MARGEM);
    var vx = dt > 0 ? (jogador.x - anterior) / dt : 0;
    jogador.vx = misturar(jogador.vx, vx, Math.min(1, dt * 12));
  };

  /* Proporção de perigos para a pontuação atual. */
  Motor.prototype._chancePerigo = function () {
    var inicial = this.opcoes.chancePerigoInicial;
    if (inicial === undefined) { inicial = 0.25; }
    var chance = inicial + (this.opcoes.chancePerigoAumento || 0) * this.marcas;
    return Math.min(Math.max(inicial, CHANCE_PERIGO_MAXIMA), chance);
  };

  Motor.prototype._gerarItem = function () {
    // Nunca repete a faixa anterior: obriga o jogador a se mexer.
    var faixa;
    do { faixa = Math.floor(Math.random() * FAIXAS); } while (faixa === this.ultimaFaixa);
    this.ultimaFaixa = faixa;

    // Os dois primeiros são sempre bons e nunca vêm três perigos seguidos.
    var chance = this._chancePerigo();
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
      x: PISTA_ESQ + LARGURA_FAIXA * (faixa + 0.5) + (Math.random() - 0.5) * 16,
      y: -TAMANHO_ITEM,
      perigo: perigo,
      imagem: imagem,
      idade: 0,
      fase: Math.random() * 6.28
    });
  };

  /* Multiplicador em vigor para uma sequência de ícones pegos sem encostar em perigo. */
  Motor.prototype._multiplicador = function (sequencia) {
    var passo = this.opcoes.itensPorMultiplicador || 0;
    return passo > 0 ? 1 + Math.floor(sequencia / passo) : 1;
  };

  Motor.prototype._colidir = function (item) {
    var delta;
    var evento = null;
    var multiplicador = this._multiplicador(this.sequencia);
    var Som = window.CertelSom;

    if (item.perigo) {
      // Perigo: perde pontos (sem ficar negativo) e zera a sequência.
      delta = -Math.min(this.opcoes.pontosErro || 0, this.pontos);
      this.atingidos += 1;
      if (multiplicador > 1) { evento = 'perdeu'; }
      this.sequencia = 0;
      this.jogador.dano = 0.55;
      this.tremor = 0.35;
      if (Som) { Som.dano(); }
    } else {
      // Ícone: vale os pontos vezes o multiplicador atual e estende a sequência.
      delta = (this.opcoes.pontosAcerto || 100) * multiplicador;
      this.coletados += 1;
      this.sequencia += 1;
      this.maiorSequencia = Math.max(this.maiorSequencia, this.sequencia);
      this.jogador.pulo = 0.28;
      if (this._multiplicador(this.sequencia) > multiplicador) { evento = 'subiu'; }
      if (Som) {
        if (evento === 'subiu') { Som.multiplicador(); } else { Som.coleta(multiplicador); }
      }
    }
    this.pontos += delta;

    var rotulo = item.perigo ? '\u2212' + (this.opcoes.pontosErro || 0) : '+' + delta;
    this.flutuantes.push({ x: item.x, y: item.y - 40, texto: rotulo, tipo: item.perigo ? 'perigo' : 'bom', vida: 0.9, total: 0.9 });
    if (evento === 'subiu') {
      this.flutuantes.push({
        x: limitar(this.jogador.x, 150, LARGURA - 150),
        y: JOGADOR_Y - JOGADOR_ALTURA - 70,
        texto: this._multiplicador(this.sequencia) + 'x',
        tipo: 'destaque',
        vida: 1.3,
        total: 1.3
      });
    }

    var cores = item.perigo
      ? [COR.perigo, COR.amarelo, '#1b1b24']
      : [COR.verde, COR.amarelo, '#ffffff', COR.azul];
    var quantidade = evento === 'subiu' ? 26 : 12;
    for (var i = 0; i < quantidade; i++) {
      var angulo = Math.random() * 6.28;
      var forca = 220 + Math.random() * (evento === 'subiu' ? 520 : 320);
      this.particulas.push({
        x: item.x,
        y: item.y,
        vx: Math.cos(angulo) * forca,
        vy: Math.sin(angulo) * forca - 220,
        raio: 6 + Math.random() * 8,
        cor: evento === 'subiu' && i % 2 ? COR.amarelo : cores[i % cores.length],
        vida: 0.5 + Math.random() * 0.25
      });
    }
    if (this.opcoes.aoPontuar) { this.opcoes.aoPontuar(this.pontos, delta, item.perigo); }
    if (this.opcoes.aoSequencia) {
      this.opcoes.aoSequencia(this.sequencia, this._multiplicador(this.sequencia), evento);
    }
    this._ajustarNivel();
  };

  /* Recalcula as dobras de velocidade a partir da pontuação atual. */
  Motor.prototype._ajustarNivel = function () {
    var marca = this.opcoes.pontosPorDobra || 0;
    var maximo = this.opcoes.dobrasMaximas || 0;
    var marcas = marca > 0 ? Math.floor(this.pontos / marca) : 0;
    var nivel = Math.min(maximo, marcas);

    // Cada marca traz mais perigos, mesmo depois que a velocidade chega ao limite.
    var chanceAntes = this._chancePerigo();
    var marcasAntes = this.marcas;
    this.marcas = marcas;
    var maisPerigos = marcas > marcasAntes && this._chancePerigo() > chanceAntes;

    var subiu = nivel > this.nivel;
    var mudou = nivel !== this.nivel;
    this.nivel = nivel;
    if (subiu || maisPerigos) {
      this.flutuantes.push({
        x: LARGURA / 2, y: 360, texto: subiu ? 'Mais rápido!' : 'Mais obstáculos!', tipo: 'aviso', vida: 1.2, total: 1.2
      });
      if (window.CertelSom) { window.CertelSom.acelerar(); }
    }
    if (mudou && this.opcoes.aoVelocidade) { this.opcoes.aoVelocidade(nivel, subiu ? 'subiu' : 'caiu'); }
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

  /* ---------------- Rua de cidade ----------------

     A rua é feita de quarteirões de QUADRA px: um cruzamento com a rua
     transversal e, em seguida, o quarteirão com prédios, calçada arborizada,
     postes e sinalização. Há duas variações, que se alternam. Cada uma é
     desenhada uma única vez em um canvas fora da tela; a cada quadro o jogo
     só copia a imagem pronta, o que mantém o desempenho em totens modestos. */

  var QUADRA = 1800;
  var CRUZAMENTO = 280;                 // altura da rua transversal
  var PREDIO_ESQ = 52;                  // até onde vão os prédios da esquerda
  var PREDIO_DIR = LARGURA - 52;
  var MEIO_FIO = 8;
  var RAIO_ESQUINA = 36;
  var RECUO_PREDIOS = 60;               // calçada livre entre a esquina e o primeiro prédio

  var TELHADOS = ['#e2725b', '#f3e3b5', '#8ecae6', '#f4a6b8', '#b9a6e0', '#ffd166', '#9aa6c4', '#f7c59f'];
  var TOLDOS = ['#e4002b', '#244a90', '#00a650', '#ff8c42'];

  // Cada prédio: [comprimento, telhado (índice), toldo (índice ou -1), detalhe].
  // Detalhes: 'ar' (ar-condicionado), 'caixa' (caixa-d'água), 'praca' (pracinha no lugar do prédio).
  // Cada lado soma 1400 px (QUADRA - CRUZAMENTO - 2 * RECUO_PREDIOS).
  var QUARTEIROES = [
    {
      esq: [[240, 0, 0, 'ar'], [180, 1, -1, 'caixa'], [300, 2, 1, 'ar'], [160, 3, -1, ''], [260, 4, 3, 'caixa'], [260, 5, -1, 'ar']],
      dir: [[200, 6, 2, 'caixa'], [280, 7, -1, 'ar'], [170, 0, 0, ''], [310, 0, -1, 'praca'], [220, 2, 1, 'ar'], [220, 3, -1, '']]
    },
    {
      esq: [[300, 5, 2, 'caixa'], [200, 7, -1, 'ar'], [230, 0, -1, 'praca'], [190, 6, -1, 'ar'], [280, 1, 1, 'caixa'], [200, 0, -1, '']],
      dir: [[180, 4, 3, 'ar'], [260, 2, -1, ''], [240, 5, 0, 'caixa'], [200, 0, -1, 'ar'], [290, 7, 2, ''], [230, 6, -1, 'caixa']]
    }
  ];

  // Árvores da calçada: posição ao longo do quarteirão e raio da copa.
  var ARVORES_ESQ = [[352, 36], [500, 39], [640, 34], [780, 40], [920, 35], [1160, 41], [1300, 34], [1440, 39], [1580, 35], [1720, 37]];
  var ARVORES_DIR = [[352, 37], [482, 34], [720, 40], [850, 35], [980, 39], [1110, 34], [1240, 38], [1460, 41], [1590, 35], [1720, 37]];
  var POSTES = [436, 1040];             // rede elétrica, calçada esquerda
  var LUMINARIAS = [636, 1350];         // iluminação, calçada direita

  function retangulo(ctx, x, y, largura, altura, preenchimento, traco) {
    ctx.fillStyle = preenchimento;
    ctx.fillRect(x, y, largura, altura);
    if (traco) {
      ctx.lineWidth = traco;
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x, y, largura, altura);
    }
  }

  function circulo(ctx, x, y, raio, preenchimento, traco) {
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, 6.28);
    ctx.fillStyle = preenchimento;
    ctx.fill();
    if (traco) {
      ctx.lineWidth = traco;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  /* Contorno da calçada de um lado, com as duas esquinas arredondadas. */
  function caminhoCalcada(ctx, lado, recuo) {
    var borda = lado < 0 ? 0 : LARGURA;
    var meioFio = (lado < 0 ? PISTA_ESQ : PISTA_DIR) + lado * recuo;
    var raio = RAIO_ESQUINA - recuo;
    var topo = CRUZAMENTO + recuo;
    var base = QUADRA - recuo;
    ctx.beginPath();
    ctx.moveTo(borda, topo);
    ctx.lineTo(meioFio + lado * raio, topo);
    ctx.quadraticCurveTo(meioFio, topo, meioFio, topo + raio);
    ctx.lineTo(meioFio, base - raio);
    ctx.quadraticCurveTo(meioFio, base, meioFio + lado * raio, base);
    ctx.lineTo(borda, base);
    ctx.closePath();
  }

  function desenharArvore(ctx, x, y, raio, tom) {
    circulo(ctx, x + raio * 0.18, y + raio * 0.22, raio, 'rgba(0,0,0,0.16)');
    circulo(ctx, x, y, raio, tom ? COR.copaEscura : COR.copa, 4);
    circulo(ctx, x - raio * 0.28, y - raio * 0.3, raio * 0.42, tom ? COR.copa : COR.copaLuz);
    circulo(ctx, x + raio * 0.34, y + raio * 0.3, raio * 0.2, tom ? COR.copa : COR.copaLuz);
  }

  function desenharPoste(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x + 6, y + 8, 30, 12, 0, 0, 6.28); ctx.fill();
    retangulo(ctx, x - 27, y - 6, 54, 12, COR.poste, 3);
    circulo(ctx, x, y, 11, COR.poste, 3);
    circulo(ctx, x - 7, y, 4, COR.amarelo);
    circulo(ctx, x + 7, y, 4, COR.amarelo);
  }

  function desenharSeta(ctx, x, y, sentido) {
    // sentido: -1 aponta para cima da tela, 1 para baixo.
    ctx.fillStyle = COR.faixa;
    ctx.beginPath();
    ctx.moveTo(x, y + sentido * 44);
    ctx.lineTo(x - 17, y + sentido * 14);
    ctx.lineTo(x - 6, y + sentido * 14);
    ctx.lineTo(x - 6, y - sentido * 40);
    ctx.lineTo(x + 6, y - sentido * 40);
    ctx.lineTo(x + 6, y + sentido * 14);
    ctx.lineTo(x + 17, y + sentido * 14);
    ctx.closePath();
    ctx.fill();
  }

  function desenharPredios(ctx, lado, predios) {
    var x = lado < 0 ? -8 : PREDIO_DIR;
    var largura = PREDIO_ESQ + 8;
    var frente = lado < 0 ? PREDIO_ESQ : PREDIO_DIR;          // lado do prédio que dá para a calçada
    var y = CRUZAMENTO + RECUO_PREDIOS;

    predios.forEach(function (predio, indice) {
      var comprimento = predio[0] - 10;                        // 10 px de vão entre vizinhos
      var meio = lado < 0 ? 22 : LARGURA - 22;

      if (predio[3] === 'praca') {
        retangulo(ctx, x, y, largura, comprimento, COR.grama, 4);
        for (var a = 34; a < comprimento - 20; a += 62) {
          desenharArvore(ctx, meio + ((a / 62) % 2 ? 6 : -4), y + a, 26, (a / 62) % 2);
        }
      } else {
        retangulo(ctx, x, y, largura, comprimento, TELHADOS[predio[1]], 4);
        // Platibanda (borda do telhado) e um detalhe em cima.
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.strokeRect(x + 12, y + 10, largura - 24, comprimento - 20);
        if (predio[3] === 'ar') {
          retangulo(ctx, meio - 9, y + 26, 18, 18, '#dfe3ee', 3);
          retangulo(ctx, meio - 9, y + comprimento - 48, 18, 18, '#dfe3ee', 3);
        } else if (predio[3] === 'caixa') {
          circulo(ctx, meio, y + comprimento / 2, 13, '#5fa8d3', 3);
        }
        // Toldo listrado sobre a calçada.
        if (predio[2] >= 0) {
          var toldoX = lado < 0 ? frente : frente - 18;
          var inicio = y + 22;
          var fim = y + comprimento - 22;
          for (var t = inicio; t < fim; t += 14) {
            ctx.fillStyle = ((t - inicio) / 14) % 2 ? '#ffffff' : TOLDOS[predio[2]];
            ctx.fillRect(toldoX, t, 18, Math.min(14, fim - t));
          }
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#000';
          ctx.strokeRect(toldoX, inicio, 18, fim - inicio);
        }
      }
      y += predio[0];
    });
  }

  /* Desenha um quarteirão inteiro (cruzamento + quadra) em um canvas fora da tela. */
  Motor.prototype._montarQuadra = function (variante) {
    var tela = document.createElement('canvas');
    tela.width = Math.round(LARGURA * this.fator);
    tela.height = Math.round(QUADRA * this.fator);
    var ctx = tela.getContext('2d');
    ctx.scale(tela.width / LARGURA, tela.height / QUADRA);
    var quarteirao = QUARTEIROES[variante];
    var centro = LARGURA / 2;
    var y;

    // Asfalto (rua principal e a transversal do cruzamento).
    ctx.fillStyle = COR.asfalto;
    ctx.fillRect(0, 0, LARGURA, QUADRA);

    // Calçadas com meio-fio, esquinas arredondadas e piso em placas.
    [-1, 1].forEach(function (lado) {
      caminhoCalcada(ctx, lado, 0);
      ctx.fillStyle = COR.meioFio;
      ctx.fill();
      caminhoCalcada(ctx, lado, -MEIO_FIO);
      ctx.fillStyle = COR.calcada;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = COR.calcadaJunta;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var junta = CRUZAMENTO + 30; junta < QUADRA; junta += 44) {
        ctx.moveTo(lado < 0 ? 0 : PISTA_DIR, junta);
        ctx.lineTo(lado < 0 ? PISTA_ESQ : LARGURA, junta);
      }
      var meioCalcada = lado < 0 ? (PREDIO_ESQ + PISTA_ESQ) / 2 - 4 : (PREDIO_DIR + PISTA_DIR) / 2 + 4;
      ctx.moveTo(meioCalcada, CRUZAMENTO);
      ctx.lineTo(meioCalcada, QUADRA);
      ctx.stroke();
      ctx.restore();
    });

    // Sinalização da rua principal: faixa dupla amarela no centro (mão dupla)...
    var inicioFaixas = CRUZAMENTO + 124;
    var fimFaixas = QUADRA - 124;
    ctx.fillStyle = COR.amarelo;
    ctx.fillRect(centro - 8, inicioFaixas, 5, fimFaixas - inicioFaixas);
    ctx.fillRect(centro + 3, inicioFaixas, 5, fimFaixas - inicioFaixas);
    // ...divisórias tracejadas de cada sentido...
    ctx.fillStyle = COR.faixa;
    for (y = inicioFaixas + 14; y < fimFaixas - 50; y += 108) {
      ctx.fillRect(PISTA_ESQ + LARGURA_FAIXA - 4, y, 8, 48);
      ctx.fillRect(PISTA_DIR - LARGURA_FAIXA - 4, y, 8, 48);
    }
    // ...faixas de pedestres dos dois lados do cruzamento, com linha de retenção...
    [CRUZAMENTO + 24, QUADRA - 104].forEach(function (topo) {
      for (var x = PISTA_ESQ + 16; x < PISTA_DIR - 30; x += 44) { ctx.fillRect(x, topo, 26, 80); }
    });
    ctx.fillRect(centro + 10, CRUZAMENTO + 114, PISTA_DIR - centro - 22, 8);
    ctx.fillRect(PISTA_ESQ + 12, QUADRA - 122, centro - PISTA_ESQ - 22, 8);
    // ...e setas no asfalto: quem sobe a tela vai pela direita.
    desenharSeta(ctx, PISTA_DIR - LARGURA_FAIXA * 1.5, CRUZAMENTO + 200, -1);
    desenharSeta(ctx, PISTA_DIR - LARGURA_FAIXA * 0.5, CRUZAMENTO + 200, -1);
    desenharSeta(ctx, PISTA_ESQ + LARGURA_FAIXA * 0.5, QUADRA - 200, 1);
    desenharSeta(ctx, PISTA_ESQ + LARGURA_FAIXA * 1.5, QUADRA - 200, 1);

    // Rua transversal: eixo amarelo tracejado nos dois trechos laterais.
    ctx.fillStyle = COR.amarelo;
    for (var x = 6; x < PISTA_ESQ - 20; x += 46) {
      ctx.fillRect(x, CRUZAMENTO / 2 - 3, 28, 6);
      ctx.fillRect(LARGURA - x - 28, CRUZAMENTO / 2 - 3, 28, 6);
    }

    // Tampas de bueiro e bocas de lobo.
    [[PISTA_ESQ + LARGURA_FAIXA * 2.5, 820], [PISTA_ESQ + LARGURA_FAIXA * 0.5, 1260]].forEach(function (tampa) {
      circulo(ctx, tampa[0], tampa[1], 21, COR.asfaltoBorda, 3);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(tampa[0] - 12, tampa[1]); ctx.lineTo(tampa[0] + 12, tampa[1]);
      ctx.moveTo(tampa[0], tampa[1] - 12); ctx.lineTo(tampa[0], tampa[1] + 12);
      ctx.stroke();
    });
    retangulo(ctx, PISTA_ESQ + 3, 700, 12, 34, '#4d556b', 2);
    retangulo(ctx, PISTA_DIR - 15, 1150, 12, 34, '#4d556b', 2);

    // Prédios e pracinhas dos dois lados.
    desenharPredios(ctx, -1, quarteirao.esq);
    desenharPredios(ctx, 1, quarteirao.dir);

    // Mobiliário: bancos, lixeiras, hidrante e floreiras junto aos prédios.
    retangulo(ctx, PREDIO_ESQ + 6, 1110, 14, 48, '#b5835a', 3);
    retangulo(ctx, PREDIO_DIR - 20, 980, 14, 48, '#b5835a', 3);
    circulo(ctx, PREDIO_ESQ + 14, 610, 9, '#6c7a96', 3);
    circulo(ctx, PREDIO_DIR - 14, 1530, 9, '#6c7a96', 3);
    circulo(ctx, PISTA_ESQ - 22, 782, 8, COR.perigo, 3);
    [[PREDIO_ESQ + 12, 760], [PREDIO_ESQ + 12, 1290], [PREDIO_ESQ + 12, 1460], [PREDIO_DIR - 12, 430], [PREDIO_DIR - 12, 840], [PREDIO_DIR - 12, 1180], [PREDIO_DIR - 12, 1660]]
      .forEach(function (floreira) { circulo(ctx, floreira[0], floreira[1], 13, COR.copaLuz, 3); });

    // Árvores da calçada, cada uma no seu canteiro.
    [[ARVORES_ESQ, PISTA_ESQ - 34], [ARVORES_DIR, PISTA_DIR + 34]].forEach(function (fila) {
      fila[0].forEach(function (arvore) {
        retangulo(ctx, fila[1] - 20, arvore[0] - 20, 40, 40, COR.terra, 3);
      });
      fila[0].forEach(function (arvore, indice) {
        desenharArvore(ctx, fila[1], arvore[0], arvore[1], (indice + variante) % 3 === 0);
      });
    });

    // Iluminação pública na calçada direita.
    LUMINARIAS.forEach(function (posicao) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3b4257';
      ctx.beginPath();
      ctx.moveTo(PISTA_DIR + 30, posicao);
      ctx.lineTo(PISTA_DIR - 26, posicao);
      ctx.stroke();
      circulo(ctx, PISTA_DIR + 30, posicao, 8, '#3b4257', 3);
      retangulo(ctx, PISTA_DIR - 40, posicao - 8, 22, 16, COR.amarelo, 3);
    });

    // Rede elétrica na calçada esquerda: os fios seguem por cima do cruzamento.
    ctx.strokeStyle = COR.fio;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PISTA_ESQ - 40, 0); ctx.lineTo(PISTA_ESQ - 40, QUADRA);
    ctx.moveTo(PISTA_ESQ - 28, 0); ctx.lineTo(PISTA_ESQ - 28, QUADRA);
    ctx.stroke();
    POSTES.forEach(function (posicao) { desenharPoste(ctx, PISTA_ESQ - 34, posicao); });

    return tela;
  };

  Motor.prototype._desenharRua = function (ctx) {
    if (!this._quadras) { this._quadras = [this._montarQuadra(0), this._montarQuadra(1)]; }

    ctx.fillStyle = COR.asfalto;
    ctx.fillRect(-20, -20, LARGURA + 40, ALTURA + 40);

    // Copia os quarteirões visíveis; eles descem a tela conforme a rua avança.
    var primeiro = Math.floor(this.percorrido / QUADRA);
    for (var k = primeiro + 1; k >= primeiro - 1; k--) {
      var topo = this.percorrido - k * QUADRA;
      if (topo > ALTURA + 20 || topo + QUADRA < -20) { continue; }
      topo = Math.round(topo * this.fator) / this.fator;
      ctx.drawImage(this._quadras[((k % 2) + 2) % 2], 0, topo, LARGURA, QUADRA + 0.5);
    }

    // Riscos de velocidade: aparecem quando a rua passa da velocidade inicial.
    if (this.ritmo > 1.15) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, (this.ritmo - 1) * 0.2) + ')';
      for (var risco = 0; risco < 9; risco++) {
        var rx = PISTA_ESQ + 30 + ((risco * 197) % (PISTA_DIR - PISTA_ESQ - 60));
        var ry = ((this.percorrido * 1.7 + risco * 331) % (ALTURA + 400)) - 300;
        ctx.fillRect(rx, ry, 6, 90 + this.ritmo * 45);
      }
    }
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
    var folha = this.imagens.corrida;
    var salto = jogador.pulo > 0 ? Math.sin((jogador.pulo / 0.28) * Math.PI) * 34 : 0;
    var inclinacao = limitar(jogador.vx / VELOCIDADE_SETAS, -1, 1) * 0.13;

    // Sem a folha de sprites, a corrida é sugerida por quique e esmaga-estica.
    var passo = folha ? Math.pow(Math.sin(this.passada * Math.PI * 2), 2)
                      : (this.tempo > 0 ? Math.abs(Math.sin(this.tempo * 9)) : 0);
    var quique = folha ? 0 : passo * 14;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(jogador.x, JOGADOR_Y - 4, 72 - passo * 12 - salto * 0.5, 18 - passo * 4, 0, 0, 6.28);
    ctx.fill();

    ctx.save();
    ctx.translate(jogador.x, JOGADOR_Y - quique - salto);
    ctx.rotate(inclinacao);
    if (jogador.dano > 0) {
      ctx.rotate(Math.sin(jogador.dano * 40) * 0.12);
      ctx.globalAlpha = Math.sin(jogador.dano * 36) > 0 ? 0.45 : 1;
    }
    if (folha) {
      var quadro = Math.floor(this.passada * SPRITE_QUADROS) % SPRITE_QUADROS;
      ctx.drawImage(
        folha,
        (quadro % SPRITE_COLUNAS) * SPRITE_L, Math.floor(quadro / SPRITE_COLUNAS) * SPRITE_A, SPRITE_L, SPRITE_A,
        -SPRITE_ANCORA_X * SPRITE_ESCALA, -SPRITE_ANCORA_Y * SPRITE_ESCALA,
        SPRITE_L * SPRITE_ESCALA, SPRITE_A * SPRITE_ESCALA
      );
    } else {
      var imagem = this.imagens.mascote;
      var largura = JOGADOR_ALTURA * (imagem.width / imagem.height);
      var estica = 1 + passo * 0.03 + (jogador.pulo > 0 ? 0.06 : 0);
      ctx.scale(1 / estica, estica);
      ctx.drawImage(imagem, -largura * 0.52, -JOGADOR_ALTURA, largura, JOGADOR_ALTURA);
    }
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
      var destaque = flutuante.tipo === 'destaque';
      var surgimento = Math.min(1, (flutuante.total - flutuante.vida) * 8);
      ctx.globalAlpha = limitar(flutuante.vida * 3, 0, 1);
      var corpo = destaque ? 150 : (flutuante.tipo === 'aviso' ? 92 : 72);
      ctx.font = '800 ' + Math.round(corpo * (0.6 + 0.4 * surgimento)) + 'px ' + FONTE;
      // Avisos longos ("Mais obstáculos!") encolhem para caber na largura da pista.
      var largura = ctx.measureText(flutuante.texto).width;
      if (largura > LARGURA - 80) {
        corpo *= (LARGURA - 80) / largura;
        ctx.font = '800 ' + Math.round(corpo * (0.6 + 0.4 * surgimento)) + 'px ' + FONTE;
      }
      ctx.lineWidth = destaque ? 18 : 12;
      ctx.strokeStyle = '#000';
      ctx.strokeText(flutuante.texto, flutuante.x, flutuante.y);
      ctx.fillStyle = destaque ? COR.amarelo : (flutuante.tipo === 'perigo' ? '#ff5470' : '#ffffff');
      ctx.fillText(flutuante.texto, flutuante.x, flutuante.y);
    }
    ctx.globalAlpha = 1;
  };

  Motor.LARGURA = LARGURA;
  Motor.ALTURA = ALTURA;
  window.CertelMotor = Motor;
})();
