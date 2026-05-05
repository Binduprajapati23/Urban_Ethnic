import React, { useEffect, useMemo, useState } from "react";
import { requestJson } from "../../utils/http";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { readPlatformConfig } from "../../utils/adminConfig";
import { downloadCsv } from "../../utils/csv";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const API_ALL_ORDERS = `${API_BASE}/api/admin/all-orders`;
const API_BUY_ORDERS = `${API_BASE}/api/admin/buy-orders`;
const API_RENTALS = `${API_BASE}/api/admin/rentals`;
const API_PRODUCTS = `${API_BASE}/api/admin/products`;
const API_OWNERS = `${API_BASE}/api/admin/owners`;
const API_MONTHLY_REVENUE = `${API_BASE}/api/admin/revenue/monthly?months=6`;

const formatINR = (value) => `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;

const formatINRShort = (value) => {
  const amount = Math.max(0, Number(value || 0));
  if (!Number.isFinite(amount)) return "\u20B90";
  if (amount >= 1e7) return `\u20B9${(amount / 1e7).toFixed(1)}Cr`;
  if (amount >= 1e5) return `\u20B9${(amount / 1e5).toFixed(1)}L`;
  if (amount >= 1e3) return `\u20B9${(amount / 1e3).toFixed(1)}k`;
  return `\u20B9${amount.toLocaleString("en-IN")}`;
};

const getEntityId = (value) => {
  const raw = value?.id ?? value?._id ?? value?.productId ?? value?.product_id ?? value?.order_id ?? value?.orderId;
  const id = String(raw || "").trim();
  return id || "";
};

const normalizeOwnerEmail = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
};

const getProductOwner = (product) => {
  const raw =
    product?.ownerName ??
    product?.owner ??
    product?.shopName ??
    product?.sellerName ??
    product?.vendorName ??
    product?.businessName ??
    product?.ownerEmail ??
    product?.owner_email;
  const label = String(raw || "").trim();
  return label || "Owner";
};

const getProductCity = (product) => {
  const direct = String(product?.city || product?.businessCity || product?.ownerCity || "").trim();
  if (direct) return direct;
  const address = String(product?.address || product?.businessAddress || "").trim();
  if (!address) return "";
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last.replace(/\d+/g, "").trim();
};

const getOrderOwner = (order) => {
  const raw =
    order?.owner ||
    order?.ownerName ||
    order?.shop ||
    order?.shopName ||
    order?.vendor ||
    order?.vendorName ||
    order?.sellerName ||
    order?.ownerEmail ||
    order?.owner_email;
  const direct = String(raw || "").trim();
  if (direct) return direct;

  const items = Array.isArray(order?.items) ? order.items : [];
  const itemOwner =
    items?.[0]?.owner ||
    items?.[0]?.ownerName ||
    items?.[0]?.shop ||
    items?.[0]?.shopName ||
    items?.[0]?.vendor ||
    items?.[0]?.vendorName ||
    items?.[0]?.ownerEmail ||
    items?.[0]?.owner_email;
  return String(itemOwner || "").trim();
};

const getItemOwnerLabel = (item) => {
  const raw =
    item?.owner ||
    item?.ownerName ||
    item?.shop ||
    item?.shopName ||
    item?.vendor ||
    item?.vendorName ||
    item?.sellerName ||
    item?.businessName ||
    item?.ownerEmail ||
    item?.owner_email;
  return String(raw || "").trim();
};

const getOrderDate = (order) => {
  const raw = order?.date || order?.created_at || order?.createdAt || order?.createdAtIso || "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeOrderType = (order) => {
  const text = String(order?.type || "").trim().toLowerCase();
  if (text) return text;
  return Number(order?.amount ?? order?.total ?? 0) > 0 ? "buy" : "rent";
};

const splitOrderGMV = (order) => {
  const total = Math.max(0, Number(order?.total ?? order?.amount ?? 0));
  const type = normalizeOrderType(order);

  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length > 0) {
    let buy = 0;
    let rent = 0;
    for (const item of items) {
      const mode = String(item?.mode || item?.type || "buy").trim().toLowerCase();
      const qty = Math.max(1, Number(item?.quantity || 1));
      const price = Math.max(0, Number(item?.price || 0));
      const line = qty * price;
      if (mode.includes("rent")) rent += line;
      else buy += line;
    }

    if (buy + rent > 0) return { buy, rent, total: buy + rent };
  }

  if (type === "rent" || type.includes("rental")) return { buy: 0, rent: total, total };
  if (type === "buy") return { buy: total, rent: 0, total };
  if (type === "mixed") return { buy: total, rent: 0, total };
  return { buy: total, rent: 0, total };
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date) => date.toLocaleDateString("en-IN", { month: "short" });

const monthYearLabel = (date) => date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

const parseMonthKeyToDate = (value) => {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [yText, mText] = raw.split("-");
  const y = Number(yText);
  const m = Number(mText);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
};

const AdminRevenue = () => {
  const [orders, setOrders] = useState([]);
  const [buyOrders, setBuyOrders] = useState([]);
  const [rentalOrders, setRentalOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [owners, setOwners] = useState([]);
  const [monthlySeries, setMonthlySeries] = useState([]);
  const [platformConfig, setPlatformConfig] = useState(() => readPlatformConfig());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");

      try {
        const [ordersRes, buyOrdersRes, rentalsRes, productsRes, ownersRes, monthlyRes] = await Promise.allSettled([
          requestJson(API_ALL_ORDERS),
          requestJson(API_BUY_ORDERS),
          requestJson(API_RENTALS),
          requestJson(API_PRODUCTS),
          requestJson(API_OWNERS),
          requestJson(API_MONTHLY_REVENUE),
        ]);

        if (!cancelled) {
          if (ordersRes.status === "fulfilled") {
            const rows = Array.isArray(ordersRes.value?.orders) ? ordersRes.value.orders : [];
            setOrders(rows);
          }
          if (buyOrdersRes.status === "fulfilled") {
            const rows = Array.isArray(buyOrdersRes.value?.orders) ? buyOrdersRes.value.orders : [];
            setBuyOrders(rows);
          }
          if (rentalsRes.status === "fulfilled") {
            const rows = Array.isArray(rentalsRes.value?.rentals) ? rentalsRes.value.rentals : [];
            setRentalOrders(rows);
          }
          if (productsRes.status === "fulfilled") {
            const rows = Array.isArray(productsRes.value?.products) ? productsRes.value.products : [];
            setProducts(rows);
          }
          if (ownersRes.status === "fulfilled") {
            const rows = Array.isArray(ownersRes.value?.owners) ? ownersRes.value.owners : [];
            setOwners(rows);
          }

          if (monthlyRes.status === "fulfilled") {
            const rows = Array.isArray(monthlyRes.value?.series) ? monthlyRes.value.series : [];
            setMonthlySeries(rows);
          } else {
            setMonthlySeries([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.log("Revenue load failed:", err?.body || err.message);
          setError("Unable to load revenue data from database.");
          setMonthlySeries([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "admin_platform_config_v1") setPlatformConfig(readPlatformConfig());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const ownerCityIndex = useMemo(() => {
    const index = new Map();

    for (const owner of Array.isArray(owners) ? owners : []) {
      const email = normalizeOwnerEmail(owner?.email || owner?.ownerEmail || owner?.owner_email);
      const label = String(owner?.shopName || owner?.shop || owner?.businessName || owner?.name || "").trim();
      const keyLabel = label ? label.toLowerCase() : "";
      const city = String(owner?.city || "").trim();
      if (!city) continue;
      if (email) index.set(email, city);
      if (keyLabel && keyLabel !== "owner") index.set(keyLabel, city);
    }

    const counts = new Map();
    for (const product of Array.isArray(products) ? products : []) {
      const owner = getProductOwner(product).trim();
      if (!owner) continue;
      const key = owner.toLowerCase();
      if (key === "owner") continue;
      const city = getProductCity(product).trim();
      if (!city) continue;
      if (!counts.has(key)) counts.set(key, new Map());
      const inner = counts.get(key);
      inner.set(city, (inner.get(city) || 0) + 1);
    }

    for (const [ownerKey, cityCounts] of counts.entries()) {
      if (index.has(ownerKey)) continue;
      let best = "";
      let bestCount = -1;
      for (const [city, c] of cityCounts.entries()) {
        if (c > bestCount) {
          best = city;
          bestCount = c;
        }
      }
      if (best) index.set(ownerKey, best);
    }

    return index;
  }, [owners, products]);

  const ownerNameIndex = useMemo(() => {
    const index = new Map();
    for (const owner of Array.isArray(owners) ? owners : []) {
      const email = normalizeOwnerEmail(owner?.email || owner?.ownerEmail || owner?.owner_email);
      const name = String(owner?.name || owner?.shopName || owner?.shop || owner?.businessName || "").trim();
      if (email && name) index.set(email, name);
      if (name) {
        const key = name.toLowerCase();
        if (key && key !== "owner") index.set(key, name);
      }
    }
    return index;
  }, [owners]);

  const commissionRatePct = Number(platformConfig?.commissionRatePct || 10);

  const aggregates = useMemo(() => {
    const resolveOwnerIdentity = ({ email, label }) => {
      const normalizedEmail = normalizeOwnerEmail(email || label);
      const normalizedLabel = String(label || "").trim();
      const key = normalizedEmail || normalizedLabel.toLowerCase();
      const display = ownerNameIndex.get(key) || normalizedLabel || normalizedEmail || "";
      return { key, display };
    };

    const productOwnerById = new Map();
    const productOwnerByName = new Map();
    for (const product of Array.isArray(products) ? products : []) {
      const productId = getEntityId(product);
      const productEmail = normalizeOwnerEmail(product?.ownerEmail || product?.owner_email);
      const productOwnerRaw = getProductOwner(product).trim();
      const identity = resolveOwnerIdentity({ email: productEmail, label: productOwnerRaw });
      if (productId && identity.key) productOwnerById.set(productId.toLowerCase(), identity);

      const nameKey = String(product?.name || "").trim().toLowerCase();
      if (!nameKey) continue;
      if (!identity.key) continue;
      productOwnerByName.set(nameKey, identity);
    }

    let totalGMV = 0;
    let totalSales = 0;
    let totalRentals = 0;

    const now = new Date();
    const nowKey = monthKey(now);
    let thisMonthGMV = 0;

    const monthTotals = new Map();
    const byOwner = new Map();

    const seedOwner = ({ email, label }) => {
      const identity = resolveOwnerIdentity({ email, label });
      if (!identity.key || identity.key === "owner") return;
      if (!byOwner.has(identity.key)) byOwner.set(identity.key, { owner: identity.display || identity.key, orders: 0, gmv: 0 });
    };

    for (const owner of Array.isArray(owners) ? owners : []) {
      seedOwner({ email: owner?.email, label: owner?.name || owner?.shopName || owner?.shop || owner?.businessName });
    }
    for (const product of Array.isArray(products) ? products : []) {
      seedOwner({ email: product?.ownerEmail || product?.owner_email, label: getProductOwner(product) });
    }

    const allOrdersRows = Array.isArray(orders) ? orders : [];
    const buyRows = Array.isArray(buyOrders) ? buyOrders : [];
    const rentRows = Array.isArray(rentalOrders) ? rentalOrders : [];

    const rentalNetByOrderId = new Map();
    for (const rental of rentRows) {
      const orderId = String(rental?.order_id || rental?.orderId || rental?.id || "").trim();
      if (!orderId) continue;
      const amount = Math.max(0, Number(rental?.amount ?? rental?.total ?? 0));
      const depositRaw = Math.max(0, Number(rental?.deposit ?? rental?.securityDeposit ?? 0));
      const dailyRate = Math.max(0, Number(rental?.dailyRate ?? rental?.daily_rate ?? 0));
      const totalDays = Math.max(0, Number(rental?.totalDays ?? rental?.total_days ?? 0));

      let deposit = depositRaw;
      if (deposit <= 0 && dailyRate > 0 && totalDays > 0) {
        const rentFee = dailyRate * totalDays;
        deposit = Math.max(0, amount - rentFee);
      }
      if (deposit <= 0 && amount > 5000) deposit = 5000;

      const rentNet = Math.max(0, amount - deposit);
      rentalNetByOrderId.set(orderId, { amount, deposit, rentNet });
    }

    // Prefer consolidated all-orders to avoid duplicate counting.
    // Fallback to buy + rent only when all-orders is empty.
    const allOrdersForRevenue =
      allOrdersRows.length > 0
        ? allOrdersRows
        : [
            ...buyRows.map((o) => ({ ...o, type: "buy" })),
            ...rentRows.map((o) => ({ ...o, type: "rent" })),
          ];

    for (const order of allOrdersForRevenue) {
      const baseSplit = splitOrderGMV(order);
      const orderId = String(order?.id || order?.order_id || order?.orderId || "").trim();
      const items = Array.isArray(order?.items) ? order.items : [];

      let rent = baseSplit.rent;
      const rentalMeta = orderId ? rentalNetByOrderId.get(orderId) : null;
      if (rentalMeta) {
        rent = rentalMeta.rentNet;
      } else {
        const type = normalizeOrderType(order);
        if (type.includes("rent")) {
          const rawTotal = Math.max(0, Number(order?.total ?? order?.amount ?? 0));
          const assumedDeposit = rawTotal > 5000 ? 5000 : 0;
          rent = Math.max(0, rawTotal - assumedDeposit);
        }
      }

      const buy = baseSplit.buy;
      const total = buy + rent;

      totalGMV += total;
      totalSales += buy;
      totalRentals += rent;

      const d = getOrderDate(order);
      const mk = d ? monthKey(d) : nowKey;
      monthTotals.set(mk, (monthTotals.get(mk) || 0) + total);
      if (mk === nowKey) thisMonthGMV += total;

      const rawOrderTotal = total;

      if (items.length > 0) {
        const perOwnerLines = new Map();
        let linesTotal = 0;

        for (const item of items) {
          const qty = Math.max(1, Number(item?.quantity || 1));
          const priceCandidate =
            item?.price ??
            item?.amount ??
            item?.total ??
            item?.buyPrice ??
            item?.rentPrice ??
            item?.buy_price ??
            item?.rent_price ??
            0;
          const price = Math.max(0, Number(priceCandidate || 0));
          const lineTotal = qty * price;

          let resolved = null;

          const itemOwnerEmail = normalizeOwnerEmail(
            item?.ownerEmail ?? item?.owner_email ?? item?.email ?? item?.owner?.email ?? item?.owner?.ownerEmail
          );
          const itemOwnerLabel = String(getItemOwnerLabel(item) || "").trim();
          if (itemOwnerEmail || itemOwnerLabel) {
            resolved = resolveOwnerIdentity({ email: itemOwnerEmail, label: itemOwnerLabel });
          }

          if (!resolved?.key) {
            const itemId = getEntityId(item);
            const idKey = itemId ? itemId.toLowerCase() : "";
            if (idKey && productOwnerById.has(idKey)) resolved = productOwnerById.get(idKey);
          }
          if (!resolved?.key) {
            const itemNameKey = String(item?.name || "").trim().toLowerCase();
            if (itemNameKey && productOwnerByName.has(itemNameKey)) resolved = productOwnerByName.get(itemNameKey);
          }

          const ownerKey = resolved?.key || "unknown";
          const ownerDisplay = resolved?.display || ownerNameIndex.get(ownerKey) || (resolved?.key || "Unknown");
          const bucket = perOwnerLines.get(ownerKey) || { owner: ownerDisplay || "Unknown", total: 0 };
          bucket.total += lineTotal;
          perOwnerLines.set(ownerKey, bucket);
          linesTotal += lineTotal;
        }

        if (perOwnerLines.size > 0) {
          if (rawOrderTotal > 0 && linesTotal > 0 && Number.isFinite(rawOrderTotal / linesTotal)) {
            const scale = rawOrderTotal / linesTotal;
            for (const [ownerKey, bucket] of perOwnerLines.entries()) {
              const entry = byOwner.get(ownerKey) || { owner: bucket.owner, orders: 0, gmv: 0 };
              entry.orders += 1;
              entry.gmv += bucket.total * scale;
              byOwner.set(ownerKey, entry);
            }
          } else if (rawOrderTotal > 0) {
            const share = rawOrderTotal / perOwnerLines.size;
            for (const [ownerKey, bucket] of perOwnerLines.entries()) {
              const entry = byOwner.get(ownerKey) || { owner: bucket.owner, orders: 0, gmv: 0 };
              entry.orders += 1;
              entry.gmv += share;
              byOwner.set(ownerKey, entry);
            }
          } else {
            for (const [ownerKey, bucket] of perOwnerLines.entries()) {
              const entry = byOwner.get(ownerKey) || { owner: bucket.owner, orders: 0, gmv: 0 };
              entry.orders += 1;
              byOwner.set(ownerKey, entry);
            }
          }
        } else {
          const ownerLabel = getOrderOwner(order);
          const identity = resolveOwnerIdentity({ label: ownerLabel });
          const ownerKey = identity.key || "unknown";
          const entry = byOwner.get(ownerKey) || { owner: identity.display || ownerKey || "Unknown", orders: 0, gmv: 0 };
          entry.orders += 1;
          entry.gmv += total;
          byOwner.set(ownerKey, entry);
        }
      } else {
        let ownerLabel = getOrderOwner(order);
        if (!ownerLabel) {
          const firstName = String(items?.[0]?.name || "").trim().toLowerCase();
          if (firstName && productOwnerByName.has(firstName)) ownerLabel = productOwnerByName.get(firstName)?.display;
        }
        const identity = resolveOwnerIdentity({ label: ownerLabel });
        const ownerKey = identity.key || "unknown";
        const entry = byOwner.get(ownerKey) || { owner: identity.display || ownerKey || "Unknown", orders: 0, gmv: 0 };
        entry.orders += 1;
        entry.gmv += total;
        byOwner.set(ownerKey, entry);
      }
    }

    const monthlyApiTotals = new Map();
    for (const pt of Array.isArray(monthlySeries) ? monthlySeries : []) {
      const key = String(pt?.key || "").trim();
      if (!key) continue;
      monthlyApiTotals.set(key, Math.max(0, Number(pt?.total || 0)));
    }

    const knownMonthKeys = new Set([
      ...Array.from(monthTotals.keys()),
      ...Array.from(monthlyApiTotals.keys()),
    ]);
    let chartAnchorDate = now;
    for (const mk of knownMonthKeys) {
      const d = parseMonthKeyToDate(mk);
      if (!d) continue;
      if (d.getTime() > chartAnchorDate.getTime()) chartAnchorDate = d;
    }

    const last6Months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(chartAnchorDate.getFullYear(), chartAnchorDate.getMonth() - i, 1);
      const mk = monthKey(d);
      const apiTotal = monthlyApiTotals.get(mk);
      const localTotal = Math.max(0, Number(monthTotals.get(mk) || 0));
      // Prefer API totals, but fall back to computed totals when API returns empty/zero.
      const total = Number.isFinite(apiTotal) && apiTotal > 0 ? apiTotal : localTotal;
      last6Months.push({ key: mk, label: monthLabel(d), total });
    }

    const ownerRows = Array.from(byOwner.entries())
      .filter(([, row]) => row.owner && row.owner !== "Unknown" && String(row.owner).trim().toLowerCase() !== "owner")
      .map(([ownerKey, row]) => {
        const city =
          ownerCityIndex.get(ownerKey) ||
          ownerCityIndex.get(String(row.owner || "").trim().toLowerCase()) ||
          "-";
        const commission = Math.round((row.gmv * commissionRatePct) / 100);
        return { ownerKey, owner: row.owner, city, orders: row.orders, gmv: row.gmv, commission };
      })
      .sort((a, b) => (b.gmv || 0) - (a.gmv || 0) || String(a.owner).localeCompare(String(b.owner)));

    return {
      totalGMV,
      thisMonthGMV,
      totalSales,
      totalRentals,
      last6Months,
      ownerRows,
      nowLabel: monthYearLabel(now),
    };
  }, [buyOrders, commissionRatePct, monthlySeries, orders, ownerCityIndex, ownerNameIndex, owners, products, rentalOrders]);

  const stats = useMemo(
    () => [
      { key: "total", label: "Total GMV", value: formatINRShort(aggregates.totalGMV), note: "All time" },
      { key: "month", label: "This month", value: formatINRShort(aggregates.thisMonthGMV), note: aggregates.nowLabel },
      { key: "sales", label: "From sales", value: formatINRShort(aggregates.totalSales), note: "All time" },
      { key: "rentals", label: "From rentals", value: formatINRShort(aggregates.totalRentals), note: "All time" },
    ],
    [aggregates]
  );

  const chartMax = useMemo(() => {
    let max = 0;
    for (const pt of aggregates.last6Months) max = Math.max(max, Number(pt.total || 0));
    return max || 1;
  }, [aggregates.last6Months]);

  const exportCsv = () => {
    const headers = ["Owner", "City", "Orders", "GMV", `Commission (${commissionRatePct}%)`];
    const rows = (aggregates.ownerRows || []).map((row) => [
      String(row.owner || ""),
      String(row.city || ""),
      Number(row.orders || 0),
      Math.round(Number(row.gmv || 0)),
      Math.round(Number(row.commission || 0)),
    ]);

    downloadCsv({
      filename: "revenue-by-owner.csv",
      headers,
      rows,
    });
  };

  return (
    <AdminOrdersPageShell
      title="Revenue"
      subtitle="Platform-wide earnings — total GMV and commission across all owners."
      stats={stats}
      showFilters={false}
      searchQuery=""
      onSearchQueryChange={() => {}}
      onExportCsv={exportCsv}
    >
      {error ? <div className="text-sm text-amber-700">{error}</div> : null}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="text-lg font-serif text-[#111111] font-bold">Revenue by owner</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111111]">
              <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                <th className="text-left px-6 py-3 border-b border-white/10">Owner</th>
                <th className="text-left px-4 py-3 border-b border-white/10 border-l border-white/10">City</th>
                <th className="text-left px-4 py-3 border-b border-white/10 border-l border-white/10">Orders</th>
                <th className="text-left px-4 py-3 border-b border-white/10 border-l border-white/10">GMV</th>
                <th className="text-left px-4 py-3 border-b border-white/10 border-l border-white/10">
                  <span className="leading-tight">Commission</span>
                  <span className="block text-[9px] font-bold text-white/70 normal-case tracking-normal mt-0.5">
                    ({commissionRatePct}%)
                  </span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                    Loading revenue...
                  </td>
                </tr>
              ) : aggregates.ownerRows.length > 0 ? (
                aggregates.ownerRows.map((row) => (
                  <tr key={row.ownerKey} className="bg-white hover:bg-[#E6E6E6] transition-colors">
                    <td className="py-4 px-6 text-sm font-bold text-[#111111]">{row.owner}</td>
                    <td className="py-4 px-4 text-sm font-semibold text-[#111111]">{row.city}</td>
                    <td className="py-4 px-4 text-sm font-bold text-[#111111]">{row.orders}</td>
                    <td className="py-4 px-4 text-sm font-bold text-[#111111]">{formatINR(row.gmv)}</td>
                    <td className="py-4 px-4 text-sm font-bold text-[#111111]">{formatINR(row.commission)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                    No revenue data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOrdersPageShell>
  );
};

export default AdminRevenue;
