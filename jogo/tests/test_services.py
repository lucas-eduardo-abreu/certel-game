"""Testes das regras de negócio."""

from django.test import TestCase
from model_bakery import baker

from jogo import services
from jogo.models import ConfiguracaoJogo, Jogador, Partida

from .fabricas import criar_partida_finalizada, criar_totem, envelhecer


class NormalizacaoTest(TestCase):
    """Funções de normalização e teto de pontuação."""

    def test_normalizar_telefone(self):
        """Sobram apenas os dígitos."""
        self.assertEqual(services.normalizar_telefone("(51) 99988-7766"), "51999887766")
        self.assertEqual(services.normalizar_telefone(None), "")

    def test_normalizar_nome(self):
        """Espaços extras somem e as iniciais ficam maiúsculas."""
        self.assertEqual(services.normalizar_nome("  MARIA   DA  SILVA "), "Maria Da Silva")
        self.assertEqual(services.normalizar_nome(None), "")

    def configuracao(self, **campos):
        """Monta uma configuração de 10 s, sem gravar no banco."""
        padrao = {
            "duracao_segundos": 10,
            "pontos_acerto": 100,
            "itens_por_multiplicador": 5,
            "pontos_por_dobra": 0,
            "dobras_maximas": 2,
        }
        return baker.prepare(ConfiguracaoJogo, **{**padrao, **campos})

    def test_pontuacao_maxima_sem_aceleracao(self):
        """Em 10 s cabem 10 itens (+2 de folga): 5 a 1x, 5 a 2x e 2 a 3x."""
        self.assertEqual(services.pontuacao_maxima(self.configuracao()), 2100)

    def test_pontuacao_maxima_sem_multiplicador(self):
        """Com o multiplicador desligado, cada um dos 12 itens vale 100."""
        configuracao = self.configuracao(itens_por_multiplicador=0)
        self.assertEqual(services.pontuacao_maxima(configuracao), 1200)

    def test_pontuacao_maxima_com_aceleracao(self):
        """Dobrando a velocidade a cada 1000 pontos, cabem mais itens em 10 s."""
        configuracao = self.configuracao(pontos_por_dobra=1000)
        self.assertEqual(services.pontuacao_maxima(configuracao), 3400)

    def test_limite_de_dobras_segura_o_teto(self):
        """Sem dobras permitidas, a aceleração não muda a pontuação máxima."""
        configuracao = self.configuracao(pontos_por_dobra=1000, dobras_maximas=0)
        self.assertEqual(services.pontuacao_maxima(configuracao), 2100)


class IniciarPartidaTest(TestCase):
    """Serviço ``iniciar_partida``."""

    def setUp(self):
        """Cria um totem ativo."""
        self.totem = criar_totem()

    def test_cria_jogador_e_partida(self):
        """Com dados válidos, nasce uma partida iniciada."""
        partida = services.iniciar_partida(self.totem, "LUCAS ABREU", "(54) 99988-7766", True)
        self.assertEqual(partida.status, Partida.Status.INICIADA)
        self.assertEqual(partida.totem, self.totem)
        self.assertEqual(partida.jogador.nome, "Lucas Abreu")
        self.assertEqual(partida.jogador.telefone, "54999887766")
        self.assertTrue(partida.jogador.aceite_lgpd)
        self.assertIsNotNone(partida.jogador.aceite_em)

    def test_mesmo_telefone_reaproveita_jogador(self):
        """Quem joga de novo continua sendo o mesmo jogador."""
        primeira = services.iniciar_partida(self.totem, "Lucas", "54999887766", True)
        aceite_original = primeira.jogador.aceite_em
        segunda = services.iniciar_partida(criar_totem(2), "Lucas Abreu", "54999887766", True)
        self.assertEqual(primeira.jogador_id, segunda.jogador_id)
        self.assertEqual(Jogador.objects.count(), 1)
        self.assertEqual(segunda.jogador.nome, "Lucas Abreu")
        self.assertEqual(segunda.jogador.aceite_em, aceite_original)

    def test_totem_inativo(self):
        """Totem desativado não inicia partida."""
        self.totem.ativo = False
        with self.assertRaisesMessage(services.PartidaInvalida, "desativado"):
            services.iniciar_partida(self.totem, "Lucas", "54999887766", True)

    def test_nome_obrigatorio(self):
        """Nome com menos de duas letras é recusado."""
        with self.assertRaisesMessage(services.PartidaInvalida, "nome"):
            services.iniciar_partida(self.totem, " a ", "54999887766", True)

    def test_telefone_invalido(self):
        """Telefone sem DDD é recusado."""
        with self.assertRaisesMessage(services.PartidaInvalida, "telefone"):
            services.iniciar_partida(self.totem, "Lucas", "99988-7766", True)

    def test_aceite_obrigatorio(self):
        """Sem o consentimento a partida não começa."""
        with self.assertRaisesMessage(services.PartidaInvalida, "autorização"):
            services.iniciar_partida(self.totem, "Lucas", "54999887766", False)

    def test_sem_pedir_telefone(self):
        """Com o telefone desligado, só o nome é guardado."""
        configuracao = ConfiguracaoJogo.carregar()
        configuracao.pedir_telefone = False
        configuracao.save()
        partida = services.iniciar_partida(self.totem, "Lucas", "54999887766", True)
        self.assertEqual(partida.jogador.telefone, "")
        self.assertFalse(partida.jogador.aceite_lgpd)
        outra = services.iniciar_partida(self.totem, "Lucas")
        self.assertNotEqual(partida.jogador_id, outra.jogador_id)


class FinalizarPartidaTest(TestCase):
    """Serviço ``finalizar_partida``."""

    def setUp(self):
        """Cria uma partida iniciada há tempo suficiente."""
        self.totem = criar_totem()
        self.partida = services.iniciar_partida(self.totem, "Lucas", "54999887766", True)
        envelhecer(self.partida)

    def test_registra_pontuacao(self):
        """A pontuação e as estatísticas são gravadas."""
        partida = services.finalizar_partida(self.partida, 1200, 14, 2)
        self.assertEqual(partida.status, Partida.Status.FINALIZADA)
        self.assertEqual(partida.pontuacao, 1200)
        self.assertEqual(partida.itens_coletados, 14)
        self.assertEqual(partida.perigos_atingidos, 2)
        self.assertIsNotNone(partida.finalizada_em)

    def test_nao_finaliza_duas_vezes(self):
        """Reenviar a mesma partida é recusado."""
        services.finalizar_partida(self.partida, 500)
        with self.assertRaisesMessage(services.PartidaInvalida, "já foi finalizada"):
            services.finalizar_partida(self.partida, 9000)

    def test_cedo_demais(self):
        """Partida recém-aberta não pode ser finalizada."""
        nova = services.iniciar_partida(self.totem, "Ana", "54911112222", True)
        with self.assertRaisesMessage(services.PartidaInvalida, "ainda não terminou"):
            services.finalizar_partida(nova, 500)

    def test_pontuacao_acima_do_teto(self):
        """Pontuação impossível é recusada."""
        teto = services.pontuacao_maxima(ConfiguracaoJogo.carregar())
        with self.assertRaisesMessage(services.PartidaInvalida, "Pontuação inválida"):
            services.finalizar_partida(self.partida, teto + 100)


class RankingTest(TestCase):
    """Ranking geral e posição do jogador."""

    def setUp(self):
        """Cria dois totens e três jogadores."""
        self.totem1 = criar_totem(1)
        self.totem2 = criar_totem(2)
        self.ana = baker.make(Jogador, nome="Ana Souza")
        self.bia = baker.make(Jogador, nome="Bia")
        self.caio = baker.make(Jogador, nome="Caio Lima")

    def test_melhor_partida_de_cada_jogador(self):
        """Cada jogador aparece uma vez, com a melhor pontuação, somando os totens."""
        criar_partida_finalizada(self.totem1, 800, self.ana, minutos_atras=9)
        criar_partida_finalizada(self.totem2, 1500, self.ana, minutos_atras=5)
        criar_partida_finalizada(self.totem2, 1000, self.bia, minutos_atras=3)
        ranking = services.montar_ranking()
        self.assertEqual(
            [(r["posicao"], r["nome"], r["pontuacao"], r["totem"]) for r in ranking],
            [(1, "Ana S.", 1500, "Totem 2"), (2, "Bia", 1000, "Totem 2")],
        )
        self.assertEqual(ranking[0]["jogador_id"], str(self.ana.pk))

    def test_empate_vence_quem_fez_antes(self):
        """No empate, fica à frente quem marcou primeiro."""
        criar_partida_finalizada(self.totem1, 1000, self.bia, minutos_atras=2)
        criar_partida_finalizada(self.totem1, 1000, self.caio, minutos_atras=8)
        self.assertEqual([r["nome"] for r in services.montar_ranking()], ["Caio L.", "Bia"])
        self.assertEqual(services.posicao_do_jogador(self.caio), (1, 1000))
        self.assertEqual(services.posicao_do_jogador(self.bia), (2, 1000))

    def test_ignora_ocultas_e_nao_finalizadas(self):
        """Partidas ocultas ou em andamento ficam fora do ranking."""
        criar_partida_finalizada(self.totem1, 3000, self.ana, oculta=True)
        baker.make(Partida, totem=self.totem1, jogador=self.bia, pontuacao=2000)
        criar_partida_finalizada(self.totem1, 100, self.caio)
        self.assertEqual([r["nome"] for r in services.montar_ranking()], ["Caio L."])
        self.assertEqual(services.posicao_do_jogador(self.ana), (None, 0))

    def test_limite(self):
        """O limite explícito e o da configuração são respeitados."""
        for indice in range(5):
            criar_partida_finalizada(self.totem1, 100 * indice, minutos_atras=indice)
        self.assertEqual(len(services.montar_ranking(limite=2)), 2)
        configuracao = ConfiguracaoJogo.carregar()
        configuracao.tamanho_ranking = 3
        configuracao.save()
        self.assertEqual(len(services.montar_ranking()), 3)

    def test_posicao_usa_o_recorde(self):
        """A posição considera a melhor partida, não a última."""
        criar_partida_finalizada(self.totem1, 2000, self.ana, minutos_atras=9)
        criar_partida_finalizada(self.totem1, 300, self.ana, minutos_atras=1)
        criar_partida_finalizada(self.totem1, 2500, self.bia, minutos_atras=4)
        self.assertEqual(services.posicao_do_jogador(self.ana), (2, 2000))
