"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ArticuloMostradorCard } from "@/components/distribuidor/ArticuloMostradorCard";
import { DistribuidorFilters } from "@/components/distribuidor/DistribuidorFilters";
import { DistribuidorSummary } from "@/components/distribuidor/DistribuidorSummary";
import {
  PresupuestoModal,
  type PresupuestoFormulario,
} from "@/components/distribuidor/PresupuestoModal";
import { VehicleSelector } from "@/components/distribuidor/VehicleSelector";
import {
  getArticulosPorVehiculo,
  getCategoriasDisponibles,
  getMarcaNombre,
  getMarcasDisponibles,
  getModeloNombre,
  getModelosPorMarca,
  getRubrosDisponibles,
  type ArticuloMostrador,
} from "@/lib/data/distribuidor-insights";
import { useActiveDataset } from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex min-h-[3.5rem] w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-4 text-lg font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[16rem]";

const formularioInicial: PresupuestoFormulario = {
  nombre: "",
  telefono: "",
  observaciones: "",
};

export default function DistribuidorPage() {
  const { data } = useActiveDataset();

  const [marcaId, setMarcaId] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rubro, setRubro] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [formulario, setFormulario] = useState<PresupuestoFormulario>(formularioInicial);

  const marcas = useMemo(() => getMarcasDisponibles(data), [data]);

  const modelos = useMemo(
    () => (marcaId ? getModelosPorMarca(marcaId, data) : []),
    [data, marcaId],
  );

  const articulosBase = useMemo(() => {
    if (!marcaId || !modeloId) return [];
    return getArticulosPorVehiculo(marcaId, modeloId, data);
  }, [data, marcaId, modeloId]);

  const articulosFiltrados = useMemo(() => {
    if (!marcaId || !modeloId) return [];
    return getArticulosPorVehiculo(marcaId, modeloId, data, {
      busqueda: busqueda.trim() || undefined,
      categoria: categoria || undefined,
      rubro: rubro || undefined,
    });
  }, [data, marcaId, modeloId, busqueda, categoria, rubro]);

  const categorias = useMemo(
    () => getCategoriasDisponibles(articulosBase),
    [articulosBase],
  );

  const rubros = useMemo(() => getRubrosDisponibles(articulosBase), [articulosBase]);

  const marcaNombre = marcaId ? getMarcaNombre(marcaId, data) : null;
  const modeloNombre = modeloId ? getModeloNombre(modeloId, data) : null;

  const articulosSeleccionados = useMemo(() => {
    const map = new Map(articulosBase.map((a) => [a.codigoUnico, a]));
    return [...seleccionados]
      .map((codigo) => map.get(codigo))
      .filter((a): a is ArticuloMostrador => Boolean(a));
  }, [articulosBase, seleccionados]);

  const handleSelectMarca = useCallback((id: string) => {
    setMarcaId(id);
    setModeloId(null);
    setBusqueda("");
    setCategoria("");
    setRubro("");
    setSeleccionados(new Set());
  }, []);

  const handleSelectModelo = useCallback((id: string) => {
    setModeloId(id);
    setBusqueda("");
    setCategoria("");
    setRubro("");
    setSeleccionados(new Set());
  }, []);

  const toggleArticulo = useCallback((codigoUnico: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigoUnico)) {
        next.delete(codigoUnico);
      } else {
        next.add(codigoUnico);
      }
      return next;
    });
  }, []);

  const limpiarFiltros = useCallback(() => {
    setBusqueda("");
    setCategoria("");
    setRubro("");
  }, []);

  const quitarArticulo = useCallback((codigoUnico: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      next.delete(codigoUnico);
      return next;
    });
  }, []);

  const vehiculoCompleto = Boolean(marcaId && modeloId);

  return (
    <AppShell
      moduleTitle="Mostrador táctil"
      moduleDescription="Consultá accesorios por vehículo y armá una solicitud de presupuesto en el local."
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-28">
        <DistribuidorSummary
          marcaNombre={marcaNombre}
          modeloNombre={modeloNombre}
          cantidadAccesorios={articulosFiltrados.length}
          cantidadSeleccionados={seleccionados.size}
        />

        <VehicleSelector
          marcas={marcas}
          modelos={modelos}
          marcaId={marcaId}
          modeloId={modeloId}
          onSelectMarca={handleSelectMarca}
          onSelectModelo={handleSelectModelo}
        />

        {vehiculoCompleto ? (
          <>
            <DistribuidorFilters
              busqueda={busqueda}
              categoria={categoria}
              rubro={rubro}
              categorias={categorias}
              rubros={rubros}
              onBusquedaChange={setBusqueda}
              onCategoriaChange={setCategoria}
              onRubroChange={setRubro}
              onLimpiar={limpiarFiltros}
            />

            <section>
              <p className="mb-4 text-sm font-medium text-slate-400">
                {articulosFiltrados.length === 0
                  ? "No hay accesorios con estos filtros para este vehículo."
                  : `${articulosFiltrados.length} accesorio${articulosFiltrados.length === 1 ? "" : "s"} — tocá para agregar a la solicitud`}
              </p>
              <ul className="space-y-4">
                {articulosFiltrados.map((articulo) => (
                  <li key={articulo.codigoUnico}>
                    <ArticuloMostradorCard
                      articulo={articulo}
                      seleccionado={seleccionados.has(articulo.codigoUnico)}
                      onToggle={() => toggleArticulo(articulo.codigoUnico)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-base text-slate-400">
            Elegí marca y modelo para ver los accesorios compatibles.
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-4 py-4 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-sm text-slate-400 sm:text-left">
            {seleccionados.size > 0
              ? `${seleccionados.size} artículo${seleccionados.size === 1 ? "" : "s"} listo${seleccionados.size === 1 ? "" : "s"} para presupuestar`
              : "Seleccioná accesorios y pedí presupuesto"}
          </p>
          <button
            type="button"
            disabled={!vehiculoCompleto}
            onClick={() => setModalAbierto(true)}
            className={primaryCtaClass}
          >
            Solicitar presupuesto
          </button>
        </div>
      </div>

      <PresupuestoModal
        abierto={modalAbierto}
        marcaNombre={marcaNombre ?? "—"}
        modeloNombre={modeloNombre ?? "—"}
        articulos={articulosSeleccionados}
        formulario={formulario}
        onCerrar={() => setModalAbierto(false)}
        onChange={setFormulario}
        onQuitarArticulo={quitarArticulo}
      />
    </AppShell>
  );
}
