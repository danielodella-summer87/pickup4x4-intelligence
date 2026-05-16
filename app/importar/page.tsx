"use client";

import { useMemo, useState } from "react";
import { CodigosMultiplesAplicacionesPanel } from "@/components/CodigosMultiplesAplicacionesPanel";
import { AppShell } from "@/components/AppShell";
import { useDataset } from "@/contexts/DatasetContext";
import {
  ExcelUploadCard,
  type ExcelRowsLoadedPayload,
  type ExcelUploadProgressState,
  type ExcelUploadStatus,
} from "@/components/ExcelUploadCard";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { EXCEL_WORKBOOKS } from "@/lib/excel/column-map";
import { buildPickupDatasetFromRows } from "@/lib/excel/build-dataset";
import type {
  ClassifiedQualityIssue,
  DataQualityReport,
  DataQualitySeverity,
} from "@/lib/excel/data-quality";
import type { SmartNormalizationReport } from "@/lib/excel/normalization";
import {
  buildImportPreview,
  type ColumnCompatibilityStatus,
  type FileColumnDiagnostic,
  type ImportPreview,
  type ImportPreviewWarning,
  type ImportReadinessStatus,
} from "@/lib/excel/import-preview";
import type {
  Articulo,
  ArticuloAplicacion,
} from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { Venta } from "@/lib/models/venta";
import { buildCodigosRepetidosFromAplicaciones } from "@/lib/data/codigos-repetidos";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryCtaClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";

const uploadConfigs = [
  {
    id: "clientes" as const,
    title: "Listado de cuentas",
    description: EXCEL_WORKBOOKS.CUENTAS,
    aporta:
      "Cartera comercial: número de cuenta, razón social, zona, vendedor, localidad y estado.",
    expectedColumns: [
      "Nº Cuenta",
      "Razón Social",
      "Nombre Fantasía",
      "Zona",
      "Vendedor",
      "Localidad",
      "Estado",
    ],
  },
  {
    id: "ventas" as const,
    title: "Diario de ventas",
    description: EXCEL_WORKBOOKS.VENTAS,
    aporta:
      "Histórico de ventas por comprobante: cliente, fecha, importe, tipo y vendedor.",
    expectedColumns: [
      "Nº Cuenta",
      "Fecha",
      "Nº Comprobante",
      "Importe Total",
      "Tipo Comprobante",
      "Vendedor",
    ],
  },
  {
    id: "articulos" as const,
    title: "Artículos y aplicaciones",
    description: EXCEL_WORKBOOKS.ARTICULOS,
    aporta:
      "Catálogo y compatibilidad por vehículo. Un código puede repetirse por aplicación.",
    expectedColumns: [
      "Código (codigoUnico)",
      "Descripción",
      "Rubro / Categoría",
      "Stock",
      "Marca / Modelo vehículo",
      "Años Desde / Hasta",
    ],
  },
];

const reglasSeguridad = [
  "No modificar códigos originales (codigoUnico permanece igual al Excel/KORE).",
  "Generar codigoAplicacion auxiliar para filas repetidas (ej. 1832-A, 1832-B).",
  "Validar duplicados y códigos con múltiples aplicaciones antes de confirmar.",
  "Revisar filas incompletas y advertencias en la vista previa.",
  "La importación real requerirá confirmación humana; no se persiste nada todavía.",
];

type LoadedFiles = {
  clientes: ExcelRowsLoadedPayload | null;
  ventas: ExcelRowsLoadedPayload | null;
  articulos: ExcelRowsLoadedPayload | null;
};

type UploadFileKey = keyof LoadedFiles;

type DatasetBuildProgress = {
  active: boolean;
  percent: number;
  message: string;
};

const uploadFileLabels: Record<UploadFileKey, string> = {
  clientes: "Clientes",
  ventas: "Ventas",
  articulos: "Artículos y aplicaciones",
};

function createInitialUploadProgress(): Record<UploadFileKey, ExcelUploadProgressState> {
  return {
    clientes: { status: "pendiente", percent: 0, message: "Pendiente", fileName: null },
    ventas: { status: "pendiente", percent: 0, message: "Pendiente", fileName: null },
    articulos: { status: "pendiente", percent: 0, message: "Pendiente", fileName: null },
  };
}

function countFilesRead(
  progress: Record<UploadFileKey, ExcelUploadProgressState>,
): number {
  return (Object.keys(progress) as UploadFileKey[]).filter(
    (key) => progress[key].status === "leido",
  ).length;
}

function globalUploadPercent(filesRead: number): number {
  if (filesRead <= 0) return 0;
  if (filesRead === 1) return 33;
  if (filesRead === 2) return 66;
  return 100;
}

function uploadStatusLabel(status: ExcelUploadStatus): string {
  const labels: Record<ExcelUploadStatus, string> = {
    pendiente: "Pendiente",
    leyendo: "Leyendo",
    procesando: "Procesando",
    leido: "Leído",
    error: "Error",
  };
  return labels[status];
}

function ProgressBar({
  percent,
  tone = "emerald",
}: {
  percent: number;
  tone?: "emerald" | "sky" | "violet";
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const fillClass =
    tone === "sky" ? "bg-sky-500" : tone === "violet" ? "bg-violet-500" : "bg-emerald-500";

  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${fillClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[10px] font-medium tabular-nums text-slate-500">
        {clamped}%
      </p>
    </div>
  );
}

function ImportProgressBlock({
  uploadProgress,
  datasetBuildProgress,
}: {
  uploadProgress: Record<UploadFileKey, ExcelUploadProgressState>;
  datasetBuildProgress: DatasetBuildProgress;
}) {
  const filesRead = countFilesRead(uploadProgress);
  const globalPercent = globalUploadPercent(filesRead);

  return (
    <SectionCard
      title="Progreso de importación"
      description="Lectura de archivos Excel y normalización del dataset interno"
    >
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-200">Progreso global de archivos</span>
          <span className="text-slate-500">
            {filesRead} de 3 leídos
          </span>
        </div>
        <ProgressBar percent={globalPercent} tone="emerald" />
      </div>

      <ul className="space-y-4">
        {(Object.keys(uploadFileLabels) as UploadFileKey[]).map((key) => {
          const item = uploadProgress[key];
          const tone =
            item.status === "leyendo"
              ? "sky"
              : item.status === "procesando"
                ? "violet"
                : "emerald";

          return (
            <li
              key={key}
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{uploadFileLabels[key]}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.status === "leido"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : item.status === "error"
                        ? "bg-rose-500/15 text-rose-300"
                        : item.status === "leyendo"
                          ? "bg-sky-500/15 text-sky-300"
                          : item.status === "procesando"
                            ? "bg-violet-500/15 text-violet-300"
                            : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {uploadStatusLabel(item.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.message}</p>
              {item.fileName ? (
                <p className="mt-0.5 truncate text-xs text-slate-600">{item.fileName}</p>
              ) : null}
              <div className="mt-3">
                <ProgressBar percent={item.percent} tone={tone} />
              </div>
            </li>
          );
        })}
      </ul>

      {datasetBuildProgress.active ? (
        <div className="mt-6 border-t border-slate-800 pt-6">
          <p className="text-sm font-medium text-emerald-300">
            {datasetBuildProgress.message || "Normalizando datos…"}
          </p>
          <div className="mt-3">
            <ProgressBar percent={datasetBuildProgress.percent} tone="violet" />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

async function briefDelay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function statusBadgeClass(status: ColumnCompatibilityStatus): string {
  if (status === "compatible") return "bg-emerald-500/15 text-emerald-300";
  if (status === "revisar") return "bg-amber-500/15 text-amber-300";
  return "bg-rose-500/15 text-rose-300";
}

function importReadinessClass(status: ImportReadinessStatus): string {
  if (status === "valida") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "valida_observaciones") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

const severityLabel: Record<DataQualitySeverity, string> = {
  critico: "Crítico",
  revisar: "Revisar",
  informativo: "Informativo",
};

function SeveritySummaryGrid({
  schemaCriticos,
  criticos,
  revisar,
  informativos,
  filasExcluidas,
}: {
  schemaCriticos?: number;
  criticos?: number;
  revisar: number;
  informativos: number;
  filasExcluidas?: number;
}) {
  const esquema = schemaCriticos ?? criticos ?? 0;
  const esquemaLabel =
    schemaCriticos !== undefined ? "Esquema bloqueante" : "Críticos";

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={esquemaLabel}
        value={String(esquema)}
        trend={esquema > 0 ? "down" : "neutral"}
      />
      <StatCard label="Revisar" value={String(revisar)} trend={revisar > 0 ? "down" : "neutral"} />
      <StatCard
        label="Informativos"
        value={String(informativos)}
        hint="No bloquean la importación"
        trend="neutral"
      />
      <StatCard
        label="Filas excluidas"
        value={filasExcluidas !== undefined ? String(filasExcluidas) : "—"}
        hint="Datos inválidos omitidos"
        trend="down"
      />
    </div>
  );
}

function IssuesList({
  issues,
  emptyMessage,
}: {
  issues: ClassifiedQualityIssue[] | ImportPreviewWarning[];
  emptyMessage?: string;
}) {
  if (issues.length === 0) {
    return emptyMessage ? (
      <p className="text-sm text-slate-500">{emptyMessage}</p>
    ) : null;
  }

  return (
    <ul className="space-y-2 text-sm text-slate-300">
      {issues.map((issue, index) => {
        const code = "code" in issue ? issue.code : "—";
        const message = issue.message;
        const count = "count" in issue ? issue.count : undefined;
        return (
          <li key={`${code}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            {message}
            {count !== undefined ? ` (${count.toLocaleString("es-AR")})` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function ColumnDiagnosticBlock({ file }: { file: FileColumnDiagnostic }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-white">{file.fileLabel}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {file.rowCount.toLocaleString("es-AR")} filas ·{" "}
            {file.totalColumns} columnas detectadas
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(file.status)}`}
        >
          {file.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Primeras {file.first20Headers.length} columnas detectadas
          </p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-slate-400">
            {file.first20Headers.join(" · ") || "—"}
            {file.detectedHeaders.length > file.first20Headers.length
              ? ` · +${file.detectedHeaders.length - file.first20Headers.length} más`
              : null}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-500/80">
            Columnas clave encontradas ({file.recognized.length})
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-300">
            {file.recognized.map((col) => (
              <li key={col.fieldKey}>
                <span className="text-emerald-400">{col.fieldLabel}</span>
                <span className="text-slate-500"> → </span>
                <span className="font-mono text-slate-400">{col.matchedHeader}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {file.missingRequiredBlocking.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-rose-400/90">
            Columnas mínimas faltantes (bloquean importación)
          </p>
          <ul className="mt-2 space-y-1 text-xs text-rose-200/90">
            {file.missingRequiredBlocking.map((col) => (
              <li key={col.fieldKey}>
                {col.fieldLabel}{" "}
                <span className="text-slate-500">
                  (ej. {col.expectedAliases.slice(0, 3).join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {file.missingRequiredInformativo.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No se usa en v1:{" "}
          {file.missingRequiredInformativo.map((c) => c.fieldLabel).join(", ")}
        </p>
      ) : null}

      {file.missingRecommendedRevisar.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-400/90">
            Columnas recomendadas a revisar
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100/80">
            {file.missingRecommendedRevisar.map((col) => (
              <li key={col.fieldKey}>
                {col.fieldLabel}{" "}
                <span className="text-slate-500">
                  (ej. {col.expectedAliases.slice(0, 2).join(", ")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {file.missingRecommendedInformativo.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Opcionales en v1:{" "}
          {file.missingRecommendedInformativo.map((c) => c.fieldLabel).join(", ")}
        </p>
      ) : null}

      {file.unrecognized.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            {file.unrecognized.length} columnas del Excel no usadas en v1 (informativo)
          </summary>
          <p className="mt-2 font-mono text-xs leading-relaxed text-slate-500">
            {file.unrecognized.slice(0, 30).join(" · ")}
            {file.unrecognized.length > 30
              ? ` · +${file.unrecognized.length - 30} más`
              : null}
          </p>
        </details>
      ) : null}

      {file.sampleMapSuccessRate !== null ? (
        <p className="mt-3 text-xs text-slate-500">
          Muestra de mapeo ({Math.min(200, file.rowCount)} filas):{" "}
          <span className="text-slate-300">
            {(file.sampleMapSuccessRate * 100).toFixed(1)}% exitoso
          </span>
        </p>
      ) : null}
    </article>
  );
}

function PreviewRowsTable({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, unknown>[];
}) {
  const previewRows = rows.slice(0, 3);
  if (previewRows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {title}: sin filas para mostrar.
      </p>
    );
  }

  const columns = [
    ...new Set(previewRows.flatMap((row) => Object.keys(row))),
  ].slice(0, 8);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400">
              {columns.map((col) => (
                <th key={col} className="px-2 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {previewRows.map((row, index) => (
              <tr key={index} className="border-t border-slate-800">
                {columns.map((col) => (
                  <td key={col} className="max-w-[160px] truncate px-2 py-2">
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function rowsForImport(payload: ExcelRowsLoadedPayload): Record<string, unknown>[] {
  return payload.fullData ?? payload.rows;
}

function NormalizedTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{title}: sin registros.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400">
              {headers.map((header) => (
                <th key={header.key} className="px-2 py-2 font-medium">
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-800">
                {headers.map((header) => (
                  <td key={header.key} className="max-w-[180px] truncate px-2 py-2">
                    {formatCell(row[header.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function clientesToRows(clientes: Cliente[]): Record<string, unknown>[] {
  return clientes.slice(0, 5).map((cliente) => ({ ...cliente }));
}

function ventasToRows(ventas: Venta[]): Record<string, unknown>[] {
  return ventas.slice(0, 5).map((venta) => ({ ...venta }));
}

function articulosToRows(articulos: Articulo[]): Record<string, unknown>[] {
  return articulos.slice(0, 5).map((articulo) => ({ ...articulo }));
}

function aplicacionesToRows(
  aplicaciones: ArticuloAplicacion[],
): Record<string, unknown>[] {
  return aplicaciones.slice(0, 5).map((aplicacion) => ({ ...aplicacion }));
}

const datasetLabel: Record<string, string> = {
  clientes: "Listado de cuentas",
  ventas: "Diario de ventas",
  articulos: "Artículos y aplicaciones",
};

function DataQualityBlock({ report }: { report: DataQualityReport }) {
  const { severity } = report;
  const revisarIssues = report.issuesBySeverity.revisar;
  const informativoIssues = report.issuesBySeverity.informativo;

  return (
    <div className="mt-6 border-t border-slate-800 pt-6">
      <h3 className="text-sm font-semibold text-white">Calidad de datos</h3>
      <p className="mt-1 text-xs text-slate-500">
        Resumen por severidad. Las filas excluidas no impiden usar el dataset si el
        resto es válido.
      </p>

      <SeveritySummaryGrid
        criticos={severity.criticos}
        revisar={severity.revisar}
        informativos={severity.informativos}
        filasExcluidas={severity.filasExcluidas}
      />

      {revisarIssues.length > 0 ? (
        <div className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-200">Puntos a revisar</p>
          <div className="mt-3">
            <IssuesList issues={revisarIssues.slice(0, 12)} />
          </div>
        </div>
      ) : null}

      {informativoIssues.length > 0 ? (
        <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            Observaciones informativas ({informativoIssues.length})
          </summary>
          <div className="mt-3">
            <IssuesList issues={informativoIssues.slice(0, 20)} />
          </div>
        </details>
      ) : null}

      {report.topMotivos.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Top 10 motivos
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400">
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 text-right font-medium">Casos</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {report.topMotivos.map((item) => (
                  <tr key={`${item.kind}-${item.motivo}`} className="border-t border-slate-800">
                    <td className="max-w-md truncate px-3 py-2">{item.motivo}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                          item.severity === "critico"
                            ? "bg-rose-500/15 text-rose-300"
                            : item.severity === "informativo"
                              ? "bg-slate-500/20 text-slate-400"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {severityLabel[item.severity]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {report.fallbacks.length > 0 ? (
        <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-sky-300">
            Trazabilidad de fallbacks ({report.fallbacks.length})
          </summary>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-400">
            {report.fallbacks.slice(0, 50).map((item, index) => (
              <li key={`${item.dataset}-${item.rowIndex}-${item.campo}-${index}`}>
                <span className="text-slate-300">
                  {datasetLabel[item.dataset]} · fila {item.rowIndex + 1}
                </span>
                {" · "}
                <span className="font-mono text-sky-400">{item.campo}</span>:{" "}
                &quot;{item.valorOriginal ?? "∅"}&quot; → &quot;{item.valorFinal}&quot;
                <span className="block text-slate-500">{item.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {report.ejemploFilasProblematicas.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Ejemplos de filas problemáticas (hasta 5)
          </p>
          <ul className="mt-2 space-y-3">
            {report.ejemploFilasProblematicas.map((example, index) => (
              <li
                key={`${example.dataset}-${example.rowIndex}-${index}`}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs"
              >
                <p className="font-medium text-slate-200">
                  {datasetLabel[example.dataset]} · fila {example.rowIndex + 1}
                </p>
                <p className="mt-1 text-amber-200/90">{example.motivo}</p>
                <p className="mt-1 text-slate-500">{example.detalle}</p>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-500">
                  {Object.entries(example.preview)
                    .map(([key, value]) => `${key}: ${value || "∅"}`)
                    .join(" · ") || "Sin vista de fila"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const normFieldLabel: Record<string, string> = {
  localidad: "Localidad",
  marca: "Marca",
  modelo: "Modelo",
};

function SmartNormalizationBlock({ report }: { report: SmartNormalizationReport }) {
  const hasEquivalencias = report.topEquivalencias.length > 0;

  return (
    <div className="mt-6 border-t border-slate-800 pt-6">
      <h3 className="text-sm font-semibold text-white">Normalización inteligente</h3>
      <p className="mt-1 text-xs text-slate-500">
        Unificación local de localidades, marcas y modelos (sin APIs externas). Valores
        ambiguos se excluyen automáticamente.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Localidades unificadas"
          value={String(report.localidadesUnificadas)}
          trend="neutral"
        />
        <StatCard
          label="Marcas unificadas"
          value={String(report.marcasUnificadas)}
          trend="neutral"
        />
        <StatCard
          label="Modelos unificados"
          value={String(report.modelosUnificados)}
          trend="neutral"
        />
        <StatCard
          label="Filas excluidas"
          value={String(report.filasExcluidasAutomaticamente)}
          hint="Sin confianza suficiente"
          trend="down"
        />
      </div>

      {hasEquivalencias ? (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Top equivalencias detectadas
          </p>
          <ul className="mt-3 space-y-4">
            {report.topEquivalencias.map((group) => (
              <li
                key={`${group.field}-${group.canonical}`}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs"
              >
                <p className="font-medium text-emerald-300">
                  {normFieldLabel[group.field] ?? group.field}: {group.canonical}
                </p>
                <p className="mt-2 text-slate-400">
                  {group.variants.map((variant) => (
                    <span key={variant} className="mr-2 inline-block font-mono text-slate-300">
                      {variant}
                    </span>
                  ))}
                  <span className="text-slate-600">→</span>{" "}
                  <span className="font-medium text-emerald-400">{group.canonical}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          No se detectaron variantes adicionales respecto al valor canónico en esta importación.
        </p>
      )}
    </div>
  );
}

export default function ImportarPage() {
  const {
    dataset: generatedDataset,
    source,
    generatedAt,
    hasLocalPersistence,
    setDataset,
    clearDataset,
    clearLocalDataset,
  } = useDataset();
  const { isPersistedLocally } = useActiveDataset();
  const [loaded, setLoaded] = useState<LoadedFiles>({
    clientes: null,
    ventas: null,
    articulos: null,
  });
  const [uploadProgress, setUploadProgress] = useState(createInitialUploadProgress);
  const [datasetBuildProgress, setDatasetBuildProgress] = useState<DatasetBuildProgress>({
    active: false,
    percent: 0,
    message: "",
  });
  const [isBuildingDataset, setIsBuildingDataset] = useState(false);

  const allFilesLoaded =
    loaded.clientes !== null &&
    loaded.ventas !== null &&
    loaded.articulos !== null;

  const importPreview: ImportPreview | null = useMemo(() => {
    if (!allFilesLoaded) return null;

    return buildImportPreview({
      clientes: rowsForImport(loaded.clientes!),
      ventas: rowsForImport(loaded.ventas!),
      articulosAplicaciones: rowsForImport(loaded.articulos!),
    });
  }, [allFilesLoaded, loaded]);

  const columnDiagnostics = importPreview?.columnDiagnostics;

  const importReadiness = columnDiagnostics?.readiness;

  const canBuildDataset =
    allFilesLoaded && importReadiness !== undefined && importReadiness.canBuildDataset;

  const previewWarningsRevisar = useMemo(
    () => importPreview?.advertencias.filter((w) => w.severity === "revisar") ?? [],
    [importPreview],
  );

  const previewWarningsInformativo = useMemo(
    () => importPreview?.advertencias.filter((w) => w.severity === "informativo") ?? [],
    [importPreview],
  );

  function handleUploadProgress(key: UploadFileKey, state: ExcelUploadProgressState) {
    setUploadProgress((prev) => ({ ...prev, [key]: state }));
  }

  function resetUploadProgress(key: UploadFileKey) {
    setUploadProgress((prev) => ({
      ...prev,
      [key]: { status: "pendiente", percent: 0, message: "Pendiente", fileName: null },
    }));
  }

  async function handleGenerateDataset() {
    if (!canBuildDataset || !loaded.clientes || !loaded.ventas || !loaded.articulos) {
      return;
    }

    setIsBuildingDataset(true);
    setDatasetBuildProgress({
      active: true,
      percent: 0,
      message: "Normalizando datos…",
    });

    await briefDelay(30);
    setDatasetBuildProgress({
      active: true,
      percent: 20,
      message: "Validando clientes…",
    });
    await briefDelay(40);
    setDatasetBuildProgress({
      active: true,
      percent: 40,
      message: "Validando ventas…",
    });
    await briefDelay(40);
    setDatasetBuildProgress({
      active: true,
      percent: 60,
      message: "Normalizando artículos…",
    });
    await briefDelay(40);
    setDatasetBuildProgress({
      active: true,
      percent: 80,
      message: "Aplicando calidad de datos…",
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    try {
      const dataset = buildPickupDatasetFromRows({
        clientesRows: rowsForImport(loaded.clientes),
        ventasRows: rowsForImport(loaded.ventas),
        articulosRows: rowsForImport(loaded.articulos),
      });
      setDataset(dataset);
      setDatasetBuildProgress({
        active: true,
        percent: 100,
        message: "Dataset generado",
      });
    } finally {
      setIsBuildingDataset(false);
    }
  }

  const codigosRepetidosGenerados = useMemo(() => {
    if (!generatedDataset) return [];
    return buildCodigosRepetidosFromAplicaciones(generatedDataset.aplicaciones);
  }, [generatedDataset]);

  return (
    <AppShell
      moduleTitle="Importar datos"
      moduleDescription="Carga controlada desde Excel/KORE hacia Pickup 4x4 Intelligence."
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Preparación de carga
          </p>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            Carga controlada desde Excel/KORE hacia Pickup 4x4 Intelligence. Los
            archivos se procesan solo en tu navegador; no se envían al servidor ni
            se guardan en base de datos.
          </p>

          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
            <strong className="font-semibold text-amber-200">
              Persistencia local temporal:
            </strong>{" "}
            estos datos viven solo en este navegador y no sustituyen una base de
            datos.
          </div>

          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>Fuente activa del sistema:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                source === "excel"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-700/80 text-slate-300"
              }`}
            >
              {formatDatasetSourceLabel(source, {
                persistedLocally: hasLocalPersistence,
              })}
            </span>
            {isPersistedLocally ? (
              <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                Excel persistido localmente
              </span>
            ) : null}
            {generatedAt ? (
              <span className="text-xs text-slate-500">
                · generado{" "}
                {generatedAt.toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            ) : null}
          </p>

          {hasLocalPersistence ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={clearLocalDataset}
                className={secondaryCtaClass}
              >
                Borrar dataset local
              </button>
              <button
                type="button"
                onClick={clearDataset}
                className={secondaryCtaClass}
              >
                Volver a datos mock
              </button>
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          {uploadConfigs.map((config) => (
            <ExcelUploadCard
              key={config.id}
              title={config.title}
              description={`${config.description}. ${config.aporta}`}
              expectedColumns={config.expectedColumns}
              onProgressChange={(state) => handleUploadProgress(config.id, state)}
              onRowsLoaded={(payload) => {
                clearDataset();
                setDatasetBuildProgress({ active: false, percent: 0, message: "" });
                setLoaded((prev) => ({ ...prev, [config.id]: payload }));
              }}
              onClear={() => {
                clearDataset();
                setDatasetBuildProgress({ active: false, percent: 0, message: "" });
                resetUploadProgress(config.id);
                setLoaded((prev) => ({ ...prev, [config.id]: null }));
              }}
            />
          ))}
        </div>

        <ImportProgressBlock
          uploadProgress={uploadProgress}
          datasetBuildProgress={datasetBuildProgress}
        />

        {columnDiagnostics ? (
          <SectionCard
            title="Diagnóstico de columnas"
            description="Encabezados reales del Excel vs aliases en lib/excel/column-map"
          >
            <div
              className={`mb-5 rounded-lg border p-4 ${importReadinessClass(columnDiagnostics.readiness.status)}`}
            >
              <p className="text-lg font-semibold">{columnDiagnostics.readiness.label}</p>
              <p className="mt-1 text-sm opacity-90">
                {columnDiagnostics.readiness.status === "valida"
                  ? "Podés generar el dataset y usar dashboard y mostrador."
                  : columnDiagnostics.readiness.status === "valida_observaciones"
                    ? "Podés generar el dataset. Las filas inválidas se excluyen y quedan registradas."
                    : "Solo se bloquea si faltan columnas mínimas en el encabezado del Excel."}
              </p>
              {columnDiagnostics.readiness.status === "bloqueada" &&
              columnDiagnostics.readiness.blockReason ? (
                <div className="mt-4 rounded-lg border border-rose-500/35 bg-rose-950/40 p-4">
                  <p className="text-sm font-semibold text-rose-200">
                    Motivo real del bloqueo
                  </p>
                  <p className="mt-2 text-sm text-rose-100/90">
                    {columnDiagnostics.readiness.blockReason}
                  </p>
                  {columnDiagnostics.readiness.schemaCriticalIssues.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 text-sm text-rose-100/80">
                      {columnDiagnostics.readiness.schemaCriticalIssues.map((issue) => (
                        <li key={`${issue.datasetKey}-${issue.fieldKey}`}>
                          <span className="font-medium">{issue.fileLabel}</span>
                          {": "}
                          {issue.expectedLabels.join(" / ")} (
                          {issue.fieldLabel})
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {columnDiagnostics.readiness.status !== "bloqueada" &&
              columnDiagnostics.readiness.estimatedRowsExcluded > 0 ? (
                <p className="mt-3 text-sm text-amber-200/90">
                  Filas que probablemente se excluirán al generar:{" "}
                  {columnDiagnostics.readiness.estimatedRowsExcluded.toLocaleString(
                    "es-AR",
                  )}
                  . No bloquean la importación.
                </p>
              ) : null}
              <SeveritySummaryGrid
                schemaCriticos={columnDiagnostics.readiness.severity.schemaCriticos}
                revisar={columnDiagnostics.readiness.severity.revisar}
                informativos={columnDiagnostics.readiness.severity.informativos}
                filasExcluidas={
                  columnDiagnostics.readiness.severity.filasExcluidasEstimadas
                }
              />
            </div>

            <div className="space-y-4">
              {columnDiagnostics.files.map((file) => (
                <ColumnDiagnosticBlock key={file.datasetKey} file={file} />
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Vista previa de importación"
          description={
            allFilesLoaded
              ? "Resumen calculado con lib/excel (mapeo y validaciones preliminares)."
              : "Cargá los 3 archivos para generar la vista previa."
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Filas clientes"
              value={String(loaded.clientes?.rowCount ?? "—")}
              hint={loaded.clientes?.fileName ?? "Pendiente"}
            />
            <StatCard
              label="Filas ventas"
              value={String(loaded.ventas?.rowCount ?? "—")}
              hint={loaded.ventas?.fileName ?? "Pendiente"}
            />
            <StatCard
              label="Artículos únicos"
              value={
                importPreview ? String(importPreview.articulosUnicos) : "—"
              }
              hint="Tras mapeo"
            />
            <StatCard
              label="Aplicaciones"
              value={importPreview ? String(importPreview.aplicaciones) : "—"}
              hint="codigoAplicacion aux."
              trend="neutral"
            />
            <StatCard
              label="Advertencias"
              value={
                importPreview ? String(importPreview.advertencias.length) : "—"
              }
              hint="Pre-importación"
              trend="down"
            />
          </div>

          {previewWarningsRevisar.length > 0 ? (
            <div className="mt-5 border-t border-slate-800 pt-4">
              <p className="text-sm font-medium text-amber-200">Puntos a revisar</p>
              <div className="mt-3">
                <IssuesList issues={previewWarningsRevisar} />
              </div>
            </div>
          ) : null}

          {previewWarningsInformativo.length > 0 ? (
            <details className="mt-4 border-t border-slate-800 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-400">
                Observaciones informativas ({previewWarningsInformativo.length})
              </summary>
              <div className="mt-3">
                <IssuesList issues={previewWarningsInformativo} />
              </div>
            </details>
          ) : null}

          {importPreview && importPreview.codigosRepetidos.length > 0 ? (
            <CodigosMultiplesAplicacionesPanel
              items={importPreview.codigosRepetidos}
              totalLabel="Vista previa pre-importación"
            />
          ) : null}

          {allFilesLoaded ? (
            <div className="mt-6 space-y-6 border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Primeras 3 filas por archivo (solo muestra visual).
              </p>
              <PreviewRowsTable
                title={`${uploadConfigs[0].title} (${loaded.clientes!.rowCount.toLocaleString("es-AR")} filas)`}
                rows={loaded.clientes!.rows}
              />
              <PreviewRowsTable
                title={`${uploadConfigs[1].title} (${loaded.ventas!.rowCount.toLocaleString("es-AR")} filas)`}
                rows={loaded.ventas!.rows}
              />
              <PreviewRowsTable
                title={`${uploadConfigs[2].title} (${loaded.articulos!.rowCount.toLocaleString("es-AR")} filas)`}
                rows={loaded.articulos!.rows}
              />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Reglas de seguridad de datos"
          description="Obligatorias antes de cualquier importación definitiva"
        >
          <ul className="space-y-2 text-sm text-slate-300">
            {reglasSeguridad.map((regla) => (
              <li key={regla} className="flex gap-2">
                <span className="mt-0.5 text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span>{regla}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-5">
          <button
            type="button"
            disabled={!canBuildDataset || isBuildingDataset}
            onClick={handleGenerateDataset}
            className={primaryCtaClass}
          >
            {isBuildingDataset ? "Generando dataset…" : "Generar dataset interno"}
          </button>
          {isBuildingDataset ? (
            <p className="mt-3 text-sm font-medium text-violet-300">
              {datasetBuildProgress.message || "Normalizando datos…"}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-slate-500">
            {!allFilesLoaded
              ? "Cargá los 3 archivos Excel para habilitar este paso."
              : !canBuildDataset
                ? (importReadiness?.blockReason ??
                  "Faltan columnas mínimas en el encabezado o archivos por cargar.")
                : importReadiness?.status === "valida_observaciones"
                  ? "Podés generar el dataset. Revisá las observaciones cuando tengas tiempo."
                  : "Construye el dataset normalizado y aplícalo al sistema (se guarda en localStorage de este navegador)."}
          </p>
          {source === "excel" ? (
            <button
              type="button"
              onClick={clearDataset}
              className={`${secondaryCtaClass} mt-4`}
            >
              Volver a datos mock
            </button>
          ) : null}
        </div>

        {generatedDataset && source === "excel" ? (
          <SectionCard
            title="Dataset interno generado"
            description={`Procesado en ${generatedDataset.stats.buildTimeMs} ms · persistido en localStorage`}
          >
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Dataset aplicado al sistema. Los módulos usan estos datos tras recargar
              la página mientras no borres el dataset local ni vuelvas a mock.
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Clientes normalizados"
                value={generatedDataset.stats.clientesNormalized.toLocaleString(
                  "es-AR",
                )}
                hint={`${generatedDataset.stats.clientesMapErrors} errores de mapeo`}
              />
              <StatCard
                label="Ventas normalizadas"
                value={generatedDataset.stats.ventasNormalized.toLocaleString(
                  "es-AR",
                )}
                hint={`${generatedDataset.stats.ventasSinCliente} sin cliente`}
              />
              <StatCard
                label="Artículos únicos"
                value={generatedDataset.stats.articulosUnicos.toLocaleString(
                  "es-AR",
                )}
              />
              <StatCard
                label="Aplicaciones generadas"
                value={generatedDataset.stats.aplicacionesGenerated.toLocaleString(
                  "es-AR",
                )}
                hint={`${generatedDataset.stats.codigosConMultiplesAplicaciones} códigos repetidos`}
              />
              <StatCard
                label="Marcas detectadas"
                value={String(generatedDataset.stats.marcasDetectadas)}
              />
              <StatCard
                label="Modelos detectados"
                value={String(generatedDataset.stats.modelosDetectados)}
              />
              <StatCard
                label="Advertencias"
                value={String(generatedDataset.warnings.length)}
                trend="down"
              />
            </div>

            {generatedDataset.warnings.length > 0 ? (
              <ul className="mt-5 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400">
                {generatedDataset.warnings.map((warning) => (
                  <li key={warning.code} className="flex gap-2">
                    <span className="text-amber-400" aria-hidden>
                      ⚠
                    </span>
                    <span>
                      {warning.message}
                      {warning.count !== undefined ? ` (${warning.count})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <DataQualityBlock report={generatedDataset.dataQuality} />
            <SmartNormalizationBlock report={generatedDataset.smartNormalization} />

            {codigosRepetidosGenerados.length > 0 ? (
              <CodigosMultiplesAplicacionesPanel
                items={codigosRepetidosGenerados}
                totalLabel="Dataset normalizado en memoria"
              />
            ) : null}

            <div className="mt-6 space-y-6 border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Muestra de registros normalizados (primeras 5 filas / aplicaciones).
              </p>
              <NormalizedTable
                title="Clientes"
                headers={[
                  { key: "numeroCuenta", label: "Cuenta" },
                  { key: "razonSocial", label: "Razón social" },
                  { key: "zona", label: "Zona" },
                  { key: "localidad", label: "Localidad" },
                  { key: "estado", label: "Estado" },
                ]}
                rows={clientesToRows(generatedDataset.clientes)}
              />
              <NormalizedTable
                title="Ventas"
                headers={[
                  { key: "numeroCuenta", label: "Cuenta" },
                  { key: "fecha", label: "Fecha" },
                  { key: "numeroComprobante", label: "Comprobante" },
                  { key: "importeTotal", label: "Importe" },
                  { key: "tipoComprobante", label: "Tipo" },
                ]}
                rows={ventasToRows(generatedDataset.ventas)}
              />
              <NormalizedTable
                title="Artículos"
                headers={[
                  { key: "codigoUnico", label: "codigoUnico" },
                  { key: "descripcion", label: "Descripción" },
                  { key: "rubro", label: "Rubro" },
                  { key: "stock", label: "Stock" },
                  { key: "activo", label: "Activo" },
                ]}
                rows={articulosToRows(generatedDataset.articulos)}
              />
              <NormalizedTable
                title="Aplicaciones"
                headers={[
                  { key: "codigoUnico", label: "codigoUnico" },
                  { key: "codigoAplicacion", label: "codigoAplicacion" },
                  { key: "marcaId", label: "marcaId" },
                  { key: "modeloId", label: "modeloId" },
                  { key: "anioDesde", label: "Desde" },
                  { key: "anioHasta", label: "Hasta" },
                ]}
                rows={aplicacionesToRows(generatedDataset.aplicaciones)}
              />
            </div>
          </SectionCard>
        ) : null}
      </div>
    </AppShell>
  );
}
