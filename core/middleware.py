"""Middlewares compartilhados."""

from django.http import HttpResponse

CAMINHO_HEALTH_CHECK = "/healthz/"


class HealthCheckMiddleware:
    """Responde ao health check antes de qualquer outro middleware.

    O Render consulta ``/healthz/`` pelo endereço interno do serviço, que não
    está em ``ALLOWED_HOSTS``. Respondendo aqui, a checagem não depende do
    cabeçalho ``Host`` nem do redirecionamento para HTTPS.
    """

    def __init__(self, get_response):
        """Guarda o próximo elo da cadeia de middlewares.

        Args:
            get_response: Função que processa a requisição a seguir.
        """
        self.get_response = get_response

    def __call__(self, request):
        """Devolve ``ok`` para o health check e segue o fluxo nos demais casos.

        Args:
            request: Requisição recebida.

        Returns:
            HttpResponse: ``ok`` em ``/healthz/`` ou a resposta normal.
        """
        if request.path == CAMINHO_HEALTH_CHECK:
            return HttpResponse("ok", content_type="text/plain")
        return self.get_response(request)
