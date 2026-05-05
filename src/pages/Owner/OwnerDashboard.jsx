import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
 
import { useUser } from "@clerk/clerk-react";

const API_ORIGIN = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_OWNER_DASHBOARD = (email) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/dashboard`;
const API_OWNER_DASHBOARD_SYNC = (email) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/dashboard/sync`;
const API_OWNER_DASHBOARD_REFRESH = (email) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/dashboard/refresh`;

const formatINR = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const parseAnyDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const d = new Date(text);
  if (Number.isFinite(d.getTime())) return d;

  // Try "25 Mar 2026" style
  const normalized = text.replace(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/, "$2 $1 $3");
  const d2 = new Date(normalized);
  if (Number.isFinite(d2.getTime())) return d2;
  return null;
};

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const isCompleted = (status) => String(status || "").trim().toLowerCase() !== "pending";

const normalizeType = (type) => {
  const t = String(type || "").trim().toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("buy")) return "buy";
  return "buy";
};

const statusPill = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized === "returned") return "bg-slate-100 text-slate-700 border-slate-200";
  if (normalized === "delivered" || normalized === "approved")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-black/5 text-black/70 border-black/10";
};

const typeBadge = (type) => {
  const normalized = normalizeType(type);
  if (normalized === "rent") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

const getProductType = (product) => {
  const availabilityType = String(product?.availabilityType || "").trim().toLowerCase();
  const buy = Number(product?.buyPrice || 0) > 0;
  const rent = Number(product?.rentPrice || 0) > 0;

  if (availabilityType === "rent" || (!buy && rent)) return "rent";
  if (availabilityType === "buy" || (buy && !rent)) return "buy";
  if (availabilityType === "all" || (buy && rent)) return "both";
  return "both";
};

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useUser();

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) {
        setProducts([]);
        setOrders([]);
        setRentals([]);
        setError("Unable to load owner email.");
        return;
      }

      const refreshRes = await fetch(API_OWNER_DASHBOARD_REFRESH(ownerEmail), { method: "POST" });
      if (!refreshRes.ok) throw new Error(`HTTP ${refreshRes.status}`);
      const refreshJson = await refreshRes.json();
      const payload = refreshJson?.payload || {};
      const pRows = Array.isArray(payload?.products) ? payload.products : [];
      const oRows = Array.isArray(payload?.orders) ? payload.orders : [];
      const rRows = Array.isArray(payload?.rentals) ? payload.rentals : [];

      setProducts(pRows);
      setOrders(oRows);
      setRentals(rRows);
    } catch (err) {
      console.log("OwnerDashboard fetch failed:", err?.message || err);
      setProducts([]);
      setOrders([]);
      setRentals([]);
      setError("Unable to load data from database.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const onFocus = () => fetchAll();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchAll]);

  const displayName = useMemo(() => {
    const first = String(user?.firstName || "").trim();
    if (first) return first;
    const full = String(user?.fullName || "").trim();
    if (full) return full.split(" ")[0] || full;
    return "Owner";
  }, [user]);

  const computed = useMemo(() => {
    const rentalLogs = rentals;
    const nonDraftProducts = products.filter((p) => !p?.isDraft);
    const totalProducts = nonDraftProducts.length;
    const availableProducts = nonDraftProducts.filter((p) => Boolean(p?.inStock)).length;

      const rentedOut = nonDraftProducts.filter((p) => {
        const type = getProductType(p);
        if (type !== "rent") return false;
        return !p?.inStock;
      }).length;

      const soldOut = nonDraftProducts.filter((p) => {
        const type = getProductType(p);
        if (type === "rent") return false;
        return !p?.inStock;
      }).length;

    const now = new Date();
    const thisKey = monthKey(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = monthKey(prev);

    const thisMonthRevenue = orders
      .filter((o) => {
        if (!isCompleted(o?.status)) return false;
        const d = parseAnyDate(o?.date);
        if (!d) return false;
        return monthKey(d) === thisKey;
      })
      .reduce((sum, o) => sum + Number(o?.total ?? o?.amount ?? 0), 0);

    const lastMonthRevenue = orders
      .filter((o) => {
        if (!isCompleted(o?.status)) return false;
        const d = parseAnyDate(o?.date);
        if (!d) return false;
        return monthKey(d) === prevKey;
      })
      .reduce((sum, o) => sum + Number(o?.total ?? o?.amount ?? 0), 0);

    const pct =
      lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;
    const pctLabel =
      lastMonthRevenue > 0
        ? `${pct >= 0 ? "+" : ""}${pct}% vs last month`
        : thisMonthRevenue > 0
          ? "New this month"
          : "No revenue yet";

    const activeRentalsFromLogs = rentalLogs.filter((r) => String(r?.status || "").trim().toLowerCase() !== "returned").length;
    const activeRentalsFromOrders = orders.filter((o) => {
      const type = normalizeType(o?.type);
      if (type !== "rent") return false;
      const s = String(o?.status || "").trim().toLowerCase();
      return s !== "returned";
    }).length;
    const activeRentals = activeRentalsFromLogs || activeRentalsFromOrders;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const dueThisWeek = rentalLogs.filter((r) => {
      const s = String(r?.status || "").trim().toLowerCase();
      if (s === "returned") return false;
      const d = parseAnyDate(r?.returnDate);
      if (!d) return false;
      return d >= startOfToday && d <= endOfWeek;
    }).length;

    const recentOrders = [...orders]
      .map((o) => ({
        id: String(o?.id || o?.order_id || ""),
        customer: String(o?.customer || "Customer"),
        product: String(o?.product || o?.productName || o?.items?.[0]?.name || "Product"),
        type: String(o?.type || "Buy"),
        amount: Number(o?.total ?? o?.amount ?? 0) || 0,
        status: String(o?.status || "Pending"),
        date: o?.date,
      }))
      .sort((a, b) => {
        const da = parseAnyDate(a.date)?.getTime() || 0;
        const db = parseAnyDate(b.date)?.getTime() || 0;
        return db - da;
      })
      .slice(0, 5);

    const productSummary = {
      available: availableProducts,
      rentedOut,
      soldOut,
    };
    const productSummaryTotal = Math.max(1, availableProducts + rentedOut + soldOut);

    return {
      totalProducts,
      availableProducts,
      thisMonthRevenue,
      pctLabel,
      activeRentals,
      dueThisWeek,
      recentOrders,
      productSummary,
      productSummaryTotal,
    };
  }, [orders, products, rentals]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">Dashboard</h1>
          <p className="text-sm text-black/60 mt-1">Welcome back, {displayName}. Here&apos;s your shop overview.</p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
          <div className="text-xs tracking-widest uppercase text-black/45">Total products</div>
          <div className="text-3xl font-semibold text-black mt-3">{computed.totalProducts}</div>
          <div className="text-sm text-black/60 mt-2">{computed.availableProducts} available</div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
          <div className="text-xs tracking-widest uppercase text-black/45">This month</div>
          <div className="text-3xl font-semibold text-black mt-3">{formatINR(computed.thisMonthRevenue)}</div>
          <div className="text-sm text-black/60 mt-2">{computed.pctLabel}</div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
          <div className="text-xs tracking-widest uppercase text-black/45">Active rentals</div>
          <div className="text-3xl font-semibold text-black mt-3">{computed.activeRentals}</div>
          <div className="text-sm text-black/60 mt-2">Due this week: {computed.dueThisWeek}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between gap-4">
          <div className="text-lg font-serif text-black">Recent orders</div>
          <button
            type="button"
            onClick={() => navigate("/owner/orders")}
            className="h-10 px-5 rounded-2xl border border-black/15 bg-white text-black font-semibold hover:bg-black/5 transition"
          >
            View all
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-separate border-spacing-0">
            <thead>
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Customer
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Product
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Type
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Amount
                </th>
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-sm text-black/60">
                    Loading…
                  </td>
                </tr>
              ) : computed.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-sm text-black/60">
                    No orders yet.
                  </td>
                </tr>
              ) : (
                computed.recentOrders.map((o) => (
                  <tr
                    key={o.id}
                    className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors"
                  >
                    <td className="px-6 py-5 text-sm font-semibold text-black">{o.customer}</td>
                    <td className="px-6 py-5 text-sm font-semibold text-black/90">{o.product}</td>
                    <td className="px-6 py-5">
                      <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", typeBadge(o.type)].join(" ")}>
                        {normalizeType(o.type) === "rent" ? "Rent" : "Buy"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold text-black">{formatINR(o.amount)}</td>
                    <td className="px-6 py-5">
                      <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", statusPill(o.status)].join(" ")}>
                        {String(o.status || "Pending")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="text-lg font-serif text-black">Product status summary</div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { label: "Available", value: computed.productSummary.available },
            { label: "Rented out", value: computed.productSummary.rentedOut },
            { label: "Sold out", value: computed.productSummary.soldOut },
          ].map((item) => (
            <div key={item.label} className="space-y-3">
              <div className="text-sm text-black/60">{item.label}</div>
              <div className="text-3xl font-semibold text-black">{item.value}</div>
              <div className="h-2 rounded-full bg-black/10 border border-black/10 overflow-hidden">
                <div
                  className="h-full bg-black/20"
                  style={{ width: `${Math.round((item.value / computed.productSummaryTotal) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;
