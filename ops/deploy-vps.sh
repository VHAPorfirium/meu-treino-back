#!/usr/bin/env bash
# Deploy da API na VPS. Usado pelo GitHub Actions a cada push na main,
# mas também pode ser rodado à mão: bash ops/deploy-vps.sh
#
# Passos: atualiza o código → backup do banco (se ele roda aqui) → build →
# sobe a API (as migrations rodam sozinhas no boot) → espera o /api/health.
# Se a API nova não ficar saudável, volta para a versão anterior.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_COMMAND="docker compose -f docker-compose.prod.yml"
BACKUP_DIRECTORY="backups"
BACKUPS_TO_KEEP=10
HEALTH_CHECK_ATTEMPTS=30
HEALTH_CHECK_INTERVAL_SECONDS=5

# lê uma variável do .env sem executar o arquivo
read_env_value() {
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true
}

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado. Crie a partir do .env.production.example"
  exit 1
fi

API_PORT="$(read_env_value PORT)"
HEALTH_CHECK_URL="http://127.0.0.1:${API_PORT:-3000}/api/health"

wait_until_healthy() {
  for attempt in $(seq 1 "$HEALTH_CHECK_ATTEMPTS"); do
    if curl -fsS "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
      echo "===> API saudável (tentativa $attempt)"
      return 0
    fi
    sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
  done
  return 1
}

build_and_start_api() {
  $COMPOSE_COMMAND build api
  # só a API: o banco (perfil with-db), se existir, continua rodando sem reiniciar
  $COMPOSE_COMMAND up -d api
}

echo "===> 1/5 Atualizando o código"
PREVIOUS_COMMIT="$(git rev-parse HEAD)"
git fetch origin main
git reset --hard origin/main # a VPS não deve ter alterações locais no código
CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "     $PREVIOUS_COMMIT → $CURRENT_COMMIT"

echo "===> 2/5 Backup do banco"
if $COMPOSE_COMMAND ps --services --status running 2>/dev/null | grep -qx db; then
  mkdir -p "$BACKUP_DIRECTORY"
  DATABASE_USER="$(read_env_value POSTGRES_USER)"
  DATABASE_NAME="$(read_env_value POSTGRES_DB)"
  BACKUP_FILE="$BACKUP_DIRECTORY/backup-$(date +%Y%m%d-%H%M%S).sql.gz"
  $COMPOSE_COMMAND exec -T db pg_dump -U "${DATABASE_USER:-treino}" "${DATABASE_NAME:-meu_treino}" | gzip > "$BACKUP_FILE"
  echo "     salvo em $BACKUP_FILE"
  # mantém só os backups mais recentes
  ls -1t "$BACKUP_DIRECTORY"/backup-*.sql.gz | tail -n +$((BACKUPS_TO_KEEP + 1)) | xargs -r rm --
else
  echo "     banco não roda nesta VPS (gerenciado) — faça o backup pelo painel do provedor"
fi

echo "===> 3/5 Build e subida da API (migrations rodam no boot)"
build_and_start_api

echo "===> 4/5 Aguardando $HEALTH_CHECK_URL"
if ! wait_until_healthy; then
  echo "ERRO: a versão nova não ficou saudável. Últimos logs:"
  $COMPOSE_COMMAND logs --tail 80 api || true
  echo "===> Voltando para a versão anterior ($PREVIOUS_COMMIT)"
  git reset --hard "$PREVIOUS_COMMIT"
  build_and_start_api
  wait_until_healthy || echo "ATENÇÃO: a versão anterior também não respondeu — verifique a VPS"
  exit 1
fi

echo "===> 5/5 Limpando imagens antigas"
docker image prune -f > /dev/null

$COMPOSE_COMMAND ps
echo "===> Deploy concluído: $CURRENT_COMMIT"
