"""Comando que zera os dados do jogo: jogadores, partidas e sorteios."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from jogo.models import Jogador, Partida, Sorteio


class Command(BaseCommand):
    """Apaga jogadores, partidas e sorteios, deixando o ranking e o sorteio vazios.

    Logins, totens e a configuração do jogo ficam como estão. Pede para
    digitar o nome do banco antes de apagar, a menos que ``--sim`` seja usado.
    """

    help = (
        "Apaga todos os jogadores, partidas e sorteios. Mantém logins, totens e "
        "a configuração do jogo."
    )

    def add_arguments(self, parser):
        """Declara os argumentos do comando.

        Args:
            parser: Parser de argumentos do Django.
        """
        parser.add_argument(
            "--sim", action="store_true", help="Apaga sem pedir confirmação."
        )

    def handle(self, *args, **opcoes):
        """Mostra o que será apagado, confirma e apaga.

        Raises:
            CommandError: Se a confirmação não bater.
        """
        banco = connection.settings_dict.get("NAME")
        host = connection.settings_dict.get("HOST") or "local"
        self.stdout.write(f"Banco: {banco} ({host})")
        self.stdout.write(
            f"Vai apagar {Sorteio.objects.count()} sorteios, "
            f"{Partida.objects.count()} partidas e {Jogador.objects.count()} jogadores."
        )

        if not opcoes["sim"]:
            resposta = input(f'Digite o nome do banco ("{banco}") para confirmar: ')
            if resposta.strip() != str(banco):
                raise CommandError("Confirmação não confere. Nada foi apagado.")

        with transaction.atomic():
            # Sorteios primeiro: o vencedor protege o jogador contra exclusão.
            Sorteio.objects.all().delete()
            Partida.objects.all().delete()
            Jogador.objects.all().delete()
        self.stdout.write(self.style.SUCCESS("Dados do jogo apagados."))
