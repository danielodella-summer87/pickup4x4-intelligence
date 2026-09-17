import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED } from "../client.ts";
import { fetchKorePreciosxArticulo } from "../precios.ts";
import type { KoreListaPrecioArticulo } from "../precios.ts";
import { listKorePreciosxArticulo } from "../service.ts";
import { escapeXml } from "../xml.ts";
import { FAKE_ENV, mockFetch, readFixture } from "./helpers.ts";
import {
  FAKE_SECRET,
  assertKoreError,
  assertNoMarkers,
  assertSoap12Call,
  clientFor,
  errorFrom,
  inRow,
  sentDataFields,
  serviceErrorWithoutNetwork,
  soap12FaultEcho,
  soap12Response,
} from "./pricing-helpers.ts";

const OP = "ListarPreciosxArticulo";
const OK = readFixture("listar-precios-x-articulo.ok.xml");
const CODE = "SINT-PR-01";
const n30 = (v: string) => v.padEnd(30);

/** Datos sintéticos distintivos: nunca deben aparecer en errores. */
const MARKERS = [CODE, "LISTA SINTETICA", "MS1", "100.5000", "122.6100"];

async function preciosFrom(xml: string): Promise<KoreListaPrecioArticulo[]> {
  return fetchKorePreciosxArticulo(clientFor(xml).client, CODE);
}

async function invalid(xml: string, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(preciosFrom(xml)), "invalid_data");
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "ListaPrecio", n, search, replacement);

describe("ListarPreciosxArticulo: código y request", () => {
  async function requestFor(codigo: string) {
    const { client, calls } = clientFor(OK);
    await fetchKorePreciosxArticulo(client, codigo);
    assert.equal(calls.length, 1);
    return calls[0];
  }

  it("código válido: Data exacto con CodigoUnico", async () => {
    assert.deepEqual(sentDataFields(await requestFor(CODE), OP), [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["CodigoUnico", CODE],
    ]);
  });

  it("ceros iniciales y padding enviado se preservan exactos", async () => {
    assert.deepEqual(sentDataFields(await requestFor("000123"), OP).slice(2), [["CodigoUnico", "000123"]]);
    assert.deepEqual(sentDataFields(await requestFor(" 000123 "), OP).slice(2), [["CodigoUnico", " 000123 "]]);
  });

  it("escapa caracteres especiales", async () => {
    const codigo = `A&B<C>"D'`;
    const call = await requestFor(codigo);
    assert.ok(String(call.init.body).includes(escapeXml(codigo)));
    assert.deepEqual(sentDataFields(call, OP).slice(2), [["CodigoUnico", codigo]]);
  });

  it("usa SOAP 1.2 con action ListarPreciosxArticulo y sin SOAPAction", async () => {
    assertSoap12Call(await requestFor(CODE), OP);
  });

  const invalidCodes: [string, unknown, RegExp][] = [
    ["vacío", "", /requires codigoUnico/],
    ["whitespace", "   ", /requires codigoUnico/],
    ["más de 22 caracteres", "X".repeat(23), /excede 22 caracteres/],
    ["no string", 123, /debe ser texto/],
    ["null", null, /debe ser texto/],
    ["undefined", undefined, /debe ser texto/],
  ];
  for (const [label, codigo, message] of invalidCodes) {
    it(`listKorePreciosxArticulo con código ${label} → invalid_argument antes de env/fetch`, async () => {
      const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => listKorePreciosxArticulo(codigo as string), OK);
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });

    it(`fetchKorePreciosxArticulo con código ${label} → invalid_argument sin fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(await errorFrom(fetchKorePreciosxArticulo(client, codigo as string)), "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarPreciosxArticulo → KoreListaPrecioArticulo[]", () => {
  it("fila completa: raw preservado, normalizado trim y precios de conveniencia", async () => {
    const [first] = await preciosFrom(OK);
    assert.deepEqual<KoreListaPrecioArticulo>(first, {
      nroListaPrecio: 2,
      monedaRaw: "MS1",
      moneda: "MS1",
      precioRaw: "100.5000",
      precio: 100.5,
      precioIvaRaw: "122.6100",
      precioIva: 122.61,
      nombreListaPrecioRaw: n30("LISTA SINTETICA A"),
      nombreListaPrecio: "LISTA SINTETICA A",
    });
    assert.deepEqual(Object.keys(first), ["nroListaPrecio", "monedaRaw", "moneda", "precioRaw", "precio", "precioIvaRaw", "precioIva", "nombreListaPrecioRaw", "nombreListaPrecio"]);
    assert.ok(!("codigoUnico" in first), "la respuesta real no devuelve CODIGOUNICO");
  });

  it("múltiples filas en orden y filas repetidas preservadas (sin deduplicar)", async () => {
    const rows = await preciosFrom(OK);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[5], rows[0]);
  });

  it("todos los campos ausentes → null", async () => {
    const [, , , , empty] = await preciosFrom(OK);
    assert.deepEqual(Object.values(empty), [null, null, null, null, null, null, null, null, null]);
  });

  it("NroListaPrecio 0 y negativo son válidos (xs:int sin rango de dominio)", async () => {
    const rows = await preciosFrom(OK);
    assert.equal(rows[2].nroListaPrecio, 0);
    assert.equal(rows[3].nroListaPrecio, -7);
  });

  it("NroListaPrecio límites de xs:int y > 255 válidos", async () => {
    const [a] = await preciosFrom(row(OK, 1, "<NroListaPrecio>2</NroListaPrecio>", "<NroListaPrecio>2147483647</NroListaPrecio>"));
    const [b] = await preciosFrom(row(OK, 1, "<NroListaPrecio>2</NroListaPrecio>", "<NroListaPrecio>-2147483648</NroListaPrecio>"));
    const [c] = await preciosFrom(row(OK, 1, "<NroListaPrecio>2</NroListaPrecio>", "<NroListaPrecio>256</NroListaPrecio>"));
    assert.deepEqual([a.nroListaPrecio, b.nroListaPrecio, c.nroListaPrecio], [2147483647, -2147483648, 256]);
  });

  for (const [label, value] of [["decimal", "2.5"], ["decimal .0", "2.0"], ["texto", "DOS"], ["vacío", ""], ["exponente", "2e1"], ["unsafe", "9007199254740993"]] as const) {
    it(`NroListaPrecio ${label} → invalid_data`, async () => {
      await invalid(row(OK, 1, "<NroListaPrecio>2</NroListaPrecio>", `<NroListaPrecio>${value}</NroListaPrecio>`), "ListaPrecio row 1: invalid NroListaPrecio");
    });
  }

  it("Moneda padded, vacía y whitespace: raw preservado y normalizado trim", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual([rows[1].monedaRaw, rows[1].moneda], ["MS2 ", "MS2"]);
    assert.deepEqual([rows[2].monedaRaw, rows[2].moneda], ["", ""]);
    assert.deepEqual([rows[3].monedaRaw, rows[3].moneda], ["   ", ""]);
  });

  it("Precio/PrecioIVA cero, negativo, escala variable y signo +: raw exacto", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual([rows[1].precioRaw, rows[1].precio, rows[1].precioIvaRaw, rows[1].precioIva], ["0.0000", 0, "0.0000", 0]);
    assert.deepEqual([rows[2].precioRaw, rows[2].precio, rows[2].precioIvaRaw, rows[2].precioIva], ["-12.5", -12.5, "-15.25", -15.25]);
    assert.deepEqual([rows[3].precioRaw, rows[3].precio, rows[3].precioIvaRaw, rows[3].precioIva], ["7", 7, "+8.540", 8.54]);
  });

  it("decimal con padding y formas .5 / 5. válidas; -0 → 0 de conveniencia", async () => {
    const [a] = await preciosFrom(row(OK, 1, "<Precio>100.5000</Precio>", "<Precio> .5 </Precio>"));
    const [b] = await preciosFrom(row(OK, 1, "<PrecioIVA>122.6100</PrecioIVA>", "<PrecioIVA>5.</PrecioIVA>"));
    const [c] = await preciosFrom(row(OK, 1, "<Precio>100.5000</Precio>", "<Precio>-0.0000</Precio>"));
    assert.deepEqual([a.precioRaw, a.precio, b.precioIvaRaw, b.precioIva, c.precioRaw], [" .5 ", 0.5, "5.", 5, "-0.0000"]);
    assert.ok(Object.is(c.precio, 0));
  });

  it("decimal con muchos dígitos: raw exacto preservado aunque el number pierda precisión", async () => {
    const raw = "12345678901234567890.123456789";
    const [first] = await preciosFrom(row(OK, 1, "<Precio>100.5000</Precio>", `<Precio>${raw}</Precio>`));
    assert.equal(first.precioRaw, raw);
    assert.equal(typeof first.precio, "number");
  });

  for (const [field, search] of [["Precio", "<Precio>100.5000</Precio>"], ["PrecioIVA", "<PrecioIVA>122.6100</PrecioIVA>"]] as const) {
    for (const [label, value] of [["vacío", ""], ["whitespace", "  "], ["exponente (no válido en xs:decimal)", "1.5E2"], ["NaN", "NaN"], ["INF", "INF"], ["Infinity", "Infinity"], ["texto", "CIEN"], ["coma decimal", "100,50"], ["doble signo", "--1"], ["solo punto", "."], ["desborde", "9".repeat(400)]] as const) {
      it(`${field} ${label} → invalid_data`, async () => {
        await invalid(row(OK, 1, search, `<${field}>${value}</${field}>`), `ListaPrecio row 1: invalid ${field}`);
      });
    }
  }

  it("NombreListaPrecio vacío y whitespace: raw preservado y normalizado \"\"", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual([rows[2].nombreListaPrecioRaw, rows[2].nombreListaPrecio], ["   ", ""]);
    assert.deepEqual([rows[3].nombreListaPrecioRaw, rows[3].nombreListaPrecio], ["", ""]);
  });

  it("no exige ancho 30 en NombreListaPrecio", async () => {
    const [first] = await preciosFrom(row(OK, 1, `<NombreListaPrecio>${n30("LISTA SINTETICA A")}</NombreListaPrecio>`, "<NombreListaPrecio>LISTA SINTETICA A</NombreListaPrecio>"));
    assert.equal(first.nombreListaPrecioRaw, "LISTA SINTETICA A");
  });

  it("campo desconocido → invalid_data", async () => {
    await invalid(row(OK, 2, "<Precio>0.0000</Precio>", "<Precio>0.0000</Precio><CODIGOUNICO>SINT-PR-01</CODIGOUNICO>"), "ListaPrecio row 2: unexpected field CODIGOUNICO");
  });

  it("campo repetido → invalid_data", async () => {
    await invalid(row(OK, 1, "<Moneda>MS1</Moneda>", "<Moneda>MS1</Moneda><Moneda>MS1</Moneda>"), "ListaPrecio row 1: repeated field Moneda");
  });

  it("campo anidado → invalid_data", async () => {
    await invalid(row(OK, 1, "<Moneda>MS1</Moneda>", "<Moneda><X>MS1</X></Moneda>"), "ListaPrecio row 1: nested content in Moneda");
  });

  it("tabla inesperada con filas → invalid_data", async () => {
    await invalid(OK.replace("</NewDataSet>", '<Precio diffgr:id="Precio1" msdata:rowOrder="0"><PRECIO>1</PRECIO></Precio></NewDataSet>'), "Unexpected KORE dataset entity: Precio");
  });

  it("tabla inesperada solo en el esquema → invalid_data", async () => {
    await invalid(OK.replace("</xs:choice>", '<xs:element name="ListaPrecioIVA"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), "Unexpected KORE dataset entity: ListaPrecioIVA");
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await preciosFrom(OK.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });
});

describe("ListarPreciosxArticulo: API pública y privacidad", () => {
  it("listKorePreciosxArticulo usa la config del env y hace 1 request", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(OK));
    const rows = await listKorePreciosxArticulo(CODE, { env: FAKE_ENV, fetchImpl });
    assert.equal(rows.length, 6);
    assert.equal(calls.length, 1);
  });

  it("SOAP 1.2 Fault que repite código y secreto → detalle omitido, sin reintentos", async () => {
    const { client, calls } = clientFor(soap12FaultEcho(`ECO-KORE ${CODE} ${escapeXml(FAKE_SECRET)}`), 500);
    const error = assertKoreError(await errorFrom(fetchKorePreciosxArticulo(client, CODE)), "soap_fault");
    assert.equal(calls.length, 1);
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    assertNoMarkers(error, ["ECO-KORE", CODE]);
  });
});
