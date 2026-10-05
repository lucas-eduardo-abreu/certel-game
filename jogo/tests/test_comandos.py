"""Testes do comando ``preparar_ambiente``."""

from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from jogo.models import ConfiguracaoJogo, Totem


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


@override_settings(TOTENS_QUANTIDADE=3, TOTENS_SENHA="senha-evento", ADMIN_USUARIO="", ADMIN_SENHA="")
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
