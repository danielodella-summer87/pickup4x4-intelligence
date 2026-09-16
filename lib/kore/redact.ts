import { escapeXml } from "./xml.ts";

export const REDACTED = "[REDACTED]";

/**
 * Secretos más cortos que esto no se reemplazan literalmente (evita destruir
 * mensajes al enmascarar valores triviales); igual se enmascara cualquier
 * `<SecretKey>…</SecretKey>` que aparezca en el texto.
 */
const MIN_SECRET_LENGTH = 6;

export type Redactor = (text: string) => string;

export function createRedactor(secrets: readonly string[]): Redactor {
  const needles = [
    ...new Set(
      secrets
        .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
        .flatMap((secret) => [secret, escapeXml(secret), encodeURIComponent(secret)]),
    ),
  ].sort((a, b) => b.length - a.length);

  return (text: string): string => {
    let out = String(text);
    for (const needle of needles) {
      out = out.split(needle).join(REDACTED);
    }
    return out.replace(/(<SecretKey>)[\s\S]*?(<\/SecretKey>)/gi, `$1${REDACTED}$2`);
  };
}
