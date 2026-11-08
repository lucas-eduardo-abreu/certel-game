"""Testes da API usada pelos totens e pelo telão."""

import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from jogo import services
from jogo.models import Partida

from .fabricas import criar_partida_finalizada, criar_totem, envelhecer


class BaseApiTest(TestCase):
    """Base com um totem logado."""

    def setUp(self):
        """Cria o totem 1 e faz login com ele."""
        self.totem = criar_totem(1)
        self.client.force_login(self.totem.usuario)

    def postar(self, url, dados):
        """Envia um POST em JSON.

        Args:
            url: Endereço do endpoint.
            dados: Corpo da requisição.

        Returns:
            HttpResponse: Resposta do servidor.
        """
        return self.client.post(url, dados, content_type="application/json")


class PermissaoTest(BaseApiTest):
    """Acesso restrito a totens ativos."""

    def test_anonimo_nao_acessa(self):
        """Sem login, a API dos totens responde 403."""
        self.client.logout()
        self.assertEqual(self.client.get(reverse("jogo:api-config")).status_code, 403)

    def test_usuario_sem_totem_nao_acessa(self):
        """Usuário comum, sem totem, é barrado."""
        self.client.force_login(get_user_model().objects.create_user("fulano", password="x"))
        self.assertEqual(self.client.get(reverse("jogo:api-config")).status_code, 403)

    def test_totem_inativo_nao_acessa(self):
        """Totem desativado é barrado."""
        self.totem.ativo = False
        self.totem.save()
        self.assertEqual(self.client.get(reverse("jogo:api-config")).status_code, 403)


class ConfiguracaoApiTest(BaseApiTest):
    """Endpoint de configuração."""

    def test_devolve_configuracao_e_totem(self):
        """A resposta traz os ajustes do jogo e o nome do totem."""
        dados = self.client.get(reverse("jogo:api-config")).json()
        self.assertEqual(dados["totem"], "Totem 1")
        self.assertEqual(dados["duracao_segundos"], 45)
        self.assertEqual(dados["pontos_acerto"], 100)
        self.assertEqual(dados["pontos_erro"], 300)
        self.assertEqual(dados["itens_por_multiplicador"], 5)
        self.assertEqual(dados["pontos_por_dobra"], 1000)
        self.assertEqual(dados["dobras_maximas"], 2)
        self.assertEqual(dados["perigos_inicial"], 25)
        self.assertEqual(dados["perigos_aumento"], 8)
        self.assertTrue(dados["musica_ativa"])
        self.assertTrue(dados["pedir_telefone"])


class IniciarPartidaApiTest(BaseApiTest):
    """Endpoint que abre a partida."""

    def test_cria_partida(self):
        """Cadastro válido devolve 201 com o id da partida."""
        resposta = self.postar(
            reverse("jogo:api-iniciar"),
            {"nome": "LUCAS ABREU", "telefone": "54999887766", "aceite_lgpd": True},
        )
        self.assertEqual(resposta.status_code, 201)
        partida = Partida.objects.get(pk=resposta.json()["id"])
        self.assertEqual(partida.totem, self.totem)
        self.assertEqual(resposta.json()["jogador"], "Lucas A.")

    def test_corpo_invalido(self):
        """Sem nome, a resposta é 400 com mensagem."""
        resposta = self.postar(reverse("jogo:api-iniciar"), {"telefone": "54999887766"})
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("erro", resposta.json())

    def test_regra_de_negocio(self):
        """Sem consentimento, a mensagem do serviço chega ao totem."""
        resposta = self.postar(
            reverse("jogo:api-iniciar"), {"nome": "Lucas", "telefone": "54999887766"}
        )
        self.assertEqual(resposta.status_code, 400)
        self.assertIn("autorização", resposta.json()["erro"])


class FinalizarPartidaApiTest(BaseApiTest):
    """Endpoint que recebe a pontuação."""

    def setUp(self):
        """Abre uma partida já com tempo de jogo decorrido."""
        super().setUp()
        self.partida = services.iniciar_partida(self.totem, "Lucas Abreu", "54999887766", True)
        envelhecer(self.partida)
        self.url = reverse("jogo:api-finalizar", kwargs={"pk": self.partida.pk})

    def test_finaliza_e_devolve_posicao(self):
        """A resposta traz pontuação, posição e o ranking."""
        criar_partida_finalizada(self.totem, 5000, minutos_atras=3)
        resposta = self.postar(
            self.url, {"pontuacao": 1300, "itens_coletados": 15, "perigos_atingidos": 2}
        )
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(dados["pontuacao"], 1300)
        self.assertEqual(dados["melhor_pontuacao"], 1300)
        self.assertEqual(dados["posicao"], 2)
        self.assertEqual(dados["jogador_id"], str(self.partida.jogador_id))
        self.assertEqual(len(dados["ranking"]), 2)

    def test_partida_de_outro_totem(self):
        """Um totem não finaliza a partida de outro."""
        self.client.force_login(criar_totem(2).usuario)
        self.assertEqual(self.postar(self.url, {"pontuacao": 100}).status_code, 404)

    def test_partida_inexistente(self):
        """Id desconhecido responde 404."""
        url = reverse("jogo:api-finalizar", kwargs={"pk": uuid.uuid4()})
        self.assertEqual(self.postar(url, {"pontuacao": 100}).status_code, 404)

    def test_corpo_invalido(self):
        """Pontuação negativa é recusada."""
        self.assertEqual(self.postar(self.url, {"pontuacao": -5}).status_code, 400)

    def test_regra_de_negocio(self):
        """Pontuação acima do teto é recusada com mensagem."""
        resposta = self.postar(self.url, {"pontuacao": 10**7})
        self.assertEqual(resposta.status_code, 400)
        self.assertEqual(resposta.json()["erro"], "Pontuação inválida.")


class RankingApiTest(TestCase):
    """Endpoint público do ranking."""

    def setUp(self):
        """Cria quatro partidas finalizadas."""
        totem = criar_totem()
        for indice in range(4):
            criar_partida_finalizada(totem, 100 * (indice + 1), minutos_atras=indice)

    def test_publico(self):
        """O telão lê o ranking sem login."""
        resposta = self.client.get(reverse("jogo:api-ranking"))
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(dados["titulo"], "Corrida Certel")
        self.assertEqual([r["pontuacao"] for r in dados["ranking"]], [400, 300, 200, 100])

    def test_limite(self):
        """O parâmetro ``limite`` reduz a lista; valor inválido cai no padrão."""
        url = reverse("jogo:api-ranking")
        self.assertEqual(len(self.client.get(url, {"limite": 2}).json()["ranking"]), 2)
        self.assertEqual(len(self.client.get(url, {"limite": "abc"}).json()["ranking"]), 4)
        self.assertEqual(len(self.client.get(url, {"limite": 0}).json()["ranking"]), 1)
