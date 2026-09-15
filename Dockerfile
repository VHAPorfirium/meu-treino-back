# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# argon2/prisma precisam de libs de build
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN node_modules/.bin/prisma generate

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

# `prisma` é DEPENDÊNCIA de produção neste projeto, não devDependency: o container
# roda `prisma migrate deploy` no boot, então o CLI e os engines são necessários
# em runtime. Com ele em devDependencies, o `npm ci --omit=dev` não o instalava e
# o `npx` do CMD baixava o CLI + o **schema-engine** do binaries.prisma.sh
# A CADA BOOT — em instância free isso custava MINUTOS, e o health check do Render
# ficava esperando a API subir. Agora o download acontece uma vez, aqui no build,
# e fica assado na camada da imagem.
#
# O `prisma --version` no fim é proposital: é um smoke test que FALHA O BUILD se
# os engines não tiverem sido baixados, em vez de deixar o problema aparecer como
# um boot lento e silencioso lá na frente.
RUN npm ci --omit=dev \
 && node_modules/.bin/prisma generate \
 && node_modules/.bin/prisma --version \
 && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3000
# Aplica as migrations versionadas (prisma/migrations) e sobe a API.
# `migrate deploy` é idempotente e NÃO destrói dados — substituiu o antigo `db push --accept-data-loss`
# a partir da Frente E (tabelas novas com FK em produção exigem migrations revisáveis).
#
# Caminho local em vez de `npx`: se por algum motivo o CLI não estiver na imagem,
# isso quebra na hora e aparece no log, em vez de o `npx` tentar baixar da rede.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
