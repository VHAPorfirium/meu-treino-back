#!/usr/bin/env bash
set -euo pipefail

echo "===> Iniciando deploy na VPS..."

# 1. Garante que .env existe
if [ ! -f .env ]; then
  echo "ERRO: Arquivo .env não encontrado. Crie o arquivo .env a partir de .env.production.example"
  exit 1
fi

# 2. Atualiza repositório (caso esteja rodando direto do git)
if [ -d .git ]; then
  echo "===> Puxando atualizações do git..."
  git pull origin main
fi

# 3. Build e subida dos containers
echo "===> Construindo imagem e subindo container da API..."
docker compose -f docker-compose.prod.yml up -d --build

# 4. Aguarda container ficar saudável
echo "===> Aguardando inicialização..."
sleep 5

# 5. Verifica status
docker compose -f docker-compose.prod.yml ps

echo "===> Deploy concluído com sucesso!"
