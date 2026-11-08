"""Auxiliares compartilhados pelos testes."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from model_bakery import baker

from jogo.models import Partida, Totem
from jogo.perfis import GRUPO_RANKING


def criar_totem(numero=1, ativo=True, senha="senha-do-totem"):
    """Cria um totem com usuário próprio.

    Args:
        numero: Número usado no login (``totemN``) e no nome.
        ativo: Se o totem está ativo.
        senha: Senha do usuário do totem.

    Returns:
        Totem: Totem criado.
    """
    usuario = get_user_model().objects.create_user(username=f"totem{numero}", password=senha)
    return baker.make(Totem, usuario=usuario, nome=f"Totem {numero}", ativo=ativo)


def criar_usuario_ranking(senha="senha-ranking"):
    """Cria o usuário do telão (grupo Ranking).

    Args:
        senha: Senha do usuário.

    Returns:
        User: Usuário criado.
    """
    usuario = get_user_model().objects.create_user(username="ranking", password=senha)
    usuario.groups.add(Group.objects.get_or_create(name=GRUPO_RANKING)[0])
    return usuario


def criar_admin(senha="senha-admin"):
    """Cria um superusuário.

    Args:
        senha: Senha do admin.

    Returns:
        User: Superusuário criado.
    """
    return get_user_model().objects.create_superuser(username="admin", password=senha)


def criar_partida_finalizada(totem, pontuacao, jogador=None, minutos_atras=0, **extras):
    """Cria uma partida já finalizada.

    Args:
        totem: Totem da partida.
        pontuacao: Pontuação registrada.
        jogador: Jogador (criado se omitido).
        minutos_atras: Há quantos minutos a partida foi finalizada.
        **extras: Outros campos da partida.

    Returns:
        Partida: Partida finalizada.
    """
    jogador = jogador or baker.make("jogo.Jogador", nome="Jogador Teste")
    return baker.make(
        Partida,
        totem=totem,
        jogador=jogador,
        pontuacao=pontuacao,
        status=Partida.Status.FINALIZADA,
        finalizada_em=timezone.now() - timedelta(minutes=minutos_atras),
        **extras,
    )


def envelhecer(partida, segundos=600):
    """Recua o início da partida, como se ela já tivesse durado.

    Args:
        partida: Partida a ajustar.
        segundos: Quantos segundos recuar.
    """
    Partida.objects.filter(pk=partida.pk).update(
        created_at=timezone.now() - timedelta(seconds=segundos)
    )
    partida.refresh_from_db()
