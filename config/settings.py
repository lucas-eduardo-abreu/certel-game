"""Configurações do projeto Certel Game.

Todas as configurações sensíveis vêm de variáveis de ambiente (python-decouple).
Em desenvolvimento, copie ``.env.example`` para ``.env``.
"""

import sys
from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

TESTANDO = "test" in sys.argv

SECRET_KEY = config("SECRET_KEY", default="dev-inseguro-troque-em-producao")
DEBUG = config("DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())

# O Render injeta o hostname público do serviço nesta variável.
RENDER_EXTERNAL_HOSTNAME = config("RENDER_EXTERNAL_HOSTNAME", default="")
if RENDER_EXTERNAL_HOSTNAME:  # pragma: no cover
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")

INSTALLED_APPS = [
    "jazzmin",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
    "jogo",
]

MIDDLEWARE = [
    "core.middleware.HealthCheckMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.parse(
        config("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
    )
}

if TESTANDO:
    # Hash rápido só nos testes; em produção vale o padrão do Django (PBKDF2).
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Arquivos estáticos (WhiteNoise) -------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG or TESTANDO
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}

# --- Autenticação dos totens --------------------------------------------
LOGIN_URL = "jogo:entrar"
LOGIN_REDIRECT_URL = "jogo:totem"
LOGOUT_REDIRECT_URL = "jogo:entrar"

# O totem faz login uma vez e fica conectado durante todo o evento.
SESSION_COOKIE_AGE = 60 * 60 * 24 * 365
SESSION_SAVE_EVERY_REQUEST = False

# --- Segurança em produção ----------------------------------------------
if not DEBUG and not TESTANDO:  # pragma: no cover
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
    CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT

# --- Logs ---------------------------------------------------------------
# Manda tudo para o console, que é o que aparece nos logs do Render.
# Sem isso, com DEBUG=False os erros 500 não seriam registrados.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

# --- Django REST Framework ----------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}

# --- Acessos criados pelo comando ``preparar_ambiente`` --------------------
TOTENS_QUANTIDADE = config("TOTENS_QUANTIDADE", default=3, cast=int)
TOTENS_SENHA = config("TOTENS_SENHA", default="")
ADMIN_USUARIO = config("ADMIN_USUARIO", default="")
ADMIN_SENHA = config("ADMIN_SENHA", default="")

# --- Admin (Jazzmin) -------------------------------------------------------
JAZZMIN_SETTINGS = {
    "site_title": "Certel Game",
    "site_header": "Certel Game",
    "site_brand": "Certel Game",
    "welcome_sign": "Painel do jogo dos totens",
    "copyright": "Certel Game",
    "show_ui_builder": False,
    "topmenu_links": [
        {"name": "Ranking (telão)", "url": "jogo:ranking", "new_window": True},
    ],
    "icons": {
        "auth.User": "fas fa-user",
        "auth.Group": "fas fa-users",
        "jogo.Totem": "fas fa-tablet-alt",
        "jogo.Jogador": "fas fa-id-badge",
        "jogo.Partida": "fas fa-trophy",
        "jogo.ConfiguracaoJogo": "fas fa-sliders-h",
    },
    "order_with_respect_to": [
        "jogo",
        "jogo.Partida",
        "jogo.Jogador",
        "jogo.Totem",
        "jogo.ConfiguracaoJogo",
        "auth",
    ],
}
JAZZMIN_UI_TWEAKS = {
    "navbar": "navbar-dark navbar-success",
    "sidebar": "sidebar-dark-success",
    "accent": "accent-success",
    "brand_colour": "navbar-success",
}
