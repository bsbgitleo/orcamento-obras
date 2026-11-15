#!/bin/zsh
# local/instalar.sh — instala ou atualiza o app para uso diário neste Mac (decisão #85).
#
#   pasta     ~/Library/Application Support/OrcamentoObras  (fora de Documentos: o macOS
#             restringe o acesso de programas em segundo plano a essa pasta)
#             app/        build autossuficiente do Next (.next/standalone + static)
#             ambiente    configuração (banco de uso, porta, rede) — só o dono lê
#             imports/    arquivos enviados na importação das bases
#             logs/       saída do app e da cópia de segurança
#   banco     orcamento_obras_uso (o orcamento_obras fica para o desenvolvimento)
#   ligar     LaunchAgents: com.orcamentoobras.app (porta 3020, na rede) e
#             com.orcamentoobras.copia (cópia diária às 12h30 para o iCloud Drive);
#             o PostgreSQL liga pelo `brew services` (o serviço do Homebrew já define LC_ALL)
#
# Uso: npm run local:instalar   (repetir a cada atualização do app)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/OrcamentoObras"
AGENTS="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
PORTA="${PORTA:-3020}"

mkdir -p "$DEST/app" "$DEST/imports" "$DEST/logs" "$AGENTS"

# 1. Configuração (só na primeira vez): banco de uso com as credenciais do .env do projeto
if [[ ! -f "$DEST/ambiente" ]]; then
  URL_DEV="$(grep -E '^DATABASE_URL=' "$REPO/.env" | head -1 | cut -d= -f2- | tr -d '"')"
  URL_USO="${URL_DEV/\/orcamento_obras\?//orcamento_obras_uso?}"
  [[ "$URL_USO" == "$URL_DEV" ]] && URL_USO="${URL_DEV%/orcamento_obras}/orcamento_obras_uso"
  umask 077
  cat > "$DEST/ambiente" <<EOF
DATABASE_URL="$URL_USO"
NODE_ENV=production
PORT=$PORTA
HOSTNAME=0.0.0.0
COOKIE_SECURE=false
IMPORT_DIR="$DEST/imports"
EOF
  echo "Configuração criada em $DEST/ambiente"
fi

# 2. Build e cópia (sem o .env de desenvolvimento)
cd "$REPO"
npm run build
rsync -a --delete --exclude .env --exclude '.env.*' --exclude .claude --exclude .data "$REPO/.next/standalone/" "$DEST/app/"
rsync -a --delete "$REPO/.next/static/" "$DEST/app/.next/static/"
[[ -d "$REPO/public" ]] && rsync -a --delete "$REPO/public/" "$DEST/app/public/"
cp "$REPO/local/iniciar.sh" "$REPO/local/copia-seguranca.sh" "$DEST/"
chmod 700 "$DEST/iniciar.sh" "$DEST/copia-seguranca.sh"

# 3. Migrações no banco de uso (o DATABASE_URL do ambiente vence o do .env)
( set -a; source "$DEST/ambiente"; set +a; npm run db:migrate )

# 4. PostgreSQL ligando com o Mac
if ! brew services list | grep -q '^postgresql@16 *started'; then
  /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 status >/dev/null 2>&1 \
    && LC_ALL=en_US.UTF-8 /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 stop -m fast
  brew services start postgresql@16
fi

# 5. LaunchAgents do app e da cópia
cat > "$AGENTS/com.orcamentoobras.app.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.orcamentoobras.app</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$DEST/iniciar.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DEST/logs/app.log</string>
  <key>StandardErrorPath</key><string>$DEST/logs/app.log</string>
</dict></plist>
EOF
cat > "$AGENTS/com.orcamentoobras.copia.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.orcamentoobras.copia</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$DEST/copia-seguranca.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$DEST/logs/copia.log</string>
  <key>StandardErrorPath</key><string>$DEST/logs/copia.log</string>
</dict></plist>
EOF
for label in com.orcamentoobras.app com.orcamentoobras.copia; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$AGENTS/$label.plist"
done

echo "Pronto: http://localhost:$PORTA  ·  na rede: http://$(scutil --get LocalHostName).local:$PORTA"
