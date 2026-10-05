"""Testes do admin."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from model_bakery import baker

from jogo.models import ConfiguracaoJogo, Jogador, Partida

from .fabricas import criar_partida_finalizada, criar_totem


class AdminTest(TestCase):
    """Listagens, ações e permissões do admin."""

    def setUp(self):
        """Loga um superusuário e cria dados de exemplo."""
        admin = get_user_model().objects.create_superuser("admin", password="senha-admin")
        self.client.force_login(admin)
        self.totem = criar_totem()
        self.ana = baker.make(Jogador, nome="Ana Souza", telefone="51999887766", aceite_lgpd=True)
        self.bia = baker.make(Jogador, nome="Bia")
        self.partida = criar_partida_finalizada(self.totem, 1200, self.ana)

    def test_listagens_abrem(self):
        """Todas as listagens do jogo carregam."""
        ConfiguracaoJogo.carregar()
        for modelo in ["totem", "jogador", "partida", "configuracaojogo"]:
            resposta = self.client.get(reverse(f"admin:jogo_{modelo}_changelist"))
            self.assertEqual(resposta.status_code, 200, modelo)

    def test_exportar_csv(self):
        """A exportação traz uma linha por jogador, com a melhor pontuação."""
        resposta = self.client.post(
            reverse("admin:jogo_jogador_changelist"),
            {"action": "exportar_csv", "_selected_action": [self.ana.pk, self.bia.pk]},
        )
        self.assertEqual(resposta["Content-Type"], "text/csv; charset=utf-8")
        conteudo = resposta.content.decode("utf-8-sig")
        self.assertIn("Ana Souza;(51) 99988-7766;sim;1200;1;", conteudo)
        self.assertIn("Bia;;não;0;0;", conteudo)

    def test_ocultar_e_mostrar_no_ranking(self):
        """As ações de moderação ligam e desligam ``oculta``."""
        url = reverse("admin:jogo_partida_changelist")
        self.client.post(url, {"action": "ocultar_do_ranking", "_selected_action": [self.partida.pk]})
        self.partida.refresh_from_db()
        self.assertTrue(self.partida.oculta)
        self.client.post(url, {"action": "mostrar_no_ranking", "_selected_action": [self.partida.pk]})
        self.partida.refresh_from_db()
        self.assertFalse(self.partida.oculta)

    def test_configuracao_e_unica_e_nao_some(self):
        """Só dá para criar a configuração se não houver uma; nunca excluir."""
        url_criar = reverse("admin:jogo_configuracaojogo_add")
        self.assertEqual(self.client.get(url_criar).status_code, 200)
        configuracao = ConfiguracaoJogo.carregar()
        self.assertEqual(self.client.get(url_criar).status_code, 403)
        url_excluir = reverse("admin:jogo_configuracaojogo_delete", args=[configuracao.pk])
        self.assertEqual(self.client.get(url_excluir).status_code, 403)
        self.assertEqual(Partida.objects.count(), 1)
