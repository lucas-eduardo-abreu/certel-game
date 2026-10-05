#!/usr/bin/env bash
# Build do Render: roda a cada deploy.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input

# Cria totem1..N, o admin e a configuração padrão (não altera o que já existe).
python manage.py preparar_ambiente
