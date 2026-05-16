type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down" | "neutral";
};

const trendStyles = {
  up: "text-emerald-400",
  down: "text-rose-400",
  neutral: "text-slate-400",
};

export function StatCard({ label, value, hint, trend = "neutral" }: StatCardProps) {
  return (
    <article className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? (
        <p className={`mt-2 text-sm ${trendStyles[trend]}`}>{hint}</p>
      ) : null}
    </article>
  );
}
