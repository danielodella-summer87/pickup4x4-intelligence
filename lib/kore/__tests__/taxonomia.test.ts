import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { listKoreFamilias, listKoreGrupos, listKoreSubgrupos } from "../service.ts";
import {
  fetchKoreFamilias,
  fetchKoreGrupos,
  fetchKoreSubgrupos,
  findOrphanGrupos,
  findOrphanSubgrupos,
  grupoKey,
  subgrupoKey,
} from "../taxonomia.ts";
import type { KoreFamilia, KoreGrupo, KoreSubgrupo } from "../taxonomia.ts";
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

const FAMILIAS = readFixture("listar-familias.ok.xml");
const GRUPOS = readFixture("listar-grupos.ok.xml");
const SUBGRUPOS = readFixture("listar-subgrupos.ok.xml");

const c = (value: string) => value.padEnd(6);
const d = (value: string) => value.padEnd(30);

/** Textos y códigos sintéticos distintivos: nunca deben aparecer en errores. */
const ROW_MARKERS = ["SINTETIC", "ZQ7", "0011", "00200"];

function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => xmlResponse(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

const familiasFrom = (xml: string) => fetchKoreFamilias(clientFor(xml).client);
const gruposFrom = (xml: string) => fetchKoreGrupos(clientFor(xml).client);
const subgruposFrom = (xml: string) => fetchKoreSubgrupos(clientFor(xml).client);

async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

/** Reemplaza `search` solo dentro de la fila `row` (base 1) de la tabla. */
function inRow(xml: string, table: string, row: number, search: string, replacement: string): string {
  const start = xml.indexOf(`<${table} diffgr:id="${table}${row}"`);
  const end = xml.indexOf(`</${table}>`, start);
  const block = xml.slice(start, end);
  assert.ok(start >= 0 && block.includes(search), `el fixture no contiene ${search} en ${table} fila ${row}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

function withoutRows(xml: string): string {
  return xml.replace(/<NewDataSet xmlns="">[\s\S]*<\/NewDataSet>/, "");
}

function assertNoRowData(error: unknown): void {
  const renderings = [
    String(error),
    error instanceof Error ? (error.stack ?? "") : "",
    JSON.stringify(error),
    inspect(error, { depth: 10, showHidden: true }),
  ].join("\n");
  for (const marker of ROW_MARKERS) assert.ok(!renderings.includes(marker), "dato de fila en el error");
}

async function invalid(promise: Promise<unknown>, message: string): Promise<void> {
  const error = assertKoreError(await errorFrom(promise), "invalid_data");
  assert.equal(error.message, message);
  assertNoRowData(error);
  assertNoSecret(error);
}

describe("ListarFamilias → KoreFamilia[]", () => {
  it("parsea el catálogo: raw exacto (padding) y normalizado = trim", async () => {
    const familias = await familiasFrom(FAMILIAS);
    assert.equal(familias.length, 4);
    assert.deepEqual<KoreFamilia>(familias[1], {
      codigoFamilia: "01",
      codigoFamiliaRaw: c("01"),
      descripcion: "FAMILIA SINTETICA A",
      descripcionRaw: d("FAMILIA SINTETICA A"),
      descuentoMaximo: 0,
      autonumerado: 2,
    });
    assert.deepEqual(Object.keys(familias[0]), [
      "codigoFamilia", "codigoFamiliaRaw", "descripcion", "descripcionRaw", "descuentoMaximo", "autonumerado",
    ]);
  });

  it("blank KORE taxonomy record es válido y se preserva", async () => {
    const [blank] = await familiasFrom(FAMILIAS);
    assert.deepEqual(blank, {
      codigoFamilia: "",
      codigoFamiliaRaw: c(""),
      descripcion: "",
      descripcionRaw: d(""),
      descuentoMaximo: 0,
      autonumerado: 1,
    });
  });

  it("códigos con ceros iniciales o letras siguen siendo strings", async () => {
    const familias = await familiasFrom(FAMILIAS);
    assert.equal(familias[2].codigoFamilia, "007");
    assert.equal(familias[3].codigoFamilia, "ZQ7");
    for (const familia of familias) assert.equal(typeof familia.codigoFamilia, "string");
  });

  it("CODIGOFAMILIA presente con whitespace → blank válido (raw preservado, normalizado \"\")", async () => {
    const xml = inRow(FAMILIAS, "Familia", 1, `<CODIGOFAMILIA>${c("")}</CODIGOFAMILIA>`, "<CODIGOFAMILIA>\t  </CODIGOFAMILIA>");
    const [blank] = await familiasFrom(xml);
    assert.equal(blank.codigoFamiliaRaw, "\t  ");
    assert.equal(blank.codigoFamilia, "");
  });

  it("CODIGOFAMILIA ausente → invalid_data (no colapsa a blank)", async () => {
    await invalid(familiasFrom(inRow(FAMILIAS, "Familia", 2, `<CODIGOFAMILIA>${c("01")}</CODIGOFAMILIA>`, "")), "Familia row 2: missing CODIGOFAMILIA");
  });

  it("CODIGOFAMILIA ausente en el blank real → invalid_data", async () => {
    await invalid(familiasFrom(inRow(FAMILIAS, "Familia", 1, `<CODIGOFAMILIA>${c("")}</CODIGOFAMILIA>`, "")), "Familia row 1: missing CODIGOFAMILIA");
  });

  it("código duplicado tras trim → invalid_data", async () => {
    await invalid(familiasFrom(inRow(FAMILIAS, "Familia", 4, c("ZQ7"), "  01  ")), "Familia row 4: duplicate CODIGOFAMILIA");
  });

  it("segundo registro blank (duplicado de la clave \"\") → invalid_data", async () => {
    await invalid(familiasFrom(inRow(FAMILIAS, "Familia", 4, c("ZQ7"), "   ")), "Familia row 4: duplicate CODIGOFAMILIA");
  });

  describe("DESCUENTOMAXIMO", () => {
    it("ausente → null", async () => {
      const [, familia] = await familiasFrom(inRow(FAMILIAS, "Familia", 2, "<DESCUENTOMAXIMO>0</DESCUENTOMAXIMO>", ""));
      assert.equal(familia.descuentoMaximo, null);
    });

    it("entero, decimal y >100 válidos", async () => {
      const familias = await familiasFrom(FAMILIAS);
      assert.deepEqual(familias.map((f) => f.descuentoMaximo), [0, 0, 12.5, 150]);
    });

    for (const [label, value, expected] of [["negativo", "-3", -3], ["exponente", "1.5E2", 150], ["con espacios", " 7.5 ", 7.5]] as const) {
      it(`${label} válido`, async () => {
        const xml = inRow(FAMILIAS, "Familia", 2, "<DESCUENTOMAXIMO>0</DESCUENTOMAXIMO>", `<DESCUENTOMAXIMO>${value}</DESCUENTOMAXIMO>`);
        const [, familia] = await familiasFrom(xml);
        assert.equal(familia.descuentoMaximo, expected);
      });
    }

    for (const [label, value] of [["vacío", ""], ["whitespace", "  "], ["texto", "abc"], ["NaN", "NaN"], ["INF", "INF"], ["Infinity", "Infinity"], ["hexadecimal", "0x10"], ["coma decimal", "1,5"], ["overflow", "1e999"]] as const) {
      it(`${label} → invalid_data`, async () => {
        const xml = inRow(FAMILIAS, "Familia", 2, "<DESCUENTOMAXIMO>0</DESCUENTOMAXIMO>", `<DESCUENTOMAXIMO>${value}</DESCUENTOMAXIMO>`);
        await invalid(familiasFrom(xml), "Familia row 2: invalid DESCUENTOMAXIMO");
      });
    }
  });

  describe("AUTONUMERADO", () => {
    it("ausente → null; dos ausentes no colisionan", async () => {
      const xml = inRow(inRow(FAMILIAS, "Familia", 2, "<AUTONUMERADO>2</AUTONUMERADO>", ""), "Familia", 3, "<AUTONUMERADO>3</AUTONUMERADO>", "");
      const familias = await familiasFrom(xml);
      assert.deepEqual(familias.map((f) => f.autonumerado), [1, null, null, 4]);
    });

    it("válido como number entero", async () => {
      const familias = await familiasFrom(FAMILIAS);
      assert.deepEqual(familias.map((f) => f.autonumerado), [1, 2, 3, 4]);
    });

    for (const [label, value] of [["vacío", ""], ["whitespace", " \t "], ["decimal", "2.5"], ["texto", "X"], ["fuera de xs:int", "2147483648"]] as const) {
      it(`${label} → invalid_data`, async () => {
        const xml = inRow(FAMILIAS, "Familia", 2, "<AUTONUMERADO>2</AUTONUMERADO>", `<AUTONUMERADO>${value}</AUTONUMERADO>`);
        await invalid(familiasFrom(xml), "Familia row 2: invalid AUTONUMERADO");
      });
    }

    it("duplicado dentro de la entidad → invalid_data", async () => {
      await invalid(familiasFrom(inRow(FAMILIAS, "Familia", 3, "<AUTONUMERADO>3</AUTONUMERADO>", "<AUTONUMERADO>2</AUTONUMERADO>")), "Familia row 3: duplicate AUTONUMERADO");
    });
  });

  describe("contrato estricto", () => {
    it("campo desconocido → invalid_data", async () => {
      const xml = inRow(FAMILIAS, "Familia", 3, "<AUTONUMERADO>3</AUTONUMERADO>", "<AUTONUMERADO>3</AUTONUMERADO><NOMBRE>FAMILIA SINTETICA X</NOMBRE>");
      await invalid(familiasFrom(xml), "Familia row 3: unexpected field NOMBRE");
    });

    it("tabla desconocida con filas → invalid_data", async () => {
      const xml = FAMILIAS.replace("</NewDataSet>", '<Grupo diffgr:id="Grupo1" msdata:rowOrder="0"><CODIGOGRUPO>ZQ7</CODIGOGRUPO></Grupo></NewDataSet>');
      await invalid(familiasFrom(xml), "Unexpected KORE dataset entity: Grupo");
    });

    it("tabla extra solo declarada en el esquema → invalid_data", async () => {
      const xml = withoutRows(FAMILIAS).replace("</xs:choice>", '<xs:element name="Otra"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>');
      await invalid(familiasFrom(xml), "Unexpected KORE dataset entity: Otra");
    });

    it("DataSet vacío → []", async () => {
      assert.deepEqual(await familiasFrom(withoutRows(FAMILIAS)), []);
    });
  });
});

describe("ListarGrupos → KoreGrupo[]", () => {
  it("padding en familia y grupo: raw exacto y normalizado", async () => {
    const grupos = await gruposFrom(GRUPOS);
    assert.equal(grupos.length, 5);
    assert.deepEqual<KoreGrupo>(grupos[3], {
      codigoFamilia: "007",
      codigoFamiliaRaw: c("007"),
      codigoGrupo: "0011",
      codigoGrupoRaw: c("0011"),
      descripcion: "GRUPO SINTETICO C",
      descripcionRaw: d("GRUPO SINTETICO C"),
      descuentoMaximo: 0,
      autonumerado: 22,
    });
  });

  it("blank/blank es válido", async () => {
    const [blank] = await gruposFrom(GRUPOS);
    assert.deepEqual(
      [blank.codigoFamilia, blank.codigoFamiliaRaw, blank.codigoGrupo, blank.codigoGrupoRaw, blank.descripcion],
      ["", c(""), "", c(""), ""],
    );
  });

  it("blank/blank presente con whitespace es válido", async () => {
    const [blank] = await gruposFrom(GRUPOS);
    assert.deepEqual([blank.codigoFamiliaRaw.length, blank.codigoGrupoRaw.length], [6, 6]);
    assert.deepEqual(findOrphanGrupos([{ codigoFamilia: "" }], [blank]), []);
  });

  for (const [field, value] of [["CODIGOFAMILIA", "007"], ["CODIGOGRUPO", "0011"]] as const) {
    it(`${field} ausente → invalid_data`, async () => {
      await invalid(gruposFrom(inRow(GRUPOS, "Grupo", 4, `<${field}>${c(value)}</${field}>`, "")), `Grupo row 4: missing ${field}`);
    });
    it(`${field} ausente en el blank/blank → invalid_data`, async () => {
      await invalid(gruposFrom(inRow(GRUPOS, "Grupo", 1, `<${field}>${c("")}</${field}>`, "")), `Grupo row 1: missing ${field}`);
    });
  }

  it("mismo codigoGrupo bajo familias diferentes está permitido", async () => {
    const grupos = await gruposFrom(GRUPOS);
    assert.deepEqual([grupoKey(grupos[1]), grupoKey(grupos[2])], [JSON.stringify(["01", "10"]), JSON.stringify(["007", "10"])]);
  });

  it("par (familia, grupo) duplicado tras trim → invalid_data", async () => {
    await invalid(gruposFrom(inRow(GRUPOS, "Grupo", 3, c("007"), " 01")), "Grupo row 3: duplicate CODIGOFAMILIA+CODIGOGRUPO");
  });

  it("AUTONUMERADO duplicado → invalid_data", async () => {
    await invalid(gruposFrom(inRow(GRUPOS, "Grupo", 5, "<AUTONUMERADO>23</AUTONUMERADO>", "<AUTONUMERADO>19</AUTONUMERADO>")), "Grupo row 5: duplicate AUTONUMERADO");
  });

  it("contrato estricto: campo desconocido y tabla desconocida", async () => {
    await invalid(gruposFrom(inRow(GRUPOS, "Grupo", 2, "<AUTONUMERADO>20</AUTONUMERADO>", "<AUTONUMERADO>20</AUTONUMERADO><CODIGOSUBGRUPO>100</CODIGOSUBGRUPO>")), "Grupo row 2: unexpected field CODIGOSUBGRUPO");
    await invalid(gruposFrom(GRUPOS.replace("</NewDataSet>", '<Familia diffgr:id="Familia1" msdata:rowOrder="0"><CODIGOFAMILIA>01</CODIGOFAMILIA></Familia></NewDataSet>')), "Unexpected KORE dataset entity: Familia");
  });
});

describe("ListarSubgrupos → KoreSubgrupo[]", () => {
  it("padding en los tres códigos: raw exacto y normalizado", async () => {
    const subgrupos = await subgruposFrom(SUBGRUPOS);
    assert.equal(subgrupos.length, 5);
    assert.deepEqual<KoreSubgrupo>(subgrupos[4], {
      codigoFamilia: "007",
      codigoFamiliaRaw: c("007"),
      codigoGrupo: "0011",
      codigoGrupoRaw: c("0011"),
      codigoSubgrupo: "00200",
      codigoSubgrupoRaw: c("00200"),
      descripcion: "SUBGRUPO SINTETICO D",
      descripcionRaw: d("SUBGRUPO SINTETICO D"),
      descuentoMaximo: 0,
      autonumerado: 34,
    });
  });

  it("blank/blank/blank es válido", async () => {
    const [blank] = await subgruposFrom(SUBGRUPOS);
    assert.deepEqual([blank.codigoFamilia, blank.codigoGrupo, blank.codigoSubgrupo, blank.codigoSubgrupoRaw], ["", "", "", c("")]);
  });

  it("blank/blank/blank presente con whitespace es válido", async () => {
    const [blank] = await subgruposFrom(SUBGRUPOS);
    assert.deepEqual([blank.codigoFamiliaRaw, blank.codigoGrupoRaw, blank.codigoSubgrupoRaw], [c(""), c(""), c("")]);
    assert.deepEqual(findOrphanSubgrupos([{ codigoFamilia: "", codigoGrupo: "" }], [blank]), []);
  });

  for (const [field, value] of [["CODIGOFAMILIA", "007"], ["CODIGOGRUPO", "0011"], ["CODIGOSUBGRUPO", "00200"]] as const) {
    it(`${field} ausente → invalid_data`, async () => {
      await invalid(subgruposFrom(inRow(SUBGRUPOS, "Subgrupo", 5, `<${field}>${c(value)}</${field}>`, "")), `Subgrupo row 5: missing ${field}`);
    });
    it(`${field} ausente en el blank/blank/blank → invalid_data`, async () => {
      await invalid(subgruposFrom(inRow(SUBGRUPOS, "Subgrupo", 1, `<${field}>${c("")}</${field}>`, "")), `Subgrupo row 1: missing ${field}`);
    });
  }

  it("mismo codigoSubgrupo bajo grupos distintos está permitido (no es único solo)", async () => {
    const subgrupos = await subgruposFrom(SUBGRUPOS);
    const same = subgrupos.filter((s) => s.codigoSubgrupo === "100");
    assert.equal(same.length, 3);
    assert.equal(new Set(same.map(subgrupoKey)).size, 3);
  });

  it("clave compuesta duplicada tras trim → invalid_data", async () => {
    await invalid(subgruposFrom(inRow(SUBGRUPOS, "Subgrupo", 5, c("00200"), "100   ")), "Subgrupo row 5: duplicate CODIGOFAMILIA+CODIGOGRUPO+CODIGOSUBGRUPO");
  });

  it("AUTONUMERADO duplicado → invalid_data", async () => {
    await invalid(subgruposFrom(inRow(SUBGRUPOS, "Subgrupo", 4, "<AUTONUMERADO>33</AUTONUMERADO>", "<AUTONUMERADO>31</AUTONUMERADO>")), "Subgrupo row 4: duplicate AUTONUMERADO");
  });

  it("contrato estricto: campo desconocido y tabla solo en esquema", async () => {
    await invalid(subgruposFrom(inRow(SUBGRUPOS, "Subgrupo", 2, "<AUTONUMERADO>31</AUTONUMERADO>", "<AUTONUMERADO>31</AUTONUMERADO><STOCK>1</STOCK>")), "Subgrupo row 2: unexpected field STOCK");
    const extraSchema = withoutRows(SUBGRUPOS).replace("</xs:choice>", '<xs:element name="Articulo"><xs:complexType><xs:sequence /></xs:complexType></xs:element></xs:choice>');
    await invalid(subgruposFrom(extraSchema), "Unexpected KORE dataset entity: Articulo");
  });
});

describe("Taxonomía: integridad jerárquica (helpers puros)", () => {
  it("fixtures completas: sin huérfanos; blank referencia a blank", async () => {
    const [familias, grupos, subgrupos] = await Promise.all([familiasFrom(FAMILIAS), gruposFrom(GRUPOS), subgruposFrom(SUBGRUPOS)]);
    assert.deepEqual(findOrphanGrupos(familias, grupos), []);
    assert.deepEqual(findOrphanSubgrupos(grupos, subgrupos), []);
  });

  it("Grupo blank queda huérfano si falta la Familia blank", async () => {
    const [familias, grupos] = await Promise.all([familiasFrom(FAMILIAS), gruposFrom(GRUPOS)]);
    assert.deepEqual(findOrphanGrupos(familias.filter((f) => f.codigoFamilia !== ""), grupos), [0]);
  });

  it("Subgrupo blank queda huérfano si falta el Grupo blank", async () => {
    const [grupos, subgrupos] = await Promise.all([gruposFrom(GRUPOS), subgruposFrom(SUBGRUPOS)]);
    assert.deepEqual(findOrphanSubgrupos(grupos.filter((g) => g.codigoGrupo !== ""), subgrupos), [0]);
  });

  it("la clave compuesta exige el par exacto (familia, grupo), no códigos sueltos", () => {
    const grupos = [{ codigoFamilia: "01", codigoGrupo: "10" }, { codigoFamilia: "007", codigoGrupo: "0011" }];
    const subgrupos = [
      { codigoFamilia: "01", codigoGrupo: "10" },
      { codigoFamilia: "01", codigoGrupo: "0011" },
      { codigoFamilia: "007", codigoGrupo: "10" },
    ];
    assert.deepEqual(findOrphanSubgrupos(grupos, subgrupos), [1, 2]);
  });

  it("las claves se construyen sobre valores normalizados (no raw)", async () => {
    const [, familia] = await familiasFrom(FAMILIAS);
    assert.deepEqual(findOrphanGrupos([familia], [{ codigoFamilia: "01" }]), []);
    assert.deepEqual(findOrphanGrupos([familia], [{ codigoFamilia: c("01") }]), [0]);
  });
});

describe("Taxonomía: request, atomicidad y seguridad", () => {
  const cases = [
    ["listKoreFamilias", "ListarFamilias", FAMILIAS, (fetchImpl: never) => listKoreFamilias({ env: FAKE_ENV, fetchImpl })],
    ["listKoreGrupos", "ListarGrupos", GRUPOS, (fetchImpl: never) => listKoreGrupos({ env: FAKE_ENV, fetchImpl })],
    ["listKoreSubgrupos", "ListarSubgrupos", SUBGRUPOS, (fetchImpl: never) => listKoreSubgrupos({ env: FAKE_ENV, fetchImpl })],
  ] as const;

  for (const [name, operation, fixture, run] of cases) {
    it(`${name}: exactamente 1 request, SOAPAction ${operation}, Data solo con credenciales`, async () => {
      const { fetchImpl, calls } = mockFetch(() => xmlResponse(fixture));
      const items = await run(fetchImpl as never);
      assert.ok(items.length > 0);
      assert.equal(calls.length, 1);
      assert.equal((calls[0].init.headers as Record<string, string>).SOAPAction, `"http://tempuri.org/${operation}"`);
      const envelope = parseXml(String(calls[0].init.body));
      const data = childElements(firstChildElement(firstChildElement(firstChildElement(envelope, "Body")!, operation)!, "doc")!)[0];
      assert.equal(data.name, "Data");
      assert.deepEqual({ ...data.attributes }, {});
      assert.deepEqual(childElements(data).map((child) => [child.name, child.prefix]), [["NroEmpresa", null], ["SecretKey", null]]);
      assert.equal(textContent(childElements(data)[1]), FAKE_SECRET);
    });
  }

  it("SOAP Fault que repite el secreto → secreto redactado", async () => {
    const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", escapeXml(FAKE_SECRET));
    const { client, calls } = clientFor(fault, 500);
    const error = await errorFrom(fetchKoreSubgrupos(client));
    assertKoreError(error, "soap_fault");
    assert.equal(calls.length, 1, "sin reintentos");
    assertNoSecret(error);
  });

  it("config incompleta falla antes de cualquier request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(FAMILIAS));
    assertKoreError(await errorFrom(listKoreFamilias({ env: { ...FAKE_ENV, KORE_SECRET_KEY: "" }, fetchImpl })), "config");
    assert.equal(calls.length, 0);
  });
});
