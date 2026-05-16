export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export type SideMenuItem = NavItem & {
  initial: string;
};

export const appName = "Pickup 4x4 Intelligence";

export const homeNavItem: NavItem = {
  href: "/",
  label: "Inicio",
  description: "Landing interna del sistema",
};

export const sideMenuNavigation: SideMenuItem[] = [
  {
    href: "/demo",
    label: "Demo",
    initial: "DM",
    description: "Resumen para presentación al cliente",
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    initial: "DB",
    description: "Resumen comercial y KPIs",
  },
  {
    href: "/clientes",
    label: "Clientes",
    initial: "CL",
    description: "Cuentas y cartera comercial",
  },
  {
    href: "/ventas",
    label: "Ventas",
    initial: "VT",
    description: "Diario y evolución de ventas",
  },
  {
    href: "/articulos",
    label: "Artículos",
    initial: "AR",
    description: "Catálogo y consulta de repuestos",
  },
  {
    href: "/vehiculos",
    label: "Vehículos",
    initial: "VH",
    description: "Aplicaciones por marca y modelo",
  },
  {
    href: "/distribuidor",
    label: "Distribuidor",
    initial: "DT",
    description: "Pantalla táctil para mostrador",
  },
  {
    href: "/solicitudes",
    label: "Solicitudes",
    initial: "SP",
    description: "Presupuestos pendientes",
  },
  {
    href: "/oportunidades",
    label: "Oportunidades",
    initial: "OP",
    description: "Alertas e inteligencia comercial",
  },
  {
    href: "/importar",
    label: "Importar",
    initial: "IM",
    description: "Carga controlada desde Excel/KORE",
  },
  {
    href: "/proyecto",
    label: "Proyecto",
    initial: "PR",
    description: "Presentación ejecutiva del sistema",
  },
  {
    href: "/tutorial",
    label: "Tutorial",
    initial: "TU",
    description: "Manual de uso de la plataforma",
  },
];

export const mainNavigation: NavItem[] = [
  homeNavItem,
  ...sideMenuNavigation,
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavItemByPath(pathname: string): NavItem | undefined {
  if (pathname === "/") {
    return homeNavItem;
  }

  return sideMenuNavigation.find((item) => isNavItemActive(pathname, item.href));
}
