# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# argon2/prisma precisam de libs de build
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3000
# Aplica as migrations versionadas (prisma/migrations) e sobe a API.
# `migrate deploy` é idempotente e NÃO destrói dados — substituiu o antigo `db push --accept-data-loss`
# a partir da Frente E (tabelas novas com FK em produção exigem migrations revisáveis).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
