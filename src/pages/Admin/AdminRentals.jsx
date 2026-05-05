import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Package, Truck } from "lucide-react";
import { requestJson } from "../../utils/http";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { downloadCsv } from "../../utils/csv";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const statusConfig = {
  Pending: { color: "text-amber-700", icon: Clock, bg: "bg-amber-100" },
  Approved: { color: "text-blue-700", icon: Package, bg: "bg-blue-100" },
  Delivered: { color: "text-emerald-700", icon: CheckCircle, bg: "bg-emerald-100" },
  Returned: { color: "text-[#111111]", icon: Truck, bg: "bg-[#E6E6E6]" },
};

const AdminRentals = () => {
  const [orders, setOrders] = useState([]);
  const [buyOrdersCount, setBuyOrdersCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    void requestJson(`${API_BASE}/api/admin/notifications/mark-read`, {
      method: "POST",
      body: JSON.stringify({ types: ["new_rental_order"] }),
    });
  }, []);

  const fetchRentalOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await requestJson("http://localhost:5000/api/admin/rentals");
      const rentals = Array.isArray(data?.rentals) ? data.rentals : [];
      setOrders(rentals);
    } catch (err) {
      console.log("Failed to fetch rental orders:", err?.body || err.message);
      setError("Unable to load rental orders from database.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchBuyOrdersCount = useCallback(async () => {
    try {
      const data = await requestJson("http://localhost:5000/api/admin/buy-orders");
      const buyOrders = Array.isArray(data?.orders) ? data.orders : [];
      setBuyOrdersCount(buyOrders.length);
    } catch {
      setBuyOrdersCount(0);
    }
  }, []);

  useEffect(() => {
    const bootstrapOrders = async () => {
      await Promise.all([fetchRentalOrders(), fetchBuyOrdersCount()]);
    };
    bootstrapOrders();
  }, [fetchBuyOrdersCount, fetchRentalOrders]);

  const rentalOrders = useMemo(() => orders, [orders]);

  const filteredOrders = useMemo(
    () =>
      rentalOrders.filter((order) => {
        const normalizedType = String(typeFilter || "all").trim().toLowerCase();
        const matchesSearch =
          String(order.order_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          String(order.customer || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = normalizedType === "all" || normalizedType === "rent";
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
      }),
    [rentalOrders, searchQuery, statusFilter, typeFilter]
  );

  const stats = useMemo(() => {
    const totalOrders = rentalOrders.length;

    return [
      { key: "total", label: "Total orders", value: totalOrders.toLocaleString("en-IN") },
      { key: "buy", label: "Buy orders", value: buyOrdersCount.toLocaleString("en-IN") },
      { key: "rent", label: "Rental orders", value: totalOrders.toLocaleString("en-IN") },
    ];
  }, [buyOrdersCount, rentalOrders]);

  const exportCsv = () => {
    const rows = filteredOrders.map((order) => {
      const orderId = String(order?.order_id || order?.id || "");
      const customer = String(order?.customer || "");
      const owner =
        String(order?.owner || order?.ownerName || order?.shop || order?.shopName || order?.vendor || "").trim() || "";
      const items = Array.isArray(order?.items) ? order.items : [];
      const product = String(items?.[0]?.name || order?.product || order?.productName || "").trim() || "";
      const type = String(order?.type || "Rent").trim() || "Rent";
      const amount = Number(order?.amount || order?.total || 0);
      const status = String(order?.status || "").trim() || "";
      return [orderId, customer, owner, product, type, amount, status];
    });

    downloadCsv({
      filename: "rental-orders.csv",
      headers: ["Order ID", "Customer", "Owner", "Product", "Type", "Amount", "Status"],
      rows,
    });
  };

  return (
    <AdminOrdersPageShell
      title="Rental orders"
      subtitle="Customers who rented products for a period."
      stats={stats}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      typeFilter={typeFilter}
      onTypeFilterChange={setTypeFilter}
      typeOptions={[
        { value: "all", label: "All types" },
        { value: "Rent", label: "Rent" },
        { value: "Buy", label: "Buy", disabled: true },
        { value: "Mixed", label: "Mixed", disabled: true },
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
                    Loading rental orders...
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
                  const orderId = String(order?.order_id || order?.id || "");
                  const items = Array.isArray(order?.items) ? order.items : [];
                  const owner =
                    String(order?.owner || order?.ownerName || items?.[0]?.owner || items?.[0]?.ownerName || order?.shop || order?.shopName || order?.vendor || "").trim() ||
                    "";
                  const product = String(items?.[0]?.name || order?.product || order?.productName || "").trim() || "";
                  const amount = Number(order?.amount || order?.total || 0);

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
                        <p className="text-[10px] text-gray-400">{items.length ? `${items.length} item(s)` : ""}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-full border bg-sky-50 text-sky-700 border-sky-200">
                          Rent
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
                    No rental orders found.
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

export default AdminRentals;





