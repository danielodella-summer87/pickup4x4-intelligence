"use client";

import { useMemo, useState } from "react";
import type { Articulo } from "@/lib/models/articulo";
import type { ProposalProductItem } from "@/lib/models/prospeccion";
import {
  formatMoneyUSD,
  itemSubtotal,
} from "@/lib/prospeccion/proposal-commercial";

const inputClass =
  "min-h-[2.5rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 [color-scheme:dark] focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const smallButton =
  "rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800";
const addButton =
  "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40";

function genItemId(): string {
  return `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_RESULTS = 25;

/**
 * Editor de productos propuestos: buscador sobre el catálogo 4x4 (artículos) +
 * grilla editable de ítems (cantidad / precio unitario / subtotal). El total se
 * calcula desde los ítems y se informa vía onChange al contenedor.
 */
export function ProposalProductsEditor({
  articulos,
  items,
  onChange,
}: {
  articulos: Articulo[];
  items: ProposalProductItem[];
  onChange: (items: ProposalProductItem[]) => void;
}) {
  const [query, setQuery] = useState("");

  const hayCatalogo = articulos.length > 0;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const activos = articulos.filter((a) => a.activo !== false);
    return activos
      .filter((a) =>
        [a.codigoUnico, a.descripcion, a.marcaArticulo, a.categoria]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [articulos, query]);

  function addArticulo(a: Articulo) {
    const nuevo: ProposalProductItem = {
      id: genItemId(),
      codigo: a.codigoUnico,
      nombre: a.descripcion,
      cantidad: 1,
      precioUnitario: a.precioLista ?? 0,
    };
    onChange([...items, nuevo]);
    setQuery("");
  }

  function addManual() {
    onChange([
      ...items,
      { id: genItemId(), nombre: "", cantidad: 1, precioUnitario: 0 },
    ]);
  }

  function updateItem(id: string, patch: Partial<ProposalProductItem>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    onChange(items.filter((it) => it.id !== id));
  }

  const total = items.reduce((s, it) => s + itemSubtotal(it), 0);

  return (
    <div className="sm:col-span-4">
      <p className="mb-2 text-xs font-medium text-slate-500">Productos propuestos</p>

      {!hayCatalogo ? (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          No hay productos cargados en el catálogo. Podés completar la propuesta
          manualmente cuando el catálogo esté disponible.
        </p>
      ) : null}

      {/* Buscador de catálogo */}
      {hayCatalogo ? (
        <div className="relative mb-3">
          <input
            className={inputClass}
            value={query}
            placeholder="Buscar producto por código, descripción o marca…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
              {matches.map((a) => (
                <li key={a.codigoUnico}>
                  <button
                    type="button"
                    onClick={() => addArticulo(a)}
                    className="flex w-full flex-col gap-0.5 border-b border-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <span className="text-slate-200">{a.descripcion}</span>
                    <span className="text-xs text-slate-500">
                      {a.codigoUnico}
                      {a.marcaArticulo ? ` · ${a.marcaArticulo}` : ""}
                      {typeof a.precioLista === "number"
                        ? ` · ${formatMoneyUSD(a.precioLista)}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="absolute z-10 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-500">
              Sin coincidencias en el catálogo.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={addManual} className={addButton}>
          ＋ Agregar producto manual
        </button>
      </div>

      {/* Grilla de ítems */}
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no se cargaron productos para esta propuesta.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="pb-2 pr-2 font-medium">Producto</th>
                <th className="w-20 pb-2 px-2 font-medium">Cantidad</th>
                <th className="w-32 pb-2 px-2 font-medium">Precio unitario</th>
                <th className="w-32 pb-2 px-2 text-right font-medium">Subtotal</th>
                <th className="w-16 pb-2 pl-2 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-800">
                  <td className="py-2 pr-2">
                    <input
                      className={inputClass}
                      value={it.nombre}
                      placeholder="Nombre del producto"
                      onChange={(e) => updateItem(it.id, { nombre: e.target.value })}
                    />
                    {it.codigo ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        Código: {it.codigo}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={it.cantidad}
                      onChange={(e) =>
                        updateItem(it.id, { cantidad: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={it.precioUnitario}
                      onChange={(e) =>
                        updateItem(it.id, {
                          precioUnitario: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-300">
                    {formatMoneyUSD(itemSubtotal(it))}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-xs font-medium text-slate-500 hover:text-rose-300"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700">
                <td colSpan={3} className="py-2 pr-2 text-right text-sm font-medium text-slate-400">
                  Total propuesta
                </td>
                <td className="py-2 px-2 text-right text-sm font-semibold tabular-nums text-emerald-300">
                  {formatMoneyUSD(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
