"""Serializers da API usada pelos totens."""

from rest_framework import serializers

from .models import ConfiguracaoJogo


class ConfiguracaoSerializer(serializers.ModelSerializer):
    """Configuração do jogo no formato consumido pelo totem."""

    class Meta:
        model = ConfiguracaoJogo
        fields = [
            "titulo",
            "duracao_segundos",
            "pontos_acerto",
            "pontos_erro",
            "pedir_telefone",
            "texto_consentimento",
            "tamanho_ranking",
            "som_ativo",
        ]


class IniciarPartidaSerializer(serializers.Serializer):
    """Dados do cadastro feito no totem antes da partida."""

    nome = serializers.CharField(max_length=40)
    telefone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    aceite_lgpd = serializers.BooleanField(required=False, default=False)


class FinalizarPartidaSerializer(serializers.Serializer):
    """Resultado enviado pelo totem ao fim da partida."""

    pontuacao = serializers.IntegerField(min_value=0)
    itens_coletados = serializers.IntegerField(min_value=0, required=False, default=0)
    perigos_atingidos = serializers.IntegerField(min_value=0, required=False, default=0)
