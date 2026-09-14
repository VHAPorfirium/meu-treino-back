# SECURITY.md — Lab de segurança do Ritmo

Este backend é usado como **laboratório de segurança**: um app real (auth, dados de
usuário, API, banco, Docker) para praticar hardening e gerar eventos para análise de logs.
Abaixo, os controles implementados mapeados ao **OWASP Top 10 (2021)**.

## Modelo de ameaça (resumido)
- 2 usuários (ADMIN, TRAINEE), login por **PIN** → JWT.
- Superfície pequena, mas suficiente pra demonstrar: brute-force de credenciais,
  roubo de sessão (XSS), abuso de API (flood), injeção e falta de observabilidade.

## Controles implementados

| OWASP | Risco | O que foi feito |
|---|---|---|
| **A07 — Auth Failures** | Brute-force no PIN | PIN com hash **argon2id**; **lockout** (5 falhas/min por IP+papel → bloqueio de 5 min); **rate limit** no login (10/min por IP) via `@nestjs/throttler`. |
| **A05 — Misconfiguration** | Headers/CORS frouxos | **helmet** (headers seguros); **CORS** travado por origem com `credentials`; segredos só em `.env` (fora do git). |
| **A02 — Sessão/Cripto** | Roubo de token via XSS | JWT movido pra **cookie httpOnly + SameSite** (invisível ao JS); `Secure`+`SameSite=None` em produção. |
| **A03 — Injection** | SQL injection / payload | **Prisma** (queries parametrizadas); **class-validator** com `whitelist` + `forbidNonWhitelisted`. |
| **A09 — Logging & Monitoring** | Ataque invisível | **Audit log estruturado (JSON, pino)**: `auth.login.success/failure/locked` e `auth.logout` com `ip`, `role`, `requestId`, `attempt`. Base pra dashboard/alerta. |
| **A06 — Componentes vulneráveis** | Dependências | Rodar `npm audit`; próximo passo: Dependabot + Trivy na imagem Docker. |

## Como testar (demonstração pro estudo)

**1. Brute-force + lockout** — dispare tentativas com PIN errado e veja o bloqueio:
```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "tentativa $i -> %{http_code}\n" \
    -X POST http://localhost:3000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"role":"TRAINEE","pin":"0000"}'
done
# as primeiras dão 401; a partir da 5ª o lockout responde 429 (Too Many Requests)
```

**2. Ver os eventos de segurança** (JSON, prontos pra Loki/ELK):
```bash
docker compose logs api | grep '"kind":"security"'
```

**3. Cookie httpOnly** — confira que o login seta `Set-Cookie: mt_token=...; HttpOnly`:
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"pin":"0000"}' | grep -i set-cookie
```

## Frente B — o que foi implementado (14/09/2026)

### Eventos de segurança (contrato consumido pelo Grafana)
Uma linha JSON por evento (`kind:"security"`, `app:"ritmo-api"`), sempre com `ip`, `requestId`, `method`/`path` quando aplicável:

| Evento | Nível | Onde nasce |
|---|---|---|
| `auth.login.success` / `failure` / `locked` | info / warn | `LoginUseCase` (`durationMs`, `attempt`, `scope`) |
| `auth.logout` | info | `AuthController` |
| `auth.unauthorized` | warn | `JwtAuthGuard.handleRequest` — 401 (`reason`: `no_token` / `expired` / `invalid`) |
| `authz.denied` | warn | `RolesGuard` — 403 (`requiredRoles`, `role`, `userId`) |
| `ratelimit.exceeded` | warn | `ThrottlerLogFilter` — 429 do rate limit global |

`request-id` em toda requisição (header `x-request-id`, gerado se não vier) pra correlacionar erro ↔ evento.

### Hardening: IP confiável (bypass do lockout fechado)
Antes, `clientIp()` lia o **primeiro** `X-Forwarded-For` — controlado pelo cliente. Bastava mandar um IP diferente por request pra nunca cair no lockout por IP. Agora a API usa `req.ip` com `trust proxy` = `TRUST_PROXY_HOPS` (Render direto = 1; via proxy do Next na Vercel = 2), e o header forjado é ignorado. Reproduza o "antes/depois" com `ops/attack-sim.sh N URL <ip-falso>`.

### Defesa em profundidade: teto global de falhas
`LoginThrottleService` tem duas camadas: **por IP** (5 falhas/1 min → 5 min) e **global** (30 falhas/1 min → 2 min, todos os IPs). Com PIN de 4 dígitos, o teto global limita o número absoluto de tentativas por minuto mesmo com IPs forjados/distribuídos. O evento `auth.login.locked` carrega `scope: "ip" | "global"`.

### Pipeline de observabilidade (local, `docker compose --profile observability up -d`)
API (stdout JSON) → Docker json-file → **Alloy** (`ops/alloy/config.alloy`) → **Loki** (`ops/loki`) → **Grafana** (`ops/grafana/provisioning`, tudo provisionado por arquivo). Grafana em http://localhost:3002 (admin/admin). Só `app`, `kind`, `level`, `event` viram **labels** no Loki; `ip`/`requestId`/`userId` ficam no JSON (`| json` na query) — cardinalidade controlada.

- Dashboard **"Ritmo · Segurança (mini-SIEM)"** (`security.json`): tentativas/hora, taxa de falha, top IPs, timeline de lockouts, sucesso×falha, latência p50/p95 do login, 401/403/429 por rota, feed bruto.
- Alertas (`rules.yaml`): **brute-force por IP** (>5 falhas/1min) e **global** (>30/1min) → contact point **Discord** (`DISCORD_WEBHOOK_URL` no `.env`, nunca commitado).
- Simulação: `./ops/attack-sim.sh` (12 tentativas com PIN errado → 401…401 → 429).

### Supply-chain
`.github/dependabot.yml` (npm semanal, docker, actions) e `.github/workflows/ci.yml` (`npm audit --audit-level=high`, build, **Trivy** na imagem com falha em CRITICAL/HIGH + SARIF na aba Security).

## Próximos passos
- Refresh tokens + revogação; rotação de `JWT_SECRET`.
- Logs de produção (Render → Grafana Cloud Loki) reaproveitando o mesmo dashboard.
- Lockout em Redis se houver mais de uma instância.
