import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Acesso server-side ao Supabase Storage (service_role — NUNCA vai pro front).
 * Padrão: a API só emite URLs ASSINADAS; o arquivo em si sobe/desce direto
 * entre o navegador e o Supabase, sem passar pela API.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (as mesmas do seed).
 */
@Injectable()
export class SupabaseStorageService {
  private readonly log = new Logger(SupabaseStorageService.name);
  private client: SupabaseClient | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      this.client = createClient(url, key, { auth: { persistSession: false } });
    } else {
      this.log.warn(
        'Supabase Storage DESABILITADO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
  }

  isEnabled() {
    return this.client !== null;
  }

  private storage() {
    if (!this.client) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado');
    }
    return this.client.storage;
  }

  /** URL assinada pra UPLOAD direto do navegador (PUT). Válida por ~2h (padrão do Supabase). */
  async signedUploadUrl(bucket: string, path: string) {
    const { data, error } = await this.storage()
      .from(bucket)
      .createSignedUploadUrl(path);
    if (error || !data) {
      this.log.error(`signedUploadUrl falhou: ${error?.message}`);
      throw new ServiceUnavailableException('Não foi possível preparar o upload');
    }
    return { signedUrl: data.signedUrl, token: data.token, path: data.path };
  }

  /** URL assinada pra LEITURA (bucket privado). */
  async signedReadUrl(bucket: string, path: string, expiresInSec = 3600) {
    const { data, error } = await this.storage()
      .from(bucket)
      .createSignedUrl(path, expiresInSec);
    if (error || !data) return null;
    return data.signedUrl;
  }

  /** URLs assinadas pra LEITURA em lote (evita N+1 HTTP na listagem de fotos). */
  async signedReadUrls(
    bucket: string,
    paths: string[],
    expiresInSec = 3600,
  ): Promise<Map<string, string | null>> {
    const urls = new Map<string, string | null>();
    if (paths.length === 0) return urls;

    const { data, error } = await this.storage()
      .from(bucket)
      .createSignedUrls(paths, expiresInSec);

    if (error || !data) {
      this.log.warn(`signedReadUrls falhou: ${error?.message ?? 'sem dados'}`);
      for (const path of paths) urls.set(path, null);
      return urls;
    }

    for (const item of data) {
      if (item.path) {
        urls.set(item.path, item.error ? null : (item.signedUrl ?? null));
      }
    }
    return urls;
  }

  async remove(bucket: string, paths: string[]) {
    if (!paths.length) return;
    const { error } = await this.storage().from(bucket).remove(paths);
    if (error) this.log.warn(`remove falhou: ${error.message}`);
  }
}
