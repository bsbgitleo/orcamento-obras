#!/bin/zsh
# Inicia o app instalado (chamado pelo LaunchAgent com.orcamentoobras.app — decisão #85).
DEST="$HOME/Library/Application Support/OrcamentoObras"
set -a; source "$DEST/ambiente"; set +a
# Espera o PostgreSQL (ao ligar o Mac, os dois sobem juntos)
for i in {1..30}; do
  /opt/homebrew/opt/postgresql@16/bin/pg_isready -q -h localhost && break
  sleep 2
done
cd "$DEST/app"
exec /opt/homebrew/bin/node server.js
