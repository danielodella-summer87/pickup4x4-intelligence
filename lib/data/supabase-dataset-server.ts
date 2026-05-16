import { detectarOportunidadesComerciales } from "@/lib/data/oportunidades-engine";
import { pickupDatasetToActiveData, type ActivePickupData } from "@/lib/data/pickup-data";
import {
  aplicacionToDbRow,
  articuloToDbRow,
  buildClienteNombreMap,
  buildImportacionObservaciones,
  clienteToDbRow,
  createDbId,
  dbRowToAplicacion,
  dbRowToArticulo,
  dbRowToCliente,
  dbRowToOportunidadDetectada,
  dbRowsToMarcasModelos,
  dbVentasToVentaItems,
  oportunidadDetectadaToDbRow,
  ventasFlatToDbRows,
} from "@/lib/data/supabase-mappers";
import type { PickupDataset, PickupDatasetStats } from "@/lib/excel/build-dataset";
import type { OportunidadDetectada } from "@/lib/models/oportunidad";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK_SIZE = 400;
const DELETE_ALL_SENTINEL = "00000000-0000-0000-0000-000000000000";

export type SupabaseDatasetSaveResult = {
  ok: boolean;
  importacionId?: string;
  counts: {
    clientes: number;
    ventas: number;
    articulos: number;
    aplicaciones: number;
    oportunidades: number;
  };
  errorMessage?: string;
  httpStatus?: number;
  technicalDetail?: string;
  recommendation?: string;
  durationMs: number;
};

export type SupabaseDatasetLoadResult = {
  ok: boolean;
  dataset: PickupDataset | null;
  activeData: ActivePickupData | null;
  oportunidades: OportunidadDetectada[];
  generatedAt: Date | null;
  importacionId?: string;
  errorMessage?: string;
};

function logImport(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[SupabaseImport] ${message}`, detail);
  } else {
    console.info(`[SupabaseImport] ${message}`);
  }
}

function logApi(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[API ImportDataset] ${message}`, detail);
  } else {
    console.info(`[API ImportDataset] ${message}`);
  }
}

function logDataset(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[SupabaseDataset] ${message}`, detail);
  } else {
    console.info(`[SupabaseDataset] ${message}`);
  }
}

function logLoad(message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`[SupabaseLoad] ${message}`, detail);
  } else {
    console.info(`[SupabaseLoad] ${message}`);
  }
}

function requireServiceClient(): SupabaseClient<Database> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Supabase service role no configurado en el servidor");
  }
  const client = createSupabaseServiceClient();
  if (!client) {
    throw new Error("No se pudo crear el cliente Supabase (service role)");
  }
  return client;
}

const LOAD_PAGE_SIZE = 1000;

type DbTableName = keyof Database["public"]["Tables"];
type DbRow<T extends DbTableName> = Database["public"]["Tables"][T]["Row"];

/** PostgREST devuelve como máximo 1000 filas por consulta; paginamos para cargar todo. */
async function fetchAllTableRows<T extends DbTableName>(
  client: SupabaseClient<Database>,
  table: T,
): Promise<{ data: DbRow<T>[]; error: { message: string } | null }> {
  const all: DbRow<T>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + LOAD_PAGE_SIZE - 1);

    if (error) {
      return { data: all, error };
    }

    const page = (data ?? []) as unknown as DbRow<T>[];
    all.push(...page);

    if (page.length < LOAD_PAGE_SIZE) {
      break;
    }

    from += LOAD_PAGE_SIZE;
  }

  return { data: all, error: null };
}

async function chunkInsert<T extends Record<string, unknown>>(
  client: SupabaseClient<Database>,
  table: keyof Database["public"]["Tables"],
  rows: T[],
  label: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  if (rows.length === 0) return { ok: true };

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    logImport(`${label} chunk ${Math.floor(i / CHUNK_SIZE) + 1}`, {
      from: i,
      size: chunk.length,
    });

    const { error } = await client.from(table).insert(chunk as never);
    if (error) {
      logImport(`Error en ${label}`, error);
      return { ok: false, errorMessage: `${label}: ${error.message}` };
    }
  }

  return { ok: true };
}

async function deleteAllFrom(
  client: SupabaseClient<Database>,
  table: keyof Database["public"]["Tables"],
): Promise<{ ok: boolean; errorMessage?: string }> {
  const { error } = await client.from(table).delete().neq("id", DELETE_ALL_SENTINEL);
  if (error) {
    return { ok: false, errorMessage: `${table}: ${error.message}` };
  }
  return { ok: true };
}

export async function clearSupabaseDatasetServer(): Promise<{
  ok: boolean;
  errorMessage?: string;
}> {
  logDataset("clearSupabaseDataset iniciado");

  let client: SupabaseClient<Database>;
  try {
    client = requireServiceClient();
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Supabase no configurado",
    };
  }

  const tables: (keyof Database["public"]["Tables"])[] = [
    "oportunidades",
    "aplicaciones",
    "articulos",
    "ventas",
    "clientes",
  ];

  for (const table of tables) {
    const result = await deleteAllFrom(client, table);
    if (!result.ok) {
      logDataset(`clear falló en ${table}`, result.errorMessage);
      return result;
    }
  }

  logDataset("clearSupabaseDataset completado");
  return { ok: true };
}

export async function saveDatasetToSupabaseServer(
  dataset: PickupDataset,
  generatedAt: Date,
): Promise<SupabaseDatasetSaveResult> {
  const started = Date.now();
  const emptyCounts = {
    clientes: 0,
    ventas: 0,
    articulos: 0,
    aplicaciones: 0,
    oportunidades: 0,
  };

  let client: SupabaseClient<Database>;
  try {
    client = requireServiceClient();
  } catch (error) {
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage: error instanceof Error ? error.message : "Supabase no configurado",
      durationMs: Date.now() - started,
    };
  }

  logImport("saveDatasetToSupabase iniciado", {
    clientes: dataset.clientes.length,
    ventas: dataset.ventas.length,
    ventaItems: dataset.ventaItems.length,
    articulos: dataset.articulos.length,
    aplicaciones: dataset.aplicaciones.length,
  });

  logApi("clear tables");
  const cleared = await clearSupabaseDatasetServer();
  if (!cleared.ok) {
    logApi("error", cleared.errorMessage);
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage: cleared.errorMessage ?? "No se pudieron limpiar las tablas",
      technicalDetail: cleared.errorMessage,
      recommendation:
        "Supabase rechazó la inserción. Revisá permisos GRANT en las tablas o la service role.",
      durationMs: Date.now() - started,
    };
  }

  const clienteNombreMap = buildClienteNombreMap(dataset.clientes);
  const marcaNombreById = new Map(dataset.marcas.map((m) => [m.id, m.nombre]));
  const modeloNombreById = new Map(dataset.modelos.map((m) => [m.id, m.nombre]));

  const clientesRows = dataset.clientes.map(clienteToDbRow);
  const ventasRows = ventasFlatToDbRows(dataset, clienteNombreMap);
  const articulosRows = dataset.articulos.map(articuloToDbRow);
  const aplicacionesRows = dataset.aplicaciones.map((ap) =>
    aplicacionToDbRow(ap, marcaNombreById, modeloNombreById),
  );

  const steps: {
    label: string;
    table: keyof Database["public"]["Tables"];
    rows: Record<string, unknown>[];
  }[] = [
    { label: "clientes", table: "clientes", rows: clientesRows },
    { label: "ventas", table: "ventas", rows: ventasRows },
    { label: "articulos", table: "articulos", rows: articulosRows },
    { label: "aplicaciones", table: "aplicaciones", rows: aplicacionesRows },
  ];

  for (const step of steps) {
    logApi(`insert ${step.label}`, { rows: step.rows.length });
    const inserted = await chunkInsert(client, step.table, step.rows, step.label);
    if (!inserted.ok) {
      logApi("error", inserted.errorMessage);
      return {
        ok: false,
        counts: emptyCounts,
        errorMessage: inserted.errorMessage ?? `Error al insertar ${step.label}`,
        technicalDetail: inserted.errorMessage,
        recommendation:
          "Supabase rechazó la inserción. Revisá permisos, columnas del esquema o service role.",
        durationMs: Date.now() - started,
      };
    }
  }

  const activeData = pickupDatasetToActiveData(dataset);
  const oportunidadesDetectadas = detectarOportunidadesComerciales(activeData, "excel");
  const oportunidadesRows = oportunidadesDetectadas.map(oportunidadDetectadaToDbRow);

  const opResult = await chunkInsert(client, "oportunidades", oportunidadesRows, "oportunidades");
  if (!opResult.ok) {
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage: opResult.errorMessage,
      durationMs: Date.now() - started,
    };
  }

  const importacionId = createDbId();
  const observaciones = buildImportacionObservaciones(dataset, generatedAt);

  const importRow: Database["public"]["Tables"]["importaciones"]["Insert"] = {
    id: importacionId,
    nombre: `Importación ${generatedAt.toLocaleString("es-AR")}`,
    origen: "excel",
    clientes_count: dataset.clientes.length,
    ventas_count: ventasRows.length,
    articulos_count: dataset.articulos.length,
    aplicaciones_count: dataset.aplicaciones.length,
    observaciones,
  };

  const { error: importError } = await client.from("importaciones").insert(importRow);

  if (importError) {
    logImport("Error registrando importación", importError);
    return {
      ok: false,
      counts: emptyCounts,
      errorMessage: `importaciones: ${importError.message}`,
      durationMs: Date.now() - started,
    };
  }

  const counts = {
    clientes: clientesRows.length,
    ventas: ventasRows.length,
    articulos: articulosRows.length,
    aplicaciones: aplicacionesRows.length,
    oportunidades: oportunidadesRows.length,
  };

  const totalInserted =
    counts.clientes + counts.ventas + counts.articulos + counts.aplicaciones;

  if (totalInserted === 0) {
    logApi("error", "Inserción completada pero 0 filas en tablas operativas");
    return {
      ok: false,
      counts,
      errorMessage: "No se insertó ninguna fila en Supabase",
      technicalDetail: "El mapeo produjo 0 filas insertables (revisá ventaItems y aplicaciones).",
      recommendation: "Generá el dataset de nuevo y verificá que los Excel tengan datos válidos.",
      durationMs: Date.now() - started,
    };
  }

  const durationMs = Date.now() - started;
  logApi("conteos", counts);
  logImport("saveDatasetToSupabase completado", { importacionId, durationMs });

  return {
    ok: true,
    importacionId,
    counts,
    durationMs,
  };
}

/** Validación de conteos antes de persistir (usado por la API). */
export function validateDatasetCountsForImport(
  dataset: PickupDataset,
): { ok: true } | { ok: false; errorMessage: string; technicalDetail: string } {
  const empty: string[] = [];
  if (dataset.clientes.length === 0) empty.push("clientes");
  if (dataset.ventas.length === 0 && dataset.ventaItems.length === 0) {
    empty.push("ventas (cabeceras o líneas)");
  }
  if (dataset.articulos.length === 0) empty.push("artículos");
  if (dataset.aplicaciones.length === 0) empty.push("aplicaciones");

  if (empty.length > 0) {
    const detail = `Recibido: clientes=${dataset.clientes.length}, ventas=${dataset.ventas.length}, ventaItems=${dataset.ventaItems.length}, articulos=${dataset.articulos.length}, aplicaciones=${dataset.aplicaciones.length}`;
    return {
      ok: false,
      errorMessage: `Dataset vacío en: ${empty.join(", ")}`,
      technicalDetail: detail,
    };
  }

  return { ok: true };
}

export async function loadDatasetFromSupabaseServer(): Promise<SupabaseDatasetLoadResult> {
  let client: SupabaseClient<Database>;
  try {
    client = requireServiceClient();
  } catch (error) {
    return {
      ok: false,
      dataset: null,
      activeData: null,
      oportunidades: [],
      generatedAt: null,
      errorMessage: error instanceof Error ? error.message : "Supabase no configurado",
    };
  }

  logLoad("loadDatasetFromSupabase iniciado");

  const { data: importaciones, error: importError } = await client
    .from("importaciones")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (importError) {
    logLoad("Error leyendo importaciones", importError);
    return {
      ok: false,
      dataset: null,
      activeData: null,
      oportunidades: [],
      generatedAt: null,
      errorMessage: importError.message,
    };
  }

  const latestImport = importaciones?.[0] ?? null;
  const observaciones = latestImport?.observaciones ?? null;

  const [
    { data: clientesRows, error: clientesError },
    { data: ventasRows, error: ventasError },
    { data: articulosRows, error: articulosError },
    { data: aplicacionesRows, error: aplicacionesError },
    { data: oportunidadesRows, error: oportunidadesError },
  ] = await Promise.all([
    fetchAllTableRows(client, "clientes"),
    fetchAllTableRows(client, "ventas"),
    fetchAllTableRows(client, "articulos"),
    fetchAllTableRows(client, "aplicaciones"),
    fetchAllTableRows(client, "oportunidades"),
  ]);

  logLoad("filas cargadas (paginado)", {
    clientes: clientesRows.length,
    ventas: ventasRows.length,
    articulos: articulosRows.length,
    aplicaciones: aplicacionesRows.length,
    oportunidades: oportunidadesRows.length,
  });

  const firstError =
    clientesError ?? ventasError ?? articulosError ?? aplicacionesError ?? oportunidadesError;

  if (firstError) {
    logLoad("Error leyendo tablas", firstError);
    return {
      ok: false,
      dataset: null,
      activeData: null,
      oportunidades: [],
      generatedAt: null,
      errorMessage: firstError.message,
    };
  }

  const hasData =
    (clientesRows?.length ?? 0) > 0 ||
    (ventasRows?.length ?? 0) > 0 ||
    (articulosRows?.length ?? 0) > 0;

  if (!hasData) {
    logLoad("Sin filas en Supabase");
    return {
      ok: true,
      dataset: null,
      activeData: null,
      oportunidades: [],
      generatedAt: null,
    };
  }

  const clientes = (clientesRows ?? []).map(dbRowToCliente);
  const { ventas, ventaItems } = dbVentasToVentaItems(ventasRows ?? []);
  const articulos = (articulosRows ?? []).map(dbRowToArticulo);
  const { marcas, modelos } = dbRowsToMarcasModelos(
    aplicacionesRows ?? [],
    observaciones,
  );
  const aplicaciones = (aplicacionesRows ?? []).map((row) =>
    dbRowToAplicacion(row, marcas, modelos),
  );

  const stats = (observaciones?.stats ?? {}) as PickupDatasetStats;
  const generatedAtStr =
    observaciones?.generatedAt ??
    latestImport?.created_at ??
    new Date().toISOString();

  const dataset: PickupDataset = {
    clientes,
    ventas,
    ventaItems,
    articulos,
    aplicaciones,
    marcas,
    modelos,
    solicitudes: [],
    oportunidades: [],
    warnings: (observaciones?.warnings as PickupDataset["warnings"]) ?? [],
    dataQuality:
      (observaciones?.dataQuality as PickupDataset["dataQuality"]) ?? emptyDataQuality(),
    smartNormalization:
      (observaciones?.smartNormalization as PickupDataset["smartNormalization"]) ??
      emptySmartNormalization(),
    applicationAudit: observaciones?.applicationAudit as PickupDataset["applicationAudit"],
    stats: {
      ...defaultStats(),
      ...stats,
      clientesNormalized: clientes.length,
      ventasNormalized: ventas.length,
      articulosUnicos: articulos.length,
      aplicacionesGenerated: aplicaciones.length,
      marcasDetectadas: marcas.length,
      modelosDetectados: modelos.length,
    },
  };

  const oportunidades = (oportunidadesRows ?? []).map(dbRowToOportunidadDetectada);
  const activeData = pickupDatasetToActiveData(dataset);

  logLoad("loadDatasetFromSupabase completado", {
    clientes: clientes.length,
    ventas: ventas.length,
    ventaItems: ventaItems.length,
    articulos: articulos.length,
    aplicaciones: aplicaciones.length,
    oportunidades: oportunidades.length,
  });

  return {
    ok: true,
    dataset,
    activeData,
    oportunidades,
    generatedAt: new Date(generatedAtStr),
    importacionId: latestImport?.id,
  };
}

function defaultStats(): PickupDatasetStats {
  return {
    clientesInputRows: 0,
    clientesNormalized: 0,
    clientesDuplicatesSkipped: 0,
    clientesMapErrors: 0,
    ventasInputRows: 0,
    ventasNormalized: 0,
    ventasMapErrors: 0,
    ventasSinCliente: 0,
    ventaItemsGenerated: 0,
    ventaItemsSinArticulo: 0,
    articulosInputRows: 0,
    articulosUnicos: 0,
    aplicacionesGenerated: 0,
    marcasDetectadas: 0,
    modelosDetectados: 0,
    codigosConMultiplesAplicaciones: 0,
    filasExcluidas: 0,
    fallbacksAplicados: 0,
    erroresCriticos: 0,
    advertenciasCalidad: 0,
    localidadesUnificadas: 0,
    marcasUnificadas: 0,
    modelosUnificados: 0,
    buildTimeMs: 0,
  };
}

function emptyDataQuality(): PickupDataset["dataQuality"] {
  return {
    summary: {
      filasExcluidas: 0,
      fallbacksAplicados: 0,
      advertencias: 0,
      erroresCriticos: 0,
    },
    severity: {
      criticos: 0,
      revisar: 0,
      informativos: 0,
      filasExcluidas: 0,
    },
    issuesBySeverity: { critico: [], revisar: [], informativo: [] },
    criticalErrors: [],
    warnings: [],
    fallbacks: [],
    excludedRows: [],
    topMotivos: [],
    ejemploFilasProblematicas: [],
  };
}

function emptySmartNormalization(): PickupDataset["smartNormalization"] {
  return {
    localidadesUnificadas: 0,
    marcasUnificadas: 0,
    modelosUnificados: 0,
    filasExcluidasPorNormalizacion: 0,
    filasExcluidasAutomaticamente: 0,
    topEquivalencias: [],
  };
}
