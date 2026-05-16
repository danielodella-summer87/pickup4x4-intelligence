"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { sideMenuPdfItems, type SideMenuPdfItem } from "@/components/TutorialLink";
import {
  appName,
  homeNavItem,
  isNavItemActive,
  sideMenuNavigation,
  type SideMenuItem,
} from "@/lib/navigation";

type NavInitialProps = {
  initial: string;
  active: boolean;
};

function NavInitial({ initial, active }: NavInitialProps) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
        active
          ? "bg-emerald-500 text-slate-950"
          : "bg-slate-800 text-slate-300 group-hover:bg-slate-700 group-hover:text-white"
      }`}
    >
      {initial}
    </span>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {collapsed ? (
        <path d="M9 5l7 7-7 7" />
      ) : (
        <path d="M15 19l-7-7 7-7" />
      )}
    </svg>
  );
}

type MenuEntry =
  | { kind: "route"; item: SideMenuItem }
  | { kind: "pdf"; item: SideMenuPdfItem };

function buildMenuEntries(): MenuEntry[] {
  const entries: MenuEntry[] = [];

  for (const item of sideMenuNavigation) {
    entries.push({ kind: "route", item });
    if (item.href === "/importar") {
      for (const pdf of sideMenuPdfItems) {
        entries.push({ kind: "pdf", item: pdf });
      }
    }
  }

  return entries;
}

function SideMenuLink({
  href,
  label,
  initial,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  initial: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center rounded-lg text-sm transition-colors ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } ${
        active
          ? "bg-emerald-500/15 font-medium text-emerald-300"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <NavInitial initial={initial} active={active} />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function SideMenuPdfLink({
  href,
  label,
  initial,
  title,
  collapsed,
}: SideMenuPdfItem & { collapsed: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`group flex items-center rounded-lg text-sm transition-colors ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } text-slate-300 hover:bg-slate-800 hover:text-white`}
    >
      <NavInitial initial={initial} active={false} />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </a>
  );
}

export function SideMenu() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const menuEntries = useMemo(() => buildMenuEntries(), []);

  return (
    <>
      <nav
        aria-label="Navegación principal móvil"
        className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/80 p-2 lg:hidden"
      >
        {menuEntries.map((entry) => {
          if (entry.kind === "pdf") {
            const { item } = entry;
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={item.title}
                className="flex min-w-[3.25rem] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <NavInitial initial={item.initial} active={false} />
                <span className="max-w-[4.5rem] truncate text-[10px] font-medium">
                  {item.label}
                </span>
              </a>
            );
          }

          const { item } = entry;
          const active = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-[3.25rem] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 ${
                active
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <NavInitial initial={item.initial} active={active} />
              <span className="max-w-[4.5rem] truncate text-[10px] font-medium">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-800 bg-slate-900/80 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <div
          className={`flex border-b border-slate-800 p-3 ${
            collapsed ? "flex-col items-center gap-2" : "items-center gap-2"
          }`}
        >
          {!collapsed ? (
            <Link href={homeNavItem.href} className="min-w-0 flex-1 px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">
                Pickup 4x4
              </p>
              <p className="truncate text-sm font-semibold text-white">
                Intelligence
              </p>
            </Link>
          ) : (
            <Link
              href={homeNavItem.href}
              title={homeNavItem.label}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 text-xs font-bold text-emerald-300"
            >
              P4
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-expanded={!collapsed}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white ${
              collapsed ? "mx-auto" : ""
            }`}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex-1 space-y-1 p-2"
        >
          {menuEntries.map((entry) => {
            if (entry.kind === "pdf") {
              return (
                <SideMenuPdfLink
                  key={entry.item.href}
                  {...entry.item}
                  collapsed={collapsed}
                />
              );
            }

            const { item } = entry;
            return (
              <SideMenuLink
                key={item.href}
                href={item.href}
                label={item.label}
                initial={item.initial}
                active={isNavItemActive(pathname, item.href)}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        {!collapsed ? (
          <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
            {appName}
          </div>
        ) : null}
      </aside>
    </>
  );
}
