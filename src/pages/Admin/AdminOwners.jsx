import React, { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "../../utils/http";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { downloadCsv } from "../../utils/csv";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const API_OWNERS = `${API_BASE}/api/admin/owners`;
const API_OWNER_REQUESTS = `${API_BASE}/api/admin/owners/requests`;
const API_OWNER_APPROVE = `${API_BASE}/api/admin/owners/approve`;
const API_OWNER_REJECT = `${API_BASE}/api/admin/owners/reject`;
const API_SET_STATUS = (email) =>
  `${API_BASE}/api/admin/people/${encodeURIComponent(String(email || "").trim().toLowerCase())}/status`;

const ADMIN_PRODUCTS_KEY = "admin_products";
const ADMIN_ORDERS_KEY = "admin_orders";

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const formatMoney = (amount) => `\u20B9${Number(amount || 0).toLocaleString("en-IN")}`;

const formatDayMonthYear = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const normalizeOwnerKey = (owner) => {
  const email = String(owner?.email || "").trim().toLowerCase();
  if (email) return email;
  return String(owner?.id || owner?.name || owner?.shopName || "").trim().toLowerCase();
};

const normalizeShopName = (owner) => {
  const raw =
    owner?.shopName ??
    owner?.shop ??
    owner?.storeName ??
    owner?.businessName ??
    owner?.vendorName ??
    owner?.boutiqueName;
  const label = String(raw || "").trim();
  if (label) return label;
  const name = String(owner?.name || "Owner").trim() || "Owner";
  return `${name} Shop`;
};

const normalizeOwnerName = (owner) => String(owner?.name || owner?.owner || "Owner").trim() || "Owner";

const normalizeCity = (owner) => String(owner?.city || owner?.location || owner?.businessCity || "").trim() || "-";

const normalizePhone = (owner) => String(owner?.phone || owner?.mobile || owner?.contact || "").trim() || "-";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeLabelKey = (value) => String(value || "").trim().toLowerCase();

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

const getOrderOwner = (order) => {
  const raw = order?.owner || order?.ownerName || order?.shop || order?.shopName || order?.vendor || order?.vendorName;
  const label = String(raw || "").trim();
  return label || "";
};

const getItemOwner = (item) => {
  const raw =
    item?.owner ||
    item?.ownerName ||
    item?.shop ||
    item?.shopName ||
    item?.vendor ||
    item?.vendorName ||
    item?.businessName;
  return String(raw || "").trim();
};

const getItemOwnerEmail = (item) => normalizeEmail(item?.ownerEmail ?? item?.owner_email ?? item?.email);

const AdminOwners = () => {
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [owners, setOwners] = useState([]);
  const [ownerEarningsByEmail, setOwnerEarningsByEmail] = useState({});
  const [ownerRequestsStatus, setOwnerRequestsStatus] = useState({ loading: true, error: "" });

  const [products, setProducts] = useState(() => readLocalArray(ADMIN_PRODUCTS_KEY));
  const [orders, setOrders] = useState(() => readLocalArray(ADMIN_ORDERS_KEY));
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!cancelled) setOwnerRequestsStatus({ loading: true, error: "" });
      try {
        const [ownersRes, requestsRes] = await Promise.allSettled([
          requestJson(API_OWNERS),
          requestJson(API_OWNER_REQUESTS),
        ]);

        if (cancelled) return;

        if (ownersRes.status === "fulfilled") {
          const rows = Array.isArray(ownersRes.value?.owners) ? ownersRes.value.owners : [];
          setOwners(rows);
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
          setOwners([]);
          setOwnerRequests([]);
          setOwnerRequestsStatus({ loading: false, error: "Failed to load owner requests" });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOwnerEarnings = async () => {
      const ownerRows = Array.isArray(owners) ? owners : [];
      if (ownerRows.length === 0) {
        if (!cancelled) setOwnerEarningsByEmail({});
        return;
      }

      const pairs = ownerRows
        .map((owner) => normalizeEmail(owner?.email))
        .filter(Boolean);
      const uniqueEmails = Array.from(new Set(pairs));

      const responses = await Promise.allSettled(
        uniqueEmails.map(async (email) => {
          const data = await requestJson(`${API_BASE}/api/owner/${encodeURIComponent(email)}/stats`);
          return [email, Number(data?.totalEarned || 0)];
        })
      );

      if (cancelled) return;

      const nextMap = {};
      for (const result of responses) {
        if (result.status !== "fulfilled") continue;
        const [email, earned] = result.value;
        nextMap[email] = Number.isFinite(earned) ? earned : 0;
      }

      setOwnerEarningsByEmail(nextMap);
    };

    void loadOwnerEarnings();

    return () => {
      cancelled = true;
    };
  }, [owners]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const data = await requestJson(`${API_BASE}/api/admin/products`);
        const rows = Array.isArray(data?.products) ? data.products : [];
        if (!cancelled && rows.length > 0) setProducts(rows);
      } catch {
        // fallback already loaded from localStorage
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    };

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOrders = async () => {
      try {
        const data = await requestJson(`${API_BASE}/api/admin/all-orders`);
        const rows = Array.isArray(data?.orders) ? data.orders : [];
        if (!cancelled && rows.length > 0) setOrders(rows);
      } catch {
        // fallback already loaded from localStorage
      }
    };

    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const approveOwner = useCallback(
    async (request) => {
      const email = String(request?.email || "").trim().toLowerCase();
      const clerkId = String(request?.clerkId || request?.clerk_id || "").trim();
      if (!email && !clerkId) return;

      try {
        await requestJson(API_OWNER_APPROVE, {
          method: "POST",
          body: JSON.stringify({ email, clerkId }),
        });

        const [ownersRes, requestsRes] = await Promise.allSettled([
          requestJson(API_OWNERS),
          requestJson(API_OWNER_REQUESTS),
        ]);
        if (ownersRes.status === "fulfilled") {
          setOwners(Array.isArray(ownersRes.value?.owners) ? ownersRes.value.owners : []);
        }
        if (requestsRes.status === "fulfilled") {
          setOwnerRequests(Array.isArray(requestsRes.value?.requests) ? requestsRes.value.requests : []);
        }
      } catch (err) {
        console.log("Approve owner failed:", err?.body || err.message);
        alert(err?.message || "Failed to approve owner.");
      }
    },
    []
  );

  const rejectOwner = useCallback((request) => {
    const email = String(request?.email || "").trim().toLowerCase();
    const clerkId = String(request?.clerkId || request?.clerk_id || "").trim();
    if (!email && !clerkId) return;

    (async () => {
      try {
        await requestJson(API_OWNER_REJECT, {
          method: "POST",
          body: JSON.stringify({ email, clerkId }),
        });

        const requestsRes = await requestJson(API_OWNER_REQUESTS);
        setOwnerRequests(Array.isArray(requestsRes?.requests) ? requestsRes.requests : []);
      } catch (err) {
        console.log("Reject owner failed:", err?.body || err.message);
        alert(err?.message || "Failed to reject owner.");
      }
    })();
  }, []);

  const ownersWithStats = useMemo(() => {
    const productCountsByEmail = new Map();
    const productCountsByLabel = new Map();
    for (const product of Array.isArray(products) ? products : []) {
      const ownerEmail = normalizeEmail(product?.ownerEmail ?? product?.owner_email);
      if (ownerEmail) {
        productCountsByEmail.set(ownerEmail, (productCountsByEmail.get(ownerEmail) || 0) + 1);
      }

      const ownerLabel = getProductOwner(product).trim().toLowerCase();
      if (!ownerLabel) continue;
      productCountsByLabel.set(ownerLabel, (productCountsByLabel.get(ownerLabel) || 0) + 1);
    }

    const orderCountsByEmail = new Map();
    const orderCountsByLabel = new Map();
    const earningsByEmail = new Map();
    const earningsByLabel = new Map();
    for (const order of Array.isArray(orders) ? orders : []) {
      const items = Array.isArray(order?.items) ? order.items : [];

      if (items.length > 0) {
        for (const item of items) {
          const itemOwnerEmail = getItemOwnerEmail(item);
          const itemOwnerLabel = normalizeLabelKey(getItemOwner(item));
          const qty = Number(item?.quantity || 1);
          const price = Number(item?.price ?? item?.buyPrice ?? item?.rentPrice ?? 0);
          const itemAmount = Math.max(0, (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 1));

          if (itemOwnerEmail) {
            orderCountsByEmail.set(itemOwnerEmail, (orderCountsByEmail.get(itemOwnerEmail) || 0) + 1);
            earningsByEmail.set(itemOwnerEmail, (earningsByEmail.get(itemOwnerEmail) || 0) + itemAmount);
            continue;
          }

          if (itemOwnerLabel) {
            orderCountsByLabel.set(itemOwnerLabel, (orderCountsByLabel.get(itemOwnerLabel) || 0) + 1);
            earningsByLabel.set(itemOwnerLabel, (earningsByLabel.get(itemOwnerLabel) || 0) + itemAmount);
          }
        }
        continue;
      }

      const ownerLabel = normalizeLabelKey(getOrderOwner(order));
      if (!ownerLabel) continue;
      const amount = Number(order?.total || order?.amount || 0);
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      orderCountsByLabel.set(ownerLabel, (orderCountsByLabel.get(ownerLabel) || 0) + 1);
      earningsByLabel.set(ownerLabel, (earningsByLabel.get(ownerLabel) || 0) + safeAmount);
    }

    return (Array.isArray(owners) ? owners : []).map((owner) => {
      const shopName = normalizeShopName(owner);
      const ownerName = normalizeOwnerName(owner);
      const city = normalizeCity(owner);
      const phone = normalizePhone(owner);
      const registered = owner?.createdAt || owner?.registeredAt || owner?.date || null;

      const ownerKey = normalizeOwnerKey(owner);
      const suspended = String(owner?.status || "").trim().toLowerCase() === "suspended";

      const emailKey = normalizeEmail(owner?.email);
      const labelKey = normalizeLabelKey(shopName || ownerName || "");
      const productsCount =
        (emailKey ? productCountsByEmail.get(emailKey) : 0) || productCountsByLabel.get(labelKey) || 0;
      const totalOrders =
        (emailKey ? orderCountsByEmail.get(emailKey) : 0) || orderCountsByLabel.get(labelKey) || 0;
      const totalEarnings =
        ownerEarningsByEmail[emailKey] ??
        ((emailKey ? earningsByEmail.get(emailKey) : 0) || earningsByLabel.get(labelKey) || 0);

      return {
        raw: owner,
        key: ownerKey || labelKey,
        shopName,
        ownerName,
        city,
        phone,
        registered,
        productsCount,
        totalOrders,
        totalEarnings,
        status: suspended ? "Suspended" : "Active",
      };
    });
  }, [orders, ownerEarningsByEmail, owners, products]);

  const suspendedCount = useMemo(
    () => ownersWithStats.filter((o) => String(o.status || "").toLowerCase() === "suspended").length,
    [ownersWithStats]
  );

  const stats = useMemo(
    () => [
      { key: "total", label: "Total owners", value: ownersWithStats.length.toLocaleString("en-IN") },
      {
        key: "pending",
        label: "Pending approval",
        value: ownerRequests.length.toLocaleString("en-IN"),
        note: ownerRequests.length > 0 ? "Action needed" : "",
      },
      { key: "suspended", label: "Suspended", value: suspendedCount.toLocaleString("en-IN") },
    ],
    [ownerRequests.length, ownersWithStats.length, suspendedCount]
  );

  const exportCsv = useCallback(() => {
    const rows = ownersWithStats.map((o) => [
      o.ownerName,
      o.city,
      o.phone,
      formatDayMonthYear(o.registered),
      o.productsCount,
      o.totalEarnings,
      o.status,
    ]);

    downloadCsv({
      filename: "owners.csv",
      headers: ["Owner", "City", "Phone", "Registered", "Products", "Earnings", "Status"],
      rows,
    });
  }, [ownersWithStats]);

  return (
    <AdminOrdersPageShell
      title="Owners"
      subtitle="Manage shop owners — approve new registrations, suspend, view shop details."
      stats={stats}
      showFilters={false}
      onExportCsv={exportCsv}
    >
      <div className="space-y-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="text-lg font-serif text-[#111111] font-bold">Pending approvals</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#111111]">
                <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                  <th className="text-left px-6 py-5 border-b border-white/10">Name</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">City</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Phone</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Registered</th>
                  <th className="text-right px-6 py-5 border-b border-white/10 border-l border-white/10">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ownerRequests.length > 0 ? (
                  ownerRequests.map((req, idx) => {
                    const key = String(req?.id || req?.email || req?.name || idx);
                    return (
                      <tr key={key} className="bg-white hover:bg-[#E6E6E6] transition-colors">
                        <td className="py-4 px-6 text-sm font-bold text-[#111111]">{normalizeOwnerName(req)}</td>
                        <td className="py-4 px-4 text-sm font-semibold text-[#111111]">{normalizeCity(req)}</td>
                        <td className="py-4 px-4 text-sm text-gray-700">{normalizePhone(req)}</td>
                        <td className="py-4 px-4 text-sm font-semibold text-[#111111]">
                          {formatDayMonthYear(req?.createdAt || req?.registeredAt || req?.date)}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => approveOwner(req)}
                              className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectOwner(req)}
                              className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : ownerRequestsStatus.loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                      Loading pending approvals…
                    </td>
                  </tr>
                ) : ownerRequestsStatus.error ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-[#C14A4A]">
                      {ownerRequestsStatus.error}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                      No pending approvals.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="text-lg font-serif text-[#111111] font-bold">All active owners</div>
            <div className="text-xs text-gray-500">{isLoadingProducts ? "Refreshing…" : ""}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#111111]">
                <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                  <th className="text-left px-6 py-5 border-b border-white/10">Owner</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">City</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Products</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Earnings</th>
                  <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ownersWithStats.length > 0 ? (
                  ownersWithStats.map((o) => {
                    const suspended = String(o.status || "").toLowerCase() === "suspended";
                    return (
                      <tr key={o.key} className="bg-white hover:bg-[#E6E6E6] transition-colors">
                        <td className="py-4 px-6 text-sm font-semibold text-[#111111]">{o.ownerName}</td>
                        <td className="py-4 px-4 text-sm font-semibold text-[#111111]">{o.city}</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#111111]">{o.productsCount}</td>
                        <td className="py-4 px-4 text-sm font-bold text-[#111111]">{formatMoney(o.totalEarnings)}</td>
                        <td className="py-4 px-4">
                          <span
                            className={[
                              "inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold",
                              suspended
                                ? "bg-rose-100 text-rose-700 border-rose-200"
                                : "bg-emerald-100 text-emerald-700 border-emerald-200",
                            ].join(" ")}
                          >
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                      No owners found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminOrdersPageShell>
  );
};

export default AdminOwners;
