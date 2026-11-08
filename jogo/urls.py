"""Rotas do app ``jogo``."""

from django.urls import path

from . import api, views

app_name = "jogo"

urlpatterns = [
    path("", views.TotemView.as_view(), name="totem"),
    path("entrar/", views.EntrarView.as_view(), name="entrar"),
    path("sair/", views.SairView.as_view(), name="sair"),
    path("ranking/", views.RankingView.as_view(), name="ranking"),
    path("roleta/", views.RoletaView.as_view(), name="roleta"),
    path("api/config/", api.ConfiguracaoView.as_view(), name="api-config"),
    path("api/ranking/", api.RankingView.as_view(), name="api-ranking"),
    path("api/roleta/", api.RoletaView.as_view(), name="api-roleta"),
    path("api/partidas/", api.IniciarPartidaView.as_view(), name="api-iniciar"),
    path(
        "api/partidas/<uuid:pk>/finalizar/",
        api.FinalizarPartidaView.as_view(),
        name="api-finalizar",
    ),
]
