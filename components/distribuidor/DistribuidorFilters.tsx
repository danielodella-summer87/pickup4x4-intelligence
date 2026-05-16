"use client";

const touchInputClass =
  "min-h-[3.25rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30";

type DistribuidorFiltersProps = {
  busqueda: string;
  categoria: string;
  rubro: string;
  categorias: string[];
  rubros: string[];
  disabled?: boolean;
  onBusquedaChange: (value: string) => void;
  onCategoriaChange: (value: string) => void;
  onRubroChange: (value: string) => void;
  onLimpiar: () => void;
};

export function DistribuidorFilters({
  busqueda,
  categoria,
  rubro,
  categorias,
  rubros,
  disabled = false,
  onBusquedaChange,
  onCategoriaChange,
  onRubroChange,
  onLimpiar,
}: DistribuidorFiltersProps) {
  const hayFiltros = Boolean(busqueda || categoria || rubro);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">Filtrar accesorios</p>
        {hayFiltros ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onLimpiar}
            className="min-h-[2.75rem] rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <input
        type="search"
        disabled={disabled}
        value={busqueda}
        onChange={(e) => onBusquedaChange(e.target.value)}
        placeholder="Buscar por nombre o código…"
        className={touchInputClass}
        autoComplete="off"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Categoría
          </span>
          <select
            disabled={disabled}
            value={categoria}
            onChange={(e) => onCategoriaChange(e.target.value)}
            className={touchInputClass}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Rubro
          </span>
          <select
            disabled={disabled}
            value={rubro}
            onChange={(e) => onRubroChange(e.target.value)}
            className={touchInputClass}
          >
            <option value="">Todos los rubros</option>
            {rubros.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
