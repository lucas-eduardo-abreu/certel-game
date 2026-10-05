"""Endpoints JSON consumidos pelos totens e pelo telão do ranking."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import ConfiguracaoJogo, Partida
from .serializers import (
    ConfiguracaoSerializer,
    FinalizarPartidaSerializer,
    IniciarPartidaSerializer,
)


class EhTotem(BasePermission):
    """Libera o acesso apenas para usuários vinculados a um totem ativo."""

    message = "Faça login com o usuário de um totem ativo."

    def has_permission(self, request, view):
        """Verifica se o usuário autenticado é um totem ativo.

        Args:
            request: Requisição em andamento.
            view: View que está sendo acessada.

        Returns:
            bool: ``True`` se o usuário tiver um totem ativo.
        """
        usuario = request.user
        if not usuario.is_authenticated:
            return False
        totem = getattr(usuario, "totem", None)
        return bool(totem and totem.ativo)


class ConfiguracaoView(APIView):
    """Configuração em vigor, para o totem se atualizar sem recarregar."""

    permission_classes = [EhTotem]

    def get(self, request):
        """Retorna a configuração do jogo e o nome do totem logado."""
        dados = ConfiguracaoSerializer(ConfiguracaoJogo.carregar()).data
        dados["totem"] = request.user.totem.nome
        return Response(dados)


class IniciarPartidaView(APIView):
    """Cadastra o jogador e abre uma partida."""

    permission_classes = [EhTotem]

    def post(self, request):
        """Cria a partida a partir dos dados do cadastro.

        Returns:
            Response: ``201`` com o ``id`` da partida, ou ``400`` com ``erro``.
        """
        serializer = IniciarPartidaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"erro": "Confira os dados digitados."}, status=400)
        try:
            partida = services.iniciar_partida(request.user.totem, **serializer.validated_data)
        except services.PartidaInvalida as erro:
            return Response({"erro": str(erro)}, status=400)
        return Response(
            {"id": str(partida.pk), "jogador": partida.jogador.nome_publico},
            status=status.HTTP_201_CREATED,
        )


class FinalizarPartidaView(APIView):
    """Recebe a pontuação e devolve a colocação do jogador."""

    permission_classes = [EhTotem]

    def post(self, request, pk):
        """Finaliza a partida do totem logado.

        Args:
            request: Requisição com ``pontuacao`` e estatísticas.
            pk: UUID da partida.

        Returns:
            Response: Pontuação, posição no ranking geral e o ranking.
        """
        partida = get_object_or_404(Partida, pk=pk, totem=request.user.totem)
        serializer = FinalizarPartidaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"erro": "Pontuação inválida."}, status=400)
        try:
            partida = services.finalizar_partida(partida, **serializer.validated_data)
        except services.PartidaInvalida as erro:
            return Response({"erro": str(erro)}, status=400)

        posicao, melhor = services.posicao_do_jogador(partida.jogador)
        return Response(
            {
                "pontuacao": partida.pontuacao,
                "melhor_pontuacao": melhor,
                "posicao": posicao,
                "jogador_id": str(partida.jogador_id),
                "ranking": services.montar_ranking(),
            }
        )


class RankingView(APIView):
    """Ranking geral. Público, para o telão rodar em outra máquina."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """Retorna o ranking geral e o título do jogo.

        Returns:
            Response: ``titulo`` e a lista ``ranking``.
        """
        configuracao = ConfiguracaoJogo.carregar()
        try:
            limite = int(request.query_params.get("limite", configuracao.tamanho_ranking))
        except ValueError:
            limite = configuracao.tamanho_ranking
        limite = max(1, min(limite, 50))
        return Response(
            {"titulo": configuracao.titulo, "ranking": services.montar_ranking(limite)}
        )
