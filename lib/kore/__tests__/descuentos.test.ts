import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED } from "../client.ts";
import { fetchKoreCuentasGruposDescuentos, fetchKoreDescuentosXCantidad } from "../descuentos.ts";
import type {
  KoreCuentaGrupoDescuento,
  KoreCuentaGrupoDescuentoFilters,
  KoreDescuentoXCantidad,
  KoreDescuentoXCantidadFilters,
} from "../descuentos.ts";
import { listKoreCuentasGruposDescuentos, listKoreDescuentosXCantidad } from "../service.ts";
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

const DXC_OP = "ListarDescuentosXCantidad";
const CGD_OP = "ListarCuentasGruposDescuentos";
const DXC = readFixture("listar-descuentos-x-cantidad.ok.xml");
const CGD = readFixture("listar-cuentas-grupos-descuentos.ok.xml");
const DXC_FILTERS: KoreDescuentoXCantidadFilters = { nroListaPrecio: 2, codigoUnicoInicial: "SINT-DC-01", codigoUnicoFinal: "SINT-DC-01" };
const CGD_FILTERS: KoreCuentaGrupoDescuentoFilters = { codigoUnicoInicial: "SINT-CG-01", codigoUnicoFinal: "SINT-CG-01" };
const MARKERS = ["SINT-DC", "SINT-CG", "000123", "4.62", "9001", "FS1", "MS1"];
const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "DescuentoXCantidad", n, search, replacement);

async function invalid(run: Promise<unknown>, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(run), "invalid_data");
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

describe("ListarDescuentosXCantidad: filtros y request", () => {
  async function requestFor(filters: KoreDescuentoXCantidadFilters) {
    const { client, calls } = clientFor(DXC);
    await fetchKoreDescuentosXCantidad(client, filters);
    assert.equal(calls.length, 1);
    return calls[0];
  }

  it("lista + ambos códigos + cantidad en el orden documentado", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ cantidad: 5.5, codigoUnicoFinal: "SINT-DC-02", codigoUnicoInicial: "SINT-DC-01", nroListaPrecio: 2 }), DXC_OP), [
      ["NroEmpresa", "999"],
      ["SecretKey", FAKE_SECRET],
      ["NroListaPrecio", "2"],
      ["CodigoUnicoInicial", "SINT-DC-01"],
      ["CodigoUnicoFinal", "SINT-DC-02"],
      ["Cantidad", "5.5"],
    ]);
  });

  it("lista + inicial, lista + final (cantidad opcional); nroListaPrecio sin rango de dominio", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ nroListaPrecio: 0, codigoUnicoInicial: "000123" }), DXC_OP).slice(2), [["NroListaPrecio", "0"], ["CodigoUnicoInicial", "000123"]]);
    assert.deepEqual(sentDataFields(await requestFor({ nroListaPrecio: -4, codigoUnicoFinal: "000123" }), DXC_OP).slice(2), [["NroListaPrecio", "-4"], ["CodigoUnicoFinal", "000123"]]);
  });

  it("escape XML y SOAP 1.2 con action ListarDescuentosXCantidad", async () => {
    const codigo = `A&B<C>"D'`;
    const call = await requestFor({ nroListaPrecio: 2, codigoUnicoInicial: codigo });
    assert.ok(String(call.init.body).includes(escapeXml(codigo)));
    assertSoap12Call(call, DXC_OP);
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["filters null", null, /inválidos/],
    ["sin nroListaPrecio", { codigoUnicoInicial: "SINT-DC-01" }, /requires nroListaPrecio/],
    ["solo nroListaPrecio (safety local)", { nroListaPrecio: 2 }, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["códigos vacíos (safety local)", { nroListaPrecio: 2, codigoUnicoInicial: " ", codigoUnicoFinal: "" }, /requires codigoUnicoInicial or codigoUnicoFinal/],
    ["nroListaPrecio decimal", { nroListaPrecio: 2.5, codigoUnicoInicial: "SINT-DC-01" }, /entero seguro/],
    ["nroListaPrecio NaN", { nroListaPrecio: Number.NaN, codigoUnicoInicial: "SINT-DC-01" }, /entero seguro/],
    ["nroListaPrecio unsafe", { nroListaPrecio: 2 ** 53, codigoUnicoInicial: "SINT-DC-01" }, /entero seguro/],
    ["nroListaPrecio string", { nroListaPrecio: "2", codigoUnicoInicial: "SINT-DC-01" }, /entero seguro/],
    ["cantidad Infinity", { ...DXC_FILTERS, cantidad: Number.POSITIVE_INFINITY }, /cantidad/],
    ["cantidad NaN", { ...DXC_FILTERS, cantidad: Number.NaN }, /cantidad/],
    ["cantidad string", { ...DXC_FILTERS, cantidad: "5" }, /cantidad/],
    ["cantidad con exponente", { ...DXC_FILTERS, cantidad: 1e-7 }, /cantidad/],
    ["código > 22", { nroListaPrecio: 2, codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["clave desconocida", { ...DXC_FILTERS, codigoUnico: "SINT-DC-01" }, /desconocido/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKoreDescuentosXCantidad con ${label} → invalid_argument antes de env/fetch`, async () => {
      const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => listKoreDescuentosXCantidad(filters as KoreDescuentoXCantidadFilters), DXC);
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });
  }
});

describe("ListarDescuentosXCantidad → KoreDescuentoXCantidad[]", () => {
  const from = (xml: string) => fetchKoreDescuentosXCantidad(clientFor(xml).client, DXC_FILTERS);

  it("fila completa con raw + conveniencia; filas en orden y repetidas preservadas", async () => {
    const rows = await from(DXC);
    assert.equal(rows.length, 5);
    assert.deepEqual<KoreDescuentoXCantidad>(rows[0], {
      nroListaPrecio: 2,
      codigoUnicoRaw: "SINT-DC-01".padEnd(22),
      codigoUnico: "SINT-DC-01",
      cantidadAPartirDeRaw: "6",
      cantidadAPartirDe: 6,
      porcDescuentoRaw: "4.62",
      porcDescuento: 4.62,
    });
    assert.deepEqual(rows[4], rows[0]);
  });

  it("decimales, cero, negativos, exponente y ausentes → null (sin post-condición de lista)", async () => {
    const rows = await from(DXC);
    assert.deepEqual([rows[1].cantidadAPartirDe, rows[1].porcDescuentoRaw, rows[1].porcDescuento], [12.5, "0", 0]);
    assert.deepEqual([rows[2].nroListaPrecio, rows[2].cantidadAPartirDeRaw, rows[2].cantidadAPartirDe, rows[2].porcDescuento], [-3, "1E1", 10, -1.5]);
    assert.deepEqual([rows[3].nroListaPrecio, rows[3].cantidadAPartirDe, rows[3].porcDescuento], [null, null, null]);
  });

  for (const [field, search] of [["CANTIDADAPARTIRDE", "<CANTIDADAPARTIRDE>6</CANTIDADAPARTIRDE>"], ["PORCDESCUENTO", "<PORCDESCUENTO>4.62</PORCDESCUENTO>"]] as const) {
    for (const value of ["NaN", "INF", "", "4,62", "1e400"]) {
      it(`${field} "${value}" → invalid_data`, async () => {
        await invalid(from(row(DXC, 1, search, `<${field}>${value}</${field}>`)), `DescuentoXCantidad row 1: invalid ${field}`);
      });
    }
  }

  it("NROLISTAPRECIO inválido, CODIGOUNICO ausente, campo desconocido y tabla inesperada → invalid_data", async () => {
    await invalid(from(row(DXC, 1, "<NROLISTAPRECIO>2</NROLISTAPRECIO>", "<NROLISTAPRECIO>2.5</NROLISTAPRECIO>")), "DescuentoXCantidad row 1: invalid NROLISTAPRECIO");
    await invalid(from(row(DXC, 2, `<CODIGOUNICO>${"SINT-DC-01".padEnd(22)}</CODIGOUNICO>`, "")), "DescuentoXCantidad row 2: missing CODIGOUNICO");
    await invalid(from(row(DXC, 1, "<PORCDESCUENTO>4.62</PORCDESCUENTO>", "<PORCDESCUENTO>4.62</PORCDESCUENTO><SIMBOLO>MS1</SIMBOLO>")), "DescuentoXCantidad row 1: unexpected field SIMBOLO");
    await invalid(from(DXC.replace("</xs:choice>", '<xs:element name="Descuento"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>')), "Unexpected KORE dataset entity: Descuento");
  });

  it("DataSet vacío (observado en KORE-20) → []", async () => {
    assert.deepEqual(await from(DXC.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });

  it("API pública: env + 1 request; Fault con eco de filtros → detalle omitido", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(DXC));
    assert.equal((await listKoreDescuentosXCantidad(DXC_FILTERS, { env: FAKE_ENV, fetchImpl })).length, 5);
    assert.equal(calls.length, 1);
    const fault = clientFor(soap12FaultEcho(`ECO-KORE SINT-DC-01 ${escapeXml(FAKE_SECRET)}`), 500);
    const error = assertKoreError(await errorFrom(fetchKoreDescuentosXCantidad(fault.client, DXC_FILTERS)), "soap_fault");
    assert.equal(fault.calls.length, 1);
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    assertNoMarkers(error, ["ECO-KORE", "SINT-DC-01"]);
  });
});

describe("ListarCuentasGruposDescuentos: filtros y request", () => {
  async function requestFor(filters: KoreCuentaGrupoDescuentoFilters) {
    const { client, calls } = clientFor(CGD);
    await fetchKoreCuentasGruposDescuentos(client, filters);
    assert.equal(calls.length, 1);
    return calls[0];
  }

  it("todos los filtros en el orden documentado", async () => {
    assert.deepEqual(
      sentDataFields(await requestFor({ codigoUnicoFinal: "SINT-CG-99", codigoSubgrupo: "SS1", codigoUnicoInicial: "SINT-CG-01", codigoGrupo: "GS1", codigoFamilia: "FS1" }), CGD_OP).slice(2),
      [["CodigoFamilia", "FS1"], ["CodigoGrupo", "GS1"], ["CodigoSubgrupo", "SS1"], ["CodigoUnicoInicial", "SINT-CG-01"], ["CodigoUnicoFinal", "SINT-CG-99"]],
    );
  });

  it("solo categoría (familia / grupo / subgrupo) o solo rango son válidos", async () => {
    assert.deepEqual(sentDataFields(await requestFor({ codigoFamilia: "FS1" }), CGD_OP).slice(2), [["CodigoFamilia", "FS1"]]);
    assert.deepEqual(sentDataFields(await requestFor({ codigoSubgrupo: "SS1" }), CGD_OP).slice(2), [["CodigoSubgrupo", "SS1"]]);
    assert.deepEqual(sentDataFields(await requestFor({ codigoUnicoFinal: "000123" }), CGD_OP).slice(2), [["CodigoUnicoFinal", "000123"]]);
  });

  it("SOAP 1.2 con action ListarCuentasGruposDescuentos", async () => {
    assertSoap12Call(await requestFor(CGD_FILTERS), CGD_OP);
  });

  const invalidFilters: [string, unknown, RegExp][] = [
    ["filters null", null, /inválidos/],
    ["objeto vacío (todos los descuentos)", {}, /requires a code range or category filter/],
    ["todos vacíos/whitespace", { codigoFamilia: " ", codigoGrupo: "", codigoUnicoInicial: "  " }, /requires a code range or category filter/],
    ["categoría > 6", { codigoFamilia: "1234567" }, /excede 6 caracteres/],
    ["código > 22", { codigoUnicoInicial: "X".repeat(23) }, /excede 22 caracteres/],
    ["categoría no string", { codigoGrupo: 12 }, /debe ser texto/],
    ["clave desconocida", { nroCuenta: 1 }, /desconocido/],
  ];
  for (const [label, filters, message] of invalidFilters) {
    it(`listKoreCuentasGruposDescuentos con ${label} → invalid_argument antes de env/fetch`, async () => {
      const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => listKoreCuentasGruposDescuentos(filters as KoreCuentaGrupoDescuentoFilters), CGD);
      assert.match(assertKoreError(error, "invalid_argument").message, message);
      assert.equal(fetchCalls, 0);
    });
  }
});

describe("ListarCuentasGruposDescuentos → KoreCuentaGrupoDescuento[]", () => {
  const from = (xml: string) => fetchKoreCuentasGruposDescuentos(clientFor(xml).client, CGD_FILTERS);

  it("fila completa con raw + trim y doubles con raw; repetidas preservadas", async () => {
    const rows = await from(CGD);
    assert.equal(rows.length, 4);
    assert.deepEqual<KoreCuentaGrupoDescuento>(rows[0], {
      autonumerico: 21,
      codigoFamiliaRaw: "FS1".padEnd(6),
      codigoFamilia: "FS1",
      codigoGrupoRaw: "GS1".padEnd(6),
      codigoGrupo: "GS1",
      codigoSubgrupoRaw: "SS1".padEnd(6),
      codigoSubgrupo: "SS1",
      nroCuenta: 9001,
      codigoUnicoInicialRaw: "SINT-CG-01".padEnd(22),
      codigoUnicoInicial: "SINT-CG-01",
      codigoUnicoFinalRaw: "SINT-CG-99".padEnd(22),
      codigoUnicoFinal: "SINT-CG-99",
      descuento1Raw: "1",
      descuento1: 1,
      descuento2Raw: "2.5",
      descuento2: 2.5,
      descuento3Raw: "25",
      descuento3: 25,
      simboloRaw: "MS1",
      simbolo: "MS1",
      nroListaRaw: "2",
      nroLista: 2,
    });
    assert.deepEqual(rows[3], rows[0]);
  });

  it("vacíos, whitespace, negativos, exponente, NROLISTA decimal y fila sin campos", async () => {
    const [, second, empty] = await from(CGD);
    assert.deepEqual([second.codigoFamiliaRaw, second.codigoFamilia, second.codigoGrupoRaw, second.codigoGrupo, second.codigoSubgrupo], ["", "", "   ", "", null]);
    assert.deepEqual([second.nroCuenta, second.descuento2, second.descuento1Raw, second.descuento1, second.simbolo, second.nroListaRaw, second.nroLista], [0, -3.75, "1.5E1", 15, "", "2.5", 2.5]);
    assert.ok(Object.values(empty).every((value) => value === null));
  });

  it("xml:space=\"preserve\" en campos vacíos (ejemplo oficial) se acepta", async () => {
    const [, second] = await from(row(CGD, 2, "<CODIGOFAMILIA />", '<CODIGOFAMILIA xml:space="preserve"></CODIGOFAMILIA>'));
    assert.deepEqual([second.codigoFamiliaRaw, second.codigoFamilia], ["", ""]);
  });

  it("enteros y doubles inválidos, campo desconocido → invalid_data", async () => {
    await invalid(from(row(CGD, 1, "<AUTONUMERICO>21</AUTONUMERICO>", "<AUTONUMERICO>2.1</AUTONUMERICO>")), "DescuentoXCantidad row 1: invalid AUTONUMERICO");
    await invalid(from(row(CGD, 1, "<NROCUENTA>9001</NROCUENTA>", "<NROCUENTA>X</NROCUENTA>")), "DescuentoXCantidad row 1: invalid NROCUENTA");
    await invalid(from(row(CGD, 1, "<DESCUENTO1>1</DESCUENTO1>", "<DESCUENTO1>NaN</DESCUENTO1>")), "DescuentoXCantidad row 1: invalid DESCUENTO1");
    await invalid(from(row(CGD, 1, "<NROLISTA>2</NROLISTA>", "<NROLISTA>INF</NROLISTA>")), "DescuentoXCantidad row 1: invalid NROLISTA");
    await invalid(from(row(CGD, 1, "<NROLISTA>2</NROLISTA>", "<NROLISTA>2</NROLISTA><PORCDESCUENTO>1</PORCDESCUENTO>")), "DescuentoXCantidad row 1: unexpected field PORCDESCUENTO");
  });

  it("DataSet vacío (observado en KORE-20) → []", async () => {
    assert.deepEqual(await from(CGD.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "")), []);
  });

  it("API pública: env + 1 request; Fault con eco → detalle omitido", async () => {
    const { fetchImpl, calls } = mockFetch(() => soap12Response(CGD));
    assert.equal((await listKoreCuentasGruposDescuentos({ codigoFamilia: "FS1" }, { env: FAKE_ENV, fetchImpl })).length, 4);
    assert.equal(calls.length, 1);
    const fault = clientFor(soap12FaultEcho(`ECO-KORE FS1 ${escapeXml(FAKE_SECRET)}`), 500);
    const error = assertKoreError(await errorFrom(fetchKoreCuentasGruposDescuentos(fault.client, { codigoFamilia: "FS1" })), "soap_fault");
    assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
    assertNoMarkers(error, ["ECO-KORE"]);
  });
});
