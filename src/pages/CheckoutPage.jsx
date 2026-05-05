import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Minus, Plus, Truck, Zap, MapPin } from "lucide-react";
import { getCartItems, updateCartItemQuantity } from "../utils/cart";
import Footer from "../components/Footer";

const DEFAULT_CHECKOUT_ADDRESS = {
  fullName: "",
  phone: "",
  street: "",
  city: "",
  pincode: "",
  saveAddress: false,
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState(() => getCartItems());
  const [deliveryType, setDeliveryType] = useState("standard");
  const [address, setAddress] = useState(() => ({ ...DEFAULT_CHECKOUT_ADDRESS }));

  const subtotal = useMemo(
    () =>
      cartItems.reduce((acc, item) => {
        if (item.mode === "rent") return acc + item.price * (item.days || 1);
        return acc + item.price * (item.quantity || 1);
      }, 0),
    [cartItems]
  );

  const shippingCost = deliveryType === "express" ? 500 : 0;
  const total = subtotal + shippingCost;

  const handleQuantityChange = (item, delta) => {
    const nextQuantity = Math.max(1, (item.quantity || 1) + delta);
    setCartItems(updateCartItemQuantity(item.id, item.mode, nextQuantity, item.size));
  };

  const handleAddressChange = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAddressToggle = (checked) => {
    setAddress((prev) => ({ ...prev, saveAddress: checked }));
  };

  const handlePlaceOrder = () => {
    if (cartItems.length === 0) {
      alert("Your cart is empty");
      return;
    }

    const fullName = address.fullName.trim();
    const street = address.street.trim();
    const city = address.city.trim();
    const phoneDigits = address.phone.replace(/\D/g, "");
    const pincodeDigits = address.pincode.replace(/\D/g, "");

    if (!fullName || !street || !city || !phoneDigits || !pincodeDigits) {
      alert("Please fill all address details to continue");
      return;
    }

    if (phoneDigits.length < 10) {
      alert("Please enter a valid phone number");
      return;
    }

    if (pincodeDigits.length !== 6) {
      alert("Please enter a valid 6-digit pincode");
      return;
    }

    const firstItem = cartItems[0] || {};

    navigate("/payment", {
      state: {
        checkoutType: "buy",
        items: cartItems.map((item) => ({
          id: item.id,
          name: item.name,
          image: item.image,
          size: item.size || "Free Size",
          quantity: item.quantity || 1,
          price: Number(item.price || 0),
          mode: item.mode || "buy",
        })),
        subtotal,
        deliveryCharge: shippingCost,
        total,
        product: {
          id: firstItem.id,
          name: firstItem.name || "Royal Kundan Bridal Set",
          image:
            firstItem.image ||
            "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg",
        },
        selectedDays: 1,
        pricePerDay: firstItem.price || 0,
        securityDeposit: 0,
        deliveryType,
        address: {
          fullName,
          phone: phoneDigits,
          street,
          city,
          pincode: pincodeDigits,
          saveAddress: address.saveAddress,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <button
          onClick={() => navigate("/cart")}
          className="flex items-center gap-2 text-[#111111] hover:text-[#111111] transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Cart
        </button>

        <h1 className="mt-8 text-2xl md:text-3xl font-serif text-[#111111]">Checkout</h1>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-8 items-start">
          <div className="space-y-8">
            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
              <h2 className="text-xl font-serif text-[#111111] mb-6">Your Items</h2>

              <div className="space-y-6">
                {cartItems.length > 0 ? (
                  cartItems.map((item) => (
                    <div key={`${item.id}-${item.mode}-${item.size || "free-size"}`} className="flex gap-4">
                      <img src={item.image} alt={item.name} className="w-24 h-24 rounded-2xl object-cover" />
                      <div className="flex-1">
                        <div className="flex justify-between gap-4">
                          <h3 className="text-xl md:text-2xl font-serif text-[#111111] leading-none">{item.name}</h3>
                          <p className="text-xl font-serif text-[#111111]">
                            {"\u20B9"}
                            {(item.mode === "rent" ? item.price * (item.days || 1) : item.price * (item.quantity || 1)).toLocaleString("en-IN")}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center gap-5">
                          <span className="px-3 py-1 rounded-full bg-[#E6E6E6] text-[#111111] text-xs uppercase tracking-wide">
                            Size {item.size || "Free Size"}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item, -1)}
                            className="w-8 h-8 rounded-full bg-[#E6E6E6] text-[#111111] flex items-center justify-center"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-[#111111] text-lg">{item.quantity || 1}</span>
                          <button
                            onClick={() => handleQuantityChange(item, 1)}
                            className="w-8 h-8 rounded-full bg-[#E6E6E6] text-[#111111] flex items-center justify-center"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[#6B7280]">Your cart is empty.</p>
                )}
              </div>
            </section>

            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
                  <MapPin size={22} />
                </span>
                <h2 className="text-xl font-serif text-[#111111]">Delivery Address</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={address.fullName}
                  onChange={(e) => handleAddressChange("fullName", e.target.value)}
                  placeholder="Enter your name"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] border border-[#E6E6E6] outline-none"
                />
                <input
                  value={address.phone}
                  onChange={(e) => handleAddressChange("phone", e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] border border-[#E6E6E6] outline-none"
                />
                <input
                  value={address.street}
                  onChange={(e) => handleAddressChange("street", e.target.value)}
                  placeholder="House / Flat / Street"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] border border-[#E6E6E6] outline-none md:col-span-2"
                />
                <input
                  value={address.city}
                  onChange={(e) => handleAddressChange("city", e.target.value)}
                  placeholder="City"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] border border-[#E6E6E6] outline-none"
                />
                <input
                  value={address.pincode}
                  onChange={(e) => handleAddressChange("pincode", e.target.value)}
                  placeholder="XXXXXX"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] border border-[#E6E6E6] outline-none"
                />
              </div>

              <label className="inline-flex items-center gap-3 mt-5 text-[#111111]">
                <input
                  type="checkbox"
                  checked={address.saveAddress}
                  onChange={(e) => handleSaveAddressToggle(e.target.checked)}
                  className="w-5 h-5 rounded border-[#111111]"
                />
                Save this address for future orders
              </label>
            </section>

            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6]">
              <h2 className="text-2xl font-serif text-[#111111] mb-6">Shipping Method</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setDeliveryType("standard")}
                  className={`rounded-[22px] border p-6 text-left ${
                    deliveryType === "standard" ? "border-[#111111] bg-[#f3f0f0]" : "border-[#E6E6E6]"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0">
                      <Truck size={22} />
                    </span>
                    <div>
                      <p className="text-xl font-medium text-[#111111]">Standard Delivery</p>
                      <p className="text-[#6B7280]">5-7 business days</p>
                      <p className="text-xl mt-2 font-serif text-[#111111]">Free</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setDeliveryType("express")}
                  className={`rounded-[22px] border p-6 text-left ${
                    deliveryType === "express" ? "border-[#111111] bg-[#f3f0f0]" : "border-[#E6E6E6]"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0">
                      <Zap size={22} />
                    </span>
                    <div>
                      <p className="text-xl font-medium text-[#111111]">Express Delivery</p>
                      <p className="text-[#6B7280]">1-2 business days</p>
                      <p className="text-xl mt-2 font-serif text-[#111111]">{"\u20B9"}500</p>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          </div>

          <aside className="bg-[#FFFFFF] rounded-[28px] p-8 border border-[#E6E6E6] self-start h-fit">
            <h2 className="text-2xl font-serif text-[#111111] mb-6">Order Summary</h2>

            <div className="space-y-4 text-[#6B7280] text-lg">
              <div className="flex justify-between">
                <span>Subtotal ({cartItems.length} items)</span>
                <span>{"\u20B9"}{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{shippingCost === 0 ? "Free" : `\u20B9${shippingCost.toLocaleString("en-IN")}`}</span>
              </div>
            </div>

            <div className="border-t border-[#E6E6E6] mt-6 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-serif text-[#111111]">Total</span>
                <span className="text-2xl font-serif text-[#111111]">{"\u20B9"}{total.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={cartItems.length === 0}
              className="w-full h-14 rounded-2xl bg-[#111111] text-white text-base font-semibold mt-6 hover:bg-[#111111] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Place Order <ArrowRight size={22} />
            </button>

            <p className="text-center text-sm text-[#6B7280] mt-5">Secure checkout powered by Razorpay</p>

            <div className="mt-6 pt-6 border-t border-[#E6E6E6]">
              <label className="block text-base text-[#111111] mb-3">Promo Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter code"
                  className="flex-1 h-12 rounded-full bg-[#E6E6E6] px-4 border border-[#E6E6E6] outline-none"
                />
                <button className="h-12 px-6 rounded-full border border-[#111111] text-[#6B7280]">Apply</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="mt-8">
        <Footer />
      </div>
    </div>
  );
};

export default CheckoutPage;










