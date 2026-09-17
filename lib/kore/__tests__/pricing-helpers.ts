import assert from "node:assert/strict";
import { inspect } from "node:util";
import { createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { childElements, firstChildElement, parseXml, textContent } from "../xml.ts";
import { FAKE_ENV, FAKE_SECRET, assertKoreError, assertNoSecret, mockFetch, xmlResponse } from "./helpers.ts";
import type { RecordedCall } from "./helpers.ts";

/** Utilidades compartidas por los tests de operaciones KORE (SOAP 1.1/1.2 y fixtures sintéticas). */

export function soap12Response(body: string, status = 200): Response {
  return xmlResponse(body, status, { "content-type": "application/soap+xml; charset=utf-8" });
}

export function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => soap12Response(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

export async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

/** Reemplaza `search` solo dentro de la fila `row` (base 1) de la tabla `table`. */
export function inRow(xml: string, table: string, row: number, search: string, replacement: string): string {
  const start = xml.indexOf(`<${table} diffgr:id="${table}${row}"`);
  const end = xml.indexOf(`</${table}>`, start);
  const block = xml.slice(start, end);
  assert.ok(start >= 0 && block.includes(search), `el fixture no contiene ${search} en la fila ${row}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

export function assertNoMarkers(error: unknown, markers: readonly string[]): void {
  const text = [String(error), error instanceof Error ? (error.stack ?? "") : "", JSON.stringify(error), inspect(error, { depth: 10, showHidden: true })].join("\n");
  for (const marker of markers) assert.ok(!text.includes(marker), "dato de fila o filtro en el error");
  assertNoSecret(error);
}

export function sentDataFields(call: RecordedCall, operation: string): [string, string][] {
  const envelope = parseXml(String(call.init.body));
  const op = firstChildElement(firstChildElement(envelope, "Body")!, operation)!;
  const data = childElements(firstChildElement(op, "doc")!)[0];
  assert.equal(data.name, "Data");
  assert.deepEqual({ ...data.attributes }, {});
  return childElements(data).map((child) => {
    assert.equal(child.prefix, null, "los hijos de Data van sin namespace");
    assert.deepEqual({ ...child.attributes }, {});
    return [child.name, textContent(child)];
  });
}

export function assertSoap12Call(call: RecordedCall, operation: string): void {
  const envelope = parseXml(String(call.init.body));
  assert.equal(envelope.attributes["xmlns:soap"], "http://www.w3.org/2003/05/soap-envelope");
  assert.equal(envelope.attributes["xmlns:soapenv"], undefined);
  assert.deepEqual(call.init.headers, { "Content-Type": `application/soap+xml; charset=utf-8; action="http://tempuri.org/${operation}"` });
}

/** Ejecuta una llamada de servicio sin env ni fetchImpl: si la validación no fuera previa, fallaría por config o fetch. */
export async function serviceErrorWithoutNetwork(run: () => Promise<unknown>, body: string): Promise<{ error: unknown; fetchCalls: number }> {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return soap12Response(body);
  }) as typeof fetch;
  try {
    await run();
  } catch (error) {
    return { error, fetchCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.fail("se esperaba un error");
}

export function soap12FaultEcho(text: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="en">${text}</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
}

export { FAKE_SECRET, assertKoreError };

export function assertSoap11Call(call: RecordedCall, operation: string): void {
  const envelope = parseXml(String(call.init.body));
  assert.equal(envelope.attributes["xmlns:soapenv"], "http://schemas.xmlsoap.org/soap/envelope/");
  assert.equal(envelope.attributes["xmlns:soap"], undefined);
  assert.deepEqual(call.init.headers, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${operation}"` });
}
