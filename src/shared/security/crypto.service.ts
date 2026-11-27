import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { getJwtSecret } from '../auth/jwt-secret';
import { maskCpf, normalizeCpf } from './cpf-and-password';

const MIN_SECRET_LENGTH = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CIPHER_VERSION = 'v1';

/**
 * Serviço criptográfico para PII (LGPD):
 *  - `hashCpf`: Blind Index determinístico (`HMAC-SHA256`) com `CPF_PEPPER_KEY`
 *    para busca em O(1) e `@unique` no PostgreSQL sem expor o CPF em texto puro.
 *  - `encrypt` / `decrypt`: cifragem autenticada `AES-256-GCM` com IV aleatório
 *    e `AAD` vinculado ao `userId` (impede troca de ciphertext entre linhas).
 *
 * Em produção, configure `CPF_PEPPER_KEY` e `DATA_ENCRYPTION_KEY` dedicadas no `.env`
 * (32 bytes hex cada: `openssl rand -hex 32`). Caso ainda não estejam definidas no
 * primeiro deploy, deriva chaves independentes por domínio via HKDF-SHA256 a partir
 * de `JWT_SECRET` e emite aviso claro no log para evitar indisponibilidade no rollout.
 */
@Injectable()
export class CryptoService {
  private readonly log = new Logger('Crypto');
  private warnedPepperFallback = false;
  private warnedEncryptionFallback = false;

  /** Gera blind index determinístico (64 chars hex) para lookup O(1) e @unique de CPF. */
  hashCpf(cpf: string): string {
    const digits = normalizeCpf(cpf);
    if (digits.length !== 11) {
      throw new Error('CPF precisa ter 11 dígitos para gerar hash');
    }
    return createHmac('sha256', this.resolvePepperKey())
      .update(digits, 'utf8')
      .digest('hex');
  }

  /** Cifra texto com AES-256-GCM, IV aleatório (96 bits) e AAD autenticado. */
  encrypt(plaintext: string, aad: string): string {
    const key = this.resolveEncryptionKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      CIPHER_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  /** Decifra payload `v1:<iv>:<tag>:<ciphertext>` validando integridade e AAD. */
  decrypt(encoded: string, aad: string): string {
    const parts = encoded.split(':');
    if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
      throw new Error('Formato de ciphertext inválido');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(dataB64, 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error('Parâmetros criptográficos inválidos');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.resolveEncryptionKey(),
      iv,
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  encryptCpf(cpf: string, userId: string): string {
    const digits = normalizeCpf(cpf);
    if (digits.length !== 11) {
      throw new Error('CPF precisa ter 11 dígitos para cifrar');
    }
    return this.encrypt(digits, `user:cpf:${userId}`);
  }

  /** Decifra e mascara o CPF (`***.456.789-**`) sem nunca propagar erro em listagens. */
  decryptCpfMasked(
    cpfEncrypted: string | null | undefined,
    userId: string,
  ): string | null {
    if (!cpfEncrypted) return null;
    try {
      const digits = this.decrypt(cpfEncrypted, `user:cpf:${userId}`);
      return maskCpf(digits);
    } catch {
      return null;
    }
  }

  private cachedPepper: { raw: string; key: Buffer } | null = null;
  private cachedEncryption: { raw: string; key: Buffer } | null = null;

  private resolvePepperKey(): Buffer {
    const raw = process.env.CPF_PEPPER_KEY?.trim();
    if (raw) {
      if (this.cachedPepper?.raw === `env:${raw}`) return this.cachedPepper.key;
      if (raw.length < MIN_SECRET_LENGTH) {
        throw new Error(
          `CPF_PEPPER_KEY inválida: defina pelo menos ${MIN_SECRET_LENGTH} caracteres.`,
        );
      }
      const key = this.toKeyBytes(raw);
      this.cachedPepper = { raw: `env:${raw}`, key };
      return key;
    }
    const jwtSecret = getJwtSecret();
    if (this.cachedPepper?.raw === `jwt:${jwtSecret}`) {
      return this.cachedPepper.key;
    }
    if (process.env.NODE_ENV === 'production' && !this.warnedPepperFallback) {
      this.warnedPepperFallback = true;
      this.log.warn(
        'CPF_PEPPER_KEY não definida no .env — derivando chave via HKDF a partir de JWT_SECRET. Defina uma chave dedicada em produção.',
      );
    }
    const key = Buffer.from(
      hkdfSync('sha256', jwtSecret, 'ritmo:cpf-pepper:v1', 'cpf-hmac', 32),
    );
    this.cachedPepper = { raw: `jwt:${jwtSecret}`, key };
    return key;
  }

  private resolveEncryptionKey(): Buffer {
    const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
    if (raw) {
      if (this.cachedEncryption?.raw === `env:${raw}`) {
        return this.cachedEncryption.key;
      }
      if (raw.length < MIN_SECRET_LENGTH) {
        throw new Error(
          `DATA_ENCRYPTION_KEY inválida: defina pelo menos ${MIN_SECRET_LENGTH} caracteres.`,
        );
      }
      const key = this.toKeyBytes(raw);
      this.cachedEncryption = { raw: `env:${raw}`, key };
      return key;
    }
    const jwtSecret = getJwtSecret();
    if (this.cachedEncryption?.raw === `jwt:${jwtSecret}`) {
      return this.cachedEncryption.key;
    }
    if (process.env.NODE_ENV === 'production' && !this.warnedEncryptionFallback) {
      this.warnedEncryptionFallback = true;
      this.log.warn(
        'DATA_ENCRYPTION_KEY não definida no .env — derivando chave via HKDF a partir de JWT_SECRET. Defina uma chave dedicada em produção.',
      );
    }
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        jwtSecret,
        'ritmo:data-enc:v1',
        'aes-256-gcm',
        32,
      ),
    );
    this.cachedEncryption = { raw: `jwt:${jwtSecret}`, key };
    return key;
  }

  private toKeyBytes(secret: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(secret)) {
      return Buffer.from(secret, 'hex');
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
