"""Comando que deixa os acessos prontos: totens, admin e configuração."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from jogo.models import ConfiguracaoJogo, Totem


class Command(BaseCommand):
    """Cria os logins dos totens, o admin e a configuração padrão.

    É idempotente: pode rodar a cada deploy. Usuários que já existem não
    têm a senha alterada, a menos que ``--redefinir-senhas`` seja usado.
    """

    help = "Cria os logins dos totens (totem1..N), o admin e a configuração do jogo."

    def add_arguments(self, parser):
        """Declara os argumentos do comando.

        Args:
            parser: Parser de argumentos do Django.
        """
        parser.add_argument("--quantidade", type=int, default=settings.TOTENS_QUANTIDADE)
        parser.add_argument("--senha", default=settings.TOTENS_SENHA)
        parser.add_argument("--redefinir-senhas", action="store_true")

    def handle(self, *args, **opcoes):
        """Executa a preparação do ambiente.

        Raises:
            CommandError: Se for preciso criar um totem e não houver senha.
        """
        Usuario = get_user_model()
        ConfiguracaoJogo.carregar()

        for numero in range(1, opcoes["quantidade"] + 1):
            login = f"totem{numero}"
            usuario = Usuario.objects.filter(username=login).first()
            criado = usuario is None
            if criado or opcoes["redefinir_senhas"]:
                if not opcoes["senha"]:
                    raise CommandError(
                        "Defina TOTENS_SENHA (ou use --senha) para criar os logins dos totens."
                    )
                usuario = usuario or Usuario(username=login)
                usuario.set_password(opcoes["senha"])
                usuario.save()
            Totem.objects.get_or_create(usuario=usuario, defaults={"nome": f"Totem {numero}"})
            self.stdout.write(f"{login}: {'criado' if criado else 'já existia'}")

        if settings.ADMIN_USUARIO and settings.ADMIN_SENHA:
            if not Usuario.objects.filter(username=settings.ADMIN_USUARIO).exists():
                Usuario.objects.create_superuser(
                    username=settings.ADMIN_USUARIO, password=settings.ADMIN_SENHA
                )
                self.stdout.write(f"admin {settings.ADMIN_USUARIO}: criado")

        self.stdout.write(self.style.SUCCESS("Ambiente pronto."))
