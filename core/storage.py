"""Armazenamento dos arquivos estáticos em produção."""

from whitenoise.storage import CompressedManifestStaticFilesStorage


class EstaticosComprimidos(CompressedManifestStaticFilesStorage):
    """WhiteNoise com hash no nome, sem quebrar em caminho fora do manifesto.

    O admin (django-jazzmin 3.0.5) chama ``{% static 'vendor/bootswatch' %}``
    numa pasta, que não está no manifesto. No modo estrito isso levanta
    ``ValueError`` e todo o admin dá erro 500. Com ``manifest_strict = False``
    o caminho volta sem hash, como em desenvolvimento.
    """

    manifest_strict = False
