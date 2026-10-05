/* Fluxo do totem: atração -> cadastro -> como jogar -> jogo -> resultado.
   Depende de CertelAPI (api.js), CertelSom (som.js), CertelTeclado
   (teclado.js) e CertelMotor (motor.js). */
(function () {
  'use strict';

  var $ = function (seletor) { return document.querySelector(seletor); };
  var $$ = function (seletor) { return Array.prototype.slice.call(document.querySelectorAll(seletor)); };

  var API = window.CertelAPI;
  var Som = window.CertelSom;
  var config = JSON.parse($('#configuracao').textContent);
  var caminhos = JSON.parse($('#imagens').textContent);

  var palco = $('#palco');
  var LARGURA = window.CertelMotor.LARGURA;
  var ALTURA = window.CertelMotor.ALTURA;

  var OCIOSO_CADASTRO_MS = 45000;
  var OCIOSO_RESULTADO_MS = 25000;
  var ATUALIZAR_ATRACAO_MS = 20000;
  var ESPERA_RESULTADO_MS = 6000;
  var CHAVE_PENDENTES = 'certel_pendentes';

  var estado = {
    tela: 'atracao',
    escala: 1,
    ultimoToque: Date.now(),
    jogador: { nome: '', telefone: '', aceite: false },
    campo: 'nome',
    partidaId: null,
    ocupado: false,
    motor: null,
    imagens: null
  };

  /* ---------------- Utilidades ---------------- */

  function milhar(numero) { return Number(numero).toLocaleString('pt-BR'); }

  function mascararTelefone(digitos) {
    if (!digitos) { return ''; }
    if (digitos.length <= 2) { return '(' + digitos; }
    var ddd = '(' + digitos.slice(0, 2) + ') ';
    var resto = digitos.slice(2);
    if (resto.length <= 4) { return ddd + resto; }
    var corte = resto.length > 8 ? 5 : 4;
    return ddd + resto.slice(0, corte) + '-' + resto.slice(corte);
  }

  function elemento(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) { el.className = classe; }
    if (texto !== undefined) { el.textContent = texto; }
    return el;
  }

  function carregarImagem(caminho) {
    return new Promise(function (resolver, rejeitar) {
      var imagem = new Image();
      imagem.onload = function () { resolver(imagem); };
      imagem.onerror = function () { rejeitar(new Error('Imagem não carregou: ' + caminho)); };
      imagem.src = caminho;
    });
  }

  function carregarImagens() {
    return Promise.all([
      carregarImagem(caminhos.mascote),
      Promise.all(caminhos.bons.map(carregarImagem)),
      Promise.all(caminhos.ruins.map(carregarImagem))
    ]).then(function (r) { return { mascote: r[0], bons: r[1], ruins: r[2] }; });
  }

  /* ---------------- Palco ---------------- */

  function ajustarPalco() {
    estado.escala = Math.min(window.innerWidth / LARGURA, window.innerHeight / ALTURA);
    palco.style.setProperty('--escala', estado.escala);
    if (estado.motor && estado.tela !== 'jogo') { estado.motor.ajustarResolucao(estado.escala); }
  }

  function mostrar(tela) {
    estado.tela = tela;
    estado.ultimoToque = Date.now();
    $$('.tela').forEach(function (secao) {
      secao.classList.toggle('ativa', secao.dataset.tela === tela);
    });
  }

  function aplicarConfig() {
    document.title = config.titulo;
    $$('[data-titulo]').forEach(function (el) { el.textContent = config.titulo; });
    $$('[data-pontos-acerto]').forEach(function (el) { el.textContent = config.pontos_acerto; });
    $$('[data-pontos-erro]').forEach(function (el) { el.textContent = config.pontos_erro; });
    $$('[data-duracao]').forEach(function (el) { el.textContent = config.duracao_segundos; });
    $$('[data-consentimento]').forEach(function (el) { el.textContent = config.texto_consentimento; });
    $$('[data-telefone]').forEach(function (el) { el.hidden = !config.pedir_telefone; });
    Som.ligar(config.som_ativo);
  }

  /* ---------------- Atração ---------------- */

  function desenharPodio(ranking) {
    var podio = $('#podio');
    podio.textContent = '';
    if (!ranking.length) {
      podio.appendChild(elemento('li', 'podio-vazio', 'Seja o primeiro no ranking!'));
      return;
    }
    ranking.slice(0, 3).forEach(function (linha) {
      var li = elemento('li');
      li.appendChild(elemento('span', 'lugar', linha.posicao + 'º lugar'));
      li.appendChild(elemento('span', 'nome', linha.nome));
      li.appendChild(elemento('span', 'pontos', milhar(linha.pontuacao)));
      podio.appendChild(li);
    });
  }

  function atualizarAtracao() {
    enviarPendentes();
    API.ranking().then(function (dados) { desenharPodio(dados.ranking); }).catch(function () {});
    API.config().then(function (dados) { config = dados; aplicarConfig(); }).catch(function () {});
  }

  function irParaAtracao() {
    estado.jogador = { nome: '', telefone: '', aceite: false };
    estado.partidaId = null;
    estado.ocupado = false;
    mostrar('atracao');
    atualizarAtracao();
  }

  /* ---------------- Cadastro ---------------- */

  var teclado = null;

  function desenharCadastro() {
    $$('.campo').forEach(function (campo) {
      var nome = campo.dataset.campo;
      campo.classList.toggle('ativo', nome === estado.campo);
      var valor = nome === 'telefone' ? mascararTelefone(estado.jogador.telefone) : estado.jogador.nome;
      campo.querySelector('.valor').textContent = valor;
    });
    $('#aceite').setAttribute('aria-checked', estado.jogador.aceite ? 'true' : 'false');
  }

  function focarCampo(campo) {
    estado.campo = campo;
    teclado.mostrar(campo === 'telefone' ? 'numeros' : 'letras');
    desenharCadastro();
  }

  function erroCadastro(mensagem) { $('#cadastro-erro').textContent = mensagem || ''; }

  function teclar(codigo) {
    Som.toque();
    erroCadastro('');
    var jogador = estado.jogador;
    if (codigo === 'ok') {
      if (estado.campo === 'nome' && config.pedir_telefone) { focarCampo('telefone'); } else { enviarCadastro(); }
      return;
    }
    if (estado.campo === 'telefone') {
      if (codigo === 'apagar') { jogador.telefone = jogador.telefone.slice(0, -1); }
      else if (/^\d$/.test(codigo) && jogador.telefone.length < 11) { jogador.telefone += codigo; }
    } else {
      if (codigo === 'apagar') { jogador.nome = jogador.nome.slice(0, -1); }
      else if (codigo === ' ') { if (jogador.nome && !/ $/.test(jogador.nome)) { jogador.nome += ' '; } }
      else if (codigo.length === 1 && jogador.nome.length < 24) { jogador.nome += codigo; }
    }
    desenharCadastro();
  }

  function irParaCadastro() {
    Som.destravar();
    Som.toque();
    estado.jogador = { nome: '', telefone: '', aceite: false };
    erroCadastro('');
    mostrar('cadastro');
    focarCampo('nome');
  }

  function validarCadastro() {
    var jogador = estado.jogador;
    if (jogador.nome.trim().length < 2) { focarCampo('nome'); return 'Digite seu nome para jogar.'; }
    if (config.pedir_telefone) {
      if (jogador.telefone.length < 10) { focarCampo('telefone'); return 'Digite o telefone com DDD.'; }
      if (!jogador.aceite) { return 'Marque a autorização para continuar.'; }
    }
    return '';
  }

  function abrirPartida() {
    var jogador = estado.jogador;
    return API.iniciar({
      nome: jogador.nome.trim(),
      telefone: jogador.telefone,
      aceite_lgpd: jogador.aceite
    }).then(function (dados) { estado.partidaId = dados.id; });
  }

  function enviarCadastro() {
    if (estado.ocupado) { return; }
    var problema = validarCadastro();
    if (problema) { erroCadastro(problema); return; }
    estado.ocupado = true;
    $('#cadastro-comecar').disabled = true;
    abrirPartida()
      .then(function () { mostrar('instrucoes'); })
      .catch(function (erro) {
        erroCadastro(erro.negocio ? erro.message : 'Sem conexão com o servidor. Tente de novo.');
      })
      .finally(function () {
        estado.ocupado = false;
        $('#cadastro-comecar').disabled = false;
      });
  }

  /* ---------------- Jogo ---------------- */

  function atualizarPlacar(pontos, delta, perigo) {
    var placar = $('#placar');
    $('#placar-numero').textContent = milhar(pontos);
    placar.classList.remove('ganhou', 'perdeu');
    if (delta || perigo) {
      void placar.offsetWidth; // reinicia a animação
      placar.classList.add(perigo ? 'perdeu' : 'ganhou');
    }
  }

  function atualizarTempo(restante, fracao) {
    $('#tempo-barra').style.transform = 'scaleX(' + fracao + ')';
    $('#tempo-segundos').textContent = Math.ceil(restante);
    $('#tempo').classList.toggle('acabando', restante <= 8);
  }

  function contagemRegressiva() {
    var contagem = $('#contagem');
    var passos = ['3', '2', '1', 'Já!'];
    return new Promise(function (resolver) {
      contagem.classList.add('visivel');
      var indice = 0;
      (function proximo() {
        if (indice >= passos.length) {
          contagem.classList.remove('visivel');
          contagem.textContent = '';
          resolver();
          return;
        }
        var ultimo = indice === passos.length - 1;
        contagem.textContent = '';
        contagem.appendChild(elemento('span', 'titulo-traco' + (ultimo ? ' texto' : ''), passos[indice]));
        if (ultimo) { Som.largada(); } else { Som.contagem(); }
        indice += 1;
        setTimeout(proximo, ultimo ? 550 : 800);
      })();
    });
  }

  function comecarJogo() {
    Som.destravar();
    mostrar('jogo');
    var motor = estado.motor;
    motor.opcoes.duracao = config.duracao_segundos;
    motor.opcoes.pontosAcerto = config.pontos_acerto;
    motor.opcoes.pontosErro = config.pontos_erro;
    motor.ajustarResolucao(estado.escala);
    motor.preparar();
    atualizarPlacar(0, 0);
    atualizarTempo(config.duracao_segundos, 1);
    contagemRegressiva().then(function () {
      if (estado.tela === 'jogo') { motor.iniciar(); }
    });
  }

  function terminarJogo(resultado) {
    Som.fim();
    var contagem = $('#contagem');
    contagem.textContent = '';
    contagem.appendChild(elemento('span', 'titulo-traco texto', 'Fim!'));
    contagem.classList.add('visivel');
    // Espera o servidor por no máximo ESPERA_RESULTADO_MS; o envio segue em segundo plano.
    var envio = Promise.race([
      enviarResultado(resultado),
      new Promise(function (r) { setTimeout(function () { r({ semConexao: true }); }, ESPERA_RESULTADO_MS); })
    ]);
    setTimeout(function () {
      envio.then(function (resposta) {
        contagem.classList.remove('visivel');
        contagem.textContent = '';
        mostrarResultado(resultado, resposta);
      });
    }, 1100);
  }

  /* ---------------- Envio da pontuação ---------------- */

  function lerPendentes() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PENDENTES) || '[]'); } catch (e) { return []; }
  }

  function gravarPendentes(lista) {
    try { localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(lista)); } catch (e) { /* sem armazenamento */ }
  }

  /* Reenvia pontuações que ficaram presas por falta de internet. */
  function enviarPendentes() {
    var pendentes = lerPendentes();
    if (!pendentes.length) { return; }
    var item = pendentes[0];
    API.finalizar(item.id, item.dados)
      .then(function () { return true; })
      .catch(function (erro) { return !!erro.negocio; }) // recusado pelo servidor: descarta
      .then(function (resolvido) {
        if (!resolvido) { return; }
        gravarPendentes(lerPendentes().filter(function (p) { return p.id !== item.id; }));
        enviarPendentes();
      });
  }

  function enviarResultado(resultado) {
    var id = estado.partidaId;
    var dados = {
      pontuacao: resultado.pontos,
      itens_coletados: resultado.coletados,
      perigos_atingidos: resultado.atingidos
    };
    var tentativas = 0;
    function tentar() {
      tentativas += 1;
      return API.finalizar(id, dados).catch(function (erro) {
        if (erro.negocio) { return { erro: erro.message }; }
        if (tentativas < 3) {
          return new Promise(function (r) { setTimeout(r, 1200); }).then(tentar);
        }
        gravarPendentes(lerPendentes().concat([{ id: id, dados: dados }]));
        return { semConexao: true };
      });
    }
    return tentar();
  }

  /* ---------------- Resultado ---------------- */

  function desenharRanking(lista, jogadorId) {
    var ol = $('#resultado-ranking');
    ol.textContent = '';
    if (!lista || !lista.length) {
      ol.appendChild(elemento('li', 'vazio', 'O ranking aparece aqui.'));
      return;
    }
    lista.slice(0, 8).forEach(function (linha) {
      var li = elemento('li', linha.jogador_id === jogadorId ? 'voce' : '');
      li.appendChild(elemento('span', 'lugar', linha.posicao + 'º'));
      li.appendChild(elemento('span', 'nome', linha.nome));
      li.appendChild(elemento('span', 'pontos', milhar(linha.pontuacao)));
      ol.appendChild(li);
    });
  }

  function mostrarResultado(resultado, resposta) {
    $('#resultado-numero').textContent = milhar(resultado.pontos);
    var frase;
    if (resposta.semConexao) {
      frase = 'Sem internet agora. Sua pontuação entra no ranking quando a conexão voltar.';
    } else if (resposta.erro) {
      frase = 'Não foi possível registrar a pontuação: ' + resposta.erro;
    } else if (resposta.posicao) {
      frase = 'Você está em ' + resposta.posicao + 'º lugar no ranking geral';
      if (resposta.melhor_pontuacao > resultado.pontos) {
        frase += '. Seu recorde é ' + milhar(resposta.melhor_pontuacao) + ' pontos';
      }
      frase += '.';
    } else {
      frase = 'Pontuação registrada.';
    }
    $('#resultado-posicao').textContent = frase;
    desenharRanking(resposta.ranking, resposta.jogador_id);
    mostrar('resultado');
    if (!resposta.ranking) {
      API.ranking().then(function (dados) { desenharRanking(dados.ranking); }).catch(function () {});
    }
  }

  function jogarDeNovo() {
    if (estado.ocupado) { return; }
    estado.ocupado = true;
    Som.toque();
    abrirPartida()
      .then(comecarJogo)
      .catch(function (erro) {
        $('#resultado-posicao').textContent = erro.negocio
          ? erro.message
          : 'Sem conexão com o servidor. Tente de novo.';
      })
      .finally(function () { estado.ocupado = false; });
  }

  /* ---------------- Controles do jogo ---------------- */

  function ligarControles() {
    var setas = { esquerda: false, direita: false };

    function aplicarSetas() {
      var direcao = (setas.direita ? 1 : 0) - (setas.esquerda ? 1 : 0);
      estado.motor.definirDirecao(direcao);
      $('#seta-esquerda').classList.toggle('pressionado', setas.esquerda);
      $('#seta-direita').classList.toggle('pressionado', setas.direita);
    }

    [['esquerda', '#seta-esquerda'], ['direita', '#seta-direita']].forEach(function (par) {
      var botao = $(par[1]);
      botao.addEventListener('pointerdown', function (evento) {
        evento.preventDefault();
        botao.setPointerCapture(evento.pointerId);
        setas[par[0]] = true;
        aplicarSetas();
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (tipo) {
        botao.addEventListener(tipo, function () { setas[par[0]] = false; aplicarSetas(); });
      });
    });

    // Arrastar o dedo na pista: o mascote segue a posição horizontal.
    var pista = $('#pista');
    var dedo = null;
    function xNoPalco(evento) {
      var caixa = pista.getBoundingClientRect();
      return ((evento.clientX - caixa.left) / caixa.width) * LARGURA;
    }
    pista.addEventListener('pointerdown', function (evento) {
      dedo = evento.pointerId;
      pista.setPointerCapture(dedo);
      estado.motor.definirAlvo(xNoPalco(evento));
    });
    pista.addEventListener('pointermove', function (evento) {
      if (evento.pointerId === dedo) { estado.motor.definirAlvo(xNoPalco(evento)); }
    });
    ['pointerup', 'pointercancel'].forEach(function (tipo) {
      pista.addEventListener(tipo, function (evento) {
        if (evento.pointerId === dedo) { dedo = null; estado.motor.definirAlvo(null); }
      });
    });

    // Teclado físico (testes no computador).
    var ESQUERDA = { ArrowLeft: 1, a: 1, A: 1 };
    var DIREITA = { ArrowRight: 1, d: 1, D: 1 };
    window.addEventListener('keydown', function (evento) {
      if (estado.tela === 'jogo') {
        if (ESQUERDA[evento.key]) { setas.esquerda = true; aplicarSetas(); }
        if (DIREITA[evento.key]) { setas.direita = true; aplicarSetas(); }
      } else if (estado.tela === 'cadastro') {
        if (evento.key === 'Backspace') { evento.preventDefault(); teclar('apagar'); }
        else if (evento.key === 'Enter') { teclar('ok'); }
        else if (evento.key === 'Tab') { evento.preventDefault(); if (config.pedir_telefone) { focarCampo(estado.campo === 'nome' ? 'telefone' : 'nome'); } }
        else if (evento.key === ' ') { evento.preventDefault(); teclar(' '); }
        else if (/^[a-zA-ZÀ-ÿ]$/.test(evento.key) && estado.campo === 'nome') { teclar(evento.key.toUpperCase()); }
        else if (/^\d$/.test(evento.key) && estado.campo === 'telefone') { teclar(evento.key); }
      } else if (estado.tela === 'atracao' && (evento.key === 'Enter' || evento.key === ' ')) {
        irParaCadastro();
      } else if (estado.tela === 'instrucoes' && evento.key === 'Enter') {
        comecarJogo();
      }
    });
    window.addEventListener('keyup', function (evento) {
      if (ESQUERDA[evento.key]) { setas.esquerda = false; aplicarSetas(); }
      if (DIREITA[evento.key]) { setas.direita = false; aplicarSetas(); }
    });
  }

  /* ---------------- Operador e modo quiosque ---------------- */

  function ligarOperador() {
    var toques = [];
    $('#canto-operador').addEventListener('pointerdown', function (evento) {
      evento.stopPropagation();
      var agora = Date.now();
      toques = toques.filter(function (t) { return agora - t < 3000; });
      toques.push(agora);
      if (toques.length >= 5) { toques = []; $('#operador').classList.add('aberto'); }
    });
    $('#canto-operador').addEventListener('click', function (evento) { evento.stopPropagation(); });
    $('#operador-fechar').addEventListener('click', function () { $('#operador').classList.remove('aberto'); });
    $('#operador-recarregar').addEventListener('click', function () { window.location.reload(); });
    $('#operador-tela-cheia').addEventListener('click', function () {
      var raiz = document.documentElement;
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (raiz.requestFullscreen) { raiz.requestFullscreen().catch(function () {}); }
      $('#operador').classList.remove('aberto');
    });
  }

  function modoQuiosque() {
    document.addEventListener('contextmenu', function (evento) { evento.preventDefault(); });
    document.addEventListener('gesturestart', function (evento) { evento.preventDefault(); });
    document.addEventListener('dragstart', function (evento) { evento.preventDefault(); });
    document.addEventListener('pointerdown', function () { estado.ultimoToque = Date.now(); }, true);

    // Mantém a tela do totem acesa (quando o navegador permite).
    function manterAcesa() {
      if (navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').catch(function () {});
      }
    }
    manterAcesa();
    document.addEventListener('visibilitychange', manterAcesa);

    // Volta sozinho para a atração se o jogador abandonar o totem.
    setInterval(function () {
      var parado = Date.now() - estado.ultimoToque;
      if ((estado.tela === 'cadastro' || estado.tela === 'instrucoes') && parado > OCIOSO_CADASTRO_MS) { irParaAtracao(); }
      if (estado.tela === 'resultado' && parado > OCIOSO_RESULTADO_MS) { irParaAtracao(); }
    }, 1000);

    setInterval(function () { if (estado.tela === 'atracao') { atualizarAtracao(); } }, ATUALIZAR_ATRACAO_MS);
  }

  /* ---------------- Início ---------------- */

  function iniciar() {
    ajustarPalco();
    window.addEventListener('resize', ajustarPalco);
    aplicarConfig();

    teclado = window.CertelTeclado.criar($('#teclado'), teclar);
    $$('.campo').forEach(function (campo) {
      campo.addEventListener('click', function () { Som.toque(); focarCampo(campo.dataset.campo); });
    });
    $('#aceite').addEventListener('click', function () {
      Som.toque();
      estado.jogador.aceite = !estado.jogador.aceite;
      erroCadastro('');
      desenharCadastro();
    });
    $('#cadastro-voltar').addEventListener('click', irParaAtracao);
    $('#cadastro-comecar').addEventListener('click', enviarCadastro);
    $('.tela-atracao').addEventListener('click', irParaCadastro);
    $('#instrucoes-jogar').addEventListener('click', comecarJogo);
    $('#resultado-de-novo').addEventListener('click', jogarDeNovo);
    $('#resultado-encerrar').addEventListener('click', irParaAtracao);

    ligarOperador();
    modoQuiosque();

    carregarImagens().then(function (imagens) {
      estado.imagens = imagens;
      estado.motor = new window.CertelMotor($('#pista'), imagens, {
        aoPontuar: atualizarPlacar,
        aoTempo: atualizarTempo,
        aoTerminar: terminarJogo
      });
      ligarControles();
      atualizarAtracao();
    });
  }

  // Exposto para depuração e testes automatizados no navegador.
  window.CertelTotem = { estado: estado };

  iniciar();
})();
