import { FlipHtmlEmbedPage } from "@/components/FlipHtmlEmbedPage";
import { FLIPHTML5_TUTORIAL_URL } from "@/lib/fliphtml5";

export default function TutorialPage() {
  return (
    <FlipHtmlEmbedPage
      moduleTitle="Tutorial"
      moduleDescription="Manual de uso de la plataforma"
      introMessage="Manual de uso para operar la plataforma."
      embedSrc={FLIPHTML5_TUTORIAL_URL}
      embedTitle="Manual de uso Pickup 4x4 Intelligence"
    />
  );
}
