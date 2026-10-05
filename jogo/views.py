"""Páginas do jogo: login do totem, tela do totem e telão do ranking."""

from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView
from django.views.generic import TemplateView

from .models import ConfiguracaoJogo
from .serializers import ConfiguracaoSerializer


class EntrarView(LoginView):
    """Login do totem. Feito uma vez; a sessão dura o evento inteiro."""

    template_name = "jogo/entrar.html"
    redirect_authenticated_user = True


class TotemView(LoginRequiredMixin, TemplateView):
    """Tela do totem: atração, cadastro, jogo e resultado."""

    template_name = "jogo/totem.html"

    def get_context_data(self, **kwargs):
        """Inclui o totem logado e a configuração do jogo no contexto.

        Returns:
            dict: Contexto com ``totem`` (ou ``None``) e ``configuracao``.
        """
        contexto = super().get_context_data(**kwargs)
        totem = getattr(self.request.user, "totem", None)
        if totem is not None and not totem.ativo:
            totem = None
        contexto["totem"] = totem
        dados = ConfiguracaoSerializer(ConfiguracaoJogo.carregar()).data
        dados["totem"] = totem.nome if totem else ""
        contexto["configuracao"] = dados
        return contexto


class RankingView(TemplateView):
    """Telão do ranking geral, para rodar em uma tela separada."""

    template_name = "jogo/ranking.html"

    def get_context_data(self, **kwargs):
        """Inclui o título do jogo no contexto.

        Returns:
            dict: Contexto com ``titulo``.
        """
        contexto = super().get_context_data(**kwargs)
        contexto["titulo"] = ConfiguracaoJogo.carregar().titulo
        return contexto

