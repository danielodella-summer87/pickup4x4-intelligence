import type { KoreConfig } from "./config.ts";
import { KoreError } from "./errors.ts";
import { assertReadOnlyOperation } from "./operations.ts";
import type { KoreReadOnlyOperation } from "./operations.ts";
import { createRedactor } from "./redact.ts";
import type { Redactor } from "./redact.ts";
import {
  buildCredentialsDoc,
  buildSoapEnvelope,
  extractOperationResult,
  soapActionFor,
  soapFaultError,
  tryReadSoapFault,
} from "./soap.ts";
import type { KoreDocField } from "./soap.ts";
import type { XmlElement } from "./xml.ts";

export type { KoreDocField } from "./soap.ts";

/**
 * Reemplazo del texto libre de KORE (faultcode/faultstring, detalle de red)
 * cuando la llamada envía filtros con PII: KORE podría repetirlos y un valor
 * corto (1–2 caracteres) no se puede enmascarar literalmente sin destruir el
 * mensaje, así que el texto externo se omite completo.
 */
export const KORE_SENSITIVE_DETAIL_OMITTED = "[detalle omitido: filtros con PII]";

/**
 * Cliente SOAP 1.1 genérico y READ-ONLY para KoreStandard.asmx.
 *
 * - Solo operaciones de la allowlist (se valida antes de salir a red).
 * - Un único POST por llamada: sin reintentos y sin seguir redirecciones
 *   (una redirección reenviaría las credenciales a otro destino).
 * - No loguea: expone metadatos de la respuesta vía `onResponse`, nunca el
 *   body enviado ni el recibido.
 */

export const KORE_DEFAULT_TIMEOUT_MS = 15_000;
export const KORE_DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
/** Sin reintentos en esta etapa. */
export const KORE_MAX_RETRIES = 0;

export type KoreFetch = (url: string, init: RequestInit) => Promise<Response>;

export type KoreResponseMeta = {
  operation: KoreReadOnlyOperation;
  httpStatus: number;
  contentType: string | null;
  bytes: number;
  durationMs: number;
};

export type KoreClientOptions = {
  config: KoreConfig;
  fetchImpl?: KoreFetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  onResponse?: (meta: KoreResponseMeta) => void;
};

export type KoreClient = {
  /**
   * Devuelve el elemento `<{operation}Result>` ya validado (sin Fault).
   * `docFields` agrega tags (filtros) dentro de `<Data>`, después de las credenciales.
   */
  call(operation: string, docFields?: readonly KoreDocField[]): Promise<XmlElement>;
};

function readCauseCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause: unknown = error.cause;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    const code = (cause as { code: unknown }).code;
    return typeof code === "string" ? code.slice(0, 40) : undefined;
  }
  return undefined;
}

function transportError(
  error: unknown,
  operation: KoreReadOnlyOperation,
  timeoutMs: number,
  redact: Redactor,
): KoreError {
  if (error instanceof KoreError) return error;

  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new KoreError({
      kind: "timeout",
      operation,
      message: `KORE no respondió dentro de ${timeoutMs} ms`,
    });
  }

  const detail = error instanceof Error ? redact(error.message).slice(0, 200) : "error desconocido";
  return new KoreError({
    kind: "network",
    operation,
    causeCode: readCauseCode(error),
    message: `Error de red al llamar a KORE: ${detail}`,
  });
}

function decodeBody(buffer: Uint8Array, contentType: string | null, operation: string): string {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "") || "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(buffer);
  } catch {
    throw new KoreError({
      kind: "parse",
      operation,
      message: "Charset de respuesta KORE no soportado",
    });
  }
}

function responseTooLarge(operation: string, maxResponseBytes: number): KoreError {
  return new KoreError({
    kind: "response_too_large",
    operation,
    message: `Respuesta KORE supera el máximo de ${maxResponseBytes} bytes`,
  });
}

/**
 * Lee el body contando los bytes realmente recibidos y corta la descarga al
 * superar el máximo, aunque Content-Length falte o sea incorrecto.
 */
async function readBodyWithLimit(
  response: Response,
  maxResponseBytes: number,
  operation: string,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel().catch(() => undefined);
      throw responseTooLarge(operation, maxResponseBytes);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createKoreClient(options: KoreClientOptions): KoreClient {
  const { config, onResponse } = options;
  const fetchImpl: KoreFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? KORE_DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? KORE_DEFAULT_MAX_RESPONSE_BYTES;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new KoreError({ kind: "config", message: "timeoutMs de KORE inválido" });
  }
  if (!Number.isFinite(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new KoreError({ kind: "config", message: "maxResponseBytes de KORE inválido" });
  }

  const redactSecret = createRedactor([config.secretKey]);

  async function call(
    operation: string,
    docFields: readonly KoreDocField[] = [],
  ): Promise<XmlElement> {
    assertReadOnlyOperation(operation);

    const requestBody = buildSoapEnvelope(
      operation,
      buildCredentialsDoc(config.companyNumber, config.secretKey, docFields),
    );

    // Con filtros PII en la llamada, ningún texto provisto por KORE llega a los errores.
    const hasSensitiveFields = docFields.some((field) => field.sensitive);
    const redact: Redactor = hasSensitiveFields ? () => KORE_SENSITIVE_DETAIL_OMITTED : redactSecret;
    const startedAt = Date.now();

    // Timer propio (no AbortSignal.timeout) para poder limpiarlo apenas termina
    // la llamada: aborta el fetch y la lectura del body, y no queda pendiente.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException(`Timeout de ${timeoutMs} ms`, "TimeoutError"));
    }, timeoutMs);

    let response: Response;
    let buffer: Uint8Array;
    try {
      response = await fetchImpl(config.baseUrl, {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapActionFor(operation),
        },
        body: requestBody,
        signal: controller.signal,
      });

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw responseTooLarge(operation, maxResponseBytes);
      }

      buffer = await readBodyWithLimit(response, maxResponseBytes, operation);
    } catch (error) {
      throw transportError(error, operation, timeoutMs, redact);
    } finally {
      clearTimeout(timer);
    }

    try {
      onResponse?.({
        operation,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        bytes: buffer.byteLength,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // Un observador que falla no debe alterar el resultado de la llamada.
    }

    const text = decodeBody(buffer, response.headers.get("content-type"), operation);

    if (response.status !== 200) {
      const fault = tryReadSoapFault(text, redact);
      if (fault) throw soapFaultError(fault, operation, response.status);
      const redirected = response.status >= 300 && response.status < 400;
      throw new KoreError({
        kind: "http",
        operation,
        httpStatus: response.status,
        message: `KORE respondió HTTP ${response.status}${redirected ? " (redirección no seguida)" : ""}`,
      });
    }

    return extractOperationResult(text, operation, redact);
  }

  return { call };
}
