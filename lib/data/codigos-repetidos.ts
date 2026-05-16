import type { CodigoRepetidoResumen } from "@/lib/excel/import-preview";
import type { ArticuloAplicacion } from "@/lib/models/articulo";

export function buildCodigosRepetidosFromAplicaciones(
  aplicaciones: ArticuloAplicacion[],
): CodigoRepetidoResumen[] {
  const porCodigo = new Map<string, string[]>();

  for (const aplicacion of aplicaciones) {
    const lista = porCodigo.get(aplicacion.codigoUnico) ?? [];
    lista.push(aplicacion.codigoAplicacion);
    porCodigo.set(aplicacion.codigoUnico, lista);
  }

  return [...porCodigo.entries()]
    .filter(([, codigos]) => codigos.length > 1)
    .map(([codigoUnico, codigosAplicacion]) => ({
      codigoUnico,
      filas: codigosAplicacion.length,
      codigosAplicacion,
    }))
    .sort((a, b) => b.filas - a.filas);
}
