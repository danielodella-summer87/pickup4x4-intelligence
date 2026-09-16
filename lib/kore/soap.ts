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
 * Sobre SOAP 1.1 de KoreStandard.asmx (document/literal, namespace tempuri).
 * Contrato verificado contra el WSDL real y la documentación oficial Kore Standard.
 */

export const KORE_SOAP_NAMESPACE = "http://tempuri.org/";
const SOAP11_ENVELOPE_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";

export const SOAP_FAULT_CODE_MAX_LENGTH = 100;
export const SOAP_FAULT_MESSAGE_MAX_LENGTH = 300;

export type SoapFault = { code: string; message: string };

export function soapActionFor(operation: KoreReadOnlyOperation): string {
  return `"${KORE_SOAP_NAMESPACE}${operation}"`;
}

/** `<Data>` sin namespace: KORE no lo reconoce si hereda tempuri. */
export function buildCredentialsDoc(companyNumber: string, secretKey: string): string {
  return (
    "<Data>" +
    `<NroEmpresa>${escapeXml(companyNumber)}</NroEmpresa>` +
    `<SecretKey>${escapeXml(secretKey)}</SecretKey>` +
    "</Data>"
  );
}

export function buildSoapEnvelope(operation: KoreReadOnlyOperation, docXml: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${SOAP11_ENVELOPE_NAMESPACE}" xmlns:tem="${KORE_SOAP_NAMESPACE}">` +
    "<soapenv:Header/>" +
    "<soapenv:Body>" +
    `<tem:${operation}><tem:doc>${docXml}</tem:doc></tem:${operation}>` +
    "</soapenv:Body>" +
    "</soapenv:Envelope>"
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

function readSoapFault(body: XmlElement, redact: Redactor): SoapFault | null {
  const fault = firstChildElement(body, "Fault");
  if (!fault) return null;
  const code = firstChildElement(fault, "faultcode");
  const message = firstChildElement(fault, "faultstring");
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
