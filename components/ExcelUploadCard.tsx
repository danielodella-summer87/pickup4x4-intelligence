"use client";

import { useId, useRef, useState } from "react";
import {
  ExcelReadError,
  type ExcelReadMetadata,
  type ExcelReadProgressPhase,
  readExcelFile,
} from "@/lib/excel/read-workbook";

export type ExcelUploadStatus =
  | "pendiente"
  | "leyendo"
  | "procesando"
  | "leido"
  | "error";

export type ExcelUploadProgressState = {
  status: ExcelUploadStatus;
  percent: number;
  message: string;
  fileName: string | null;
};

export type ExcelRowsLoadedPayload = {
  fileName: string;
  /** Total de filas de datos en la hoja (según rango Excel). */
  rowCount: number;
  /** Filas para tablas / UI (preview acotado). */
  rows: Record<string, unknown>[];
  /** Dataset completo para mapeo (cuando terminó la lectura). */
  fullData?: Record<string, unknown>[];
  metadata: ExcelReadMetadata;
};

type ExcelUploadCardProps = {
  title: string;
  description: string;
  expectedColumns: string[];
  onRowsLoaded: (payload: ExcelRowsLoadedPayload) => void;
  onClear?: () => void;
  onProgressChange?: (state: ExcelUploadProgressState) => void;
};

const statusStyles: Record<
  ExcelUploadStatus,
  { label: string; className: string }
> = {
  pendiente: {
    label: "Pendiente",
    className: "bg-amber-500/15 text-amber-300",
  },
  leyendo: {
    label: "Leyendo",
    className: "bg-sky-500/15 text-sky-300",
  },
  procesando: {
    label: "Procesando",
    className: "bg-violet-500/15 text-violet-300",
  },
  leido: {
    label: "Leído",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  error: {
    label: "Error",
    className: "bg-rose-500/15 text-rose-300",
  },
};

function phaseToProgress(phase: ExcelReadProgressPhase): {
  status: ExcelUploadStatus;
  percent: number;
  message: string;
} {
  switch (phase) {
    case "reading_buffer":
      return {
        status: "leyendo",
        percent: 45,
        message: "Leyendo archivo…",
      };
    case "parsing_workbook":
      return {
        status: "procesando",
        percent: 70,
        message: "Procesando hoja…",
      };
    case "analyzing_sheet":
    case "building_preview":
    case "loading_full_data":
      return {
        status: "procesando",
        percent: 90,
        message: "Procesando hoja…",
      };
    case "done":
      return {
        status: "leido",
        percent: 100,
        message: "Vista previa generada",
      };
    default:
      return {
        status: "leyendo",
        percent: 45,
        message: "Leyendo archivo…",
      };
  }
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400"
      aria-hidden
    />
  );
}

function ProgressBar({
  percent,
  tone = "emerald",
}: {
  percent: number;
  tone?: "emerald" | "sky" | "rose" | "violet";
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const fillClass =
    tone === "sky"
      ? "bg-sky-500"
      : tone === "rose"
        ? "bg-rose-500"
        : tone === "violet"
          ? "bg-violet-500"
          : "bg-emerald-500";

  return (
    <div className="w-full" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
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

export function ExcelUploadCard({
  title,
  description,
  expectedColumns,
  onRowsLoaded,
  onClear,
  onProgressChange,
}: ExcelUploadCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ExcelUploadStatus>("pendiente");
  const [fileName, setFileName] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ExcelReadMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState("Pendiente");
  const [progressHint, setProgressHint] = useState<string | null>(null);

  function emitProgress(
    nextStatus: ExcelUploadStatus,
    percent: number,
    message: string,
    nextFileName: string | null = fileName,
  ) {
    setStatus(nextStatus);
    setProgressPercent(percent);
    setProgressMessage(message);
    onProgressChange?.({
      status: nextStatus,
      percent,
      message,
      fileName: nextFileName,
    });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const sizeMb = file.size / (1024 * 1024);
    const likelyLarge = sizeMb >= 5;

    setFileName(file.name);
    setErrorMessage(null);
    setMetadata(null);
    emitProgress("leyendo", 20, "Archivo seleccionado", file.name);
    setProgressHint(
      likelyLarge
        ? "Archivo grande detectado. Generando vista previa segura."
        : null,
    );

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    try {
      const result = await readExcelFile(file, {
        loadFullData: true,
        onProgress: (phase) => {
          const mapped = phaseToProgress(phase);
          emitProgress(mapped.status, mapped.percent, mapped.message, file.name);
          if (phase === "building_preview" && likelyLarge) {
            setProgressHint(
              "Archivo grande detectado. Generando vista previa segura.",
            );
          }
          if (phase === "loading_full_data") {
            setProgressHint(
              "Cargando todas las filas en memoria. La UI sigue respondiendo…",
            );
          }
        },
      });

      setMetadata(result.metadata);
      setProgressHint(null);
      emitProgress("leido", 100, "Vista previa generada", file.name);

      const dataForImport = result.fullData ?? result.previewRows;

      onRowsLoaded({
        fileName: file.name,
        rowCount: result.metadata.rowsCount,
        rows: result.previewRows,
        fullData: dataForImport,
        metadata: result.metadata,
      });
    } catch (error) {
      setProgressHint(null);
      const message =
        error instanceof ExcelReadError
          ? error.message
          : "No se pudo procesar el archivo.";
      setErrorMessage(message);
      emitProgress("error", 0, "Error al leer archivo", file.name);
      onClear?.();
    }
  }

  function handleReset() {
    setFileName(null);
    setMetadata(null);
    setErrorMessage(null);
    setProgressHint(null);
    emitProgress("pendiente", 0, "Pendiente", null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onClear?.();
  }

  const badge = statusStyles[status];
  const isActive = status === "leyendo" || status === "procesando";
  const progressTone =
    status === "error"
      ? "rose"
      : status === "procesando"
        ? "violet"
        : status === "leyendo"
          ? "sky"
          : "emerald";

  return (
    <article className="flex flex-col rounded-xl border border-slate-700/80 bg-slate-900/50 p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {isActive ? <Spinner /> : null}
          {isActive ? badge.label + "…" : badge.label}
        </span>
      </div>

      <p className="text-sm text-slate-400">{description}</p>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-300">{progressMessage}</span>
        </div>
        <ProgressBar percent={progressPercent} tone={progressTone} />
      </div>

      {isActive && progressHint ? (
        <p className="mt-2 text-xs text-slate-500">{progressHint}</p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="mt-2 text-xs text-rose-300">{errorMessage}</p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Columnas clave esperadas
        </p>
        <ul className="mt-2 space-y-1">
          {expectedColumns.map((col) => (
            <li key={col} className="text-xs text-slate-300">
              · {col}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <label
          htmlFor={inputId}
          className={`inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition ${
            isActive
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-emerald-500/40 hover:text-white"
          }`}
        >
          Seleccionar archivo Excel
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          onChange={handleFileChange}
          disabled={isActive}
        />
        <p className="mt-2 text-xs text-slate-500">
          Solo lectura local. No se envía al servidor. Archivos grandes: preview
          de hasta 2.000 filas en pantalla; datos completos en memoria para
          mapeo.
        </p>
      </div>

      {fileName && (metadata || errorMessage) ? (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <p className="text-slate-300">
            <span className="text-slate-500">Archivo:</span> {fileName}
          </p>

          {metadata ? (
            <dl className="mt-2 grid gap-1 text-xs text-slate-400">
              <div className="flex justify-between gap-2">
                <dt>Tamaño</dt>
                <dd className="text-slate-200">{metadata.fileSizeMB} MB</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Tiempo lectura</dt>
                <dd className="text-slate-200">{metadata.readTimeMs} ms</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Hoja</dt>
                <dd className="truncate text-slate-200">{metadata.sheetName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Filas (total)</dt>
                <dd className="text-slate-200">
                  {metadata.rowsCount.toLocaleString("es-AR")}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Columnas</dt>
                <dd className="text-slate-200">{metadata.columnsCount}</dd>
              </div>
              {metadata.previewTruncated ? (
                <div className="mt-1 text-amber-300/90">
                  Preview UI: {metadata.previewRowsCount.toLocaleString("es-AR")}{" "}
                  filas (límite {metadata.previewRowLimit.toLocaleString("es-AR")}).
                  {metadata.fullDataLoaded
                    ? ` Completos en memoria: ${metadata.rowsCount.toLocaleString("es-AR")} filas estimadas en hoja.`
                    : null}
                </div>
              ) : (
                <p className="mt-1 text-emerald-300">
                  {metadata.rowsCount.toLocaleString("es-AR")} filas cargadas
                </p>
              )}
            </dl>
          ) : null}

          {metadata?.warnings.length ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-300/90">
              {metadata.warnings.map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={handleReset}
            disabled={isActive}
            className="mt-2 text-xs text-slate-400 underline hover:text-white disabled:opacity-50"
          >
            Quitar archivo
          </button>
        </div>
      ) : null}
    </article>
  );
}
