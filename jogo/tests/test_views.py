"""Testes das páginas."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .fabricas import criar_totem


class TotemViewTest(TestCase):
    """Tela do totem."""

    def test_exige_login(self):
        """Sem login, redireciona para a tela de entrada."""
        resposta = self.client.get(reverse("jogo:totem"))
        self.assertRedirects(resposta, f"{reverse('jogo:entrar')}?next=/")

    def test_totem_logado_recebe_o_jogo(self):
        """O totem recebe o palco, a configuração e os scripts."""
        self.client.force_login(criar_totem(1).usuario)
        resposta = self.client.get(reverse("jogo:totem"))
        self.assertContains(resposta, 'id="pista"')
        self.assertContains(resposta, "Corrida Certel")
        self.assertContains(resposta, "jogo/js/motor.js")
        self.assertEqual(resposta.context["configuracao"]["totem"], "Totem 1")

    def test_usuario_sem_totem_ve_aviso(self):
        """Usuário sem totem vê o aviso em vez do jogo."""
        self.client.force_login(get_user_model().objects.create_user("fulano", password="x"))
        resposta = self.client.get(reverse("jogo:totem"))
        self.assertContains(resposta, "não está ligado a um totem ativo")
        self.assertNotContains(resposta, 'id="pista"')

    def test_totem_inativo_ve_aviso(self):
        """Totem desativado também não recebe o jogo."""
        self.client.force_login(criar_totem(1, ativo=False).usuario)
        self.assertIsNone(self.client.get(reverse("jogo:totem")).context["totem"])


class EntrarViewTest(TestCase):
    """Login do totem."""

    def test_formulario(self):
        """A página de login abre."""
        self.assertContains(self.client.get(reverse("jogo:entrar")), "Entrar no totem")

    def test_login_leva_ao_jogo(self):
        """Com usuário e senha certos, o totem cai direto no jogo."""
        criar_totem(1, senha="segredo-123")
        resposta = self.client.post(
            reverse("jogo:entrar"), {"username": "totem1", "password": "segredo-123"}
        )
        self.assertRedirects(resposta, reverse("jogo:totem"))

    def test_senha_errada(self):
        """Senha errada mostra a mensagem de erro."""
        criar_totem(1)
        resposta = self.client.post(
            reverse("jogo:entrar"), {"username": "totem1", "password": "errada"}
        )
        self.assertContains(resposta, "Usuário ou senha incorretos")

    def test_sair(self):
        """Sair devolve o totem para o login."""
        self.client.force_login(criar_totem(1).usuario)
        self.assertRedirects(self.client.post(reverse("jogo:sair")), reverse("jogo:entrar"))


class PaginasPublicasTest(TestCase):
    """Telão do ranking e health check."""

    def test_telao(self):
        """O telão abre sem login."""
        resposta = self.client.get(reverse("jogo:ranking"))
        self.assertContains(resposta, "Ranking geral")
        self.assertContains(resposta, "jogo/js/ranking.js")

    def test_healthz(self):
        """O health check responde ok, mesmo com um Host desconhecido."""
        resposta = self.client.get("/healthz/", HTTP_HOST="10.20.30.40:10000")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.content, b"ok")
