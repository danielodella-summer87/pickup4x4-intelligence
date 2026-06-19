"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ExcelUploadCard } from "@/components/ExcelUploadCard";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-white";

type Diagnostico = {
  filasDiario: number;
  clientesEnSupabase: number;
  articulosEnSupabase: number;
  ventasGeneradas: number;
  ventaItemsGenerados: number;
  ventasSinCliente: number;
  ventaItemsSinArticulo: number;
  ventasSinFecha: number;
  filasInsertadas: number;
};

type Estado = "idle" | "importando" | "ok" | "error";

export default function ImportarVentasPage() {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  function handleRowsLoaded(payload: {
    fileName: string;
    fullData?: Record<string, unknown>[];
    rows: Record<string, unknown>[];
  }) {
    setRows(payload.fullData ?? payload.rows);
    setFileName(payload.fileName);
    setEstado("idle");
    setError(null);
    setDiag(null);
  }

  async function sumarVentas() {
    if (!rows) return;
    setEstado("importando");
    setError(null);
    setDiag(null);
    try {
      const res = await fetch("/api/supabase/import-ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventasRows: rows }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        diagnostico?: Diagnostico;
        errorMessage?: string;
      };
      if (!res.ok || !body.ok) {
        setEstado("error");
        setError(body.errorMessage ?? `Error ${res.status}`);
        return;
      }
      setDiag(body.diagnostico ?? null);
      setEstado("ok");
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : "Error de red.");
    }
  }

  const sinCodigo = diag !== null && diag.ventaItemsGenerados === 0;

  return (
    <AppShell
      moduleTitle="Importar Diario de Ventas"
      moduleDescription="Sumá las ventas a Supabase cruzándolas con los clientes y artículos ya cargados. Solo se reemplaza la tabla de ventas; clientes y artículos no se tocan."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/importar" className={secondaryBtnClass}>
            ← Importación completa
          </Link>
          <Link href="/campanas/lonas" className={secondaryBtnClass}>
            Campaña de lonas
          </Link>
        </div>

        <SectionCard
          title="1 · Subir Diario de Ventas"
          description="El Excel debe traer número de cuenta/cliente y código de artículo por línea. Sin código no se pueden generar líneas de venta."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ExcelUploadCard
              title="Diario de Ventas"
              description="Lectura local; no se envía al servidor hasta confirmar."
              expectedColumns={[
                "Número de cuenta / Cliente (cruza con clientes)",
                "Código de artículo (C.Uniq / Código / SKU)",
                "Fecha",
                "Comprobante / Factura",
                "Descripción, Cantidad (opcionales)",
              ]}
              onRowsLoaded={handleRowsLoaded}
            />
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 text-sm text-slate-300">
              <p className="font-medium text-white">Qué hace esta importación</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
                <li>Lee el Diario y lo cruza con los clientes y artículos ya en Supabase.</li>
                <li>Genera líneas de venta (cliente + código de artículo + fecha).</li>
                <li>
                  Reemplaza <span className="text-slate-200">solo</span> la tabla de ventas.
                  No toca clientes, artículos ni aplicaciones.
                </li>
                <li>Es idempotente: volver a subir el Diario no duplica.</li>
              </ul>
              {fileName ? (
                <p className="mt-3 text-xs text-emerald-300">Archivo: {fileName}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              className={primaryCtaClass}
              onClick={sumarVentas}
              disabled={!rows || estado === "importando"}
            >
              {estado === "importando" ? "Sumando ventas…" : "Sumar ventas a Supabase"}
            </button>
            {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
          </div>
        </SectionCard>

        {diag ? (
          <SectionCard
            title="2 · Resultado de la importación"
            description={
              estado === "ok"
                ? "Ventas sumadas a Supabase. Recargá la campaña para verlas."
                : undefined
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Filas del Diario" value={diag.filasDiario.toLocaleString("es-AR")} />
              <StatCard
                label="Líneas de venta insertadas"
                value={diag.filasInsertadas.toLocaleString("es-AR")}
                trend="up"
              />
              <StatCard
                label="Ventas (comprobantes)"
                value={diag.ventasGeneradas.toLocaleString("es-AR")}
              />
              <StatCard
                label="Clientes en Supabase"
                value={diag.clientesEnSupabase.toLocaleString("es-AR")}
              />
              <StatCard
                label="Ventas sin cliente"
                value={diag.ventasSinCliente.toLocaleString("es-AR")}
                hint="No cruzaron por número de cuenta"
              />
              <StatCard
                label="Líneas sin artículo en catálogo"
                value={diag.ventaItemsSinArticulo.toLocaleString("es-AR")}
                hint="Código no está en artículos (se importan igual)"
              />
              <StatCard
                label="Ventas sin fecha"
                value={diag.ventasSinFecha.toLocaleString("es-AR")}
              />
              <StatCard
                label="Artículos en Supabase"
                value={diag.articulosEnSupabase.toLocaleString("es-AR")}
              />
            </div>

            {sinCodigo ? (
              <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                No se generó ninguna línea de venta: el Diario no trae columna de
                <span className="font-medium"> código de artículo</span>. Sin código no se
                puede cruzar contra ventas. Revisá que el Excel tenga la columna C.Uniq /
                Código / SKU.
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-300">
                Listo. Abrí{" "}
                <Link href="/campanas/lonas" className="text-emerald-300 underline">
                  /campanas/lonas
                </Link>{" "}
                (recargá con F5) y buscá clientes: ahora las ventas reales están en Supabase.
              </p>
            )}
          </SectionCard>
        ) : null}
      </div>
    </AppShell>
  );
}
