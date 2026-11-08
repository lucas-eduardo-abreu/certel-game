"""Gera ``demo.html``: o jogo do totem em um único arquivo, sem servidor.

Serve para mostrar o jogo ao cliente ou testar em um totem antes do deploy.
O ranking da demonstração fica apenas no navegador em que ela for aberta.

Uso:
    python scripts/gerar_demo.py [caminho_de_saida]
"""

import base64
import mimetypes
import os
import re
import sys
from pathlib import Path
from types import SimpleNamespace

RAIZ = Path(__file__).resolve().parent.parent
ESTATICOS = RAIZ / "jogo" / "static"

sys.path.insert(0, str(RAIZ))
os.environ["DEBUG"] = "True"  # garante URLs /static/ sem hash
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.template.loader import render_to_string  # noqa: E402

from jogo.models import ConfiguracaoJogo  # noqa: E402
from jogo.serializers import ConfiguracaoSerializer  # noqa: E402


def data_uri(caminho):
    """Converte um arquivo estático em data URI.

    Args:
        caminho: Caminho relativo a ``jogo/static`` (ex.: ``jogo/img/mascote.png``).

    Returns:
        str: Conteúdo do arquivo como ``data:<tipo>;base64,...``.
    """
    arquivo = ESTATICOS / caminho
    tipo = mimetypes.guess_type(arquivo.name)[0] or "application/octet-stream"
    if arquivo.suffix == ".woff2":
        tipo = "font/woff2"
    return f"data:{tipo};base64,{base64.b64encode(arquivo.read_bytes()).decode()}"


def embutir_css(correspondencia):
    """Troca um ``<link rel="stylesheet">`` pelo CSS embutido.

    Args:
        correspondencia: Resultado da expressão regular com o caminho do CSS.

    Returns:
        str: Bloco ``<style>`` com a fonte convertida em data URI.
    """
    css = (ESTATICOS / correspondencia.group(1)).read_text(encoding="utf-8")
    css = re.sub(r"\.\./fonts/([\w.\-]+\.woff2)", lambda c: data_uri(f"jogo/fonts/{c.group(1)}"), css)
    return f"<style>\n{css}\n</style>"


def embutir_js(correspondencia):
    """Troca um ``<script src>`` pelo código embutido.

    Args:
        correspondencia: Resultado da expressão regular com o caminho do script.

    Returns:
        str: Bloco ``<script>``; ``api.js`` é trocado pela versão de demonstração.
    """
    caminho = ESTATICOS / correspondencia.group(1)
    if caminho.name == "api.js":
        caminho = RAIZ / "scripts" / "api_demo.js"
    return f"<script>\n{caminho.read_text(encoding='utf-8')}\n</script>"


def gerar():
    """Monta o HTML da demonstração.

    Returns:
        str: Página completa, com CSS, scripts, imagens e fonte embutidos.
    """
    configuracao = dict(ConfiguracaoSerializer(ConfiguracaoJogo()).data)
    configuracao["totem"] = "Demonstração"
    html = render_to_string(
        "jogo/totem.html",
        {
            "totem": SimpleNamespace(nome="Demonstração"),
            "configuracao": configuracao,
            "csrf_token": "demo",
        },
    )
    html = re.sub(r'<form[^>]*action="/sair/".*?</form>', "", html, flags=re.S)
    html = re.sub(r'\s*<meta name="csrf-token"[^>]*>', "", html)
    html = re.sub(r'<link rel="stylesheet" href="/static/([^"]+)">', embutir_css, html)
    html = re.sub(r'<script src="/static/([^"]+)"></script>', embutir_js, html)
    html = re.sub(r"/static/(jogo/img/[\w.\-]+)", lambda c: data_uri(c.group(1)), html)
    area_segura = (
        "<style>:root{box-sizing:border-box;height:100%;"
        "padding-top:env(safe-area-inset-top,0px);"
        "padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n</head>"
    )
    return html.replace("</head>", area_segura, 1)


if __name__ == "__main__":
    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "demo.html"
    saida.write_text(gerar(), encoding="utf-8")
    print(f"{saida} ({saida.stat().st_size / 1024:.0f} kB)")
