/* Menu do telão: mostra ao mexer o mouse ou tocar, esconde após alguns segundos parado. */
(function () {
  'use strict';

  var ESCONDER_MS = 3500;
  var nav = document.getElementById('telao-nav');
  if (!nav) { return; }
  var relogio = null;

  function mostrar() {
    nav.classList.add('visivel');
    clearTimeout(relogio);
    relogio = setTimeout(function () {
      if (!nav.contains(document.activeElement)) { nav.classList.remove('visivel'); }
    }, ESCONDER_MS);
  }

  ['mousemove', 'pointerdown', 'keydown'].forEach(function (evento) {
    document.addEventListener(evento, mostrar, { passive: true });
  });
})();
