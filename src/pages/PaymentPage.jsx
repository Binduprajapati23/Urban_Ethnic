import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  MapPin,
  PackageCheck,
  QrCode,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";
import { requestJson } from "../utils/http";
import Footer from "../components/Footer";
import { clearCartItems } from "../utils/cart";
import {
  appendAdminOrder,
  appendAdminRental,
  appendUserOrder,
  appendUserRental,
  generateRecordId,
  getActiveUserProfile,
} from "../utils/orderHistory";

const PaymentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const data = location.state || {};
  const checkoutType = data.checkoutType === "buy" ? "buy" : "rent";
  const product = data.product || {
    name: "Royal Kundan Bridal Set",
    image: "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg",
  };
  const selectedDays = checkoutType === "rent" ? Number(data.selectedDays) || 3 : 1;
  const pricePerDay = checkoutType === "rent" ? Number(data.pricePerDay) || 4500 : 0;
  const securityDeposit = checkoutType === "rent" ? Number(data.securityDeposit) || 5000 : 0;
  const deliveryCharge = Number(data.deliveryCharge) || 0;
  const checkoutItems = Array.isArray(data.items) ? data.items : [];
  const normalizedOrderItems = checkoutItems.length
    ? checkoutItems
    : [
        {
          id: product.id || "item",
          name: product.name,
          image: product.image,
          quantity: checkoutType === "rent" ? 1 : Number(data.quantity || 1) || 1,
          price: checkoutType === "rent" ? pricePerDay : Number(data.totalPayable || data.total || 0),
          mode: checkoutType,
        },
      ];
  const firstOrderItem = normalizedOrderItems[0] || {
    name: product.name,
    image: product.image,
    mode: checkoutType,
  };
  const hasBuyItems = normalizedOrderItems.some((item) => String(item?.mode || "buy").toLowerCase() === "buy");
  const hasRentItems = normalizedOrderItems.some((item) => String(item?.mode || "").toLowerCase() === "rent");
  const effectiveOrderType = checkoutType === "rent" ? "Rent" : hasBuyItems && hasRentItems ? "Mixed" : "Buy";
  const buySubtotal = checkoutItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const rentTotal = checkoutType === "rent" ? Number(data.rentalAmount) || pricePerDay * selectedDays : buySubtotal;
  const totalPayable = Number(data.totalPayable || data.total) || (rentTotal + securityDeposit + deliveryCharge);
  const hasPersistedRef = useRef(false);
  const persistOrderDataRef = useRef(null);

  const [selectedMethod, setSelectedMethod] = useState("upi");
  const [selectedBank, setSelectedBank] = useState("State Bank of India");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upiId, setUpiId] = useState("");
  const [cardDetails, setCardDetails] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  });

  const methods = useMemo(
    () => [
      {
        id: "upi",
        title: "UPI Payment",
        subtitle: "Google Pay, PhonePe, Paytm",
        icon: Smartphone,
      },
      {
        id: "card",
        title: "Credit / Debit Card",
        subtitle: "Visa, Mastercard, RuPay",
        icon: CreditCard,
      },
      {
        id: "netbanking",
        title: "Net Banking",
        subtitle: "All major banks",
        icon: Landmark,
      },
      {
        id: "cod",
        title: "Cash on Delivery",
        subtitle: "Pay when delivered",
        icon: WalletCards,
      },
    ],
    []
  );

  const banks = [
    "State Bank of India",
    "HDFC Bank",
    "ICICI Bank",
    "Axis Bank",
    "Punjab National Bank",
  ];

  const orderId = useMemo(() => generateRecordId("ORD"), []);
  const rentalId = useMemo(() => generateRecordId("RNT"), []);
  const cityAddress = [data.address?.city, data.address?.pincode].filter(Boolean).join(", ") || "Mumbai, MH";
  const fullAddress = [data.address?.street, data.address?.city, data.address?.pincode]
    .filter(Boolean)
    .join(", ");
  const today = new Date();
  const deliveryStart = new Date(today);
  deliveryStart.setDate(today.getDate() + 4);
  const deliveryEnd = new Date(today);
  deliveryEnd.setDate(today.getDate() + 6);
  const returnBy = new Date(today);
  returnBy.setDate(today.getDate() + 9);

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const handleCardChange = (field, value) => {
    setCardDetails((prev) => ({ ...prev, [field]: value }));
  };
  const isCodPayment = selectedMethod === "cod";
  const paymentStatusLabel = isCodPayment ? "Unpaid" : "Paid";

  const persistOrderData = async () => {
    if (hasPersistedRef.current) return;
    hasPersistedRef.current = true;

    const user = getActiveUserProfile();

    // Auto-save address on first confirmed order (DB-backed, not localStorage).
    try {
      const apiBase = String(import.meta.env.VITE_API_BASE || "http://localhost:5000").replace(/\/$/, "");
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const email = String(storedUser?.email || user.email || "").trim().toLowerCase();
      const clerkId = String(storedUser?.id || "").trim();
      const street = String(data.address?.street || "").trim();
      const city = String(data.address?.city || "").trim();
      const pincode = String(data.address?.pincode || "").replace(/\D/g, "");
      const onlyIfEmpty = !Boolean(data.address?.saveAddress);

      if (email && street && city && pincode.length === 6) {
        await requestJson(`${apiBase}/api/users/addresses`, {
          method: "POST",
          body: JSON.stringify({
            email,
            clerkId,
            line1: street,
            line2: `${city}, ${pincode}`,
            onlyIfEmpty,
          }),
        });
      }
    } catch {
      // ignore DB write failures (offline / backend down)
    }

    const orderDateIso = new Date().toISOString();
    const customerName = user.name || data.address?.fullName || "Customer";
    const customerEmail = user.email || "unknown@email.com";
    const customerPhone = data.address?.phone || user.phone || "";
    const cartItems = normalizedOrderItems;

    const userOrder = {
      id: orderId,
      customer: customerName,
      email: customerEmail,
      phone: customerPhone,
      type: effectiveOrderType,
      name: firstOrderItem.name || product.name,
      image: firstOrderItem.image || product.image,
      status: "Approved",
      amount: totalPayable,
      date: orderDateIso,
      items: cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),
        mode: item.mode || "buy",
      })),
      address: fullAddress,
      rentalId: checkoutType === "rent" ? rentalId : null,
    };

    const adminOrder = {
      id: orderId,
      customer: customerName,
      email: customerEmail,
      phone: customerPhone,
      type: effectiveOrderType,
      items: cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),
        mode: item.mode || "buy",
      })),
      total: totalPayable,
      status: "Approved",
      date: orderDateIso,
      address: fullAddress || cityAddress,
    };

    appendUserOrder(userOrder);
    appendAdminOrder(adminOrder);

    try {
      await requestJson("http://localhost:5000/api/admin/users/order-event", {
        method: "POST",
        body: JSON.stringify({
          customer: customerName,
          email: customerEmail,
          phone: customerPhone,
          orderType: String(effectiveOrderType || "Buy").toLowerCase(),
          total: totalPayable,
        }),
      });
    } catch (err) {
      console.log("Order event DB sync failed:", err?.body || err.message);
    }

    try {
      await requestJson("http://localhost:5000/api/admin/all-orders/order-event", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          customer: customerName,
          customerEmail,
          city: String(data.address?.city || "").trim(),
          address: fullAddress || cityAddress,
          type: effectiveOrderType,
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            image: item.image,
            quantity: Number(item.quantity || 1),
            price: Number(item.price || 0),
            mode: item.mode || "buy",
          })),
          total: totalPayable,
          status: "Approved",
          date: orderDateIso,
        }),
      });
    } catch (err) {
      console.log("All orders DB sync failed:", err?.body || err.message);
    }

    if (hasBuyItems) {
      try {
        const buyItems = cartItems.filter((item) => String(item?.mode || "buy").toLowerCase() === "buy");
        await requestJson("http://localhost:5000/api/admin/buy-orders/order-event", {
          method: "POST",
          body: JSON.stringify({
            order_id: orderId,
            customer: customerName,
            customerEmail,
            items: buyItems.map((item) => ({
              id: item.id,
              name: item.name,
              image: item.image,
              quantity: Number(item.quantity || 1),
              price: Number(item.price || 0),
              mode: "buy",
            })),
            amount: totalPayable,
            status: "Approved",
            date: orderDateIso,
          }),
        });
      } catch (err) {
        console.log("Buy order DB sync failed:", err?.body || err.message);
      }
    }

    if (checkoutType === "rent") {
      const rentalRecord = {
        id: rentalId,
        orderId,
        name: firstOrderItem.name || product.name,
        image: firstOrderItem.image || product.image,
        status: "Active",
        pickupDate: data.rentalDate || new Date().toISOString().slice(0, 10),
        returnDate: data.returnDate || new Date().toISOString().slice(0, 10),
        dailyRate: pricePerDay,
        totalDays: selectedDays,
        deposit: securityDeposit,
      };

      try {
        await requestJson("http://localhost:5000/api/admin/rentals/order-event", {
          method: "POST",
          body: JSON.stringify({
            order_id: orderId,
            customer: customerName,
            customerEmail,
            items: cartItems.map((item) => ({
              id: item.id,
              name: item.name,
              image: item.image,
              quantity: Number(item.quantity || 1),
              price: Number(item.price || 0),
              mode: item.mode || "rent",
            })),
            amount: totalPayable,
            status: "Approved",
            date: orderDateIso,
            pickupDate: rentalRecord.pickupDate,
            returnDate: rentalRecord.returnDate,
            dailyRate: rentalRecord.dailyRate,
            totalDays: rentalRecord.totalDays,
            deposit: rentalRecord.deposit,
          }),
        });

        appendUserRental(rentalRecord);
        appendAdminRental({
          id: rentalId,
          customer: customerName,
          product: firstOrderItem.name || product.name,
          productImage: firstOrderItem.image || product.image,
          pickupDate: rentalRecord.pickupDate,
          returnDate: rentalRecord.returnDate,
          status: "Active",
          dailyRate: rentalRecord.dailyRate,
          totalDays: rentalRecord.totalDays,
        });
      } catch (err) {
        if (err?.status === 409) {
          alert(err?.body?.message || "This product is already booked (sold out).");
          clearCartItems();
          navigate("/collections");
          return;
        }

        console.log("Rental order DB sync failed:", err?.body || err.message);
        appendUserRental(rentalRecord);
        appendAdminRental({
          id: rentalId,
          customer: customerName,
          product: firstOrderItem.name || product.name,
          productImage: firstOrderItem.image || product.image,
          pickupDate: rentalRecord.pickupDate,
          returnDate: rentalRecord.returnDate,
          status: "Active",
          dailyRate: rentalRecord.dailyRate,
          totalDays: rentalRecord.totalDays,
        });
      }
    } else {
      clearCartItems();
    }
  };

  useEffect(() => {
    persistOrderDataRef.current = persistOrderData;
  });

  const handlePaySecurely = () => {
    if (selectedMethod === "upi") {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi) {
        alert("Please enter your UPI ID");
        return;
      }
      if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(trimmedUpi)) {
        alert("Please enter a valid UPI ID");
        return;
      }
    }

    if (selectedMethod === "card") {
      const cardNumber = cardDetails.number.replace(/\s/g, "");
      const cardName = cardDetails.name.trim();
      const cardExpiry = cardDetails.expiry.trim();
      const cardCvv = cardDetails.cvv.trim();

      if (!cardNumber || !cardName || !cardExpiry || !cardCvv) {
        alert("Please fill all card details");
        return;
      }

      if (!/^\d{16}$/.test(cardNumber)) {
        alert("Please enter a valid 16-digit card number");
        return;
      }

      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry)) {
        alert("Please enter expiry in MM/YY format");
        return;
      }

      if (!/^\d{3,4}$/.test(cardCvv)) {
        alert("Please enter a valid CVV");
        return;
      }
    }

    if (selectedMethod === "netbanking" && !selectedBank) {
      alert("Please select your bank");
      return;
    }

    setProgress(12);
    setIsProcessing(true);
  };

  useEffect(() => {
    if (!isProcessing) return;
    let revealTimer;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return 92;
        const nextStep = prev + Math.max(2, Math.round((100 - prev) * 0.08));
        return Math.min(nextStep, 92);
      });
    }, 350);

    const completeTimer = setTimeout(() => {
      setProgress(100);
      revealTimer = setTimeout(() => {
        Promise.resolve(persistOrderDataRef.current?.()).finally(() => {
          setIsProcessing(false);
          setIsConfirmed(true);
        });
      }, 320);
    }, 2800);

    return () => {
      clearInterval(timer);
      clearTimeout(completeTimer);
      clearTimeout(revealTimer);
    };
  }, [isProcessing]);

  useEffect(() => {
    if (!isConfirmed) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [isConfirmed]);

  if (isConfirmed) {
    return (
      <div className="min-h-screen bg-[#f3f0f0]">
        <div className="max-w-5xl mx-auto py-12 px-4">
          <div className="text-center">
            <div className="w-32 h-32 mx-auto flex items-center justify-center">
              <CheckCircle2 size={120} className="text-[#16A34A]" />
            </div>
            <h1 className="mt-8 text-3xl md:text-4xl font-serif text-[#111111]">
              Your order has been
              <br />
              successfully confirmed
            </h1>
            <p className="mt-5 text-[#6B7280] text-base">
              Thank you for choosing Urban Ethnic. We&apos;re preparing your pieces
              <br />
              with care.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-8 items-start">
            <div className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6] w-full max-w-2xl">
              <div className="pb-5 border-b border-[#E6E6E6]">
                <div className="flex gap-4 items-center">
                  <img src={firstOrderItem.image || product.image} alt={firstOrderItem.name || product.name} className="w-24 h-24 rounded-2xl object-cover" />
                  <div>
                    <p className="text-xl font-serif text-[#111111]">
                      {normalizedOrderItems.length > 1
                        ? `${normalizedOrderItems.length} items in this order`
                        : (firstOrderItem.name || product.name)}
                    </p>
                    <span className="inline-flex mt-2 bg-[#E6E6E6] text-[#6B7280] px-3 py-1 rounded-full text-xs">
                      {checkoutType === "rent" ? "RENTAL" : "PURCHASE"}
                    </span>
                  </div>
                </div>
                {normalizedOrderItems.length > 1 && (
                  <div className="mt-4 space-y-2">
                    {normalizedOrderItems.map((item) => (
                      <div key={`${item.id}-${item.mode || "buy"}`} className="flex items-center justify-between text-sm text-[#111111]">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={item.image || firstOrderItem.image || product.image}
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
              </div>

              <div className="mt-5 space-y-4 text-[#111111] text-base">
                <div className="flex justify-between">
                  <span>Order ID</span>
                  <span>{orderId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Payment Status</span>
                  <span className="flex items-center gap-1">
                    {paymentStatusLabel}
                    {!isCodPayment && <Check size={18} />}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Estimated Delivery</span>
                  <span className="flex items-center gap-2">
                    <PackageCheck size={17} />
                    {formatDate(deliveryStart)} - {formatDate(deliveryEnd)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Delivery Address</span>
                  <span className="flex items-center gap-2">
                    <MapPin size={17} />
                    {cityAddress}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-5 lg:pt-2">
              {checkoutType === "rent" && (
                <div className="flex mt-17 gap-4">
                  <CalendarClock className="text-[#6B7280]" size={25} />
                  <div className="">
                    <h3 className="text-xl font-serif text-[#111111]">Rental Return Reminder</h3>
                    <p className="text-[#6B7280] text-base mt-1">
                      Please return the item by <span className="font-semibold">{formatDate(returnBy)}</span>. Late returns may incur additional charges.
                    </p>
                  </div>
                </div>
              )}

              {checkoutType === "rent" ? (
                <div className="flex gap-4">
                  <ShieldCheck className="text-[#6B7280]" size={24} />
                  <div>
                    <h3 className="text-xl font-serif text-[#111111]">Deposit Refund</h3>
                    <p className="text-[#6B7280] text-base mt-1">
                      Your {"\u20B9"}{securityDeposit.toLocaleString("en-IN")} security deposit will be refunded within 5-7 business days after return inspection.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4">
                  <PackageCheck className="text-[#6B7280]" size={24} />
                  <div>
                    <h3 className="text-xl font-serif text-[#111111]">Order Packed</h3>
                    <p className="text-[#6B7280] text-base mt-1">
                      Your purchase is confirmed and will be delivered between {formatDate(deliveryStart)} and {formatDate(deliveryEnd)}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() =>
                navigate("/track-order", {
                  state: {
                    product,
                    items: normalizedOrderItems,
                    orderId,
                    type: effectiveOrderType,
                    rental:
                      checkoutType === "rent"
                        ? {
                            pickupDate: data.rentalDate,
                            returnDate: data.returnDate,
                            deposit: securityDeposit,
                          }
                        : null,
                  },
                })
              }
              className="h-12 px-8 rounded-2xl bg-[#111111] text-white text-sm font-semibold"
            >
              TRACK MY ORDER
            </button>
            <button
              onClick={() =>
                navigate("/my-rentals-orders")
              }
              className="h-12 px-8 rounded-2xl border-2 border-[#111111] text-[#111111] text-sm font-semibold transition-all duration-150 hover:bg-[#111111] hover:text-white active:scale-[0.98] active:bg-[#111111] active:border-[#111111]"
            >
              MY RENTALS &amp; ORDERS
            </button>
            <button
              onClick={() => navigate("/")}
              className="h-12 px-4 text-[#6B7280] text-base font-medium"
            >
              Continue Shopping
            </button>
          </div>
        </div>
        <div className="mt-8">
          <Footer />
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-[#f3f0f0] flex items-center justify-center px-4">
        <div className="w-full max-w-xl text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-[#FFFFFF] flex items-center justify-center shadow-[0_0_90px_rgba(122,133,90,0.25)]">
            <Loader2 className="text-[#111111] animate-spin" size={36} />
          </div>

          <h2 className="mt-10 text-2xl font-serif text-[#111111] whitespace-nowrap">Processing your payment...</h2>
          <p className="mt-3 text-[#6B7280] text-sm">Please wait while we secure your order.</p>

          <div className="mt-10 h-2 w-full bg-[#E6E6E6] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#111111] rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-6 text-[#6B7280] text-xs flex items-center justify-center gap-2">
            <Lock size={16} /> 256-bit SSL encrypted payment
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#6B7280] hover:text-[#111111] transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Checkout
        </button>

        <div className="text-center mt-8 mb-10">
          <div className="flex  items-center justify-center gap-2 text-[#6B7280] tracking-[0.25em] text-sm uppercase">
            <Lock size={14} />
            Secure Payment
          </div>
          <h1 className="text-2xl md:text-4xl font-serif text-[#111111] mt-3">Complete Your Payment</h1>
          <p className="text-[#6B7280] mt-3 text-base">Your information is protected with industry-standard encryption</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8 items-start">
          <div className="space-y-8">
            <section>
          <h2 className="text-2xl ml-3 font-serif text-[#111111] mb-5">Choose Payment Method</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {methods.map((method) => {
                  const active = selectedMethod === method.id;
                  const MethodIcon = method.icon;

                  return (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        active ? "border-[#111111] bg-[#E6E6E6]" : "border-[#E6E6E6] bg-[#FFFFFF]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            active ? "bg-[#111111] text-white" : "bg-[#E6E6E6] text-[#6B7280]"
                          }`}
                        >
                          <MethodIcon size={20} />
                        </span>
                        <span>
                          <p className="text-base md:text-lg font-medium text-[#111111]">{method.title}</p>
                          <p className="text-[#6B7280] text-sm">{method.subtitle}</p>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedMethod === "upi" && (
              <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
                <h3 className="text-2xl font-serif text-[#111111] mb-6">UPI Payment</h3>
                <label className="block mb-5">
                    <span className="text-[#111111] text-base">UPI ID</span>
                  <input
                    type="text"
                    placeholder="yourname@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="mt-2 h-14 w-full rounded-2xl border border-[#E6E6E6] bg-[#FFFFFF] px-4 text-[#111111] outline-none"
                  />
                </label>

                <div className="flex items-center gap-4 my-4 text-[#6B7280]">
                  <div className="h-px bg-[#E6E6E6] flex-1" />
                  <span className="text-sm tracking-wide">OR SCAN QR</span>
                  <div className="h-px bg-[#E6E6E6] flex-1" />
                </div>

                <div className="mx-auto w-64 h-64 rounded-3xl border-2 border-dashed border-[#111111] bg-[#E6E6E6] flex flex-col items-center justify-center text-center text-[#6B7280]">
                  <QrCode size={56} />
                  <p className="mt-4 text-sm">Scan with any</p>
                  <p className="text-sm">UPI app to pay</p>
                </div>
              </section>
            )}

            {selectedMethod === "card" && (
              <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
                <h3 className="text-2xl font-serif text-[#111111] mb-6">Card Details</h3>
                <div className="space-y-5">
                  <label className="block">
                    <span className="text-[#111111] text-base">Card Number</span>
                    <input
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      value={cardDetails.number}
                      onChange={(e) => handleCardChange("number", e.target.value)}
                      className="mt-2 h-14 w-full rounded-2xl border border-[#E6E6E6] bg-[#FFFFFF] px-4 text-[#111111] outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[#111111] text-base">Name on Card</span>
                    <input
                      type="text"
                      placeholder="Full name as on card"
                      value={cardDetails.name}
                      onChange={(e) => handleCardChange("name", e.target.value)}
                      className="mt-2 h-14 w-full rounded-2xl border border-[#E6E6E6] bg-[#FFFFFF] px-4 text-[#111111] outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-[#111111] text-base">Expiry Date</span>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={cardDetails.expiry}
                        onChange={(e) => handleCardChange("expiry", e.target.value)}
                        className="mt-2 h-14 w-full rounded-2xl border border-[#E6E6E6] bg-[#FFFFFF] px-4 text-[#111111] outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[#111111] text-base">CVV</span>
                      <input
                        type="password"
                        value={cardDetails.cvv}
                        onChange={(e) => handleCardChange("cvv", e.target.value)}
                        placeholder="•••"
                        className="mt-2 h-14 w-full rounded-2xl border border-[#E6E6E6] bg-[#FFFFFF] px-4 text-[#111111] outline-none"
                      />
                    </label>
                  </div>
                </div>
              </section>
            )}

            {selectedMethod === "netbanking" && (
              <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
                <h3 className="text-2xl font-serif text-[#111111] mb-6">Select Your Bank</h3>
                <div className="space-y-4">
                  {banks.map((bank) => (
                    <button
                      key={bank}
                      onClick={() => setSelectedBank(bank)}
                      className={`w-full h-16 rounded-2xl border px-5 flex items-center justify-between text-lg ${
                        selectedBank === bank
                          ? "border-[#111111] text-[#111111]"
                          : "border-[#E6E6E6] text-[#111111]"
                      }`}
                    >
                      {bank}
                      <ChevronRight size={22} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {selectedMethod === "cod" && (
              <section className="bg-[#FFFFFF] rounded-[28px] p-3 border border-[#E6E6E6]">
                <div className="flex gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#E6E6E6] text-[#6B7280] mt-3 flex items-center justify-center shrink-0">
                    <WalletCards size={18} />
                  </span>
                  <div>
                    <h3 className="text-lg md:text-xl font-serif text-[#111111] mb-1">Cash on Delivery</h3>
                    <p className="text-[#6B7280] text-sm md:text-base leading-relaxed">
                      Pay the full amount in cash when your order is delivered. An additional {"\u20B9"}50 COD fee applies.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="bg-[#FFFFFF] rounded-[28px] p-8 border border-[#E6E6E6] self-start h-fit lg:mt-12">
            <h2 className="text-2xl font-serif text-[#111111] mb-6">Order Summary</h2>

            <div className="pb-6 border-b border-[#E6E6E6]">
              <div className="flex gap-4 items-center">
                <img src={firstOrderItem.image || product.image} alt={firstOrderItem.name || product.name} className="w-24 h-24 rounded-2xl object-cover" />
                <div>
                  <p className="text-xl leading-tight font-serif text-[#111111]">
                    {normalizedOrderItems.length > 1
                      ? `${normalizedOrderItems.length} items selected`
                      : (firstOrderItem.name || product.name)}
                  </p>
                  <span className="inline-flex mt-2 bg-[#E6E6E6] text-[#6B7280] px-3 py-1 rounded-full text-xs tracking-wide">
                    {checkoutType === "rent" ? "RENTAL" : "PURCHASE"}
                  </span>
                </div>
              </div>
              {normalizedOrderItems.length > 1 && (
                <div className="mt-4 space-y-2">
                  {normalizedOrderItems.map((item) => (
                    <div key={`${item.id}-${item.mode || "buy"}`} className="flex items-center justify-between text-sm text-[#6B7280]">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={item.image || firstOrderItem.image || product.image}
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
            </div>

            <div className="space-y-4 text-[#6B7280] text-lg mt-6">
              <div className="flex justify-between">
                <span>{checkoutType === "rent" ? `Rent (${selectedDays} days)` : "Items Total"}</span>
                <span>{"\u20B9"}{rentTotal.toLocaleString("en-IN")}</span>
              </div>
              {checkoutType === "rent" && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <Building2 size={16} />
                    Security Deposit
                  </span>
                  <span>{"\u20B9"}{securityDeposit.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{deliveryCharge === 0 ? "Free" : `\u20B9${deliveryCharge}`}</span>
              </div>
            </div>

            <div className="border-t border-[#E6E6E6] mt-6 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-serif text-[#111111]">Total Payable</span>
                <span className="text-2xl font-serif text-[#111111]">
                  {"\u20B9"}{totalPayable.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <button
              onClick={handlePaySecurely}
              className="w-full h-12 rounded-[16px] bg-[#111111] text-white text-base font-semibold mt-6 hover:bg-[#111111] transition-colors"
            >
              Pay {"\u20B9"}{totalPayable.toLocaleString("en-IN")} Securely
            </button>

            <p className="flex items-center justify-center gap-2 text-[#6B7280] text-xs mt-6">
              <Lock size={14} /> Protected by 256-bit SSL encryption
            </p>
          </aside>
        </div>
      </div>
      <div className="mt-8">
        <Footer />
      </div>
    </div>
  );
};

export default PaymentPage;






