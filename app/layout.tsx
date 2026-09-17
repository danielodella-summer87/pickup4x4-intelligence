import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CatalogAuditProvider } from "@/contexts/CatalogAuditContext";
import { DatasetProvider } from "@/contexts/DatasetContext";
import { isRequestAuthenticated } from "@/lib/auth/request-session";
import { ProspeccionProvider } from "@/contexts/ProspeccionContext";
import { SolicitudesProvider } from "@/contexts/SolicitudesContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickup 4x4 Intelligence",
  description:
    "Sistema comercial para ventas, clientes, artículos y aplicaciones 4x4",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El dataset depende de la sesión: al iniciar o cerrar sesión (router.refresh vuelve a
  // renderizar este layout) el provider recarga o limpia su estado, sin recarga manual.
  const isAuthenticated = await isRequestAuthenticated();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        {/* La key remonta el provider al cambiar la sesión: el estado del dataset se reinicia
            solo (login) y no queda nada privado en memoria (logout). */}
        <DatasetProvider key={isAuthenticated ? "session" : "anonymous"} isAuthenticated={isAuthenticated}>
          <SolicitudesProvider>
            <ProspeccionProvider>
              <CatalogAuditProvider>{children}</CatalogAuditProvider>
            </ProspeccionProvider>
          </SolicitudesProvider>
        </DatasetProvider>
      </body>
    </html>
  );
}
