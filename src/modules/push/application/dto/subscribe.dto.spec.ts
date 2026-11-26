import { ValidationPipe } from '@nestjs/common';
import { isSafePushEndpoint } from '../push-endpoint.validator';
import { SubscribeDto } from './subscribe.dto';

describe('isSafePushEndpoint & SubscribeDto', () => {
  const originalAllowedHosts = process.env.PUSH_ALLOWED_HOSTS;

  afterEach(() => {
    if (originalAllowedHosts === undefined) {
      delete process.env.PUSH_ALLOWED_HOSTS;
    } else {
      process.env.PUSH_ALLOWED_HOSTS = originalAllowedHosts;
    }
  });

  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const validKeys = {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  };

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/QBSomeToken',
    'https://wns2-bl2p.notify.windows.com/w/?token=xyz',
    'https://useast1.push.samsungosp.com/token',
  ])('aceita provedor oficial de Web Push: %s', (endpoint) => {
    expect(isSafePushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc123',
    'http://localhost:3000/api/health',
    'https://localhost/push',
    'http://127.0.0.1:3100/loki/api/v1/push',
    'https://127.0.0.1/push',
    'https://[::1]/push',
    'http://169.254.169.254/latest/meta-data/',
    'http://loki:3100/ready',
    'https://loki:3100/ready',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.com/push',
    'https://evil.com/fcm.googleapis.com',
  ])('rejeita endpoint inseguro/SSRF: %s', (endpoint) => {
    expect(isSafePushEndpoint(endpoint)).toBe(false);
  });

  it('aceita payload completo de PushSubscription.toJSON() com expirationTime: null', async () => {
    const result = await pipe.transform(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        expirationTime: null,
        keys: validKeys,
      },
      { type: 'body', metatype: SubscribeDto },
    );

    expect(result).toBeInstanceOf(SubscribeDto);
    expect(result.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc123');
    expect(result.keys.p256dh).toBe(validKeys.p256dh);
  });

  it('aceita payload sem expirationTime', async () => {
    const result = await pipe.transform(
      {
        endpoint: 'https://web.push.apple.com/token-ios',
        keys: validKeys,
      },
      { type: 'body', metatype: SubscribeDto },
    );

    expect(result).toBeInstanceOf(SubscribeDto);
  });

  it('rejeita payload sem keys com erro de validação (em vez de 500)', async () => {
    await expect(
      pipe.transform(
        { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
        { type: 'body', metatype: SubscribeDto },
      ),
    ).rejects.toThrow();
  });

  it('rejeita payload com keys vazias ou endpoint interno', async () => {
    await expect(
      pipe.transform(
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          keys: { p256dh: '', auth: '' },
        },
        { type: 'body', metatype: SubscribeDto },
      ),
    ).rejects.toThrow();

    await expect(
      pipe.transform(
        {
          endpoint: 'http://169.254.169.254/latest/meta-data/',
          keys: validKeys,
        },
        { type: 'body', metatype: SubscribeDto },
      ),
    ).rejects.toThrow();
  });
});
