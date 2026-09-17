import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { fetchKoreMarcasModelos } from "../marcas-modelos.ts";
import type { KoreMarcaModelo, KoreMarcaModeloFilters } from "../marcas-modelos.ts";
import { listKoreMarcasModelos } from "../service.ts";
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

const OK = readFixture("listar-marcas-modelos.ok.xml");
const ANY_FILTER: KoreMarcaModeloFilters = { codigoUnicoInicial: "SINT-MM-01", codigoUnicoFinal: "SINT-MM-01" };
const c = (v: string) => v.padEnd(22);
const t = (v: string) => v.padEnd(100);

/** Datos sintéticos distintivos: nunca deben aparecer en errores. */
const MARKERS = ["SINT-MM", "MARCA SINTETICA", "MODELO SINTETICO", "000123"];

function soap12Response(body: string, status = 200): Response {
  return xmlResponse(body, status, { "content-type": "application/soap+xml; charset=utf-8" });
}

function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => soap12Response(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

async function marcasModelosFrom(xml: string, filters: KoreMarcaModeloFilters = ANY_FILTER): Promise<KoreMarcaModelo[]> {
  return fetchKoreMarcasModelos(clientFor(xml).client, filters);
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
  const start = xml.indexOf(`<MarcaYModelo diffgr:id="MarcaYModelo${row}"`);
  const end = xml.indexOf("</MarcaYModelo>", start);
  const block = xml.slice(start, end);
  assert.ok(start >= 0 && block.includes(search), `el fixture no contiene ${search} en la fila ${row}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

function assertNoRowData(error: unknown): void {
  const text = [String(error), error instanceof Error ? (error.stack ?? "") : "", JSON.stringify(error), inspect(error, { depth: 10, showHidden: true })].join("\n");
  for (const marker of MARKERS) assert.ok(!text.includes(marker), "dato de fila en el error");
}

async function invalid(xml: string, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(marcasModelosFrom(xml)), "invalid_data");
  assert.equal(error.message, message);
  assertNoRowData(error);
  assertNoSecret(error);
}

function sentDataFields(call: RecordedCall): [string, string][] {
  const envelope = parseXml(String(call.init.body));
  const operation = firstChildElement(firstChildElement(envelope, "Body")!, "ListarMarcasModelos")!;
  const data = childElements(firstChildElement(operation, "doc")!)[0];
  assert.equal(data.name, "Data");
  assert.deepEqual({ ...data.attributes }, {});
  return childElements(data).map((child) => {
    assert.equal(child.prefix, null, "los hijos de Data van sin namespace");
    assert.deepEqual({ ...child.attributes }, {});
    return [child.name, textContent(child)];
  });
}

async function requestFor(filters: KoreMarcaModeloFilters): Promise<RecordedCall> {
  const { client, calls } = clientFor(OK);
  await fetchKoreMarcasModelos(client, filters);
  assert.equal(calls.length, 1);
  return calls[0];
}

describe("ListarMarcasModelos: filtros y request", () => {
  it("solo codigoUnicoInicial", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "SINT-MM-01" })).slice(2), [["CodigoUnicoInicial", "SINT-MM-01"]]);
  });

  it("solo codigoUnicoFinal", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-MM-01" })).slice(2), [["CodigoUnicoFinal", "SINT-MM-01"]]);
  });

  it("ambos, en orden estable, con tags exactos", async () => {
    const fields = sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-MM-99", codigoUnicoInicial: "SINT-MM-01" }));
    assert.deepEqual(fields, [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["CodigoUnicoInicial", "SINT-MM-01"],
      ["CodigoUnicoFinal", "SINT-MM-99"],
    ]);
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
    assert.equal(parseXml(String(call.init.body)).attributes["xmlns:soap"], "http://www.w3.org/2003/05/soap-envelope");
    assert.deepEqual(call.init.headers, { "Content-Type": 'application/soap+xml; charset=utf-8; action="http://tempuri.org/ListarMarcasModelos"' });
  });

  it("un filtro vacío junto a uno válido no se envía", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "  ", codigoUnicoFinal: "SINT-MM-01" })).slice(2), [["CodigoUnicoFinal", "SINT-MM-01"]]);
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["ambos ausentes", {}, /requires at least one filter/],
    ["undefined", undefined, /requires at least one filter/],
    ['ambos ""', { codigoUnicoInicial: "", codigoUnicoFinal: "" }, /requires at least one filter/],
    ["ambos whitespace", { codigoUnicoInicial: "   ", codigoUnicoFinal: "\t" }, /requires at least one filter/],
    ["más de 22 caracteres", { codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["whitespace de más de 22", { codigoUnicoFinal: " ".repeat(23) }, /excede 22 caracteres/],
    ["no string", { codigoUnicoInicial: 123 }, /debe ser texto/],
    ["null", { codigoUnicoFinal: null }, /debe ser texto/],
    ["clave desconocida", { codigoUnico: "SINT-MM-01" }, /desconocido/],
    ["filters null", null, /inválidos/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKoreMarcasModelos con ${label} → invalid_argument antes de env/fetch`, async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return soap12Response(OK);
      }) as typeof fetch;
      let error: unknown;
      try {
        // Sin options.env: si la validación no ocurriera antes, fallaría por config (process.env sin KORE_*).
        await listKoreMarcasModelos(filters as KoreMarcaModeloFilters);
      } catch (caught) {
        error = caught;
      } finally {
        globalThis.fetch = originalFetch;
      }
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });

    it(`fetchKoreMarcasModelos con ${label} → invalid_argument sin fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(await errorFrom(fetchKoreMarcasModelos(client, filters as KoreMarcaModeloFilters)), "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarMarcasModelos → KoreMarcaModelo[]", () => {
  it("A/B/C/D/E. filas completas: raw con padding preservado y normalizado = trim", async () => {
    const rows = await marcasModelosFrom(OK);
    assert.deepEqual<KoreMarcaModelo>(rows[0], {
      codigoUnico: "SINT-MM-01",
      codigoUnicoRaw: c("SINT-MM-01"),
      nroMarca: 10,
      marca: "MARCA SINTETICA A",
      marcaRaw: t("MARCA SINTETICA A"),
      nroModelo: 100,
      modelo: "MODELO SINTETICO 1",
      modeloRaw: t("MODELO SINTETICO 1"),
    });
    assert.equal(rows[0].codigoUnicoRaw.length, 22);
    assert.equal(rows[0].marcaRaw!.length, 100);
    assert.equal(rows[0].modeloRaw!.length, 100);
    assert.deepEqual(Object.keys(rows[0]), ["codigoUnico", "codigoUnicoRaw", "nroMarca", "marca", "marcaRaw", "nroModelo", "modelo", "modeloRaw"]);
  });

  it("B. varias filas para el mismo CODIGOUNICO", async () => {
    const rows = await marcasModelosFrom(OK);
    assert.equal(rows.filter((r) => r.codigoUnico === "SINT-MM-01").length, 4);
  });

  it("F/I. MARCA, MODELO, NROMARCA y NROMODELO ausentes → null", async () => {
    const [, , , , absent] = await marcasModelosFrom(OK);
    assert.deepEqual([absent.nroMarca, absent.marca, absent.marcaRaw, absent.nroModelo, absent.modelo, absent.modeloRaw], [null, null, null, null, null, null]);
  });

  it("G. MARCA vacía → raw \"\" y normalizado \"\"", async () => {
    const [, , , empty] = await marcasModelosFrom(OK);
    assert.equal(empty.marcaRaw, "");
    assert.equal(empty.marca, "");
  });

  it("G. MODELO vacío → raw \"\" y normalizado \"\"", async () => {
    const [, , , empty] = await marcasModelosFrom(inRow(OK, 4, "<MODELO>      </MODELO>", "<MODELO></MODELO>"));
    assert.equal(empty.modeloRaw, "");
    assert.equal(empty.modelo, "");
  });

  it("H. MODELO whitespace → raw preservado y normalizado \"\"", async () => {
    const [, , , ws] = await marcasModelosFrom(OK);
    assert.equal(ws.modeloRaw, "      ");
    assert.equal(ws.modelo, "");
  });

  it("H. MARCA whitespace → raw preservado y normalizado \"\"", async () => {
    const [, , , ws] = await marcasModelosFrom(inRow(OK, 4, "<MARCA />", "<MARCA>\t  </MARCA>"));
    assert.equal(ws.marcaRaw, "\t  ");
    assert.equal(ws.marca, "");
  });

  it("CODIGOUNICO con ceros iniciales se preserva como string", async () => {
    const [, , , zeros] = await marcasModelosFrom(OK);
    assert.equal(zeros.codigoUnico, "000123");
    assert.equal(zeros.codigoUnicoRaw, c("000123"));
  });

  it("J/K. 0 y negativos son válidos (sin exigir signo)", async () => {
    const [, , , row] = await marcasModelosFrom(OK);
    assert.equal(row.nroMarca, 0);
    assert.equal(row.nroModelo, -5);
  });

  it("L. máximo y mínimo de xs:int válidos", async () => {
    const xml = inRow(inRow(OK, 1, "<NROMARCA>10</NROMARCA>", "<NROMARCA>2147483647</NROMARCA>"), 1, "<NROMODELO>100</NROMODELO>", "<NROMODELO>-2147483648</NROMODELO>");
    const [row] = await marcasModelosFrom(xml);
    assert.equal(row.nroMarca, 2147483647);
    assert.equal(row.nroModelo, -2147483648);
  });

  it("S. filas repetidas se preservan en orden, sin deduplicar", async () => {
    const rows = await marcasModelosFrom(OK);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[5], rows[0]);
  });

  it("mismo NROMODELO bajo distintas marcas no genera error (sin supuestos de unicidad)", async () => {
    const rows = await marcasModelosFrom(OK);
    assert.deepEqual([rows[0].nroMarca, rows[0].nroModelo, rows[2].nroMarca, rows[2].nroModelo], [10, 100, 20, 100]);
  });

  for (const [field, search] of [["NROMARCA", "<NROMARCA>10</NROMARCA>"], ["NROMODELO", "<NROMODELO>100</NROMODELO>"]] as const) {
    for (const [label, value] of [["M. decimal", "10.5"], ["N. texto", "DIEZ"], ["vacío", ""], ["whitespace", "  "], ["fuera de safe integer", "9007199254740993"], ["NaN", "NaN"]] as const) {
      it(`${label} en ${field} → invalid_data`, async () => {
        await invalid(inRow(OK, 1, search, `<${field}>${value}</${field}>`), `MarcaYModelo row 1: invalid ${field}`);
      });
    }
  }

  it("O. CODIGOUNICO ausente → invalid_data", async () => {
    await invalid(inRow(OK, 2, `<CODIGOUNICO>${c("SINT-MM-01")}</CODIGOUNICO>`, ""), "MarcaYModelo row 2: missing CODIGOUNICO");
  });

  it("P. CODIGOUNICO whitespace-only → invalid_data", async () => {
    await invalid(inRow(OK, 2, `<CODIGOUNICO>${c("SINT-MM-01")}</CODIGOUNICO>`, `<CODIGOUNICO>${c("")}</CODIGOUNICO>`), "MarcaYModelo row 2: missing CODIGOUNICO");
  });

  it("Q. campo desconocido → invalid_data", async () => {
    await invalid(inRow(OK, 3, "<NROMODELO>100</NROMODELO>", "<NROMODELO>100</NROMODELO><ANIO>MODELO SINTETICO X</ANIO>"), "MarcaYModelo row 3: unexpected field ANIO");
  });

  it("R. tabla inesperada con filas → invalid_data", async () => {
    await invalid(OK.replace("</NewDataSet>", '<Articulo diffgr:id="Articulo1" msdata:rowOrder="0"><CODIGOUNICO>SINT-MM-01</CODIGOUNICO></Articulo></NewDataSet>'), "Unexpected KORE dataset entity: Articulo");
  });

  it("R. tabla inesperada solo en el esquema → invalid_data", async () => {
    await invalid(OK.replace("</xs:choice>", '<xs:element name="Marca"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), "Unexpected KORE dataset entity: Marca");
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await marcasModelosFrom(OK.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });
});

describe("ListarMarcasModelos: API pública y privacidad", () => {
  it("listKoreMarcasModelos usa la config del env y hace 1 request", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(OK));
    const rows = await listKoreMarcasModelos(ANY_FILTER, { env: FAKE_ENV, fetchImpl });
    assert.equal(rows.length, 6);
    assert.equal(calls.length, 1);
  });

  it("SOAP 1.2 Fault que repite el código filtrado y el secreto → detalle omitido", async () => {
    const fault = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Code><soap:Value>soap:Receiver</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang="en">ECO-KORE SINT-MM-01 ${escapeXml(FAKE_SECRET)}</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
    const { client, calls } = clientFor(fault, 500);
    const error = assertKoreError(await errorFrom(fetchKoreMarcasModelos(client, ANY_FILTER)), "soap_fault");
    assert.equal(calls.length, 1, "sin reintentos");
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    const text = [error.message, error.stack ?? "", JSON.stringify(error), inspect(error, { showHidden: true })].join("\n");
    assert.ok(!text.includes("ECO-KORE") && !text.includes("SINT-MM-01"));
    assertNoSecret(error);
  });
});
