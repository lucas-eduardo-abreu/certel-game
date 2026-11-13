"""Páginas do jogo: login, tela do totem, telão do ranking e roleta."""

from django.contrib.auth.mixins import UserPassesTestMixin
from django.contrib.auth.views import LoginView, LogoutView
from django.shortcuts import redirect, render, resolve_url
from django.views.generic import TemplateView

from . import perfis
from .api import NOME_PREVIA
from .models import ConfiguracaoJogo, Sorteio
from .serializers import ConfiguracaoSerializer


class EntrarView(LoginView):
    """Login único. Cada perfil cai na sua tela; a sessão dura o evento inteiro."""

    template_name = "jogo/entrar.html"
    redirect_authenticated_user = True

    def get_default_redirect_url(self):
        """Manda admin para o admin, ranking para o telão e totem para o jogo."""
        return resolve_url(perfis.pagina_inicial(self.request.user))


class SairView(LogoutView):
    """Logout. Abrir ``/sair/`` no navegador mostra a confirmação; o POST desloga.

    Assim dá para sair de qualquer tela digitando o endereço, sem achar o menu
    do operador do totem.
    """

    http_method_names = ["get", "post", "options"]

    def get(self, request, *args, **kwargs):
        """Mostra a confirmação, ou manda para o login se ninguém estiver logado.

        Returns:
            HttpResponse: Página "Sair?" ou redirecionamento para o login.
        """
        if not request.user.is_authenticated:
            return redirect("jogo:entrar")
        return render(request, "jogo/sair.html")


class PerfilMixin(UserPassesTestMixin):
    """Exige login e um perfil; quem não tem acesso vai para a própria tela."""

    def handle_no_permission(self):
        """Redireciona o usuário logado para a tela do perfil dele.

        Returns:
            HttpResponse: Login, para anônimos; a tela do perfil, para os demais.
        """
        if not self.request.user.is_authenticated:
            return super().handle_no_permission()
        return redirect(perfis.pagina_inicial(self.request.user))


class TotemView(PerfilMixin, TemplateView):
    """Tela do totem: atração, cadastro, jogo e resultado.

    O admin abre em modo prévia: joga, mas a partida não é salva.
    """

    template_name = "jogo/totem.html"

    def test_func(self):
        """Libera todos menos o usuário do ranking, que não vê o jogo."""
        usuario = self.request.user
        if not usuario.is_authenticated:
            return False
        return perfis.eh_admin(usuario) or not perfis.eh_ranking(usuario)

    def get_context_data(self, **kwargs):
        """Inclui o totem logado, o modo prévia e a configuração do jogo.

        Returns:
            dict: Contexto com ``totem`` (ou ``None``), ``previa`` e ``configuracao``.
        """
        contexto = super().get_context_data(**kwargs)
        totem = perfis.totem_ativo(self.request.user)
        previa = totem is None and perfis.eh_admin(self.request.user)
        contexto["totem"] = totem
        contexto["previa"] = previa
        dados = ConfiguracaoSerializer(ConfiguracaoJogo.carregar()).data
        dados["totem"] = totem.nome if totem else (NOME_PREVIA if previa else "")
        contexto["configuracao"] = dados
        return contexto


class RankingView(PerfilMixin, TemplateView):
    """Telão do ranking do dia, para rodar em uma tela separada."""

    template_name = "jogo/ranking.html"

    def test_func(self):
        """Libera o grupo Ranking e o admin."""
        return perfis.eh_ranking(self.request.user)

    def get_context_data(self, **kwargs):
        """Inclui o título do jogo no contexto.

        Returns:
            dict: Contexto com ``titulo``.
        """
        contexto = super().get_context_data(**kwargs)
        contexto["titulo"] = ConfiguracaoJogo.carregar().titulo
        return contexto


class RoletaView(RankingView):
    """Roleta de sorteio, do dia ou geral, no mesmo telão do ranking."""

    template_name = "jogo/roleta.html"

    def get_context_data(self, **kwargs):
        """Inclui o tipo inicial da roleta (``?tipo=geral`` abre a geral).

        Returns:
            dict: Contexto com ``titulo`` e ``tipo``.
        """
        contexto = super().get_context_data(**kwargs)
        tipo = self.request.GET.get("tipo")
        contexto["tipo"] = tipo if tipo in Sorteio.Tipo.values else Sorteio.Tipo.DIARIO
        return contexto
