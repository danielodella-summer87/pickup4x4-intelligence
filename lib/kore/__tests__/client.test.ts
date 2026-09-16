import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createKoreClient } from "../client.ts";
import type { KoreClientOptions, KoreResponseMeta } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { KORE_READ_ONLY_OPERATIONS } from "../operations.ts";
import { childElements, escapeXml, firstChildElement, parseXml, textContent } from "../xml.ts";
import {
  FAKE_BASE_URL,
  FAKE_COMPANY,
  FAKE_ENV,
  FAKE_SECRET,
  assertKoreError,
  assertNoSecret,
  mockFetch,
  readFixture,
  xmlResponse,
} from "./helpers.ts";

const config = parseKoreConfig(FAKE_ENV);

function client(overrides: Partial<KoreClientOptions> = {}) {
  return createKoreClient({ config, ...overrides });
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

describe("allowlist read-only", () => {
  it("solo habilita los 6 métodos de lectura esperados", () => {
    assert.deepEqual([...KORE_READ_ONLY_OPERATIONS], [
      "ListarVendedores",
      "ListarCuentas",
      "ListarArticulos",
      "ListarFamilias",
      "ListarGrupos",
      "ListarSubgrupos",
    ]);
  });

  const forbidden = [
    "ListarComprobantes",
    "ListarArticulosNuevos",
    "Login",
    "ABMCuenta",
    "AltaPedido",
    "CrearFactura",
    "AgregarImagenes",
    "MarcarPedidoPreparado",
    "listarvendedores",
    "ListarVendedores ",
    "",
  ];
  for (const operation of forbidden) {
    it(`rechaza "${operation}" antes de salir a red`, async () => {
      const { fetchImpl, calls } = mockFetch(() => xmlResponse(readFixture("listar-vendedores.ok.xml")));
      const error = await captureError(client({ fetchImpl }).call(operation));
      assertKoreError(error, "operation_not_allowed");
      assert.equal(calls.length, 0);
      assertNoSecret(error);
    });
  }
});

describe("request SOAP 1.1", () => {
  it("hace un único POST con headers, sobre y credenciales escapadas", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(readFixture("listar-vendedores.ok.xml")));
    await client({ fetchImpl }).call("ListarVendedores");

    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, FAKE_BASE_URL);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(init.headers, {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://tempuri.org/ListarVendedores"',
    });

    const body = String(init.body);
    assert.ok(body.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.ok(!body.includes(FAKE_SECRET), "el secreto debe viajar escapado");
    assert.ok(body.includes(escapeXml(FAKE_SECRET)));

    const envelope = parseXml(body);
    assert.equal(envelope.name, "soapenv:Envelope");
    assert.equal(envelope.attributes["xmlns:soapenv"], "http://schemas.xmlsoap.org/soap/envelope/");
    assert.equal(envelope.attributes["xmlns:tem"], "http://tempuri.org/");
    assert.ok(firstChildElement(envelope, "Header"));

    const operation = firstChildElement(firstChildElement(envelope, "Body")!, "ListarVendedores")!;
    assert.equal(operation.name, "tem:ListarVendedores");
    const doc = firstChildElement(operation, "doc")!;
    assert.equal(doc.name, "tem:doc");

    const [data] = childElements(doc);
    assert.equal(data.name, "Data");
    assert.equal(data.prefix, null);
    assert.deepEqual({ ...data.attributes }, {}, "Data no debe declarar namespace");
    assert.deepEqual(
      childElements(data).map((child) => [child.name, textContent(child)]),
      [
        ["NroEmpresa", FAKE_COMPANY],
        ["SecretKey", FAKE_SECRET],
      ],
    );
  });

  it("reporta metadatos de la respuesta sin el body", async () => {
    const metas: KoreResponseMeta[] = [];
    const fixture = readFixture("listar-vendedores.ok.xml");
    const { fetchImpl } = mockFetch(() => xmlResponse(fixture));
    await client({ fetchImpl, onResponse: (meta) => metas.push(meta) }).call("ListarVendedores");

    assert.equal(metas.length, 1);
    const [meta] = metas;
    assert.equal(meta.operation, "ListarVendedores");
    assert.equal(meta.httpStatus, 200);
    assert.equal(meta.bytes, Buffer.byteLength(fixture));
    assert.equal(meta.contentType, "text/xml; charset=utf-8");
    assert.ok(meta.durationMs >= 0);
    assert.deepEqual(Object.keys(meta).sort(), ["bytes", "contentType", "durationMs", "httpStatus", "operation"]);
  });
});

describe("errores tipados", () => {
  it("SOAP Fault (HTTP 500): tipado, truncado y con el secreto enmascarado", async () => {
    const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", escapeXml(FAKE_SECRET));
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(fault, 500));
    const error = await captureError(client({ fetchImpl }).call("ListarVendedores"));

    const koreError = assertKoreError(error, "soap_fault");
    assert.equal(koreError.faultCode, "soap:Server");
    assert.equal(koreError.httpStatus, 500);
    assert.match(koreError.message, /\[REDACTED\]/);
    assert.equal(calls.length, 1, "sin reintentos");
    assertNoSecret(error);
  });

  it("SOAP Fault con HTTP 200 también se detecta", async () => {
    const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", "x");
    const { fetchImpl } = mockFetch(() => xmlResponse(fault, 200));
    assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "soap_fault");
  });

  it("faultstring largo se trunca a 300 caracteres", async () => {
    const long = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", "A".repeat(2000));
    const { fetchImpl } = mockFetch(() => xmlResponse(long, 500));
    const error = assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "soap_fault");
    const faultText = error.message.slice(error.message.indexOf("): ") + 3);
    assert.ok(faultText.length <= 300);
  });

  it("enmascara también secretos alfanuméricos simples", async () => {
    const plainSecret = "abcdef0123456789abcdef0123456789";
    const plainConfig = parseKoreConfig({ ...FAKE_ENV, KORE_SECRET_KEY: plainSecret });
    const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", plainSecret);
    const { fetchImpl } = mockFetch(() => xmlResponse(fault, 500));
    const error = await captureError(createKoreClient({ config: plainConfig, fetchImpl }).call("ListarVendedores"));
    assertKoreError(error, "soap_fault");
    assertNoSecret(error, plainSecret);
  });

  it("HTTP != 200 sin Fault → http", async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      xmlResponse("<html>Service Unavailable</html>", 503, { "content-type": "text/html" }),
    );
    const error = assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "http");
    assert.equal(error.httpStatus, 503);
    assert.equal(calls.length, 1, "sin reintentos");
  });

  it("no sigue redirecciones: 302 → http, un solo request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(null, 302, { location: "http://otro.invalid/" }));
    const error = assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "http");
    assert.equal(error.httpStatus, 302);
    assert.match(error.message, /redirección no seguida/);
    assert.equal(calls.length, 1);
  });

  it("timeout → timeout, sin reintentos", async () => {
    const { fetchImpl, calls } = mockFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const error = await captureError(client({ fetchImpl, timeoutMs: 25 }).call("ListarVendedores"));
    assertKoreError(error, "timeout");
    assert.equal(calls.length, 1);
    assertNoSecret(error);
  });

  it("error de red → network, con código de causa y sin secreto", async () => {
    const { fetchImpl } = mockFetch(() => {
      throw new TypeError(`fetch failed for ${FAKE_SECRET}`, { cause: { code: "ECONNREFUSED" } });
    });
    const error = assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "network");
    assert.equal(error.causeCode, "ECONNREFUSED");
    assert.equal(error.cause, undefined, "no se adjunta el error original");
    assertNoSecret(error);
  });

  it("XML inválido → parse", async () => {
    const { fetchImpl } = mockFetch(() =>
      xmlResponse("<soap:Envelope><soap:Body><ListarVendedoresResponse></soap:Body></soap:Envelope>"),
    );
    assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "parse");
  });

  it("XML válido pero no SOAP → parse", async () => {
    const { fetchImpl } = mockFetch(() => xmlResponse("<html><body>ok</body></html>"));
    assertKoreError(await captureError(client({ fetchImpl }).call("ListarVendedores")), "parse");
  });

  it("respuesta mayor al máximo → response_too_large", async () => {
    const { fetchImpl } = mockFetch(() => xmlResponse(readFixture("listar-vendedores.ok.xml")));
    assertKoreError(
      await captureError(client({ fetchImpl, maxResponseBytes: 10 }).call("ListarVendedores")),
      "response_too_large",
    );
  });

  it("timeout inválido → config al crear el cliente", () => {
    assert.throws(() => client({ timeoutMs: 0 }), (error) => assertKoreError(error, "config") !== undefined);
  });
});

describe("límite de respuesta: bytes realmente recibidos", () => {
  it("sin Content-Length: corta un stream infinito y lo cancela", async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetchImpl } = mockFetch(
      () => new Response(stream, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } }),
    );
    const error = await captureError(client({ fetchImpl, maxResponseBytes: 4096 }).call("ListarVendedores"));
    assertKoreError(error, "response_too_large");
    assert.equal(cancelled, true, "la descarga debe cancelarse");
    assert.ok(pulls <= 10, "no debe seguir leyendo después del límite");
  });

  it("Content-Length incorrecto (menor al real): se miden los bytes recibidos", async () => {
    const fixture = readFixture("listar-vendedores.ok.xml");
    const { fetchImpl } = mockFetch(() => xmlResponse(fixture, 200, { "content-length": "10" }));
    assertKoreError(
      await captureError(client({ fetchImpl, maxResponseBytes: 1000 }).call("ListarVendedores")),
      "response_too_large",
    );
  });

  it("Content-Length declarado mayor al máximo: rechaza sin leer el body", async () => {
    const { fetchImpl } = mockFetch(() => xmlResponse("<x/>", 200, { "content-length": "999999" }));
    assertKoreError(
      await captureError(client({ fetchImpl, maxResponseBytes: 1000 }).call("ListarVendedores")),
      "response_too_large",
    );
  });

  it("una respuesta exactamente en el límite se acepta", async () => {
    const fixture = readFixture("listar-vendedores.ok.xml");
    const { fetchImpl } = mockFetch(() => xmlResponse(fixture));
    const result = await client({ fetchImpl, maxResponseBytes: Buffer.byteLength(fixture) }).call("ListarVendedores");
    assert.equal(result.localName, "ListarVendedoresResult");
  });
});

describe("timeout y timers", () => {
  const activeTimeouts = () => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;

  it("hay un timer activo durante la llamada (control de la medición)", async () => {
    const before = activeTimeouts();
    let during = -1;
    const { fetchImpl } = mockFetch(() => {
      during = activeTimeouts();
      return xmlResponse(readFixture("listar-vendedores.ok.xml"));
    });
    await client({ fetchImpl, timeoutMs: 60_000 }).call("ListarVendedores");
    assert.equal(during, before + 1);
  });

  const outcomes: [string, () => Response | Promise<Response>][] = [
    ["éxito", () => xmlResponse(readFixture("listar-vendedores.ok.xml"))],
    ["HTTP 503", () => xmlResponse("<html/>", 503, { "content-type": "text/html" })],
    ["SOAP Fault", () => xmlResponse(readFixture("soap-fault.xml"), 500)],
    ["XML inválido", () => xmlResponse("<a>")],
    ["error de red", () => Promise.reject(new TypeError("fetch failed"))],
  ];
  for (const [label, respond] of outcomes) {
    it(`no deja timers activos después de: ${label}`, async () => {
      const before = activeTimeouts();
      const { fetchImpl } = mockFetch(respond);
      await client({ fetchImpl, timeoutMs: 60_000 }).call("ListarVendedores").catch(() => undefined);
      assert.equal(activeTimeouts(), before);
    });
  }

  it("el timeout aborta la señal entregada a fetch", async () => {
    let signal: AbortSignal | undefined;
    const { fetchImpl } = mockFetch(({ init }) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
      });
    });
    assertKoreError(await captureError(client({ fetchImpl, timeoutMs: 25 }).call("ListarVendedores")), "timeout");
    assert.equal(signal?.aborted, true);
  });

  it("aborta un fetch real contra un servidor local que no responde", async () => {
    let socketClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      socketClosed = resolve;
    });
    const server = createServer((request) => {
      request.socket.on("close", () => socketClosed());
      // Nunca responde: solo el timeout del cliente puede terminar la llamada.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const localConfig = parseKoreConfig({
      ...FAKE_ENV,
      KORE_BASE_URL: `http://127.0.0.1:${port}/KoreStandard.asmx`,
    });

    try {
      const error = await captureError(createKoreClient({ config: localConfig, timeoutMs: 150 }).call("ListarVendedores"));
      assertKoreError(error, "timeout");
      assertNoSecret(error);

      let deadline: NodeJS.Timeout | undefined;
      await Promise.race([
        closed,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error("el socket no se cerró: fetch no abortado")), 2000);
        }),
      ]).finally(() => clearTimeout(deadline));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
