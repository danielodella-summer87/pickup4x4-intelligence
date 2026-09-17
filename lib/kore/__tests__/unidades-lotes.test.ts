import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import type { KoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { fetchKoreLotes, fetchKoreLotesYUbicaciones } from "../lotes.ts";
import type { KoreLote, KoreLoteUbicacion } from "../lotes.ts";
import { listKoreLotes, listKoreLotesYUbicaciones, listKoreUnidadesYFactores } from "../service.ts";
import { fetchKoreUnidadesYFactores } from "../unidades.ts";
import type { KoreUnidadArticulo } from "../unidades.ts";
import { escapeXml } from "../xml.ts";
import { FAKE_ENV, mockFetch, readFixture, xmlResponse } from "./helpers.ts";
import {
  FAKE_SECRET,
  assertKoreError,
  assertNoMarkers,
  assertSoap11Call,
  assertSoap12Call,
  clientFor,
  errorFrom,
  inRow,
  sentDataFields,
  serviceErrorWithoutNetwork,
  soap12FaultEcho,
} from "./pricing-helpers.ts";

const UNIDADES = readFixture("listar-unidades-y-factores.ok.xml");
const LOTES = readFixture("listar-lotes.ok.xml");
const UBICACIONES = readFixture("listar-lotes-y-ubicaciones.ok.xml");
const CODE = "SINT-ART-01";
const MARKERS = [CODE, "UNIDAD SINT", "LOTE-SINT", "ESTADO SINT", "UBICACION SINT", "UB-1", "31/12/2099"];

type CodeOperation = {
  op: string;
  soap: "1.1" | "1.2";
  fixture: string;
  table: string;
  fetch: (client: KoreClient, codigo: string) => Promise<unknown[]>;
  list: (codigo: string, options?: object) => Promise<unknown[]>;
};

const OPERATIONS: CodeOperation[] = [
  { op: "ListarUnidadesYFactoresxArticulo", soap: "1.2", fixture: UNIDADES, table: "UNIDADES", fetch: fetchKoreUnidadesYFactores, list: listKoreUnidadesYFactores },
  { op: "ListarLotesxCodigoUnico", soap: "1.1", fixture: LOTES, table: "Lotes", fetch: fetchKoreLotes, list: listKoreLotes },
  { op: "ListarLotesYUbicacionesxCodigoUnico", soap: "1.2", fixture: UBICACIONES, table: "Lotes", fetch: fetchKoreLotesYUbicaciones, list: listKoreLotesYUbicaciones },
];

function soap11Response(body: string, status = 200): Response {
  return xmlResponse(body, status);
}

function clientForSoap(xml: string, soap: "1.1" | "1.2", status = 200) {
  if (soap === "1.2") return clientFor(xml, status);
  const { fetchImpl, calls } = mockFetch(() => soap11Response(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

async function invalid(run: Promise<unknown>, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(run), "invalid_data");
  assert.equal(error.message, message);
  assertNoMarkers(error, MARKERS);
}

for (const { op, soap, fixture, table, fetch, list } of OPERATIONS) {
  describe(`${op}: código obligatorio, request y privacidad`, () => {
    async function requestFor(codigo: string) {
      const { client, calls } = clientForSoap(fixture, soap);
      await fetch(client, codigo);
      assert.equal(calls.length, 1);
      return calls[0];
    }

    it(`CodigoUnico exacto (ceros iniciales, escape XML) y SOAP ${soap}`, async () => {
      assert.deepEqual(sentDataFields(await requestFor("000123"), op), [["NroEmpresa", "999"], ["SecretKey", FAKE_SECRET], ["CodigoUnico", "000123"]]);
      const codigo = `A&B<C>"D'`;
      const call = await requestFor(codigo);
      assert.ok(String(call.init.body).includes(escapeXml(codigo)));
      if (soap === "1.2") assertSoap12Call(call, op);
      else assertSoap11Call(call, op);
    });

    const invalidCodes: [string, unknown, RegExp][] = [
      ["vacío", "", /requires codigoUnico/],
      ["whitespace", "   ", /requires codigoUnico/],
      ["> 22", "X".repeat(23), /excede 22 caracteres/],
      ["no string", 42, /debe ser texto/],
      ["null", null, /debe ser texto/],
      ["undefined", undefined, /debe ser texto/],
    ];
    for (const [label, codigo, message] of invalidCodes) {
      it(`código ${label} → invalid_argument antes de env/fetch`, async () => {
        const { error, fetchCalls } = await serviceErrorWithoutNetwork(() => list(codigo as string), fixture);
        assert.match(assertKoreError(error, "invalid_argument").message, message);
        assert.equal(fetchCalls, 0);
        const { client, calls } = clientForSoap(fixture, soap);
        assertKoreError(await errorFrom(fetch(client, codigo as string)), "invalid_argument");
        assert.equal(calls.length, 0);
      });
    }

    it("filas repetidas preservadas; DataSet vacío (observado en KORE-20) → []", async () => {
      const rows = await fetch(clientForSoap(fixture, soap).client, CODE);
      assert.equal(rows.length, 5);
      assert.deepEqual(rows[4], rows[0]);
      assert.deepEqual(await fetch(clientForSoap(fixture.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, ""), soap).client, CODE), []);
    });

    it("campo desconocido y tabla inesperada → invalid_data", async () => {
      const firstField = /<(\w+)>[^<]*<\/\1>/.exec(fixture.slice(fixture.indexOf(`<${table} diffgr:id="${table}1"`)))![0];
      await invalid(fetch(clientForSoap(inRow(fixture, table, 1, firstField, `${firstField}<CODIGOUNICO>${CODE}</CODIGOUNICO>`), soap).client, CODE), `${table} row 1: unexpected field CODIGOUNICO`);
      await invalid(fetch(clientForSoap(fixture.replace("</xs:choice>", '<xs:element name="Extra"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>'), soap).client, CODE), "Unexpected KORE dataset entity: Extra");
    });

    it("API pública: env + 1 request; Fault con eco del código → detalle omitido, sin reintentos", async () => {
      const ok = clientForSoap(fixture, soap);
      assert.equal((await list(CODE, { env: FAKE_ENV, fetchImpl: (url: string, init: RequestInit) => (ok.calls.push({ url, init }), Promise.resolve(soap === "1.2" ? clientResponse12(fixture) : soap11Response(fixture))) })).length, 5);
      assert.equal(ok.calls.length, 1);
      const fault = clientForSoap(soap12FaultEcho(`ECO-KORE ${CODE} ${escapeXml(FAKE_SECRET)}`), soap, 500);
      const error = assertKoreError(await errorFrom(fetch(fault.client, CODE)), "soap_fault");
      assert.equal(fault.calls.length, 1);
      assert.equal(error.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
      assertNoMarkers(error, ["ECO-KORE", CODE]);
    });
  });
}

function clientResponse12(body: string): Response {
  return xmlResponse(body, 200, { "content-type": "application/soap+xml; charset=utf-8" });
}

describe("ListarUnidadesYFactoresxArticulo → KoreUnidadArticulo[]", () => {
  const from = (xml: string) => fetchKoreUnidadesYFactores(clientFor(xml).client, CODE);
  const row = (xml: string, n: number, search: string, replacement: string) => inRow(xml, "UNIDADES", n, search, replacement);

  it("fila completa, unsignedByte 0 y 255, factor decimal/entero/negativo/exponente, vacíos y ausentes", async () => {
    const rows = await from(UNIDADES);
    assert.deepEqual<KoreUnidadArticulo>(rows[0], { nroUnidad: 2, unidadRaw: "UNIDAD SINT A".padEnd(20), unidad: "UNIDAD SINT A", factorRaw: "0.05", factor: 0.05 });
    assert.deepEqual(rows[1], { nroUnidad: 0, unidadRaw: "", unidad: "", factorRaw: "12", factor: 12 });
    assert.deepEqual(rows[2], { nroUnidad: 255, unidadRaw: "   ", unidad: "", factorRaw: "-2.5E-1", factor: -0.25 });
    assert.deepEqual(rows[3], { nroUnidad: null, unidadRaw: null, unidad: null, factorRaw: null, factor: null });
  });

  for (const value of ["-1", "256", "1.5", "UNO", ""]) {
    it(`NROUNIDAD "${value}" fuera de xs:unsignedByte → invalid_data`, async () => {
      await invalid(from(row(UNIDADES, 1, "<NROUNIDAD>2</NROUNIDAD>", `<NROUNIDAD>${value}</NROUNIDAD>`)), "UNIDADES row 1: invalid NROUNIDAD");
    });
  }

  for (const value of ["NaN", "INF", "", "0,05"]) {
    it(`FACTOR "${value}" → invalid_data`, async () => {
      await invalid(from(row(UNIDADES, 1, "<FACTOR>0.05</FACTOR>", `<FACTOR>${value}</FACTOR>`)), "UNIDADES row 1: invalid FACTOR");
    });
  }
});

describe("ListarLotesxCodigoUnico → KoreLote[]", () => {
  const from = (xml: string) => fetchKoreLotes(clientForSoap(xml, "1.1").client, CODE);

  it("fila completa, FechaVencimiento como texto (sin parsear), cantidad con signo, vacíos y ausentes", async () => {
    const rows = await from(LOTES);
    assert.deepEqual<KoreLote>(rows[0], {
      loteRaw: "LOTE-SINT-1".padEnd(15),
      lote: "LOTE-SINT-1",
      estadoRaw: "ESTADO SINT A",
      estado: "ESTADO SINT A",
      fechaVencimientoRaw: "31/12/2099",
      fechaVencimiento: "31/12/2099",
      cantidadRaw: "15",
      cantidad: 15,
    });
    assert.deepEqual([rows[1].fechaVencimientoRaw, rows[1].fechaVencimiento, rows[1].cantidadRaw, rows[1].cantidad], ["", "", "-2.5", -2.5]);
    assert.deepEqual([rows[2].loteRaw, rows[2].lote, rows[2].estadoRaw, rows[2].estado, rows[2].fechaVencimiento, rows[2].cantidad], ["", "", "  ", "", "FECHA-SINT", 0]);
    assert.ok(Object.values(rows[3]).every((value) => value === null));
  });

  for (const value of ["NaN", "-INF", "", "quince"]) {
    it(`Cantidad "${value}" → invalid_data`, async () => {
      await invalid(from(inRow(LOTES, "Lotes", 1, "<Cantidad>15</Cantidad>", `<Cantidad>${value}</Cantidad>`)), "Lotes row 1: invalid Cantidad");
    });
  }

  it("CodigoUbicacion (solo del otro método) → invalid_data en ListarLotesxCodigoUnico", async () => {
    await invalid(from(inRow(LOTES, "Lotes", 1, "<Cantidad>15</Cantidad>", "<Cantidad>15</Cantidad><CodigoUbicacion>UB-1</CodigoUbicacion>")), "Lotes row 1: unexpected field CodigoUbicacion");
  });
});

describe("ListarLotesYUbicacionesxCodigoUnico → KoreLoteUbicacion[]", () => {
  const from = (xml: string) => fetchKoreLotesYUbicaciones(clientFor(xml).client, CODE);

  it("fila completa, mismo lote en varias filas por estado, negativos, exponente, vacíos y ausentes", async () => {
    const rows = await from(UBICACIONES);
    assert.deepEqual<KoreLoteUbicacion>(rows[0], {
      loteRaw: "LOTE-SINT-1",
      lote: "LOTE-SINT-1",
      estadoRaw: "ESTADO SINT A",
      estado: "ESTADO SINT A",
      codigoUbicacionRaw: "UB-1".padEnd(10),
      codigoUbicacion: "UB-1",
      ubicacionRaw: "UBICACION SINT A".padEnd(30),
      ubicacion: "UBICACION SINT A",
      fechaVencimientoRaw: "31/12/2099",
      fechaVencimiento: "31/12/2099",
      cantidadRaw: "25",
      cantidad: 25,
    });
    assert.deepEqual([rows[1].lote, rows[1].estado, rows[1].cantidad], ["LOTE-SINT-1", "ESTADO SINT B", -15]);
    assert.deepEqual([rows[2].codigoUbicacionRaw, rows[2].codigoUbicacion, rows[2].ubicacionRaw, rows[2].ubicacion, rows[2].cantidadRaw, rows[2].cantidad], ["", "", "   ", "", "1.25E2", 125]);
    assert.ok(Object.values(rows[3]).every((value) => value === null));
  });

  it("typo del PDF CodigoUbicocacion → invalid_data (el contrato real es CodigoUbicacion)", async () => {
    await invalid(from(inRow(UBICACIONES, "Lotes", 1, `<CodigoUbicacion>${"UB-1".padEnd(10)}</CodigoUbicacion>`, "<CodigoUbicocacion>UB-1</CodigoUbicocacion>")), "Lotes row 1: unexpected field CodigoUbicocacion");
  });

  it("Cantidad no finita → invalid_data", async () => {
    await invalid(from(inRow(UBICACIONES, "Lotes", 1, "<Cantidad>25</Cantidad>", "<Cantidad>1e400</Cantidad>")), "Lotes row 1: invalid Cantidad");
  });
});
