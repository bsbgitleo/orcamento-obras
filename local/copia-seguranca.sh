#!/bin/zsh
# Cópia de segurança diária do banco de uso para o iCloud Drive, guardando as
# últimas 14 (chamado pelo LaunchAgent com.orcamentoobras.copia — decisão #85).
# Restaurar: createdb orcamento_obras_uso && pg_restore -d orcamento_obras_uso <arquivo>.dump
set -euo pipefail
DEST="$HOME/Library/Application Support/OrcamentoObras"
PASTA="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Cópias Orçamento de Obras"
BIN=/opt/homebrew/opt/postgresql@16/bin
set -a; source "$DEST/ambiente"; set +a

mkdir -p "$PASTA"
ARQ="$PASTA/orcamento-obras-$(date +%Y-%m-%d).dump"
"$BIN/pg_dump" --dbname="${DATABASE_URL%%\?*}" -Fc -f "$ARQ.parcial"
mv "$ARQ.parcial" "$ARQ"
# Mantém as 14 mais recentes
ls -1t "$PASTA"/orcamento-obras-*.dump 2>/dev/null | tail -n +15 | while read -r velho; do rm -f -- "$velho"; done
echo "$(date '+%Y-%m-%d %H:%M') cópia gravada: $(basename "$ARQ") ($(du -h "$ARQ" | cut -f1))"
