import { isIP } from 'node:net';
import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Domínios oficiais dos provedores de Web Push usados pelos navegadores
 * (Chrome/Edge/Android/Brave/Opera, Firefox, Safari/iOS/macOS, WNS, Samsung).
 *
 * Restringir o endpoint a provedores confiáveis sobre HTTPS na porta padrão
 * bloqueia SSRF contra serviços internos (localhost, metadata cloud, Docker)
 * e contra domínios arbitrários controlados por atacantes.
 */
const DEFAULT_ALLOWED_PUSH_DOMAINS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
  'push.samsungosp.com',
] as const;

const FORBIDDEN_TLDS = ['.localhost', '.local', '.internal', '.lan', '.home', '.arpa'];

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function extraAllowedDomains(): string[] {
  const raw = process.env.PUSH_ALLOWED_HOSTS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter(
      (domain) =>
        domain.includes('.') &&
        isIP(domain) === 0 &&
        !FORBIDDEN_TLDS.some((tld) => domain.endsWith(tld)),
    );
}

/** Valida se o endpoint de Web Push é HTTPS público de um provedor permitido. */
export function isSafePushEndpoint(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1000) return false;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (!bareHost || isIP(bareHost) !== 0) return false;
  if (FORBIDDEN_TLDS.some((tld) => bareHost.endsWith(tld))) return false;

  const allowedDomains = [...DEFAULT_ALLOWED_PUSH_DOMAINS, ...extraAllowedDomains()];
  return allowedDomains.some((domain) => hostMatchesDomain(bareHost, domain));
}

export function IsSafePushEndpoint(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafePushEndpoint',
      target: object.constructor,
      propertyName,
      options: {
        message: 'endpoint de Web Push inválido ou não permitido',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return isSafePushEndpoint(value);
        },
      },
    });
  };
}
