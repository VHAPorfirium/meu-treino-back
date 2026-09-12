# meu-treino-back

API do app de treino — **NestJS + Prisma (Clean Architecture / DDD)**, PostgreSQL, Docker.

Parte do projeto descrito em `../SYSTEM_DESIGN.md`. 2 usuários (ADMIN + TRAINEE), auth por PIN.

---

## Stack
- NestJS 10 (Clean Architecture: `domain` / `application` / `infrastructure` por módulo)
- Prisma 5 + PostgreSQL
- Auth por PIN → JWT (argon2 no hash)
- Docker + docker-compose

## Estrutura
```
src/
  modules/{auth,users,exercises,muscle-groups,workouts,workout-logs}/
    domain/         # interfaces de repositório + tipos
    application/    # use-cases + DTOs
    infrastructure/ # implementação Prisma dos repositórios
    *.controller.ts *.module.ts
  shared/
    prisma/   # PrismaService + módulo global
    auth/     # JWT strategy, guards, decorators (@Roles, @Public, @CurrentUser)
prisma/
  schema.prisma
  seed.ts                    # catálogo + tradução + alternativas + usuários
  translations.pt-BR.json    # cache de tradução (commitado)
Dockerfile  docker-compose.yml  .env.example
```

---

## Rodar local

### Opção A — tudo no Docker (recomendado)
```bash
cp .env.example .env         # ajuste os PINs e o JWT_SECRET
docker compose up --build    # sobe Postgres + API (migrations aplicadas no boot)
```
A API sobe em `http://localhost:3000/api`.

O **seed roda fora do container** (precisa do dataset em `../exercises-dataset`):
```bash
npm install
npm run seed                 # usa DATABASE_URL do .env apontando p/ localhost:5432
```

### Opção B — Node local + Postgres no Docker
```bash
cp .env.example .env
docker compose up -d db      # só o Postgres
npm install
npx prisma db push           # cria as tabelas (ou `prisma migrate dev` se quiser migrations versionadas)
npm run seed                 # popula catálogo + usuários
npm run start:dev            # API em watch mode
```

---

## Variáveis de ambiente (`.env`)

| Var | Descrição |
|---|---|
| `DATABASE_URL` | Postgres. Local: `postgresql://treino:treino@localhost:5432/meu_treino?schema=public`. Supabase: usar o **pooler** (porta 6543). |
| `DIRECT_URL` | Conexão direta (migrations). No Supabase, a URL direta (porta 5432). Local = igual à `DATABASE_URL`. |
| `JWT_SECRET` | Segredo do JWT. **Troque em produção.** |
| `JWT_EXPIRES_IN` | Validade do token (padrão `30d`). |
| `ADMIN_PIN` / `TRAINEE_PIN` | PINs de login (usados no seed p/ gerar o hash). |
| `PORT` | Porta da API (padrão 3000). |
| `CORS_ORIGIN` | Origem do frontend (Vercel em produção). |
| `DATASET_PATH` | Caminho do dataset clonado (padrão `../exercises-dataset`). |
| `TRANSLATION_PROVIDER` | `none` (mantém inglês) ou `libretranslate`. |
| `LIBRETRANSLATE_URL` / `LIBRETRANSLATE_API_KEY` | Endpoint LibreTranslate (se provider = libretranslate). |
| `MEDIA_PROVIDER` | `none` (usa URLs raw do GitHub) ou `supabase` (faz upload). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | Storage (se provider = supabase). |

---

## Seed — detalhes

O `prisma/seed.ts`:
1. Lê `exercises.json` local (`DATASET_PATH`).
2. Cria os 10 `MuscleGroup` (body_parts) com `displayName` pt-BR.
3. Traduz as instruções (provider plugável, com cache em `translations.pt-BR.json`).
4. Resolve mídia: `none` = URL raw do GitHub; `supabase` = upload pro bucket.
5. Faz `upsert` dos exercícios (idempotente por `externalId`).
6. Gera `ExerciseAlternative` (mesmo `target`+`bodyPart`, equipamento diferente, até 6 por exercício → ~7.900 relações).
7. Cria os usuários ADMIN e TRAINEE com PIN via env.

> **MVP rápido:** deixe `TRANSLATION_PROVIDER=none` e `MEDIA_PROVIDER=none` para rodar sem dependências externas (instruções em inglês, GIFs servidos do GitHub). Depois troque para `libretranslate` + `supabase` e rode o seed de novo (idempotente; a tradução fica cacheada).

---

## Endpoints

Base: `/api` · Auth: `Authorization: Bearer <jwt>`

| Método | Rota | Papel |
|---|---|---|
| POST | `/auth/login` `{ role, pin }` | público |
| GET | `/auth/me` | autenticado |
| GET | `/exercises?muscleGroup=&search=&page=&pageSize=` | ambos |
| GET | `/exercises/:id/alternatives` | ambos |
| GET | `/muscle-groups` | ambos |
| POST | `/workouts` | ADMIN |
| POST | `/workouts/:id/exercises` | ADMIN |
| GET | `/workouts/today?dayOfWeek=` | TRAINEE |
| POST | `/workout-logs` `{ workoutId }` | TRAINEE |
| PATCH | `/workout-logs/:id/exercises/:weId` | TRAINEE |
| PATCH | `/workout-logs/:id/complete` | TRAINEE |
| GET | `/workout-logs/history` | ADMIN |
| GET | `/workout-logs/progress-summary` | ADMIN |

### Exemplo — login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"role":"TRAINEE","pin":"5678"}'
```

---

## Deploy

### Banco + Storage — Supabase (free)
1. Crie um projeto no Supabase.
2. `DATABASE_URL` = connection string do **pooler** (Transaction, porta 6543) com `?pgbouncer=true`.
3. `DIRECT_URL` = connection string **direta** (porta 5432) — usada pelas migrations.
4. (Se `MEDIA_PROVIDER=supabase`) crie um bucket **público** chamado `exercises` e use a `service_role` key.

### Backend — Railway ou Render (Docker)
1. Suba este repositório; a plataforma detecta o `Dockerfile`.
2. Configure as envs (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ADMIN_PIN`, `TRAINEE_PIN`, `CORS_ORIGIN`, etc.).
3. O container roda `prisma migrate deploy` no boot e sobe a API.
4. Rode o seed **uma vez** (localmente apontando `DATABASE_URL` p/ produção, ou via console da plataforma): `npm run seed`.

### Frontend — Vercel
Ver `../meu-treino-front` (Fase 2). `NEXT_PUBLIC_API_URL` aponta para a URL pública do backend.

---

## Scripts
```
npm run start:dev     # dev (watch)
npm run build         # compila p/ dist/
npm run start:prod    # roda dist/main.js
npm run prisma:migrate# prisma migrate dev
npm run seed          # popula o banco
npm run db:reset      # reseta o banco (cuidado)
```

## Notas de licença
As mídias (GIFs/thumbnails) são © Gym visual, redistribuídas via dataset MIT com atribuição obrigatória. O campo `attribution` é preservado em cada exercício e deve aparecer na tela de detalhe. Uso pessoal/não-comercial.
