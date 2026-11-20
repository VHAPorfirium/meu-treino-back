/**
 * Resolução e validação do segredo do JWT.
 * Em produção, FALHA o boot se JWT_SECRET for nulo, padrão ou fraco (< 32 caracteres).
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || secret === 'dev-secret-troque-em-producao' || secret.length < 32) {
      throw new Error(
        'FATAL DE SEGURANÇA: Em produção, JWT_SECRET deve ser uma chave forte com no mínimo 32 caracteres. Gere uma com: openssl rand -hex 32',
      );
    }
    return secret;
  }

  return secret || 'dev-secret-troque-em-producao';
}
