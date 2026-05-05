import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
  

const API_OWNER_ORDERS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/orders`;

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const normalizeOrder = (order) => {
  const id = String(order?.id || order?.order_id || "").trim();
  const customer = String(order?.customer || order?.name || "").trim() || "Customer";
  const owner = String(order?.owner || order?.ownerName || order?.shop || order?.shopName || order?.vendor || "").trim() || "—";
  const items = Array.isArray(order?.items) ? order.items : [];
  const product = String(items?.[0]?.name || order?.product || order?.productName || "").trim() || "Product";
  const type = String(order?.type || order?.mode || "").trim() || "Order";
  const date = String(order?.date || order?.created_at || "").trim() || "-";
  const total = Number(order?.total ?? order?.amount ?? 0) || 0;
  const status = String(order?.status || "Pending").trim() || "Pending";

  return { raw: order, id, customer, owner, items, product, type, date, total, status };
};

const isConfirmed = (status) => String(status || "").trim().toLowerCase() !== "pending";

const statusPill = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized === "returned") return "bg-slate-100 text-slate-700 border-slate-200";
  if (normalized === "delivered") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-black/5 text-black/70 border-black/10";
};

const typeBadge = (type) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized.includes("rent")) return "bg-sky-50 text-sky-700 border-sky-200";
  if (normalized.includes("buy")) return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-black/5 text-black/70 border-black/10";
};

const formatINR = (value) => `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;

const formatDateSimple = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB").replaceAll("/", "-");
};

const RETURN_STEPS = ["Request Sent", "Item Received", "Return Confirmed", "Returned"];

const stepIndexFromStage = (stage) => {
  const normalized = String(stage || "").trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized.includes("returned")) return 3;
  if (normalized.includes("confirm")) return 2;
  if (normalized.includes("received")) return 1;
  return 0;
};

const ReturnTimeline = ({ stage = "Request Sent" }) => {
  const activeIdx = stepIndexFromStage(stage);
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max pr-2">
        {RETURN_STEPS.map((label, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          const circleClass = done
            ? "bg-emerald-600 border-emerald-600"
            : active
              ? "bg-purple-600 border-purple-600"
              : "bg-white border-black/20";
          const textClass = done ? "text-black/80" : active ? "text-black" : "text-black/50";
          return (
            <div key={label} className="flex items-center gap-2 min-w-0">
              <span className={["h-6 w-6 rounded-full border flex items-center justify-center shadow-sm", circleClass].join(" ")}>
                <span className={["h-2.5 w-2.5 rounded-full", done || active ? "bg-white" : "bg-black/20"].join(" ")} />
              </span>
              <span className={["text-xs font-medium whitespace-nowrap", textClass].join(" ")}>{label}</span>
              {idx < RETURN_STEPS.length - 1 && (
                <span className={["h-px w-8 sm:w-12", done ? "bg-emerald-200" : "bg-black/10"].join(" ")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OwnerOrders = ({
  typeFilter = "all",
  title = "All orders",
  subtitle = "All buy and rental orders received at your shop.",
  showTabs = true,
  showTypeColumn = true,
  showOwnerColumn = false,
}) => {
  const { user } = useUser();
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const colCount = (showTypeColumn ? 7 : 6) + (showOwnerColumn ? 1 : 0);

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
      setOrders(rows.map(normalizeOrder));
    } catch (err) {
      console.log("OwnerOrders fetch failed:", err?.message || err);
      setOrders([]);
      setError("Unable to load orders for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const typeNormalized = String(typeFilter || "all").trim().toLowerCase();
  const typeFilteredOrders = useMemo(() => {
    if (typeNormalized === "buy") {
      return orders.filter((o) => String(o.type || "").toLowerCase().includes("buy"));
    }
    if (typeNormalized === "rent") {
      return orders.filter((o) => String(o.type || "").toLowerCase().includes("rent"));
    }
    return orders;
  }, [orders, typeNormalized]);

  const showRentalDashboard = typeNormalized === "rent" || String(title || "").toLowerCase().includes("rental");

  const rentalDashboardData = useMemo(() => {
    const notifications = [
      {
        id: "RR-1042",
        customerName: "Ananya Sharma",
        productName: "Emerald Silk Saree",
        rentalEndDate: "2026-03-28",
        returnReason: "Event completed",
        conditionReported: "Excellent (no stains)",
        stage: "Request Sent",
      },
      {
        id: "RR-1043",
        customerName: "Rohit Mehta",
        productName: "Midnight Blue Tuxedo Set",
        rentalEndDate: "2026-03-30",
        returnReason: "Size issue after trial",
        conditionReported: "Good (minor creases)",
        stage: "Item Received",
      },
      {
        id: "RR-1044",
        customerName: "Fatima Khan",
        productName: "Blush Pink Lehenga",
        rentalEndDate: "2026-03-27",
        returnReason: "Wedding ceremony ended",
        conditionReported: "Good (small makeup marks)",
        stage: "Return Confirmed",
      },
      {
        id: "RR-1045",
        customerName: "Karthik Iyer",
        productName: "Charcoal Bandhgala Suit",
        rentalEndDate: "2026-03-29",
        returnReason: "Returned early",
        conditionReported: "Excellent",
        stage: "Item Received",
      },
      {
        id: "RR-1046",
        customerName: "Priya Nair",
        productName: "Ivory Anarkali Gown",
        rentalEndDate: "2026-03-31",
        returnReason: "Function finished",
        conditionReported: "Fair (minor hem dirt)",
        stage: "Request Sent",
      },
    ];

    const activeRentals = [
      {
        id: "AR-2190",
        productName: "Wine Velvet Sherwani",
        customerName: "Siddharth Jain",
        rentFrom: "2026-03-24",
        dueDate: "2026-04-03",
        status: "Active",
      },
      {
        id: "AR-2191",
        productName: "Pearl White Kurta Set",
        customerName: "Neha Verma",
        rentFrom: "2026-03-26",
        dueDate: "2026-04-04",
        status: "Active",
      },
      {
        id: "AR-2192",
        productName: "Teal Sequin Saree",
        customerName: "Ishita Gupta",
        rentFrom: "2026-03-27",
        dueDate: "2026-04-05",
        status: "Active",
      },
      {
        id: "AR-2193",
        productName: "Black Nehru Jacket",
        customerName: "Aditya Rao",
        rentFrom: "2026-03-28",
        dueDate: "2026-04-06",
        status: "Active",
      },
      {
        id: "AR-2194",
        productName: "Rose Gold Gown",
        customerName: "Meera Pillai",
        rentFrom: "2026-03-29",
        dueDate: "2026-04-07",
        status: "Active",
      },
    ];

    const history = [
      {
        rentalId: "RN-88012",
        customerName: "Vikram Singh",
        product: "Navy Indo-Western Set",
        rentFrom: "2026-03-12",
        days: 4,
        amount: 2499,
        status: "Returned",
      },
      {
        rentalId: "RN-88013",
        customerName: "Riya Kapoor",
        product: "Maroon Bridal Lehenga",
        rentFrom: "2026-03-10",
        days: 6,
        amount: 6499,
        status: "Returned",
      },
      {
        rentalId: "RN-88014",
        customerName: "Arjun Malhotra",
        product: "Classic Black Tuxedo",
        rentFrom: "2026-03-14",
        days: 3,
        amount: 2999,
        status: "Approved",
      },
      {
        rentalId: "RN-88015",
        customerName: "Sneha Reddy",
        product: "Mint Green Saree",
        rentFrom: "2026-03-09",
        days: 5,
        amount: 1999,
        status: "Returned",
      },
      {
        rentalId: "RN-88016",
        customerName: "Nikhil Bose",
        product: "Beige Linen Suit",
        rentFrom: "2026-03-08",
        days: 7,
        amount: 3999,
        status: "Returned",
      },
    ];

    return { notifications, activeRentals, history };
  }, []);

  const counts = useMemo(() => {
    const all = typeFilteredOrders.length;
    const confirmed = typeFilteredOrders.filter((o) => isConfirmed(o.status)).length;
    return { all, confirmed };
  }, [typeFilteredOrders]);

  const visible = useMemo(() => {
    if (activeTab === "confirmed") {
      return typeFilteredOrders.filter((o) => isConfirmed(o.status));
    }
    return typeFilteredOrders;
  }, [activeTab, typeFilteredOrders]);

  return (
    <div className="space-y-6">
      {showRentalDashboard && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-purple-200 bg-purple-50 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-purple-200/70">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg sm:text-xl font-serif text-black">Notifications</div>
                  <p className="text-sm text-black/70 mt-1">
                    New return requests that need your action.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-200 bg-white text-xs font-semibold text-purple-700">
                  {rentalDashboardData.notifications.length} new requests
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rentalDashboardData.notifications.map((n) => (
                <div key={n.id} className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-black truncate">{n.customerName}</div>
                      <div className="text-sm text-black/70 mt-0.5 truncate">{n.productName}</div>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-700">
                      Return request
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rental end date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(n.rentalEndDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Condition reported</div>
                      <div className="text-sm font-medium text-black mt-1">{n.conditionReported}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3 sm:col-span-2">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Return reason</div>
                      <div className="text-sm font-medium text-black mt-1">{n.returnReason}</div>
                    </div>
                  </div>

                  <ReturnTimeline stage={n.stage} />

                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl border border-purple-600 bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white shadow-sm"
                    >
                      Confirm return
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-black/10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg sm:text-xl font-serif text-black">Active Rentals</div>
                  <p className="text-sm text-black/60 mt-1">Ongoing rentals that haven't been returned yet.</p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 bg-white text-xs font-semibold text-black/70">
                  {rentalDashboardData.activeRentals.length} active
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {rentalDashboardData.activeRentals.map((r) => (
                <div key={r.id} className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-black truncate">{r.productName}</div>
                      <div className="text-sm text-black/60 mt-0.5 truncate">{r.customerName}</div>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rent from</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(r.rentFrom)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Due date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(r.dueDate)}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl border border-[#111111] bg-[#111111] hover:bg-black text-sm font-semibold text-white shadow-sm"
                    >
                      Mark returned
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-black/10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg sm:text-xl font-serif text-black">Rental History</div>
                  <p className="text-sm text-black/60 mt-1">Past rentals with approvals and returns.</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-separate border-spacing-0 min-w-[980px]">
                <thead className="sticky top-0 z-10">
                  <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                    <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                      Rental ID
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Customer Name
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Product
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Rent From
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Days
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5 text-right"
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white">
                  {rentalDashboardData.history.map((h) => {
                    const normalized = String(h.status || "").trim().toLowerCase();
                    const statusClass =
                      normalized === "returned"
                        ? "bg-slate-100 text-slate-700 border-slate-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200";
                    return (
                      <tr key={h.rentalId} className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors">
                        <td className="pl-8 pr-6 py-5 font-mono text-sm text-black/70">{h.rentalId}</td>
                        <td className="pl-8 pr-6 py-5">
                          <div className="text-sm font-semibold text-black">{h.customerName}</div>
                        </td>
                        <td className="pl-8 pr-6 py-5">
                          <div className="text-sm font-medium text-black/90">{h.product}</div>
                        </td>
                        <td className="pl-8 pr-6 py-5 text-sm text-black/60 whitespace-nowrap">{formatDateSimple(h.rentFrom)}</td>
                        <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black">{h.days}</td>
                        <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black">{formatINR(h.amount)}</td>
                        <td className="pl-8 pr-6 py-5">
                          <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", statusClass].join(" ")}>
                            {h.status}
                          </span>
                        </td>
                        <td className="pl-8 pr-6 py-5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              className="px-4 py-2 rounded-xl border border-purple-600 bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white shadow-sm"
                            >
                              Action
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-serif text-black">{title}</div>
              <p className="text-sm text-black/60 mt-1">{subtitle}</p>
              {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
            </div>
          </div>

          {showTabs && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {[
                { key: "all", label: `All (${counts.all})` },
                { key: "confirmed", label: `Confirmed (${counts.confirmed})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    "px-4 py-2 rounded-xl border text-sm font-medium transition",
                    activeTab === tab.key
                      ? "bg-[#111111] border-[#111111] text-white"
                      : "bg-white border-black/10 text-black/60 hover:bg-black/5",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table
            className={[
              "w-full text-left border-separate border-spacing-0",
              showTypeColumn ? (showOwnerColumn ? "min-w-[980px]" : "min-w-[860px]") : showOwnerColumn ? "min-w-[880px]" : "min-w-[760px]",
            ].join(" ")}
          >
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Order ID
                </th>
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                >
                  Customer
                </th>
                {showOwnerColumn && (
                  <th
                    scope="col"
                    className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                  >
                    Owner
                  </th>
                )}
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                >
                  Product
                </th>
                {showTypeColumn && (
                  <th
                    scope="col"
                    className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                  >
                    Type
                  </th>
                )}
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5"
                >
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
              {isLoading ? (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-sm text-black/60">
                    Loading orders...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-6 py-10 text-sm text-black/60">
                    No orders found.
                  </td>
                </tr>
              ) : (
                visible.map((order) => {
                  return (
                    <tr key={order.id} className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors">
                      <td className="pl-8 pr-6 py-5 font-mono text-sm text-black/70">{order.id || "-"}</td>
                      <td className="pl-8 pr-6 py-5">
                        <div className="text-sm font-semibold text-black">{order.customer}</div>
                      </td>
                      {showOwnerColumn && (
                        <td className="pl-8 pr-6 py-5">
                          <div className="text-sm font-medium text-black/90">{order.owner || "—"}</div>
                        </td>
                      )}
                      <td className="pl-8 pr-6 py-5">
                        <div className="text-sm font-medium text-black/90">{order.product}</div>
                      </td>
                      {showTypeColumn && (
                        <td className="pl-8 pr-6 py-5">
                          <span
                            className={[
                              "inline-flex items-center px-3 py-1 rounded-full border text-xs",
                              typeBadge(order.type),
                            ].join(" ")}
                          >
                            {String(order.type || "Order").trim() || "Order"}
                          </span>
                        </td>
                      )}
                      <td className="pl-8 pr-6 py-5 text-sm text-black/60 whitespace-nowrap">{formatDateSimple(order.date)}</td>
                      <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black">{formatINR(order.total)}</td>
                      <td className="pl-8 pr-6 py-5">
                        <span
                          className={[
                            "inline-flex items-center px-3 py-1 rounded-full border text-xs",
                            statusPill(order.status),
                          ].join(" ")}
                        >
                          {String(order.status || "Pending").trim() || "Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OwnerOrders;
