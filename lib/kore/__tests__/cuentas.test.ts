import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { KORE_SENSITIVE_DETAIL_OMITTED, createKoreClient } from "../client.ts";
import { parseKoreConfig } from "../config.ts";
import { fetchKoreCuentas } from "../cuentas.ts";
import type { KoreCuenta, KoreCuentaFilters } from "../cuentas.ts";
import { listKoreCuentas } from "../service.ts";
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

const OK = readFixture("listar-cuentas.ok.xml");
const EMPTY = readFixture("listar-cuentas.empty.xml");

/** Marcadores de PII sintética del fixture: nunca deben aparecer en errores. */
const PII_MARKERS = [
  "EMPRESA FICTICIA ALFA",
  "ALFA & CIA",
  "ALFA &amp; CIA",
  "CALLE FALSA",
  "000 000 000",
  "RUT-FICTICIO",
  "contacto@ejemplo.invalid",
  "099 FICTICIO",
  "OBSERVACION SINTETICA",
  "PROVEEDOR FICTICIO BETA",
  "AV. INVENTADA",
  "beta@ejemplo.invalid",
  "SINTETICA",
  "CALLE FICTICIA",
];

function assertNoPii(error: unknown, extraMarkers: readonly string[] = []): void {
  const renderings = [
    String(error),
    error instanceof Error ? (error.stack ?? "") : "",
    JSON.stringify(error),
    inspect(error, { depth: 10, showHidden: true }),
  ].join("\n");
  for (const marker of [...PII_MARKERS, ...extraMarkers]) {
    assert.ok(!renderings.includes(marker), "un dato personal aparece en el error");
  }
}

function clientFor(xml: string, status = 200) {
  const { fetchImpl, calls } = mockFetch(() => xmlResponse(xml, status));
  return { client: createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl }), calls };
}

/** Filtro por defecto de los tests de parseo: ListarCuentas exige al menos uno. */
const ANY_FILTER: KoreCuentaFilters = { nroCuenta: 101 };

async function cuentasFrom(xml: string, filters: KoreCuentaFilters = ANY_FILTER): Promise<KoreCuenta[]> {
  return fetchKoreCuentas(clientFor(xml).client, filters);
}

async function errorFrom(xml: string, filters: KoreCuentaFilters = ANY_FILTER): Promise<unknown> {
  try {
    await cuentasFrom(xml, filters);
  } catch (error) {
    return error;
  }
  assert.fail("se esperaba un error");
}

function withoutRow(xml: string, rowId: string): string {
  const start = xml.indexOf(`<Cuenta diffgr:id="${rowId}"`);
  const end = xml.indexOf("</Cuenta>", start) + "</Cuenta>".length;
  return xml.slice(0, start) + xml.slice(end);
}

function sentDataFields(call: RecordedCall): [string, string][] {
  const envelope = parseXml(String(call.init.body));
  const operation = firstChildElement(firstChildElement(envelope, "Body")!, "ListarCuentas")!;
  const data = childElements(firstChildElement(operation, "doc")!)[0];
  assert.equal(data.name, "Data");
  assert.deepEqual({ ...data.attributes }, {});
  return childElements(data).map((child) => {
    assert.equal(child.prefix, null, "los hijos de Data van sin namespace");
    return [child.name, textContent(child)];
  });
}

async function requestFor(filters?: KoreCuentaFilters): Promise<RecordedCall> {
  const { client, calls } = clientFor(EMPTY);
  await fetchKoreCuentas(client, filters);
  assert.equal(calls.length, 1);
  return calls[0];
}

const EXPECTED: KoreCuenta[] = [
  {
    nroCuenta: 101,
    razonSocial: "EMPRESA FICTICIA ALFA S.A.",
    nombreFantasia: "ALFA & CIA FICTICIA",
    direccion: "CALLE FALSA 123",
    telefono: "000 000 000",
    ruc: "RUT-FICTICIO-0001",
    email: "contacto@ejemplo.invalid",
    celular: "099 FICTICIO",
    codigoPostal: "00000",
    codigoLocalidad: "LOC-FICT-01",
    deshabilitado: 0,
    nroListaDePrecio: 1,
    nroVendedor: 0,
    cliente: 1,
    proveedor: 0,
    observaciones: "OBSERVACION SINTETICA UNO",
  },
  {
    nroCuenta: 70000,
    razonSocial: "PROVEEDOR FICTICIO BETA",
    nombreFantasia: "",
    direccion: "AV. INVENTADA 4567 APTO 8",
    telefono: "(000) 000-0000 int. 9",
    ruc: " RUT-FICTICIO-0002 ",
    email: "beta@ejemplo.invalid",
    celular: "",
    codigoPostal: "",
    codigoLocalidad: "LOC-FICT-02",
    deshabilitado: 1,
    nroListaDePrecio: 300,
    nroVendedor: 999,
    cliente: 0,
    proveedor: 1,
    observaciones: "NOTA <SINTETICA> & PRUEBA",
  },
  {
    nroCuenta: 102,
    razonSocial: "",
    nombreFantasia: "",
    direccion: "",
    telefono: "",
    ruc: "",
    email: "",
    celular: "",
    codigoPostal: "",
    codigoLocalidad: "",
    deshabilitado: null,
    nroListaDePrecio: null,
    nroVendedor: null,
    cliente: null,
    proveedor: null,
    observaciones: "",
  },
];

describe("ListarCuentas → KoreCuenta[]", () => {
  it("parsea varias cuentas con todos los campos, en orden", async () => {
    assert.deepEqual(await cuentasFrom(OK), EXPECTED);
  });

  it("parsea una única cuenta válida", async () => {
    const single = withoutRow(withoutRow(OK, "Cuenta2"), "Cuenta3");
    assert.deepEqual(await cuentasFrom(single), [EXPECTED[0]]);
  });

  it("KoreCuenta expone exactamente los 16 campos del contrato", async () => {
    const [cuenta] = await cuentasFrom(OK);
    assert.deepEqual(Object.keys(cuenta), [
      "nroCuenta", "razonSocial", "nombreFantasia", "direccion", "telefono", "ruc", "email",
      "celular", "codigoPostal", "codigoLocalidad", "deshabilitado", "nroListaDePrecio",
      "nroVendedor", "cliente", "proveedor", "observaciones",
    ]);
  });

  it("conserva RUC, teléfono y observaciones exactamente como llegan", async () => {
    const [, beta] = await cuentasFrom(OK);
    assert.equal(beta.ruc, " RUT-FICTICIO-0002 ");
    assert.equal(beta.telefono, "(000) 000-0000 int. 9");
    assert.equal(beta.observaciones, "NOTA <SINTETICA> & PRUEBA");
  });

  it("strings ausentes o vacíos → \"\"; numéricos y flags ausentes → null", async () => {
    const cuentas = await cuentasFrom(OK);
    assert.equal(cuentas[1].nombreFantasia, "");
    assert.equal(cuentas[2].razonSocial, "");
    assert.equal(cuentas[2].deshabilitado, null);
    assert.equal(cuentas[2].nroVendedor, null);
    assert.equal(cuentas[2].nroListaDePrecio, null);
  });

  it("nroVendedor 0 es válido; IDs y listas mayores a 255 también", async () => {
    const [alfa, beta] = await cuentasFrom(OK);
    assert.equal(alfa.nroVendedor, 0);
    assert.equal(beta.nroVendedor, 999);
    assert.equal(beta.nroListaDePrecio, 300);
    assert.equal(beta.nroCuenta, 70000);
  });

  it("DESHABILITADO, CLIENTE y PROVEEDOR aceptan 0 y 1", async () => {
    const [alfa, beta] = await cuentasFrom(OK);
    assert.deepEqual([alfa.deshabilitado, alfa.cliente, alfa.proveedor], [0, 1, 0]);
    assert.deepEqual([beta.deshabilitado, beta.cliente, beta.proveedor], [1, 0, 1]);
  });

  it("DataSet vacío → []", async () => {
    assert.deepEqual(await cuentasFrom(EMPTY), []);
  });
});

describe("ListarCuentas: validación sin exponer valores", () => {
  const invalidCases: [string, string, string, RegExp][] = [
    ["NROCUENTA ausente", "<NROCUENTA>102</NROCUENTA>", "", /^Cuenta row 3: missing NROCUENTA$/],
    ["NROCUENTA vacío", "<NROCUENTA>102</NROCUENTA>", "<NROCUENTA />", /^Cuenta row 3: missing NROCUENTA$/],
    ["NROCUENTA decimal", "<NROCUENTA>101</NROCUENTA>", "<NROCUENTA>10.1</NROCUENTA>", /^Cuenta row 1: invalid NROCUENTA$/],
    ["NROCUENTA texto", "<NROCUENTA>101</NROCUENTA>", "<NROCUENTA>EMPRESA FICTICIA ALFA</NROCUENTA>", /^Cuenta row 1: invalid NROCUENTA$/],
    ["NROCUENTA no seguro", "<NROCUENTA>101</NROCUENTA>", "<NROCUENTA>90071992547409930</NROCUENTA>", /^Cuenta row 1: invalid NROCUENTA$/],
    ["NROCUENTA duplicado", "<NROCUENTA>102</NROCUENTA>", "<NROCUENTA>101</NROCUENTA>", /^Cuenta row 3: duplicate NROCUENTA$/],
    ["DESHABILITADO inválido", "<DESHABILITADO>0</DESHABILITADO>", "<DESHABILITADO>2</DESHABILITADO>", /^Cuenta row 1: invalid DESHABILITADO$/],
    ["DESHABILITADO vacío", "<DESHABILITADO>0</DESHABILITADO>", "<DESHABILITADO />", /^Cuenta row 1: invalid DESHABILITADO$/],
    ["CLIENTE inválido", "<CLIENTE>1</CLIENTE>", "<CLIENTE>SI</CLIENTE>", /^Cuenta row 1: invalid CLIENTE$/],
    ["PROVEEDOR inválido", "<PROVEEDOR>1</PROVEEDOR>", "<PROVEEDOR>-1</PROVEEDOR>", /^Cuenta row 2: invalid PROVEEDOR$/],
    ["NROVENDEDOR inválido", "<NROVENDEDOR>999</NROVENDEDOR>", "<NROVENDEDOR>9.5</NROVENDEDOR>", /^Cuenta row 2: invalid NROVENDEDOR$/],
    ["NROLISTADEPRECIO inválido", "<NROLISTADEPRECIO>1</NROLISTADEPRECIO>", "<NROLISTADEPRECIO>OBSERVACION SINTETICA</NROLISTADEPRECIO>", /^Cuenta row 1: invalid NROLISTADEPRECIO$/],
    ["campo desconocido", "<CLIENTE>1</CLIENTE>", "<CLIENTE>1</CLIENTE><FECHAALTA>CALLE FALSA</FECHAALTA>", /^Cuenta row 1: unexpected field FECHAALTA$/],
    ["otras direcciones como nodos hijos", "<CLIENTE>1</CLIENTE>", "<CLIENTE>1</CLIENTE><OTRASDIRECCIONES><DIRECCION>CALLE FICTICIA 9</DIRECCION></OTRASDIRECCIONES>", /^Cuenta row 1: unexpected field OTRASDIRECCIONES$/],
  ];
  for (const [label, search, replacement, message] of invalidCases) {
    it(`${label} → invalid_data con fila y campo, sin valores`, async () => {
      assert.ok(OK.includes(search));
      const error = assertKoreError(await errorFrom(OK.replace(search, replacement)), "invalid_data");
      assert.match(error.message, message);
      assertNoPii(error);
      assertNoSecret(error);
    });
  }

  it("tabla desconocida con filas (p. ej. otras direcciones) → invalid_data", async () => {
    const extraTable =
      '<OtrasDirecciones diffgr:id="OtrasDirecciones1" msdata:rowOrder="0">' +
      "<NROCUENTA>101</NROCUENTA><DIRECCION>CALLE FICTICIA 9</DIRECCION></OtrasDirecciones></NewDataSet>";
    const error = assertKoreError(await errorFrom(OK.replace("</NewDataSet>", extraTable)), "invalid_data");
    assert.equal(error.message, "Unexpected KORE dataset entity: OtrasDirecciones");
    assertNoPii(error);
  });

  it("tabla desconocida declarada solo en el esquema (sin filas) → invalid_data", async () => {
    const extraSchemaTable =
      '<xs:element name="OtrasDirecciones"><xs:complexType><xs:sequence>' +
      '<xs:element name="NROCUENTA" type="xs:int" minOccurs="0" />' +
      "</xs:sequence></xs:complexType></xs:element></xs:choice>";
    const error = assertKoreError(await errorFrom(EMPTY.replace("</xs:choice>", extraSchemaTable)), "invalid_data");
    assert.equal(error.message, "Unexpected KORE dataset entity: OtrasDirecciones");
  });

  it("SOAP Fault que repite secreto y filtros con PII → todo enmascarado", async () => {
    const rut = "RUT-FICTICIO-9999";
    const nombre = "EMPRESA FICTICIA GAMMA";
    const fault = readFixture("soap-fault.xml").replaceAll(
      "__ECHOED_SECRET__",
      `${escapeXml(FAKE_SECRET)} Rut=${rut} Nombre=${nombre}`,
    );
    const { client, calls } = clientFor(fault, 500);
    let error: unknown;
    try {
      await fetchKoreCuentas(client, { rut, nombre });
    } catch (caught) {
      error = caught;
    }
    assertKoreError(error, "soap_fault");
    assert.equal(calls.length, 1, "sin reintentos");
    assertNoSecret(error);
    assertNoPii(error, [rut, nombre]);
  });
});

describe("ListarCuentas: request y filtros", () => {
  it("SOAPAction de ListarCuentas; credenciales primero y luego el filtro", async () => {
    const call = await requestFor({ nroCuenta: 101 });
    assert.equal((call.init.headers as Record<string, string>).SOAPAction, '"http://tempuri.org/ListarCuentas"');
    assert.deepEqual(sentDataFields(call).map(([name]) => name), ["NroEmpresa", "SecretKey", "NroCuenta"]);
  });

  const withoutEffectiveFilter: [string, () => Promise<unknown>][] = [
    ["listKoreCuentas()", () => listKoreCuentas()],
    ["listKoreCuentas({})", () => listKoreCuentas({})],
    ['listKoreCuentas({ rut: "" })', () => listKoreCuentas({ rut: "" })],
    ['listKoreCuentas({ nombre: "" })', () => listKoreCuentas({ nombre: "" })],
    ['listKoreCuentas({ rut: "", nombre: "" })', () => listKoreCuentas({ rut: "", nombre: "" })],
    ["listKoreCuentas({ nroCuenta: undefined })", () => listKoreCuentas({ nroCuenta: undefined })],
  ];
  for (const [label, run] of withoutEffectiveFilter) {
    it(`sin filtro efectivo: ${label} → invalid_argument, 0 requests`, async () => {
      // Sin options: se usaría el fetch global. Se reemplaza por un contador.
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
      assert.equal(koreError.message, "ListarCuentas requires at least one filter");
      assert.equal(fetchCalls, 0);
    });
  }

  it("fetchKoreCuentas sin filtro efectivo tampoco sale a red", async () => {
    const { client, calls } = clientFor(OK);
    let error: unknown;
    try {
      await fetchKoreCuentas(client, { rut: "", nombre: "" });
    } catch (caught) {
      error = caught;
    }
    assertKoreError(error, "invalid_argument");
    assert.equal(calls.length, 0);
  });

  const individual: [string, KoreCuentaFilters, [string, string]][] = [
    ["nroCuenta", { nroCuenta: 101 }, ["NroCuenta", "101"]],
    ["rut", { rut: "RUT-FICTICIO-0001" }, ["Rut", "RUT-FICTICIO-0001"]],
    ["nombre", { nombre: "FICTICIA" }, ["Nombre", "FICTICIA"]],
    ["nroVendedor", { nroVendedor: 999 }, ["NroVendedor", "999"]],
    ["nroVendedor 0", { nroVendedor: 0 }, ["NroVendedor", "0"]],
  ];
  for (const [label, filters, expected] of individual) {
    it(`filtro individual: ${label}`, async () => {
      assert.deepEqual(sentDataFields(await requestFor(filters)).slice(2), [expected]);
    });
  }

  it("combinación de filtros en orden estable", async () => {
    const fields = sentDataFields(
      await requestFor({ nroVendedor: 7, nombre: "FICTICIA", rut: "RUT-FICTICIO-0001", nroCuenta: 101 }),
    );
    assert.deepEqual(fields.slice(2), [
      ["NroCuenta", "101"],
      ["Rut", "RUT-FICTICIO-0001"],
      ["Nombre", "FICTICIA"],
      ["NroVendedor", "7"],
    ]);
  });

  it("no envía tags vacíos ni undefined", async () => {
    const fields = sentDataFields(await requestFor({ rut: "", nombre: "", nroCuenta: undefined, nroVendedor: 3 }));
    assert.deepEqual(fields.slice(2), [["NroVendedor", "3"]]);
  });

  it("escapa caracteres especiales y no altera el string", async () => {
    const nombre = `  PÉREZ & HIJOS <"S.A.">' `;
    const call = await requestFor({ nombre });
    const body = String(call.init.body);
    assert.ok(!body.includes(nombre));
    assert.ok(body.includes(escapeXml(nombre)));
    assert.deepEqual(sentDataFields(call).slice(2), [["Nombre", nombre]]);
  });

  const invalidFilters: [string, unknown][] = [
    ["nroCuenta decimal", { nroCuenta: 1.5 }],
    ["nroCuenta NaN", { nroCuenta: Number.NaN }],
    ["nroCuenta como string", { nroCuenta: "101" }],
    ["nroVendedor no seguro", { nroVendedor: 2 ** 60 }],
    ["rut no string", { rut: 123 }],
    ["clave desconocida (typo)", { nrocuenta: 101 }],
  ];
  for (const [label, filters] of invalidFilters) {
    it(`filtro inválido (${label}) → invalid_argument antes de salir a red`, async () => {
      const { client, calls } = clientFor(OK);
      let error: unknown;
      try {
        await fetchKoreCuentas(client, filters as KoreCuentaFilters);
      } catch (caught) {
        error = caught;
      }
      assertKoreError(error, "invalid_argument");
      assert.equal(calls.length, 0);
    });
  }
});

describe("listKoreCuentas (API pública interna)", () => {
  it("usa la config del env y devuelve cuentas", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    const cuentas = await listKoreCuentas({ nroCuenta: 101 }, { env: FAKE_ENV, fetchImpl });
    assert.equal(cuentas.length, 3);
    assert.equal(calls.length, 1);
  });

  it("config incompleta falla antes de cualquier request", async () => {
    const { fetchImpl, calls } = mockFetch(() => xmlResponse(OK));
    try {
      await listKoreCuentas({ nroCuenta: 101 }, { env: { ...FAKE_ENV, KORE_SECRET_KEY: "" }, fetchImpl });
      assert.fail("debía fallar");
    } catch (error) {
      assertKoreError(error, "config");
    }
    assert.equal(calls.length, 0);
  });
});

describe("ListarCuentas: PII corta en filtros nunca aparece en errores", () => {
  const cases: [string, KoreCuentaFilters, string[]][] = [
    ['Nombre = "X"', { nombre: "X" }, ["X"]],
    ['Nombre = "AB"', { nombre: "AB" }, ["AB"]],
    ['Rut = "12"', { rut: "12" }, ["12"]],
    ['Rut = "12" y Nombre = "X"', { rut: "12", nombre: "X" }, ["12", "X"]],
  ];

  for (const [label, filters, values] of cases) {
    it(`SOAP Fault que repite ${label}: se omite el detalle de KORE`, async () => {
      const echo = "ECO-KORE " + values.map((v) => `Rut=${v} Nombre=${v} [${v}]`).join(" ");
      const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", echo);
      const { client, calls } = clientFor(fault, 500);
      let error: unknown;
      try {
        await fetchKoreCuentas(client, filters);
      } catch (caught) {
        error = caught;
      }
      const koreError = assertKoreError(error, "soap_fault");
      assert.equal(calls.length, 1);
      assert.equal(koreError.faultCode, KORE_SENSITIVE_DETAIL_OMITTED);
      assert.equal(
        koreError.message,
        `KORE devolvió SOAP Fault (${KORE_SENSITIVE_DETAIL_OMITTED}): ${KORE_SENSITIVE_DETAIL_OMITTED}`,
      );

      // message / faultCode / JSON son 100% texto propio: el valor crudo no aparece ni como substring.
      for (const value of values) {
        assert.ok(!koreError.message.includes(value), "valor de filtro en message");
        assert.ok(!String(koreError.faultCode).includes(value), "valor de filtro en faultCode");
        assert.ok(!JSON.stringify(error).includes(value), "valor de filtro en JSON");
      }
      // stack e inspect incluyen rutas y números de línea: se verifica que no haya rastro del eco de KORE.
      const renderings = [koreError.stack ?? "", inspect(error, { depth: 10, showHidden: true }), JSON.stringify(error)];
      for (const text of renderings) {
        for (const marker of ["ECO-KORE", "Rut=", "Nombre=", "Server was unable", ...values.map((v) => `[${v}]`)]) {
          assert.ok(!text.includes(marker), "rastro del eco de KORE en el error");
        }
      }
      assertNoSecret(error);
    });
  }

  it("error de red con PII corta en filtros: se omite el detalle", async () => {
    const { fetchImpl, calls } = mockFetch(() => {
      throw new TypeError("fetch failed Nombre=X Rut=12", { cause: { code: "ECONNRESET" } });
    });
    const client = createKoreClient({ config: parseKoreConfig(FAKE_ENV), fetchImpl });
    let error: unknown;
    try {
      await fetchKoreCuentas(client, { nombre: "X", rut: "12" });
    } catch (caught) {
      error = caught;
    }
    const koreError = assertKoreError(error, "network");
    assert.equal(calls.length, 1);
    assert.equal(koreError.causeCode, "ECONNRESET");
    assert.ok(koreError.message.endsWith(KORE_SENSITIVE_DETAIL_OMITTED));
    for (const text of [koreError.message, JSON.stringify(error), inspect(error, { showHidden: true })]) {
      assert.ok(!text.includes("Nombre=X") && !text.includes("Rut=12") && !text.includes("fetch failed"));
    }
  });

  it("sin filtros PII (solo nroCuenta) se conserva el detalle del Fault", async () => {
    const fault = readFixture("soap-fault.xml").replaceAll("__ECHOED_SECRET__", escapeXml(FAKE_SECRET));
    const { client } = clientFor(fault, 500);
    let error: unknown;
    try {
      await fetchKoreCuentas(client, { nroCuenta: 101 });
    } catch (caught) {
      error = caught;
    }
    const koreError = assertKoreError(error, "soap_fault");
    assert.equal(koreError.faultCode, "soap:Server");
    assert.match(koreError.message, /Server was unable to process request/);
    assertNoSecret(error);
  });
});

describe("ListarCuentas: strings solo whitespace", () => {
  it("whitespace puro → \"\"; con contenido se conserva exacto", async () => {
    const xml = OK
      .replace("<CELULAR>099 FICTICIO</CELULAR>", "<CELULAR>   </CELULAR>")
      .replace("<CODIGOPOSTAL>00000</CODIGOPOSTAL>", "<CODIGOPOSTAL>&#9;</CODIGOPOSTAL>")
      .replace("<RAZONSOCIAL>EMPRESA FICTICIA ALFA S.A.</RAZONSOCIAL>", "<RAZONSOCIAL>  ABC  </RAZONSOCIAL>")
      .replace("<TELEFONO>000 000 000</TELEFONO>", "<TELEFONO>1.234</TELEFONO>")
      .replace("<OBSERVACIONES>OBSERVACION SINTETICA UNO</OBSERVACIONES>", "<OBSERVACIONES>\n  \r\n </OBSERVACIONES>")
      .replace("<RUC>RUT-FICTICIO-0001</RUC>", "<RUC>  RUT-FICTICIO-0001\t</RUC>");
    const [alfa] = await cuentasFrom(xml);
    assert.equal(alfa.celular, "");
    assert.equal(alfa.codigoPostal, "");
    assert.equal(alfa.observaciones, "");
    assert.equal(alfa.razonSocial, "  ABC  ");
    assert.equal(alfa.telefono, "1.234");
    assert.equal(alfa.ruc, "  RUT-FICTICIO-0001\t");
  });

  const stringFields: [string, keyof KoreCuenta][] = [
    ["RAZONSOCIAL", "razonSocial"],
    ["NOMBREFANTASIA", "nombreFantasia"],
    ["DIRECCION", "direccion"],
    ["TELEFONO", "telefono"],
    ["RUC", "ruc"],
    ["EMAIL", "email"],
    ["CELULAR", "celular"],
    ["CODIGOPOSTAL", "codigoPostal"],
    ["CODIGOLOCALIDAD", "codigoLocalidad"],
    ["OBSERVACIONES", "observaciones"],
  ];
  for (const [tag, key] of stringFields) {
    it(`${tag} solo whitespace → ""`, async () => {
      const xml = OK.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}> \t  </${tag}>`);
      const [alfa] = await cuentasFrom(xml);
      assert.equal(alfa[key], "");
    });
  }
});

describe("ListarCuentas: numéricos opcionales", () => {
  const numericTags = ["DESHABILITADO", "NROLISTADEPRECIO", "NROVENDEDOR", "CLIENTE", "PROVEEDOR"];
  for (const tag of numericTags) {
    for (const [label, content] of [["vacío", ""], ["whitespace", " \t "]]) {
      it(`${tag} presente ${label} → invalid_data`, async () => {
        const xml = OK.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>${content}</${tag}>`);
        const error = assertKoreError(await errorFrom(xml), "invalid_data");
        assert.equal(error.message, `Cuenta row 1: invalid ${tag}`);
      });
    }
  }

  it("tags numéricos ausentes → null", async () => {
    const [, , minima] = await cuentasFrom(OK);
    assert.deepEqual(
      [minima.deshabilitado, minima.nroListaDePrecio, minima.nroVendedor, minima.cliente, minima.proveedor],
      [null, null, null, null, null],
    );
  });
});
