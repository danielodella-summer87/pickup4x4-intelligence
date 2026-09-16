"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { CatalogFileUploadCard } from "@/components/catalog-audit/CatalogFileUploadCard";
import { useCatalogAudit } from "@/contexts/CatalogAuditContext";
import { buildCatalogImportPreview } from "@/lib/catalog-audit/import-preview";
import { mapCatalogRows } from "@/lib/catalog-audit/mapper";
import type { CatalogFileReadResult } from "@/lib/catalog-audit/read-file";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryCtaClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700";

const SOURCE_SUGGESTIONS = ["proteccar", "competidor", "proveedor", "otro"];

export default function AuditoriaCatalogoImportacionesPage() {
  const { setProducts, lastSaveResult } = useCatalogAudit();
  const [source, setSource] = useState("proteccar");
  const [fileResult, setFileResult] = useState<CatalogFileReadResult | null>(null);
  const [confirmed, setConfirmed] = useState<{ count: number } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!fileResult) return null;
    const mapped = mapCatalogRows(fileResult.rows, {
      source: source.trim() || "otro",
      importedAt: new Date().toISOString(),
    });
    return buildCatalogImportPreview(mapped);
  }, [fileResult, source]);

  function handleConfirmImport() {
    if (!preview) return;
    setConfirmError(null);
    const result = setProducts(preview.products);
    if (result.ok) {
      setConfirmed({ count: preview.products.length });
    } else {
      setConfirmError(
        result.errorMessage ?? "No se pudo guardar el catálogo localmente.",
      );
    }
  }

  return (
    <AppShell
      moduleTitle="Auditoría de Catálogo · Importaciones"
      moduleDescription="Importación local de catálogos externos (.xlsx / .csv). No se envía nada a servidores externos."
    >
      <div className="space-y-6">
        <SectionCard
          title="Fuente del catálogo"
          description='Identificador libre de origen: "proteccar", "competidor", "proveedor", "otro"…'
        >
          <label className="block max-w-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Fuente
            </span>
            <input
              type="text"
              list="catalog-source-suggestions"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
            <datalist id="catalog-source-suggestions">
              {SOURCE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <CatalogFileUploadCard
            onFileLoaded={(result) => {
              setFileResult(result);
              setConfirmed(null);
              setConfirmError(null);
            }}
            onClear={() => {
              setFileResult(null);
              setConfirmed(null);
              setConfirmError(null);
            }}
          />
        </div>

        {preview ? (
          <SectionCard
            title="Vista previa de importación"
            description="Diagnóstico local antes de confirmar. Nada se persiste todavía."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Filas leídas"
                value={preview.rowsRead.toLocaleString("es-AR")}
              />
              <StatCard
                label="Filas válidas"
                value={preview.validRows.toLocaleString("es-AR")}
                trend="up"
              />
              <StatCard
                label="Filas incompletas"
                value={preview.incompleteRows.toLocaleString("es-AR")}
                hint="Con hallazgos de calidad"
                trend={preview.incompleteRows > 0 ? "down" : "neutral"}
              />
              <StatCard
                label="Errores"
                value={preview.errorRows.toLocaleString("es-AR")}
                hint="Filas excluidas de la importación"
                trend={preview.errorRows > 0 ? "down" : "neutral"}
              />
            </div>

            {preview.errors.length > 0 ? (
              <details className="mt-5 rounded-lg border border-rose-500/25 bg-rose-500/5 p-4">
                <summary className="cursor-pointer text-sm font-medium text-rose-200">
                  Errores de fila ({preview.errors.length})
                </summary>
                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs text-rose-100/90">
                  {preview.errors.slice(0, 50).map((error) => (
                    <li key={error.rowIndex}>
                      Fila {error.rowIndex + 1}: {error.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-6">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={preview.products.length === 0}
                className={primaryCtaClass}
              >
                Confirmar importación
              </button>
              <span className="text-xs text-slate-500">
                Reemplaza el dataset de Auditoría de Catálogo guardado localmente
                (clave <code>pickup4x4_catalog_audit_v1</code>).
              </span>
            </div>

            {confirmed ? (
              <div className="mt-4 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <p className="font-semibold text-emerald-200">
                  Importación confirmada: {confirmed.count.toLocaleString("es-AR")}{" "}
                  productos guardados localmente.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a href="/auditoria-catalogo/productos" className={secondaryCtaClass}>
                    Ver productos
                  </a>
                  <a href="/auditoria-catalogo" className={secondaryCtaClass}>
                    Ir al resumen
                  </a>
                </div>
              </div>
            ) : null}

            {confirmError ? (
              <p className="mt-4 text-sm text-rose-300">{confirmError}</p>
            ) : null}
          </SectionCard>
        ) : null}

        {lastSaveResult && !lastSaveResult.ok ? (
          <p className="text-sm text-rose-300">
            Última operación de guardado falló: {lastSaveResult.errorMessage}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
