import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Package, ShoppingBag, Users } from "lucide-react";
import { requestJson } from "../../utils/http";

const ADMIN_ORDERS_KEY = "admin_orders";
const ADMIN_RENTALS_KEY = "admin_rentals";
const ADMIN_PRODUCTS_KEY = "admin_products";
const ADMIN_OWNER_PROFILE_KEY = "admin_owner_profile";
const DASHBOARD_MIGRATION_KEY = "dashboard_db_migrated_v1";

const emptyMetrics = {
  totalOrders: 0,
  totalRentals: 0,
  totalRevenue: 0,
  activeProducts: 0,
  pendingOrders: 0,
  jewelleryProducts: 0,
  ethnicWearProducts: 0,
  accessoriesProducts: 0,
  totalCatalog: 0,
  buyRevenue: 0,
  rentalRevenue: 0,
};

const readLocalArray = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const readOwnerName = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_OWNER_PROFILE_KEY) || "null");
    return String(saved?.name || "Admin").trim() || "Admin";
  } catch {
    return "Admin";
  }
};

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (amount) => `\u20B9${Number(amount || 0).toLocaleString("en-IN")}`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [recentOrders, setRecentOrders] = useState([]);
  const [topCities, setTopCities] = useState({ rows: [], max: 0 });
  const [ownerName, setOwnerName] = useState(readOwnerName);
  const [error, setError] = useState("");
  const [usersCount, setUsersCount] = useState(0);
  const [ownersCount, setOwnersCount] = useState(0);
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [ownerRequestsStatus, setOwnerRequestsStatus] = useState({ loading: true, error: "" });

  const getOrderProductName = (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const names = items
      .map((item) => String(item?.name || item?.product || item?.productName || "").trim())
      .filter(Boolean);

    if (names.length === 0) {
      const fallback = String(order?.product || "").trim();
      return fallback || "—";
    }

    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1} more`;
  };

  const migrateLocalDataToDb = async () => {
    const alreadyMigrated = localStorage.getItem(DASHBOARD_MIGRATION_KEY) === "1";
    if (alreadyMigrated) return;

    const localOrders = readLocalArray(ADMIN_ORDERS_KEY);
    const localRentals = readLocalArray(ADMIN_RENTALS_KEY);
    const localProducts = readLocalArray(ADMIN_PRODUCTS_KEY);

    const tasks = [];
    if (localOrders.length > 0) {
      tasks.push(
        requestJson("http://localhost:5000/api/admin/all-orders/sync", {
          method: "POST",
          body: JSON.stringify({ orders: localOrders }),
        })
      );
    }
    if (localRentals.length > 0) {
      tasks.push(
        requestJson("http://localhost:5000/api/admin/rentals/sync", {
          method: "POST",
          body: JSON.stringify({ rentals: localRentals }),
        })
      );
    }
    if (localProducts.length > 0) {
      tasks.push(
        requestJson("http://localhost:5000/api/admin/products/sync", {
          method: "POST",
          body: JSON.stringify({ products: localProducts }),
        })
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    localStorage.setItem(DASHBOARD_MIGRATION_KEY, "1");
  };

  const fetchDashboard = async () => {
    try {
      const data = (await requestJson("http://localhost:5000/api/admin/dashboard")) || {};
      setMetrics({ ...emptyMetrics, ...(data.metrics || {}) });
      setRecentOrders(Array.isArray(data.recentOrders) ? data.recentOrders : []);
      setTopCities(data.topCities || { rows: [], max: 0 });
      setError("");
    } catch (err) {
      console.log("Failed to fetch dashboard data:", err?.body || err.message);
      setMetrics(emptyMetrics);
      setRecentOrders([]);
      setTopCities({ rows: [], max: 0 });
      setError("Unable to load dashboard data from database.");
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setOwnerName(readOwnerName());
      try {
        await migrateLocalDataToDb();
        await requestJson("http://localhost:5000/api/admin/dashboard/sync", { method: "POST", body: "{}" });
      } catch (err) {
        console.log("Dashboard migration failed:", err?.body || err.message);
      }
      await fetchDashboard();
    };

    void bootstrap();
    window.addEventListener("focus", fetchDashboard);
    return () => {
      window.removeEventListener("focus", fetchDashboard);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUsersCount = async () => {
      try {
        const data = await requestJson("http://localhost:5000/api/admin/people");
        const rows = Array.isArray(data?.people) ? data.people : [];
        const customers = rows.filter(
          (row) => String(row?.role || "").trim().toLowerCase() === "user"
        );
        if (!cancelled) setUsersCount(customers.length);
      } catch {
        if (!cancelled) setUsersCount(0);
      }
    };

    void loadUsersCount();

    window.addEventListener("focus", loadUsersCount);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadUsersCount);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOwners = async () => {
      if (!cancelled) setOwnerRequestsStatus({ loading: true, error: "" });
      try {
        const [ownersRes, requestsRes] = await Promise.allSettled([
          requestJson("http://localhost:5000/api/admin/owners"),
          requestJson("http://localhost:5000/api/admin/owners/requests"),
        ]);

        if (cancelled) return;

        if (ownersRes.status === "fulfilled") {
          const rows = Array.isArray(ownersRes.value?.owners) ? ownersRes.value.owners : [];
          setOwnersCount(rows.length);
        } else {
          setOwnersCount(0);
        }

        if (requestsRes.status === "fulfilled") {
          const rows = Array.isArray(requestsRes.value?.requests) ? requestsRes.value.requests : [];
          setOwnerRequests(rows);
          setOwnerRequestsStatus({ loading: false, error: "" });
        } else {
          setOwnerRequests([]);
          setOwnerRequestsStatus({ loading: false, error: "Failed to load owner requests" });
        }
      } catch {
        if (!cancelled) {
          setOwnersCount(0);
          setOwnerRequests([]);
          setOwnerRequestsStatus({ loading: false, error: "Failed to load owner requests" });
        }
      }
    };

    void loadOwners();
    window.addEventListener("focus", loadOwners);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadOwners);
    };
  }, []);

  const totalProducts = safeNumber(metrics.totalCatalog) || readLocalArray(ADMIN_PRODUCTS_KEY).length;
  const availableProducts = safeNumber(metrics.activeProducts);
  const buyOrdersCount = safeNumber(metrics.buyOrdersCount);
  const rentOrdersCount = safeNumber(metrics.rentOrdersCount);

  const cityLeaders = useMemo(() => {
    const rows = Array.isArray(topCities?.rows) ? topCities.rows : [];
    const max = safeNumber(topCities?.max);
    return { rows, max };
  }, [topCities]);

  const statsCards = useMemo(() => {
    const revenueLabel =
      safeNumber(metrics.totalRevenue) >= 100000
        ? `\u20B9${(safeNumber(metrics.totalRevenue) / 100000).toFixed(1)}L`
        : formatMoney(metrics.totalRevenue);

    const buyRevenueLabel = formatMoney(metrics.buyRevenue);
    const rentRevenueLabel = formatMoney(metrics.rentalRevenue);
    const totalPeopleCount = safeNumber(usersCount) + safeNumber(ownersCount);

    return [
      {
        title: "Total users",
        value: totalPeopleCount.toLocaleString("en-IN"),
        sub: `${usersCount.toLocaleString("en-IN")} customers / ${ownersCount.toLocaleString("en-IN")} owners`,
        icon: Users,
      },
      {
        title: "Total products",
        value: totalProducts ? totalProducts.toLocaleString("en-IN") : "—",
        sub: `${availableProducts.toLocaleString("en-IN")} available`,
        icon: Package,
      },
      {
        title: "Total orders",
        value: safeNumber(metrics.totalOrders).toLocaleString("en-IN"),
        sub: `${buyOrdersCount.toLocaleString("en-IN")} buy / ${rentOrdersCount.toLocaleString("en-IN")} rent`,
        icon: ShoppingBag,
      },
      {
        title: "Platform revenue",
        value: revenueLabel,
        sub: `${buyRevenueLabel} buy / ${rentRevenueLabel} rent`,
        icon: DollarSign,
      },
    ];
  }, [
    availableProducts,
    buyOrdersCount,
    metrics.buyRevenue,
    metrics.totalOrders,
    metrics.rentalRevenue,
    metrics.totalRevenue,
    ownersCount,
    totalProducts,
    rentOrdersCount,
    usersCount,
  ]);

  const approveOwner = async (request) => {
    const email = String(request?.email || "").trim().toLowerCase();
    const clerkId = String(request?.clerkId || request?.clerk_id || "").trim();
    if (!email && !clerkId) return;

    try {
      await requestJson("http://localhost:5000/api/admin/owners/approve", {
        method: "POST",
        body: JSON.stringify({ email, clerkId }),
      });

      const [ownersRes, requestsRes] = await Promise.allSettled([
        requestJson("http://localhost:5000/api/admin/owners"),
        requestJson("http://localhost:5000/api/admin/owners/requests"),
      ]);

      if (ownersRes.status === "fulfilled") {
        const rows = Array.isArray(ownersRes.value?.owners) ? ownersRes.value.owners : [];
        setOwnersCount(rows.length);
      }
      if (requestsRes.status === "fulfilled") {
        const rows = Array.isArray(requestsRes.value?.requests) ? requestsRes.value.requests : [];
        setOwnerRequests(rows);
      }
    } catch (err) {
      console.log("Owner approval failed:", err?.body || err.message);
      alert(err?.message || "Failed to approve owner.");
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#111111]">Dashboard</h1>
          <p className="text-black/60 mt-1">Platform overview — all cities, all owners, all orders.</p>
          <p className="text-black/45 text-xs mt-2">Welcome back, {ownerName}.</p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>


      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat) => (
          <div key={stat.title} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm font-semibold text-black/60">{stat.title}</div>
              <div className="h-10 w-10 rounded-xl bg-black/5 border border-black/10 inline-flex items-center justify-center">
                <stat.icon className="w-5 h-5 text-[#111111]" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-semibold text-[#111111]">{stat.value}</div>
            <div className="mt-2 text-sm text-black/60">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between gap-4">
            <div className="text-lg font-serif text-[#111111]">Recent orders</div>
            <button
              type="button"
              onClick={() => navigate("/admin/orders")}
              className="h-10 px-5 rounded-2xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition"
            >
              View all
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left border-separate border-spacing-0">
              <thead className="bg-[#111111]">
                <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                  <th scope="col" className="px-6 py-5 border-b border-white/10 text-center">
                    Customer
                  </th>
                  <th scope="col" className="px-6 py-5 border-b border-white/10 border-l border-white/10 text-center">
                    Product
                  </th>
                  <th scope="col" className="px-6 py-5 border-b border-white/10 border-l border-white/10 text-center">
                    Type
                  </th>
                  <th scope="col" className="px-6 py-5 border-b border-white/10 border-l border-white/10 text-center">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-5 border-b border-white/10 border-l border-white/10 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 bg-white">
                {recentOrders.length > 0 ? (
                  recentOrders.slice(0, 5).map((order, idx) => (
                    <tr
                      key={String(order.id || idx)}
                      className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors"
                    >
                      <td className="pl-8 pr-6 py-5 text-sm font-semibold text-[#111111]">
                        {order.customer || "Unknown"}
                      </td>
                      <td
                        className="pl-8 pr-6 py-5 text-sm font-semibold text-black/90"
                        title={getOrderProductName(order)}
                      >
                        <span className="block max-w-[240px] truncate">{getOrderProductName(order)}</span>
                      </td>
                      <td className="pl-8 pr-6 py-5">
                        <span
                          className={[
                            "inline-flex items-center px-3 py-1 rounded-full border text-xs",
                            String(order.type || "").toLowerCase().includes("rent")
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : "bg-slate-100 text-slate-700 border-slate-200",
                          ].join(" ")}
                        >
                          {String(order.type || "Buy")}
                        </span>
                      </td>
                      <td className="pl-8 pr-6 py-5 text-sm font-semibold text-[#111111]">{formatMoney(order.total)}</td>
                      <td className="pl-8 pr-6 py-5">
                        <span
                          className={[
                            "inline-flex items-center px-3 py-1 rounded-full border text-xs",
                            String(order.status || "").trim().toLowerCase() === "pending"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200",
                          ].join(" ")}
                        >
                          {String(order.status || "Pending")}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="pl-8 pr-6 py-10 text-sm text-black/60">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between gap-4">
            <div className="text-lg font-serif text-[#111111] leading-tight">
              New owner
              <br />
              requests
            </div>
            <button
              type="button"
              onClick={() => navigate("/admin/owners")}
              className="h-10 px-5 rounded-2xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition"
            >
              View all
            </button>
          </div>

          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 text-xs font-bold tracking-[0.22em] uppercase text-white/90 bg-[#111111] -mx-6 border-y border-white/10 mb-4">
              <div className="col-span-2 px-6 py-5">Name</div>
              <div className="px-6 py-5 border-l border-white/10">City</div>
            </div>

            {ownerRequests.length > 0 ? (
              <div className="space-y-4">
                {ownerRequests.slice(0, 3).map((req, idx) => (
                  <div key={String(req?.id || req?.email || idx)} className="grid grid-cols-3 items-center gap-4">
                    <div className="col-span-2">
                      <div className="text-sm font-semibold text-[#111111]">{String(req?.name || "Owner")}</div>
                      <button
                        type="button"
                        onClick={() => approveOwner(req)}
                        className="mt-2 inline-flex items-center px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                      >
                        Approve
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-black/90">{String(req?.city || "—")}</div>
                  </div>
                ))}
              </div>
            ) : ownerRequestsStatus.loading ? (
              <div className="text-sm text-black/60">Loading requests…</div>
            ) : ownerRequestsStatus.error ? (
              <div className="text-sm text-[#C14A4A]">{ownerRequestsStatus.error}</div>
            ) : (
              <div className="text-sm text-black/60">No pending requests.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
          <div className="text-lg font-serif text-[#111111]">Top cities by orders</div>
          <div className="text-xs text-black/45">Based on saved orders</div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-8">
          {cityLeaders.rows.length > 0 ? (
            cityLeaders.rows.map((row) => {
              const pct = cityLeaders.max > 0 ? Math.round((row.total / cityLeaders.max) * 100) : 0;
              return (
                <div key={row.city} className="space-y-3">
                  <div className="text-sm text-black/60">{row.city}</div>
                  <div className="text-xl font-semibold text-[#111111]">{formatMoney(row.total)}</div>
                  <div className="h-2 rounded-full bg-black/10 overflow-hidden">
                    <div className="h-full bg-black/25" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-black/60">No city data available yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
