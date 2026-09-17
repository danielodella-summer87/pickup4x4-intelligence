import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED } from "../client.ts";
import { fetchKoreImagenes } from "../imagenes.ts";
import type { KoreImagen, KoreImagenFilters } from "../imagenes.ts";
import { listKoreImagenes } from "../service.ts";
import { escapeXml } from "../xml.ts";
import { FAKE_ENV, mockFetch, readFixture } from "./helpers.ts";
import {
  FAKE_SECRET,
  assertKoreError,
  assertNoMarkers,
  assertSoap12Call,
  clientFor,
  errorFrom,
  sentDataFields,
  serviceErrorWithoutNetwork,
  soap12FaultEcho,
  soap12Response,
} from "./pricing-helpers.ts";

const OP = "ListarImagenes";
const OK = readFixture("listar-imagenes.ok.xml");
const FILTERS: KoreImagenFilters = { codigoUnicoInicial: "SINT-IMG-01", codigoUnicoFinal: "SINT-IMG-01" };
const MARKERS = ["SINT-IMG", "000123", "U0lOVEVU"];

async function imagenesFrom(xml: string): Promise<KoreImagen[]> {
  return fetchKoreImagenes(clientFor(xml).client, FILTERS);
}

async function invalid(xml: string, kind: "invalid_data" | "parse", message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(imagenesFrom(xml)), kind);
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

/** Reemplaza dentro del bloque <Imagenes> número `n` (base 1): no hay diffgr:id en este contrato. */
function inImagen(xml: string, n: number, search: string, replacement: string): string {
  let start = -1;
  for (let i = 0; i < n; i++) start = xml.indexOf("<Imagenes>", start + 1);
  const end = xml.indexOf("</Imagenes>", start);
  const block = xml.slice(start, end);
  assert.ok(start >= 0 && block.includes(search), `el fixture no contiene ${search} en la fila ${n}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

describe("ListarImagenes: filtros y request", () => {
  async function requestFor(filters: KoreImagenFilters) {
    const { client, calls } = clientFor(OK);
    await fetchKoreImagenes(client, filters);
    assert.equal(calls.length, 1);
    return calls[0];
  }

  it("rango exacto: Data con inicial y final en orden estable", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-IMG-02", codigoUnicoInicial: "SINT-IMG-01" }), OP), [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["CodigoUnicoInicial", "SINT-IMG-01"],
      ["CodigoUnicoFinal", "SINT-IMG-02"],
    ]);
  });

  it("solo inicial / solo final; whitespace no efectivo junto a otro válido", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "000123" }), OP).slice(2), [["CodigoUnicoInicial", "000123"]]);
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoInicial: "  ", codigoUnicoFinal: "000123" }), OP).slice(2), [["CodigoUnicoFinal", "000123"]]);
  });

  it("escape XML y SOAP 1.2 con action ListarImagenes", async () => {
    const codigo = `A&B<C>"D'`;
    const call = await requestFor({ codigoUnicoInicial: codigo });
    assert.ok(String(call.init.body).includes(escapeXml(codigo)));
    assert.deepEqual(sentDataFields(call, OP).slice(2), [["CodigoUnicoInicial", codigo]]);
    assertSoap12Call(call, OP);
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["filters null", null, /inválidos/],
    ["objeto vacío (todas las imágenes)", {}, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["códigos vacíos", { codigoUnicoInicial: "", codigoUnicoFinal: "   " }, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["código > 22", { codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["código no string", { codigoUnicoFinal: 7 }, /debe ser texto/],
    ["clave desconocida", { codigoUnico: "SINT-IMG-01" }, /desconocido/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKoreImagenes con ${label} → invalid_argument antes de env/fetch`, async () => {
      const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => listKoreImagenes(filters as KoreImagenFilters), OK);
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });
    it(`fetchKoreImagenes con ${label} → invalid_argument sin fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(await errorFrom(fetchKoreImagenes(client, filters as KoreImagenFilters)), "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarImagenes → KoreImagen[] (DataSet sin schema/diffgram)", () => {
  it("filas en orden, Base64 exacto sin decodificar, filas repetidas preservadas", async () => {
    const rows = await imagenesFrom(OK);
    assert.equal(rows.length, 5);
    assert.deepEqual<KoreImagen>(rows[0], { codigoUnicoRaw: "SINT-IMG-01", codigoUnico: "SINT-IMG-01", imagenBase64: "U0lOVEVUSUNPLUlNQUdFTi0x" });
    assert.deepEqual(rows[4], rows[0]);
  });

  it("Base64 con saltos de línea se preserva tal cual", async () => {
    const [, second] = await imagenesFrom(OK);
    assert.equal(second.imagenBase64, "U0lO\nVEVU\nSUNP");
  });

  it("CodigoUnico padded, Imagen vacía y ausente", async () => {
    const rows = await imagenesFrom(OK);
    assert.deepEqual([rows[2].codigoUnicoRaw, rows[2].codigoUnico, rows[2].imagenBase64], ["000123".padEnd(22), "000123", ""]);
    assert.deepEqual([rows[3].codigoUnico, rows[3].imagenBase64], ["000123", null]);
  });

  it("Base64 inválido → invalid_data", async () => {
    await invalid(inImagen(OK, 1, "<Imagen>U0lOVEVUSUNPLUlNQUdFTi0x</Imagen>", "<Imagen>no-es-base64!</Imagen>"), "invalid_data", "Imagenes row 1: invalid Imagen");
    await invalid(inImagen(OK, 1, "<Imagen>U0lOVEVUSUNPLUlNQUdFTi0x</Imagen>", "<Imagen>QU=JD</Imagen>"), "invalid_data", "Imagenes row 1: invalid Imagen");
  });

  it("CodigoUnico ausente o vacío → invalid_data", async () => {
    await invalid(inImagen(OK, 2, "<CodigoUnico>SINT-IMG-01</CodigoUnico>", ""), "invalid_data", "Imagenes row 2: missing CodigoUnico");
    await invalid(inImagen(OK, 2, "<CodigoUnico>SINT-IMG-01</CodigoUnico>", "<CodigoUnico>  </CodigoUnico>"), "invalid_data", "Imagenes row 2: missing CodigoUnico");
  });

  it("más de un <Imagen> en una fila (no observado) → invalid_data", async () => {
    await invalid(inImagen(OK, 1, "</Imagen>", "</Imagen><Imagen>QUJD</Imagen>"), "invalid_data", "Imagenes row 1: repeated field Imagen");
  });

  it("campo desconocido → invalid_data", async () => {
    await invalid(inImagen(OK, 1, "</Imagen>", "</Imagen><Orden>1</Orden>"), "invalid_data", "Imagenes row 1: unexpected field Orden");
  });

  it("entidad inesperada en el DataSet → invalid_data", async () => {
    await invalid(OK.replace("</DataSet>", "<Imagen>QUJD</Imagen></DataSet>"), "invalid_data", "Unexpected KORE dataset entity: Imagen");
  });

  it("schema o diffgram presente (cambio de contrato) → parse", async () => {
    await invalid(OK.replace('<DataSet xmlns="">', '<DataSet xmlns=""><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" />'), "parse", "ListarImagenesResult con schema inesperado");
  });

  it("DataSet vacío → []; Result sin DataSet → parse", async () => {
    assert.deepEqual(await imagenesFrom(OK.replace(/<DataSet xmlns="">[\s\S]*<\/DataSet>/, '<DataSet xmlns="" />')), []);
    await invalid(OK.replace(/<DataSet xmlns="">[\s\S]*<\/DataSet>/, ""), "parse", "ListarImagenesResult sin DataSet");
  });

  it("listKoreImagenes usa la config del env y hace 1 request", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(OK));
    assert.equal((await listKoreImagenes(FILTERS, { env: FAKE_ENV, fetchImpl })).length, 5);
    assert.equal(calls.length, 1);
  });

  it("SOAP 1.2 Fault que repite filtros y secreto → detalle omitido, sin reintentos", async () => {
    const { client, calls } = clientFor(soap12FaultEcho(`ECO-KORE SINT-IMG-01 ${escapeXml(FAKE_SECRET)}`), 500);
    const error = assertKoreError(await errorFrom(fetchKoreImagenes(client, FILTERS)), "soap_fault");
    assert.equal(calls.length, 1);
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    assertNoMarkers(error, ["ECO-KORE", "SINT-IMG-01"]);
  });
});
