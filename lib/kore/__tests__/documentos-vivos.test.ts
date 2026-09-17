import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import type { KoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { fetchKoreFacturasVivas, fetchKoreNotasCreditoVivas, fetchKoreRecibosVivos } from "../documentos-vivos.ts";
import type { KoreFacturaViva, KoreReciboVivo } from "../documentos-vivos.ts";
import { listKoreFacturasVivas, listKoreNotasCreditoVivas, listKoreRecibosVivos } from "../service.ts";
import { escapeXml } from "../xml.ts";
import { FAKE_ENV, mockFetch, readFixture, xmlResponse } from "./helpers.ts";
import {
  FAKE_SECRET,
  assertKoreError,
  assertNoMarkers,
  assertSoap11Call,
  assertSoap12Call,
  errorFrom,
  inRow,
  sentDataFields,
  serviceErrorWithoutNetwork,
  soap12FaultEcho,
} from "./pricing-helpers.ts";

const FACTURAS = readFixture("listar-facturas-vivas.ok.xml");
const NOTAS = readFixture("listar-notas-credito-vivas.ok.xml");
const RECIBOS = readFixture("listar-recibos-vivos.ok.xml");
const CUENTA = 424242;
const MARKERS = ["424242", "COMPROBANTE SINT", "910001", "920001", "4079.2164", "606.67", "MS1", "01/01/2099"];

type Soap = "1.1" | "1.2";

function clientForSoap(xml: string, soap: Soap, status = 200) {
  const contentType = soap === "1.2" ? "application/soap+xml; charset=utf-8" : "text/xml; charset=utf-8";
  const { fetchImpl, calls } = mockFetch(() => xmlResponse(xml, status, { "content-type": contentType }));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), fetchImpl, calls };
}

async function invalid(run: Promise<unknown>, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(run), "invalid_data");
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

const OPERATIONS: {
  op: string;
  soap: Soap;
  fixture: string;
  table: string;
  fetch: (client: KoreClient, nroCuenta: number) => Promise<unknown[]>;
  list: (nroCuenta: number, options?: object) => Promise<unknown[]>;
}[] = [
  { op: "ListarFacturasVivasxCuenta", soap: "1.1", fixture: FACTURAS, table: "FacturasVivas", fetch: fetchKoreFacturasVivas, list: listKoreFacturasVivas },
  { op: "ListarNotasCreditoVivasxCuenta", soap: "1.1", fixture: NOTAS, table: "FacturasVivas", fetch: fetchKoreNotasCreditoVivas, list: listKoreNotasCreditoVivas },
  { op: "ListarRecibosVivosxCuenta", soap: "1.2", fixture: RECIBOS, table: "RecibosVivos", fetch: fetchKoreRecibosVivos, list: listKoreRecibosVivos },
];

for (const { op, soap, fixture, table, fetch, list } of OPERATIONS) {
  describe(`${op}: NroCuenta obligatorio, request, estructura y privacidad`, () => {
    it(`Data exacto solo con NroCuenta (sin Direccion) y SOAP ${soap}`, async () => {
      const { client, calls } = clientForSoap(fixture, soap);
      await fetch(client, CUENTA);
      assert.equal(calls.length, 1);
      assert.deepEqual(sentDataFields(calls[0], op), [["NroEmpresa", "999"], ["SecretKey", FAKE_SECRET], ["NroCuenta", "424242"]]);
      if (soap === "1.2") assertSoap12Call(calls[0], op);
      else assertSoap11Call(calls[0], op);
    });

    const invalidAccounts: [string, unknown][] = [
      ["undefined", undefined],
      ["null", null],
      ["string", "424242"],
      ["decimal", 1.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["unsafe", 2 ** 53],
    ];
    for (const [label, nroCuenta] of invalidAccounts) {
      it(`nroCuenta ${label} → invalid_argument antes de env/fetch`, async () => {
        const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => list(nroCuenta as number), fixture);
        assert.match(assertKoreError(error, "invalid_argument").message, /nroCuenta/);
        assert.equal(fetchCalls, 0);
        const { client, calls } = clientForSoap(fixture, soap);
        assertKoreError(await errorFrom(fetch(client, nroCuenta as number)), "invalid_argument");
        assert.equal(calls.length, 0);
      });
    }

    it("filas en orden, repetidas preservadas; DataSet vacío (observado en KORE-21) → []", async () => {
      const rows = await fetch(clientForSoap(fixture, soap).client, CUENTA);
      assert.equal(rows.length, 5);
      assert.deepEqual(rows[4], rows[0]);
      assert.ok(Object.values(rows[3] as object).every((value) => value === null));
      assert.deepEqual(await fetch(clientForSoap(fixture.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, ""), soap).client, CUENTA), []);
    });

    it("campo desconocido y tabla inesperada → invalid_data", async () => {
      const firstField = /<(\w+)>[^<]*<\/\1>/.exec(fixture.slice(fixture.indexOf(`<${table} diffgr:id="${table}1"`)))![0];
      await invalid(fetch(clientForSoap(inRow(fixture, table, 1, firstField, `${firstField}<NroCuenta>424242</NroCuenta>`), soap).client, CUENTA), `${table} row 1: unexpected field NroCuenta`);
      await invalid(fetch(clientForSoap(fixture.replace("</xs:choice>", '<xs:element name="Extra"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), soap).client, CUENTA), "Unexpected KORE dataset entity: Extra");
    });

    it("API pública: env + 1 request; Fault con eco de cuenta y secreto → detalle omitido, sin reintentos", async () => {
      const ok = clientForSoap(fixture, soap);
      assert.equal((await list(CUENTA, { env: FAKE_ENV, fetchImpl: ok.fetchImpl })).length, 5);
      assert.equal(ok.calls.length, 1);
      const fault = clientForSoap(soap12FaultEcho(`ECO-KORE cuenta 424242 ${escapeXml(FAKE_SECRET)}`), soap, 500);
      const error = assertKoreError(await errorFrom(fetch(fault.client, CUENTA)), "soap_fault");
      assert.equal(fault.calls.length, 1);
      assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
      assertNoMarkers(error, ["ECO-KORE", "424242"]);
    });
  });
}

for (const { op, fixture, fetch } of OPERATIONS.slice(0, 2)) {
  describe(`${op} → filas FacturasVivas`, () => {
    const from = (xml: string) => fetch(clientForSoap(xml, "1.1").client, CUENTA) as Promise<KoreFacturaViva[]>;
    const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "FacturasVivas", n, search, replacement);

    it("fila completa: fechas como texto, raw exacto de importes y conveniencia numérica", async () => {
      const [first] = await from(fixture);
      assert.deepEqual<KoreFacturaViva>(first, {
        emisionRaw: "01/01/2099",
        emision: "01/01/2099",
        vencimientoRaw: "31/01/2099",
        vencimiento: "31/01/2099",
        comprobanteRaw: "COMPROBANTE SINT A",
        comprobante: "COMPROBANTE SINT A",
        numero: 910001,
        monedaRaw: "MS1",
        moneda: "MS1",
        totalRaw: "4079.2164",
        total: 4079.2164,
        saldoRaw: "4079.2164",
        saldo: 4079.2164,
      });
    });

    it("signos sin transformar, exponente, padding, vacíos y whitespace", async () => {
      const [, second, third] = await from(fixture);
      assert.deepEqual([second.vencimientoRaw, second.vencimiento, second.comprobanteRaw, second.comprobante, second.numero, second.moneda], ["", "", "  COMPROBANTE SINT B  ", "COMPROBANTE SINT B", 0, "MS2"]);
      assert.deepEqual([second.totalRaw, second.total, second.saldoRaw], ["-120.5", -120.5, "-1.4210854715202004E-14"]);
      assert.ok(second.saldo! < 0);
      assert.deepEqual([third.emisionRaw, third.emision, third.vencimiento, third.numero, third.total, third.saldoRaw], ["   ", "", null, -7, 0, "2540.9916000000003"]);
    });

    for (const [field, search, value] of [["Numero", "<Numero>910001</Numero>", "9.5"], ["Total", "<Total>4079.2164</Total>", "NaN"], ["Saldo", "<Saldo>4079.2164</Saldo>", "INF"], ["Total", "<Total>4079.2164</Total>", "4079,21"]] as const) {
      it(`${field} "${value}" → invalid_data`, async () => {
        await invalid(from(row(fixture, 1, search, `<${field}>${value}</${field}>`)), `FacturasVivas row 1: invalid ${field}`);
      });
    }
  });
}

describe("ListarRecibosVivosxCuenta → KoreReciboVivo[]", () => {
  const from = (xml: string) => fetchKoreRecibosVivos(clientForSoap(xml, "1.2").client, CUENTA);
  const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "RecibosVivos", n, search, replacement);

  it("fila completa, negativos, exponente, vacíos y whitespace", async () => {
    const [first, second, third] = await from(RECIBOS);
    assert.deepEqual<KoreReciboVivo>(first, {
      fechaRaw: "26/08/2099",
      fecha: "26/08/2099",
      numero: 920001,
      monedaRaw: "MS1",
      moneda: "MS1",
      montoRaw: "606.67",
      monto: 606.67,
      saldoRaw: "-1.4210854715202004E-14",
      saldo: -1.4210854715202004e-14,
    });
    assert.deepEqual([second.fechaRaw, second.fecha, second.numero, second.monedaRaw, second.moneda, second.saldo], ["", "", 0, "  ", "", 0]);
    assert.deepEqual([third.numero, third.monto, third.saldo], [-3, -181.11, 181.11]);
  });

  it("casing real (NUMERO/MONEDA/MONTO/SALDO): un campo con casing de FacturasVivas → invalid_data", async () => {
    await invalid(from(row(RECIBOS, 1, "<MONTO>606.67</MONTO>", "<Monto>606.67</Monto>")), "RecibosVivos row 1: unexpected field Monto");
  });

  for (const [field, search, value] of [["NUMERO", "<NUMERO>920001</NUMERO>", "X"], ["MONTO", "<MONTO>606.67</MONTO>", "-INF"], ["SALDO", "<SALDO>-1.4210854715202004E-14</SALDO>", ""]] as const) {
    it(`${field} "${value}" → invalid_data`, async () => {
      await invalid(from(row(RECIBOS, 1, search, `<${field}>${value}</${field}>`)), `RecibosVivos row 1: invalid ${field}`);
    });
  }
});
