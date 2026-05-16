"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionCard } from "@/components/SectionCard";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400";

const secondaryLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700";

const CHECKLIST_INICIAL = [
  "Confirmar que la demo usa datos reales (Excel importado) o avisar que es ejemplo",
  "Tener los 3 Excel listos por si el cliente pregunta el origen",
  "Abrir /importar en otra pestaña por si hace falta mostrar carga",
  "Reservar 10–15 minutos sin interrupciones",
  "Cerrar con próximo paso: KORE API + base central + envío de solicitudes",
] as const;

const frasesParaCliente = [
  "Hoy la información está dispersa en planillas: acá la vemos ordenada y lista para decidir.",
  "No es solo un listado: el sistema cruza clientes, ventas y qué repuesto va en qué camioneta.",
  "El mostrador es para el vendedor de piso: elige el vehículo y arma el pedido en segundos.",
  "Las oportunidades las detecta solo: le dice dónde hay plata dormida o catálogo flojo.",
  "Esta versión corre en el navegador con sus datos; el siguiente paso es conectarlo a KORE en vivo.",
] as const;

const noMostrarTodavia = [
  "No prometer precios, stock en tiempo real ni facturación: no están en esta versión.",
  "No decir que las solicitudes ya se envían por mail o WhatsApp: quedan guardadas en el dispositivo.",
  "No hablar de usuarios, permisos ni multi-sucursal sincronizado: viene con Supabase y roles.",
  "Si preguntan por importes totales: el dashboard v1 muestra actividad y volumen, no montos.",
  "Aclarar que aplicaciones «a revisar» son utilizables en mostrador, pero conviene validar marcas dudosas.",
] as const;

type PasoDemo = {
  id: string;
  numero: string;
  titulo: string;
  href: string;
  duracion: string;
  queMostrar: string[];
  valor: string;
};

const pasosDemo: PasoDemo[] = [
  {
    id: "importar",
    numero: "1",
    titulo: "Importación de datos",
    href: "/importar",
    duracion: "2–3 min",
    queMostrar: [
      "Los 3 archivos Excel (clientes, ventas, artículos con aplicaciones)",
      "Vista previa y números reales antes de aplicar",
      "Mensaje de dataset aplicado y persistido en este navegador",
    ],
    valor:
      "Muestra que no dependen de cargar planillas a mano cada semana: un proceso controlado transforma KORE/Excel en un catálogo consultable.",
  },
  {
    id: "dashboard",
    numero: "2",
    titulo: "Dashboard comercial",
    href: "/dashboard",
    duracion: "2–3 min",
    queMostrar: [
      "Cantidad de clientes, ventas, artículos y aplicaciones",
      "Lectura rápida: ciudad fuerte, modelo con más aplicaciones, cliente que más compra",
      "Bloque «Calidad del catálogo» si hay datos importados",
    ],
    valor:
      "Es la foto del negocio para gerencia: dónde está la cartera, la demanda por vehículo y si el catálogo está sano.",
  },
  {
    id: "oportunidades",
    numero: "3",
    titulo: "Oportunidades comerciales",
    href: "/oportunidades",
    duracion: "2 min",
    queMostrar: [
      "Clientes en cartera sin ventas",
      "Artículos universales y los que más salen",
      "Aplicaciones a revisar y vehículos con poca cobertura",
      "Ciudades con cartera fuerte o con potencial sin desarrollar",
    ],
    valor:
      "Traduce los datos en tareas concretas para vendedores: a quién llamar, qué empujar y qué validar en el catálogo.",
  },
  {
    id: "distribuidor",
    numero: "4",
    titulo: "Mostrador táctil",
    href: "/distribuidor",
    duracion: "2–3 min",
    queMostrar: [
      "Elegir marca y modelo del cliente en el mostrador",
      "Listado de accesorios con alta rotación o «universal»",
      "Badge «Aplicación a revisar» sin bloquear la venta",
      "Armado de presupuesto / solicitud en el acto",
    ],
    valor:
      "Es la experiencia del vendedor en el piso: menos tiempo buscando en planillas, más tiempo cerrando.",
  },
  {
    id: "solicitudes",
    numero: "5",
    titulo: "Solicitudes y seguimiento",
    href: "/solicitudes",
    duracion: "1–2 min",
    queMostrar: [
      "Solicitudes generadas desde el mostrador",
      "Estados: nueva, en revisión, enviada, descartada",
      "Detalle de artículos y datos del cliente",
    ],
    valor:
      "Cierra el ciclo en el local: lo armado en mostrador queda registrado para seguimiento interno.",
  },
];

const yaFunciona = [
  "Importación de Excel con normalización y persistencia local",
  "Dashboard comercial con KPIs y rankings",
  "Oportunidades automáticas sobre datos reales",
  "Mostrador táctil por vehículo",
  "Solicitudes guardadas en el navegador",
  "Consultas de clientes, ventas, artículos y vehículos",
] as const;

const faltaProduccion = [
  "Conexión API KORE (stock, precios y movimientos en vivo)",
  "Base de datos central (Supabase) y sincronización entre sucursales",
  "Usuarios, roles y permisos",
  "Envío real de solicitudes al cliente (mail, WhatsApp, PDF)",
  "Reportes programados y alertas por mail",
] as const;

function CheckIcon({ checked }: { checked: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
        checked
          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
          : "border-slate-600 bg-slate-900 text-transparent"
      }`}
      aria-hidden
    >
      ✓
    </span>
  );
}

export default function DemoPage() {
  const { data, source, isExcel, isPersistedLocally, isMock } = useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });

  const [checklist, setChecklist] = useState<boolean[]>(() =>
    CHECKLIST_INICIAL.map(() => false),
  );

  const checklistCompleto = checklist.every(Boolean);
  const checklistProgreso = checklist.filter(Boolean).length;

  const resumenDatos = useMemo(() => {
    if (!isExcel || isMock) return null;
    return {
      clientes: data.clientes.length,
      ventas: data.ventas.length,
      articulos: data.articulos.length,
      aplicaciones: data.articuloAplicaciones.length,
    };
  }, [data, isExcel, isMock]);

  function toggleCheck(index: number) {
    setChecklist((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  return (
    <AppShell
      moduleTitle="Guía de presentación"
      moduleDescription="Ruta comercial de 10–15 minutos para mostrar Pickup 4x4 Intelligence"
    >
      <div className="space-y-6">
        {/* Apertura ejecutiva */}
        <section className="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Apertura ejecutiva
            </p>
            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-400">
              Duración estimada: 10–15 min
            </span>
          </div>

          <h2 className="mt-4 text-xl font-bold text-white sm:text-2xl">
            Pickup 4x4 Intelligence en una frase
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Ordena la información comercial del distribuidor — clientes, ventas y qué
            repuesto aplica a cada camioneta — y la pone al servicio del mostrador y
            de la gerencia, sin depender de planillas sueltas.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-rose-400/90">
                Problema que resuelve
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Datos repartidos en Excel, poca visibilidad de cartera dormida, catálogo
                difícil de consultar en el mostrador y pedidos que no quedan registrados.
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-sky-400/90">
                Qué información usa
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Export de{" "}
                <span className="font-medium text-white">KORE / Excel</span>: listado
                de clientes, diario de ventas y maestro de artículos con aplicaciones por
                vehículo.
              </p>
              <p className="mt-2 text-xs">
                Fuente activa:{" "}
                <span
                  className={
                    isExcel ? "font-semibold text-emerald-400" : "text-slate-400"
                  }
                >
                  {sourceLabel}
                </span>
              </p>
              {resumenDatos ? (
                <p className="mt-2 text-xs text-emerald-400/90">
                  Demo con datos reales: {resumenDatos.clientes.toLocaleString("es-AR")}{" "}
                  clientes · {resumenDatos.ventas.toLocaleString("es-AR")} ventas ·{" "}
                  {resumenDatos.aplicaciones.toLocaleString("es-AR")} aplicaciones
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-400/90">
                  Importá Excel antes de la reunión para mostrar números reales.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
                Valor que genera
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Gerencia ve el panorama; vendedores encuentran repuestos por vehículo;
                el sistema sugiere dónde actuar para vender más y cuidar el catálogo.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <Link href="/importar" className={primaryCtaClass}>
              Comenzar presentación (Paso 1)
            </Link>
          </div>
        </section>

        {/* Checklist */}
        <SectionCard
          title="Checklist antes de entrar"
          description={`${checklistProgreso} de ${CHECKLIST_INICIAL.length} listos${
            checklistCompleto ? " · Listo para presentar" : ""
          }`}
        >
          <ul className="space-y-3">
            {CHECKLIST_INICIAL.map((texto, index) => (
              <li key={texto}>
                <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 transition hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={checklist[index]}
                    onChange={() => toggleCheck(index)}
                    className="sr-only"
                  />
                  <CheckIcon checked={checklist[index]} />
                  <span
                    className={`text-sm ${
                      checklist[index] ? "text-slate-400 line-through" : "text-slate-200"
                    }`}
                  >
                    {texto}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Pasos guiados */}
        <SectionCard
          title="Ruta de la demo"
          description="Seguí el orden; cada paso tiene link directo al módulo"
        >
          <ol className="space-y-4">
            {pasosDemo.map((paso) => (
              <li
                key={paso.id}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
                      {paso.numero}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{paso.titulo}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Tiempo sugerido: {paso.duracion}
                      </p>
                    </div>
                  </div>
                  <Link href={paso.href} className={secondaryLinkClass}>
                    Abrir módulo
                  </Link>
                </div>

                <p className="mt-4 text-sm text-slate-400">{paso.valor}</p>

                <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Qué mostrar
                </p>
                <ul className="mt-2 space-y-1.5">
                  {paso.queMostrar.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-slate-300">
                      <span className="text-emerald-500" aria-hidden>
                        →
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </SectionCard>

        {/* Frases y no mostrar */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Frases para decirle al cliente"
            description="Lenguaje simple; adaptá con ejemplos de su operación"
          >
            <ul className="space-y-3">
              {frasesParaCliente.map((frase) => (
                <li
                  key={frase}
                  className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 text-sm italic leading-relaxed text-emerald-100/90"
                >
                  «{frase}»
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="No mostrar todavía / aclarar"
            description="Evita expectativas incorrectas en la reunión"
          >
            <ul className="space-y-3">
              {noMostrarTodavia.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90"
                >
                  <span className="shrink-0 text-amber-400" aria-hidden>
                    ⚠
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        {/* Cierre */}
        <section className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
            Cierre de reunión
          </p>
          <h2 className="mt-3 text-lg font-bold text-white">
            Qué cerrar con el cliente
          </h2>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
                Ya funciona hoy
              </p>
              <ul className="mt-3 space-y-2">
                {yaFunciona.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-400/90">
                Falta para producción
              </p>
              <ul className="mt-3 space-y-2">
                {faltaProduccion.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-slate-500" aria-hidden>
                      ○
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">
              Próximo paso recomendado
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/90">
              Conectar{" "}
              <span className="font-medium text-white">API KORE</span> para datos en
              vivo, centralizar en{" "}
              <span className="font-medium text-white">Supabase</span> y habilitar el{" "}
              <span className="font-medium text-white">envío real de solicitudes</span>{" "}
              al cliente. Esta demo demuestra el flujo completo con Excel; producción
              elimina la carga manual y unifica sucursales.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className={secondaryLinkClass}>
              Ir al dashboard
            </Link>
            <Link href="/oportunidades" className={secondaryLinkClass}>
              Ver oportunidades
            </Link>
            <Link href="/distribuidor" className={secondaryLinkClass}>
              Probar mostrador
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
