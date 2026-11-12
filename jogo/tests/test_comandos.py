"""Testes dos comandos ``preparar_ambiente`` e ``limpar_dados``."""

from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from jogo import perfis, services
from jogo.models import ConfiguracaoJogo, Jogador, Partida, Sorteio, Totem

from .fabricas import criar_partida_finalizada, criar_totem


def rodar(**opcoes):
    """Roda o comando capturando a saída.

    Args:
        **opcoes: Opções repassadas ao comando.

    Returns:
        str: Saída do comando.
    """
    saida = StringIO()
    call_command("preparar_ambiente", stdout=saida, **opcoes)
    return saida.getvalue()


@override_settings(
    TOTENS_QUANTIDADE=3,
    TOTENS_SENHA="senha-evento",
    RANKING_USUARIO="ranking",
    RANKING_SENHA="",
    ADMIN_USUARIO="",
    ADMIN_SENHA="",
)
class PrepararAmbienteTest(TestCase):
    """Comando ``preparar_ambiente``."""

    def test_cria_totens_e_configuracao(self):
        """Cria os três logins, os totens e a configuração."""
        saida = rodar(quantidade=3, senha="senha-evento")
        self.assertIn("totem1: criado", saida)
        self.assertEqual(Totem.objects.count(), 3)
        self.assertEqual(ConfiguracaoJogo.objects.count(), 1)
        usuario = get_user_model().objects.get(username="totem2")
        self.assertTrue(usuario.check_password("senha-evento"))
        self.assertFalse(usuario.is_staff)
        self.assertEqual(usuario.totem.nome, "Totem 2")

    def test_idempotente_e_preserva_senha(self):
        """Rodar de novo não duplica nada nem troca a senha."""
        rodar(quantidade=3, senha="senha-evento")
        saida = rodar(quantidade=3, senha="outra-senha")
        self.assertIn("totem1: já existia", saida)
        self.assertEqual(Totem.objects.count(), 3)
        self.assertTrue(get_user_model().objects.get(username="totem1").check_password("senha-evento"))

    def test_redefinir_senhas(self):
        """Com a opção, as senhas dos totens são trocadas."""
        rodar(quantidade=2, senha="senha-evento")
        rodar(quantidade=2, senha="nova-senha", redefinir_senhas=True)
        self.assertTrue(get_user_model().objects.get(username="totem1").check_password("nova-senha"))

    def test_sem_senha_falha(self):
        """Sem senha definida, o comando explica o que falta."""
        with self.assertRaisesMessage(CommandError, "TOTENS_SENHA"):
            rodar(quantidade=1, senha="")

    @override_settings(ADMIN_USUARIO="chefe", ADMIN_SENHA="senha-admin")
    def test_cria_admin_uma_vez(self):
        """O admin é criado pelas variáveis de ambiente, sem duplicar."""
        self.assertIn("admin chefe: criado", rodar(quantidade=1, senha="senha-evento"))
        self.assertNotIn("admin chefe", rodar(quantidade=1, senha="senha-evento"))
        admin = get_user_model().objects.get(username="chefe")
        self.assertTrue(admin.is_superuser)

    def test_cria_usuario_do_ranking(self):
        """Com RANKING_SENHA, cria o usuário do telão no grupo Ranking."""
        saida = rodar(quantidade=1, senha="senha-evento", senha_ranking="senha-telao")
        self.assertIn("ranking: criado", saida)
        usuario = get_user_model().objects.get(username="ranking")
        self.assertTrue(usuario.check_password("senha-telao"))
        self.assertTrue(perfis.eh_ranking(usuario))
        self.assertFalse(perfis.eh_admin(usuario))
        self.assertIn("ranking: já existia", rodar(quantidade=1, senha="senha-evento"))
        rodar(quantidade=1, senha="senha-evento", senha_ranking="nova", redefinir_senhas=True)
        usuario.refresh_from_db()
        self.assertTrue(usuario.check_password("nova"))

    def test_sem_senha_do_ranking_nao_cria(self):
        """Sem RANKING_SENHA, o resto é criado e o ranking fica de fora."""
        saida = rodar(quantidade=1, senha="senha-evento")
        self.assertIn("não criado (defina RANKING_SENHA)", saida)
        self.assertFalse(get_user_model().objects.filter(username="ranking").exists())
        self.assertEqual(Totem.objects.count(), 1)


class LimparDadosTest(TestCase):
    """Comando ``limpar_dados``."""

    def setUp(self):
        """Um totem com duas partidas e um sorteio feito."""
        self.totem = criar_totem()
        criar_partida_finalizada(self.totem, 500)
        criar_partida_finalizada(self.totem, 900)
        services.sortear(Sorteio.Tipo.GERAL)

    def test_apaga_jogo_e_mantem_acessos(self):
        """Com ``--sim`` apaga jogadores, partidas e sorteios; totens e config ficam."""
        call_command("limpar_dados", sim=True, stdout=StringIO())
        self.assertFalse(Sorteio.objects.exists())
        self.assertFalse(Partida.objects.exists())
        self.assertFalse(Jogador.objects.exists())
        self.assertTrue(Totem.objects.filter(pk=self.totem.pk).exists())
        self.assertTrue(ConfiguracaoJogo.objects.exists())

    def test_confirmacao_errada_nao_apaga(self):
        """Sem ``--sim``, uma resposta diferente do nome do banco cancela tudo."""
        with mock.patch("builtins.input", return_value="nao"):
            with self.assertRaises(CommandError):
                call_command("limpar_dados", stdout=StringIO())
        self.assertEqual(Partida.objects.count(), 2)
