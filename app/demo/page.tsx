"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import { sideMenuNavigation } from "@/lib/navigation";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700";

const flujoPasos = [
  { paso: "1", titulo: "Excel / KORE", detalle: "Planillas históricas o export del ERP" },
  { paso: "2", titulo: "Normalización", detalle: "Limpieza, validación y calidad de datos" },
  { paso: "3", titulo: "Dashboard", detalle: "Lectura comercial ejecutiva" },
  { paso: "4", titulo: "Mostrador", detalle: "Búsqueda táctil por vehículo" },
  { paso: "5", titulo: "Solicitudes", detalle: "Presupuestos armados en el dispositivo" },
] as const;

const estadoActual = [
  { listo: true, titulo: "Importación Excel", detalle: "Carga, preview y persistencia en el navegador" },
  { listo: true, titulo: "Dashboard comercial", detalle: "KPIs y rankings sin importes en v1" },
  { listo: true, titulo: "Buscador táctil", detalle: "Mostrador por marca, modelo y repuesto" },
  { listo: true, titulo: "Solicitudes locales", detalle: "Armado y listado de presupuestos pendientes" },
  { listo: true, titulo: "Filtros de consulta", detalle: "Clientes, ventas, artículos y vehículos" },
] as const;

const limitaciones = [
  "Los datos viven en localStorage del navegador (no hay servidor propio).",
  "No hay base de datos centralizada ni sincronización entre dispositivos.",
  "No existe conexión API KORE todavía: se trabaja con Excel exportado.",
  "Las solicitudes no se envían por mail ni WhatsApp: quedan guardadas localmente.",
] as const;

const proximosPasos = [
  "Supabase como base de datos y persistencia compartida.",
  "Conexión API KORE para stock, precios y comprobantes en vivo.",
  "Usuarios y permisos por rol (mostrador, gerencia, admin).",
  "Envío real de solicitudes y presupuestos al cliente.",
  "Reportes avanzados, alertas y oportunidades automatizadas.",
] as const;

const modulosDemo = sideMenuNavigation.filter(
  (item) => !["/demo", "/importar"].includes(item.href),
);

function StatusDot({ listo }: { listo: boolean }) {
  return (
    <span
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
        listo ? "bg-emerald-400" : "bg-slate-600"
      }`}
      aria-hidden
    />
  );
}

export default function DemoPage() {
  const { source, isExcel, isPersistedLocally, isMock } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  return (
    <AppShell
      moduleTitle="Guía de demo"
      moduleDescription="Resumen para presentar Pickup 4x4 Intelligence al cliente"
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-900 to-emerald-950/15 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
            Resumen ejecutivo
          </p>
          <h2 className="mt-3 text-xl font-bold text-white sm:text-2xl">
            Qué es Pickup 4x4 Intelligence
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Es una plataforma comercial pensada para distribuidores de repuestos y
            accesorios 4x4. Centraliza la lectura de ventas y clientes, el catálogo
            con aplicaciones por vehículo y una experiencia de mostrador para armar
            solicitudes en el punto de venta.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Qué hace el sistema
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Ordena la información comercial y la hace consultable para
                decisiones diarias y atención en mostrador.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Qué datos usa hoy
              </p>
              <p className="mt-2 text-sm text-slate-300">
                <span
                  className={
                    isExcel ? "font-medium text-emerald-400" : "font-medium text-slate-300"
                  }
                >
                  {sourceLabel}
                </span>
                {isMock
                  ? " — datos de ejemplo hasta importar Excel."
                  : " — datos cargados en esta sesión."}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Versión actual
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Demo local en navegador. Sin backend ni usuarios: ideal para validar
                flujo y pantallas con el equipo comercial.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className={primaryCtaClass}>
              Abrir dashboard comercial
            </Link>
            <Link href="/importar" className={secondaryLinkClass}>
              Importar Excel
            </Link>
          </div>
        </section>

        <SectionCard
          title="Flujo del sistema"
          description="De la planilla al mostrador en cinco pasos"
        >
          <ol className="grid gap-3 sm:grid-cols-5">
            {flujoPasos.map((item, index) => (
              <li
                key={item.paso}
                className="relative rounded-lg border border-slate-800 bg-slate-950/50 p-4"
              >
                {index < flujoPasos.length - 1 ? (
                  <span
                    className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-slate-600 sm:block"
                    aria-hidden
                  >
                    →
                  </span>
                ) : null}
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                  {item.paso}
                </span>
                <p className="mt-3 text-sm font-semibold text-white">{item.titulo}</p>
                <p className="mt-1 text-xs text-slate-500">{item.detalle}</p>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Módulos disponibles"
          description="Navegación lateral — todo usable en esta demo"
        >
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modulosDemo.map((modulo) => (
              <li key={modulo.href}>
                <Link
                  href={modulo.href}
                  className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 transition hover:border-emerald-500/30 hover:bg-slate-900"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-bold text-emerald-400">
                    {modulo.initial}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {modulo.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {modulo.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Estado actual"
            description="Funcionalidades listas para mostrar hoy"
          >
            <ul className="space-y-3">
              {estadoActual.map((item) => (
                <li key={item.titulo} className="flex gap-3">
                  <StatusDot listo={item.listo} />
                  <span>
                    <span className="block text-sm font-medium text-white">
                      {item.titulo}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {item.detalle}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Limitaciones actuales"
            description="Transparencia para alinear expectativas con el cliente"
          >
            <ul className="space-y-2.5 text-sm text-slate-300">
              {limitaciones.map((texto) => (
                <li key={texto} className="flex gap-2">
                  <span className="text-amber-400/90" aria-hidden>
                    ·
                  </span>
                  {texto}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          title="Próximos pasos hacia producción"
          description="Roadmap acordado para la siguiente fase"
        >
          <ol className="space-y-3">
            {proximosPasos.map((paso, index) => (
              <li
                key={paso}
                className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xs font-semibold text-slate-400">
                  {index + 1}
                </span>
                <span className="text-sm text-slate-300">{paso}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Esta demo no requiere conexión a internet permanente ni credenciales:
            basta con el navegador y, opcionalmente, un Excel de KORE exportado.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
