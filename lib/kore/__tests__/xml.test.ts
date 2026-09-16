import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  XmlParseError,
  childElements,
  escapeXml,
  firstChildElement,
  parseXml,
  textContent,
} from "../xml.ts";

describe("parseXml", () => {
  it("parsea elementos, prefijos, atributos, texto, CDATA y entidades", () => {
    const root = parseXml(
      '<?xml version="1.0" encoding="utf-8"?><!-- c --><a:Root x="1" y=\'&amp;2\'><b>P&#201;REZ &amp; &#x4E;</b><c><![CDATA[<raw>]]></c><d /></a:Root>',
    );
    assert.equal(root.prefix, "a");
    assert.equal(root.localName, "Root");
    assert.deepEqual({ ...root.attributes }, { x: "1", y: "&2" });
    assert.equal(textContent(firstChildElement(root, "b")!), "PÉREZ & N");
    assert.equal(textContent(firstChildElement(root, "c")!), "<raw>");
    assert.equal(childElements(root).length, 3);
  });

  it("acepta BOM y espacios alrededor del elemento raíz", () => {
    assert.equal(parseXml("﻿  <r/>\n").localName, "r");
  });

  const invalid: [string, string][] = [
    ["cierre que no coincide", "<a><b></a></b>"],
    ["elemento sin cerrar", "<a><b></b>"],
    ["más de un raíz", "<a/><b/>"],
    ["texto fuera del raíz", "<a/>texto"],
    ["entidad desconocida", "<a>&foo;</a>"],
    ["entidad sin cerrar", "<a>&amp</a>"],
    ["DOCTYPE", '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'],
    ["atributo duplicado", '<a x="1" x="2"/>'],
    ["atributo sin comillas", "<a x=1/>"],
    ["documento vacío", "   "],
    ["referencia numérica inválida", "<a>&#0;</a>"],
  ];
  for (const [label, xml] of invalid) {
    it(`rechaza XML inválido: ${label}`, () => {
      assert.throws(() => parseXml(xml), XmlParseError);
    });
  }

  it("escapeXml escapa los cinco caracteres especiales", () => {
    assert.equal(escapeXml(`<&>"'`), "&lt;&amp;&gt;&quot;&apos;");
  });
});
