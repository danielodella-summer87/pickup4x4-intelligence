import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { listKoreStock } from "../service.ts";
import { fetchKoreStock } from "../stock.ts";
import type { KoreStock, KoreStockFilters } from "../stock.ts";
import { childElements, escapeXml, firstChildElement, parseXml, textContent } from "../xml.ts";
import {
  FAKE_ENV,
  FAKE_SECRET,
  assertKoreError,
  assertNoSecret,
  mockFetch,
  readFixture,
  xmlResponse,
} from "./helpers.ts";
import type { RecordedCall } from "./helpers.ts";

const OK = readFixture("listar-stock.ok.xml");
const VENDEDORES = readFixture("listar-vendedores.ok.xml");
const ANY_FILTER: KoreStockFilters = { codigoUnicoInicial: "SINT-ST-01", codigoUnicoFinal: "SINT-ST-01" };
const c = (v: string) => v.padEnd(22);
const u = (v: string) => v.padEnd(10);
const n = (v: string) => v.padEnd(30);

/** Datos sintéticos distintivos: nunca deben aparecer en errores. */
const MARKERS = ["SINT-ST", "UBICACION SINTETICA", "UB-1", "000123", "-3.5"];

function soap12Response(body: string, status = 200): Response {
  return xmlResponse(body, status, { "content-type": "application/soap+xml; charset=utf-8" });
}

function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => soap12Response(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

async function stockFrom(xml: string, filters: KoreStockFilters = ANY_FILTER): Promise<KoreStock[]> {
  return fetchKoreStock(clientFor(xml).client, filters);
}

async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

/** Reemplaza `search` solo dentro de la fila `row` (base 1). */
function inRow(xml: string, row: number, search: string, replacement: string): string {
  const start = xml.indexOf(`<Stock diffgr:id="Stock${row}"`);
  const end = xml.indexOf("</Stock>", start);
  const block = xml.slice(start, end);
  assert.ok(start >= 0 && block.includes(search), `el fixture no contiene ${search} en la fila ${row}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

function assertNoRowData(error: unknown): void {
  const text = [String(error), error instanceof Error ? (error.stack ?? "") : "", JSON.stringify(error), inspect(error, { depth: 10, showHidden: true })].join("\n");
  for (const marker of MARKERS) assert.ok(!text.includes(marker), "dato de fila en el error");
}

async function invalid(xml: string, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(stockFrom(xml)), "invalid_data");
  assert.equal(error.message, message);
  assertNoRowData(error);
  assertNoSecret(error);
}

function sentDataFields(call: RecordedCall): [string, string][] {
  const envelope = parseXml(String(call.init.body));
  const operation = firstChildElement(firstChildElement(envelope, "Body")!, "ListarStock")!;
  const data = childElements(firstChildElement(operation, "doc")!)[0];
  assert.equal(data.name, "Data");
  assert.deepEqual({ ...data.attributes }, {});
  return childElements(data).map((child) => {
    assert.equal(child.prefix, null, "los hijos de Data van sin namespace");
    assert.deepEqual({ ...child.attributes }, {});
    return [child.name, textContent(child)];
  });
}

async function requestFor(filters: KoreStockFilters): Promise<RecordedCall> {
  const { client, calls } = clientFor(OK);
  await fetchKoreStock(client, filters);
  assert.equal(calls.length, 1);
  return calls[0];
}

describe("ListarStock: filtros y request", () => {
  it("solo codigoUnicoInicial", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "SINT-ST-01" })).slice(2), [["CodigoUnicoInicial", "SINT-ST-01"]]);
  });

  it("solo codigoUnicoFinal", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-ST-01" })).slice(2), [["CodigoUnicoFinal", "SINT-ST-01"]]);
  });

  it("ambos códigos, en orden estable, con tags exactos", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-ST-99", codigoUnicoInicial: "SINT-ST-01" })), [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["CodigoUnicoInicial", "SINT-ST-01"],
      ["CodigoUnicoFinal", "SINT-ST-99"],
    ]);
  });

  it("solo nroEstado", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroEstado: 3 })).slice(2), [["NroEstado", "3"]]);
  });

  it("nroEstado 0 es un filtro efectivo", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroEstado: 0 })).slice(2), [["NroEstado", "0"]]);
  });

  it("código + nroEstado, en orden estable", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroEstado: 2, codigoUnicoInicial: "SINT-ST-01", codigoUnicoFinal: "SINT-ST-01" })).slice(2), [
      ["CodigoUnicoInicial", "SINT-ST-01"],
      ["CodigoUnicoFinal", "SINT-ST-01"],
      ["NroEstado", "2"],
    ]);
  });

  it("input nroEstado es Integer: no se impone el rango 0..255 del output", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroEstado: -1 })).slice(2), [["NroEstado", "-1"]]);
    assert.deepEqual(sentDataFields(await requestFor({ nroEstado: 256 })).slice(2), [["NroEstado", "256"]]);
  });

  it("código whitespace junto a nroEstado: solo se envía NroEstado", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "   ", nroEstado: 1 })).slice(2), [["NroEstado", "1"]]);
  });

  it("ceros iniciales preservados como string", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "000123", codigoUnicoFinal: "000123" })).slice(2), [
      ["CodigoUnicoInicial", "000123"],
      ["CodigoUnicoFinal", "000123"],
    ]);
  });

  it("escapa caracteres especiales y conserva el valor exacto", async () => {
    const codigo = `A&B<C>"D'`;
    const call = await requestFor({ codigoUnicoInicial: codigo });
    const body = String(call.init.body);
    assert.ok(!body.includes(codigo));
    assert.ok(body.includes(escapeXml(codigo)));
    assert.deepEqual(sentDataFields(call).slice(2), [["CodigoUnicoInicial", codigo]]);
  });

  it("usa SOAP 1.2 (envelope 2003/05 y action en Content-Type, sin SOAPAction)", async () => {
    const call = await requestFor(ANY_FILTER);
    const envelope = parseXml(String(call.init.body));
    assert.equal(envelope.attributes["xmlns:soap"], "http://www.w3.org/2003/05/soap-envelope");
    assert.equal(envelope.attributes["xmlns:soapenv"], undefined);
    assert.deepEqual(call.init.headers, { "Content-Type": 'application/soap+xml; charset=utf-8; action="http://tempuri.org/ListarStock"' });
  });

  it("el resto de operaciones sigue en SOAP 1.1 por defecto con el mismo cliente", async () => {
    const { fetchImpl, calls } = mockFetch(({ init }) => soap12Response(String(init.body).includes("ListarStock") ? OK : VENDEDORES));
    const client = createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl });
    await fetchKoreStock(client, ANY_FILTER);
    await client.call("ListarVendedores");
    assert.deepEqual(calls[1].init.headers, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/ListarVendedores"' });
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["filters null", null, /inválidos/],
    ["objeto vacío", {}, /requires at least one filter/],
    ["undefined", undefined, /requires at least one filter/],
    ['códigos ""', { codigoUnicoInicial: "", codigoUnicoFinal: "" }, /requires at least one filter/],
    ["códigos whitespace como único filtro", { codigoUnicoInicial: "   ", codigoUnicoFinal: "\t" }, /requires at least one filter/],
    ["código de más de 22 caracteres", { codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["código no string", { codigoUnicoFinal: 123 }, /debe ser texto/],
    ["código null", { codigoUnicoInicial: null }, /debe ser texto/],
    ["nroEstado string", { nroEstado: "1" }, /entero seguro/],
    ["nroEstado decimal", { nroEstado: 1.5 }, /entero seguro/],
    ["nroEstado NaN", { nroEstado: Number.NaN }, /entero seguro/],
    ["nroEstado Infinity", { nroEstado: Number.POSITIVE_INFINITY }, /entero seguro/],
    ["nroEstado -Infinity", { nroEstado: Number.NEGATIVE_INFINITY }, /entero seguro/],
    ["nroEstado unsafe integer", { nroEstado: 2 ** 53 }, /entero seguro/],
    ["nroEstado null", { nroEstado: null }, /entero seguro/],
    ["nroEstado inválido junto a código válido", { codigoUnicoInicial: "SINT-ST-01", nroEstado: "2" }, /entero seguro/],
    ["clave desconocida", { codigoUnico: "SINT-ST-01" }, /desconocido/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKoreStock con ${label} → invalid_argument antes de env/fetch`, async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return soap12Response(OK);
      }) as typeof fetch;
      let error: unknown;
      try {
        // Sin options.env: si la validación no ocurriera antes, fallaría por config (process.env sin KORE_*).
        await listKoreStock(filters as KoreStockFilters);
      } catch (caught) {
        error = caught;
      } finally {
        globalThis.fetch = originalFetch;
      }
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });

    it(`fetchKoreStock con ${label} → invalid_argument sin fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(await errorFrom(fetchKoreStock(client, filters as KoreStockFilters)), "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarStock → KoreStock[]", () => {
  it("1/4. fila completa: raw con padding preservado y normalizado = trim", async () => {
    const [row] = await stockFrom(OK);
    assert.deepEqual<KoreStock>(row, {
      codigoUnicoRaw: c("SINT-ST-01"),
      codigoUnico: "SINT-ST-01",
      cantidad: 12,
      codigoUbicacionRaw: u("UB-1"),
      codigoUbicacion: "UB-1",
      nroEstado: 1,
      ubicacionRaw: n("UBICACION SINTETICA A"),
      ubicacion: "UBICACION SINTETICA A",
    });
    assert.deepEqual(Object.keys(row), ["codigoUnicoRaw", "codigoUnico", "cantidad", "codigoUbicacionRaw", "codigoUbicacion", "nroEstado", "ubicacionRaw", "ubicacion"]);
  });

  it("no exige anchos fijos (22/10/30 son solo observados)", async () => {
    const xml = inRow(inRow(inRow(OK, 1, `<CODIGOUNICO>${c("SINT-ST-01")}</CODIGOUNICO>`, "<CODIGOUNICO>SINT-ST-01</CODIGOUNICO>"), 1, `<CODIGOUBICACION>${u("UB-1")}</CODIGOUBICACION>`, "<CODIGOUBICACION>UB-1</CODIGOUBICACION>"), 1, `<UBICACION>${n("UBICACION SINTETICA A")}</UBICACION>`, "<UBICACION>UBICACION SINTETICA A</UBICACION>");
    const [row] = await stockFrom(xml);
    assert.deepEqual([row.codigoUnicoRaw, row.codigoUbicacionRaw, row.ubicacionRaw], ["SINT-ST-01", "UB-1", "UBICACION SINTETICA A"]);
  });

  it("2. múltiples filas del mismo artículo, en orden", async () => {
    const rows = await stockFrom(OK);
    assert.equal(rows.length, 6);
    assert.equal(rows.filter((r) => r.codigoUnico === "SINT-ST-01").length, 4);
  });

  it("3/15. misma ubicación con dos estados: ambas filas preservadas, (codigo, ubicacion) no se trata como única", async () => {
    const [first, second] = await stockFrom(OK);
    assert.deepEqual([first.codigoUnico, first.codigoUbicacion, first.nroEstado], ["SINT-ST-01", "UB-1", 1]);
    assert.deepEqual([second.codigoUnico, second.codigoUbicacion, second.nroEstado], ["SINT-ST-01", "UB-1", 2]);
  });

  it("5. CANTIDAD negativa, cero, positiva y decimal, sin redondear", async () => {
    const rows = await stockFrom(OK);
    assert.deepEqual([rows[0].cantidad, rows[1].cantidad, rows[2].cantidad, rows[3].cantidad], [12, -3.5, 0, 0.25]);
  });

  it("5. CANTIDAD con exponente y padding se parsea como double", async () => {
    const [row] = await stockFrom(inRow(OK, 1, "<CANTIDAD>12</CANTIDAD>", "<CANTIDAD> -1.25E2 </CANTIDAD>"));
    assert.equal(row.cantidad, -125);
  });

  it("6/9/8. campos opcionales ausentes → null (raw y normalizado)", async () => {
    const [, , , , absent] = await stockFrom(OK);
    assert.deepEqual(absent, {
      codigoUnicoRaw: c("000123"),
      codigoUnico: "000123",
      cantidad: null,
      codigoUbicacionRaw: null,
      codigoUbicacion: null,
      nroEstado: null,
      ubicacionRaw: null,
      ubicacion: null,
    });
  });

  for (const [label, value] of [["vacía", ""], ["whitespace", "   "], ["NaN", "NaN"], ["INF", "INF"], ["Infinity", "Infinity"], ["-Infinity", "-Infinity"], ["desborde a Infinity", "1e400"], ["texto", "DOCE"], ["coma decimal", "1,5"], ["hexadecimal", "0x10"]] as const) {
    it(`7. CANTIDAD ${label} → invalid_data`, async () => {
      await invalid(inRow(OK, 2, "<CANTIDAD>-3.5</CANTIDAD>", `<CANTIDAD>${value}</CANTIDAD>`), "Stock row 2: invalid CANTIDAD");
    });
  }

  it("8. CODIGOUBICACION vacío → raw \"\" y normalizado \"\"", async () => {
    const [, , empty] = await stockFrom(OK);
    assert.deepEqual([empty.codigoUbicacionRaw, empty.codigoUbicacion], ["", ""]);
  });

  it("8. CODIGOUBICACION whitespace → raw preservado y normalizado \"\"", async () => {
    const [, , , ws] = await stockFrom(OK);
    assert.deepEqual([ws.codigoUbicacionRaw, ws.codigoUbicacion], ["     ", ""]);
  });

  it("9. UBICACION whitespace → raw preservado y normalizado \"\"", async () => {
    const [, , ws] = await stockFrom(OK);
    assert.deepEqual([ws.ubicacionRaw, ws.ubicacion], ["   ", ""]);
  });

  it("9. UBICACION vacía → raw \"\" y normalizado \"\"", async () => {
    const [, , , empty] = await stockFrom(OK);
    assert.deepEqual([empty.ubicacionRaw, empty.ubicacion], ["", ""]);
  });

  it("10. NROESTADO 0 y 255 son válidos (xs:unsignedByte)", async () => {
    const [, , zero, max] = await stockFrom(OK);
    assert.equal(zero.nroEstado, 0);
    assert.equal(max.nroEstado, 255);
  });

  for (const [label, value] of [["negativo", "-1"], ["-0", "-0"], ["256", "256"], ["decimal", "1.5"], ["decimal .0", "1.0"], ["texto", "UNO"], ["vacío", ""], ["whitespace", "  "], ["exponente", "1e2"], ["enorme", "99999999999999999999"]] as const) {
    it(`10. NROESTADO ${label} → invalid_data`, async () => {
      await invalid(inRow(OK, 2, "<NROESTADO>2</NROESTADO>", `<NROESTADO>${value}</NROESTADO>`), "Stock row 2: invalid NROESTADO");
    });
  }

  it("11. CODIGOUNICO ausente → invalid_data", async () => {
    await invalid(inRow(OK, 2, `<CODIGOUNICO>${c("SINT-ST-01")}</CODIGOUNICO>`, ""), "Stock row 2: missing CODIGOUNICO");
  });

  it("11. CODIGOUNICO whitespace-only → invalid_data", async () => {
    await invalid(inRow(OK, 2, `<CODIGOUNICO>${c("SINT-ST-01")}</CODIGOUNICO>`, `<CODIGOUNICO>${c("")}</CODIGOUNICO>`), "Stock row 2: missing CODIGOUNICO");
  });

  it("11. CODIGOUNICO vacío → invalid_data", async () => {
    await invalid(inRow(OK, 2, `<CODIGOUNICO>${c("SINT-ST-01")}</CODIGOUNICO>`, "<CODIGOUNICO />"), "Stock row 2: missing CODIGOUNICO");
  });

  it("CODIGOUNICO con ceros iniciales se preserva como string", async () => {
    const [, , , zeros] = await stockFrom(OK);
    assert.equal(zeros.codigoUnico, "000123");
  });

  it("12. campo desconocido → invalid_data", async () => {
    await invalid(inRow(OK, 3, "<NROESTADO>0</NROESTADO>", "<NROESTADO>0</NROESTADO><DISPONIBLE>UBICACION SINTETICA X</DISPONIBLE>"), "Stock row 3: unexpected field DISPONIBLE");
  });

  it("campo repetido → invalid_data", async () => {
    await invalid(inRow(OK, 1, "<CANTIDAD>12</CANTIDAD>", "<CANTIDAD>12</CANTIDAD><CANTIDAD>-3.5</CANTIDAD>"), "Stock row 1: repeated field CANTIDAD");
  });

  it("13. tabla inesperada con filas → invalid_data", async () => {
    await invalid(OK.replace("</NewDataSet>", '<Ubicacion diffgr:id="Ubicacion1" msdata:rowOrder="0"><CODIGOUBICACION>UB-1</CODIGOUBICACION></Ubicacion></NewDataSet>'), "Unexpected KORE dataset entity: Ubicacion");
  });

  it("13. tabla inesperada solo en el esquema → invalid_data", async () => {
    await invalid(OK.replace("</xs:choice>", '<xs:element name="StockReservado"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), "Unexpected KORE dataset entity: StockReservado");
  });

  it("14. filas idénticas repetidas se preservan en orden, sin deduplicar", async () => {
    const rows = await stockFrom(OK);
    assert.deepEqual(rows[5], rows[0]);
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await stockFrom(OK.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });
});

describe("ListarStock: API pública y privacidad", () => {
  it("listKoreStock usa la config del env y hace 1 request", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(OK));
    const rows = await listKoreStock(ANY_FILTER, { env: FAKE_ENV, fetchImpl });
    assert.equal(rows.length, 6);
    assert.equal(calls.length, 1);
  });

  it("SOAP 1.2 Fault que repite filtros y secreto → detalle omitido", async () => {
    const fault = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="en">ECO-KORE SINT-ST-01 estado 77 ${escapeXml(FAKE_SECRET)}</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
    const { client, calls } = clientFor(fault, 500);
    const error = assertKoreError(await errorFrom(fetchKoreStock(client, { ...ANY_FILTER, nroEstado: 77 })), "soap_fault");
    assert.equal(calls.length, 1, "sin reintentos");
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    const text = [error.message, error.stack ?? "", JSON.stringify(error), inspect(error, { showHidden: true })].join("\n");
    assert.ok(!text.includes("ECO-KORE") && !text.includes("SINT-ST-01") && !text.includes("77"));
    assertNoSecret(error);
  });

  it("solo filtro nroEstado también omite el detalle remoto", async () => {
    const fault = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text>ECO-KORE estado 77</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
    const error = assertKoreError(await errorFrom(fetchKoreStock(clientFor(fault, 500).client, { nroEstado: 77 })), "soap_fault");
    assert.ok(!error.message.includes("ECO-KORE"));
  });
});
