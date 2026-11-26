/**
 * Regras puras de validação e normalização para CPF, senha forte e `username`
 * (apelido `primeiro.ultimo`). Sem dependências externas — 100% testável.
 */

const PORTUGUESE_PREPOSITIONS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Remove tudo que não for dígito numérico. */
export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Valida CPF brasileiro (11 dígitos, rejeita sequências iguais e valida dígitos módulo 11). */
export function isValidCpf(raw: string): boolean {
  const digits = normalizeCpf(raw);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calcDigit(9) === Number(digits[9]) && calcDigit(10) === Number(digits[10]);
}

/** Mascara CPF no padrão LGPD (`***.456.789-**`) para exibição segura. */
export function maskCpf(raw: string): string {
  const digits = normalizeCpf(raw);
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Política de senha forte: 8+ caracteres, 1 letra, 1 número e 1 caractere especial. */
export function validateStrongPassword(
  password: string,
): { valid: boolean; reason?: string } {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, reason: 'A senha deve ter no mínimo 8 caracteres' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'A senha deve ter no máximo 128 caracteres' };
  }
  if (!/\p{L}/u.test(password)) {
    return { valid: false, reason: 'A senha deve conter pelo menos 1 letra' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, reason: 'A senha deve conter pelo menos 1 número' };
  }
  if (!/[^\p{L}\p{N}\s]/u.test(password)) {
    return {
      valid: false,
      reason: 'A senha deve conter pelo menos 1 caractere especial (ex.: !@#$%)',
    };
  }
  return { valid: true };
}

/** Normaliza apelido de usuário: minúsculo, sem acentos, apenas `[a-z0-9._-]`. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 40);
}

/** Valida formato canônico do username (`gabriel.silva`, `ana.paula2`). */
export function isValidUsername(raw: string): boolean {
  const normalized = normalizeUsername(raw);
  return (
    normalized.length >= 3 &&
    normalized.length <= 40 &&
    /^[a-z0-9]+([._-][a-z0-9]+)*$/.test(normalized)
  );
}

/**
 * Sugere apelido `primeiro.ultimo` a partir do nome completo, removendo acentos
 * e preposições (`da`, `de`, `do`, `das`, `dos`, `e`).
 */
export function suggestUsernameFromName(fullName: string): string {
  const cleanedTokens = fullName
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  if (cleanedTokens.length === 0) return 'usuario';
  if (cleanedTokens.length === 1) {
    const single = cleanedTokens[0].slice(0, 36);
    return single.length >= 3 ? single : `${single}usr`;
  }

  const meaningful = cleanedTokens.filter(
    (token, idx) =>
      idx === 0 ||
      idx === cleanedTokens.length - 1 ||
      !PORTUGUESE_PREPOSITIONS.has(token),
  );
  const first = meaningful[0];
  const last = meaningful[meaningful.length - 1];
  const base = normalizeUsername(`${first}.${last}`).slice(0, 36);
  return base.length >= 3 ? base : 'usuario';
}

/** Mascara identificador (CPF ou username) para logs de acesso sem vazar PII completo. */
export function maskIdentifier(raw: string): string {
  const trimmed = raw.trim();
  const digits = normalizeCpf(trimmed);
  if (digits.length === 11 && /^[\d.\-\s/]+$/.test(trimmed)) {
    return maskCpf(digits);
  }
  const normalized = normalizeUsername(trimmed);
  if (normalized.length <= 2) return '***';
  if (normalized.length <= 4) return `${normalized[0]}***`;
  return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
}
