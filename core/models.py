"""Modelos-base compartilhados entre os apps."""

import uuid

from django.db import models


class AbstractBaseModel(models.Model):
    """Base de todos os modelos do projeto.

    Attributes:
        id: Chave primária UUID4, gerada na criação.
        created_at: Data e hora de criação do registro.
        updated_at: Data e hora da última alteração do registro.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        abstract = True
