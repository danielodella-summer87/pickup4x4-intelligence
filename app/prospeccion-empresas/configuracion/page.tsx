"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { GuiaUso, ProspeccionTabs } from "@/components/prospeccion/ProspeccionUI";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import type {
  ProspectCatalogItem,
  ProspectCatalogKind,
} from "@/lib/models/prospeccion";

const inputClass =
  "min-h-[2.5rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const secondaryButton =
  "rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800";
const smallButton =
  "rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Draft = { nombre: string; descripcion: string; orden: number };

const CATALOGOS: {
  kind: ProspectCatalogKind;
  key: "rubros" | "etapas" | "tiposActividad" | "estadosProducto";
  titulo: string;
  descripcion?: string;
}[] = [
  { kind: "rubros", key: "rubros", titulo: "Rubros" },
  { kind: "etapas", key: "etapas", titulo: "Etapas" },
  { kind: "tipos_actividad", key: "tiposActividad", titulo: "Tipos de actividad" },
  {
    kind: "estados_producto",
    key: "estadosProducto",
    titulo: "Estados de oportunidad de producto",
    descripcion:
      "Estados editables para las oportunidades de producto no disponible (Idea, Evaluar, Buscar proveedor, Desarrollar, Descartado). Persisten localmente.",
  },
];

export default function ConfiguracionCatalogosPage() {
  const { catalogos, upsertCatalogItem, isHydrated, source } = useProspeccion();

  // Borradores de alta por catálogo.
  const [nuevos, setNuevos] = useState<Record<string, Draft>>({});
  // Borradores de edición por id de item.
  const [edits, setEdits] = useState<Record<string, Draft>>({});

  if (!isHydrated) {
    return (
      <AppShell moduleTitle="Configuración de catálogos">
        <p className="text-sm text-slate-400">Cargando catálogos…</p>
      </AppShell>
    );
  }

  function draftFor(item: ProspectCatalogItem): Draft {
    return (
      edits[item.id] ?? {
        nombre: item.nombre,
        descripcion: item.descripcion ?? "",
        orden: item.orden,
      }
    );
  }

  function setEdit(id: string, patch: Partial<Draft>) {
    setEdits((prev) => {
      const base = prev[id] ?? { nombre: "", descripcion: "", orden: 0 };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  function guardarEdicion(kind: ProspectCatalogKind, item: ProspectCatalogItem) {
    const d = draftFor(item);
    upsertCatalogItem(kind, {
      id: item.id,
      nombre: d.nombre.trim() || item.nombre,
      descripcion: d.descripcion.trim() || undefined,
      orden: Number(d.orden) || 0,
      activo: item.activo,
    });
    setEdits((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }

  function toggleActivo(kind: ProspectCatalogKind, item: ProspectCatalogItem) {
    upsertCatalogItem(kind, { ...item, activo: !item.activo });
  }

  function agregar(kind: ProspectCatalogKind, key: string) {
    const d = nuevos[key];
    if (!d || !d.nombre.trim()) return;
    const nombre = d.nombre.trim();
    // id estable derivado del nombre (sin funciones impuras en render); la tabla
    // es por catálogo, así que el slug del nombre alcanza como identidad.
    upsertCatalogItem(kind, {
      id: `${kind}-${slugify(nombre) || "item"}`,
      nombre,
      descripcion: d.descripcion.trim() || undefined,
      orden: Number(d.orden) || 0,
      activo: true,
    });
    setNuevos((prev) => ({ ...prev, [key]: { nombre: "", descripcion: "", orden: 0 } }));
  }

  return (
    <AppShell
      moduleTitle="Configuración de catálogos"
      moduleDescription="Rubros, etapas y tipos de actividad editables"
    >
      <div className="space-y-6">
        <ProspeccionTabs />

        <GuiaUso>
          Editá los catálogos que alimentan los selectores del módulo. Si Supabase
          no está configurado, los cambios quedan solo en esta sesión.
          {source !== "supabase" ? (
            <span className="mt-1 block text-xs text-amber-300">
              Fuente actual: {source} — sin persistencia remota de catálogos.
            </span>
          ) : null}
        </GuiaUso>

        {CATALOGOS.map(({ kind, key, titulo, descripcion }) => {
          const items = catalogos[key];
          const nuevo = nuevos[key] ?? { nombre: "", descripcion: "", orden: 0 };
          return (
            <SectionCard
              key={key}
              title={titulo}
              description={
                descripcion ??
                "Editá nombre, descripción y orden. Para quitar un valor, desactivalo."
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2 font-medium">Nombre</th>
                      <th className="pb-2 font-medium">Descripción</th>
                      <th className="pb-2 font-medium">Orden</th>
                      <th className="pb-2 font-medium">Activo</th>
                      <th className="pb-2 text-right font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-3 text-slate-500">
                          Sin valores en este catálogo.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const d = draftFor(item);
                        return (
                          <tr key={item.id} className="border-t border-slate-800">
                            <td className="py-2">
                              <input
                                className={inputClass}
                                value={d.nombre}
                                onChange={(e) => setEdit(item.id, { nombre: e.target.value })}
                              />
                            </td>
                            <td className="py-2">
                              <input
                                className={inputClass}
                                value={d.descripcion}
                                onChange={(e) =>
                                  setEdit(item.id, { descripcion: e.target.value })
                                }
                              />
                            </td>
                            <td className="py-2 w-24">
                              <input
                                type="number"
                                className={inputClass}
                                value={d.orden}
                                onChange={(e) =>
                                  setEdit(item.id, { orden: Number(e.target.value) })
                                }
                              />
                            </td>
                            <td className="py-2">
                              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={item.activo}
                                  onChange={() => toggleActivo(kind, item)}
                                  className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                                />
                                {item.activo ? "Activo" : "Inactivo"}
                              </label>
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => guardarEdicion(kind, item)}
                                className={smallButton}
                              >
                                Guardar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Nuevo nombre
                  </span>
                  <input
                    className={inputClass}
                    value={nuevo.nombre}
                    placeholder="Agregar valor…"
                    onChange={(e) =>
                      setNuevos((prev) => ({
                        ...prev,
                        [key]: { ...nuevo, nombre: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Descripción
                  </span>
                  <input
                    className={inputClass}
                    value={nuevo.descripcion}
                    onChange={(e) =>
                      setNuevos((prev) => ({
                        ...prev,
                        [key]: { ...nuevo, descripcion: e.target.value },
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => agregar(kind, key)}
                  className={secondaryButton}
                >
                  ＋ Agregar
                </button>
              </div>
            </SectionCard>
          );
        })}

        <SectionCard
          title="Departamentos"
          description="Listado de referencia (no editable en esta fase)."
        >
          <div className="flex flex-wrap gap-2">
            {catalogos.departamentos.map((d) => (
              <span
                key={d.id}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
              >
                {d.nombre}
              </span>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
