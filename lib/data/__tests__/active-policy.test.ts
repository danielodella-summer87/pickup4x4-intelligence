import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getArticulosAltaRotacion, getArticulosPorVehiculo } from "../distribuidor-insights.ts";
import { composeMixedDataset, koreArticleToArticulo } from "../mixed-dataset.ts";
import type { ActivePickupData } from "../pickup-data.ts";
import type { KoreCatalogArticle } from "../../kore-catalog/repository.ts";

/**
 * KORE-29 — política KORE_ACTIVE_POLICY = SOURCE_AUTHORITATIVE.
 *
 * DESHABILITADO=1 en KORE → artículo NO seleccionable en features de catálogo actual
 * (mostrador del distribuidor, buscador de propuestas). Sus relaciones históricas (ventas,
 * aplicaciones) se conservan y siguen contando donde representan historia.
 */

function koreArticle(code: string, deshabilitado: 0 | 1 | null): KoreCatalogArticle {
  return {
    id: `id-${code}`,
    codigoUnico: code,
    descripcion: `ARTICULO SINT ${code}`,
    observaciones: "",
    codigoFamilia: "F1",
    codigoGrupo: "G1",
    codigoSubgrupo: null,
    familiaId: null,
    grupoId: null,
    subgrupoId: null,
    basico: null,
    minimo: null,
    exento: null,
    deshabilitado,
    controlaStock: null,
    lastSeenAt: "2099-01-01T00:00:00Z",
  };
}

/** Dataset activo sintético: un vehículo, un artículo habilitado y uno deshabilitado con historia. */
function data(): ActivePickupData {
  const articulos = [koreArticle("SINT-ON", 0), koreArticle("SINT-OFF", 1), koreArticle("SINT-NULL", null)].map(koreArticleToArticulo);
  const ventaItems = [1, 2, 3, 4].flatMap((n) => [
    { id: `vi-on-${n}`, ventaId: `v${n}`, codigoUnico: "SINT-ON", descripcion: "", cantidad: 1, precioUnitario: 0, importe: 0 },
    { id: `vi-off-${n}`, ventaId: `v${n}`, codigoUnico: "SINT-OFF", descripcion: "", cantidad: 1, precioUnitario: 0, importe: 0 },
  ]);
  return {
    vehiculoMarcas: [{ id: "m1", nombre: "MARCA SINT" }],
    vehiculoModelos: [{ id: "mm1", marcaId: "m1", nombre: "MODELO SINT" }],
    clientes: [],
    articulos,
    articuloAplicaciones: ["SINT-ON", "SINT-OFF", "SINT-NULL"].map((code, i) => ({
      codigoAplicacion: `ap${i}`,
      codigoUnico: code,
      marcaId: "m1",
      modeloId: "mm1",
      anioDesde: 0,
      anioHasta: 9999,
    })),
    ventas: [1, 2, 3, 4].map((n) => ({ id: `v${n}`, numeroCuenta: "C1", fecha: "", tipoComprobante: "otro", numeroComprobante: `${n}`, importeTotal: 0 })),
    ventaItems,
    solicitudes: [],
    oportunidades: [],
  } as unknown as ActivePickupData;
}

describe("KORE_ACTIVE_POLICY = SOURCE_AUTHORITATIVE", () => {
  it("activo = !DESHABILITADO (null → activo, igual que el default legacy)", () => {
    assert.deepEqual(
      [koreArticle("A", 0), koreArticle("B", 1), koreArticle("C", null)].map((a) => koreArticleToArticulo(a).activo),
      [true, false, true],
    );
  });

  it("catálogo seleccionable (mostrador del distribuidor) excluye inactivos", () => {
    const codes = getArticulosPorVehiculo("m1", "mm1", data()).map((a) => a.codigoUnico).sort();
    assert.deepEqual(codes, ["SINT-NULL", "SINT-ON"]);
  });

  it("historia intacta: el dataset conserva ventas y aplicaciones del artículo inactivo", () => {
    const d = data();
    assert.equal(d.ventaItems.filter((item) => item.codigoUnico === "SINT-OFF").length, 4);
    assert.equal(d.articuloAplicaciones.filter((ap) => ap.codigoUnico === "SINT-OFF").length, 1);
    assert.ok(d.articulos.some((a) => a.codigoUnico === "SINT-OFF" && a.activo === false), "el inactivo sigue en el catálogo (consulta), no se borra");
  });

  it("métricas históricas (alta rotación por ventas) siguen contando artículos inactivos", () => {
    const alta = getArticulosAltaRotacion(data());
    assert.ok(alta.has("SINT-OFF"), "la historia de ventas no se filtra por activo");
    assert.ok(alta.has("SINT-ON"));
  });

  it("dataset mixto: las ventas y aplicaciones legacy de un artículo deshabilitado no se eliminan", () => {
    const legacy = data();
    const mixed = composeMixedDataset(
      {
        clientes: [],
        ventas: legacy.ventas,
        ventaItems: legacy.ventaItems,
        articulos: [],
        aplicaciones: legacy.articuloAplicaciones,
        marcas: legacy.vehiculoMarcas,
        modelos: legacy.vehiculoModelos,
        solicitudes: [],
        oportunidades: [],
        warnings: [],
        stats: {},
      } as never,
      [koreArticle("SINT-ON", 0), koreArticle("SINT-OFF", 1)],
      { familias: [], grupos: [], subgrupos: [] },
    );
    assert.equal(mixed.ventaItems.length, legacy.ventaItems.length);
    assert.equal(mixed.aplicaciones.length, legacy.articuloAplicaciones.length);
    assert.equal(mixed.articulos.find((a) => a.codigoUnico === "SINT-OFF")?.activo, false);
  });
});
