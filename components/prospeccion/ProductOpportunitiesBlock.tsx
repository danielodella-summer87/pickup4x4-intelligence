"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  ProductOpportunityPotential,
  ProductOpportunityStatus,
  ProspectRubro,
} from "@/lib/models/prospeccion";
import {
  PRODUCT_OPP_POTENTIAL_LABELS,
  PRODUCT_OPP_STATUS_LABELS,
  RUBRO_LABELS,
  getProductOpportunityStats,
} from "@/lib/prospeccion/helpers";

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const selectClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none";
const secondaryButton =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";

const potentialColor: Record<ProductOpportunityPotential, string> = {
  alto: "bg-emerald-500/15 text-emerald-300",
  medio: "bg-amber-500/15 text-amber-300",
  bajo: "bg-slate-700/60 text-slate-300",
};

const POTENTIAL_VALUES: ProductOpportunityPotential[] = ["bajo", "medio", "alto"];
const STATUS_VALUES: ProductOpportunityStatus[] = [
  "idea",
  "evaluar",
  "buscar_proveedor",
  "desarrollar",
  "descartado",
];
const RUBRO_VALUES = Object.keys(RUBRO_LABELS) as ProspectRubro[];

/**
 * Tablero de oportunidades de producto: cruza el registro estratégico editable
 * con las menciones detectadas automáticamente en las fichas. No usa botón verde
 * (esa regla la reserva el CTA principal de cada pantalla).
 */
export function ProductOpportunitiesBlock() {
  const {
    prospects,
    productOpportunities,
    createProductOpportunity,
    updateProductOpportunity,
    deleteProductOpportunity,
  } = useProspeccion();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [producto, setProducto] = useState("");
  const [rubro, setRubro] = useState<ProspectRubro | "">("");
  const [potencial, setPotencial] = useState<ProductOpportunityPotential>("medio");
  const [estado, setEstado] = useState<ProductOpportunityStatus>("idea");
  const [comentario, setComentario] = useState("");

  // Menciones automáticas agregadas desde las necesidades no cubiertas de las fichas.
  const stats = useMemo(
    () => getProductOpportunityStats(prospects),
    [prospects],
  );
  const statByProducto = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stats) map.set(s.producto.toLowerCase(), s.menciones);
    return map;
  }, [stats]);

  function resetForm() {
    setProducto("");
    setRubro("");
    setPotencial("medio");
    setEstado("idea");
    setComentario("");
    setMostrarForm(false);
  }

  function handleCrear() {
    if (!producto.trim()) return;
    createProductOpportunity({
      producto: producto.trim(),
      rubro: rubro || undefined,
      menciones: 1,
      potencial,
      estado,
      comentario: comentario.trim() || undefined,
    });
    resetForm();
  }

  return (
    <SectionCard
      title="Oportunidades de producto no disponible"
      description="Necesidades detectadas que Pickup 4x4 aún no resuelve. Base para decidir qué desarrollar o tercerizar."
      action={
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className={secondaryButton}
        >
          {mostrarForm ? "Cerrar" : "＋ Registrar necesidad"}
        </button>
      }
    >
      {mostrarForm ? (
        <div className="mb-6 rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Producto / necesidad
              </span>
              <input
                className={inputClass}
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                placeholder="Ej: soporte de escaleras"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Rubro</span>
              <select
                className={selectClass}
                value={rubro}
                onChange={(e) => setRubro(e.target.value as ProspectRubro | "")}
              >
                <option value="">Sin definir</option>
                {RUBRO_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {RUBRO_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Potencial</span>
              <select
                className={selectClass}
                value={potencial}
                onChange={(e) =>
                  setPotencial(e.target.value as ProductOpportunityPotential)
                }
              >
                {POTENTIAL_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {PRODUCT_OPP_POTENTIAL_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Estado</span>
              <select
                className={selectClass}
                value={estado}
                onChange={(e) => setEstado(e.target.value as ProductOpportunityStatus)}
              >
                {STATUS_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {PRODUCT_OPP_STATUS_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Comentario
              </span>
              <input
                className={inputClass}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Contexto o frecuencia de la necesidad"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleCrear} className={secondaryButton}>
              Guardar necesidad
            </button>
            <button type="button" onClick={resetForm} className={secondaryButton}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {productOpportunities.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no hay necesidades de producto registradas.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="text-slate-400">
                <th className="pb-2 font-medium">Producto / necesidad</th>
                <th className="pb-2 font-medium">Rubro</th>
                <th className="pb-2 font-medium">Menciones</th>
                <th className="pb-2 font-medium">Potencial</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {productOpportunities.map((opp) => {
                const autoMenciones = statByProducto.get(opp.producto.toLowerCase());
                const menciones = autoMenciones ?? opp.menciones;
                return (
                  <tr key={opp.id} className="border-t border-slate-800 align-top">
                    <td className="py-2.5">
                      <span className="font-medium">{opp.producto}</span>
                      {opp.comentario ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {opp.comentario}
                        </span>
                      ) : null}
                      {opp.empresaSolicitante ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Solicitado por: {opp.empresaSolicitante}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-slate-400">
                      {opp.rubro ? RUBRO_LABELS[opp.rubro] : "—"}
                    </td>
                    <td className="py-2.5 tabular-nums">{menciones}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${potentialColor[opp.potencial]}`}
                      >
                        {PRODUCT_OPP_POTENTIAL_LABELS[opp.potencial]}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <select
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-emerald-500/40 focus:outline-none"
                        value={opp.estado}
                        onChange={(e) =>
                          updateProductOpportunity(opp.id, {
                            estado: e.target.value as ProductOpportunityStatus,
                          })
                        }
                      >
                        {STATUS_VALUES.map((v) => (
                          <option key={v} value={v}>
                            {PRODUCT_OPP_STATUS_LABELS[v]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => deleteProductOpportunity(opp.id)}
                        className="text-xs font-medium text-slate-500 hover:text-rose-300"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
