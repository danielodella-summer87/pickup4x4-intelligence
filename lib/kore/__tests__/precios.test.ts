import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { fetchKorePrecios, normalizePrecioRow } from "../precios.ts";
import type { KorePrecio, KorePrecioFilters } from "../precios.ts";
import { listKorePrecios } from "../service.ts";
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

const OP = "ListarPrecios";
const OK = readFixture("listar-precios.ok.xml");
const VENDEDORES = readFixture("listar-vendedores.ok.xml");
const LISTA = 2;
const FILTERS: KorePrecioFilters = { nroListaPrecio: LISTA, codigoUnicoInicial: "SINT-PR-01", codigoUnicoFinal: "SINT-PR-02" };
const c22 = (v: string) => v.padEnd(22);
const c6 = (v: string) => v.padEnd(6);

/** Datos sintéticos distintivos: nunca deben aparecer en errores. */
const MARKERS = ["SINT-PR", "000123", "MS1", "100.123456789012", "G01", "S001"];

async function preciosFrom(xml: string, filters: KorePrecioFilters = FILTERS): Promise<KorePrecio[]> {
  return fetchKorePrecios(clientFor(xml).client, filters);
}

async function invalid(xml: string, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(preciosFrom(xml)), "invalid_data");
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "Precio", n, search, replacement);

describe("ListarPrecios: filtros y request", () => {
  async function requestFor(filters: KorePrecioFilters) {
    const { client, calls } = clientFor(OK);
    await fetchKorePrecios(client, filters);
    assert.equal(calls.length, 1);
    return calls[0];
  }

  it("lista + ambos códigos, en el orden del ejemplo oficial", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-PR-02", codigoUnicoInicial: "SINT-PR-01", nroListaPrecio: LISTA }), OP), [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["NroListaPrecio", "2"],
      ["CodigoUnicoInicial", "SINT-PR-01"],
      ["CodigoUnicoFinal", "SINT-PR-02"],
    ]);
  });

  it("lista + inicial", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroListaPrecio: LISTA, codigoUnicoInicial: "SINT-PR-01" }), OP).slice(2), [
      ["NroListaPrecio", "2"],
      ["CodigoUnicoInicial", "SINT-PR-01"],
    ]);
  });

  it("lista + final", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroListaPrecio: LISTA, codigoUnicoFinal: "SINT-PR-02" }), OP).slice(2), [
      ["NroListaPrecio", "2"],
      ["CodigoUnicoFinal", "SINT-PR-02"],
    ]);
  });

  it("código whitespace junto a otro válido: solo se envía el efectivo", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroListaPrecio: LISTA, codigoUnicoInicial: "  ", codigoUnicoFinal: "SINT-PR-02" }), OP).slice(2), [
      ["NroListaPrecio", "2"],
      ["CodigoUnicoFinal", "SINT-PR-02"],
    ]);
  });

  it("ceros iniciales preservados y escape XML", async () => {
    const codigo = `0&<>"'`;
    const call = await requestFor({ nroListaPrecio: LISTA, codigoUnicoInicial: "000123", codigoUnicoFinal: codigo });
    assert.ok(String(call.init.body).includes(escapeXml(codigo)));
    assert.deepEqual(sentDataFields(call, OP).slice(3), [["CodigoUnicoInicial", "000123"], ["CodigoUnicoFinal", codigo]]);
  });

  it("nroListaPrecio del request es Integer: se aceptan 0, negativos y > 255 (sin inferir rango)", async () => {
    for (const nro of [0, -1, 256]) {
      const { client, calls } = clientFor(OK.replaceAll("<NROLISTAPRECIO>2</NROLISTAPRECIO>", `<NROLISTAPRECIO>${nro}</NROLISTAPRECIO>`));
      await fetchKorePrecios(client, { nroListaPrecio: nro, codigoUnicoInicial: "SINT-PR-01" });
      assert.deepEqual(sentDataFields(calls[0], OP)[2], ["NroListaPrecio", String(nro)]);
    }
  });

  it("usa SOAP 1.2 con action ListarPrecios y sin SOAPAction", async () => {
    assertSoap12Call(await requestFor(FILTERS), OP);
  });

  it("los métodos anteriores siguen en SOAP 1.1 por defecto con el mismo cliente", async () => {
    const { fetchImpl, calls } = mockFetch(({ init }) => soap12Response(String(init.body).includes("ListarPrecios") ? OK : VENDEDORES));
    const client = createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl });
    await fetchKorePrecios(client, FILTERS);
    await client.call("ListarVendedores");
    assert.deepEqual(calls[1].init.headers, { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://tempuri.org/ListarVendedores"' });
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["filters null", null, /inválidos/],
    ["objeto vacío", {}, /requires nroListaPrecio/],
    ["falta nroListaPrecio con códigos", { codigoUnicoInicial: "SINT-PR-01" }, /requires nroListaPrecio/],
    ["solo nroListaPrecio (safety local)", { nroListaPrecio: LISTA }, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["nroListaPrecio con códigos vacíos (safety local)", { nroListaPrecio: LISTA, codigoUnicoInicial: "", codigoUnicoFinal: "  " }, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["nroListaPrecio decimal", { nroListaPrecio: 2.5, codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["nroListaPrecio NaN", { nroListaPrecio: Number.NaN, codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["nroListaPrecio Infinity", { nroListaPrecio: Number.POSITIVE_INFINITY, codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["nroListaPrecio unsafe integer", { nroListaPrecio: 2 ** 53, codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["nroListaPrecio string", { nroListaPrecio: "2", codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["nroListaPrecio null", { nroListaPrecio: null, codigoUnicoInicial: "SINT-PR-01" }, /entero seguro/],
    ["código > 22", { nroListaPrecio: LISTA, codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["código no string", { nroListaPrecio: LISTA, codigoUnicoFinal: 123 }, /debe ser texto/],
    ["código null", { nroListaPrecio: LISTA, codigoUnicoInicial: null }, /debe ser texto/],
    ["clave desconocida", { nroListaPrecio: LISTA, codigoUnico: "SINT-PR-01" }, /desconocido/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKorePrecios con ${label} → invalid_argument antes de env/fetch`, async () => {
      const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => listKorePrecios(filters as KorePrecioFilters), OK);
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });

    it(`fetchKorePrecios con ${label} → invalid_argument sin fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(await errorFrom(fetchKorePrecios(client, filters as KorePrecioFilters)), "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarPrecios → KorePrecio[]", () => {
  it("fila completa: raw preservado, normalizado trim y precio de conveniencia", async () => {
    const [first] = await preciosFrom(OK);
    assert.deepEqual<KorePrecio>(first, {
      autonumerado: 101,
      nroListaPrecio: 2,
      codigoUnicoRaw: c22("SINT-PR-01"),
      codigoUnico: "SINT-PR-01",
      codigoFamiliaRaw: c6("F1"),
      codigoFamilia: "F1",
      codigoGrupoRaw: c6("G01"),
      codigoGrupo: "G01",
      codigoSubgrupoRaw: c6("S001"),
      codigoSubgrupo: "S001",
      simboloRaw: "MS1",
      simbolo: "MS1",
      precioRaw: "100.123456789012",
      precio: 100.123456789012,
    });
    assert.ok(!("precioIva" in first) && !("nombreListaPrecio" in first), "contrato separado de ListarPreciosxArticulo");
  });

  it("múltiples filas en orden y filas repetidas preservadas (incluso AUTONUMERADO repetido)", async () => {
    const rows = await preciosFrom(OK);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[5], rows[0]);
  });

  it("AUTONUMERADO ausente → null; negativo y 0 válidos (sin PK ni signo)", async () => {
    const rows = await preciosFrom(OK);
    assert.equal(rows[3].autonumerado, null);
    const [neg] = await preciosFrom(row(OK, 1, "<AUTONUMERADO>101</AUTONUMERADO>", "<AUTONUMERADO>-4</AUTONUMERADO>"));
    const [zero] = await preciosFrom(row(OK, 1, "<AUTONUMERADO>101</AUTONUMERADO>", "<AUTONUMERADO>0</AUTONUMERADO>"));
    assert.deepEqual([neg.autonumerado, zero.autonumerado], [-4, 0]);
  });

  for (const [label, value] of [["decimal", "1.5"], ["texto", "UNO"], ["vacío", ""], ["unsafe", "9007199254740993"]] as const) {
    it(`AUTONUMERADO ${label} → invalid_data`, async () => {
      await invalid(row(OK, 1, "<AUTONUMERADO>101</AUTONUMERADO>", `<AUTONUMERADO>${value}</AUTONUMERADO>`), "Precio row 1: invalid AUTONUMERADO");
    });
    it(`NROLISTAPRECIO ${label} → invalid_data`, async () => {
      await invalid(row(OK, 1, "<NROLISTAPRECIO>2</NROLISTAPRECIO>", `<NROLISTAPRECIO>${value}</NROLISTAPRECIO>`), "Precio row 1: invalid NROLISTAPRECIO");
    });
  }

  it("parser: NROLISTAPRECIO ausente → null (la post-condición es de la API)", () => {
    const precio = normalizePrecioRow({ CODIGOUNICO: "SINT-PR-01" }, 1);
    assert.deepEqual(precio, {
      autonumerado: null,
      nroListaPrecio: null,
      codigoUnicoRaw: "SINT-PR-01",
      codigoUnico: "SINT-PR-01",
      codigoFamiliaRaw: null,
      codigoFamilia: null,
      codigoGrupoRaw: null,
      codigoGrupo: null,
      codigoSubgrupoRaw: null,
      codigoSubgrupo: null,
      simboloRaw: null,
      simbolo: null,
      precioRaw: null,
      precio: null,
    });
  });

  it("NROLISTAPRECIO xs:int > 255 válido cuando coincide con la lista pedida", async () => {
    const [first] = await preciosFrom(OK.replaceAll("<NROLISTAPRECIO>2</NROLISTAPRECIO>", "<NROLISTAPRECIO>300</NROLISTAPRECIO>"), { ...FILTERS, nroListaPrecio: 300 });
    assert.equal(first.nroListaPrecio, 300);
  });

  it("CODIGOUNICO con ceros iniciales preservado; no exige ancho 22", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual([rows[2].codigoUnicoRaw, rows[2].codigoUnico], [c22("000123"), "000123"]);
    const [first] = await preciosFrom(row(OK, 1, `<CODIGOUNICO>${c22("SINT-PR-01")}</CODIGOUNICO>`, "<CODIGOUNICO>SINT-PR-01</CODIGOUNICO>"));
    assert.equal(first.codigoUnicoRaw, "SINT-PR-01");
  });

  it("CODIGOUNICO ausente → invalid_data", async () => {
    await invalid(row(OK, 2, `<CODIGOUNICO>${c22("SINT-PR-01")}</CODIGOUNICO>`, ""), "Precio row 2: missing CODIGOUNICO");
  });

  it("CODIGOUNICO vacío o whitespace → invalid_data", async () => {
    await invalid(row(OK, 2, `<CODIGOUNICO>${c22("SINT-PR-01")}</CODIGOUNICO>`, "<CODIGOUNICO />"), "Precio row 2: missing CODIGOUNICO");
    await invalid(row(OK, 2, `<CODIGOUNICO>${c22("SINT-PR-01")}</CODIGOUNICO>`, `<CODIGOUNICO>${c22("")}</CODIGOUNICO>`), "Precio row 2: missing CODIGOUNICO");
  });

  it("taxonomía: vacía, whitespace y ausente", async () => {
    const [, second, , , fifth] = await preciosFrom(OK);
    assert.deepEqual([second.codigoFamiliaRaw, second.codigoFamilia], ["", ""]);
    assert.deepEqual([second.codigoGrupoRaw, second.codigoGrupo], ["    ", ""]);
    assert.deepEqual([second.codigoSubgrupoRaw, second.codigoSubgrupo], [null, null]);
    assert.deepEqual([fifth.codigoFamilia, fifth.codigoGrupo, fifth.codigoSubgrupo], [null, null, null]);
  });

  it("SIMBOLO padded, vacío, whitespace y ausente (sin mapear a ISO)", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual([rows[1].simboloRaw, rows[1].simbolo], ["MS1  ", "MS1"]);
    assert.deepEqual([rows[2].simboloRaw, rows[2].simbolo], ["", ""]);
    assert.deepEqual([rows[3].simboloRaw, rows[3].simbolo], ["   ", ""]);
    assert.deepEqual([rows[4].simboloRaw, rows[4].simbolo], [null, null]);
  });

  it("PRECIO cero, positivo, negativo, decimal y exponente válido: raw sin transformar", async () => {
    const rows = await preciosFrom(OK);
    assert.deepEqual(rows.slice(0, 4).map((r) => [r.precioRaw, r.precio]), [
      ["100.123456789012", 100.123456789012],
      ["0", 0],
      ["-3.5", -3.5],
      ["1.25E2", 125],
    ]);
    assert.deepEqual([rows[4].precioRaw, rows[4].precio], [null, null]);
  });

  it("PRECIO con padding se acepta y el raw conserva el padding", async () => {
    const [first] = await preciosFrom(row(OK, 1, "<PRECIO>100.123456789012</PRECIO>", "<PRECIO> 7.5e-1 </PRECIO>"));
    assert.deepEqual([first.precioRaw, first.precio], [" 7.5e-1 ", 0.75]);
  });

  for (const [label, value] of [["NaN", "NaN"], ["INF", "INF"], ["-INF", "-INF"], ["Infinity", "Infinity"], ["desborde", "1e400"], ["vacío", ""], ["texto", "CIEN"], ["coma", "1,5"], ["hexadecimal", "0x10"]] as const) {
    it(`PRECIO ${label} → invalid_data`, async () => {
      await invalid(row(OK, 1, "<PRECIO>100.123456789012</PRECIO>", `<PRECIO>${value}</PRECIO>`), "Precio row 1: invalid PRECIO");
    });
  }

  it("campo desconocido → invalid_data", async () => {
    await invalid(row(OK, 1, "<SIMBOLO>MS1</SIMBOLO>", "<SIMBOLO>MS1</SIMBOLO><PRECIOIVA>122.61</PRECIOIVA>"), "Precio row 1: unexpected field PRECIOIVA");
  });

  it("campo repetido → invalid_data", async () => {
    await invalid(row(OK, 1, "<SIMBOLO>MS1</SIMBOLO>", "<SIMBOLO>MS1</SIMBOLO><SIMBOLO>MS1</SIMBOLO>"), "Precio row 1: repeated field SIMBOLO");
  });

  it("tabla inesperada con filas → invalid_data", async () => {
    await invalid(OK.replace("</NewDataSet>", '<ListaPrecio diffgr:id="ListaPrecio1" msdata:rowOrder="0"><Precio>1</Precio></ListaPrecio></NewDataSet>'), "Unexpected KORE dataset entity: ListaPrecio");
  });

  it("tabla inesperada solo en el esquema → invalid_data", async () => {
    await invalid(OK.replace("</xs:choice>", '<xs:element name="PrecioHistorico"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), "Unexpected KORE dataset entity: PrecioHistorico");
  });

  it("post-condición: fila de otra lista → invalid_data sin valores", async () => {
    await invalid(row(OK, 3, "<NROLISTAPRECIO>2</NROLISTAPRECIO>", "<NROLISTAPRECIO>9</NROLISTAPRECIO>"), "Precio row 3: unexpected NROLISTAPRECIO");
  });

  it("post-condición: fila sin NROLISTAPRECIO → invalid_data (no se puede verificar la lista)", async () => {
    await invalid(row(OK, 4, "<NROLISTAPRECIO>2</NROLISTAPRECIO>", ""), "Precio row 4: unexpected NROLISTAPRECIO");
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await preciosFrom(OK.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });
});

describe("ListarPrecios: API pública y privacidad", () => {
  it("listKorePrecios usa la config del env y hace 1 request", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(OK));
    const rows = await listKorePrecios(FILTERS, { env: FAKE_ENV, fetchImpl });
    assert.equal(rows.length, 6);
    assert.equal(calls.length, 1);
  });

  it("SOAP 1.2 Fault que repite filtros y secreto → detalle omitido, sin reintentos", async () => {
    const { client, calls } = clientFor(soap12FaultEcho(`ECO-KORE lista 777 SINT-PR-01 ${escapeXml(FAKE_SECRET)}`), 500);
    const error = assertKoreError(await errorFrom(fetchKorePrecios(client, { ...FILTERS, nroListaPrecio: 777 })), "soap_fault");
    assert.equal(calls.length, 1);
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    assertNoMarkers(error, ["ECO-KORE", "777", "SINT-PR-01"]);
  });
});
