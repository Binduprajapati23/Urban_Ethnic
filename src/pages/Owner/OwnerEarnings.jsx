import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
  

const API_OWNER_ORDERS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/orders`;
const ADMIN_BUSINESS_DETAILS_KEY = "admin_business_details";
const OWNER_PROFILE_META_KEY = "owner_profile_meta_v1";

const readBusinessCity = (clerkUser) => {
  const clerkCity = String(clerkUser?.unsafeMetadata?.city || clerkUser?.publicMetadata?.city || "").trim();
  if (clerkCity) return clerkCity;

  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_BUSINESS_DETAILS_KEY) || "null");
    const explicitCity = String(saved?.city || "").trim();
    if (explicitCity) return explicitCity;

    const address = String(saved?.address || "").trim();
    if (address) {
      const match = address.match(/,\s*([A-Za-z\s]+)\s*\d{5,6}\s*$/);
      if (match?.[1]) return String(match[1]).trim();

      const parts = address
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const derived = String(parts[parts.length - 1] || "").replace(/\d+/g, "").trim();
      if (derived) return derived;
    }

    const meta = JSON.parse(localStorage.getItem(OWNER_PROFILE_META_KEY) || "null");
    const metaCity = String(meta?.city || "").trim();
    return metaCity;
  } catch {
    return "";
  }
};

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const formatINR = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const parseDateLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
};

const toAmount = (order) => Number(order?.total ?? order?.amount ?? 0) || 0;

const isCompleted = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return false;
  return s !== "pending";
};

const isBuy = (type) => String(type || "").trim().toLowerCase().includes("buy");
const isRent = (type) => String(type || "").trim().toLowerCase().includes("rent");

const OwnerEarnings = () => {
  const { user } = useUser();
  const city = useMemo(() => readBusinessCity(user), [user]);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_ORDERS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.orders) ? data.orders : [];
      setOrders(rows);
    } catch (err) {
      console.log("OwnerEarnings fetch failed:", err?.message || err);
      setOrders([]);
      setError("Unable to load orders for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const computed = useMemo(() => {
    const completedOrders = orders.filter((o) => isCompleted(o?.status));
    const totalEarned = completedOrders.reduce((sum, o) => sum + toAmount(o), 0);
    const salesEarned = completedOrders.filter((o) => isBuy(o?.type)).reduce((sum, o) => sum + toAmount(o), 0);
    const rentalsEarned = completedOrders.filter((o) => isRent(o?.type)).reduce((sum, o) => sum + toAmount(o), 0);

    const monthKey = (() => {
      const first = completedOrders.find((o) => o?.date);
      const label = parseDateLabel(first?.date);
      if (label) return label;
      return new Date().toLocaleString("en-IN", { month: "short", year: "numeric" });
    })();

    const monthEarned = completedOrders
      .filter((o) => parseDateLabel(o?.date) === monthKey)
      .reduce((sum, o) => sum + toAmount(o), 0);

    const breakdownMap = new Map();
    for (const o of completedOrders) {
      const product = String(o?.product || o?.productName || o?.items?.[0]?.name || "Order").trim();
      const typeLabel = isRent(o?.type) ? "rent" : "sale";
      const key = `${product} (${typeLabel})`;
      breakdownMap.set(key, (breakdownMap.get(key) || 0) + toAmount(o));
    }

    const breakdown = Array.from(breakdownMap.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const breakdownTotal = breakdown.reduce((sum, item) => sum + item.amount, 0);

    return {
      totalEarned,
      monthEarned,
      monthKey,
      salesEarned,
      rentalsEarned,
      breakdown,
      breakdownTotal,
    };
  }, [orders]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">My Earnings</h1>
          <p className="text-sm text-black/60 mt-1">
            Revenue from your shop only{city ? ` — ${city}.` : "."}
          </p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total earned", value: computed.totalEarned, sub: "All time" },
          { title: "This month", value: computed.monthEarned, sub: computed.monthKey },
          { title: "From sales", value: computed.salesEarned, sub: "All time" },
          { title: "From rentals", value: computed.rentalsEarned, sub: "All time" },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-black/10 bg-white shadow-sm p-5"
          >
            <div className="text-xs tracking-widest uppercase text-black/45">{card.title}</div>
            <div className="text-3xl font-semibold text-black mt-3">{formatINR(card.value)}</div>
            <div className="text-sm text-black/60 mt-2">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="w-full rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="text-lg font-serif text-black">Earnings breakdown</div>
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-sm text-white/60">Loading…</div>
        ) : computed.breakdown.length === 0 ? (
          <div className="px-6 py-10 text-sm text-white/60">No earnings yet.</div>
        ) : (
          <div className="px-6 py-2">
            {computed.breakdown.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-4 border-b border-black/10">
                <div className="text-sm font-semibold text-black">{row.label}</div>
                <div className="text-sm font-semibold text-black">{formatINR(row.amount)}</div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-4 py-4">
              <div className="text-sm font-semibold text-black">Total</div>
              <div className="text-sm font-semibold text-black">{formatINR(computed.breakdownTotal)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerEarnings;
