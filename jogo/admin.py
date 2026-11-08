"""Admin do jogo: partidas, jogadores, totens e configuração."""

import csv

from django.contrib import admin
from django.http import HttpResponse

from .models import ConfiguracaoJogo, Jogador, Partida, Totem


@admin.register(Totem)
class TotemAdmin(admin.ModelAdmin):
    """Admin dos totens."""

    list_display = ["nome", "usuario", "local", "ativo", "total_partidas"]
    list_editable = ["local", "ativo"]
    search_fields = ["nome", "local", "usuario__username"]

    @admin.display(description="partidas finalizadas")
    def total_partidas(self, obj):
        """Conta as partidas finalizadas no totem."""
        return obj.partidas.filter(status=Partida.Status.FINALIZADA).count()


@admin.register(Jogador)
class JogadorAdmin(admin.ModelAdmin):
    """Admin dos jogadores (leads), com exportação em CSV."""

    list_display = ["nome", "telefone_formatado", "aceite_lgpd", "melhor_pontuacao", "created_at"]
    list_filter = ["aceite_lgpd", "created_at"]
    search_fields = ["nome", "telefone"]
    readonly_fields = ["aceite_em", "created_at", "updated_at"]
    actions = ["exportar_csv"]

    @admin.display(description="melhor pontuação")
    def melhor_pontuacao(self, obj):
        """Retorna a melhor pontuação finalizada do jogador."""
        melhor = (
            obj.partidas.filter(status=Partida.Status.FINALIZADA).order_by("-pontuacao").first()
        )
        return melhor.pontuacao if melhor else "—"

    @admin.action(description="Exportar selecionados em CSV")
    def exportar_csv(self, request, queryset):
        """Gera um CSV (compatível com Excel) dos jogadores selecionados.

        Args:
            request: Requisição do admin.
            queryset: Jogadores selecionados.

        Returns:
            HttpResponse: Arquivo ``jogadores.csv`` para download.
        """
        resposta = HttpResponse(content_type="text/csv; charset=utf-8")
        resposta["Content-Disposition"] = 'attachment; filename="jogadores.csv"'
        resposta.write("\ufeff")
        planilha = csv.writer(resposta, delimiter=";")
        planilha.writerow(
            ["Nome", "Telefone", "Aceite LGPD", "Melhor pontuação", "Partidas", "Cadastro"]
        )
        for jogador in queryset:
            finalizadas = jogador.partidas.filter(status=Partida.Status.FINALIZADA)
            melhor = finalizadas.order_by("-pontuacao").first()
            planilha.writerow(
                [
                    jogador.nome,
                    jogador.telefone_formatado,
                    "sim" if jogador.aceite_lgpd else "não",
                    melhor.pontuacao if melhor else 0,
                    finalizadas.count(),
                    jogador.created_at.strftime("%d/%m/%Y %H:%M"),
                ]
            )
        return resposta


@admin.register(Partida)
class PartidaAdmin(admin.ModelAdmin):
    """Admin das partidas, com moderação do ranking."""

    list_display = [
        "jogador",
        "pontuacao",
        "totem",
        "status",
        "oculta",
        "itens_coletados",
        "perigos_atingidos",
        "finalizada_em",
    ]
    list_filter = ["status", "oculta", "totem", "created_at"]
    search_fields = ["jogador__nome", "jogador__telefone"]
    list_select_related = ["jogador", "totem"]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-pontuacao", "finalizada_em"]
    actions = ["ocultar_do_ranking", "mostrar_no_ranking"]

    @admin.action(description="Ocultar do ranking")
    def ocultar_do_ranking(self, request, queryset):
        """Tira as partidas selecionadas do ranking."""
        total = queryset.update(oculta=True)
        self.message_user(request, f"{total} partida(s) ocultada(s) do ranking.")

    @admin.action(description="Mostrar no ranking")
    def mostrar_no_ranking(self, request, queryset):
        """Devolve as partidas selecionadas ao ranking."""
        total = queryset.update(oculta=False)
        self.message_user(request, f"{total} partida(s) de volta ao ranking.")


@admin.register(ConfiguracaoJogo)
class ConfiguracaoJogoAdmin(admin.ModelAdmin):
    """Admin da configuração única do jogo."""

    list_display = [
        "titulo",
        "duracao_segundos",
        "pontos_acerto",
        "pontos_erro",
        "itens_por_multiplicador",
        "pontos_por_dobra",
        "dobras_maximas",
        "pedir_telefone",
    ]

    def has_add_permission(self, request):
        """Permite criar apenas se ainda não houver configuração."""
        return not ConfiguracaoJogo.objects.exists()

    def has_delete_permission(self, request, obj=None):
        """Impede a exclusão da configuração."""
        return False
