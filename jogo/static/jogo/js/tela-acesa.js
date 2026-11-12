/* Telão sempre aceso (ranking e sorteio): pede ao navegador para a tela não
   entrar em descanso enquanto a página estiver aberta.

   1. Screen Wake Lock API, quando existe (Chrome/Edge recentes, em HTTPS).
   2. Para navegadores de TV sem essa API: um vídeo mudo, de 1 pixel, tocando
      sem parar (gerado de um canvas, sem arquivo). Vídeo tocando costuma
      impedir o descanso de tela do navegador.

   O pedido cai quando a aba fica oculta; é refeito ao voltar e a qualquer
   toque ou tecla. Isso não desliga a economia de energia da própria TV
   (desligamento automático, proteção de tela do aparelho): essa fica nas
   configurações da TV. Escrito em ES5 por causa dos navegadores de TV. */
(function () {
  'use strict';

  var trava = null;
  var video = null;

  function pedirTrava() {
    if (!('wakeLock' in navigator) || trava || document.visibilityState !== 'visible') { return; }
    navigator.wakeLock.request('screen').then(function (novaTrava) {
      trava = novaTrava;
      trava.addEventListener('release', function () { trava = null; });
    }).catch(function () { /* sem permissão agora; tenta de novo no próximo evento */ });
  }

  function criarVideo() {
    var canvas = document.createElement('canvas');
    if (!canvas.captureStream) { return null; }
    canvas.width = 2;
    canvas.height = 2;
    var contexto = canvas.getContext('2d');
    var cor = 0;
    // O stream só gera quadros quando o canvas muda.
    setInterval(function () {
      cor = 1 - cor;
      contexto.fillStyle = cor ? '#000' : '#010101';
      contexto.fillRect(0, 0, 2, 2);
    }, 1000);

    var el = document.createElement('video');
    el.muted = true;
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    el.srcObject = canvas.captureStream(1);
    document.body.appendChild(el);
    return el;
  }

  function tocarVideo() {
    if (!video) { video = criarVideo(); }
    if (video && video.paused) {
      var tocando = video.play();
      if (tocando && tocando.catch) { tocando.catch(function () {}); }
    }
  }

  function manterAcesa() {
    pedirTrava();
    tocarVideo();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { manterAcesa(); }
  });
  ['pointerdown', 'keydown', 'click'].forEach(function (evento) {
    document.addEventListener(evento, manterAcesa, { passive: true });
  });
  // Reforço periódico: se o navegador soltou a trava ou pausou o vídeo, pede de novo.
  setInterval(manterAcesa, 60000);
  manterAcesa();
})();
