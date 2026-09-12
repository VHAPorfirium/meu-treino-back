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
  -d '{"role":"ADMIN","pin":"1234"}' | grep -i set-cookie
```

## Próximos passos (roadmap do estudo)
- Pipeline de logs: **Promtail → Loki → Grafana** (ou Filebeat → ELK) com dashboard de
  tentativas de login, taxa de falha, top IPs, e **alerta de brute-force**.
- Refresh tokens + revogação; rotação de `JWT_SECRET`.
- Scan de dependências (Dependabot) e de imagem (Trivy) no CI.
