import type { CatalogCountQuery, CatalogFilters, CatalogSelectQuery, KoreCatalogReader } from "../repository.ts";

export type Row = Record<string, unknown>;

/** Fila sintética de kore_articulos (resolved + activa por defecto). */
export function row(code: string, overrides: Row = {}): Row {
  return {
    id: `id-${code}`,
    codigo_unico: code,
    descripcion: `ARTICULO SINT ${code}`,
    observaciones: "",
    codigo_familia: "F1",
    codigo_grupo: "G1",
    codigo_subgrupo: null,
    familia_id: "fam-1",
    grupo_id: null,
    subgrupo_id: null,
    basico: 1,
    minimo: 0,
    exento: 0,
    deshabilitado: 0,
    controla_stock: 1,
    raw_id: `raw-${code}`,
    identity_status: "resolved",
    missing_since: null,
    last_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Fila en cuarentena (contenido null por el check de identidad). */
export function conflictRow(code: string): Row {
  return row(code, { identity_status: "conflict", raw_id: null, descripcion: null, observaciones: null, codigo_familia: null, familia_id: null });
}

export function taxonomyTables(): Record<string, Row[]> {
  return {
    kore_familias: [
      { id: "fam-1", codigo_familia: "F1", descripcion: "FAMILIA SINT 1", missing_since: null },
      { id: "fam-x", codigo_familia: "FX", descripcion: "FAMILIA SINT RETIRADA", missing_since: "2099-01-02T00:00:00Z" },
    ],
    kore_grupos: [{ id: "grp-1", codigo_familia: "F1", codigo_grupo: "G1", descripcion: "GRUPO SINT 1", missing_since: null }],
    kore_subgrupos: [{ id: "sub-1", codigo_familia: "F1", codigo_grupo: "G1", codigo_subgrupo: "S1", descripcion: "SUBGRUPO SINT 1", missing_since: null }],
  };
}

/** Tablas sintéticas: aplica los filtros como lo haría PostgREST. */
export class FakeReader implements KoreCatalogReader {
  readonly selects: CatalogSelectQuery[] = [];
  readonly counts: CatalogCountQuery[] = [];
  rows: Row[];
  readonly tables: Record<string, Row[]>;
  ignoreFilters = false;
  failWith: Error | null = null;

  constructor(rows: Row[], tables: Record<string, Row[]> = taxonomyTables()) {
    this.rows = rows;
    this.tables = tables;
  }

  private tableRows(table: string): Row[] {
    return table === "kore_articulos" ? this.rows : (this.tables[table] ?? []);
  }

  private apply(table: string, filters: CatalogFilters): Row[] {
    const rows = this.tableRows(table);
    if (this.ignoreFilters) return rows;
    return rows.filter(
      (r) =>
        filters.eq.every(([column, value]) => r[column] === value) &&
        filters.isNull.every((column) => r[column] === null) &&
        filters.notNull.every((column) => r[column] !== null),
    );
  }

  async select(query: CatalogSelectQuery) {
    if (this.failWith) throw this.failWith;
    this.selects.push(query);
    return this.apply(query.table, query.filters)
      .sort((a, b) => String(a[query.orderBy]).localeCompare(String(b[query.orderBy])))
      .slice(query.from, query.to + 1);
  }

  async count(query: CatalogCountQuery) {
    if (this.failWith) throw this.failWith;
    this.counts.push(query);
    return this.apply(query.table, query.filters).length;
  }
}

export function catalog(): Row[] {
  return [row("SINT-A"), row("SINT-B"), row("SINT-C", { missing_since: "2099-01-02T00:00:00Z" }), conflictRow("SINT-CONFLICT-1"), conflictRow("SINT-CONFLICT-2")];
}
