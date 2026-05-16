"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { useDataset } from "@/contexts/DatasetContext";
import { buildCommercialDashboardInsights } from "@/lib/data/insights";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700";

function LecturaItem({
  titulo,
  valor,
  cantidad,
}: {
  titulo: string;
  valor: string | null;
  cantidad: number | null;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {titulo}
      </p>
      {valor ? (
        <>
          <p className="mt-2 text-base font-semibold text-white">{valor}</p>
          {cantidad !== null ? (
            <p className="mt-1 text-sm text-emerald-400/90">
              {cantidad.toLocaleString("es-AR")}{" "}
              {titulo.includes("cliente") && titulo.includes("compra")
                ? "compras registradas"
                : titulo.includes("artículo")
                  ? "apariciones en ventas"
                  : titulo.includes("modelo")
                    ? "aplicaciones de repuesto"
                    : "clientes en cartera"}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Sin datos suficientes</p>
      )}
    </div>
  );
}

function RankedTable({
  rows,
  valueLabel,
  nameHeader,
  valueHeader,
}: {
  rows: { nombre: string; cantidad: number; detalle?: string }[];
  valueLabel?: (n: number) => string;
  nameHeader: string;
  valueHeader: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No hay datos para mostrar.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-slate-400">
          <th className="pb-2 font-medium">{nameHeader}</th>
          <th className="pb-2 text-right font-medium">{valueHeader}</th>
        </tr>
      </thead>
      <tbody className="text-slate-200">
        {rows.map((row) => (
          <tr key={row.nombre} className="border-t border-slate-800">
            <td className="py-2.5">
              <span>{row.nombre}</span>
              {row.detalle ? (
                <span className="mt-0.5 block font-mono text-xs text-slate-500">
                  {row.detalle}
                </span>
              ) : null}
            </td>
            <td className="py-2.5 text-right tabular-nums">
              {valueLabel
                ? valueLabel(row.cantidad)
                : row.cantidad.toLocaleString("es-AR")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DashboardPage() {
  const { dataset, source, hasLocalPersistence } = useDataset();
  const { data } = useActiveDataset();
  const sourceHint = formatDatasetSourceLabel(source, {
    persistedLocally: hasLocalPersistence,
    inMemoryOnly: source === "excel" && !hasLocalPersistence && dataset !== null,
  });

  const insights = useMemo(
    () =>
      buildCommercialDashboardInsights(data, {
        dataQuality: dataset?.dataQuality,
        smartNormalization: dataset?.smartNormalization,
        warnings: dataset?.warnings,
      }),
    [data, dataset],
  );

  const { kpis, lecturaRapida, demandaVehiculo, actividadComercial, calidadYOportunidades } =
    insights;

  const topLocalidades = insights.clientesPorLocalidad.slice(0, 6);

  return (
    <AppShell
      moduleTitle="Dashboard comercial"
      moduleDescription="Panorama de clientes, ventas y demanda por vehículo — sin montos ni moneda."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Fuente:{" "}
            <span
              className={
                source === "excel"
                  ? "font-medium text-emerald-400"
                  : "font-medium text-slate-400"
              }
            >
              {sourceHint}
            </span>
            {source === "mock" ? (
              <span className="ml-2 text-slate-600">
                · datos de ejemplo hasta importar Excel
              </span>
            ) : null}
          </p>
          <Link href="/importar" className={primaryCtaClass}>
            Importar o actualizar datos
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Clientes"
            value={kpis.totalClientes.toLocaleString("es-AR")}
            hint="Cuentas en cartera"
            trend="up"
          />
          <StatCard
            label="Registros de venta"
            value={kpis.totalRegistrosVenta.toLocaleString("es-AR")}
            hint="Comprobantes / movimientos"
            trend="neutral"
          />
          <StatCard
            label="Artículos únicos"
            value={kpis.totalArticulosUnicos.toLocaleString("es-AR")}
            hint="Códigos en catálogo"
            trend="neutral"
          />
          <StatCard
            label="Aplicaciones"
            value={kpis.totalAplicaciones.toLocaleString("es-AR")}
            hint="Vehículo ↔ artículo"
            trend="up"
          />
        </div>

        {dataset?.applicationAudit ? (
          <SectionCard
            title="Calidad del catálogo"
            description="Confianza comercial de aplicaciones vehículo ↔ artículo (sin bloquear el uso)"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Aplicaciones válidas"
                value={dataset.applicationAudit.aplicacionesAltaConfianza.toLocaleString(
                  "es-AR",
                )}
                hint="Alta confianza (≥ 85%)"
                trend="up"
              />
              <StatCard
                label="Aplicaciones en revisión"
                value={dataset.applicationAudit.aplicacionesRevision.toLocaleString(
                  "es-AR",
                )}
                hint="Confianza media (55–85%)"
                trend="neutral"
              />
              <StatCard
                label="Aplicaciones excluidas"
                value={dataset.applicationAudit.aplicacionesExcluidas.toLocaleString(
                  "es-AR",
                )}
                hint="Confianza baja (< 55%)"
                trend="down"
              />
              <StatCard
                label="% aprovechamiento real"
                value={`${dataset.applicationAudit.porcentajeAprovechamientoReal}%`}
                hint={`${dataset.applicationAudit.aplicacionesUtilizables.toLocaleString("es-AR")} utilizables vs preview`}
                trend="up"
              />
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Lectura comercial rápida"
          description="Lo más destacado de tu base actual, en lenguaje de negocio"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <LecturaItem
              titulo="Ciudad con más clientes"
              valor={lecturaRapida.localidadMasClientes?.nombre ?? null}
              cantidad={lecturaRapida.localidadMasClientes?.cantidad ?? null}
            />
            <LecturaItem
              titulo="Modelo con más aplicaciones"
              valor={lecturaRapida.modeloMasAplicaciones?.nombre ?? null}
              cantidad={lecturaRapida.modeloMasAplicaciones?.cantidad ?? null}
            />
            <LecturaItem
              titulo="Cliente con más compras"
              valor={lecturaRapida.clienteMasCompras?.nombre ?? null}
              cantidad={lecturaRapida.clienteMasCompras?.cantidad ?? null}
            />
            <LecturaItem
              titulo="Artículo más vendido"
              valor={lecturaRapida.articuloMasFrecuente?.nombre ?? null}
              cantidad={lecturaRapida.articuloMasFrecuente?.cantidad ?? null}
            />
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Demanda por vehículo"
            description="Dónde se concentra el parque y el catálogo de aplicaciones"
          >
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Marcas con más aplicaciones
            </p>
            <RankedTable
              rows={demandaVehiculo.topMarcas}
              nameHeader="Marca"
              valueHeader="Aplicaciones"
            />

            <p className="mb-4 mt-6 text-xs font-medium uppercase tracking-wider text-slate-500">
              Modelos con más aplicaciones
            </p>
            <RankedTable
              rows={demandaVehiculo.topModelos}
              nameHeader="Modelo"
              valueHeader="Aplicaciones"
            />

            <p className="mb-4 mt-6 text-xs font-medium uppercase tracking-wider text-slate-500">
              Combinaciones marca / modelo
            </p>
            {demandaVehiculo.aplicacionesPorMarcaModelo.length === 0 ? (
              <p className="text-sm text-slate-500">Sin aplicaciones cargadas.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 font-medium">Marca</th>
                    <th className="pb-2 font-medium">Modelo</th>
                    <th className="pb-2 text-right font-medium">Aplicaciones</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {demandaVehiculo.aplicacionesPorMarcaModelo.map((row) => (
                    <tr
                      key={`${row.marca}-${row.modelo}`}
                      className="border-t border-slate-800"
                    >
                      <td className="py-2.5">{row.marca}</td>
                      <td className="py-2.5">{row.modelo}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {row.cantidadAplicaciones.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard
            title="Clientes por ciudad"
            description="Distribución geográfica de la cartera"
          >
            {topLocalidades.length === 0 ? (
              <p className="text-sm text-slate-500">No hay clientes cargados.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {topLocalidades.map((row) => (
                  <div
                    key={row.localidad}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
                  >
                    <p className="text-sm text-slate-400">{row.localidad}</p>
                    <p className="mt-1 text-xl font-semibold text-white">
                      {row.cantidadClientes.toLocaleString("es-AR")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">clientes</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Actividad comercial"
          description="Ritmo de ventas y quién compra con más frecuencia"
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
            Actividad comercial registrada
          </p>
          {actividadComercial.totalComprobantes === 0 ? (
            <p className="text-sm text-slate-500">Sin registros de venta.</p>
          ) : actividadComercial.fechasConfiables &&
            actividadComercial.ventasPorMes.length > 0 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              {actividadComercial.ventasPorMes.map((row) => (
                <div
                  key={row.mes}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-center"
                >
                  <p className="text-xs text-slate-500">{row.etiqueta}</p>
                  <p className="text-lg font-semibold text-white">
                    {row.cantidadVentas}
                  </p>
                  <p className="text-[10px] text-slate-600">comprobantes</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-xs text-slate-500">Comprobantes registrados</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {actividadComercial.totalComprobantes.toLocaleString("es-AR")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-xs text-slate-500">Líneas de venta</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {actividadComercial.totalLineasVenta.toLocaleString("es-AR")}
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Sin fechas en el Excel — no se agrupa por mes
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Clientes que más compran
              </p>
              {actividadComercial.topClientesPorCompras.length === 0 ? (
                <p className="text-sm text-slate-500">Sin ventas registradas.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2 font-medium">Cliente</th>
                      <th className="pb-2 font-medium">Ciudad</th>
                      <th className="pb-2 text-right font-medium">Compras</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {actividadComercial.topClientesPorCompras.map((cliente) => (
                      <tr
                        key={cliente.numeroCuenta}
                        className="border-t border-slate-800"
                      >
                        <td className="py-2.5">{cliente.razonSocial}</td>
                        <td className="py-2.5 text-slate-400">{cliente.localidad}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {cliente.cantidadCompras}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                Artículos más presentes en ventas
              </p>
              {actividadComercial.topArticulosPorFrecuencia.length === 0 ? (
                <p className="text-sm text-slate-500">Sin líneas de venta.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2 font-medium">Artículo</th>
                      <th className="pb-2 text-right font-medium">Veces</th>
                      <th className="pb-2 text-right font-medium">Uds.</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {actividadComercial.topArticulosPorFrecuencia.map((articulo) => (
                      <tr
                        key={articulo.codigoUnico}
                        className="border-t border-slate-800"
                      >
                        <td className="py-2.5">
                          <span className="block">{articulo.descripcion}</span>
                          <span className="font-mono text-xs text-slate-500">
                            {articulo.codigoUnico}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {articulo.vecesEnVentas}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-400">
                          {articulo.unidadesTotales}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Calidad y oportunidades"
          description="Huecos en la información y puntos para mejorar la base"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Clientes sin ventas"
              value={calidadYOportunidades.clientesSinVentas.toLocaleString("es-AR")}
              hint="Tienen ficha pero no compraron"
              trend="down"
            />
            <StatCard
              label="Ventas sin artículo"
              value={calidadYOportunidades.ventasSinArticulo.toLocaleString("es-AR")}
              hint="Comprobante sin línea de producto"
              trend="down"
            />
            <StatCard
              label="Artículos sin aplicación"
              value={calidadYOportunidades.articulosSinAplicaciones.toLocaleString(
                "es-AR",
              )}
              hint="Sin vehículo asociado"
              trend="down"
            />
            {calidadYOportunidades.resumenCalidad ? (
              <StatCard
                label="Filas descartadas al importar"
                value={calidadYOportunidades.resumenCalidad.filasExcluidas.toLocaleString(
                  "es-AR",
                )}
                hint={`${calidadYOportunidades.resumenCalidad.advertencias} avisos de calidad`}
                trend="down"
              />
            ) : (
              <StatCard
                label="Calidad de importación"
                value="—"
                hint="Disponible con datos Excel"
                trend="neutral"
              />
            )}
          </div>

          {calidadYOportunidades.resumenCalidad ? (
            <p className="mt-4 text-sm text-slate-400">
              Al importar se corrigieron{" "}
              <strong className="font-medium text-slate-200">
                {calidadYOportunidades.resumenCalidad.fallbacksAplicados}
              </strong>{" "}
              campos automáticamente y se detectaron{" "}
              <strong className="font-medium text-slate-200">
                {calidadYOportunidades.resumenCalidad.erroresCriticos}
              </strong>{" "}
              errores graves en filas descartadas.
            </p>
          ) : null}

          {calidadYOportunidades.alertasNormalizacion.length > 0 ? (
            <ul className="mt-4 space-y-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-100/90">
              {calidadYOportunidades.alertasNormalizacion.map((alerta) => (
                <li key={alerta} className="flex gap-2">
                  <span className="text-sky-400" aria-hidden>
                    •
                  </span>
                  <span>{alerta}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/clientes" className={secondaryLinkClass}>
              Ver clientes
            </Link>
            <Link href="/ventas" className={secondaryLinkClass}>
              Ver ventas
            </Link>
            <Link href="/articulos" className={secondaryLinkClass}>
              Ver artículos
            </Link>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
