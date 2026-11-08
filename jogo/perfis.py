"""Perfis de acesso: admin, totem e ranking.

- **admin**: usuário da equipe (``is_staff``). Vê o admin e todas as telas;
  no jogo entra em modo prévia, sem salvar partidas.
- **totem**: usuário ligado a um :class:`~jogo.models.Totem` ativo. Vê só o jogo.
- **ranking**: usuário do grupo ``Ranking``. Vê só o telão do ranking e a roleta.
"""

GRUPO_RANKING = "Ranking"


def eh_admin(usuario):
    """Indica se o usuário é da equipe (acesso ao admin).

    Args:
        usuario: Usuário da requisição.

    Returns:
        bool: ``True`` para usuários ``is_staff`` autenticados.
    """
    return usuario.is_authenticated and usuario.is_staff


def totem_ativo(usuario):
    """Retorna o totem ativo ligado ao usuário.

    Args:
        usuario: Usuário da requisição.

    Returns:
        Totem | None: O totem, se existir e estiver ativo.
    """
    if not usuario.is_authenticated:
        return None
    totem = getattr(usuario, "totem", None)
    return totem if totem is not None and totem.ativo else None


def eh_ranking(usuario):
    """Indica se o usuário pode ver o telão do ranking e a roleta.

    Args:
        usuario: Usuário da requisição.

    Returns:
        bool: ``True`` para o admin e para quem está no grupo ``Ranking``.
    """
    if not usuario.is_authenticated:
        return False
    return eh_admin(usuario) or usuario.groups.filter(name=GRUPO_RANKING).exists()


def pagina_inicial(usuario):
    """Nome da rota para onde o usuário vai depois do login.

    Args:
        usuario: Usuário autenticado.

    Returns:
        str: ``admin:index``, ``jogo:ranking`` ou ``jogo:totem``.
    """
    if eh_admin(usuario):
        return "admin:index"
    if eh_ranking(usuario):
        return "jogo:ranking"
    return "jogo:totem"
