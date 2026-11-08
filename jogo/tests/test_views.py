"""Testes das páginas."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .fabricas import criar_admin, criar_totem, criar_usuario_ranking


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
        self.assertContains(self.client.get(reverse("jogo:entrar")), "<h1>Entrar</h1>")

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

    def test_sair_pelo_endereco(self):
        """Abrir /sair/ mostra a confirmação; sem login, vai para o login."""
        self.client.force_login(criar_totem(1).usuario)
        resposta = self.client.get(reverse("jogo:sair"))
        self.assertContains(resposta, "Sair?")
        self.assertContains(resposta, "totem1")
        self.client.logout()
        self.assertRedirects(self.client.get(reverse("jogo:sair")), reverse("jogo:entrar"))

    def test_sair(self):
        """Sair devolve o totem para o login."""
        self.client.force_login(criar_totem(1).usuario)
        self.assertRedirects(self.client.post(reverse("jogo:sair")), reverse("jogo:entrar"))


class PerfisTest(TestCase):
    """Cada perfil vê só as suas telas."""

    def entrar(self, usuario, senha):
        """Faz login pelo formulário e devolve a resposta."""
        return self.client.post(reverse("jogo:entrar"), {"username": usuario, "password": senha})

    def test_login_leva_cada_perfil_a_sua_tela(self):
        """Admin vai ao admin, ranking ao telão."""
        criar_admin("senha-admin")
        criar_usuario_ranking("senha-ranking")
        self.assertRedirects(self.entrar("admin", "senha-admin"), reverse("admin:index"))
        self.client.logout()
        self.assertRedirects(self.entrar("ranking", "senha-ranking"), reverse("jogo:ranking"))

    def test_anonimo_vai_para_o_login(self):
        """Telão e roleta pedem login."""
        for rota in ["jogo:ranking", "jogo:roleta"]:
            resposta = self.client.get(reverse(rota))
            self.assertRedirects(resposta, f"{reverse('jogo:entrar')}?next={reverse(rota)}")

    def test_ranking_ve_telao_e_roleta(self):
        """O usuário do ranking abre o telão e as duas roletas."""
        self.client.force_login(criar_usuario_ranking())
        resposta = self.client.get(reverse("jogo:ranking"))
        self.assertContains(resposta, "Ranking geral")
        self.assertContains(resposta, "jogo/js/ranking.js")
        self.assertNotContains(resposta, reverse("admin:index"))
        url = reverse("jogo:roleta")
        resposta = self.client.get(url)
        self.assertContains(resposta, "jogo/js/roleta.js")
        self.assertEqual(resposta.context["tipo"], "diario")
        self.assertEqual(self.client.get(url, {"tipo": "geral"}).context["tipo"], "geral")
        self.assertEqual(self.client.get(url, {"tipo": "x"}).context["tipo"], "diario")

    def test_ranking_nao_ve_o_jogo(self):
        """O usuário do ranking que abre o jogo volta para o telão."""
        self.client.force_login(criar_usuario_ranking())
        self.assertRedirects(self.client.get(reverse("jogo:totem")), reverse("jogo:ranking"))

    def test_ranking_nao_ve_o_admin(self):
        """O usuário do ranking não entra no admin."""
        self.client.force_login(criar_usuario_ranking())
        resposta = self.client.get(reverse("admin:index"))
        self.assertEqual(resposta.status_code, 302)
        self.assertIn(reverse("admin:login"), resposta["Location"])

    def test_totem_nao_ve_telao_nem_roleta(self):
        """O totem que abre o telão ou a roleta volta para o jogo."""
        self.client.force_login(criar_totem(1).usuario)
        for rota in ["jogo:ranking", "jogo:roleta"]:
            self.assertRedirects(self.client.get(reverse(rota)), reverse("jogo:totem"))

    def test_admin_ve_todas_as_telas(self):
        """O admin abre o jogo em prévia, o telão e a roleta."""
        self.client.force_login(criar_admin())
        resposta = self.client.get(reverse("jogo:totem"))
        self.assertTrue(resposta.context["previa"])
        self.assertContains(resposta, 'id="pista"')
        self.assertContains(resposta, "as partidas não são salvas")
        self.assertContains(resposta, '"previa": true')
        self.assertEqual(self.client.get(reverse("jogo:ranking")).status_code, 200)
        self.assertEqual(self.client.get(reverse("jogo:roleta")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin:index")).status_code, 200)

    def test_totem_nao_esta_em_previa(self):
        """O totem joga de verdade."""
        self.client.force_login(criar_totem(1).usuario)
        resposta = self.client.get(reverse("jogo:totem"))
        self.assertFalse(resposta.context["previa"])
        self.assertContains(resposta, '"previa": false')
        self.assertNotContains(resposta, "as partidas não são salvas")


class PaginasPublicasTest(TestCase):
    """Health check."""

    def test_healthz(self):
        """O health check responde ok, mesmo com um Host desconhecido."""
        resposta = self.client.get("/healthz/", HTTP_HOST="10.20.30.40:10000")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.content, b"ok")
