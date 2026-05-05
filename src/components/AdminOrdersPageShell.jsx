import { useMemo } from "react";
import { Download, Search } from "lucide-react";

const AdminOrdersPageShell = ({
  title,
  subtitle,
  stats = [],
  showFilters = true,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder = "Search order ID / customer...",
  typeFilter,
  onTypeFilterChange,
  typeOptions = [],
  statusFilter,
  onStatusFilterChange,
  statusOptions = [],
  onExportCsv,
  children,
}) => {
  const showExport = typeof onExportCsv === "function";
  const normalizedStats = useMemo(() => (Array.isArray(stats) ? stats.slice(0, 4) : []), [stats]);
  const statsGridClass =
    normalizedStats.length === 3
      ? "grid grid-cols-2 lg:grid-cols-3 gap-4"
      : normalizedStats.length === 2
        ? "grid grid-cols-2 lg:grid-cols-2 gap-4"
        : "grid grid-cols-2 lg:grid-cols-4 gap-4";

  return (
    <div className="p-6 lg:p-10 space-y-8 bg-[#f3f0f0] min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-serif text-[#111111] font-bold">{title}</h1>
          {subtitle ? <p className="text-gray-500 mt-1">{subtitle}</p> : null}
        </div>

        {showExport ? (
          <button
            type="button"
            onClick={() => onExportCsv?.()}
            className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export CSV
          </button>
        ) : null}
      </div>

      {normalizedStats.length > 0 ? (
        <div className={statsGridClass}>
          {normalizedStats.map((stat) => (
            <div
              key={stat.key || stat.label}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-[#111111]">{stat.value}</p>
              {stat.note ? <p className="mt-1 text-sm text-gray-600">{stat.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {showFilters ? (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#E6E6E6] rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#111111]"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
            />
          </div>

          <div className="flex gap-3 w-full lg:w-auto">
            {Array.isArray(typeOptions) && typeOptions.length > 0 ? (
              <select
                value={typeFilter}
                onChange={(e) => onTypeFilterChange?.(e.target.value)}
                className="flex-1 lg:w-36 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={Boolean(opt.disabled)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : null}

            {Array.isArray(statusOptions) && statusOptions.length > 0 ? (
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange?.(e.target.value)}
                className="flex-1 lg:w-40 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={Boolean(opt.disabled)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
};

export default AdminOrdersPageShell;
