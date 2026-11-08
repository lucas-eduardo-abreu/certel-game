"""Gera a folha de sprites do mascote correndo de costas.

Renderiza o modelo 3D (``mascote3d.js``) em um navegador headless e monta
``jogo/static/jogo/img/mascote_corrida.png``.

Preparação (uma vez):
    npm install                      (dentro de scripts/mascote3d)
    pip install playwright pillow
    playwright install chromium

Uso:
    python scripts/mascote3d/gerar_sprites.py

Se mudar a câmera ou o tamanho do quadro em ``render.html``, copie os valores
impressos (quadro e âncora) para as constantes SPRITE_* de ``motor.js``.
"""

import base64
import functools
import io
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent  # o render.html lê o logo em jogo/static/jogo/img/
SAIDA = AQUI.parent.parent / "jogo" / "static" / "jogo" / "img" / "mascote_corrida.png"
QUADROS = 16
COLUNAS = 4


class _Silencioso(SimpleHTTPRequestHandler):
    """Servidor de arquivos sem log no terminal."""

    def log_message(self, *args):
        """Descarta as mensagens de log."""


def renderizar_quadros(quantidade):
    """Renderiza os quadros do ciclo de corrida.

    Args:
        quantidade: Número de quadros do ciclo.

    Returns:
        tuple[list[Image.Image], dict]: Quadros já reduzidos e os dados do
        quadro (largura, altura e âncora do chão).
    """
    servidor = ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(_Silencioso, directory=str(RAIZ))
    )
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            navegador = p.chromium.launch(
                args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
            )
            pagina = navegador.new_page()
            pagina.add_init_script("window.semAnimacao = true;")
            pagina.goto(f"http://127.0.0.1:{servidor.server_port}/scripts/mascote3d/render.html")
            pagina.wait_for_function("window.renderizar && window.info")
            info = pagina.evaluate("window.info")
            quadros = []
            for indice in range(quantidade):
                dados = pagina.evaluate("f => window.renderizar(f)", indice / quantidade)
                imagem = Image.open(io.BytesIO(base64.b64decode(dados.split(",")[1]))).convert("RGBA")
                quadros.append(imagem.resize((info["largura"], info["altura"]), Image.LANCZOS))
            navegador.close()
    finally:
        servidor.shutdown()
    return quadros, info


def montar_folha(quadros, colunas):
    """Junta os quadros em uma grade.

    Args:
        quadros: Quadros do ciclo, na ordem.
        colunas: Quantidade de colunas da grade.

    Returns:
        Image.Image: Folha de sprites com fundo transparente.
    """
    largura, altura = quadros[0].size
    linhas = -(-len(quadros) // colunas)
    folha = Image.new("RGBA", (largura * colunas, altura * linhas), (0, 0, 0, 0))
    for indice, quadro in enumerate(quadros):
        folha.paste(quadro, ((indice % colunas) * largura, (indice // colunas) * altura))
    return folha


if __name__ == "__main__":
    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else SAIDA
    quadros, info = renderizar_quadros(QUADROS)
    folha = montar_folha(quadros, COLUNAS)
    # Cores chapadas: 256 cores bastam e o arquivo fica bem menor.
    folha.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(saida, optimize=True)
    print(f"{saida} ({saida.stat().st_size / 1024:.0f} kB)")
    print(
        f"quadros={QUADROS} colunas={COLUNAS} quadro={info['largura']}x{info['altura']} "
        f"ancora=({info['ancoraX']:.1f}, {info['ancoraY']:.1f})"
    )
