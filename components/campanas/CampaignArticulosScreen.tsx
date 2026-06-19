"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { ExcelUploadCard } from "@/components/ExcelUploadCard";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import {
  formatDatasetSourceLabel,
  useActiveDataset,
} from "@/lib/data/use-active-dataset";
import {
  analizarCoberturaVentas,
  applyFiltros,
  buildQualitySummary,
  buscarClientesCandidatos,
  calcularContactabilidad,
  calcularDisponibilidadVariables,
  CAMPAIGN_TIPO_OPCIONES,
  type ChequeoCoincidencia,
  type ChequeoEstado,
  chequearCoincidencia,
  type CampaignArticuloEstado,
  type CampaignArticuloInput,
  type CampaignFiltros,
  type CampaignMeta,
  type CampaignPreset,
  codigosLonaDuplicados,
  type CoberturaVentas,
  type EstadoRealCampaña,
  ESTADO_LABEL,
  evaluarEstadoReal,
  FILTROS_INICIALES,
  getLocalidadesDisponibles,
  motivosRevision,
  parseArticulosConImporter,
  parseArticulosRows,
  PERIODO_VENTAS_CORTO_MESES,
  resumenImporter,
  segmentarCandidatos,
  seleccionarArticulosDelCatalogo,
  validarArticulos,
  type ClienteCandidato,
} from "@/lib/campanas/articulos-campaign";
import {
  apiCreateCampaign,
  apiGetCampaign,
  apiSaveItems,
  apiSaveResults,
  apiUpdateCampaign,
  candidatoToResultDTO,
  itemDTOToInput,
  metaToDTO,
  resultDTOToCandidato,
  validadoToItemDTO,
} from "@/lib/campanas/campaign-storage";

type SaveState = "nuevo" | "guardando" | "guardada" | "sucio" | "error";

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500/60";

const estadoBadge: Record<CampaignArticuloEstado, string> = {
  validado_codigo: "bg-emerald-500/15 text-emerald-300",
  validado_descripcion: "bg-sky-500/15 text-sky-300",
  ambiguo: "bg-amber-500/15 text-amber-300",
  no_encontrado: "bg-rose-500/15 text-rose-300",
  incompleto: "bg-slate-600/30 text-slate-300",
};

const metaInicial: CampaignMeta = {
  nombre: "",
  descripcion: "",
  tipo: "recompra",
};

const subtituloGenerico =
  "Subí una lista de artículos, validalos contra el catálogo y detectá clientes que ya los compraron para preparar acciones comerciales.";

function emptyArticulo(id: string): CampaignArticuloInput {
  return {
    id,
    codigo: "",
    descripcion: "",
    categoria: "",
    marca: "",
    modelo: "",
    observaciones: "",
  };
}

function ResumenItem({
  label,
  value,
  alerta,
}: {
  label: string;
  value: number;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${alerta ? "text-amber-300" : "text-white"}`}>
        {value.toLocaleString("es-AR")}
      </p>
    </div>
  );
}

const CHEQUEO_ESTADO: Record<
  ChequeoEstado,
  { label: string; texto: string; className: string }
> = {
  bueno: {
    label: "Bueno",
    texto: "Hay códigos lona encontrados en ventas y clientes cruzados.",
    className: "bg-emerald-500/15 text-emerald-300",
  },
  parcial: {
    label: "Parcial",
    texto: "Hay ventas encontradas, pero muchas cuentas no cruzan con clientes.",
    className: "bg-amber-500/15 text-amber-300",
  },
  bajo: {
    label: "Bajo",
    texto: "Pocos códigos lona aparecen en las ventas importadas.",
    className: "bg-amber-500/15 text-amber-300",
  },
  no_viable: {
    label: "No viable todavía",
    texto: "Ningún CODIGO LONA aparece en las ventas importadas.",
    className: "bg-rose-500/15 text-rose-300",
  },
};

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function recomendacionesChequeo(c: ChequeoCoincidencia): string[] {
  const recs: string[] = [];
  if (c.estado === "no_viable" || c.estado === "bajo") {
    recs.push("Importar un período más amplio de Diario de Ventas.");
  }
  if (c.codigosNoEncontrados > 0) {
    recs.push("Revisar los códigos lona no encontrados.");
    recs.push("Verificar el formato de los códigos en KORE.");
  }
  if (c.noEncontrados.some((n) => n.posibleCoincidencia)) {
    recs.push("Hay posibles coincidencias por formato: revisarlas manualmente.");
  }
  if (c.cruceCuentasPct < 60 && c.ventasConCuentaValida + c.ventasCuentaInexistente > 0) {
    recs.push("Revisar las cuentas que no cruzan con clientes.");
  }
  if (c.estado === "bueno") {
    recs.push("Avanzar a la segmentación final si la cobertura es suficiente.");
  }
  return recs;
}

function ChequeoCoincidenciaPanel({
  chequeo,
  onExport,
}: {
  chequeo: ChequeoCoincidencia;
  onExport: () => void;
}) {
  const [verNoEncontrados, setVerNoEncontrados] = useState(false);
  const estado = CHEQUEO_ESTADO[chequeo.estado];
  const recs = recomendacionesChequeo(chequeo);

  return (
    <div className="mt-5 rounded-lg border border-slate-700/80 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">
            Chequeo de coincidencia contra ventas reales
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.className}`}>
            {estado.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="text-xs text-slate-300 underline hover:text-white"
        >
          Exportar diagnóstico
        </button>
      </div>

      <p className="mt-1 text-xs text-slate-400">
        {estado.texto} Este chequeo permite saber si la campaña puede encontrar
        compradores reales antes de preparar el envío. Si muchos códigos no aparecen,
        puede faltar importar más ventas o haber diferencias de formato entre el Excel de
        equivalencia y el Diario de Ventas.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <ResumenItem label="Códigos lona únicos" value={chequeo.codigosLonaUnicos} />
        <ResumenItem label="Encontrados en ventas" value={chequeo.codigosEncontrados} />
        <ResumenItem
          label="No encontrados"
          value={chequeo.codigosNoEncontrados}
          alerta={chequeo.codigosNoEncontrados > 0}
        />
        <ResumenItem label="Cobertura de códigos %" value={chequeo.coberturaPct} />
        <ResumenItem label="Líneas de venta coincidentes" value={chequeo.lineasCoincidentes} />
        <ResumenItem label="Clientes potenciales" value={chequeo.clientesPotenciales} />
        <ResumenItem label="Cruce de cuentas %" value={chequeo.cruceCuentasPct} />
        <ResumenItem
          label="Líneas sin cuenta / inexistente"
          value={chequeo.ventasSinCuenta + chequeo.ventasCuentaInexistente}
          alerta={chequeo.ventasSinCuenta + chequeo.ventasCuentaInexistente > 0}
        />
      </div>

      {chequeo.encontrados.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
            Ejemplos de códigos encontrados
          </p>
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="pb-2 pr-3 font-medium">Código lona</th>
                <th className="pb-2 pr-3 font-medium">Código tapa</th>
                <th className="pb-2 pr-3 font-medium">Modelo</th>
                <th className="pb-2 pr-3 text-right font-medium">Ventas</th>
                <th className="pb-2 pr-3 text-right font-medium">Clientes</th>
                <th className="pb-2 pr-3 font-medium">Última venta</th>
                <th className="pb-2 font-medium">Ejemplo cliente</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {chequeo.encontrados.slice(0, 8).map((e) => (
                <tr key={e.codigoLona} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 font-mono">{e.codigoLona}</td>
                  <td className="py-1.5 pr-3 font-mono">{e.codigoTapa || "—"}</td>
                  <td className="py-1.5 pr-3">{e.modelo || "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{e.ventas}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{e.clientesUnicos}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fechaCorta(e.ultimaVenta)}</td>
                  <td className="py-1.5">{e.ejemploCliente ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {chequeo.noEncontrados.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerNoEncontrados((v) => !v)}
            className="text-xs text-slate-300 underline hover:text-white"
          >
            {verNoEncontrados ? "Ocultar" : "Ver"} códigos no encontrados (
            {chequeo.noEncontrados.length})
          </button>
          {verNoEncontrados ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 pr-3 font-medium">Código lona</th>
                    <th className="pb-2 pr-3 font-medium">Código tapa</th>
                    <th className="pb-2 pr-3 font-medium">Modelo</th>
                    <th className="pb-2 font-medium">Observación</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {chequeo.noEncontrados.map((n) => (
                    <tr key={n.codigoLona} className="border-t border-slate-800">
                      <td className="py-1.5 pr-3 font-mono">{n.codigoLona}</td>
                      <td className="py-1.5 pr-3 font-mono">{n.codigoTapa || "—"}</td>
                      <td className="py-1.5 pr-3">{n.modelo || "—"}</td>
                      <td className="py-1.5 text-amber-300/90">
                        {n.observacion}
                        {n.posibleCoincidencia ? ` → ${n.posibleCoincidencia}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {recs.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Acciones recomendadas
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-300">
            {recs.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CoberturaVentasPanel({
  cobertura,
  codigosEncontrados,
  clientesCompradores,
}: {
  cobertura: CoberturaVentas;
  codigosEncontrados: number | null;
  clientesCompradores: number | null;
}) {
  const periodo =
    cobertura.fechaMin && cobertura.fechaMax
      ? `${fechaCorta(cobertura.fechaMin)} → ${fechaCorta(cobertura.fechaMax)}`
      : "No detectable (faltan fechas confiables)";

  return (
    <div className="mt-5 rounded-lg border border-slate-700/80 bg-slate-950/40 p-4">
      <h3 className="text-sm font-semibold text-white">
        Cobertura del Diario de Ventas
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Período: <span className="text-slate-200">{periodo}</span>
        {cobertura.mesesCubiertos !== null
          ? ` · ${cobertura.mesesCubiertos} ${
              cobertura.mesesCubiertos === 1 ? "mes" : "meses"
            } cubiertos`
          : ""}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <ResumenItem label="Ventas cargadas" value={cobertura.ventasCargadas} />
        <ResumenItem label="Líneas de venta" value={cobertura.lineasVenta} />
        <ResumenItem
          label="Ventas sin fecha"
          value={cobertura.ventasSinFecha}
          alerta={cobertura.ventasSinFecha > 0}
        />
        {codigosEncontrados !== null ? (
          <ResumenItem label="Códigos lona en ventas" value={codigosEncontrados} />
        ) : null}
        {clientesCompradores !== null ? (
          <ResumenItem label="Clientes compradores" value={clientesCompradores} />
        ) : null}
      </div>

      {cobertura.periodoCorto ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          El Diario de Ventas cargado parece cubrir un período corto
          {cobertura.mesesCubiertos !== null
            ? ` (${cobertura.mesesCubiertos} ${
                cobertura.mesesCubiertos === 1 ? "mes" : "meses"
              })`
            : ""}
          . Para una campaña real de renovación de lonas, conviene importar un
          período mayor, idealmente 12 a 36 meses, para detectar clientes con
          lonas antiguas y mayor probabilidad de recambio.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Para una campaña real de renovación conviene contar con 12 a 36 meses
          de Diario de Ventas (mínimo recomendado: {PERIODO_VENTAS_CORTO_MESES}{" "}
          meses).
        </p>
      )}
    </div>
  );
}

const ESTADO_REAL_CLASS: Record<EstadoRealCampaña["caso"], string> = {
  lista: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  sin_contacto: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  pocos_compradores: "border-sky-500/30 bg-sky-500/10 text-sky-100",
};

type CampaignArticulosScreenProps = {
  preset?: CampaignPreset;
};

export function CampaignArticulosScreen({ preset }: CampaignArticulosScreenProps) {
  const { data, source, isMock, isPersistedLocally, isStorageHydrated, supabaseError } =
    useActiveDataset();
  const sourceLabel = formatDatasetSourceLabel(source, {
    persistedLocally: isPersistedLocally,
  });
  // Fuente real con datos pero sin ventas: se pueden validar códigos pero no
  // detectar compradores históricos hasta importar el Diario de Ventas.
  const datasetSinVentas =
    isStorageHydrated && !isMock && data.ventaItems.length === 0;

  const [meta, setMeta] = useState<CampaignMeta>(preset?.meta ?? metaInicial);
  const [articulos, setArticulos] = useState<CampaignArticuloInput[]>([]);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<ClienteCandidato[] | null>(null);
  const [filtros, setFiltros] = useState<CampaignFiltros>({
    ...FILTROS_INICIALES,
    ...(preset?.filtros ?? {}),
  });
  const manualCounter = useRef(0);

  // Persistencia en Supabase.
  const searchParams = useSearchParams();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("nuevo");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resultsSaved, setResultsSaved] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Reabrir una campaña guardada (?id=...): hidrata meta, artículos, filtros y resultados.
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await apiGetCampaign(id);
      if (cancelled || !res.ok) {
        if (!cancelled && !res.ok) {
          setSaveState("error");
          setSaveError(res.errorMessage);
        }
        return;
      }
      const { campaign, items, results } = res.data;
      setCampaignId(campaign.id);
      setMeta({
        nombre: campaign.name,
        descripcion: campaign.description ?? "",
        tipo: (campaign.type as CampaignMeta["tipo"]) ?? "recompra",
      });
      setArticulos(items.map(itemDTOToInput));
      if (campaign.filters && typeof campaign.filters === "object") {
        setFiltros({ ...FILTROS_INICIALES, ...(campaign.filters as Partial<CampaignFiltros>) });
      }
      if (results.length > 0) {
        setCandidatos(results.map(resultDTOToCandidato));
        setResultsSaved(true);
      }
      setImportInfo(`Campaña guardada · ${items.length} artículos`);
      setSaveState("guardada");
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const moduleTitle = preset?.meta.nombre || "Campañas por artículos";
  const moduleDescription = preset?.meta.descripcion || subtituloGenerico;

  // Validación en vivo contra el catálogo del dataset activo.
  const validados = useMemo(
    () => validarArticulos(articulos, data),
    [articulos, data],
  );
  const validadosPorId = useMemo(
    () => new Map(validados.map((v) => [v.id, v])),
    [validados],
  );
  // Buscables = con CODIGO LONA (código crudo) o con match validado por descripción.
  const articulosBuscables = useMemo(
    () => validados.filter((v) => v.codigo.trim() !== "" || Boolean(v.codigoCatalogo)).length,
    [validados],
  );
  const importerResumen = useMemo(
    () => (preset?.importer ? resumenImporter(articulos) : null),
    [preset, articulos],
  );
  const chequeo = useMemo(
    () =>
      preset?.importer && isStorageHydrated && articulos.length > 0
        ? chequearCoincidencia(articulos, data)
        : null,
    [preset, isStorageHydrated, articulos, data],
  );
  const lonasDuplicadas = useMemo(
    () => (preset?.importer ? codigosLonaDuplicados(articulos) : new Set<string>()),
    [preset, articulos],
  );

  const summary = useMemo(
    () => (candidatos ? buildQualitySummary(validados, candidatos) : null),
    [candidatos, validados],
  );
  const localidades = useMemo(
    () => (candidatos ? getLocalidadesDisponibles(candidatos) : []),
    [candidatos],
  );
  const filtrados = useMemo(
    () => (candidatos ? applyFiltros(candidatos, filtros) : []),
    [candidatos, filtros],
  );

  const emailKit = preset?.emailKit ?? null;
  const segmentacion = useMemo(
    () => (candidatos ? segmentarCandidatos(candidatos, filtros.antiguedadMinMeses) : null),
    [candidatos, filtros.antiguedadMinMeses],
  );
  const disponibilidad = useMemo(
    () => (candidatos ? calcularDisponibilidadVariables(candidatos) : []),
    [candidatos],
  );
  // Cobertura del Diario de Ventas: período y volumen (independiente de los
  // artículos cargados). Solo se calcula con datos reales ya hidratados.
  const cobertura = useMemo(
    () =>
      isStorageHydrated && !datasetSinVentas ? analizarCoberturaVentas(data) : null,
    [isStorageHydrated, datasetSinVentas, data],
  );
  const contactabilidad = useMemo(
    () =>
      candidatos && segmentacion
        ? calcularContactabilidad(candidatos, segmentacion)
        : null,
    [candidatos, segmentacion],
  );
  const estadoReal = useMemo(
    () =>
      candidatos && segmentacion ? evaluarEstadoReal(candidatos, segmentacion) : null,
    [candidatos, segmentacion],
  );

  // Marca que hay cambios sin guardar (solo relevante si la campaña ya existe).
  function markDirty() {
    setSaveState((s) => (s === "guardando" ? s : campaignId ? "sucio" : "nuevo"));
    setResultsSaved(false);
  }

  function updateMeta(patch: Partial<CampaignMeta>) {
    setMeta((m) => ({ ...m, ...patch }));
    markDirty();
  }

  // Editar el listado invalida los resultados previos (hay que volver a buscar).
  function updateArticulo(
    id: string,
    field: keyof Omit<CampaignArticuloInput, "id">,
    value: string,
  ) {
    setArticulos((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    );
    setCandidatos(null);
    markDirty();
  }

  function addArticulo() {
    setArticulos((prev) => [...prev, emptyArticulo(`manual-${manualCounter.current++}`)]);
    setCandidatos(null);
    markDirty();
  }

  function removeArticulo(id: string) {
    setArticulos((prev) => prev.filter((a) => a.id !== id));
    setCandidatos(null);
    markDirty();
  }

  function handleRowsLoaded(payload: {
    fileName: string;
    fullData?: Record<string, unknown>[];
    rows: Record<string, unknown>[];
  }) {
    const rows = payload.fullData ?? payload.rows;
    const parsed = preset?.importer
      ? parseArticulosConImporter(rows, preset.importer)
      : parseArticulosRows(rows);
    setArticulos(parsed);
    setImportInfo(`${payload.fileName} · ${parsed.length} artículos`);
    setCandidatos(null);
    markDirty();
  }

  function cargarDelCatalogo() {
    if (!preset?.catalogo) return;
    const arts = seleccionarArticulosDelCatalogo(data, preset.catalogo.patron);
    setArticulos(arts);
    setImportInfo(`Catálogo «${preset.catalogo.patron}» · ${arts.length} artículos`);
    setCandidatos(null);
    markDirty();
  }

  function buscarClientes() {
    setCandidatos(buscarClientesCandidatos(validados, data));
    setResultsSaved(false);
  }

  async function guardarCampaña(): Promise<string | null> {
    setSaveState("guardando");
    setSaveError(null);
    const metaDTO = metaToDTO(meta, {
      preset: preset?.id ?? null,
      filtros,
      qualitySummary: summary,
    });
    const saved = campaignId
      ? await apiUpdateCampaign(campaignId, metaDTO)
      : await apiCreateCampaign(metaDTO);
    if (!saved.ok) {
      setSaveState("error");
      setSaveError(saved.errorMessage);
      return null;
    }
    const id = saved.data.id;
    setCampaignId(id);
    const itemsRes = await apiSaveItems(id, validados.map(validadoToItemDTO));
    if (!itemsRes.ok) {
      setSaveState("error");
      setSaveError(itemsRes.errorMessage);
      return null;
    }
    setSaveState("guardada");
    return id;
  }

  async function guardarResultados() {
    if (!candidatos) return;
    const id = campaignId ?? (await guardarCampaña());
    if (!id) return;
    setSaveError(null);
    const res = await apiSaveResults(id, candidatos.map(candidatoToResultDTO));
    if (!res.ok) {
      setSaveState("error");
      setSaveError(res.errorMessage);
      return;
    }
    setResultsSaved(true);
  }

  function descargarXlsx(rows: Record<string, unknown>[], filename: string) {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Campaña");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function vehiculoTexto(c: ClienteCandidato): string {
    return c.vehiculoIdentificado ? c.vehiculos.join(" | ") : "Vehículo no identificado";
  }

  function filasCompletas(cands: ClienteCandidato[]): Record<string, unknown>[] {
    return cands.map((c) => ({
      "Nombre campaña": meta.nombre || "Campaña por artículos",
      Cliente: c.cliente,
      "N° cuenta": c.numeroCuenta,
      Email: c.email ?? "Sin email",
      Teléfono: c.telefono ?? "Sin teléfono",
      Localidad: c.localidad ?? "",
      "Artículo comprado": c.articuloComprado,
      "Código artículo": c.codigoArticulo,
      "Código tapa sugerido": c.codigoTapaSugerido ?? "",
      "Modelo equivalencia": c.modeloEquivalencia ?? "",
      "Fecha de compra": c.fechaCompraDisplay,
      "Antigüedad meses": c.antiguedadMeses ?? "",
      "Factura/comprobante": c.comprobante ?? "",
      "Vehículo/modelo compatible": vehiculoTexto(c),
      "Confianza match": c.confianzaMatch,
      "Acción sugerida": c.accionSugerida,
      Observaciones: c.observaciones.join("; "),
    }));
  }

  function filasEmail(cands: ClienteCandidato[]): Record<string, unknown>[] {
    return cands.map((c) => ({
      Cliente: c.cliente,
      "N° cuenta": c.numeroCuenta,
      Email: c.email ?? "",
      Localidad: c.localidad ?? "",
      "Artículo comprado": c.articuloComprado,
      "Código artículo": c.codigoArticulo,
      "Código tapa sugerido": c.codigoTapaSugerido ?? "",
      "Modelo equivalencia": c.modeloEquivalencia ?? "",
      "Fecha de compra": c.fechaCompraDisplay,
      "Antigüedad meses": c.antiguedadMeses ?? "",
      "Vehículo compatible": vehiculoTexto(c),
      "Acción sugerida": c.accionSugerida,
      Observaciones: c.observaciones.join("; "),
    }));
  }

  function filasWhatsapp(cands: ClienteCandidato[]): Record<string, unknown>[] {
    return cands.map((c) => ({
      Cliente: c.cliente,
      "N° cuenta": c.numeroCuenta,
      Teléfono: c.telefono ?? "",
      WhatsApp: c.telefono ?? "",
      Localidad: c.localidad ?? "",
      "Artículo comprado": c.articuloComprado,
      "Código tapa sugerido": c.codigoTapaSugerido ?? "",
      "Modelo equivalencia": c.modeloEquivalencia ?? "",
      "Vehículo compatible": vehiculoTexto(c),
      "Acción sugerida": c.accionSugerida,
      Observaciones: c.observaciones.join("; "),
    }));
  }

  function exportar() {
    descargarXlsx(filasCompletas(filtrados), "pickup4x4-campana-articulos-clientes.xlsx");
  }

  const exportPrefix = emailKit?.exportPrefix ?? "pickup4x4-campana";

  function exportarEmail() {
    if (segmentacion) descargarXlsx(filasEmail(segmentacion.email), `${exportPrefix}-email.xlsx`);
  }
  function exportarWhatsapp() {
    if (segmentacion) descargarXlsx(filasWhatsapp(segmentacion.whatsapp), `${exportPrefix}-whatsapp.xlsx`);
  }
  // Export de control para completar contactos: clientes sin email ni teléfono.
  function filasSinContacto(cands: ClienteCandidato[]): Record<string, unknown>[] {
    return cands.map((c) => ({
      Cliente: c.cliente,
      "N° cuenta": c.numeroCuenta,
      Email: c.email ?? "",
      Teléfono: c.telefono ?? "",
      Localidad: c.localidad ?? "",
      "Código lona comprado": c.codigoArticulo,
      "Código tapa sugerido": c.codigoTapaSugerido ?? "",
      "Modelo / camioneta": c.modeloEquivalencia ?? vehiculoTexto(c),
      "Fecha de compra": c.fechaCompraDisplay,
      "Factura/comprobante": c.comprobante ?? "",
      Observación: "Completar email o teléfono antes de campaña",
    }));
  }

  // Export de revisión comercial: todos los casos con observaciones (incluye
  // clientes sin contacto, match ambiguo, vehículo/fecha dudosos, compra
  // reciente) más los códigos no encontrados en ventas, con su motivo.
  function filasCasosARevisar(): Record<string, unknown>[] {
    const min = filtros.antiguedadMinMeses;
    const rows: Record<string, unknown>[] = (candidatos ?? [])
      .map((c) => ({ c, motivos: motivosRevision(c, min) }))
      .filter(({ motivos }) => motivos.length > 0)
      .map(({ c, motivos }) => ({
        Tipo: "Cliente a revisar",
        Cliente: c.cliente,
        "N° cuenta": c.numeroCuenta,
        Email: c.email ?? "",
        Teléfono: c.telefono ?? "",
        Localidad: c.localidad ?? "",
        "Código lona comprado": c.codigoArticulo,
        "Código tapa sugerido": c.codigoTapaSugerido ?? "",
        "Modelo / camioneta": c.modeloEquivalencia ?? vehiculoTexto(c),
        "Fecha de compra": c.fechaCompraDisplay,
        "Factura/comprobante": c.comprobante ?? "",
        "Motivo de revisión": motivos.join("; "),
      }));
    if (chequeo) {
      for (const n of chequeo.noEncontrados) {
        rows.push({
          Tipo: "Código no encontrado",
          Cliente: "",
          "N° cuenta": "",
          Email: "",
          Teléfono: "",
          Localidad: "",
          "Código lona comprado": n.codigoLona,
          "Código tapa sugerido": n.codigoTapa,
          "Modelo / camioneta": n.modelo,
          "Fecha de compra": "",
          "Factura/comprobante": "",
          "Motivo de revisión": n.observacion,
        });
      }
    }
    return rows;
  }

  function exportarSinContacto() {
    if (segmentacion) {
      descargarXlsx(filasSinContacto(segmentacion.excluir), `${exportPrefix}-sin-contacto.xlsx`);
    }
  }
  function exportarRevisar() {
    descargarXlsx(filasCasosARevisar(), `${exportPrefix}-revisar.xlsx`);
  }
  function exportarTodos() {
    if (candidatos) descargarXlsx(filasCompletas(candidatos), `${exportPrefix}-todos.xlsx`);
  }

  const casosARevisarTotal = useMemo(() => {
    const min = filtros.antiguedadMinMeses;
    const clientes = (candidatos ?? []).filter(
      (c) => motivosRevision(c, min).length > 0,
    ).length;
    return clientes + (chequeo?.noEncontrados.length ?? 0);
  }, [candidatos, chequeo, filtros.antiguedadMinMeses]);

  function exportarChequeo() {
    if (!chequeo) return;
    const rows: Record<string, unknown>[] = [
      ...chequeo.encontrados.map((e) => ({
        Resultado: "Encontrado en ventas",
        "Código lona": e.codigoLona,
        "Código tapa": e.codigoTapa,
        Modelo: e.modelo,
        Ventas: e.ventas,
        "Clientes únicos": e.clientesUnicos,
        "Última venta": e.ultimaVenta ?? "",
        "Ejemplo cliente": e.ejemploCliente ?? "",
        Observación: "",
        "Posible coincidencia": "",
      })),
      ...chequeo.noEncontrados.map((n) => ({
        Resultado: "No encontrado",
        "Código lona": n.codigoLona,
        "Código tapa": n.codigoTapa,
        Modelo: n.modelo,
        Ventas: 0,
        "Clientes únicos": 0,
        "Última venta": "",
        "Ejemplo cliente": "",
        Observación: n.observacion,
        "Posible coincidencia": n.posibleCoincidencia ?? "",
      })),
    ];
    descargarXlsx(rows, "pickup4x4-renovacion-lonas-chequeo-codigos.xlsx");
  }

  async function copiar(texto: string, etiqueta: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(etiqueta);
    } catch {
      setCopiado(null);
    }
  }

  const hayArticulos = articulos.length > 0;

  return (
    <AppShell moduleTitle={moduleTitle} moduleDescription={moduleDescription}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-slate-800/80 px-2.5 py-1">
            Fuente de datos:{" "}
            <span className="text-slate-200">
              {!isStorageHydrated ? "Cargando…" : sourceLabel}
            </span>
          </span>
          {!isStorageHydrated ? (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-300">
              Cargando datos reales… (puede tardar unos segundos con catálogos grandes)
            </span>
          ) : isMock && supabaseError ? (
            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-300">
              Error al cargar fuente de datos: {supabaseError}
            </span>
          ) : isMock ? (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
              Datos de ejemplo (mock): importá tus Excel reales para resultados válidos.
            </span>
          ) : null}
        </div>

        {datasetSinVentas ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            No hay registros de venta cargados ({sourceLabel}): se pueden validar los
            códigos contra el catálogo, pero no se podrán detectar compradores históricos
            hasta importar el Diario de Ventas con código de artículo y número de cliente.{" "}
            <Link href="/importar/ventas" className="font-medium underline hover:text-amber-100">
              Importar Diario de Ventas →
            </Link>
          </div>
        ) : null}

        {/* Barra de persistencia */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-300">Estado:</span>
            {saveState === "guardando" ? (
              <span className="text-sky-300">Guardando…</span>
            ) : saveState === "error" ? (
              <span className="text-rose-300">Error al guardar</span>
            ) : !campaignId ? (
              <span className="text-slate-400">Sin guardar</span>
            ) : saveState === "sucio" ? (
              <span className="text-amber-300">Cambios sin guardar</span>
            ) : (
              <span className="text-emerald-300">Guardada</span>
            )}
            {campaignId && candidatos ? (
              <span
                className={resultsSaved ? "text-emerald-300" : "text-amber-300"}
              >
                · {resultsSaved ? "Resultados guardados" : "Resultados sin guardar"}
              </span>
            ) : null}
            {saveError ? (
              <span className="text-xs text-rose-300">— {saveError}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/campanas" className={secondaryBtnClass}>
              Campañas guardadas
            </Link>
            <button
              type="button"
              className={secondaryBtnClass}
              onClick={guardarResultados}
              disabled={!candidatos || saveState === "guardando" || resultsSaved}
            >
              Guardar resultados
            </button>
            <button
              type="button"
              className={primaryCtaClass}
              onClick={guardarCampaña}
              disabled={saveState === "guardando"}
            >
              Guardar campaña
            </button>
          </div>
        </div>

        {/* SECCIÓN 1 — Crear campaña */}
        <SectionCard
          title="1 · Crear campaña"
          description="Datos descriptivos de la acción comercial (no afectan el cruce de datos)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Nombre de campaña</span>
              <input
                className={inputClass}
                placeholder="Ej: Renovación de lonas"
                value={meta.nombre}
                onChange={(e) => updateMeta({ nombre: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Tipo de campaña</span>
              <select
                className={inputClass}
                value={meta.tipo}
                onChange={(e) =>
                  updateMeta({ tipo: e.target.value as CampaignMeta["tipo"] })
                }
              >
                {CAMPAIGN_TIPO_OPCIONES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-slate-300">Descripción / objetivo</span>
              <textarea
                className={`${inputClass} min-h-[64px] resize-y`}
                placeholder="Ej: Clientes que compraron lonas para ofrecer renovación tomando la usada como parte de pago."
                value={meta.descripcion}
                onChange={(e) => updateMeta({ descripcion: e.target.value })}
              />
            </label>
          </div>
        </SectionCard>

        {/* SECCIÓN 2 — Importar artículos */}
        <SectionCard
          title="2 · Importar artículos objetivo"
          description="Subí un Excel con los artículos base de la campaña (ej. lonas). Se normalizan los encabezados automáticamente."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ExcelUploadCard
              title="Excel de artículos"
              description="Lectura local; no se envía al servidor."
              expectedColumns={
                preset?.importer?.expectedColumns ?? [
                  "Código / SKU",
                  "Descripción / Producto",
                  "Categoría (opcional)",
                  "Marca / Modelo (opcional)",
                  "Observaciones (opcional)",
                ]
              }
              onRowsLoaded={handleRowsLoaded}
            />
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 text-sm text-slate-300">
              <p className="font-medium text-white">Cómo usar esta campaña</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
                <li>Subí un Excel con los artículos que querés usar como base.</li>
                <li>Revisá que el sistema los encuentre en el catálogo.</li>
                <li>Corregí, agregá o eliminá artículos si hace falta.</li>
                <li>Buscá ventas históricas de esos artículos.</li>
                <li>Revisá los clientes detectados y exportá el listado.</li>
              </ol>
              <p className="mt-3 text-xs text-amber-300/90">
                Antes de enviar, revisá clientes sin email, artículos ambiguos y casos
                sin vehículo/modelo identificado.
              </p>
              {importInfo ? (
                <p className="mt-3 text-xs text-emerald-300">Cargado: {importInfo}</p>
              ) : null}
            </div>
          </div>

          {preset?.catalogo ? (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-300">{preset.catalogo.descripcion}</p>
              <button
                type="button"
                className={secondaryBtnClass}
                onClick={cargarDelCatalogo}
              >
                {preset.catalogo.label}
              </button>
            </div>
          ) : null}

          {preset?.importer && importerResumen ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <ResumenItem label="Filas leídas" value={importerResumen.filasLeidas} />
                <ResumenItem
                  label="Códigos lona válidos"
                  value={importerResumen.codigosLonaValidos}
                />
                <ResumenItem
                  label="Filas sin código lona"
                  value={importerResumen.filasSinCodigoLona}
                  alerta={importerResumen.filasSinCodigoLona > 0}
                />
                <ResumenItem
                  label="Códigos tapa sugeridos"
                  value={importerResumen.codigosTapaSugeridos}
                />
                <ResumenItem
                  label="Modelos detectados"
                  value={importerResumen.modelosDetectados}
                />
              </div>
              <p className="mt-3 text-xs text-slate-400">{preset.importer.helpText}</p>
            </div>
          ) : null}
        </SectionCard>

        {/* SECCIÓN 3 — Validación contra catálogo */}
        <SectionCard
          title={
            preset?.importer
              ? `3 · ${preset.importer.sectionTitle}`
              : "3 · Artículos y validación contra catálogo"
          }
          description={
            preset?.importer
              ? "El código de lona es el que se busca en ventas; la tapa es el recambio sugerido. Editá, agregá o borrá filas; la validación se actualiza automáticamente."
              : "Cada artículo se busca primero por código exacto y luego por descripción. La validación se actualiza automáticamente al editar."
          }
          action={
            <button type="button" className={secondaryBtnClass} onClick={addArticulo}>
              + Agregar artículo
            </button>
          }
        >
          {!hayArticulos ? (
            <p className="text-sm text-slate-400">
              Importá un Excel arriba o agregá artículos manualmente para empezar.
            </p>
          ) : preset?.importer ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 pr-3 font-medium">{preset.importer.codigoLabel}</th>
                    <th className="pb-2 pr-3 font-medium">{preset.importer.recambioLabel}</th>
                    <th className="pb-2 pr-3 font-medium">{preset.importer.modeloLabel}</th>
                    <th className="pb-2 pr-3 font-medium">Estado</th>
                    <th className="pb-2 pr-3 font-medium">Observaciones</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {articulos.map((art) => {
                    const v = validadosPorId.get(art.id);
                    const obs: string[] = [];
                    if (!art.codigo.trim()) obs.push("Sin código lona");
                    if (!art.codigoTapa?.trim()) obs.push("Sin código tapa");
                    if (!art.modelo.trim()) obs.push("Sin modelo");
                    if (
                      art.codigo.trim() &&
                      lonasDuplicadas.has(art.codigo.trim().toLowerCase())
                    ) {
                      obs.push("Múltiples equivalencias");
                    }
                    return (
                      <tr key={art.id} className="border-t border-slate-800 align-top">
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[120px] font-mono text-xs`}
                            value={art.codigo}
                            onChange={(e) => updateArticulo(art.id, "codigo", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[120px] font-mono text-xs`}
                            value={art.codigoTapa ?? ""}
                            onChange={(e) =>
                              updateArticulo(art.id, "codigoTapa", e.target.value)
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[120px]`}
                            value={art.modelo}
                            onChange={(e) => updateArticulo(art.id, "modelo", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          {v ? (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs ${estadoBadge[v.estado]}`}
                              title={v.mensaje}
                            >
                              {ESTADO_LABEL[v.estado]}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-xs text-amber-300/90">
                          {obs.length > 0 ? obs.join(" · ") : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeArticulo(art.id)}
                            className="text-xs text-slate-400 underline hover:text-rose-300"
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-2 pr-3 font-medium">Código</th>
                    <th className="pb-2 pr-3 font-medium">Descripción</th>
                    <th className="pb-2 pr-3 font-medium">Categoría</th>
                    <th className="pb-2 pr-3 font-medium">Marca</th>
                    <th className="pb-2 pr-3 font-medium">Modelo</th>
                    <th className="pb-2 pr-3 font-medium">Estado</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {articulos.map((art) => {
                    const v = validadosPorId.get(art.id);
                    return (
                      <tr key={art.id} className="border-t border-slate-800 align-top">
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[110px] font-mono text-xs`}
                            value={art.codigo}
                            onChange={(e) => updateArticulo(art.id, "codigo", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[200px]`}
                            value={art.descripcion}
                            onChange={(e) =>
                              updateArticulo(art.id, "descripcion", e.target.value)
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[120px]`}
                            value={art.categoria}
                            onChange={(e) =>
                              updateArticulo(art.id, "categoria", e.target.value)
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[100px]`}
                            value={art.marca}
                            onChange={(e) => updateArticulo(art.id, "marca", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} min-w-[100px]`}
                            value={art.modelo}
                            onChange={(e) => updateArticulo(art.id, "modelo", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          {v ? (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs ${estadoBadge[v.estado]}`}
                              title={v.mensaje}
                            >
                              {ESTADO_LABEL[v.estado]}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeArticulo(art.id)}
                            className="text-xs text-slate-400 underline hover:text-rose-300"
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Los artículos editados se mantienen solo en esta pantalla (no se guardan
            todavía en Supabase). El cruce usa el catálogo del dataset activo
            ({!isStorageHydrated ? "cargando…" : sourceLabel}).
          </p>

          {cobertura ? (
            <CoberturaVentasPanel
              cobertura={cobertura}
              codigosEncontrados={chequeo ? chequeo.codigosEncontrados : null}
              clientesCompradores={chequeo ? chequeo.clientesPotenciales : null}
            />
          ) : null}

          {chequeo ? (
            <ChequeoCoincidenciaPanel chequeo={chequeo} onExport={exportarChequeo} />
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              className={primaryCtaClass}
              onClick={buscarClientes}
              disabled={articulosBuscables === 0}
            >
              Buscar clientes que compraron estos artículos
            </button>
            {hayArticulos && articulosBuscables === 0 ? (
              <p className="mt-2 text-xs text-amber-300/90">
                Ningún artículo quedó validado contra el catálogo. Corregí códigos o
                descripciones para poder buscar clientes.
              </p>
            ) : null}
          </div>
        </SectionCard>

        {/* SECCIÓN 8 — Indicadores de calidad */}
        {summary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Artículos validados"
              value={`${summary.articulosValidados}/${summary.articulosImportados}`}
              hint={`${summary.articulosAmbiguos} ambiguos · ${summary.articulosNoEncontrados} no encontrados`}
            />
            <StatCard
              label="Ventas encontradas"
              value={summary.ventasEncontradas.toLocaleString("es-AR")}
            />
            <StatCard
              label="Clientes detectados"
              value={summary.clientesUnicos.toLocaleString("es-AR")}
              trend="up"
            />
            <StatCard
              label="Con email / teléfono"
              value={`${summary.clientesConEmail} / ${summary.clientesConTelefono}`}
              hint={`${summary.clientesSinContacto} sin contacto`}
            />
            <StatCard
              label="Con vehículo identificado"
              value={summary.clientesConVehiculo.toLocaleString("es-AR")}
            />
            <StatCard
              label="Revisión pendiente"
              value={summary.filasRevisionPendiente.toLocaleString("es-AR")}
              hint="Match medio, sin fecha o sin vehículo"
            />
          </div>
        ) : null}

        {/* Estado real de la campaña + contactabilidad */}
        {estadoReal && contactabilidad ? (
          <SectionCard
            title={estadoReal.titulo}
            description="Diagnóstico de qué falta para enviar la campaña real, en lenguaje no técnico."
            action={
              <button
                type="button"
                className={secondaryBtnClass}
                onClick={exportarSinContacto}
                disabled={contactabilidad.sinContacto === 0}
              >
                Exportar clientes sin contacto ({contactabilidad.sinContacto})
              </button>
            }
          >
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${ESTADO_REAL_CLASS[estadoReal.caso]}`}
            >
              {estadoReal.texto}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Clientes detectados"
                value={contactabilidad.detectados.toLocaleString("es-AR")}
              />
              <StatCard
                label="Con email"
                value={contactabilidad.conEmail.toLocaleString("es-AR")}
              />
              <StatCard
                label="Con teléfono / WhatsApp"
                value={contactabilidad.conTelefono.toLocaleString("es-AR")}
              />
              <StatCard
                label="Sin contacto"
                value={contactabilidad.sinContacto.toLocaleString("es-AR")}
                hint="Sin email ni teléfono"
              />
              <StatCard
                label="% contactable"
                value={`${contactabilidad.porcentajeContactable}%`}
              />
              <StatCard
                label="Aptos para email"
                value={contactabilidad.aptosEmail.toLocaleString("es-AR")}
                trend="up"
              />
              <StatCard
                label="Aptos para WhatsApp/teléfono"
                value={contactabilidad.aptosWhatsapp.toLocaleString("es-AR")}
              />
              <StatCard
                label="Casos a revisar"
                value={contactabilidad.casosARevisar.toLocaleString("es-AR")}
                hint="Con contacto, pero requieren revisión"
              />
            </div>
          </SectionCard>
        ) : null}

        {/* SECCIÓN 7 — Filtros + SECCIÓN 6 — Resultado */}
        {candidatos ? (
          <SectionCard
            title="4 · Clientes candidatos"
            description={`Mostrando ${filtrados.length} de ${candidatos.length} clientes detectados.`}
            action={
              <button
                type="button"
                className={primaryCtaClass}
                onClick={exportar}
                disabled={filtrados.length === 0}
              >
                Exportar a Excel
              </button>
            }
          >
            <div className="mb-5 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={filtros.soloConEmail}
                  onChange={(e) =>
                    setFiltros((f) => ({ ...f, soloConEmail: e.target.checked }))
                  }
                />
                Solo con email
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={filtros.soloConTelefono}
                  onChange={(e) =>
                    setFiltros((f) => ({ ...f, soloConTelefono: e.target.checked }))
                  }
                />
                Solo con teléfono
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={filtros.ocultarSinContacto}
                  onChange={(e) =>
                    setFiltros((f) => ({ ...f, ocultarSinContacto: e.target.checked }))
                  }
                />
                Ocultar clientes sin contacto
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={filtros.excluirComprasRecientes}
                  onChange={(e) =>
                    setFiltros((f) => ({ ...f, excluirComprasRecientes: e.target.checked }))
                  }
                />
                Excluir compras recientes
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span className="whitespace-nowrap">Antigüedad mín. (meses)</span>
                <input
                  type="number"
                  min={0}
                  className={`${inputClass} w-20`}
                  value={filtros.antiguedadMinMeses}
                  onChange={(e) =>
                    setFiltros((f) => ({
                      ...f,
                      antiguedadMinMeses: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span>Confianza</span>
                <select
                  className={inputClass}
                  value={filtros.confianza}
                  onChange={(e) =>
                    setFiltros((f) => ({
                      ...f,
                      confianza: e.target.value as CampaignFiltros["confianza"],
                    }))
                  }
                >
                  <option value="">Todas</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                </select>
              </label>
              {localidades.length > 0 ? (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <span>Localidad</span>
                  <select
                    className={inputClass}
                    value={filtros.localidad}
                    onChange={(e) =>
                      setFiltros((f) => ({ ...f, localidad: e.target.value }))
                    }
                  >
                    <option value="">Todas</option>
                    {localidades.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {filtrados.length === 0 ? (
              <p className="text-sm text-slate-400">
                No hay clientes con los filtros actuales. Probá aflojar los filtros (por
                ejemplo, desactivar &quot;Excluir compras recientes&quot;).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2 pr-3 font-medium">Cliente</th>
                      <th className="pb-2 pr-3 font-medium">Contacto</th>
                      <th className="pb-2 pr-3 font-medium">Localidad</th>
                      <th className="pb-2 pr-3 font-medium">Artículo</th>
                      <th className="pb-2 pr-3 font-medium">Fecha</th>
                      <th className="pb-2 pr-3 font-medium">Antig.</th>
                      <th className="pb-2 pr-3 font-medium">Vehículo</th>
                      <th className="pb-2 pr-3 font-medium">Match</th>
                      <th className="pb-2 font-medium">Acción sugerida</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {filtrados.map((c) => (
                      <tr
                        key={c.numeroCuenta}
                        className="border-t border-slate-800 align-top"
                      >
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{c.cliente}</span>
                          <span className="mt-0.5 block font-mono text-xs text-slate-500">
                            {c.numeroCuenta}
                          </span>
                          {c.multiplesCompras ? (
                            <span className="mt-0.5 block text-xs text-sky-300">
                              {c.comprasTotales} compras · {c.articulosDistintos} artículos
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          <span className={c.email ? "text-slate-200" : "text-rose-300"}>
                            {c.email ?? "Sin email"}
                          </span>
                          <span
                            className={`mt-0.5 block ${c.telefono ? "text-slate-400" : "text-rose-300"}`}
                          >
                            {c.telefono ?? "Sin teléfono"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">{c.localidad ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          <span>{c.articuloComprado}</span>
                          <span className="mt-0.5 block font-mono text-xs text-slate-500">
                            {c.codigoArticulo}
                          </span>
                          {c.codigoTapaSugerido || c.modeloEquivalencia ? (
                            <span className="mt-0.5 block text-xs text-sky-300">
                              {c.codigoTapaSugerido ? `Tapa: ${c.codigoTapaSugerido}` : ""}
                              {c.codigoTapaSugerido && c.modeloEquivalencia ? " · " : ""}
                              {c.modeloEquivalencia ? `Modelo: ${c.modeloEquivalencia}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className={c.fechaConfiable ? "" : "text-amber-300"}>
                            {c.fechaCompraDisplay}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          {c.antiguedadMeses ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          {c.vehiculoIdentificado ? (
                            c.vehiculos.slice(0, 3).join(", ") +
                            (c.vehiculos.length > 3 ? ` +${c.vehiculos.length - 3}` : "")
                          ) : (
                            <span className="text-amber-300">No identificado</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              c.confianzaMatch === "Alta"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {c.confianzaMatch}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-300">
                          {c.accionSugerida}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ) : null}

        {/* SECCIÓN 5 — Segmentación final para envío (presets con emailKit) */}
        {emailKit && candidatos && segmentacion ? (
          <SectionCard
            title="5 · Segmentación final para envío"
            description="Separá los clientes en grupos accionables. Acá no se envía ningún mensaje: solo se prepara y exporta el listado final."
            action={
              <button
                type="button"
                className={primaryCtaClass}
                onClick={exportarEmail}
                disabled={segmentacion.email.length === 0}
              >
                Exportar listos para email
              </button>
            }
          >
            <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm">
              <p className="font-medium text-white">Preparación final de la campaña</p>
              <p className="mt-1 text-slate-400">
                Antes de enviar la campaña, revisá los clientes listos para email, los
                contactos que conviene trabajar por WhatsApp y los casos que requieren
                revisión. No se envía ningún mensaje desde esta pantalla; solo se prepara y
                exporta el listado final.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Listos para email"
                value={segmentacion.email.length.toLocaleString("es-AR")}
                trend="up"
                hint="Email + match alta + datos OK"
              />
              <StatCard
                label="WhatsApp / teléfono"
                value={segmentacion.whatsapp.length.toLocaleString("es-AR")}
                hint="Sin email, con teléfono"
              />
              <StatCard
                label="Revisar antes de contactar"
                value={segmentacion.revisar.length.toLocaleString("es-AR")}
                hint="Ambiguo, sin vehículo o fecha dudosa"
              />
              <StatCard
                label="Excluir por ahora"
                value={segmentacion.excluir.length.toLocaleString("es-AR")}
                hint="Sin contacto"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={secondaryBtnClass}
                onClick={exportarWhatsapp}
                disabled={segmentacion.whatsapp.length === 0}
              >
                Exportar WhatsApp/teléfono ({segmentacion.whatsapp.length})
              </button>
              <button
                type="button"
                className={secondaryBtnClass}
                onClick={exportarRevisar}
                disabled={casosARevisarTotal === 0}
              >
                Exportar casos a revisar ({casosARevisarTotal})
              </button>
              <button
                type="button"
                className={secondaryBtnClass}
                onClick={exportarTodos}
                disabled={candidatos.length === 0}
              >
                Exportar todos ({candidatos.length})
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-sm font-medium text-white">Asuntos sugeridos</p>
                <ul className="mt-2 space-y-2">
                  {emailKit.subjects.map((s) => (
                    <li
                      key={s}
                      className="flex items-start justify-between gap-2 text-sm text-slate-300"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-emerald-300 underline hover:text-emerald-200"
                        onClick={() => copiar(s, `asunto:${s}`)}
                      >
                        {copiado === `asunto:${s}` ? "Copiado ✓" : "Copiar"}
                      </button>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-sm font-medium text-white">Variables disponibles</p>
                <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  {disponibilidad.map((v) => (
                    <li key={v.variable} className={v.baja ? "text-amber-300" : "text-slate-400"}>
                      <span className="font-mono">{v.variable}</span> — {v.porcentaje}%
                      {v.baja ? " ⚠ poca cobertura" : ""}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">Cuerpo del email</p>
                  <button
                    type="button"
                    className={secondaryBtnClass}
                    onClick={() => copiar(emailKit.body, "cuerpo")}
                  >
                    {copiado === "cuerpo" ? "Copiado ✓" : "Copiar cuerpo"}
                  </button>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
{emailKit.body}
                </pre>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </AppShell>
  );
}
