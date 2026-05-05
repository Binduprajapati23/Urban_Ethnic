import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  Package,
  Truck,
  CheckCircle,
  Clock,
  X,
} from "lucide-react";
import { requestJson } from "../../utils/http";
import { syncUserOrderStatusByEmail } from "../../utils/orderHistory";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { downloadCsv } from "../../utils/csv";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_ORDERS_KEY = "admin_orders";
const ALL_ORDERS_MIGRATION_KEY = "all_orders_db_migrated_v1";

const statusConfig = {
  Pending: { color: "text-amber-700", icon: Clock, bg: "bg-amber-100" },
  Approved: { color: "text-blue-700", icon: Package, bg: "bg-blue-100" },
  Delivered: { color: "text-emerald-700", icon: CheckCircle, bg: "bg-emerald-100" },
  Returned: { color: "text-[#111111]", icon: Truck, bg: "bg-[#E6E6E6]" },
};

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    void requestJson(`${API_BASE}/api/admin/notifications/mark-read`, {
      method: "POST",
      body: JSON.stringify({ types: ["new_buy_order", "new_rental_order"] }),
    });
  }, []);

  const readLegacyOrders = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMIN_ORDERS_KEY) || "null");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }, []);

  const migrateLegacyOrdersToDatabase = useCallback(async () => {
    const alreadyMigrated = localStorage.getItem(ALL_ORDERS_MIGRATION_KEY) === "1";
    if (alreadyMigrated) return;

    const legacyOrders = readLegacyOrders();
    if (legacyOrders.length === 0) {
      localStorage.setItem(ALL_ORDERS_MIGRATION_KEY, "1");
      return;
    }

    try {
      await requestJson("http://localhost:5000/api/admin/all-orders/sync", {
        method: "POST",
        body: JSON.stringify({ orders: legacyOrders }),
      });
      localStorage.setItem(ALL_ORDERS_MIGRATION_KEY, "1");
    } catch (err) {
      console.log("All orders migration failed:", err?.body || err.message);
    }
  }, [readLegacyOrders]);

  const fetchAllOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await requestJson("http://localhost:5000/api/admin/all-orders");
      const serverOrders = Array.isArray(data?.orders) ? data.orders : [];
      setOrders(serverOrders);
    } catch (err) {
      console.log("Failed to fetch all orders:", err?.body || err.message);
      setError("Unable to load orders from database.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await migrateLegacyOrdersToDatabase();
      await fetchAllOrders();
    };
    bootstrap();
  }, [fetchAllOrders, migrateLegacyOrdersToDatabase]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const orderIdText = String(order?.id || order?.order_id || "").toLowerCase();
        const customerText = String(order?.customer || "").toLowerCase();
        const typeText = String(order?.type || "").toLowerCase();
        const statusText = String(order?.status || "");

        const matchesSearch =
          orderIdText.includes(searchQuery.toLowerCase()) ||
          customerText.includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || typeText === typeFilter.toLowerCase();
        const matchesStatus = statusFilter === "all" || statusText === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
      }),
    [orders, searchQuery, typeFilter, statusFilter]
  );

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const buyOrders = orders.filter((o) => String(o?.type || "").trim().toLowerCase() === "buy").length;
    const rentalOrders = orders.filter((o) => String(o?.type || "").trim().toLowerCase() === "rent").length;

    return [
      { key: "total", label: "Total orders", value: totalOrders.toLocaleString("en-IN") },
      { key: "buy", label: "Buy orders", value: buyOrders.toLocaleString("en-IN") },
      { key: "rent", label: "Rental orders", value: rentalOrders.toLocaleString("en-IN") },
    ];
  }, [orders]);

  const exportCsv = useCallback(() => {
    const rows = filteredOrders.map((order) => {
      const orderId = String(order?.id || order?.order_id || "");
      const customer = String(order?.customer || "");
      const owner =
        String(order?.owner || order?.ownerName || order?.shop || order?.shopName || order?.vendor || "").trim() || "";
      const items = Array.isArray(order?.items) ? order.items : [];
      const product = String(items?.[0]?.name || order?.product || order?.productName || "").trim() || "";
      const type = String(order?.type || "").trim() || "";
      const amount = Number(order?.total || order?.amount || 0);
      const status = String(order?.status || "").trim() || "";
      return [orderId, customer, owner, product, type, amount, status];
    });

    downloadCsv({
      filename: "all-orders.csv",
      headers: ["Order ID", "Customer", "Owner", "Product", "Type", "Amount", "Status"],
      rows,
    });
  }, [filteredOrders]);

  const updateOrderStatus = async (orderId, newStatus) => {
    let targetOrder;
    const previousOrders = orders;
    const updatedOrders = previousOrders.map((entry) => {
      if (String(entry?.id || entry?.order_id || "") !== orderId) return entry;
      targetOrder = entry;
      return { ...entry, status: newStatus };
    });

    setOrders(updatedOrders);
    if (selectedOrder && String(selectedOrder?.id || selectedOrder?.order_id || "") === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    try {
      await requestJson(`http://localhost:5000/api/admin/all-orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.log("Failed to update all order status:", err?.body || err.message);
      alert("Failed to update status in database.");
      setOrders(previousOrders);
      if (selectedOrder && targetOrder) {
        setSelectedOrder(targetOrder);
      }
      return;
    }

    syncUserOrderStatusByEmail({
      orderId,
      email: targetOrder?.email || "",
      status: newStatus,
    });
  };

  return (
    <AdminOrdersPageShell
      title="All orders"
      subtitle="Every buy and rental order across the entire platform."
      stats={stats}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      typeOptions={[
        { value: "all", label: "All types" },
        { value: "Buy", label: "Buy" },
        { value: "Rent", label: "Rent" },
        { value: "Mixed", label: "Mixed" },
      ]}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      statusOptions={[
        { value: "all", label: "All status" },
        { value: "Pending", label: "Pending" },
        { value: "Approved", label: "Approved" },
        { value: "Delivered", label: "Delivered" },
        { value: "Returned", label: "Returned" },
      ]}
      onExportCsv={exportCsv}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111111]">
              <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                <th className="text-left px-6 py-5 border-b border-white/10">Order ID</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Customer</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Owner</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Product</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Type</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Amount</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    Loading orders...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const config = statusConfig[order.status] || statusConfig.Pending;
                  const orderId = String(order?.id || order?.order_id || "");
                  const orderItems = Array.isArray(order?.items) ? order.items : [];
                  const owner =
                    String(order?.owner || order?.ownerName || order?.shop || order?.shopName || order?.vendor || "").trim() || "";
                  const product = String(orderItems?.[0]?.name || order?.product || order?.productName || "").trim() || "";
                  const amount = Number(order?.total || order?.amount || 0);

                  return (
                    <tr key={orderId} className="bg-white hover:bg-[#E6E6E6] transition-colors">
                      <td className="py-4 px-6 font-mono text-sm font-medium text-gray-600">{orderId}</td>
                      <td className="py-4 px-4">
                        <p className="text-sm font-bold text-[#111111]">{order.customer || "Customer"}</p>
                        <p className="text-[10px] text-gray-400">{order.email || ""}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm font-semibold text-[#111111]">{owner}</p>
                      </td>
                      <td className="py-4 px-4 min-w-56">
                        <p className="text-sm font-semibold text-[#111111] truncate" title={product}>
                          {product}
                        </p>
                        <p className="text-[10px] text-gray-400">{orderItems.length ? `${orderItems.length} item(s)` : ""}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border ${
                            String(order.type || "").toLowerCase() === "rent"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {order.type || "Buy"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm font-bold text-[#111111]">
                        {"\u20B9"}
                        {Number.isFinite(amount) ? amount.toLocaleString("en-IN") : "0"}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full ${config.bg} ${config.color}`}>
                          <config.icon size={12} /> {order.status || "Pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#f3f0f0]/50">
              <h2 className="text-xl font-serif text-[#111111] font-bold">Order Details</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto font-sans">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-lg font-bold text-gray-700">
                    {String(selectedOrder?.id || selectedOrder?.order_id || "") || "—"}
                  </p>
                  <p className="text-xs text-gray-400">{selectedOrder.date || "-"}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${(statusConfig[selectedOrder.status] || statusConfig.Pending).bg} ${(statusConfig[selectedOrder.status] || statusConfig.Pending).color}`}>
                  {selectedOrder.status}
                </span>
              </div>

              <div className="bg-[#f3f0f0] p-4 rounded-2xl space-y-2 border border-[#E6E6E6]">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Customer Details</h4>
                <p className="text-sm font-bold text-[#111111]">{selectedOrder.customer}</p>
                <p className="text-xs text-gray-600">
                  {selectedOrder.email || "-"} {selectedOrder.phone ? `• ${selectedOrder.phone}` : ""}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">{selectedOrder.address || "-"}</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Items</h4>
                {(Array.isArray(selectedOrder.items) ? selectedOrder.items : []).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                        alt={item.name || "Item"}
                        className="w-10 h-10 rounded-lg object-cover border border-[#E6E6E6] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400">Quantity: {item.quantity}</p>
                      </div>
                    </div>
                    <span className="font-bold text-[#111111]">{"\u20B9"}{Number(item.price || 0).toLocaleString("en-IN")}</span>
                  </div>
                ))}
                <div className="pt-3 flex justify-between items-center border-t border-gray-100">
                  <span className="font-serif text-gray-500">Total Amount</span>
                  <span className="text-xl font-bold text-[#111111]">{"\u20B9"}{Number(selectedOrder.total || 0).toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Update Order Status</h4>
                <div className="grid grid-cols-2 gap-2">
                  {["Pending", "Approved", "Delivered", "Returned"].map((status) => (
                    <button
                      key={status}
                      onClick={() => updateOrderStatus(String(selectedOrder?.id || selectedOrder?.order_id || ""), status)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        selectedOrder.status === status
                          ? "bg-[#111111] text-white border-[#111111]"
                          : "bg-white text-gray-500 border-gray-200 hover:border-[#111111]"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminOrdersPageShell>
  );
};

export default AdminOrders;





