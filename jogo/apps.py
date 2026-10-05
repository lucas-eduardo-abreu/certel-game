"""Configuração do app ``jogo``."""

from django.apps import AppConfig


class JogoConfig(AppConfig):
    """App do jogo: totens, jogadores, partidas e ranking."""

    name = "jogo"
    verbose_name = "Jogo"
