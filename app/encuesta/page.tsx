import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Encuesta · Pickup 4x4" };

// Encuesta principal de esta etapa. /encuesta redirige siempre acá — resuelto
// sin Supabase para no depender de qué otra investigación esté "activa" en
// un momento dado (puede haber más de una activa a la vez, p.ej. campañas
// de Calidad/Postventa en paralelo). Si en el futuro hace falta elegir la
// encuesta principal dinámicamente, esto se puede volver a leer de la DB.
const SLUG_ENCUESTA_PRINCIPAL = "estado-mercado-4x4";

export default function EncuestaIndexPage() {
  redirect(`/encuesta/${SLUG_ENCUESTA_PRINCIPAL}`);
}
