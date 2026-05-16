import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DatasetProvider } from "@/contexts/DatasetContext";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <DatasetProvider>{children}</DatasetProvider>
      </body>
    </html>
  );
}
