"""Endpoints JSON consumidos pelos totens e pelo telão do ranking."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from . import perfis, services
from .models import ConfiguracaoJogo, Partida, Sorteio
from .serializers import (
    ConfiguracaoSerializer,
    FinalizarPartidaSerializer,
    IniciarPartidaSerializer,
    RoletaSerializer,
)

# Nome mostrado no lugar do totem quando o admin abre o jogo em prévia.
NOME_PREVIA = "Prévia (admin)"

# Quantos nomes a roleta desenha (com mais participantes, vai uma amostra).
NOMES_NA_ROLETA = 36


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
        return perfis.totem_ativo(request.user) is not None


class EhTotemOuAdmin(BasePermission):
    """Totem ativo ou admin (que abre o jogo em modo prévia)."""

    message = "Faça login com o usuário de um totem ativo."

    def has_permission(self, request, view):
        """Libera totens ativos e o admin."""
        usuario = request.user
        return perfis.totem_ativo(usuario) is not None or perfis.eh_admin(usuario)


class PodeVerRanking(BasePermission):
    """Totens (pódio e resultado), o telão do ranking e o admin."""

    message = "Faça login com o usuário do ranking."

    def has_permission(self, request, view):
        """Libera totens ativos, o grupo Ranking e o admin."""
        usuario = request.user
        return perfis.totem_ativo(usuario) is not None or perfis.eh_ranking(usuario)


class EhRanking(BasePermission):
    """Só o grupo Ranking e o admin, que operam a roleta."""

    message = "Faça login com o usuário do ranking."

    def has_permission(self, request, view):
        """Libera o grupo Ranking e o admin."""
        return perfis.eh_ranking(request.user)


class ConfiguracaoView(APIView):
    """Configuração em vigor, para o totem se atualizar sem recarregar."""

    permission_classes = [EhTotemOuAdmin]

    def get(self, request):
        """Retorna a configuração do jogo e o nome do totem logado."""
        dados = ConfiguracaoSerializer(ConfiguracaoJogo.carregar()).data
        totem = perfis.totem_ativo(request.user)
        dados["totem"] = totem.nome if totem else NOME_PREVIA
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
    """Ranking geral, para os totens e o telão."""

    permission_classes = [PodeVerRanking]

    def get(self, request):
        """Retorna o ranking geral (sempre o top 5) e o título do jogo.

        Returns:
            Response: ``titulo`` e a lista ``ranking``.
        """
        configuracao = ConfiguracaoJogo.carregar()
        return Response({"titulo": configuracao.titulo, "ranking": services.montar_ranking()})


def _sorteio_json(sorteio):
    """Formata um sorteio para a tela da roleta.

    Args:
        sorteio: Sorteio com o vencedor carregado.

    Returns:
        dict: Nome completo, nome curto, final do telefone e quantos concorreram.
    """
    vencedor = sorteio.vencedor
    return {
        "id": str(sorteio.pk),
        "nome": vencedor.nome,
        "nome_curto": vencedor.nome_publico,
        "telefone_final": vencedor.telefone[-4:],
        "participantes": sorteio.participantes,
        "quando": sorteio.created_at.isoformat(),
    }


class RoletaView(APIView):
    """Roleta de sorteio: participantes, vencedores e giro."""

    permission_classes = [EhRanking]

    def _escopo(self, dados):
        """Valida tipo e dia; sem dia, o diário usa hoje.

        Args:
            dados: Query string ou corpo da requisição.

        Returns:
            tuple[str, date | None] | None: Tipo e dia, ou ``None`` se inválido.
        """
        serializer = RoletaSerializer(data=dados)
        if not serializer.is_valid():
            return None
        tipo = serializer.validated_data["tipo"]
        dia = serializer.validated_data.get("dia") or timezone.localdate()
        return tipo, dia if tipo == Sorteio.Tipo.DIARIO else None

    def get(self, request):
        """Retorna o estado da roleta para um tipo e dia.

        Returns:
            Response: ``total`` de participantes, uma amostra de ``nomes``
            para desenhar a roleta, se o sorteio está ``encerrado`` (limite
            do dia), os ``sorteios`` já feitos e os ``dias`` com partidas.
        """
        escopo = self._escopo(request.query_params)
        if escopo is None:
            return Response({"erro": "Tipo ou dia inválido."}, status=400)
        tipo, dia = escopo
        participantes = services.participantes_do_sorteio(tipo, dia)
        nomes = [j.nome_publico for j in participantes.order_by("?")[:NOMES_NA_ROLETA]]
        return Response(
            {
                "tipo": tipo,
                "dia": dia.isoformat() if dia else None,
                "dias": [d.isoformat() for d in services.dias_com_partidas()],
                "total": participantes.count(),
                # Sorteio geral limitado ao top N do ranking (0 = todos).
                "somente_top": (
                    ConfiguracaoJogo.carregar().sorteio_geral_top
                    if tipo == Sorteio.Tipo.GERAL
                    else 0
                ),
                "nomes": nomes,
                # Sorteio do dia: só um por dia; depois disso o botão trava.
                "encerrado": services.sorteio_encerrado(tipo, dia),
                "sorteios": [_sorteio_json(s) for s in services.sorteios_realizados(tipo, dia)],
            }
        )

    def post(self, request):
        """Gira a roleta e devolve o vencedor.

        Returns:
            Response: ``201`` com o ``sorteio``, ou ``400`` com ``erro``.
        """
        escopo = self._escopo(request.data)
        if escopo is None:
            return Response({"erro": "Tipo ou dia inválido."}, status=400)
        tipo, dia = escopo
        try:
            sorteio = services.sortear(tipo, dia, usuario=request.user)
        except services.SorteioInvalido as erro:
            return Response({"erro": str(erro)}, status=400)
        return Response({"sorteio": _sorteio_json(sorteio)}, status=status.HTTP_201_CREATED)
