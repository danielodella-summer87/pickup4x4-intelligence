"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SideMenu } from "@/components/SideMenu";
import { getNavItemByPath } from "@/lib/navigation";

type AppShellProps = {
  children: ReactNode;
  moduleTitle?: string;
  moduleDescription?: string;
};

export function AppShell({
  children,
  moduleTitle,
  moduleDescription,
}: AppShellProps) {
  const pathname = usePathname();
  const current = getNavItemByPath(pathname);
  const title = moduleTitle ?? current?.label ?? "Módulo";
  const description =
    moduleDescription ?? current?.description ?? "Sistema comercial Pickup 4x4";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
      <SideMenu />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-800 bg-slate-900/50 px-4 py-4 sm:px-6">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Módulo activo
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
