"""Modelos do jogo: totens, jogadores, partidas e configuração."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import AbstractBaseModel

CONSENTIMENTO_PADRAO = (
    "Autorizo o uso do meu nome para o ranking e o número de telefone para "
    "contatos da cooperativa"
)


class Totem(AbstractBaseModel):
    """Totem físico onde o jogo roda.

    Cada totem tem um usuário próprio (``totem1``, ``totem2``...) que fica
    logado no navegador durante o evento. As partidas ficam vinculadas ao
    totem em que foram jogadas.

    Attributes:
        usuario: Usuário Django usado para o login do totem.
        nome: Nome exibido no ranking e no admin (ex.: "Totem 1").
        local: Onde o totem está instalado (opcional).
        ativo: Totens inativos não conseguem iniciar partidas.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="totem",
        verbose_name="usuário",
    )
    nome = models.CharField("nome", max_length=40)
    local = models.CharField("local", max_length=80, blank=True)
    ativo = models.BooleanField("ativo", default=True)

    class Meta:
        verbose_name = "totem"
        verbose_name_plural = "totens"
        ordering = ["nome"]

    def __str__(self):
        """Retorna o nome do totem."""
        return self.nome


class Jogador(AbstractBaseModel):
    """Pessoa que joga em um totem.

    Quando o telefone é informado, ele identifica o jogador entre partidas:
    quem joga de novo aparece uma única vez no ranking, com a melhor
    pontuação.

    Attributes:
        nome: Nome informado no totem.
        telefone: Telefone somente com dígitos (DDD + número), opcional.
        aceite_lgpd: Se o jogador marcou o consentimento de uso dos dados.
        aceite_em: Momento em que o consentimento foi dado.
    """

    nome = models.CharField("nome", max_length=40)
    telefone = models.CharField("telefone", max_length=11, blank=True, db_index=True)
    aceite_lgpd = models.BooleanField("aceitou o uso dos dados", default=False)
    aceite_em = models.DateTimeField("aceite em", null=True, blank=True)

    class Meta:
        verbose_name = "jogador"
        verbose_name_plural = "jogadores"
        ordering = ["-created_at"]

    def __str__(self):
        """Retorna o nome do jogador."""
        return self.nome

    @property
    def nome_publico(self):
        """Nome exibido no ranking: primeiro nome e inicial do sobrenome.

        Returns:
            str: Ex.: "Maria Souza Lima" vira "Maria L.".
        """
        partes = self.nome.split()
        if len(partes) > 1:
            return f"{partes[0]} {partes[-1][0]}."
        return self.nome

    @property
    def telefone_formatado(self):
        """Telefone no formato (51) 99999-9999.

        Returns:
            str: Telefone formatado ou string vazia.
        """
        t = self.telefone
        if len(t) < 10:
            return t
        return f"({t[:2]}) {t[2:-4]}-{t[-4:]}"


class Partida(AbstractBaseModel):
    """Uma rodada do jogo, do início ao envio da pontuação.

    Attributes:
        jogador: Quem jogou.
        totem: Totem em que a partida aconteceu.
        status: ``iniciada`` até a pontuação chegar; depois ``finalizada``.
        pontuacao: Pontuação final.
        itens_coletados: Quantidade de ícones Certel coletados.
        perigos_atingidos: Quantidade de obstáculos em que o jogador encostou.
        finalizada_em: Momento em que a pontuação foi registrada.
        oculta: Partidas ocultas não aparecem no ranking (moderação).
    """

    class Status(models.TextChoices):
        """Situações possíveis de uma partida."""

        INICIADA = "iniciada", "Iniciada"
        FINALIZADA = "finalizada", "Finalizada"

    jogador = models.ForeignKey(
        Jogador, on_delete=models.CASCADE, related_name="partidas", verbose_name="jogador"
    )
    totem = models.ForeignKey(
        Totem, on_delete=models.PROTECT, related_name="partidas", verbose_name="totem"
    )
    status = models.CharField(
        "status", max_length=10, choices=Status.choices, default=Status.INICIADA
    )
    pontuacao = models.PositiveIntegerField("pontuação", default=0)
    itens_coletados = models.PositiveIntegerField("ícones coletados", default=0)
    perigos_atingidos = models.PositiveIntegerField("obstáculos atingidos", default=0)
    finalizada_em = models.DateTimeField("finalizada em", null=True, blank=True)
    oculta = models.BooleanField(
        "oculta do ranking",
        default=False,
        help_text="Marque para tirar a partida do ranking (ex.: nome impróprio).",
    )

    class Meta:
        verbose_name = "partida"
        verbose_name_plural = "partidas"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["status", "-pontuacao", "finalizada_em"], name="partida_ranking_idx"
            ),
        ]

    def __str__(self):
        """Retorna jogador e pontuação da partida."""
        return f"{self.jogador} — {self.pontuacao} pts"


class ConfiguracaoJogo(AbstractBaseModel):
    """Ajustes do jogo editáveis pelo admin (registro único).

    Attributes:
        titulo: Nome do jogo exibido nos totens e no telão.
        duracao_segundos: Duração de cada partida.
        pontos_acerto: Pontos ganhos por ícone Certel coletado.
        pontos_erro: Pontos perdidos por obstáculo atingido.
        itens_por_multiplicador: Ícones seguidos para subir o multiplicador.
        pontos_por_dobra: Pontos para a rua dobrar de velocidade.
        dobras_maximas: Quantas vezes a velocidade pode dobrar.
        perigos_inicial: Proporção de obstáculos no início da partida, em %.
        perigos_aumento: Quanto essa proporção sobe a cada marca de pontos.
        pedir_telefone: Se o totem pede telefone e consentimento.
        texto_consentimento: Texto do consentimento exibido no cadastro.
        tamanho_ranking: Quantas posições o ranking mostra.
        som_ativo: Liga ou desliga os efeitos sonoros dos totens.
        musica_ativa: Liga ou desliga a música durante a partida.
    """

    titulo = models.CharField("título do jogo", max_length=40, default="Corrida Certel")
    duracao_segundos = models.PositiveSmallIntegerField(
        "duração da partida (s)",
        default=45,
        validators=[MinValueValidator(15), MaxValueValidator(180)],
    )
    pontos_acerto = models.PositiveSmallIntegerField(
        "pontos por ícone", default=100, validators=[MinValueValidator(1)]
    )
    pontos_erro = models.PositiveSmallIntegerField("pontos perdidos por obstáculo", default=300)
    itens_por_multiplicador = models.PositiveSmallIntegerField(
        "ícones seguidos por multiplicador",
        default=5,
        validators=[MaxValueValidator(50)],
        help_text=(
            "A cada quantos ícones pegos em seguida o multiplicador sobe "
            "(5: no 5º vira 2x, no 10º vira 3x). Encostar em um obstáculo zera. "
            "Use 0 para desligar."
        ),
    )
    pontos_por_dobra = models.PositiveIntegerField(
        "pontos para dobrar a velocidade",
        default=1000,
        help_text=(
            "A cada quantos pontos a rua dobra de velocidade "
            "(1000: com 1000 fica 2x, com 2000 fica 4x) e a proporção de "
            "obstáculos aumenta. Use 0 para desligar as duas coisas."
        ),
    )
    dobras_maximas = models.PositiveSmallIntegerField(
        "limite de dobras de velocidade",
        default=2,
        validators=[MaxValueValidator(4)],
        help_text=(
            "Quantas vezes a velocidade pode dobrar: 2 = até 4x, 3 = até 8x. "
            "Acima de 2, os itens cruzam a tela em menos de meio segundo."
        ),
    )
    perigos_inicial = models.PositiveSmallIntegerField(
        "obstáculos no início (%)",
        default=25,
        validators=[MaxValueValidator(65)],
        help_text="De cada 100 itens que aparecem, quantos são obstáculos no começo da partida.",
    )
    perigos_aumento = models.PositiveSmallIntegerField(
        "aumento de obstáculos por marca (%)",
        default=8,
        validators=[MaxValueValidator(40)],
        help_text=(
            "Quanto a proporção de obstáculos sobe a cada marca de pontos acima "
            "(8: 25% no início, 33% com 1000, 41% com 2000...). O teto é 65%."
        ),
    )
    pedir_telefone = models.BooleanField(
        "pedir telefone",
        default=True,
        help_text=(
            "Com telefone, quem joga de novo aparece uma vez só no ranking, "
            "com a melhor pontuação."
        ),
    )
    texto_consentimento = models.TextField(
        "texto do consentimento", default=CONSENTIMENTO_PADRAO, max_length=300
    )
    tamanho_ranking = models.PositiveSmallIntegerField(
        "posições no ranking",
        default=10,
        validators=[MinValueValidator(3), MaxValueValidator(50)],
    )
    som_ativo = models.BooleanField("efeitos sonoros ligados", default=True)
    musica_ativa = models.BooleanField("música ligada", default=True)

    class Meta:
        verbose_name = "configuração do jogo"
        verbose_name_plural = "configuração do jogo"

    def __str__(self):
        """Retorna o título configurado."""
        return self.titulo

    def clean(self):
        """Impede a criação de um segundo registro de configuração.

        Raises:
            ValidationError: Se já existir outra configuração.
        """
        if ConfiguracaoJogo.objects.exclude(pk=self.pk).exists():
            raise ValidationError("Já existe uma configuração. Edite a existente.")

    @classmethod
    def carregar(cls):
        """Retorna a configuração única, criando-a com os padrões se preciso.

        Returns:
            ConfiguracaoJogo: O registro de configuração.
        """
        configuracao = cls.objects.order_by("created_at").first()
        if configuracao is None:
            configuracao = cls.objects.create()
        return configuracao


class Sorteio(AbstractBaseModel):
    """Resultado de um giro da roleta.

    Há dois tipos: o **diário**, que sorteia entre quem jogou em um dia, e o
    **geral**, que sorteia entre todos os jogadores do evento. Quem já ganhou
    em um sorteio não entra de novo no mesmo (mesmo tipo e, no diário, mesmo
    dia), então girar outra vez sorteia o próximo prêmio. Para refazer um
    sorteio, exclua-o no admin.

    Attributes:
        tipo: ``diario`` ou ``geral``.
        dia: Dia sorteado (só no diário).
        vencedor: Jogador sorteado.
        participantes: Quantos jogadores concorreram.
        realizado_por: Usuário que girou a roleta.
    """

    class Tipo(models.TextChoices):
        """Tipos de roleta."""

        DIARIO = "diario", "Do dia"
        GERAL = "geral", "Geral"

    tipo = models.CharField("tipo", max_length=10, choices=Tipo.choices)
    dia = models.DateField("dia", null=True, blank=True)
    vencedor = models.ForeignKey(
        Jogador, on_delete=models.PROTECT, related_name="sorteios", verbose_name="vencedor"
    )
    participantes = models.PositiveIntegerField("participantes")
    realizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="realizado por",
    )

    class Meta:
        verbose_name = "sorteio"
        verbose_name_plural = "sorteios"
        ordering = ["-created_at"]

    def __str__(self):
        """Retorna tipo, dia e vencedor."""
        if self.dia:
            return f"{self.get_tipo_display()} {self.dia:%d/%m} — {self.vencedor}"
        return f"{self.get_tipo_display()} — {self.vencedor}"
