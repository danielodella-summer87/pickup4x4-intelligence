import { KoreError } from "./errors.ts";
import type { KoreReadOnlyOperation } from "./operations.ts";
import type { Redactor } from "./redact.ts";
import {
  XmlParseError,
  childElements,
  escapeXml,
  firstChildElement,
  parseXml,
  textContent,
} from "./xml.ts";
import type { XmlElement } from "./xml.ts";

/**
 * Sobres SOAP 1.1 (por defecto) y SOAP 1.2 de KoreStandard.asmx (document/literal,
 * namespace tempuri). Contrato verificado contra el WSDL real (bindings soap y
 * soap12) y la documentación oficial Kore Standard.
 */

export const KORE_SOAP_NAMESPACE = "http://tempuri.org/";
const SOAP11_ENVELOPE_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP12_ENVELOPE_NAMESPACE = "http://www.w3.org/2003/05/soap-envelope";

export type KoreSoapVersion = "1.1" | "1.2";
export const KORE_DEFAULT_SOAP_VERSION: KoreSoapVersion = "1.1";

export function isKoreSoapVersion(value: unknown): value is KoreSoapVersion {
  return value === "1.1" || value === "1.2";
}

export const SOAP_FAULT_CODE_MAX_LENGTH = 100;
export const SOAP_FAULT_MESSAGE_MAX_LENGTH = 300;

export type SoapFault = { code: string; message: string };

/**
 * Tag adicional dentro de `<Data>` (filtros de la operación). `sensitive`
 * marca valores con PII (RUT, nombre) para enmascararlos en errores.
 */
export type KoreDocField = {
  name: string;
  value: string;
  sensitive?: boolean;
};

const DOC_FIELD_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const RESERVED_DOC_FIELDS = new Set(["NroEmpresa", "SecretKey"]);

export function soapActionFor(operation: KoreReadOnlyOperation): string {
  return `"${KORE_SOAP_NAMESPACE}${operation}"`;
}

/**
 * Headers HTTP según versión SOAP. 1.1: `text/xml` + cabecera `SOAPAction`.
 * 1.2: `application/soap+xml` con la acción dentro del Content-Type (sin SOAPAction).
 */
export function soapRequestHeaders(
  operation: KoreReadOnlyOperation,
  soapVersion: KoreSoapVersion = KORE_DEFAULT_SOAP_VERSION,
): Record<string, string> {
  if (soapVersion === "1.2") {
    return {
      "Content-Type": `application/soap+xml; charset=utf-8; action=${soapActionFor(operation)}`,
    };
  }
  return {
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: soapActionFor(operation),
  };
}

/** `<Data>` sin namespace: KORE no lo reconoce si hereda tempuri. */
export function buildCredentialsDoc(
  companyNumber: string,
  secretKey: string,
  fields: readonly KoreDocField[] = [],
): string {
  const extra = fields.map((field) => {
    if (!DOC_FIELD_NAME.test(field.name) || RESERVED_DOC_FIELDS.has(field.name)) {
      throw new KoreError({ kind: "invalid_argument", message: "Tag de doc KORE inválido" });
    }
    return `<${field.name}>${escapeXml(field.value)}</${field.name}>`;
  });
  return (
    "<Data>" +
    `<NroEmpresa>${escapeXml(companyNumber)}</NroEmpresa>` +
    `<SecretKey>${escapeXml(secretKey)}</SecretKey>` +
    extra.join("") +
    "</Data>"
  );
}

export function buildSoapEnvelope(
  operation: KoreReadOnlyOperation,
  docXml: string,
  soapVersion: KoreSoapVersion = KORE_DEFAULT_SOAP_VERSION,
): string {
  const [prefix, namespace] =
    soapVersion === "1.2" ? ["soap", SOAP12_ENVELOPE_NAMESPACE] : ["soapenv", SOAP11_ENVELOPE_NAMESPACE];
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<${prefix}:Envelope xmlns:${prefix}="${namespace}" xmlns:tem="${KORE_SOAP_NAMESPACE}">` +
    `<${prefix}:Header/>` +
    `<${prefix}:Body>` +
    `<tem:${operation}><tem:doc>${docXml}</tem:doc></tem:${operation}>` +
    `</${prefix}:Body>` +
    `</${prefix}:Envelope>`
  );
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Redacta ANTES de truncar: un corte no puede dejar medio secreto visible. */
function sanitize(text: string, redact: Redactor, maxLength: number): string {
  return normalizeSpace(redact(text)).slice(0, maxLength);
}

function parseError(operation: string, message: string): KoreError {
  return new KoreError({ kind: "parse", operation, message });
}

function parseSoapBody(xmlText: string, operation: string): XmlElement {
  let envelope: XmlElement;
  try {
    envelope = parseXml(xmlText);
  } catch (error) {
    if (error instanceof XmlParseError) {
      throw parseError(operation, `Respuesta KORE no es XML válido: ${error.message}`);
    }
    throw error;
  }
  if (envelope.localName !== "Envelope") {
    throw parseError(operation, "Respuesta KORE sin SOAP Envelope");
  }
  const body = firstChildElement(envelope, "Body");
  if (!body) throw parseError(operation, "Respuesta KORE sin SOAP Body");
  return body;
}

/** SOAP 1.1: faultcode/faultstring. SOAP 1.2: Code/Value y Reason/Text. */
function readSoapFault(body: XmlElement, redact: Redactor): SoapFault | null {
  const fault = firstChildElement(body, "Fault");
  if (!fault) return null;
  const code12 = firstChildElement(fault, "Code");
  const reason12 = firstChildElement(fault, "Reason");
  const code = firstChildElement(fault, "faultcode") ?? (code12 && firstChildElement(code12, "Value"));
  const message = firstChildElement(fault, "faultstring") ?? (reason12 && firstChildElement(reason12, "Text"));
  return {
    code: sanitize(code ? textContent(code) : "", redact, SOAP_FAULT_CODE_MAX_LENGTH) || "desconocido",
    message: sanitize(message ? textContent(message) : "", redact, SOAP_FAULT_MESSAGE_MAX_LENGTH),
  };
}

export function soapFaultError(
  fault: SoapFault,
  operation: string,
  httpStatus?: number,
): KoreError {
  return new KoreError({
    kind: "soap_fault",
    operation,
    httpStatus,
    faultCode: fault.code,
    message: `KORE devolvió SOAP Fault (${fault.code}): ${fault.message}`,
  });
}

/** Para respuestas HTTP != 200: devuelve el Fault si el cuerpo es un SOAP Fault válido. */
export function tryReadSoapFault(xmlText: string, redact: Redactor): SoapFault | null {
  try {
    return readSoapFault(parseSoapBody(xmlText, ""), redact);
  } catch {
    return null;
  }
}

/**
 * Devuelve el elemento `<{operation}Result>`. Si KORE lo envía como XML
 * escapado (texto), lo parsea y lo devuelve con los nodos reales como hijos.
 */
export function extractOperationResult(
  xmlText: string,
  operation: KoreReadOnlyOperation,
  redact: Redactor,
): XmlElement {
  const body = parseSoapBody(xmlText, operation);

  const fault = readSoapFault(body, redact);
  if (fault) throw soapFaultError(fault, operation);

  const response = firstChildElement(body, `${operation}Response`);
  if (!response) throw parseError(operation, `Respuesta SOAP sin ${operation}Response`);

  const result = firstChildElement(response, `${operation}Result`);
  if (!result) throw parseError(operation, `Respuesta SOAP sin ${operation}Result`);

  if (childElements(result).length > 0) return result;

  const escaped = textContent(result).trim();
  if (!escaped.startsWith("<")) return result;

  try {
    return { ...result, children: [parseXml(escaped)] };
  } catch (error) {
    if (error instanceof XmlParseError) {
      throw parseError(operation, `${operation}Result escapado no es XML válido: ${error.message}`);
    }
    throw error;
  }
}
