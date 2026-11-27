import type { AccessLogDetailed } from '../../../shared/security/access-log.service';

const CSV_FORMULA_PREFIX_RE = /^\s*[=+\-@\t\r]/;

/**
 * Escapa uma célula conforme RFC-4180 e neutraliza CSV Formula Injection
 * (Excel / Google Sheets / LibreOffice) prefixando `'` quando inicia com
 * `=`, `+`, `-`, `@`, `\t` ou `\r`.
 */
export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw);
  if (CSV_FORMULA_PREFIX_RE.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const HEADER = [
  'data_hora_utc',
  'evento',
  'usuario',
  'ator',
  'identificador',
  'ip',
  'metodo',
  'rota',
  'status',
  'motivo',
  'duracao_ms',
  'request_id',
].join(',');

/** Serializa registros de `AccessLog` em CSV UTF-8 (com BOM para Excel pt-BR). */
export function formatAccessLogsCsv(items: AccessLogDetailed[]): string {
  const lines = [HEADER];
  for (const item of items) {
    const userLabel = item.user
      ? `${item.user.name} (${item.user.username})`
      : (item.userId ?? '');
    const actorLabel = item.actor
      ? `${item.actor.name} (${item.actor.username})`
      : (item.actorUserId ?? '');
    const isoDate =
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : String(item.createdAt);

    lines.push(
      [
        escapeCsvCell(isoDate),
        escapeCsvCell(item.event),
        escapeCsvCell(userLabel),
        escapeCsvCell(actorLabel),
        escapeCsvCell(item.identifierMasked),
        escapeCsvCell(item.ip),
        escapeCsvCell(item.method),
        escapeCsvCell(item.path),
        escapeCsvCell(item.statusCode),
        escapeCsvCell(item.reason),
        escapeCsvCell(item.durationMs),
        escapeCsvCell(item.requestId),
      ].join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
