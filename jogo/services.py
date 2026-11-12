"""Regras de negócio do jogo: partidas, validação de pontuação e ranking."""

import re
import secrets

from django.db import transaction
from django.db.models import OuterRef, Q, Subquery
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import ConfiguracaoJogo, Jogador, Partida, Sorteio

# Cópia do ritmo do motor do jogo (static/jogo/js/motor.js). Serve para simular
# uma partida perfeita e, daí, calcular a pontuação máxima aceita.
VELOCIDADE_BASE = 380
PRIMEIRO_ITEM = 0.6
ESPACAMENTO_ITENS = 360
INTERVALO_MINIMO = 0.32
ACELERACAO_POR_NIVEL = 0.5
# O ícone grande vale o dobro de ``pontos_acerto`` (TAMANHOS no motor).
FATOR_ICONE_GRANDE = 2
FOLGA_ITENS = 2

# Folga, em segundos, entre o cronômetro do totem e o relógio do servidor.
TOLERANCIA_SEGUNDOS = 3


class PartidaInvalida(Exception):
    """Erro de regra de negócio ao iniciar ou finalizar uma partida."""


class SorteioInvalido(Exception):
    """Erro de regra de negócio ao girar a roleta."""


def normalizar_telefone(valor):
    """Mantém apenas os dígitos de um telefone.

    Args:
        valor: Telefone como digitado, com ou sem máscara.

    Returns:
        str: Somente os dígitos.
    """
    return re.sub(r"\D", "", valor or "")


def normalizar_nome(valor):
    """Padroniza o nome digitado no totem.

    Args:
        valor: Nome como digitado (o teclado do totem é em maiúsculas).

    Returns:
        str: Nome sem espaços sobrando e com iniciais maiúsculas.
    """
    return " ".join((valor or "").split()).title()


def pontuacao_maxima(configuracao):
    """Calcula a maior pontuação possível em uma partida.

    Simula a partida perfeita com as regras do motor: todo item é um ícone
    grande, pego no instante em que aparece; o multiplicador sobe a cada
    ``itens_por_multiplicador`` e a rua acelera a cada
    ``pontos_por_dobra``, o que encurta o intervalo entre os itens.

    Args:
        configuracao: Configuração do jogo em vigor.

    Returns:
        int: Teto de pontos, usado para barrar envios adulterados.
    """
    passo = configuracao.itens_por_multiplicador
    marca = configuracao.pontos_por_dobra
    pontos, sequencia, instante = 0, 0, PRIMEIRO_ITEM

    def coletar():
        nonlocal pontos, sequencia
        multiplicador = 1 + sequencia // passo if passo else 1
        pontos += configuracao.pontos_acerto * FATOR_ICONE_GRANDE * multiplicador
        sequencia += 1

    while instante < configuracao.duracao_segundos:
        coletar()
        nivel = min(configuracao.dobras_maximas, pontos // marca) if marca else 0
        instante += max(INTERVALO_MINIMO, ESPACAMENTO_ITENS / (VELOCIDADE_BASE * (1 + ACELERACAO_POR_NIVEL * nivel)))
    for _ in range(FOLGA_ITENS):
        coletar()
    return pontos


@transaction.atomic
def iniciar_partida(totem, nome, telefone="", aceite_lgpd=False):
    """Registra o jogador e abre uma partida no totem.

    Args:
        totem: Totem em que a partida vai acontecer.
        nome: Nome do jogador.
        telefone: Telefone do jogador (opcional, conforme configuração).
        aceite_lgpd: Se o jogador marcou o consentimento.

    Returns:
        Partida: Partida recém-criada, com status ``iniciada``.

    Raises:
        PartidaInvalida: Se o totem estiver inativo ou os dados forem inválidos.
    """
    configuracao = ConfiguracaoJogo.carregar()
    if not totem.ativo:
        raise PartidaInvalida("Este totem está desativado.")

    nome = normalizar_nome(nome)
    if len(nome) < 2:
        raise PartidaInvalida("Digite seu nome para jogar.")

    telefone = normalizar_telefone(telefone)
    if configuracao.pedir_telefone:
        if len(telefone) not in (10, 11):
            raise PartidaInvalida("Digite o telefone com DDD.")
        if not aceite_lgpd:
            raise PartidaInvalida("Marque a autorização para continuar.")
    else:
        telefone, aceite_lgpd = "", False

    jogador = None
    if telefone:
        jogador = Jogador.objects.filter(telefone=telefone).order_by("created_at").first()
    if jogador is None:
        jogador = Jogador(telefone=telefone)
    jogador.nome = nome
    if aceite_lgpd and not jogador.aceite_lgpd:
        jogador.aceite_lgpd = True
        jogador.aceite_em = timezone.now()
    jogador.save()

    return Partida.objects.create(jogador=jogador, totem=totem)


@transaction.atomic
def finalizar_partida(partida, pontuacao, itens_coletados=0, perigos_atingidos=0):
    """Registra a pontuação de uma partida, validando o envio.

    Args:
        partida: Partida a finalizar.
        pontuacao: Pontuação enviada pelo totem.
        itens_coletados: Quantidade de ícones coletados.
        perigos_atingidos: Quantidade de perigos atingidos.

    Returns:
        Partida: A partida finalizada.

    Raises:
        PartidaInvalida: Se a partida já foi finalizada, se o tempo mínimo
            não passou ou se a pontuação for maior que a possível.
    """
    configuracao = ConfiguracaoJogo.carregar()
    partida = Partida.objects.select_for_update().get(pk=partida.pk)

    if partida.status != Partida.Status.INICIADA:
        raise PartidaInvalida("Esta partida já foi finalizada.")

    decorrido = (timezone.now() - partida.created_at).total_seconds()
    if decorrido < configuracao.duracao_segundos - TOLERANCIA_SEGUNDOS:
        raise PartidaInvalida("A partida ainda não terminou.")

    if pontuacao > pontuacao_maxima(configuracao):
        raise PartidaInvalida("Pontuação inválida.")

    partida.pontuacao = pontuacao
    partida.itens_coletados = itens_coletados
    partida.perigos_atingidos = perigos_atingidos
    partida.status = Partida.Status.FINALIZADA
    partida.finalizada_em = timezone.now()
    partida.save()
    return partida


def _melhores_partidas():
    """Monta o queryset com a melhor partida de cada jogador.

    Returns:
        QuerySet: Partidas finalizadas e visíveis, uma por jogador,
        ordenadas da maior pontuação para a menor (empate: quem fez antes).
    """
    visiveis = _partidas_validas()
    melhor_do_jogador = (
        visiveis.filter(jogador=OuterRef("jogador"))
        .order_by("-pontuacao", "finalizada_em", "pk")
        .values("pk")[:1]
    )
    return visiveis.filter(pk=Subquery(melhor_do_jogador)).order_by(
        "-pontuacao", "finalizada_em", "pk"
    )


def montar_ranking(limite=None):
    """Monta o ranking geral, somando os três totens.

    Args:
        limite: Quantidade de posições; por padrão usa a configuração.

    Returns:
        list[dict]: Itens com ``posicao``, ``nome``, ``pontuacao``, ``totem``
        e ``jogador_id``.
    """
    if limite is None:
        limite = ConfiguracaoJogo.carregar().tamanho_ranking
    partidas = _melhores_partidas().select_related("jogador", "totem")[:limite]
    return [
        {
            "posicao": posicao,
            "jogador_id": str(partida.jogador_id),
            "nome": partida.jogador.nome_publico,
            "pontuacao": partida.pontuacao,
            "totem": partida.totem.nome,
        }
        for posicao, partida in enumerate(partidas, start=1)
    ]


def posicao_do_jogador(jogador):
    """Calcula a posição do jogador no ranking geral.

    Args:
        jogador: Jogador a localizar.

    Returns:
        tuple[int | None, int]: Posição (ou ``None`` se não estiver no
        ranking) e a melhor pontuação do jogador.
    """
    melhores = _melhores_partidas()
    melhor = melhores.filter(jogador=jogador).first()
    if melhor is None:
        return None, 0
    a_frente = melhores.filter(
        Q(pontuacao__gt=melhor.pontuacao)
        | Q(pontuacao=melhor.pontuacao, finalizada_em__lt=melhor.finalizada_em)
    ).count()
    return a_frente + 1, melhor.pontuacao


def _partidas_validas():
    """Partidas que contam para o ranking e para os sorteios.

    Returns:
        QuerySet: Partidas finalizadas e não ocultas.
    """
    return Partida.objects.filter(status=Partida.Status.FINALIZADA, oculta=False)


def dias_com_partidas():
    """Lista os dias (no fuso do evento) em que houve partidas válidas.

    Returns:
        list[date]: Dias do mais recente para o mais antigo.
    """
    return list(
        _partidas_validas()
        .annotate(dia=TruncDate("finalizada_em"))
        .values_list("dia", flat=True)
        .distinct()
        .order_by("-dia")
    )


def _escopo_do_sorteio(tipo, dia):
    """Valida o tipo e devolve o dia que vale para ele.

    Args:
        tipo: ``Sorteio.Tipo.DIARIO`` ou ``Sorteio.Tipo.GERAL``.
        dia: Dia do sorteio diário (ignorado no geral).

    Returns:
        date | None: O dia, no diário; ``None`` no geral.

    Raises:
        SorteioInvalido: Se o tipo for desconhecido ou faltar o dia.
    """
    if tipo == Sorteio.Tipo.GERAL:
        return None
    if tipo != Sorteio.Tipo.DIARIO:
        raise SorteioInvalido("Tipo de roleta inválido.")
    if dia is None:
        raise SorteioInvalido("Escolha o dia do sorteio.")
    return dia


def sorteios_realizados(tipo, dia=None):
    """Sorteios já feitos em um escopo, do primeiro para o último.

    Args:
        tipo: Tipo da roleta.
        dia: Dia, no sorteio diário.

    Returns:
        QuerySet: Sorteios com o vencedor carregado.
    """
    dia = _escopo_do_sorteio(tipo, dia)
    return (
        Sorteio.objects.filter(tipo=tipo, dia=dia)
        .select_related("vencedor")
        .order_by("created_at")
    )


def participantes_do_sorteio(tipo, dia=None):
    """Jogadores que concorrem na roleta.

    No diário, quem tem partida válida finalizada no dia; no geral, quem tem
    qualquer partida válida, ou só o top N do ranking quando
    ``sorteio_geral_top`` estiver configurado. Quem já ganhou no mesmo escopo
    fica de fora (no top N, a vaga não passa para o próximo do ranking).

    Args:
        tipo: Tipo da roleta.
        dia: Dia, no sorteio diário.

    Returns:
        QuerySet: Jogadores elegíveis.
    """
    dia = _escopo_do_sorteio(tipo, dia)
    partidas = _partidas_validas()
    if dia is not None:
        partidas = partidas.filter(finalizada_em__date=dia)
    else:
        top = ConfiguracaoJogo.carregar().sorteio_geral_top
        if top:
            partidas = _melhores_partidas()[:top]
    jogadores = list(partidas.values_list("jogador", flat=True))
    ja_ganharam = Sorteio.objects.filter(tipo=tipo, dia=dia).values("vencedor")
    return Jogador.objects.filter(pk__in=jogadores).exclude(pk__in=ja_ganharam)


@transaction.atomic
def sortear(tipo, dia=None, usuario=None):
    """Gira a roleta: escolhe um vencedor ao acaso e registra o sorteio.

    O vencedor é escolhido no servidor (``secrets``), não no navegador; a
    tela só anima a roleta até o nome sorteado.

    Args:
        tipo: Tipo da roleta.
        dia: Dia, no sorteio diário.
        usuario: Quem girou a roleta.

    Returns:
        Sorteio: O sorteio registrado.

    Raises:
        SorteioInvalido: Se não houver ninguém para sortear.
    """
    dia = _escopo_do_sorteio(tipo, dia)
    # Trava a configuração para dois giros ao mesmo tempo não sortearem a mesma pessoa.
    ConfiguracaoJogo.objects.select_for_update().get(pk=ConfiguracaoJogo.carregar().pk)
    candidatos = list(participantes_do_sorteio(tipo, dia).values_list("pk", flat=True))
    if not candidatos:
        raise SorteioInvalido("Não há ninguém para sortear.")
    return Sorteio.objects.create(
        tipo=tipo,
        dia=dia,
        vencedor_id=secrets.choice(candidatos),
        participantes=len(candidatos),
        realizado_por=usuario if usuario and usuario.is_authenticated else None,
    )
