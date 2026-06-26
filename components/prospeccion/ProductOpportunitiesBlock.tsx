"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  CollapsibleSection,
  TrafficLightDot,
} from "@/components/prospeccion/ProspeccionUI";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  CompanyProspect,
  ProductOpportunity,
  ProductOpportunityPotential,
  ProductOpportunityStatus,
  ProspectRubro,
} from "@/lib/models/prospeccion";
import {
  PRIORITY_LABELS,
  PRODUCT_OPP_POTENTIAL_LABELS,
  PRODUCT_OPP_STATUS_LABELS,
  RUBRO_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  getProspectTrafficLight,
  potencialFromMenciones,
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

const RUBRO_VALUES = Object.keys(RUBRO_LABELS) as ProspectRubro[];

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Rubros desde los que se deduce una necesidad (espejo de las reglas del seed
 * scripts/build-prospeccion.cjs). Permite trazar las empresas cuando la
 * necesidad no está cargada explícitamente en una ficha. Para necesidades
 * cargadas a mano, cae al rubro propio de la oportunidad.
 */
function rubrosDeducidos(opp: ProductOpportunity): ProspectRubro[] {
  const t = norm(opp.producto);
  if (/escalera/.test(t)) return ["telecomunicaciones", "fachadas_altura", "estado"];
  if (/herramienta/.test(t)) return ["climatizacion", "fachadas_altura", "telecomunicaciones"];
  if (/linea(s)? de vida/.test(t)) return ["fachadas_altura"];
  if (/cuadrilla/.test(t)) return ["estado", "forestal"];
  if (/cargador/.test(t)) return ["alquiladora", "constructora"];
  return opp.rubro ? [opp.rubro] : [];
}

type OppView = {
  opp: ProductOpportunity;
  empresas: CompanyProspect[];
  menciones: number;
  potencial: ProductOpportunityPotential;
  rubros: ProspectRubro[];
  /** "ficha" si hay necesidades cargadas; "rubro" si se dedujo por rubro. */
  modo: "ficha" | "rubro" | "mixto";
};

/**
 * Tablero de oportunidades de producto: accionable y trazable. Cada necesidad
 * muestra cuántas empresas la generan y permite expandir el detalle. El potencial
 * se calcula por menciones (1–4 bajo · 5–14 medio · 15+ alto). Sin botón verde.
 */
export function ProductOpportunitiesBlock() {
  const {
    prospects,
    productOpportunities,
    catalogos,
    createProductOpportunity,
    updateProductOpportunity,
    deleteProductOpportunity,
  } = useProspeccion();

  // Estados desde el catálogo editable (Configuración); fallback a los defaults.
  const estadoOptions = useMemo(
    () => catalogos.estadosProducto.filter((s) => s.activo),
    [catalogos.estadosProducto],
  );
  const estadoLabel = (id: string): string =>
    catalogos.estadosProducto.find((s) => s.id === id)?.nombre ??
    PRODUCT_OPP_STATUS_LABELS[id as ProductOpportunityStatus] ??
    id;

  const [mostrarForm, setMostrarForm] = useState(false);
  const [producto, setProducto] = useState("");
  const [rubro, setRubro] = useState<ProspectRubro | "">("");
  const [estado, setEstado] = useState<string>("idea");
  const [comentario, setComentario] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const vistas = useMemo<OppView[]>(() => {
    return productOpportunities.map((opp) => {
      const prod = norm(opp.producto);
      // 1) Empresas con la necesidad cargada en su ficha (no disponible).
      const porFicha = prospects.filter((p) =>
        p.necesidades.some(
          (n) =>
            n.disponibilidad !== "disponible" &&
            (norm(n.descripcion).includes(prod) || prod.includes(norm(n.descripcion))),
        ),
      );
      // 2) Empresas deducidas por rubro.
      const rubros = rubrosDeducidos(opp);
      const porRubro = rubros.length
        ? prospects.filter((p) => rubros.includes(p.rubro))
        : [];
      // Unión sin duplicar.
      const mapa = new Map<string, CompanyProspect>();
      for (const p of [...porFicha, ...porRubro]) mapa.set(p.id, p);
      const empresas = [...mapa.values()].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es"),
      );
      const menciones = empresas.length;
      const modo: OppView["modo"] =
        porFicha.length > 0 ? (porRubro.length > 0 ? "mixto" : "ficha") : "rubro";
      return {
        opp,
        empresas,
        menciones,
        potencial: potencialFromMenciones(menciones),
        rubros,
        modo,
      };
    });
  }, [productOpportunities, prospects]);

  function toggle(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setProducto("");
    setRubro("");
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
      potencial: "bajo", // se recalcula por menciones en la vista
      estado,
      comentario: comentario.trim() || undefined,
    });
    resetForm();
  }

  return (
    <CollapsibleSection
      title="Oportunidades de producto no disponible"
      count={productOpportunities.length}
      description="Necesidades que Pickup 4x4 aún no resuelve. El potencial se calcula por menciones (1–4 bajo · 5–14 medio · 15+ alto). Hacé clic en “Ver empresas” para trazar de dónde sale cada necesidad."
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
              <span className="mb-1 block text-xs font-medium text-slate-500">Estado</span>
              <select
                className={selectClass}
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                {estadoOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
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

      {vistas.length === 0 ? (
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
              {vistas.map((v) => {
                const abierto = expandido.has(v.opp.id);
                return (
                  <Fragment key={v.opp.id}>
                    <tr className="border-t border-slate-800 align-top">
                      <td className="py-2.5">
                        <span className="font-medium">{v.opp.producto}</span>
                        {v.opp.comentario ? (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {v.opp.comentario}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggle(v.opp.id)}
                          disabled={v.menciones === 0}
                          className="mt-1 text-xs font-medium text-emerald-300 hover:text-emerald-200 disabled:cursor-default disabled:text-slate-600"
                        >
                          {v.menciones === 0
                            ? "Sin empresas vinculadas"
                            : abierto
                              ? "Ocultar empresas"
                              : `${v.menciones} mención${v.menciones === 1 ? "" : "es"} · Ver empresas`}
                        </button>
                      </td>
                      <td className="py-2.5 text-slate-400">
                        {v.rubros.length
                          ? v.rubros.map((r) => RUBRO_LABELS[r]).join(", ")
                          : "—"}
                      </td>
                      <td className="py-2.5 tabular-nums">{v.menciones}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${potentialColor[v.potencial]}`}
                        >
                          {PRODUCT_OPP_POTENTIAL_LABELS[v.potencial]}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <select
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-emerald-500/40 focus:outline-none"
                          value={v.opp.estado}
                          onChange={(e) =>
                            updateProductOpportunity(v.opp.id, {
                              estado: e.target.value,
                            })
                          }
                        >
                          {/* Asegura que el valor actual aparezca aunque esté inactivo. */}
                          {(estadoOptions.some((s) => s.id === v.opp.estado)
                            ? estadoOptions
                            : [
                                {
                                  id: v.opp.estado,
                                  nombre: estadoLabel(v.opp.estado),
                                  orden: 0,
                                  activo: true,
                                },
                                ...estadoOptions,
                              ]
                          ).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => deleteProductOpportunity(v.opp.id)}
                          className="text-xs font-medium text-slate-500 hover:text-rose-300"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                    {abierto ? (
                      <tr className="border-t border-slate-800/60 bg-slate-950/40">
                        <td colSpan={6} className="px-0 py-3">
                          <EmpresasVinculadas vista={v} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

function EmpresasVinculadas({ vista }: { vista: OppView }) {
  return (
    <div className="px-1">
      <p className="mb-2 px-2 text-xs text-slate-400">
        {vista.modo === "rubro"
          ? "Deducida por rubro: empresas cuyo rubro coincide con la necesidad."
          : vista.modo === "mixto"
            ? "Empresas con la necesidad cargada en ficha + deducidas por rubro."
            : "Empresas con la necesidad cargada en su ficha."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm [&_th]:px-3 [&_td]:px-3">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2 font-medium">Empresa</th>
              <th className="pb-2 font-medium">Rubro</th>
              <th className="pb-2 font-medium">Localidad</th>
              <th className="pb-2 font-medium">Prioridad</th>
              <th className="pb-2 font-medium">Sem.</th>
              <th className="pb-2 font-medium">Etapa</th>
              <th className="pb-2 font-medium">Fuente</th>
              <th className="pb-2 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            {vista.empresas.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="py-2 font-medium text-slate-200">{p.nombre}</td>
                <td className="py-2 text-slate-400">{RUBRO_LABELS[p.rubro]}</td>
                <td className="py-2 text-slate-400">
                  {p.localidad ?? p.departamento ?? "—"}
                </td>
                <td className="py-2">{PRIORITY_LABELS[p.prioridad]}</td>
                <td className="py-2">
                  <TrafficLightDot value={getProspectTrafficLight(p)} />
                </td>
                <td className="py-2 text-slate-400">{STAGE_LABELS[p.etapa]}</td>
                <td className="py-2 text-slate-400">{SOURCE_LABELS[p.fuente]}</td>
                <td className="py-2 text-right">
                  <Link
                    href={`/prospeccion-empresas/${p.id}`}
                    className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                  >
                    Ver oportunidad
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
