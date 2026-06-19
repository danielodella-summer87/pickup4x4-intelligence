import { Suspense } from "react";
import { CampaignArticulosScreen } from "@/components/campanas/CampaignArticulosScreen";

export default function CampanasArticulosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando campaña…</div>}>
      <CampaignArticulosScreen />
    </Suspense>
  );
}
