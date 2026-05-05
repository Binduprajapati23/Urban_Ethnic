import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  CircleAlert,
  Clock3,
  Shield,
  Truck,
  Upload,
  ArrowRight,
} from "lucide-react";
import Footer from "../components/Footer";
import { requestJson } from "../utils/http";

const SECURITY_DEPOSIT = 5000;
const DEFAULT_CHECKOUT_ADDRESS = {
  fullName: "",
  phone: "",
  street: "",
  city: "",
  pincode: "",
  saveAddress: false,
};

const parseIsoDate = (value) => {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
};

const addDaysIso = (isoDate, daysToAdd) => {
  const parsed = parseIsoDate(isoDate);
  const delta = Number(daysToAdd);
  if (!parsed || !Number.isFinite(delta)) return "";
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  base.setUTCDate(base.getUTCDate() + Math.trunc(delta));
  return base.toISOString().slice(0, 10);
};

const computeReturnDate = ({ startDate, selectedDays }) => {
  const days = Number(selectedDays);
  if (!startDate) return "";
  if (!Number.isFinite(days) || days <= 0) return "";
  return addDaysIso(startDate, Math.max(0, Math.trunc(days) - 1));
};

const RentalCheckout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "http://localhost:5000").replace(/\/$/, "");

  const selected = location.state?.product || {};
  const selectedDays = Number(location.state?.selectedDays) || 3;
  const defaultStartDate = location.state?.rentalDate || "";
  const defaultPricePerDay = Number(location.state?.pricePerDay) || 4500;

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [idFileName, setIdFileName] = useState("");
  const [address, setAddress] = useState(() => ({ ...DEFAULT_CHECKOUT_ADDRESS }));

  const product = {
    id: selected.id || "rental-item",
    name: selected.name || "Royal Kundan Bridal Necklace Set",
    size: selected.size || location.state?.selectedSize || "Free Size",
    image:
      selected.img ||
      "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg",
    pricePerDay: defaultPricePerDay,
  };

  const rentalTotal = product.pricePerDay * selectedDays;
  const totalPayable = rentalTotal + SECURITY_DEPOSIT;
  const minDate = new Date().toISOString().split("T")[0];
  const computedReturnDate = useMemo(
    () => computeReturnDate({ startDate, selectedDays }),
    [selectedDays, startDate]
  );

  const formattedStartDate = useMemo(() => {
    if (!startDate) return "";
    return new Date(`${startDate}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [startDate]);

  const formattedReturnDate = useMemo(() => {
    if (!computedReturnDate) return "";
    return new Date(`${computedReturnDate}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [computedReturnDate]);

  const handleAddressChange = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAddressToggle = (checked) => {
    setAddress((prev) => ({ ...prev, saveAddress: checked }));
  };

  const handleIdFileChange = (e) => {
    const file = e.target.files?.[0];
    setIdFileName(file ? file.name : "");
  };

  const handleRemoveIdFile = () => {
    setIdFileName("");
  };

  const extractNumericId = (value) => {
    const match = String(value ?? "").trim().match(/\d+/);
    return match ? match[0] : "";
  };

  const handleProceedToPayment = async () => {
    const fullName = address.fullName.trim();
    const street = address.street.trim();
    const city = address.city.trim();
    const phoneDigits = address.phone.replace(/\D/g, "");
    const pincodeDigits = address.pincode.replace(/\D/g, "");

    if (!startDate || !computedReturnDate) {
      alert("Please select rental start and return date");
      return;
    }

    if (new Date(computedReturnDate) < new Date(startDate)) {
      alert("Return date cannot be before start date");
      return;
    }

    if (!fullName || !street || !city || !phoneDigits || !pincodeDigits) {
      alert("Please fill all delivery address details");
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

    if (!idFileName) {
      alert("Please upload a valid ID proof to continue");
      return;
    }

    const productId = extractNumericId(product.id);
    if (productId && startDate && computedReturnDate) {
      try {
        const qs = new URLSearchParams();
        qs.set("pickupDate", startDate);
        qs.set("returnDate", computedReturnDate);
        const payload = await requestJson(
          `${API_BASE}/api/products/${encodeURIComponent(productId)}/rental-availability?${qs.toString()}`
        );
        if (payload?.available === false) {
          alert(String(payload?.message || "This product is already booked (sold out) for the selected dates."));
          return;
        }
      } catch (err) {
        alert(String(err?.body?.message || err?.message || "Unable to verify availability. Please try again."));
        return;
      }
    }

    navigate("/payment", {
      state: {
        checkoutType: "rent",
        product: {
          id: product.id,
          name: product.name,
          image: product.image,
          size: product.size,
        },
        selectedDays,
        pricePerDay: product.pricePerDay,
        securityDeposit: SECURITY_DEPOSIT,
        rentalAmount: rentalTotal,
        totalPayable,
        rentalDate: startDate,
        returnDate: computedReturnDate,
        address: {
          fullName,
          phone: phoneDigits,
          street,
          city,
          pincode: pincodeDigits,
          saveAddress: address.saveAddress,
        },
        idProof: idFileName,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <div className="max-w-7xl mx-auto py-10 px-4 md:px-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#111111] hover:text-[#111111] transition-colors mb-8"
        >
          <ArrowLeft size={20} />
          Back to Product
        </button>

        <h1 className="text-3xl md:text-4xl font-serif text-[#111111] ml-3 mb-8">Rental Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-8 items-start">
          <div className="space-y-8">
            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
                  <Clock3 size={22} />
                </span>
                <h2 className="text-xl md:text-2xl leading-none font-serif text-[#111111]">Rental Details</h2>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-7">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-32 h-32 rounded-3xl object-cover"
                />
                <div>
                  <h3 className="text-xl font-serif text-[#111111]">{product.name}</h3>
                  <p className="text-[#6B7280] text-sm mt-1">Size: {product.size}</p>
                  <p className="text-[#6B7280] text-lg mt-1">
                    {"\u20B9"}{product.pricePerDay.toLocaleString("en-IN")}/day x {selectedDays} days
                  </p>
                  <p className="text-3xl font-serif text-[#111111] mt-2">
                    {"\u20B9"}{rentalTotal.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="block">
                  <span className="text-[#111111] text-lg font-serif">Start Date</span>
                  <span className="mt-2 h-14 rounded-2xl border-2 border-[#111111] bg-[#FFFFFF] flex items-center gap-3 px-5 text-[#6B7280]">
                    <Calendar size={22} />
                    <input
                      type="date"
                      value={startDate}
                      min={minDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-transparent outline-none w-full"
                    />
                  </span>
                  {formattedStartDate && (
                    <p className="text-xs text-[#6B7280] mt-2">Selected: {formattedStartDate}</p>
                  )}
                </label>

                <label className="block">
                  <span className="text-[#111111] text-lg font-serif">Return Date</span>
                  <span className="mt-2 h-14 rounded-2xl border-2 border-[#111111] bg-[#FFFFFF] flex items-center gap-3 px-5 text-[#6B7280]">
                    <Calendar size={22} />
                    <input
                      type="date"
                      value={computedReturnDate}
                      min={startDate || minDate}
                      onChange={() => {}}
                      readOnly
                      className="bg-transparent outline-none w-full"
                    />
                  </span>
                  {formattedReturnDate && (
                    <p className="text-xs text-[#6B7280] mt-2">Selected: {formattedReturnDate}</p>
                  )}
                </label>
              </div>
            </section>

            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
                  <Truck size={22} />
                </span>
                <h2 className="text-xl md:text-2xl leading-none font-serif text-[#111111]">Delivery Address</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={address.fullName}
                  onChange={(e) => handleAddressChange("fullName", e.target.value)}
                  placeholder="Enter your name"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] outline-none border border-[#E6E6E6]"
                />
                <input
                  value={address.phone}
                  onChange={(e) => handleAddressChange("phone", e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] outline-none border border-[#E6E6E6]"
                />
                <input
                  value={address.street}
                  onChange={(e) => handleAddressChange("street", e.target.value)}
                  placeholder="House / Flat / Street"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] outline-none border border-[#E6E6E6] md:col-span-2"
                />
                <input
                  value={address.city}
                  onChange={(e) => handleAddressChange("city", e.target.value)}
                  placeholder="City"
                  className="h-14 rounded-2xl bg-[#E6E6E6] px-5 text-[#111111] outline-none border border-[#E6E6E6]"
                />
                <input
                  value={address.pincode}
                  onChange={(e) => handleAddressChange("pincode", e.target.value)}
                  placeholder="XXXXXX"
                  className="h-14 rounded-full bg-[#E6E6E6] px-5 text-[#111111] outline-none border border-[#E6E6E6]"
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

            <section className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-12 h-12 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
                  <Shield size={22} />
                </span>
                <h2 className="text-xl md:text-2xl leading-none font-serif text-[#111111]">ID Verification</h2>
              </div>
              <p className="text-[#6B7280] mb-5">
                A valid government ID is required for all rental orders. Your ID is encrypted and
                stored securely.
              </p>

              {idFileName ? (
                <div className="rounded-[20px] bg-[#f3f0f0] border-2 border-[#111111] px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0">
                      <Shield size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[#111111] text-base truncate">{idFileName}</p>
                      <p className="text-[#6B7280] text-sm">Uploaded successfully</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveIdFile}
                    className="text-[#6B7280] text-[11px] leading-none px-1.5 py-0.5 rounded hover:text-[#111111] hover:bg-[#E6E6E6] transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-[#111111] rounded-[28px] bg-[#E6E6E6] p-10 flex flex-col items-center justify-center text-center cursor-pointer">
                  <span className="w-14 h-14 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center mb-4">
                    <Upload size={24} />
                  </span>
                  <p className="text-[#111111] text-base">Upload Aadhar / PAN Card</p>
                  <p className="text-xs text-[#6B7280] mt-1">JPG, PNG or PDF (max 5MB)</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handleIdFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </section>

            <section className="bg-[#FFFFFF] rounded-2xl px-6 py-4 md:px-7 md:py-4 border border-[#E6E6E6] shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow">
              <button
                onClick={() => setIsDepositOpen((prev) => !prev)}
                className="w-full flex items-center justify-between"
              >
                <span className="flex items-center gap-4">
                  <span className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
                    <CircleAlert size={18} />
                  </span>
                  <h2 className="text-base md:text-lg leading-none font-serif text-[#111111]">
                    Security Deposit
                  </h2>
                </span>
                <ChevronDown
                  className={`text-[#6B7280] transition-transform ${isDepositOpen ? "rotate-180" : ""}`}
                  size={20}
                />
              </button>

              {isDepositOpen && (
                <div className="mt-6 rounded-3xl bg-[#f3f0f0] p-6 border border-[#E6E6E6]">
                  <p className="text-[#111111] text-lg font-medium mb-2">Fully Refundable Deposit</p>
                  <p className="text-[#6B7280] mb-4">
                    A refundable security deposit of {"\u20B9"}{SECURITY_DEPOSIT.toLocaleString("en-IN")} is required.
                    This will be refunded within 5-7 business days after the item is returned in original condition.
                  </p>
                  <p className="text-[#6B7280]">
                    Deductions may apply for damages, missing components, or late returns.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside
            className="bg-[#FFFFFF] rounded-[28px] p-7 border border-[#E6E6E6] self-start h-fit shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-shadow"
            style={{ position: "static" }}
          >
            <h2 className="text-xl md:text-2xl leading-none font-serif text-[#111111] mb-6">
              Payment Summary
            </h2>

            <div className="space-y-4 text-[#6B7280]">
              <div className="flex justify-between text-lg">
                <span className="text-base">Rental ({selectedDays} days)</span>
                <span>{"\u20B9"}{rentalTotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-base">Security Deposit</span>
                <span>{"\u20B9"}{SECURITY_DEPOSIT.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-base">Delivery</span>
                <span>Free</span>
              </div>
            </div>

            <div className="border-t border-[#E6E6E6] mt-6 pt-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl leading-none font-serif text-[#111111]">Total Payable</p>
                  <p className="text-[#6B7280] text-sm mt-2">
                    Includes {"\u20B9"}{SECURITY_DEPOSIT.toLocaleString("en-IN")} refundable deposit
                  </p>
                </div>
                <p className="text-3xl leading-none font-serif text-[#111111]">
                  {"\u20B9"}{totalPayable.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            <button
              onClick={handleProceedToPayment}
              className="w-full h-12 rounded-2xl bg-[#111111] text-white text-sm md:text-base font-semibold mt-6 hover:bg-[#111111] transition-colors flex items-center justify-center gap-2"
            >
              PROCEED TO PAYMENT
              <ArrowRight size={18} />
            </button>

            <p className="text-center text-xs text-[#6B7280] mt-5">Secure checkout powered by Razorpay</p>
          </aside>
        </div>
      </div>
      <div className="mt-8">
        <Footer />
      </div>
    </div>
  );
};

export default RentalCheckout;










