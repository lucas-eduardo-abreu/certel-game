"""Testes dos modelos."""

import uuid

from django.core.exceptions import ValidationError
from django.test import TestCase
from model_bakery import baker

from jogo.models import ConfiguracaoJogo, Jogador, Partida

from .fabricas import criar_totem


class AbstractBaseModelTest(TestCase):
    """Campos herdados de ``AbstractBaseModel``."""

    def test_id_uuid_e_datas_preenchidos(self):
        """Todo registro nasce com UUID4 e datas de criação e alteração."""
        jogador = baker.make(Jogador)
        self.assertIsInstance(jogador.id, uuid.UUID)
        self.assertEqual(jogador.id.version, 4)
        self.assertIsNotNone(jogador.created_at)
        self.assertIsNotNone(jogador.updated_at)


class TotemTest(TestCase):
    """Modelo ``Totem``."""

    def test_str(self):
        """O totem é representado pelo nome."""
        self.assertEqual(str(criar_totem(2)), "Totem 2")


class JogadorTest(TestCase):
    """Modelo ``Jogador``."""

    def test_str(self):
        """O jogador é representado pelo nome."""
        self.assertEqual(str(baker.make(Jogador, nome="Ana Lima")), "Ana Lima")

    def test_nome_publico_abrevia_sobrenome(self):
        """O ranking mostra primeiro nome e inicial do último sobrenome."""
        self.assertEqual(baker.make(Jogador, nome="Maria Souza Lima").nome_publico, "Maria L.")

    def test_nome_publico_com_um_nome(self):
        """Nome único aparece inteiro."""
        self.assertEqual(baker.make(Jogador, nome="Pedro").nome_publico, "Pedro")

    def test_telefone_formatado(self):
        """Celular, fixo e telefone incompleto."""
        self.assertEqual(
            baker.make(Jogador, telefone="51999887766").telefone_formatado, "(51) 99988-7766"
        )
        self.assertEqual(
            baker.make(Jogador, telefone="5133445566").telefone_formatado, "(51) 3344-5566"
        )
        self.assertEqual(baker.make(Jogador, telefone="").telefone_formatado, "")


class PartidaTest(TestCase):
    """Modelo ``Partida``."""

    def test_str_e_padroes(self):
        """A partida nasce iniciada, zerada e visível."""
        partida = baker.make(
            Partida, totem=criar_totem(), jogador=baker.make(Jogador, nome="Ana")
        )
        self.assertEqual(str(partida), "Ana — 0 pts")
        self.assertEqual(partida.status, Partida.Status.INICIADA)
        self.assertFalse(partida.oculta)


class ConfiguracaoJogoTest(TestCase):
    """Modelo ``ConfiguracaoJogo``."""

    def test_carregar_cria_uma_unica_vez(self):
        """``carregar`` cria o registro e depois sempre devolve o mesmo."""
        primeira = ConfiguracaoJogo.carregar()
        segunda = ConfiguracaoJogo.carregar()
        self.assertEqual(primeira.pk, segunda.pk)
        self.assertEqual(ConfiguracaoJogo.objects.count(), 1)
        self.assertEqual(str(primeira), "Corrida Certel")

    def test_clean_bloqueia_segundo_registro(self):
        """Não é possível validar uma segunda configuração."""
        existente = ConfiguracaoJogo.carregar()
        existente.clean()
        with self.assertRaises(ValidationError):
            ConfiguracaoJogo().clean()
