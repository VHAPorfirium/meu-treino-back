import {
  isValidCpf,
  isValidUsername,
  maskCpf,
  maskIdentifier,
  normalizeCpf,
  normalizeUsername,
  suggestUsernameFromName,
  validateStrongPassword,
} from './cpf-and-password';
import { CryptoService } from './crypto.service';

describe('cpf-and-password & CryptoService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('CPF (módulo 11 e mascaramento)', () => {
    it('aceita CPFs válidos com ou sem pontuação e rejeita inválidos / dígitos repetidos', () => {
      expect(isValidCpf('52998224725')).toBe(true);
      expect(isValidCpf('529.982.247-25')).toBe(true);
      expect(isValidCpf('11144477735')).toBe(true);

      expect(isValidCpf('52998224726')).toBe(false);
      expect(isValidCpf('00000000000')).toBe(false);
      expect(isValidCpf('111.111.111-11')).toBe(false);
      expect(isValidCpf('12345')).toBe(false);
      expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
      expect(maskCpf('52998224725')).toBe('***.982.247-**');
    });
  });

  describe('Política de senha forte', () => {
    it('exige 8+ caracteres com letra, número e caractere especial', () => {
      expect(validateStrongPassword('Treino@1')).toEqual({ valid: true });
      expect(validateStrongPassword('Senh@Forte2026!')).toEqual({ valid: true });

      expect(validateStrongPassword('Ab1!567').valid).toBe(false); // < 8 chars
      expect(validateStrongPassword('12345678!').valid).toBe(false); // sem letra
      expect(validateStrongPassword('TreinoForte!').valid).toBe(false); // sem número
      expect(validateStrongPassword('Treino1234').valid).toBe(false); // sem especial
      expect(validateStrongPassword('1234').valid).toBe(false); // PIN legado
    });
  });

  describe('Username (primeiro.ultimo) e mascaramento de identificador', () => {
    it('sugere primeiro.ultimo sem acentos nem preposições', () => {
      expect(suggestUsernameFromName('Gabriel Aparecido da Silva')).toBe('gabriel.silva');
      expect(suggestUsernameFromName('João Pedro de Araújo')).toBe('joao.araujo');
      expect(suggestUsernameFromName('  Ninfa  ')).toBe('ninfa');
      expect(normalizeUsername('  Maria..Silva! ')).toBe('maria.silva');
      expect(isValidUsername('gabriel.silva2')).toBe(true);
      expect(isValidUsername('a')).toBe(false);
    });

    it('mascara CPF e username para logs de acesso', () => {
      expect(maskIdentifier('529.982.247-25')).toBe('***.982.247-**');
      expect(maskIdentifier('gabriel.silva')).toBe('ga***a');
    });
  });

  describe('CryptoService (HMAC-SHA256 + AES-256-GCM)', () => {
    beforeEach(() => {
      process.env.CPF_PEPPER_KEY = 'a'.repeat(64);
      process.env.DATA_ENCRYPTION_KEY = 'b'.repeat(64);
    });

    it('gera blind index HMAC-SHA256 determinístico e sensível à pepper key', () => {
      const crypto = new CryptoService();
      const h1 = crypto.hashCpf('529.982.247-25');
      const h2 = crypto.hashCpf('52998224725');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64);
      expect(h1).not.toContain('52998224725');

      process.env.CPF_PEPPER_KEY = 'c'.repeat(64);
      expect(crypto.hashCpf('52998224725')).not.toBe(h1);
    });

    it('cifra e decifra CPF com AES-256-GCM, IV aleatório e rejeita AAD adulterado', () => {
      const crypto = new CryptoService();
      const enc1 = crypto.encryptCpf('529.982.247-25', 'user-1');
      const enc2 = crypto.encryptCpf('529.982.247-25', 'user-1');

      expect(enc1).not.toBe(enc2); // IV aleatório por cifragem
      expect(enc1).not.toContain('52998224725');
      expect(crypto.decryptCpfMasked(enc1, 'user-1')).toBe('***.982.247-**');
      // AAD diferente (tentativa de copiar ciphertext para outro usuário) falha
      expect(crypto.decryptCpfMasked(enc1, 'user-2')).toBeNull();
      expect(() => crypto.decrypt(enc1, 'user:cpf:user-2')).toThrow();
    });

    it('rejeita chaves explicitamente definidas mas curtas (< 32 chars)', () => {
      process.env.CPF_PEPPER_KEY = 'curta';
      const crypto = new CryptoService();
      expect(() => crypto.hashCpf('52998224725')).toThrow(/CPF_PEPPER_KEY/);
    });
  });
});
