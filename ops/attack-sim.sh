#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Simulação de brute-force contra o login por PIN (Frente B — B4).
#
# Dispara N tentativas com PIN errado e mostra o status de cada uma:
#   401 → falha registrada (auth.login.failure)
#   429 → lockout ativo   (auth.login.locked)  ← esperado a partir da 6ª tentativa
#
# Uso:
#   ./ops/attack-sim.sh                       # 12 tentativas em http://localhost:3000
#   ./ops/attack-sim.sh 20                    # N tentativas
#   ./ops/attack-sim.sh 12 http://localhost:3000/api/auth/login
#   ./ops/attack-sim.sh 12 URL 203.0.113.7    # tenta forjar X-Forwarded-For
#
# Sobre o 3º argumento (IP forjado): ANTES do hardening de `trust proxy`, cada request
# com um X-Forwarded-For diferente contava como um IP novo e o lockout nunca vinha.
# DEPOIS, o header do cliente é ignorado (trust proxy) e o lockout acontece normalmente
# — e, mesmo que o IP variasse, o teto GLOBAL (30 falhas/min) segura. É o "antes/depois".
#
# Roteiro do print: `docker compose --profile observability up -d` → abrir o Grafana
# (http://localhost:3002, dashboard "Ritmo · Segurança") → rodar este script → em ~1 min:
# barras de falha subindo, IP no top, lockout na timeline e alerta no Discord.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

N="${1:-12}"
URL="${2:-http://localhost:3000/api/auth/login}"
FAKE_IP="${3:-}"
WRONG_PIN="9999"

echo "→ alvo: $URL"
echo "→ tentativas: $N (PIN errado: $WRONG_PIN)${FAKE_IP:+ · X-Forwarded-For forjado: $FAKE_IP}"
echo

for i in $(seq 1 "$N"); do
  if [[ -n "$FAKE_IP" ]]; then
    # varia o último octeto pra simular "IPs diferentes" via header forjado
    hdr=(-H "X-Forwarded-For: ${FAKE_IP%.*}.$((RANDOM % 250 + 1))")
  else
    hdr=()
  fi

  status=$(curl -s -o /tmp/attack-sim-body -w "%{http_code}" \
    -X POST "$URL" \
    -H "Content-Type: application/json" \
    "${hdr[@]}" \
    -d "{\"pin\":\"$WRONG_PIN\"}")

  msg=$(sed -E 's/.*"message":"([^"]*)".*/\1/' /tmp/attack-sim-body 2>/dev/null || true)
  case "$status" in
    401) tag="FALHA   " ;;
    429) tag="LOCKOUT " ;;
    *)   tag="HTTP $status" ;;
  esac
  printf "  #%02d  %s  %s\n" "$i" "$tag" "$msg"
  sleep 0.4
done

echo
echo "✓ pronto. Confira no Grafana: Top IPs, Timeline de lockouts e o alerta no Discord."
