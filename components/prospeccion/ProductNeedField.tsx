"use client";

import { useMemo, useRef, useState, type JSX } from "react";
import { useProspeccion } from "@/contexts/ProspeccionContext";
import { canonicalProductKey } from "@/lib/prospeccion/helpers";

const inputClass =
  "min-h-[2.75rem] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";
const optionClass =
  "block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800";

/**
 * Combobox con búsqueda para elegir un producto/necesidad ya existente o crear
 * uno nuevo. Las sugerencias salen del registro global de oportunidades de
 * producto + las necesidades "no disponibles" cargadas en las fichas. Crear uno
 * nuevo lo registra globalmente (sin duplicar por clave canónica).
 */
export function ProductNeedField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const { prospects, productOpportunities, createProductOpportunity } =
    useProspeccion();
  const [abierto, setAbierto] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Productos existentes, únicos por clave canónica (primer display name visto).
  const opciones = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of productOpportunities) {
      const k = canonicalProductKey(o.producto);
      if (k && !map.has(k)) map.set(k, o.producto);
    }
    for (const p of prospects) {
      for (const n of p.necesidades) {
        if (n.disponibilidad === "disponible") continue;
        const k = canonicalProductKey(n.descripcion);
        if (k && !map.has(k)) map.set(k, n.descripcion);
      }
    }
    return [...map.values()];
  }, [productOpportunities, prospects]);

  const queryKey = canonicalProductKey(value);

  const filtradas = useMemo(
    () =>
      opciones
        .filter((o) => canonicalProductKey(o).includes(queryKey))
        .slice(0, 8),
    [opciones, queryKey],
  );

  // El panel se abre con el foco; "+ Agregar producto" es SIEMPRE la última opción.
  const mostrarPanel = abierto;

  function cerrar() {
    setAbierto(false);
  }

  function seleccionar(nombre: string) {
    onChange(nombre);
    cerrar();
  }

  // "+ Agregar producto": si hay texto, crea (o selecciona el existente sin
  // duplicar); si está vacío, mantiene el foco para que el usuario escriba.
  function onAgregar(e: { preventDefault: () => void }) {
    const nombre = value.trim();
    if (!nombre) {
      e.preventDefault(); // no roba el foco del input
      inputRef.current?.focus();
      setAbierto(true);
      return;
    }
    const key = canonicalProductKey(nombre);
    const existente = opciones.find((o) => canonicalProductKey(o) === key);
    if (existente) {
      seleccionar(existente); // ya existe canónicamente: no duplicar
      return;
    }
    createProductOpportunity({
      producto: nombre,
      menciones: 1,
      potencial: "bajo",
      estado: "idea",
    });
    onChange(nombre);
    cerrar();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className={inputClass}
        value={value}
        placeholder="Buscar o escribir producto / necesidad…"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setAbierto(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setAbierto(false), 120);
        }}
      />
      {mostrarPanel ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
          {filtradas.map((o) => (
            <button
              key={o}
              type="button"
              className={optionClass}
              onMouseDown={() => seleccionar(o)}
            >
              {o}
            </button>
          ))}
          <button
            type="button"
            className={`${optionClass} border-t border-slate-800 font-medium text-emerald-300`}
            onMouseDown={onAgregar}
          >
            {value.trim()
              ? `+ Agregar producto: "${value.trim()}"`
              : "+ Agregar producto"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
