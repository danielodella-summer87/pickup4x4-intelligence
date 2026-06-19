import { Suspense } from "react";
import { CampaignArticulosScreen } from "@/components/campanas/CampaignArticulosScreen";
import { LONAS_PRESET } from "@/lib/campanas/articulos-campaign";

export default function CampanasLonasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando campaña…</div>}>
      <CampaignArticulosScreen preset={LONAS_PRESET} />
    </Suspense>
  );
}
