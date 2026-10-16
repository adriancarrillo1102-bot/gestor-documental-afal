#!/bin/sh
set -eu
: "${GOTENBERG_API_BASIC_AUTH_USERNAME:?Falta el usuario del convertidor}"
: "${GOTENBERG_API_BASIC_AUTH_PASSWORD:?Falta la contraseña del convertidor}"
exec gotenberg \
  --api-port-from-env=PORT \
  --api-enable-basic-auth=true \
  --api-timeout=100s \
  --api-body-limit=12MB \
  --api-disable-download-from=true \
  --webhook-disable=true \
  --libreoffice-max-queue-size=1 \
  --libreoffice-restart-after=5 \
  --libreoffice-auto-start=true \
  --libreoffice-start-timeout=60s \
  '--libreoffice-deny-list=.*'
