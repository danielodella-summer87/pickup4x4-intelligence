/**
 * Mapa de columnas para catálogos públicos de productos (ProtecCar y otros).
 * Reutiliza el motor de normalización de encabezados de lib/excel/column-map
 * (mismo algoritmo que usan clientes/ventas/artículos) para no duplicar lógica.
 */
import {
  matchHeaderToAliases,
  normalizeColumnName,
  sanitizeExcelHeader,
  type ColumnAliases,
  type ColumnMap,
} from "@/lib/excel/column-map";

export { sanitizeExcelHeader, normalizeColumnName, matchHeaderToAliases };
export type { ColumnAliases, ColumnMap };

export type CatalogFieldKey =
  | "sourceId"
  | "category"
  | "subcategory"
  | "brand"
  | "manufacturer"
  | "productName"
  | "vehicleBrand"
  | "vehicleModel"
  | "yearFrom"
  | "yearTo"
  | "compatibilityText"
  | "sku"
  | "price"
  | "currency"
  | "stockStatus"
  | "productUrl"
  | "mainImageUrl"
  | "description"
  | "specifications"
  | "seoTitle"
  | "metaDescription"
  | "h1"
  | "imageAlt"
  | "material"
  | "color"
  | "warranty"
  | "notes";

function aliases(...names: string[]): ColumnAliases {
  return names;
}

/** Columnas estructurales mínimas: sin ellas la fila no se puede identificar como producto. */
export const CATALOG_MINIMUM_FIELDS: readonly CatalogFieldKey[] = [
  "productName",
];

export const CATALOG_FIELD_LABELS: Record<CatalogFieldKey, string> = {
  sourceId: "ID origen",
  category: "Categoría",
  subcategory: "Subcategoría",
  brand: "Marca",
  manufacturer: "Fabricante",
  productName: "Producto",
  vehicleBrand: "Marca vehículo",
  vehicleModel: "Modelo vehículo",
  yearFrom: "Año desde",
  yearTo: "Año hasta",
  compatibilityText: "Compatibilidad",
  sku: "SKU",
  price: "Precio",
  currency: "Moneda",
  stockStatus: "Stock",
  productUrl: "URL producto",
  mainImageUrl: "Imagen principal",
  description: "Descripción",
  specifications: "Especificaciones",
  seoTitle: "SEO Title",
  metaDescription: "Meta descripción",
  h1: "H1",
  imageAlt: "Alt de imagen",
  material: "Material",
  color: "Color",
  warranty: "Garantía",
  notes: "Observaciones",
};

/**
 * Aliases genéricos de columnas habituales en catálogos públicos exportados
 * a Excel/CSV. Deliberadamente amplios (sin atarse a ProtecCar) para poder
 * reutilizarse con otros competidores, distribuidores o proveedores.
 */
export const CATALOG_COLUMNS: Record<CatalogFieldKey, ColumnAliases> = {
  sourceId: aliases("ID", "Id", "Id producto", "ID producto", "Codigo interno"),
  category: aliases(
    "Categoría",
    "Categoria",
    "CATEGORIA",
    "Rubro",
    "Category",
    "Línea",
    "Linea",
  ),
  subcategory: aliases(
    "Subcategoría",
    "Subcategoria",
    "SUBCATEGORIA",
    "Sub categoría",
    "Sub categoria",
    "Subrubro",
    "Subcategory",
  ),
  brand: aliases("Marca", "MARCA", "Brand", "Marca producto"),
  manufacturer: aliases("Fabricante", "Manufacturer", "Fabricado por"),
  productName: aliases(
    "Producto",
    "Nombre",
    "Nombre del producto",
    "Título",
    "Titulo",
    "Título producto",
    "Product Name",
    "Descripción corta",
    "Descripcion corta",
    "Artículo",
    "Articulo",
  ),
  vehicleBrand: aliases(
    "Marca vehículo",
    "Marca vehiculo",
    "Marca Vehiculo",
    "Vehicle Brand",
    "Aplicación marca",
    "Aplicacion marca",
  ),
  vehicleModel: aliases(
    "Modelo vehículo",
    "Modelo vehiculo",
    "Modelo Vehiculo",
    "Vehicle Model",
    "Aplicación modelo",
    "Aplicacion modelo",
  ),
  yearFrom: aliases("Año desde", "Anio desde", "Año Desde", "Year From", "Desde"),
  yearTo: aliases("Año hasta", "Anio hasta", "Año Hasta", "Year To", "Hasta"),
  compatibilityText: aliases(
    "Compatibilidad",
    "Aplicación",
    "Aplicacion",
    "Compatibility",
    "Aplica a",
  ),
  sku: aliases("SKU", "Código", "Codigo", "Cod.", "Referencia", "Ref.", "Code"),
  price: aliases("Precio", "Price", "Precio lista", "Precio venta"),
  currency: aliases("Moneda", "Currency", "Divisa"),
  stockStatus: aliases(
    "Stock",
    "Disponibilidad",
    "Availability",
    "Estado stock",
    "Existencia",
  ),
  productUrl: aliases("URL", "Link", "Enlace", "Product URL", "URL producto"),
  mainImageUrl: aliases(
    "Imagen",
    "Imagen principal",
    "Image",
    "Main Image",
    "Foto",
  ),
  description: aliases("Descripción", "Descripcion", "Description", "Detalle"),
  specifications: aliases(
    "Especificaciones",
    "Especificacion",
    "Specifications",
    "Ficha técnica",
    "Ficha tecnica",
  ),
  seoTitle: aliases("SEO Title", "Título SEO", "Titulo SEO", "Meta Title"),
  metaDescription: aliases(
    "Meta Description",
    "Meta descripción",
    "Meta descripcion",
  ),
  h1: aliases("H1"),
  imageAlt: aliases("Alt", "Image Alt", "Alt imagen", "Texto alternativo"),
  material: aliases("Material"),
  color: aliases("Color"),
  warranty: aliases("Garantía", "Garantia", "Warranty"),
  notes: aliases("Observaciones", "Notas", "Comentarios", "Notes"),
};

export function getCatalogFieldLabel(field: CatalogFieldKey): string {
  return CATALOG_FIELD_LABELS[field] ?? field;
}
