import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { listKoreVendedores } from "../service.ts";
import { fetchKoreVendedores } from "../vendedores.ts";
import { escapeXml } from "../xml.ts";
import { FAKE_ENV, assertKoreError, assertNoSecret, mockFetch, readFixture, xmlResponse } from "./helpers.ts";

const OK = readFixture("listar-vendedores.ok.xml");

async function vendedoresFrom(xml: string) {
  const { fetchImpl } = mockFetch(() => xmlResponse(xml));
  return fetchKoreVendedores(createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }));
}

async function errorFrom(xml: string): Promise<unknown> {
  try {
    await vendedoresFrom(xml);
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

describe("ListarVendedores → KoreVendedor[]", () => {
  it("parsea múltiples vendedores preservando orden, vendedor 0 y huecos de IDs", async () => {
    const vendedores = await vendedoresFrom(OK);
    assert.deepEqual(vendedores, [
      { nroVendedor: 0, nombre: "VENDEDOR SINTETICO CERO" },
      { nroVendedor: 1, nombre: "VENDEDORA SINTÉTICA UNO" },
      { nroVendedor: 7, nombre: "PÉREZ & ASOCIADOS FICTICIO" },
      { nroVendedor: 42, nombre: "MUÑOZ FICTICIO" },
      { nroVendedor: 104, nombre: "VENDEDOR SINTETICO CIENTO CUATRO" },
    ]);
    for (const vendedor of vendedores) {
      assert.deepEqual(Object.keys(vendedor), ["nroVendedor", "nombre"]);
      assert.equal(typeof vendedor.nroVendedor, "number");
      assert.equal(typeof vendedor.nombre, "string");
    }
  });

  it("acepta el Result sin envoltorio <DataSet>", async () => {
    const unwrapped = OK.replace('<DataSet xmlns="">', "").replace("</DataSet>", "");
    assert.equal((await vendedoresFrom(unwrapped)).length, 5);
  });

  it("acepta el Result como XML escapado (texto)", async () => {
    const start = OK.indexOf("<ListarVendedoresResult>") + "<ListarVendedoresResult>".length;
    const end = OK.indexOf("</ListarVendedoresResult>");
    const escaped = OK.slice(0, start) + escapeXml(OK.slice(start, end)) + OK.slice(end);
    assert.deepEqual(await vendedoresFrom(escaped), await vendedoresFrom(OK));
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await vendedoresFrom(readFixture("listar-vendedores.empty.xml")), []);
  });

  it("NOMBRE opcional ausente o vacío → string vacío", async () => {
    assert.deepEqual(await vendedoresFrom(readFixture("listar-vendedores.optional-fields.xml")), [
      { nroVendedor: 3, nombre: "" },
      { nroVendedor: 9, nombre: "" },
    ]);
  });

  it("NROVENDEDOR ausente → invalid_data con número de fila, sin datos", async () => {
    const error = assertKoreError(await errorFrom(readFixture("listar-vendedores.missing-nro.xml")), "invalid_data");
    assert.match(error.message, /fila 2/);
    assert.doesNotMatch(error.message, /SINTETICO/);
  });

  it("NROVENDEDOR no entero → invalid_data", async () => {
    const xml = OK.replace("<NROVENDEDOR>42</NROVENDEDOR>", "<NROVENDEDOR>4.2</NROVENDEDOR>");
    assertKoreError(await errorFrom(xml), "invalid_data");
  });

  it("NROVENDEDOR fuera de rango int → invalid_data", async () => {
    const xml = OK.replace("<NROVENDEDOR>42</NROVENDEDOR>", "<NROVENDEDOR>9999999999</NROVENDEDOR>");
    assertKoreError(await errorFrom(xml), "invalid_data");
  });

  it("NROVENDEDOR duplicado → invalid_data", async () => {
    const xml = OK.replace("<NROVENDEDOR>42</NROVENDEDOR>", "<NROVENDEDOR>7</NROVENDEDOR>");
    const error = assertKoreError(await errorFrom(xml), "invalid_data");
    assert.match(error.message, /duplicado en la fila 4/);
  });

  it("Result sin DataSet/diffgram → parse", async () => {
    const start = OK.indexOf("<ListarVendedoresResult>") + "<ListarVendedoresResult>".length;
    const end = OK.indexOf("</ListarVendedoresResult>");
    assertKoreError(await errorFrom(OK.slice(0, start) + "<Otro/>" + OK.slice(end)), "parse");
  });
});

describe("listKoreVendedores (API pública interna)", () => {
  it("lee la config del env recibido y devuelve vendedores", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    const vendedores = await listKoreVendedores({ env: FAKE_ENV, fetchImpl });
    assert.equal(vendedores.length, 5);
    assert.equal(calls.length, 1);
  });

  it("config incompleta falla antes de cualquier request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    try {
      await listKoreVendedores({ env: { ...FAKE_ENV, KORE_BASE_URL: undefined }, fetchImpl });
      assert.fail("debía fallar");
    } catch (error) {
      assertKoreError(error, "config");
      assertNoSecret(error);
    }
    assert.equal(calls.length, 0);
  });
});
