"use client";

import { useId, useRef, useState } from "react";
import {
  CatalogFileReadError,
  readCatalogFile,
  type CatalogFileReadResult,
} from "@/lib/catalog-audit/read-file";

type CatalogFileUploadCardProps = {
  onFileLoaded: (result: CatalogFileReadResult) => void;
  onClear?: () => void;
};

export function CatalogFileUploadCard({
  onFileLoaded,
  onClear,
}: CatalogFileUploadCardProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"pendiente" | "leyendo" | "leido" | "error">(
    "pendiente",
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogFileReadResult | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMessage(null);
    setResult(null);
    setStatus("leyendo");

    try {
      const readResult = await readCatalogFile(file);
      setResult(readResult);
      setStatus("leido");
      onFileLoaded(readResult);
    } catch (error) {
      const message =
        error instanceof CatalogFileReadError
          ? error.message
          : "No se pudo procesar el archivo.";
      setErrorMessage(message);
      setStatus("error");
      onClear?.();
    }
  }

  function handleReset() {
    setFileName(null);
    setResult(null);
    setErrorMessage(null);
    setStatus("pendiente");
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  }

  const badgeClass =
    status === "leido"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "error"
        ? "bg-rose-500/15 text-rose-300"
        : status === "leyendo"
          ? "bg-sky-500/15 text-sky-300"
          : "bg-amber-500/15 text-amber-300";

  const badgeLabel =
    status === "leido"
      ? "Leído"
      : status === "error"
        ? "Error"
        : status === "leyendo"
          ? "Leyendo…"
          : "Pendiente";

  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Archivo de catálogo</h2>
          <p className="mt-1 text-sm text-slate-400">
            Formatos aceptados: .xlsx, .xls o .csv
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>

      <div className="mt-4">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-white"
        >
          Seleccionar archivo
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          onChange={handleFileChange}
          disabled={status === "leyendo"}
        />
        <p className="mt-2 text-xs text-slate-500">
          Solo lectura local en tu navegador. No se envía a ningún servidor ni API externa.
        </p>
      </div>

      {errorMessage ? (
        <p className="mt-3 text-xs text-rose-300">{errorMessage}</p>
      ) : null}

      {fileName && result ? (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
          <p className="text-slate-300">
            <span className="text-slate-500">Archivo:</span> {fileName}
          </p>
          <dl className="mt-2 grid gap-1 text-xs text-slate-400">
            <div className="flex justify-between gap-2">
              <dt>Tamaño</dt>
              <dd className="text-slate-200">{result.fileSizeMB} MB</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Hoja</dt>
              <dd className="truncate text-slate-200">{result.sheetName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Filas detectadas</dt>
              <dd className="text-slate-200">
                {result.rows.length.toLocaleString("es-AR")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Columnas detectadas</dt>
              <dd className="text-slate-200">{result.detectedHeaders.length}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-xs text-slate-400 underline hover:text-white"
          >
            Quitar archivo
          </button>
        </div>
      ) : null}
    </article>
  );
}
