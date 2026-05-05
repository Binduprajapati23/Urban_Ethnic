import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, PackageCheck, ShieldCheck } from "lucide-react";
import Footer from "../components/Footer";
import { requestJson } from "../utils/http";
import { getUserOrderHistory, getUserRentalHistory } from "../utils/orderHistory";

const getOrderStatusLabel = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "approved") return "Confirmed";
  return status || "Confirmed";
};

const MyRentalsOrdersPage = () => {
  const navigate = useNavigate();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const [orders, setOrders] = useState(() => getUserOrderHistory());
  const [rentals, setRentals] = useState(() => getUserRentalHistory());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });

    if (!isClerkLoaded) return undefined;

    const clerkId = String(clerkUser?.id || "").trim();
    const clerkEmail = String(clerkUser?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();

    let storedClerkId = "";
    let storedEmail = "";
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "null");
      storedClerkId = String(stored?.id || "").trim();
      storedEmail = String(stored?.email || "").trim().toLowerCase();
    } catch {
      // ignore
    }

    const effectiveClerkId = clerkId || storedClerkId;
    const effectiveEmail = clerkEmail || storedEmail;
    if (!effectiveClerkId && !effectiveEmail) return undefined;

    let cancelled = false;

    const refresh = async () => {
      setError("");
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (effectiveClerkId) params.set("clerkId", effectiveClerkId);
        if (effectiveEmail) params.set("email", effectiveEmail);
        const qs = params.toString();

        const [ordersData, rentalsData] = await Promise.all([
          requestJson(`${API_BASE}/api/users/orders?${qs}`),
          requestJson(`${API_BASE}/api/users/rentals?${qs}`),
        ]);

        if (cancelled) return;
        setOrders(Array.isArray(ordersData?.orders) ? ordersData.orders : []);
        setRentals(Array.isArray(rentalsData?.rentals) ? rentalsData.rentals : []);
      } catch (err) {
        if (cancelled) return;
        setOrders(getUserOrderHistory());
        setRentals(getUserRentalHistory());
        setError("Unable to fetch from database. Showing saved history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      cancelled = true;
    };
  }, [API_BASE, clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, isClerkLoaded]);

  const formatDate = (value) => {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const getDisplayItems = (order) => {
    if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
    return [
      {
        id: order?.id || "item",
        name: order?.name || "Ordered item",
        image: order?.image,
        quantity: 1,
        price: Number(order?.amount || 0),
      },
    ];
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-serif text-[#111111]">My Rentals &amp; Orders</h1>
          <p className="text-[#6B7280] mt-2">Your real order and rental history.</p>
        </div>

        <section className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6 mb-8">
          <h2 className="text-2xl font-serif text-[#111111] mb-5">Recent Orders</h2>
          <div className="space-y-4">
            {loading ? (
              <p className="text-[#6B7280]">Loading your orders…</p>
            ) : error ? (
              <p className="text-[#6B7280]">{error}</p>
            ) : orders.length > 0 ? (
              orders.map((order) => (
                (() => {
                  const orderItems = getDisplayItems(order);
                  const firstItem = orderItems[0] || {};
                  return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-[#E6E6E6] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    {orderItems.length <= 1 && (
                      <img src={firstItem.image || order.image} alt={firstItem.name || order.name} className="w-20 h-20 rounded-2xl object-cover" />
                    )}
                    <div>
                      <p className="text-[#111111] text-lg font-serif">
                        {orderItems.length > 1 ? `${orderItems.length} items in this order` : (firstItem.name || order.name)}
                      </p>
                      {orderItems.length > 1 && (
                        <>
                          <div className="flex items-center gap-1.5 mt-2">
                            {orderItems.slice(0, 4).map((item, index) => (
                              <img
                                key={`${item.id || item.name || "item"}-${index}`}
                                src={item.image || firstItem.image || order.image}
                                alt={item.name || "Item"}
                                className="w-8 h-8 rounded-md object-cover border border-[#E6E6E6]"
                              />
                            ))}
                            {orderItems.length > 4 && (
                              <span className="text-[10px] text-[#6B7280] font-semibold">
                                +{orderItems.length - 4}
                              </span>
                            )}
                          </div>
                          <p className="text-[#6B7280] text-xs mt-1">
                            {orderItems.slice(0, 3).map((item) => item.name).join(", ")}
                            {orderItems.length > 3 ? ` +${orderItems.length - 3} more` : ""}
                          </p>
                        </>
                      )}
                      <p className="text-[#6B7280] text-sm mt-1">Order ID: {order.id}</p>
                      <span className="inline-flex mt-2 px-3 py-1 rounded-full text-xs bg-[#E6E6E6] text-[#6B7280]">
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[#111111] text-xl font-serif">{"\u20B9"}{Number(order.amount || 0).toLocaleString("en-IN")}</p>
                    <p className="text-[#6B7280] text-xs mt-1">{formatDate(order.date)}</p>
                    <button
                      onClick={() =>
                        navigate("/track-order", {
                            state: {
                            product: { name: firstItem.name || order.name, image: firstItem.image || order.image },
                            items: orderItems,
                            orderId: order.id,
                            type: order.type || "Buy",
                          },
                        })
                      }
                      className="mt-2 inline-flex items-center gap-2 text-[#6B7280]"
                    >
                      Track <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                  );
                })()
              ))
            ) : (
              <p className="text-[#6B7280]">No orders yet.</p>
            )}
          </div>
        </section>

        <section className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6">
          <h2 className="text-2xl font-serif text-[#111111] mb-5">Active Rentals</h2>
          <div className="space-y-4">
            {loading ? (
              <p className="text-[#6B7280]">Loading your rentals…</p>
            ) : error ? (
              <p className="text-[#6B7280]">{error}</p>
            ) : rentals.filter((item) => item.status !== "Returned").length > 0 ? (
              rentals
                .filter((item) => item.status !== "Returned")
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-[#E6E6E6] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <img src={item.image} alt={item.name} className="w-20 h-20 rounded-2xl object-cover" />
                      <div>
                        <p className="text-[#111111] text-lg font-serif">{item.name}</p>
                        <p className="text-[#6B7280] text-sm mt-1">Rental ID: {item.id}</p>
                        <p className="text-[#6B7280] text-sm mt-1 inline-flex items-center gap-2">
                          <Calendar size={14} />
                          {formatDate(item.pickupDate)} - {formatDate(item.returnDate)}
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[#111111] text-sm inline-flex items-center gap-2">
                        <ShieldCheck size={15} />
                        Deposit: {"\u20B9"}{Number(item.deposit || 0).toLocaleString("en-IN")}
                      </p>
                      <p className="text-[#6B7280] text-sm mt-1">Return by: {formatDate(item.returnDate)}</p>
                      <button
                        onClick={() =>
                          navigate("/track-order", {
                            state: {
                              product: { name: item.name, image: item.image },
                              orderId: item.orderId || item.id,
                              type: "Rent",
                              rental: {
                                pickupDate: item.pickupDate,
                                returnDate: item.returnDate,
                                deposit: item.deposit,
                              },
                            },
                          })
                        }
                        className="mt-2 inline-flex items-center gap-2 text-[#6B7280]"
                      >
                        View Details <PackageCheck size={16} />
                      </button>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-[#6B7280]">No active rentals yet.</p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default MyRentalsOrdersPage;








