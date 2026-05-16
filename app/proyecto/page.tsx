import { FlipHtmlEmbedPage } from "@/components/FlipHtmlEmbedPage";
import { FLIPHTML5_PROYECTO_URL } from "@/lib/fliphtml5";

export default function ProyectoPage() {
  return (
    <FlipHtmlEmbedPage
      moduleTitle="Proyecto"
      moduleDescription="Presentación ejecutiva del sistema"
      introMessage="Presentación ejecutiva del sistema Pickup 4x4 Intelligence."
      embedSrc={FLIPHTML5_PROYECTO_URL}
      embedTitle="Presentación Pickup 4x4 Intelligence"
    />
  );
}
