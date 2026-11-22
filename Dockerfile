# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# argon2/prisma precisam de libs de build
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Dependências ANTES do schema: mudar prisma/ (migration nova, campo novo) não
# invalida mais esta camada — o `npm ci` só roda de novo quando o package*.json muda.
# O cache do npm (BuildKit) evita baixar tudo outra vez quando ele muda.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY prisma ./prisma
RUN node_modules/.bin/prisma generate

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# o CLI do Prisma não tenta checar versão/telemetria a cada boot
ENV CHECKPOINT_DISABLE=1

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# `prisma` é DEPENDÊNCIA de produção neste projeto, não devDependency: o container
# roda `prisma migrate deploy` no boot, então o CLI e os engines precisam estar na
# imagem (senão o `npx` baixaria o schema-engine A CADA BOOT).
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY tsconfig*.json ./
COPY prisma ./prisma
# `prisma --version` é um smoke test: FALHA O BUILD se os engines não vieram,
# em vez de o problema aparecer como um boot lento lá na frente.
RUN node_modules/.bin/prisma generate && node_modules/.bin/prisma --version

COPY --from=build /app/dist ./dist

# Hardening: roda sem privilégios. Os arquivos ficam com dono root e o usuário
# `node` só LÊ — a API não escreve em /app. Antes havia um `chown -R node:node /app`,
# que recriava o node_modules inteiro numa camada nova e levava dezenas de minutos
# em disco lento (e ainda dobrava o tamanho da imagem).
USER node

EXPOSE 3000
# Aplica as migrations versionadas (prisma/migrations) e sobe a API.
# `migrate deploy` é idempotente e NÃO destrói dados.
# Caminho local em vez de `npx`: se o CLI não estiver na imagem, quebra na hora
# e aparece no log, em vez de o `npx` tentar baixar da rede.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
