/* Teclado na tela para o cadastro (totens costumam rodar sem teclado físico).
   Expõe window.CertelTeclado.criar(elemento, aoTeclar), que devolve
   { mostrar('letras' | 'numeros') }. aoTeclar recebe uma letra/dígito,
   ' ' (espaço), 'apagar' ou 'ok'. */
(function () {
  'use strict';

  var LETRAS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'apagar'],
    ['espaco', 'ok']
  ];
  var NUMEROS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['apagar', '0', 'ok']
  ];

  function criarTecla(codigo) {
    var tecla = document.createElement('button');
    tecla.type = 'button';
    tecla.className = 'tecla';
    tecla.dataset.codigo = codigo;
    if (codigo === 'apagar') {
      tecla.classList.add('larga');
      tecla.textContent = 'Apagar';
      tecla.setAttribute('aria-label', 'Apagar');
    } else if (codigo === 'espaco') {
      tecla.classList.add('espaco');
      tecla.textContent = 'Espaço';
      tecla.dataset.codigo = ' ';
    } else if (codigo === 'ok') {
      tecla.classList.add('larga', 'acao');
      tecla.textContent = 'OK';
    } else {
      tecla.textContent = codigo;
    }
    return tecla;
  }

  function criar(elemento, aoTeclar) {
    function mostrar(modo) {
      var linhas = modo === 'numeros' ? NUMEROS : LETRAS;
      elemento.classList.toggle('numerico', modo === 'numeros');
      elemento.textContent = '';
      linhas.forEach(function (linha) {
        var div = document.createElement('div');
        div.className = 'linha';
        linha.forEach(function (codigo) { div.appendChild(criarTecla(codigo)); });
        elemento.appendChild(div);
      });
    }

    // pointerdown responde na hora (sem o atraso do click em telas de toque).
    elemento.addEventListener('pointerdown', function (evento) {
      var tecla = evento.target.closest('.tecla');
      if (!tecla) { return; }
      evento.preventDefault();
      tecla.classList.add('pressionado');
      setTimeout(function () { tecla.classList.remove('pressionado'); }, 120);
      aoTeclar(tecla.dataset.codigo);
    });

    mostrar('letras');
    return { mostrar: mostrar };
  }

  window.CertelTeclado = { criar: criar };
})();
