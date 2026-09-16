import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { fetchKoreArticulos } from "../articulos.ts";
import type { KoreArticulo, KoreArticuloFilters } from "../articulos.ts";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { listKoreArticulos } from "../service.ts";
import { grupoKey, subgrupoKey } from "../taxonomia.ts";
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

const OK = readFixture("listar-articulos.ok.xml");
const EMPTY = readFixture("listar-articulos.empty.xml");
const ANY_FILTER: KoreArticuloFilters = { codigoUnicoInicial: "SINT-0001", codigoUnicoFinal: "SINT-0001" };

/** Textos comerciales sintéticos del fixture: nunca deben aparecer en errores. */
const COMMERCIAL_MARKERS = ["ARTICULO SINTETICO", "DESCRIPCION SINTETICA", "OBSERVACION SINTETICA", "SINT-0001", "00042"];

function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => xmlResponse(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

async function articulosFrom(xml: string, filters: KoreArticuloFilters = ANY_FILTER): Promise<KoreArticulo[]> {
  return fetchKoreArticulos(clientFor(xml).client, filters);
}

async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

/** Reemplaza `search` solo dentro de la fila indicada del fixture. */
function inRow(xml: string, row: number, search: string, replacement: string): string {
  const start = xml.indexOf(`<Articulo diffgr:id="Articulo${row}"`);
  const end = xml.indexOf("</Articulo>", start);
  const block = xml.slice(start, end);
  assert.ok(block.includes(search), `el fixture no contiene ${search} en la fila ${row}`);
  return xml.slice(0, start) + block.replace(search, replacement) + xml.slice(end);
}

function assertNoCommercialData(error: unknown, extra: readonly string[] = []): void {
  const renderings = [
    String(error),
    error instanceof Error ? (error.stack ?? "") : "",
    JSON.stringify(error),
    inspect(error, { depth: 10, showHidden: true }),
  ].join("\n");
  for (const marker of [...COMMERCIAL_MARKERS, ...extra]) {
    assert.ok(!renderings.includes(marker), "un dato comercial aparece en el error");
  }
}

function sentDataFields(call: RecordedCall): [string, string][] {
  const envelope = parseXml(String(call.init.body));
  const operation = firstChildElement(firstChildElement(envelope, "Body")!, "ListarArticulos")!;
  const data = childElements(firstChildElement(operation, "doc")!)[0];
  assert.equal(data.name, "Data");
  assert.deepEqual({ ...data.attributes }, {});
  return childElements(data).map((child) => {
    assert.equal(child.prefix, null, "los hijos de Data van sin namespace");
    assert.deepEqual({ ...child.attributes }, {});
    return [child.name, textContent(child)];
  });
}

async function requestFor(filters: KoreArticuloFilters): Promise<RecordedCall> {
  const { client, calls } = clientFor(EMPTY);
  await fetchKoreArticulos(client, filters);
  assert.equal(calls.length, 1);
  return calls[0];
}

const EXPECTED: KoreArticulo[] = [
  {
    codigoUnico: "SINT-0001",
    codigoUnicoRaw: "SINT-0001",
    codigoFamilia: "007",
    codigoFamiliaRaw: "007",
    codigoGrupo: "012",
    codigoGrupoRaw: "012",
    codigoSubgrupo: "0003",
    codigoSubgrupoRaw: "0003",
    descripcion: "ARTICULO SINTETICO UNO",
    basico: 1,
    minimo: 0,
    exento: 1,
    deshabilitado: 0,
    controlaStock: 1,
    observaciones: "OBSERVACION SINTETICA",
  },
  {
    codigoUnico: "00042",
    codigoUnicoRaw: "  00042     ",
    codigoFamilia: "1",
    codigoFamiliaRaw: "1     ",
    codigoGrupo: "20",
    codigoGrupoRaw: "  20  ",
    codigoSubgrupo: "300",
    codigoSubgrupoRaw: "300   ",
    descripcion: "  DESCRIPCION SINTETICA CON ESPACIOS  ",
    basico: 0,
    minimo: 1,
    exento: 0,
    deshabilitado: 1,
    controlaStock: 0,
    observaciones: "",
  },
  {
    codigoUnico: "A&B-12/X.Ñ#",
    codigoUnicoRaw: "A&B-12/X.Ñ#",
    codigoFamilia: null,
    codigoFamiliaRaw: null,
    codigoGrupo: null,
    codigoGrupoRaw: null,
    codigoSubgrupo: null,
    codigoSubgrupoRaw: null,
    descripcion: "",
    basico: null,
    minimo: null,
    exento: null,
    deshabilitado: null,
    controlaStock: null,
    observaciones: "",
  },
];

describe("ListarArticulos → KoreArticulo[]", () => {
  it("parsea varios artículos con todos los campos, en orden", async () => {
    assert.deepEqual(await articulosFrom(OK), EXPECTED);
  });

  it("KoreArticulo expone exactamente los campos del contrato (sin marca/modelo/stock/precio)", async () => {
    const [articulo] = await articulosFrom(OK);
    assert.deepEqual(Object.keys(articulo), [
      "codigoUnico", "codigoUnicoRaw",
      "codigoFamilia", "codigoFamiliaRaw", "codigoGrupo", "codigoGrupoRaw", "codigoSubgrupo", "codigoSubgrupoRaw",
      "descripcion", "basico", "minimo", "exento", "deshabilitado", "controlaStock", "observaciones",
    ]);
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await articulosFrom(EMPTY), []);
  });
});

describe("ListarArticulos: identidad", () => {
  it("código válido sin padding: raw y normalizado iguales", async () => {
    const [sint] = await articulosFrom(OK);
    assert.equal(sint.codigoUnico, "SINT-0001");
    assert.equal(sint.codigoUnicoRaw, "SINT-0001");
  });

  it("código con padding: raw preservado exacto, codigoUnico recortado, ceros iniciales intactos", async () => {
    const [, padded] = await articulosFrom(OK);
    assert.equal(padded.codigoUnicoRaw, "  00042     ");
    assert.equal(padded.codigoUnico, "00042");
    assert.equal(typeof padded.codigoUnico, "string");
  });

  it("letras y símbolos se preservan", async () => {
    const [, , symbols] = await articulosFrom(OK);
    assert.equal(symbols.codigoUnico, "A&B-12/X.Ñ#");
  });

  const invalidIdentity: [string, string, string, string][] = [
    ["ausente", "<CODIGOUNICO>SINT-0001</CODIGOUNICO>", "", "Articulo row 1: missing CODIGOUNICO"],
    ["vacío", "<CODIGOUNICO>SINT-0001</CODIGOUNICO>", "<CODIGOUNICO />", "Articulo row 1: missing CODIGOUNICO"],
    ["whitespace-only", "<CODIGOUNICO>SINT-0001</CODIGOUNICO>", "<CODIGOUNICO> \t  </CODIGOUNICO>", "Articulo row 1: missing CODIGOUNICO"],
  ];
  for (const [label, search, replacement, message] of invalidIdentity) {
    it(`CODIGOUNICO ${label} → invalid_data`, async () => {
      const error = assertKoreError(await errorFrom(articulosFrom(inRow(OK, 1, search, replacement))), "invalid_data");
      assert.equal(error.message, message);
      assertNoCommercialData(error);
    });
  }

  it("duplicado exacto → invalid_data", async () => {
    const xml = inRow(OK, 3, "<CODIGOUNICO>A&amp;B-12/X.Ñ#</CODIGOUNICO>", "<CODIGOUNICO>SINT-0001</CODIGOUNICO>");
    const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
    assert.equal(error.message, "Articulo row 3: duplicate CODIGOUNICO");
    assertNoCommercialData(error);
  });

  it("colisión solo después de trim → invalid_data (unicidad sobre codigoUnico normalizado)", async () => {
    const xml = inRow(OK, 3, "<CODIGOUNICO>A&amp;B-12/X.Ñ#</CODIGOUNICO>", "<CODIGOUNICO>00042</CODIGOUNICO>");
    const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
    assert.equal(error.message, "Articulo row 3: duplicate CODIGOUNICO");
    assertNoCommercialData(error);
  });
});

describe("ListarArticulos: taxonomía raw + normalizada", () => {
  it("códigos sin padding: raw y normalizado iguales, strings con ceros iniciales", async () => {
    const [sint] = await articulosFrom(OK);
    assert.deepEqual([sint.codigoFamilia, sint.codigoGrupo, sint.codigoSubgrupo], ["007", "012", "0003"]);
    assert.deepEqual([sint.codigoFamiliaRaw, sint.codigoGrupoRaw, sint.codigoSubgrupoRaw], ["007", "012", "0003"]);
    for (const value of [sint.codigoFamilia, sint.codigoGrupo, sint.codigoSubgrupo]) assert.equal(typeof value, "string");
  });

  it("códigos con padding: raw preservado exacto, normalizado = trim", async () => {
    const [, padded] = await articulosFrom(OK);
    assert.deepEqual([padded.codigoFamiliaRaw, padded.codigoGrupoRaw, padded.codigoSubgrupoRaw], ["1     ", "  20  ", "300   "]);
    assert.deepEqual([padded.codigoFamilia, padded.codigoGrupo, padded.codigoSubgrupo], ["1", "20", "300"]);
  });

  it("taxonomía ausente (tag no enviado) → raw null y normalizado null", async () => {
    const [, , minimal] = await articulosFrom(OK);
    assert.deepEqual(
      [minimal.codigoFamilia, minimal.codigoFamiliaRaw, minimal.codigoGrupo, minimal.codigoGrupoRaw, minimal.codigoSubgrupo, minimal.codigoSubgrupoRaw],
      [null, null, null, null, null, null],
    );
  });

  it("tag presente vacío (<X />) → raw \"\" y normalizado \"\" (no null)", async () => {
    const xml = inRow(OK, 1, "<CODIGOFAMILIA>007</CODIGOFAMILIA>", "<CODIGOFAMILIA />");
    const [sint] = await articulosFrom(xml);
    assert.equal(sint.codigoFamiliaRaw, "");
    assert.equal(sint.codigoFamilia, "");
  });

  const taxonomyTags = [
    ["CODIGOFAMILIA", "codigoFamilia", "codigoFamiliaRaw"],
    ["CODIGOGRUPO", "codigoGrupo", "codigoGrupoRaw"],
    ["CODIGOSUBGRUPO", "codigoSubgrupo", "codigoSubgrupoRaw"],
  ] as const;
  for (const [tag, key, rawKey] of taxonomyTags) {
    it(`${tag} blank (whitespace-only) es válido: normalizado "", raw preservado`, async () => {
      const xml = OK.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>      </${tag}>`);
      const [sint] = await articulosFrom(xml);
      assert.equal(sint[key], "");
      assert.equal(sint[rawKey], "      ");
    });

    it(`${tag} solo dígitos con ceros iniciales nunca se convierte a number`, async () => {
      const xml = OK.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>000100</${tag}>`);
      const [sint] = await articulosFrom(xml);
      assert.equal(sint[key], "000100");
      assert.equal(typeof sint[key], "string");
    });
  }

  it("relación conceptual: null = sin relación observable; \"\" = relaciona con el blank real", async () => {
    // Relación observable solo si KORE envió todos los componentes (ninguno null).
    const grupoRelation = (a: KoreArticulo) =>
      a.codigoFamilia === null || a.codigoGrupo === null ? null : grupoKey({ codigoFamilia: a.codigoFamilia, codigoGrupo: a.codigoGrupo });
    const subgrupoRelation = (a: KoreArticulo) =>
      a.codigoFamilia === null || a.codigoGrupo === null || a.codigoSubgrupo === null
        ? null
        : subgrupoKey({ codigoFamilia: a.codigoFamilia, codigoGrupo: a.codigoGrupo, codigoSubgrupo: a.codigoSubgrupo });

    const blankXml = inRow(
      inRow(inRow(OK, 1, "<CODIGOFAMILIA>007</CODIGOFAMILIA>", "<CODIGOFAMILIA>      </CODIGOFAMILIA>"), 1, "<CODIGOGRUPO>012</CODIGOGRUPO>", "<CODIGOGRUPO>      </CODIGOGRUPO>"),
      1,
      "<CODIGOSUBGRUPO>0003</CODIGOSUBGRUPO>",
      "<CODIGOSUBGRUPO>      </CODIGOSUBGRUPO>",
    );
    const [blank, padded, absent] = await articulosFrom(blankXml);

    assert.equal(subgrupoRelation(blank), JSON.stringify(["", "", ""]), "blank presente relaciona con el blank real");
    assert.equal(grupoRelation(padded), JSON.stringify(["1", "20"]));
    assert.equal(subgrupoRelation(padded), JSON.stringify(["1", "20", "300"]));
    assert.equal(grupoRelation(absent), null, "tag ausente no produce relación");
    assert.equal(subgrupoRelation(absent), null);
    assert.notEqual(subgrupoRelation(absent), subgrupoRelation(blank));
  });
});

describe("ListarArticulos: flags", () => {
  const flags = [
    ["BASICO", "basico"],
    ["MINIMO", "minimo"],
    ["EXENTO", "exento"],
    ["DESHABILITADO", "deshabilitado"],
    ["CONTROLASTOCK", "controlaStock"],
  ] as const;

  it("cada flag acepta 0 y 1 (fila 1 y fila 2 cubren ambos valores)", async () => {
    const [row1, row2] = await articulosFrom(OK);
    for (const [, key] of flags) {
      assert.deepEqual([row1[key], row2[key]].sort(), [0, 1], key);
    }
  });

  it("cada flag ausente → null", async () => {
    const [, , minimal] = await articulosFrom(OK);
    for (const [, key] of flags) assert.equal(minimal[key], null, key);
  });

  it("BASICO/MINIMO/EXENTO no se validan como excluyentes", async () => {
    const [sint] = await articulosFrom(OK);
    assert.deepEqual([sint.basico, sint.minimo, sint.exento], [1, 0, 1]);
    const allZero = inRow(inRow(OK, 1, "<BASICO>1</BASICO>", "<BASICO>0</BASICO>"), 1, "<EXENTO>1</EXENTO>", "<EXENTO>0</EXENTO>");
    const [zeros] = await articulosFrom(allZero);
    assert.deepEqual([zeros.basico, zeros.minimo, zeros.exento], [0, 0, 0]);
  });

  const invalidValues: [string, string][] = [
    ["vacío", ""],
    ["whitespace", " \t "],
    ["2", "2"],
    ["-1", "-1"],
    ["texto", "SI"],
  ];
  for (const [tag] of flags) {
    for (const [label, value] of invalidValues) {
      it(`${tag} = ${label} → invalid_data`, async () => {
        const xml = OK.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>${value}</${tag}>`);
        const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
        assert.equal(error.message, `Articulo row 1: invalid ${tag}`);
      });
    }
  }
});

describe("ListarArticulos: strings", () => {
  it("descripcion y observaciones whitespace-only → \"\"", async () => {
    const xml = inRow(OK, 1, "<DESCRIPCION>ARTICULO SINTETICO UNO</DESCRIPCION>", "<DESCRIPCION>\n   \t</DESCRIPCION>");
    const [sint, padded] = await articulosFrom(xml);
    assert.equal(sint.descripcion, "");
    assert.equal(padded.observaciones, "");
  });

  it("contenido visible con espacios externos se conserva exacto", async () => {
    const [, padded] = await articulosFrom(OK);
    assert.equal(padded.descripcion, "  DESCRIPCION SINTETICA CON ESPACIOS  ");
  });
});

describe("ListarArticulos: protección de contrato", () => {
  it("tabla desconocida con filas → invalid_data", async () => {
    const xml = OK.replace(
      "</NewDataSet>",
      '<CodigoEquivalente diffgr:id="CodigoEquivalente1" msdata:rowOrder="0"><CODIGO>SINT-0001</CODIGO></CodigoEquivalente></NewDataSet>',
    );
    const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
    assert.equal(error.message, "Unexpected KORE dataset entity: CodigoEquivalente");
    assertNoCommercialData(error);
  });

  it("tabla extra solo declarada en el esquema → invalid_data", async () => {
    const xml = EMPTY.replace(
      "</xs:choice>",
      '<xs:element name="Stock"><xs:complexType><xs:sequence><xs:element name="CANTIDAD" type="xs:decimal" minOccurs="0" /></xs:sequence></xs:complexType></xs:element></xs:choice>',
    );
    const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
    assert.equal(error.message, "Unexpected KORE dataset entity: Stock");
  });

  it("campo desconocido → invalid_data sin valor", async () => {
    const xml = inRow(OK, 2, "<CONTROLASTOCK>0</CONTROLASTOCK>", "<CONTROLASTOCK>0</CONTROLASTOCK><MARCA>ARTICULO SINTETICO</MARCA>");
    const error = assertKoreError(await errorFrom(articulosFrom(xml)), "invalid_data");
    assert.equal(error.message, "Articulo row 2: unexpected field MARCA");
    assertNoCommercialData(error);
  });
});

describe("ListarArticulos: filtros y request", () => {
  it("SOAPAction de ListarArticulos; credenciales primero y luego el filtro", async () => {
    const call = await requestFor({ codigoUnicoInicial: "SINT-0001" });
    assert.equal((call.init.headers as Record<string, string>).SOAPAction, '"http://tempuri.org/ListarArticulos"');
    assert.deepEqual(sentDataFields(call).map(([name]) => name), ["NroEmpresa", "SecretKey", "CodigoUnicoInicial"]);
  });

  const individual: [keyof KoreArticuloFilters, string][] = [
    ["codigoUnicoInicial", "CodigoUnicoInicial"],
    ["codigoUnicoFinal", "CodigoUnicoFinal"],
    ["descripcion", "Descripcion"],
    ["codigoFamilia", "CodigoFamilia"],
    ["codigoGrupo", "CodigoGrupo"],
    ["codigoSubgrupo", "CodigoSubgrupo"],
  ];
  for (const [key, tag] of individual) {
    it(`filtro individual: ${key} → <${tag}> como string`, async () => {
      assert.deepEqual(sentDataFields(await requestFor({ [key]: "007" })).slice(2), [[tag, "007"]]);
    });
  }

  it("combinación de filtros en orden estable", async () => {
    const fields = sentDataFields(
      await requestFor({
        codigoSubgrupo: "0003",
        codigoGrupo: "012",
        codigoFamilia: "007",
        descripcion: "SINTETICO",
        codigoUnicoFinal: "SINT-9999",
        codigoUnicoInicial: "SINT-0001",
      }),
    );
    assert.deepEqual(fields.slice(2), [
      ["CodigoUnicoInicial", "SINT-0001"],
      ["CodigoUnicoFinal", "SINT-9999"],
      ["Descripcion", "SINTETICO"],
      ["CodigoFamilia", "007"],
      ["CodigoGrupo", "012"],
      ["CodigoSubgrupo", "0003"],
    ]);
  });

  it("escapa caracteres especiales y conserva el contenido exacto (incluidos espacios externos)", async () => {
    const descripcion = `  LONA & CIA <"X">' `;
    const call = await requestFor({ descripcion });
    const body = String(call.init.body);
    assert.ok(!body.includes(descripcion));
    assert.ok(body.includes(escapeXml(descripcion)));
    assert.deepEqual(sentDataFields(call).slice(2), [["Descripcion", descripcion]]);
  });

  it("strings vacíos y whitespace-only no se envían", async () => {
    const fields = sentDataFields(
      await requestFor({ codigoUnicoInicial: "", codigoUnicoFinal: "   ", descripcion: "\t", codigoFamilia: "007" }),
    );
    assert.deepEqual(fields.slice(2), [["CodigoFamilia", "007"]]);
  });

  const invalidArguments: [string, () => Promise<unknown>, string | RegExp][] = [
    ["listKoreArticulos(undefined)", () => listKoreArticulos(undefined as unknown as KoreArticuloFilters), "ListarArticulos requires at least one filter"],
    ["listKoreArticulos({})", () => listKoreArticulos({}), "ListarArticulos requires at least one filter"],
    ['solo ""', () => listKoreArticulos({ descripcion: "" }), "ListarArticulos requires at least one filter"],
    ["solo whitespace", () => listKoreArticulos({ codigoUnicoInicial: "  ", codigoUnicoFinal: "\t" }), "ListarArticulos requires at least one filter"],
    [
      "todos vacíos",
      () => listKoreArticulos({ codigoUnicoInicial: "", codigoUnicoFinal: "", descripcion: " ", codigoFamilia: "", codigoGrupo: "", codigoSubgrupo: "" }),
      "ListarArticulos requires at least one filter",
    ],
    [
      "todos undefined",
      () => listKoreArticulos({ codigoUnicoInicial: undefined, codigoUnicoFinal: undefined, descripcion: undefined, codigoFamilia: undefined, codigoGrupo: undefined, codigoSubgrupo: undefined }),
      "ListarArticulos requires at least one filter",
    ],
    ["valor null", () => listKoreArticulos({ descripcion: null } as unknown as KoreArticuloFilters), /debe ser texto/],
    ["filtro desconocido", () => listKoreArticulos({ codigoUnico: "SINT-0001" } as KoreArticuloFilters), /desconocido/],
    ["código como number", () => listKoreArticulos({ codigoUnicoInicial: 42 } as unknown as KoreArticuloFilters), /debe ser texto/],
    ["filtros null", () => listKoreArticulos(null as unknown as KoreArticuloFilters), /inválidos/],
  ];
  for (const [label, run, message] of invalidArguments) {
    it(`${label} → invalid_argument, 0 fetch`, async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return xmlResponse(OK);
      }) as typeof fetch;
      let error: unknown;
      try {
        await run();
      } catch (caught) {
        error = caught;
      } finally {
        globalThis.fetch = originalFetch;
      }
      const koreError = assertKoreError(error, "invalid_argument");
      if (typeof message === "string") assert.equal(koreError.message, message);
      else assert.match(koreError.message, message);
      assert.equal(fetchCalls, 0);
    });
  }

  const internalInvalid: [string, unknown][] = [
    ["sin filters", undefined],
    ["{}", {}],
    ["todos undefined", { codigoUnicoInicial: undefined, descripcion: undefined, codigoSubgrupo: undefined }],
    ['todos ""', { codigoUnicoInicial: "", codigoUnicoFinal: "", descripcion: "", codigoFamilia: "", codigoGrupo: "", codigoSubgrupo: "" }],
    ["todos whitespace", { codigoUnicoInicial: " ", codigoUnicoFinal: "\t", descripcion: "  ", codigoFamilia: "\n", codigoGrupo: " ", codigoSubgrupo: " " }],
    ["clave desconocida", { codigoArticulo: "SINT-0001" }],
    ["valor null", { codigoFamilia: null }],
    ["valor no-string", { codigoGrupo: 12 }],
    ["filters null", null],
  ];
  for (const [label, filters] of internalInvalid) {
    it(`fetchKoreArticulos (${label}) → invalid_argument, 0 fetch`, async () => {
      const { client, calls } = clientFor(OK);
      assertKoreError(
        await errorFrom(fetchKoreArticulos(client, filters as KoreArticuloFilters)),
        "invalid_argument",
      );
      assert.equal(calls.length, 0);
    });
  }
});

describe("ListarArticulos: transporte y seguridad", () => {
  for (const [label, filters, echoed] of [
    ["Descripcion larga", { descripcion: "LONA SINTETICA PRIVADA" }, "LONA SINTETICA PRIVADA"],
    ["Descripcion corta", { descripcion: "X" }, "X"],
    ["código", { codigoUnicoInicial: "SINT-0001", codigoUnicoFinal: "SINT-0001" }, "SINT-0001"],
  ] as const) {
    it(`SOAP Fault que repite el filtro (${label}) y el secreto → detalle omitido`, async () => {
      const echo = `ECO-KORE Descripcion=${echoed} ${escapeXml(FAKE_SECRET)}`;
      const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", echo);
      const { client, calls } = clientFor(fault, 500);
      const error = await errorFrom(fetchKoreArticulos(client, filters));
      const koreError = assertKoreError(error, "soap_fault");
      assert.equal(calls.length, 1, "sin reintentos");
      assert.equal(koreError.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
      assert.ok(!koreError.message.includes(echoed));
      assert.ok(!JSON.stringify(error).includes(echoed));
      const renderings = [koreError.stack ?? "", inspect(error, { depth: 10, showHidden: true })].join("\n");
      for (const marker of ["ECO-KORE", `Descripcion=${echoed}`, "Server was unable"]) {
        assert.ok(!renderings.includes(marker), "rastro del eco de KORE en el error");
      }
      assertNoSecret(error);
    });
  }

  it("listKoreArticulos usa la config del env y devuelve artículos", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    const articulos = await listKoreArticulos(ANY_FILTER, { env: FAKE_ENV, fetchImpl });
    assert.equal(articulos.length, 3);
    assert.equal(calls.length, 1);
  });

  it("config incompleta falla antes de cualquier request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    const error = await errorFrom(listKoreArticulos(ANY_FILTER, { env: { ...FAKE_ENV, KORE_BASE_URL: "" }, fetchImpl }));
    assertKoreError(error, "config");
    assert.equal(calls.length, 0);
  });
});
