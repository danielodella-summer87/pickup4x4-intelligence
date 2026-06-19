/**
 * Mapas de columnas esperados para los 3 Excel KORE.
 * Los aliases cubren variaciones habituales de encabezados; ampliar al ver archivos reales.
 */

export const EXCEL_WORKBOOKS = {
  CUENTAS: "LISTADO DE CUENTAS",
  VENTAS: "Diario de Ventas",
  ARTICULOS: "LISTADO COMPLETO DE ARTICULOS Y SUS APLICACIONES",
} as const;

export type ExcelWorkbookKey = keyof typeof EXCEL_WORKBOOKS;

export type ImportDatasetKey = "clientes" | "ventas" | "articulos";

/** Campo lógico interno → aliases posibles en la primera fila del Excel. */
export type ColumnAliases = readonly string[];

export type ColumnMap = Record<string, ColumnAliases>;

function aliases(...names: string[]): ColumnAliases {
  return names;
}

export type ColumnMatchKind = "exact" | "normalized";

export type ColumnHeaderMatch = {
  header: string;
  alias: string;
  kind: ColumnMatchKind;
};

const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF]/g;

/** Limpia encabezados crudos del Excel (espacios, NBSP, BOM). */
export function sanitizeExcelHeader(header: string): string {
  return String(header)
    .replace(INVISIBLE_CHARS, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza nombres de columna para matching robusto con encabezados KORE:
 * trim, minúsculas, sin tildes, y sin puntos ni espacios (token compacto).
 * Así "C.Único", "C. Unico" y "C Unico" → "cunico"; "Nro.Cuenta" y
 * "NRO CUENTA" → "nrocuenta"; "Emisión" → "emision".
 */
export function normalizeColumnName(name: string): string {
  return sanitizeExcelHeader(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.\s]+/g, "");
}

export function formatMatchKindLabel(kind: ColumnMatchKind): string {
  return kind === "exact" ? "Matched exact" : "Matched by normalized alias";
}

/** Compara un encabezado real contra la lista de aliases de un campo. */
export function matchHeaderToAliases(
  header: string,
  aliasList: ColumnAliases,
): ColumnHeaderMatch | null {
  const sanitizedHeader = sanitizeExcelHeader(header);

  for (const alias of aliasList) {
    const sanitizedAlias = sanitizeExcelHeader(alias);
    if (sanitizedHeader.toLowerCase() === sanitizedAlias.toLowerCase()) {
      return { header, alias, kind: "exact" };
    }
  }

  const normalizedHeader = normalizeColumnName(header);
  for (const alias of aliasList) {
    if (normalizeColumnName(alias) === normalizedHeader) {
      return { header, alias, kind: "normalized" };
    }
  }

  return null;
}

/** Primera coincidencia de encabezado detectado para un campo lógico. */
export function findHeaderForField(
  detectedHeaders: string[],
  aliasList: ColumnAliases,
): ColumnHeaderMatch | null {
  for (const header of detectedHeaders) {
    const match = matchHeaderToAliases(header, aliasList);
    if (match) return match;
  }
  return null;
}

/** Etiquetas legibles para diagnóstico UI. */
export const COLUMN_FIELD_LABELS: Record<string, string> = {
  numeroCuenta: "Nº cuenta",
  razonSocial: "Razón social",
  nombreFantasia: "Nombre fantasía",
  zona: "Zona",
  vendedor: "Vendedor",
  estado: "Estado",
  cuit: "RUC / CUIT",
  localidad: "Localidad",
  provincia: "Provincia",
  email: "Email",
  telefono: "Teléfono",
  tipoCuenta: "Tipo cuenta",
  rubroCliente: "Rubro cliente",
  fecha: "Fecha",
  tipoComprobante: "Tipo comprobante",
  numeroComprobante: "Nº comprobante",
  importeTotal: "Importe total",
  moneda: "Moneda",
  codigoUnico: "Código único (codigoUnico)",
  descripcion: "Descripción",
  cantidad: "Cantidad",
  precioUnitario: "Precio unitario",
  condicionVenta: "Condición venta",
  deposito: "Depósito",
  nombreCliente: "Nombre cuenta (venta)",
  localidadVenta: "Localidad (venta)",
  rubro: "Rubro / familia",
  categoria: "Categoría / grupo",
  subgrupo: "Subgrupo",
  marcaArticulo: "Marca artículo",
  stock: "Stock",
  precioLista: "Precio lista",
  unidadMedida: "Unidad medida",
  activo: "Activo",
  marcaVehiculo: "Marca vehículo",
  modeloVehiculo: "Modelo vehículo",
  anioDesde: "Año desde",
  anioHasta: "Año hasta",
  observaciones: "Observaciones",
  codigoOem: "Código OEM",
  codigoBarras: "Código barras",
};

/**
 * Columnas mínimas estructurales v1 (encabezado presente en el Excel).
 * Si falta alguna → importación bloqueada.
 */
export const V1_SCHEMA_MINIMUM_FIELDS: Record<ImportDatasetKey, readonly string[]> = {
  clientes: ["numeroCuenta", "razonSocial"],
  ventas: ["numeroCuenta", "numeroComprobante"],
  articulos: ["codigoUnico", "descripcion", "marcaVehiculo", "modeloVehiculo"],
};

/** @deprecated Usar V1_SCHEMA_MINIMUM_FIELDS */
export const REQUIRED_FIELDS = V1_SCHEMA_MINIMUM_FIELDS;

/** Etiquetas comerciales de columnas mínimas (UI / mensajes de bloqueo). */
export const V1_SCHEMA_MINIMUM_LABELS: Record<ImportDatasetKey, readonly string[]> = {
  clientes: ["Nro.", "Nombre"],
  ventas: ["Cliente", "Comprobante"],
  articulos: ["Código único", "Descripción", "Marca", "Modelo"],
};

/** Recomendados para calidad de datos (no bloquean importación en v1). */
export const RECOMMENDED_FIELDS: Record<ImportDatasetKey, readonly string[]> = {
  clientes: ["nombreFantasia", "localidad", "cuit"],
  ventas: ["fecha", "importeTotal", "moneda", "codigoUnico", "descripcion"],
  articulos: ["rubro", "categoria", "subgrupo"],
};

export const IMPORT_DATASETS: Record<
  ImportDatasetKey,
  { workbookTitle: string; columnMap: ColumnMap }
> = {
  clientes: {
    workbookTitle: EXCEL_WORKBOOKS.CUENTAS,
    columnMap: {} as ColumnMap,
  },
  ventas: {
    workbookTitle: EXCEL_WORKBOOKS.VENTAS,
    columnMap: {} as ColumnMap,
  },
  articulos: {
    workbookTitle: EXCEL_WORKBOOKS.ARTICULOS,
    columnMap: {} as ColumnMap,
  },
};

/**
 * LISTADO DE CUENTAS
 */
export const CLIENTES_COLUMNS: ColumnMap = {
  numeroCuenta: aliases(
    "Nro.",
    "Nro",
    "Nº",
    "N°",
    "No.",
    "No",
    "Nº Cuenta",
    "N° Cuenta",
    "Numero Cuenta",
    "Número Cuenta",
    "Número de Cuenta",
    "CUENTA",
    "NRO CUENTA",
    "Nro. Cuenta",
    "Cuenta",
    "Nro Cuenta",
    "COD. CUENTA",
    "Cod. Cuenta",
  ),
  razonSocial: aliases(
    "Nombre",
    "Razon Social",
    "Razón Social",
    "Cliente",
    "RAZON SOCIAL",
    "Raz. Social",
    "Nombre Cliente",
    "R Social",
  ),
  nombreFantasia: aliases(
    "Fantasía",
    "Fantasia",
    "Nombre Fantasia",
    "Nombre Fantasía",
    "NOMBRE FANTASIA",
  ),
  zona: aliases("Zona", "ZONA", "Region", "Región", "Sector comercial", "Sector"),
  vendedor: aliases(
    "Vendedor",
    "VENDEDOR",
    "Vend.",
    "Cod. Vendedor",
    "Vendedor asignado",
    "Cod Vendedor",
  ),
  estado: aliases("Estado", "ESTADO", "Situación", "Situacion", "Status"),
  cuit: aliases("RUC", "Ruc", "RUC.", "CUIT", "Cuit", "C.U.I.T."),
  localidad: aliases("Localidad", "Localidad.", "LOCALIDAD", "Ciudad", "CIUDAD"),
  provincia: aliases("Provincia", "PROVINCIA", "Prov."),
  email: aliases("Email", "E-mail", "MAIL", "Correo"),
  telefono: aliases("Telefono", "Teléfono", "TELEFONO", "Tel.", "Celular"),
  tipoCuenta: aliases("Tipo", "Tipo Cuenta", "TIPO", "Clase"),
  rubroCliente: aliases("Rubro", "RUBRO", "Actividad"),
};

/**
 * Diario de Ventas
 */
export const VENTAS_COLUMNS: ColumnMap = {
  numeroCuenta: aliases(
    "Cliente",
    "Nº Cuenta",
    "N° Cuenta",
    "Numero Cuenta",
    "CUENTA",
    "NRO CUENTA",
    "Nro.Cuenta",
    "Nro. Cuenta",
    "Nro Cuenta",
    "Número de cuenta",
    "Numero de cuenta",
    "Cod. Cliente",
    "Código Cliente",
    "Cod Cliente",
  ),
  nombreCliente: aliases(
    "Nombre Cuenta",
    "Nombre cuenta",
    "Nombre Cliente",
    "Nombre cliente",
    "Cliente nombre",
    "Razón social",
    "Razon social",
    "Razon Social Cuenta",
    "Razón Social Cuenta",
  ),
  fecha: aliases(
    "Emisión",
    "Emision",
    "Fecha emisión",
    "Fecha emision",
    "Fecha",
    "FECHA",
    "Fec.",
    "Fec",
    "Fecha.",
    "Fecha comprobante",
    "Fecha venta",
    "Fecha Comp.",
  ),
  tipoComprobante: aliases(
    "Comprob.",
    "Comprob",
    "Tipo",
    "Tipo Comprobante",
    "TIPO",
    "T. Comp.",
    "Tipo Comp",
    "Tipo de Comprobante",
  ),
  numeroComprobante: aliases(
    "Nro.",
    "Nro",
    "Número",
    "Numero",
    "Comprobante",
    "Comprobante.",
    "Nº Comprobante",
    "N° Comprobante",
    "Numero Comprobante",
    "COMPROBANTE",
    "Nro. Comp.",
    "Factura",
    "Nro Comprobante",
    "Número Comprobante",
  ),
  importeTotal: aliases(
    "Importe",
    "Importe.",
    "IMPORTE",
    "Total",
    "TOTAL",
    "Importe Total",
    "Monto",
    "Neto",
    "Importe Neto",
    "Total Venta",
  ),
  vendedor: aliases("Vendedor", "VENDEDOR", "Vend."),
  moneda: aliases("Moneda", "MONEDA", "Divisa"),
  localidadVenta: aliases(
    "Localidad",
    "Localidad.",
    "LOCALIDAD",
    "Loc. Cliente",
    "Localidad Cliente",
  ),
  codigoUnico: aliases(
    "C.Único",
    "C.Unico",
    "C.Uniq",
    "C. Uniq",
    "C.Uniq.",
    "C Unico",
    "C Único",
    "Codigo",
    "Código",
    "CODIGO",
    "Código artículo",
    "Codigo articulo",
    "SKU",
    "Artículo",
    "Articulo",
    "Cod. Art.",
    "Cod Articulo",
    "Código Único",
    "Codigo Unico",
  ),
  descripcion: aliases(
    "Descripción",
    "Descripcion",
    "Desc.",
    "Desc",
    "Producto",
    "DETALLE",
    "Detalle",
  ),
  cantidad: aliases("Cantidad", "CANTIDAD", "Cant.", "Cant", "Uds.", "Unidades"),
  precioUnitario: aliases(
    "Precio",
    "P. Unit.",
    "Precio Unitario",
    "PRECIO UNITARIO",
    "Unitario",
  ),
  condicionVenta: aliases("Condicion", "Condición", "Cond. Venta", "Forma pago"),
  deposito: aliases("Deposito", "Depósito", "DEPOSITO", "Sucursal"),
};

/**
 * LISTADO COMPLETO DE ARTICULOS Y SUS APLICACIONES
 */
export const ARTICULOS_COLUMNS: ColumnMap = {
  codigoUnico: aliases(
    "Código Único",
    "Código Unico",
    "Codigo Único",
    "Codigo",
    "Código",
    "CODIGO",
    "Cod. Art.",
    "SKU",
    "Código único",
    "Codigo Unico",
    "CODIGO UNICO",
    "Cod. Unico",
    "Código Artículo",
    "Cod Articulo",
    "Cod. Articulo",
  ),
  descripcion: aliases(
    "Descripción",
    "Descripcion",
    "DESCRIPCION",
    "Articulo",
    "Artículo",
    "Detalle",
    "Nombre",
  ),
  rubro: aliases("Familia", "FAMILIA", "Rubro", "RUBRO"),
  categoria: aliases("Grupo", "GRUPO", "Categoria", "Categoría", "CATEGORIA"),
  subgrupo: aliases("SubGrupo", "Subgrupo", "SUBGRUPO", "Sub Grupo", "Sub-Grupo"),
  marcaArticulo: aliases(
    "Marca artículo",
    "Marca Articulo",
    "Marca Art.",
    "Fabricante",
    "Marca del artículo",
  ),
  stock: aliases("Stock", "STOCK", "Existencia", "Disponible", "Cant. Stock"),
  precioLista: aliases(
    "Precio",
    "Precio Lista",
    "PRECIO LISTA",
    "P. Lista",
    "Lista",
  ),
  unidadMedida: aliases("UM", "Unidad", "Unidad Medida", "U.M."),
  activo: aliases("Activo", "ACTIVO", "Habilitado", "Estado artículo"),
  marcaVehiculo: aliases(
    "Marca",
    "MARCA",
    "Marca Vehiculo",
    "Marca Vehículo",
    "MARCA VEH",
    "Marca auto",
    "Marca veh.",
    "Marca Veh",
  ),
  modeloVehiculo: aliases(
    "Modelo",
    "MODELO",
    "Modelo Vehiculo",
    "Modelo Vehículo",
    "Mod.",
    "Modelo Veh",
  ),
  anioDesde: aliases(
    "Año Desde",
    "Anio Desde",
    "AÑO DESDE",
    "Desde",
    "Año ini.",
    "Anio ini.",
    "Año Inicio",
  ),
  anioHasta: aliases(
    "Año Hasta",
    "Anio Hasta",
    "AÑO HASTA",
    "Hasta",
    "Año fin.",
    "Anio fin.",
    "Año Fin",
  ),
  observaciones: aliases(
    "Observaciones",
    "OBS",
    "Notas",
    "Obs.",
    "Comentarios",
  ),
  codigoOem: aliases("OEM", "Cod. OEM", "Código OEM"),
  codigoBarras: aliases("Barras", "EAN", "Cod. Barras"),
};

IMPORT_DATASETS.clientes.columnMap = CLIENTES_COLUMNS;
IMPORT_DATASETS.ventas.columnMap = VENTAS_COLUMNS;
IMPORT_DATASETS.articulos.columnMap = ARTICULOS_COLUMNS;

export const COLUMN_MAPS = {
  clientes: CLIENTES_COLUMNS,
  ventas: VENTAS_COLUMNS,
  articulos: ARTICULOS_COLUMNS,
} as const;

export function getFieldLabel(fieldKey: string): string {
  return COLUMN_FIELD_LABELS[fieldKey] ?? fieldKey;
}
