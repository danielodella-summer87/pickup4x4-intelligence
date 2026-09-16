import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import type { KoreFetch } from "../client.ts";
import type { KoreEnv } from "../config.ts";
import { KoreError } from "../errors.ts";
import type { KoreErrorKind } from "../errors.ts";
import { escapeXml } from "../xml.ts";

/** Credenciales FALSAS: nunca usar valores reales en tests ni fixtures. */
export const FAKE_SECRET = `FAKE-not-a-real-key_<&>"'_0000`;
export const FAKE_COMPANY = "999";
export const FAKE_BASE_URL = "http://kore.test.invalid/KoreStandard.asmx";

export const FAKE_ENV: KoreEnv = {
  KORE_BASE_URL: FAKE_BASE_URL,
  KORE_COMPANY_NUMBER: FAKE_COMPANY,
  KORE_SECRET_KEY: FAKE_SECRET,
};

export function readFixture(name: string): string {
  return readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), "utf8");
}

export type RecordedCall = { url: string; init: RequestInit };

export function mockFetch(respond: (call: RecordedCall) => Response | Promise<Response>): {
  fetchImpl: KoreFetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: KoreFetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { fetchImpl, calls };
}

export function xmlResponse(body: string | null, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/xml; charset=utf-8", ...headers },
  });
}

/** El secreto no puede aparecer en ninguna representación del error. */
export function assertNoSecret(error: unknown, secret = FAKE_SECRET): void {
  const cause = error instanceof Error ? error.cause : undefined;
  const renderings = [
    String(error),
    error instanceof Error ? error.message : "",
    error instanceof Error ? (error.stack ?? "") : "",
    JSON.stringify(error),
    inspect(error, { depth: 10, showHidden: true }),
    cause === undefined ? "" : `${JSON.stringify(cause)} ${inspect(cause, { depth: 10, showHidden: true })}`,
  ];
  for (const text of renderings) {
    assert.ok(!text.includes(secret), "el secreto aparece en el error");
    assert.ok(!text.includes(escapeXml(secret)), "el secreto escapado aparece en el error");
    assert.ok(!text.includes("not-a-real-key"), "un fragmento del secreto aparece en el error");
  }
}

export function assertKoreError(error: unknown, kind: KoreErrorKind): KoreError {
  assert.ok(error instanceof KoreError, "se esperaba KoreError");
  assert.equal(error.kind, kind);
  return error;
}
