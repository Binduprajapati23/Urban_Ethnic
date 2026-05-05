import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
  

const API_OWNER_REPORTS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/reports`;

const formatINR = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const toSafeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const OwnerReports = () => {
  const { user } = useUser();
  const [report, setReport] = useState({ monthly: [], maxAmount: 1, topProducts: [], updatedAt: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_REPORTS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReport({
        monthly: Array.isArray(data?.monthly) ? data.monthly : [],
        maxAmount: toSafeNumber(data?.maxAmount) || 1,
        topProducts: Array.isArray(data?.topProducts) ? data.topProducts : [],
        updatedAt: data?.updatedAt || null,
      });
    } catch (err) {
      console.log("OwnerReports fetch failed:", err?.message || err);
      setReport({ monthly: [], maxAmount: 1, topProducts: [], updatedAt: null });
      setError("Unable to load reports for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const computed = useMemo(() => {
    const monthly = (Array.isArray(report.monthly) ? report.monthly : []).map((m) => ({
      key: String(m?.key || ""),
      label: String(m?.label || ""),
      amount: toSafeNumber(m?.amount),
    }));
    const maxAmount = Math.max(1, toSafeNumber(report.maxAmount), ...monthly.map((m) => m.amount));
    const topProducts = (Array.isArray(report.topProducts) ? report.topProducts : []).map((p) => ({
      label: String(p?.label || ""),
      count: Math.max(0, Math.trunc(toSafeNumber(p?.count))),
    }));
    return { monthly, maxAmount, topProducts };
  }, [report.maxAmount, report.monthly, report.topProducts]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">Reports</h1>
          <p className="text-sm text-black/60 mt-1">Monthly performance and top products.</p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>

      </div>

      <div className="w-full max-w-4xl space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10">
            <div className="text-lg font-serif text-black">Monthly revenue</div>
          </div>

          {isLoading ? (
            <div className="px-6 py-10 text-sm text-white/60">Loading…</div>
          ) : computed.monthly.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/60">No data yet.</div>
          ) : (
            <div className="p-6">
              <div className="h-44 flex items-end justify-center gap-6 overflow-x-auto pb-1">
                {computed.monthly.map((m) => (
                  <div key={m.key} className="flex-none w-8 sm:w-10 flex flex-col items-center gap-3">
                    <div
                      className="w-full rounded-none bg-black/10 border border-black/10"
                      style={{
                        height: `${Math.max(0, Math.round((m.amount / computed.maxAmount) * 160))}px`,
                      }}
                      title={`${m.label} • ${formatINR(m.amount)}`}
                    />
                    <div className="text-xs text-black/60">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10">
            <div className="text-lg font-serif text-black">Top products</div>
          </div>

          {isLoading ? (
            <div className="px-6 py-10 text-sm text-white/60">Loading…</div>
          ) : computed.topProducts.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/60">No data yet.</div>
          ) : (
            <div className="px-6 py-2">
              {computed.topProducts.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-4 border-b border-black/10 last:border-b-0">
                  <div className="text-sm font-semibold text-black">{row.label}</div>
                  <div className="px-3 py-1 rounded-full bg-indigo-200 text-indigo-950 text-xs font-semibold">
                    {row.count} orders
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerReports;
