import React, { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Footer from "../components/Footer";
import { requestJson } from "../utils/http";

const formatDateLabel = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const TrackOrderPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state || {};
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

  const [remoteOrder, setRemoteOrder] = React.useState(null);
  const [remoteLoading, setRemoteLoading] = React.useState(false);
  const [remoteError, setRemoteError] = React.useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const orderId =
    String(data.orderId || "").trim() ||
    String(new URLSearchParams(location.search || "").get("orderId") || "").trim() ||
    "ORD-0000000";

  useEffect(() => {
    if (!isClerkLoaded) return undefined;
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId || normalizedOrderId === "ORD-0000000") return undefined;

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
    setRemoteError("");
    setRemoteLoading(true);

    const run = async () => {
      try {
        const params = new URLSearchParams();
        if (effectiveClerkId) params.set("clerkId", effectiveClerkId);
        if (effectiveEmail) params.set("email", effectiveEmail);
        const qs = params.toString();

        const payload = await requestJson(
          `${API_BASE}/api/users/orders/${encodeURIComponent(normalizedOrderId)}?${qs}`
        );
        if (cancelled) return;
        setRemoteOrder(payload?.order || null);
      } catch (err) {
        if (cancelled) return;
        setRemoteOrder(null);
        setRemoteError(err?.message || "Failed to load order");
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    API_BASE,
    clerkUser?.id,
    clerkUser?.primaryEmailAddress?.emailAddress,
    isClerkLoaded,
    location.search,
    orderId,
  ]);

  const orderItems =
    (Array.isArray(data.items) && data.items.length > 0 && data.items) ||
    (Array.isArray(remoteOrder?.items) && remoteOrder.items.length > 0 && remoteOrder.items) ||
    [];
  const primaryItem = orderItems[0] || {};
  const product = data.product || {
    name: primaryItem.name || remoteOrder?.name || "Royal Kundan Bridal Set",
    image:
      primaryItem.image ||
      remoteOrder?.image ||
      "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg",
  };
  const typeLabel = String(data.type || remoteOrder?.type || "Buy");
  const orderType = typeLabel === "Rent" ? "Rent" : typeLabel === "Mixed" ? "Mixed" : "Buy";
  const rental = data.rental || {};

  const rentalPeriod =
    rental.period ||
    (rental.pickupDate && rental.returnDate
      ? `${formatDateLabel(rental.pickupDate)} - ${formatDateLabel(rental.returnDate)}`
      : "Not available");
  const returnBy = rental.returnDate ? formatDateLabel(rental.returnDate) : "Not available";
  const deposit = Number(rental.deposit || 0);

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <main className="max-w-5xl mx-auto px-4 md:px-8 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-serif text-[#111111]">Track Your Order</h1>
          <p className="text-[#6B7280] text-lg mt-2">Order {orderId}</p>
          {remoteLoading ? (
            <p className="text-[#6B7280] text-sm mt-2">Loading order details…</p>
          ) : remoteError ? (
            <p className="text-[#6B7280] text-sm mt-2">{remoteError}</p>
          ) : null}
        </header>

        <section className="bg-[#FFFFFF] rounded-[26px] border border-[#E6E6E6] p-6 mb-8">
          <div className="flex items-center gap-5">
            <img src={product.image} alt={product.name} className="w-32 h-32 rounded-2xl object-cover" />
            <div>
              <h2 className="text-2xl font-serif text-[#111111]">
                {orderItems.length > 1 ? `${orderItems.length} items in this order` : product.name}
              </h2>
              <span className="inline-flex mt-2 bg-[#E6E6E6] text-[#6B7280] px-4 py-1 rounded-full text-xs">
                {orderType === "Rent" ? "RENTAL" : orderType === "Mixed" ? "BUY + RENT" : "PURCHASE"}
              </span>
              <p className="text-[#6B7280] mt-3 text-base">Mumbai, Maharashtra</p>
            </div>
          </div>
          {orderItems.length > 1 && (
            <div className="mt-5 space-y-2 border-t border-[#E6E6E6] pt-4">
              {orderItems.map((item) => (
                <div key={`${item.id || item.name}-${item.mode || "buy"}`} className="flex items-center justify-between text-sm text-[#111111]">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={item.image || product.image}
                      alt={item.name || "Item"}
                      className="w-8 h-8 rounded-lg object-cover border border-[#E6E6E6] shrink-0"
                    />
                    <span className="truncate">
                      {item.name} x {Number(item.quantity || 1)}
                    </span>
                  </div>
                  <span className="font-semibold">
                    {"\u20B9"}{(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#FFFFFF] rounded-[26px] border border-[#E6E6E6] p-7 mb-8">
          <h3 className="text-2xl font-serif text-[#111111] mb-8">Delivery Progress</h3>

          <div className="relative pl-2">
            <div className="absolute left-[35px] top-10 bottom-20 w-[2px] bg-[#111111]" />

            <div className="flex items-start gap-4 mb-8">
              <span className="w-14 h-14 rounded-full bg-[#111111] text-white flex items-center justify-center shrink-0 z-10">
                <CheckCircle2 size={20} />
              </span>
              <div>
                <p className="text-xl text-[#111111]">Order Confirmed</p>
                <p className="text-[#6B7280] text-base">Recently updated</p>
              </div>
            </div>

            <div className="flex items-start gap-4 mb-8">
              <span className="w-14 h-14 rounded-full bg-[#111111] text-white flex items-center justify-center shrink-0 z-10">
                <PackageCheck size={20} />
              </span>
              <div>
                <p className="text-xl text-[#111111]">Packed &amp; Ready</p>
                <p className="text-[#6B7280] text-base">Preparing shipment</p>
              </div>
            </div>

            <div className="flex items-start gap-4 mb-8">
              <span className="w-14 h-14 rounded-full bg-[#E6E6E6] flex items-center justify-center shrink-0 z-10">
                <span className="w-11 h-11 rounded-full bg-[#111111] text-white flex items-center justify-center">
                  <Truck size={18} />
                </span>
              </span>
              <div>
                <p className="text-xl text-[#111111]">Out for Delivery</p>
                <p className="text-[#6B7280] text-base">Expected soon</p>
              </div>
            </div>

            <div className="flex items-start gap-4 mb-8">
              <span className="w-14 h-14 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0 z-10">
                <PackageCheck size={20} />
              </span>
              <div>
                <p className="text-xl text-[#111111]">Delivered</p>
                <p className="text-[#6B7280] text-base">Pending confirmation</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <span className="w-14 h-14 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0 z-10">
                <RotateCcw size={20} />
              </span>
              <div>
                <p className="text-xl text-[#111111]">Return Scheduled</p>
                <p className="text-[#6B7280] text-base">{orderType === "Rent" ? returnBy : "Not applicable"}</p>
              </div>
            </div>
          </div>
        </section>

        {orderType === "Rent" && (
          <section className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6 mb-8 shadow-sm">
            <h3 className="text-2xl font-serif text-[#111111] mb-5 flex items-center gap-3">
              <CalendarClock size={26} className="text-[#6B7280]" />
              Rental Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-[#F8F9FA] border border-[#E6E6E6] rounded-2xl p-4">
                <p className="text-[#6B7280]">Rental Period</p>
                <p className="text-[#111111] text-xl mt-1">{rentalPeriod}</p>
              </div>
              <div className="bg-[#F8F9FA] border border-[#E6E6E6] rounded-2xl p-4">
                <p className="text-[#6B7280]">Return By</p>
                <p className="text-[#111111] text-xl mt-1">{returnBy}</p>
              </div>
            </div>

            <div className="bg-[#F8F9FA] border border-[#E6E6E6] rounded-2xl p-4 flex items-start gap-3">
              <ShieldCheck className="text-[#6B7280] mt-1" size={22} />
              <div>
                <p className="text-[#111111] text-xl">Security Deposit: {"\u20B9"}{deposit.toLocaleString("en-IN")}</p>
                <p className="text-[#6B7280] text-sm">Refunded within 5-7 business days after successful return inspection.</p>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-8">
          <button
            onClick={() => navigate("/my-rentals-orders")}
            className="h-12 px-10 rounded-2xl border-2 border-[#111111] text-[#111111] text-sm font-semibold inline-flex items-center gap-2 transition-all duration-200 hover:bg-[#111111] hover:text-white active:scale-[0.98]"
          >
            <PackageCheck size={16} />
            VIEW ALL ORDERS
          </button>

          <button
            onClick={() => navigate("/contact-support", { state: { orderId } })}
            className="h-12 px-10 rounded-2xl border-2 border-[#111111] text-[#111111] text-sm font-semibold inline-flex items-center gap-2 transition-all duration-200 hover:bg-[#111111] hover:text-white active:scale-[0.98]"
          >
            <MessageCircle size={16} />
            CONTACT SUPPORT
          </button>

          <button
            onClick={() => navigate("/")}
            className="h-12 px-4 text-[#6B7280] text-base font-medium inline-flex items-center gap-2"
          >
            Continue Shopping
            <ArrowRight size={17} />
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TrackOrderPage;










