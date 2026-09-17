import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKoreClient } from "../client.ts";
import type { KoreCallOptions } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { escapeXml, firstChildElement, parseXml } from "../xml.ts";
import { FAKE_ENV, FAKE_SECRET, assertKoreError, assertNoSecret, mockFetch, readFixture, xmlResponse } from "./helpers.ts";

const config = parseKoreConfig(FAKE_ENV);
const VENDEDORES = readFixture("listar-vendedores.ok.xml");
const SOAP12 = { soapVersion: "1.2" } as const satisfies KoreCallOptions;

async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

const soap12Fault = (text: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="en">${text}</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;

describe("transporte SOAP 1.2", () => {
  it("envelope 2003/05, Content-Type application/soap+xml con action y sin SOAPAction", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(VENDEDORES));
    await createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], SOAP12);
    assert.equal(calls.length, 1);
    const [{ init }] = calls;
    assert.deepEqual(init.headers, { "Content-Type": 'application/soap+xml; charset=utf-8; action="http://tempuri.org/ListarVendedores"' });
    assert.equal(init.redirect, "manual");
    const envelope = parseXml(String(init.body));
    assert.equal(envelope.name, "soap:Envelope");
    assert.equal(envelope.attributes["xmlns:soap"], "http://www.w3.org/2003/05/soap-envelope");
    assert.equal(envelope.attributes["xmlns:soapenv"], undefined);
    assert.ok(firstChildElement(envelope, "Header"));
    assert.equal(firstChildElement(firstChildElement(envelope, "Body")!, "ListarVendedores")!.name, "tem:ListarVendedores");
  });

  it("sin regresión: por defecto sigue siendo SOAP 1.1 (text/xml + SOAPAction, envelope xmlsoap)", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(VENDEDORES));
    await createKoreClient({ config, fetchImpl }).call("ListarVendedores");
    assert.deepEqual(calls[0].init.headers, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/ListarVendedores"' });
    assert.equal(parseXml(String(calls[0].init.body)).attributes["xmlns:soapenv"], "http://schemas.xmlsoap.org/soap/envelope/");
  });

  it("soapVersion explícito 1.1 equivale al default", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(VENDEDORES));
    await createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], { soapVersion: "1.1" });
    assert.equal((calls[0].init.headers as Record<string, string>).SOAPAction, '"http://tempuri.org/ListarVendedores"');
  });

  it("versión SOAP no soportada → invalid_argument sin fetch", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(VENDEDORES));
    const error = await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], { soapVersion: "2.0" } as unknown as KoreCallOptions));
    assertKoreError(error, "invalid_argument");
    assert.equal(calls.length, 0);
  });

  it("la allowlist se sigue validando antes que la versión SOAP", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(VENDEDORES));
    assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarComprobantes", [], SOAP12)), "operation_not_allowed");
    assert.equal(calls.length, 0);
  });

  it("SOAP 1.2 Fault (HTTP 500): Code/Value y Reason/Text parseados, secreto redactado", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(soap12Fault(`Error interno ${escapeXml(FAKE_SECRET)}`), 500, { "content-type": "application/soap+xml; charset=utf-8" }));
    const error = assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], SOAP12)), "soap_fault");
    assert.equal(error.faultCode, "soap:Receiver");
    assert.equal(error.httpStatus, 500);
    assert.match(error.message, /Error interno \[REDACTED\]/);
    assert.equal(calls.length, 1, "retry = 0");
    assertNoSecret(error);
  });

  it("SOAP 1.2 Fault con HTTP 200 también se detecta", async () => {
    const { fetchImpl } = mockFetch(() => xmlResponse(soap12Fault("fallo"), 200));
    const error = assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], SOAP12)), "soap_fault");
    assert.equal(error.faultCode, "soap:Receiver");
  });

  it("timeout aborta la llamada SOAP 1.2", async () => {
    const { fetchImpl, calls } = mockFetch(({ init }) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl, timeoutMs: 25 }).call("ListarVendedores", [], SOAP12)), "timeout");
    assert.equal(calls.length, 1);
  });

  it("redirect manual: 302 → http, un solo request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(null, 302, { location: "http://otro.invalid/" }));
    const error = assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], SOAP12)), "http");
    assert.equal(error.httpStatus, 302);
    assert.equal(calls.length, 1);
  });

  it("límite de respuesta aplicado también en SOAP 1.2", async () => {
    const { fetchImpl } = mockFetch(() => xmlResponse(VENDEDORES));
    assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl, maxResponseBytes: 10 }).call("ListarVendedores", [], SOAP12)), "response_too_large");
  });

  it("HTTP 503 sin Fault → http, sin reintentos", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse("<html/>", 503, { "content-type": "text/html" }));
    assertKoreError(await errorFrom(createKoreClient({ config, fetchImpl }).call("ListarVendedores", [], SOAP12)), "http");
    assert.equal(calls.length, 1);
  });
});
