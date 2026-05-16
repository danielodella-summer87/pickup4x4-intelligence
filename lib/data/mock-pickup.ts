import type { Articulo, ArticuloAplicacion } from "@/lib/models/articulo";
import type { Cliente } from "@/lib/models/cliente";
import type { OportunidadComercial } from "@/lib/models/oportunidad";
import type { SolicitudPresupuesto } from "@/lib/models/solicitud";
import type { VehiculoMarca, VehiculoModelo } from "@/lib/models/vehiculo";
import type { Venta, VentaItem } from "@/lib/models/venta";

export const mockVehiculoMarcas: VehiculoMarca[] = [
  { id: "marca-toyota", nombre: "Toyota" },
  { id: "marca-ford", nombre: "Ford" },
  { id: "marca-vw", nombre: "Volkswagen" },
];

export const mockVehiculoModelos: VehiculoModelo[] = [
  { id: "modelo-hilux", marcaId: "marca-toyota", nombre: "Hilux" },
  { id: "modelo-ranger", marcaId: "marca-ford", nombre: "Ranger" },
  { id: "modelo-amarok", marcaId: "marca-vw", nombre: "Amarok" },
];

export const mockClientes: Cliente[] = [
  {
    numeroCuenta: "1042",
    razonSocial: "Repuestos del Sur S.A.",
    nombreFantasia: "Repuestos del Sur",
    zona: "Sur",
    vendedor: "Martín G.",
    estado: "activo",
    localidad: "Bahía Blanca",
    provincia: "Buenos Aires",
  },
  {
    numeroCuenta: "0881",
    razonSocial: "4x4 Patagonia",
    zona: "Sur",
    vendedor: "Laura P.",
    estado: "activo",
    localidad: "Neuquén",
    provincia: "Neuquén",
  },
  {
    numeroCuenta: "0710",
    razonSocial: "Accesorios Córdoba",
    zona: "Centro",
    vendedor: "Diego R.",
    estado: "en_seguimiento",
    localidad: "Córdoba",
    provincia: "Córdoba",
  },
  {
    numeroCuenta: "0633",
    razonSocial: "Pickup Norte",
    zona: "Norte",
    vendedor: "Martín G.",
    estado: "dormido",
    localidad: "Salta",
    provincia: "Salta",
  },
];

export const mockArticulos: Articulo[] = [
  {
    codigoUnico: "1832",
    descripcion: "Barra antivuelco cromada",
    rubro: "Protección",
    categoria: "Barras",
    marcaArticulo: "Pickup",
    stock: 42,
    precioLista: 120000,
    unidadMedida: "UN",
    activo: true,
  },
  {
    codigoUnico: "220",
    descripcion: "Estribos aluminio par",
    rubro: "Acceso",
    categoria: "Estribos",
    marcaArticulo: "AluPro",
    stock: 18,
    precioLista: 52000,
    unidadMedida: "PAR",
    activo: true,
  },
  {
    codigoUnico: "110",
    descripcion: "Lona marítima reforzada",
    rubro: "Carga",
    categoria: "Lonas",
    marcaArticulo: "CoverMax",
    stock: 65,
    precioLista: 89000,
    unidadMedida: "UN",
    activo: true,
  },
  {
    codigoUnico: "330",
    descripcion: "Spoiler trasero deportivo",
    rubro: "Estética",
    categoria: "Spoilers",
    marcaArticulo: "Street4x4",
    stock: 7,
    precioLista: 78000,
    unidadMedida: "UN",
    activo: true,
  },
];

export const mockArticuloAplicaciones: ArticuloAplicacion[] = [
  {
    codigoAplicacion: "1832-A",
    codigoUnico: "1832",
    marcaId: "marca-toyota",
    modeloId: "modelo-hilux",
    anioDesde: 2016,
    anioHasta: 2024,
  },
  {
    codigoAplicacion: "1832-B",
    codigoUnico: "1832",
    marcaId: "marca-ford",
    modeloId: "modelo-ranger",
    anioDesde: 2012,
    anioHasta: 2023,
  },
  {
    codigoAplicacion: "1832-C",
    codigoUnico: "1832",
    marcaId: "marca-vw",
    modeloId: "modelo-amarok",
    anioDesde: 2010,
    anioHasta: 2022,
  },
  {
    codigoAplicacion: "220-A",
    codigoUnico: "220",
    marcaId: "marca-ford",
    modeloId: "modelo-ranger",
    anioDesde: 2012,
    anioHasta: 2023,
  },
  {
    codigoAplicacion: "110-A",
    codigoUnico: "110",
    marcaId: "marca-toyota",
    modeloId: "modelo-hilux",
    anioDesde: 2016,
    anioHasta: 2024,
  },
];

export const mockVentas: Venta[] = [
  {
    id: "venta-001",
    numeroCuenta: "1042",
    fecha: "2026-05-14",
    tipoComprobante: "factura",
    numeroComprobante: "FA-00012450",
    importeTotal: 480000,
    vendedor: "Martín G.",
  },
  {
    id: "venta-002",
    numeroCuenta: "0881",
    fecha: "2026-05-14",
    tipoComprobante: "factura",
    numeroComprobante: "FA-00012451",
    importeTotal: 312000,
    vendedor: "Laura P.",
  },
  {
    id: "venta-003",
    numeroCuenta: "0710",
    fecha: "2026-05-13",
    tipoComprobante: "factura",
    numeroComprobante: "FA-00012440",
    importeTotal: 890000,
    vendedor: "Diego R.",
  },
];

export const mockVentaItems: VentaItem[] = [
  {
    id: "venta-item-001",
    ventaId: "venta-001",
    codigoUnico: "1832",
    codigoAplicacion: "1832-A",
    descripcion: "Barra antivuelco cromada",
    cantidad: 4,
    precioUnitario: 120000,
    importe: 480000,
  },
  {
    id: "venta-item-002",
    ventaId: "venta-002",
    codigoUnico: "220",
    codigoAplicacion: "220-A",
    descripcion: "Estribos aluminio par",
    cantidad: 6,
    precioUnitario: 52000,
    importe: 312000,
  },
  {
    id: "venta-item-003",
    ventaId: "venta-003",
    codigoUnico: "110",
    codigoAplicacion: "110-A",
    descripcion: "Lona marítima reforzada",
    cantidad: 10,
    precioUnitario: 89000,
    importe: 890000,
  },
];

export const mockSolicitudes: SolicitudPresupuesto[] = [
  {
    id: "P-24018",
    numeroCuenta: "0881",
    fecha: "2026-05-14",
    estado: "pendiente",
    items: [
      { codigoUnico: "1832", codigoAplicacion: "1832-B", cantidad: 2 },
      { codigoUnico: "220", codigoAplicacion: "220-A", cantidad: 1 },
    ],
  },
  {
    id: "P-24017",
    numeroCuenta: "1042",
    fecha: "2026-05-13",
    estado: "enviado",
    items: [{ codigoUnico: "110", codigoAplicacion: "110-A", cantidad: 5 }],
  },
];

export const mockOportunidades: OportunidadComercial[] = [
  {
    id: "opp-001",
    numeroCuenta: "0633",
    tipo: "cliente_dormido",
    prioridad: "alta",
    titulo: "Cliente sin compras recientes",
    detalle: "Sin compras en 90 días. Última venta asociada a lonas.",
    fechaDeteccion: "2026-05-14",
  },
  {
    id: "opp-002",
    numeroCuenta: "0881",
    tipo: "venta_cruzada",
    prioridad: "media",
    titulo: "Venta cruzada estribos",
    detalle: "Compra barras (1832) pero no estribos compatibles (220).",
    codigoUnico: "220",
    codigoAplicacion: "220-A",
    fechaDeteccion: "2026-05-14",
  },
  {
    id: "opp-003",
    numeroCuenta: "0710",
    tipo: "producto_impulsar",
    prioridad: "media",
    titulo: "Spoiler con stock alto",
    detalle: "SKU 330 con baja rotación y stock disponible.",
    codigoUnico: "330",
    fechaDeteccion: "2026-05-13",
  },
  {
    id: "opp-004",
    numeroCuenta: "1042",
    tipo: "recupero_cartera",
    prioridad: "alta",
    titulo: "Ticket en caída",
    detalle: "Oportunidad de bundle accesorios para recuperar volumen.",
    fechaDeteccion: "2026-05-12",
  },
];

export const mockPickupData = {
  vehiculoMarcas: mockVehiculoMarcas,
  vehiculoModelos: mockVehiculoModelos,
  clientes: mockClientes,
  articulos: mockArticulos,
  articuloAplicaciones: mockArticuloAplicaciones,
  ventas: mockVentas,
  ventaItems: mockVentaItems,
  solicitudes: mockSolicitudes,
  oportunidades: mockOportunidades,
} as const;
