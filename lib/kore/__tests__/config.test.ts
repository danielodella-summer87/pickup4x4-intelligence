import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { parseKoreConfig } from "../config.ts";
import { FAKE_ENV, FAKE_SECRET, assertKoreError, assertNoSecret } from "./helpers.ts";

describe("parseKoreConfig", () => {
  it("devuelve la configuración con valores recortados", () => {
    const config = parseKoreConfig({ ...FAKE_ENV, KORE_COMPANY_NUMBER: " 999 " });
    assert.equal(config.companyNumber, "999");
    assert.equal(config.secretKey, FAKE_SECRET);
  });

  it("no expone el secreto al serializar o inspeccionar", () => {
    const config = parseKoreConfig(FAKE_ENV);
    assert.ok(!JSON.stringify(config).includes(FAKE_SECRET));
    assert.ok(!inspect(config).includes(FAKE_SECRET));
    assert.ok(!Object.keys(config).includes("secretKey"));
    assert.ok(Object.isFrozen(config));
  });

  it("falla fast nombrando las variables faltantes, sin valores", () => {
    try {
      parseKoreConfig({ KORE_BASE_URL: FAKE_ENV.KORE_BASE_URL, KORE_SECRET_KEY: FAKE_SECRET });
      assert.fail("debía fallar");
    } catch (error) {
      const koreError = assertKoreError(error, "config");
      assert.match(koreError.message, /KORE_COMPANY_NUMBER/);
      assert.doesNotMatch(koreError.message, /KORE_BASE_URL|KORE_SECRET_KEY/);
      assertNoSecret(error);
    }
  });

  it("trata valores vacíos o con solo espacios como faltantes", () => {
    assert.throws(
      () => parseKoreConfig({ ...FAKE_ENV, KORE_SECRET_KEY: "   " }),
      (error) => assertKoreError(error, "config") !== undefined,
    );
  });

  const invalid: [string, Record<string, string>][] = [
    ["URL inválida", { KORE_BASE_URL: "no es url" }],
    ["protocolo no http", { KORE_BASE_URL: "ftp://kore.test.invalid/x.asmx" }],
    ["credenciales en URL", { KORE_BASE_URL: "http://user:pass@kore.test.invalid/x.asmx" }],
    ["empresa no numérica", { KORE_COMPANY_NUMBER: "12a" }],
  ];
  for (const [label, override] of invalid) {
    it(`rechaza ${label}`, () => {
      assert.throws(
        () => parseKoreConfig({ ...FAKE_ENV, ...override }),
        (error) => {
          assertKoreError(error, "config");
          assertNoSecret(error);
          return true;
        },
      );
    });
  }
});
