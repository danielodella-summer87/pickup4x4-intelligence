"use client";

import { useState } from "react";
import type {
  CompanyProspect,
  ProspectProposal,
} from "@/lib/models/prospeccion";
import {
  buildProposalContent,
  exportProposalPdf,
  formatMoneyUSD,
} from "@/lib/prospeccion/proposal-commercial";

const actionButton =
  "rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800";
const exportButton =
  "rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20";

function PreviewBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h4>
      <div className="mt-1 text-sm text-slate-200">{children}</div>
    </div>
  );
}

/**
 * Previsualización comercial de una propuesta + acciones de PDF.
 * Muestra "qué propuesta se enviaría". Las notas internas se marcan claramente
 * y NO forman parte del PDF comercial.
 */
export function ProposalPreview({
  prospect,
  proposal,
}: {
  prospect: CompanyProspect;
  proposal: ProspectProposal;
}) {
  const [open, setOpen] = useState(false);
  const content = buildProposalContent(prospect, proposal);

  return (
    <div className="sm:col-span-4">
      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={actionButton}
          aria-expanded={open}
        >
          {open ? "Ocultar previsualización" : "Previsualizar propuesta"}
        </button>
        <button
          type="button"
          onClick={() => exportProposalPdf(prospect, proposal)}
          className={exportButton}
        >
          Exportar PDF propuesta
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-4 rounded-xl border border-slate-700 bg-white/[0.03] p-4">
          {/* Encabezado */}
          <div className="border-b border-slate-700 pb-3">
            <p className="text-base font-semibold text-white">
              {content.header.titulo}
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm text-slate-300 sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Empresa: </span>
                {content.header.empresa}
              </div>
              <div>
                <span className="text-slate-500">Rubro: </span>
                {content.header.rubro}
              </div>
              <div>
                <span className="text-slate-500">Localidad / depto.: </span>
                {content.header.ubicacion}
              </div>
              <div>
                <span className="text-slate-500">Fecha: </span>
                {content.header.fecha}
              </div>
              <div>
                <span className="text-slate-500">Versión: </span>
                {content.header.version}
              </div>
              <div>
                <span className="text-slate-500">Estado: </span>
                {content.header.estado}
              </div>
            </dl>
          </div>

          <PreviewBlock title="Introducción">
            <p className="leading-relaxed">{content.intro}</p>
          </PreviewBlock>

          <PreviewBlock title="Necesidad detectada">
            {content.necesidad.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {content.necesidad.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">
                Sin datos suficientes para detallar la necesidad.
              </p>
            )}
          </PreviewBlock>

          <PreviewBlock title="Productos / soluciones propuestas">
            {content.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-1 pr-2 font-medium">Producto</th>
                      <th className="pb-1 px-2 text-right font-medium">Cantidad</th>
                      <th className="pb-1 px-2 text-right font-medium">Precio unit.</th>
                      <th className="pb-1 pl-2 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.items.map((it, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="py-1 pr-2">{it.nombre}</td>
                        <td className="py-1 px-2 text-right tabular-nums">
                          {it.cantidad}
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums">
                          {it.precioUnitario > 0
                            ? formatMoneyUSD(it.precioUnitario)
                            : "—"}
                        </td>
                        <td className="py-1 pl-2 text-right tabular-nums">
                          {it.subtotal > 0 ? formatMoneyUSD(it.subtotal) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700">
                      <td colSpan={3} className="py-1 pr-2 text-right font-medium text-slate-400">
                        Total estimado
                      </td>
                      <td className="py-1 pl-2 text-right font-semibold tabular-nums text-emerald-300">
                        {formatMoneyUSD(content.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-amber-300">
                Todavía no se cargaron productos para esta propuesta.
              </p>
            )}
          </PreviewBlock>

          <PreviewBlock title="Argumento comercial">
            {content.argumento.map((a, i) => (
              <p key={i} className="leading-relaxed">
                {a}
              </p>
            ))}
          </PreviewBlock>

          <PreviewBlock title="Monto estimado">
            <p>{content.monto}</p>
          </PreviewBlock>

          <PreviewBlock title="Próximo paso sugerido">
            <p>{content.proximoPaso}</p>
          </PreviewBlock>

          {/* Notas internas: claramente marcadas, fuera del PDF comercial */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Notas internas — no se incluyen en el PDF comercial
            </h4>
            <p className="mt-1 text-sm text-slate-300">
              {content.notasInternas ?? "Sin notas internas."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
