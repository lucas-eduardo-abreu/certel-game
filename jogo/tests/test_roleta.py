"""Testes da roleta de sorteio: regras e API."""

from datetime import datetime, timedelta
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from model_bakery import baker

from jogo import services
from jogo.models import ConfiguracaoJogo, Jogador, Partida, Sorteio

from .fabricas import criar_partida_finalizada, criar_totem, criar_usuario_ranking


def no_dia(partida, dia, hora=12):
    """Move a finalização da partida para um dia, no fuso do evento.

    Args:
        partida: Partida a ajustar.
        dia: Data desejada.
        hora: Hora local da finalização.
    """
    momento = timezone.make_aware(datetime(dia.year, dia.month, dia.day, hora))
    Partida.objects.filter(pk=partida.pk).update(finalizada_em=momento)


class SorteioServiceTest(TestCase):
    """Quem concorre e como o sorteio é registrado."""

    def setUp(self):
        """Ana e Bia jogam hoje; Caio jogou ontem; Duda só tem partida oculta."""
        self.hoje = timezone.localdate()
        self.ontem = self.hoje - timedelta(days=1)
        totem = criar_totem()
        self.ana, self.bia, self.caio, self.duda = (
            baker.make(Jogador, nome=nome) for nome in ["Ana Souza", "Bia Lima", "Caio", "Duda"]
        )
        for jogador in [self.ana, self.bia]:
            no_dia(criar_partida_finalizada(totem, 500, jogador), self.hoje)
        no_dia(criar_partida_finalizada(totem, 900, self.caio), self.ontem)
        no_dia(criar_partida_finalizada(totem, 900, self.duda, oculta=True), self.hoje)
        # Partida aberta (não finalizada) não conta.
        baker.make(Partida, totem=totem, jogador=baker.make(Jogador, nome="Eva"))

    def participantes(self, tipo, dia=None):
        """Conjunto de jogadores elegíveis."""
        return set(services.participantes_do_sorteio(tipo, dia))

    def test_diario_so_quem_jogou_no_dia(self):
        """O diário pega só as partidas válidas do dia."""
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.hoje), {self.ana, self.bia})
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.ontem), {self.caio})

    def test_dia_segue_o_fuso_do_evento(self):
        """Partida às 23h de ontem (horário local) conta para ontem, não para hoje."""
        partida = self.caio.partidas.get()
        no_dia(partida, self.ontem, hora=23)
        self.assertIn(self.caio, self.participantes(Sorteio.Tipo.DIARIO, self.ontem))
        self.assertNotIn(self.caio, self.participantes(Sorteio.Tipo.DIARIO, self.hoje))

    def test_geral_pega_todos(self):
        """O geral junta todos os dias, sem partidas ocultas ou abertas."""
        self.assertEqual(
            self.participantes(Sorteio.Tipo.GERAL), {self.ana, self.bia, self.caio}
        )

    def test_sortear_registra_e_tira_o_vencedor(self):
        """Quem ganhou sai da roleta daquele escopo, mas segue nos outros."""
        with mock.patch("jogo.services.secrets.choice", side_effect=lambda ids: self.ana.pk):
            sorteio = services.sortear(Sorteio.Tipo.DIARIO, self.hoje)
        self.assertEqual(sorteio.vencedor, self.ana)
        self.assertEqual(sorteio.participantes, 2)
        self.assertEqual(sorteio.dia, self.hoje)
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.hoje), {self.bia})
        self.assertIn(self.ana, self.participantes(Sorteio.Tipo.GERAL))

    def test_diario_um_por_dia(self):
        """O sorteio do dia sai uma vez só por dia; outro dia segue liberado."""
        self.assertFalse(services.sorteio_encerrado(Sorteio.Tipo.DIARIO, self.hoje))
        services.sortear(Sorteio.Tipo.DIARIO, self.hoje)
        self.assertTrue(services.sorteio_encerrado(Sorteio.Tipo.DIARIO, self.hoje))
        with self.assertRaisesMessage(services.SorteioInvalido, "já foi feito"):
            services.sortear(Sorteio.Tipo.DIARIO, self.hoje)
        self.assertEqual(Sorteio.objects.filter(dia=self.hoje).count(), 1)
        self.assertFalse(services.sorteio_encerrado(Sorteio.Tipo.DIARIO, self.ontem))
        self.assertEqual(services.sortear(Sorteio.Tipo.DIARIO, self.ontem).vencedor, self.caio)

    def test_geral_sem_limite_ate_acabar(self):
        """O geral sorteia várias vezes; quando não sobra ninguém, avisa."""
        vencedores = {services.sortear(Sorteio.Tipo.GERAL).vencedor for _ in range(3)}
        self.assertEqual(vencedores, {self.ana, self.bia, self.caio})
        self.assertFalse(services.sorteio_encerrado(Sorteio.Tipo.GERAL))
        with self.assertRaisesMessage(services.SorteioInvalido, "Não há ninguém"):
            services.sortear(Sorteio.Tipo.GERAL)

    def test_geral_ignora_o_dia(self):
        """No geral o dia não é gravado."""
        sorteio = services.sortear(Sorteio.Tipo.GERAL, self.hoje)
        self.assertIsNone(sorteio.dia)
        self.assertEqual(sorteio.participantes, 3)

    def test_geral_so_top_do_ranking(self):
        """Com ``sorteio_geral_top``, o geral fica só com o top N; o diário não muda."""
        configuracao = ConfiguracaoJogo.carregar()
        configuracao.sorteio_geral_top = 1
        configuracao.save()
        self.assertEqual(self.participantes(Sorteio.Tipo.GERAL), {self.caio})
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.hoje), {self.ana, self.bia})

        # Quem ganhou sai, e a vaga não passa para o próximo do ranking.
        self.assertEqual(services.sortear(Sorteio.Tipo.GERAL).vencedor, self.caio)
        self.assertEqual(self.participantes(Sorteio.Tipo.GERAL), set())

    def test_geral_top_zero_e_todos(self):
        """``sorteio_geral_top`` em 0 (padrão) mantém todos no geral."""
        self.assertEqual(ConfiguracaoJogo.carregar().sorteio_geral_top, 0)
        self.assertEqual(len(self.participantes(Sorteio.Tipo.GERAL)), 3)

    def test_excluir_sorteio_devolve_o_vencedor(self):
        """Excluir o sorteio (admin) põe o vencedor de volta na roleta."""
        sorteio = services.sortear(Sorteio.Tipo.DIARIO, self.ontem)
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.ontem), set())
        sorteio.delete()
        self.assertEqual(self.participantes(Sorteio.Tipo.DIARIO, self.ontem), {self.caio})

    def test_validacoes(self):
        """Tipo desconhecido e diário sem dia são recusados."""
        with self.assertRaises(services.SorteioInvalido):
            services.sortear("semanal")
        with self.assertRaisesMessage(services.SorteioInvalido, "dia"):
            services.sortear(Sorteio.Tipo.DIARIO)

    def test_dias_com_partidas(self):
        """Lista os dias com partidas válidas, do mais recente ao mais antigo."""
        self.assertEqual(services.dias_com_partidas(), [self.hoje, self.ontem])


class RoletaApiTest(TestCase):
    """Endpoint da roleta."""

    def setUp(self):
        """Três jogadores hoje, com o usuário do ranking logado."""
        self.totem = criar_totem()
        for nome, telefone in [("Ana Souza", "51999887766"), ("Bia Lima", ""), ("Caio", "")]:
            jogador = baker.make(Jogador, nome=nome, telefone=telefone)
            criar_partida_finalizada(self.totem, 500, jogador)
        self.usuario = criar_usuario_ranking()
        self.client.force_login(self.usuario)
        self.url = reverse("jogo:api-roleta")

    def girar(self, **dados):
        """Gira a roleta pela API."""
        return self.client.post(self.url, dados, content_type="application/json")

    def test_so_ranking_e_admin(self):
        """Totem e anônimo não acessam a roleta."""
        self.client.force_login(self.totem.usuario)
        self.assertEqual(self.client.get(self.url, {"tipo": "geral"}).status_code, 403)
        self.assertEqual(self.girar(tipo="geral").status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.url, {"tipo": "geral"}).status_code, 403)

    def test_estado_do_dia(self):
        """Sem dia, o diário usa hoje e traz total, nomes curtos e dias."""
        dados = self.client.get(self.url, {"tipo": "diario"}).json()
        hoje = timezone.localdate().isoformat()
        self.assertEqual(dados["dia"], hoje)
        self.assertEqual(dados["dias"], [hoje])
        self.assertEqual(dados["total"], 3)
        self.assertCountEqual(dados["nomes"], ["Ana S.", "Bia L.", "Caio"])
        self.assertEqual(dados["sorteios"], [])
        self.assertEqual(dados["somente_top"], 0)

    def test_estado_geral_avisa_o_top(self):
        """O geral informa o limite do top N; o diário não."""
        configuracao = ConfiguracaoJogo.carregar()
        configuracao.sorteio_geral_top = 5
        configuracao.save()
        self.assertEqual(self.client.get(self.url, {"tipo": "geral"}).json()["somente_top"], 5)
        self.assertEqual(self.client.get(self.url, {"tipo": "diario"}).json()["somente_top"], 0)

    def test_girar_e_listar(self):
        """O giro devolve o vencedor e entra na lista de sorteados."""
        ana = Jogador.objects.get(nome="Ana Souza")
        with mock.patch("jogo.services.secrets.choice", return_value=ana.pk):
            resposta = self.girar(tipo="diario")
        self.assertEqual(resposta.status_code, 201)
        sorteio = resposta.json()["sorteio"]
        self.assertEqual(sorteio["nome"], "Ana Souza")
        self.assertEqual(sorteio["nome_curto"], "Ana S.")
        self.assertEqual(sorteio["telefone"], "(51) 99988-7766")
        self.assertEqual(sorteio["telefone_final"], "7766")
        self.assertEqual(sorteio["participantes"], 3)
        self.assertEqual(Sorteio.objects.get().realizado_por, self.usuario)

        dados = self.client.get(self.url, {"tipo": "diario"}).json()
        self.assertEqual(dados["total"], 2)
        self.assertEqual([s["nome"] for s in dados["sorteios"]], ["Ana Souza"])
        geral = self.client.get(self.url, {"tipo": "geral"}).json()
        self.assertIsNone(geral["dia"])
        self.assertEqual(geral["total"], 3)

    def test_diario_trava_depois_do_primeiro(self):
        """Depois do sorteio do dia, a API avisa ``encerrado`` e recusa outro giro."""
        self.assertFalse(self.client.get(self.url, {"tipo": "diario"}).json()["encerrado"])
        self.assertEqual(self.girar(tipo="diario").status_code, 201)
        self.assertTrue(self.client.get(self.url, {"tipo": "diario"}).json()["encerrado"])
        resposta = self.girar(tipo="diario")
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(resposta.json()["erro"], "O sorteio deste dia já foi feito.")
        self.assertFalse(self.client.get(self.url, {"tipo": "geral"}).json()["encerrado"])
        self.assertEqual(self.girar(tipo="geral").status_code, 201)

    def test_dia_sem_jogadores(self):
        """Dia sem partidas responde 400 com a explicação."""
        resposta = self.girar(tipo="diario", dia="2020-01-01")
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(resposta.json()["erro"], "Não há ninguém para sortear.")

    def test_dados_invalidos(self):
        """Tipo ou dia inválidos dão 400."""
        self.assertEqual(self.client.get(self.url, {"tipo": "x"}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {"tipo": "diario", "dia": "ontem"}).status_code, 400)
        self.assertEqual(self.girar(tipo="x").status_code, 400)
