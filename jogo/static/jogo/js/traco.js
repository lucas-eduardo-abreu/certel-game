/* Contorno dos títulos (.titulo-traco): copia o texto de cada título para
   data-texto, que o CSS desenha atrás dele com o traço preto (base.css).
   Acompanha as trocas de texto feitas pelas telas (título do ranking, nome
   sorteado, contagem do totem). Escrito em ES5 por causa dos navegadores de TV. */
(function () {
  'use strict';

  function copiar(el) {
    var texto = el.textContent;
    if (el.getAttribute('data-texto') !== texto) { el.setAttribute('data-texto', texto); }
  }

  function atualizar() {
    var titulos = document.querySelectorAll('.titulo-traco');
    for (var i = 0; i < titulos.length; i++) { copiar(titulos[i]); }
  }

  atualizar();
  if (window.MutationObserver) {
    // Só observa texto e filhos; a troca de atributo feita aqui não reentra.
    new MutationObserver(atualizar).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
})();
