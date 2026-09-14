import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // rota aberta ao tocar na notificação
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Web Push (VAPID). Fica DESABILITADO (no-op com aviso) se as chaves não estiverem
 * no ambiente — assim nada quebra em quem ainda não configurou push.
 *
 * Gerar chaves uma vez:  npx web-push generate-vapid-keys
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:... ou https://...)
 *
 * iOS só recebe push com o PWA instalado na tela inicial (16.4+).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly log = new Logger(PushService.name);
  private enabled = false;
  private publicKeyValue: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.enabled = true;
      this.publicKeyValue = pub;
      this.log.log('Web Push habilitado (VAPID).');
    } else {
      this.log.warn('Web Push DESABILITADO: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  publicKey(): string | null {
    return this.publicKeyValue;
  }

  /** Salva/atualiza a inscrição do dispositivo (endpoint é único). */
  async subscribe(userId: string, sub: SubscriptionInput) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return { ok: true, enabled: this.enabled };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  /**
   * Envia pra todos os dispositivos dos usuários. Best-effort: nunca lança;
   * inscrições mortas (404/410) são removidas.
   */
  async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
          } else {
            this.log.warn(`push falhou (${status ?? 'erro'}) para ${s.userId}`);
          }
        }
      }),
    );
  }
}
