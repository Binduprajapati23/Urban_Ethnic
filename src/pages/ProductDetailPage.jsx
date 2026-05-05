import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {Heart,Share2,ChevronLeft,ChevronRight,ChevronDown,CheckCircle2,CalendarDays,Truck,Shield,AlertCircle,Package,Sparkles,Wind,Hand,Droplets,Sun,Flame,Plus,Minus,ShoppingBag,Calendar,
} from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { requestJson } from "../utils/http";
import Footer from '../components/Footer';
import { addToWishlist, canUseWishlist, getWishlistItems } from '../utils/wishlist';
import { addToCart, canUseCart } from '../utils/cart';
import { fetchAdminProducts } from '../utils/adminProductsApi';

const ProductDetailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || 'http://localhost:5000').replace(/\/$/, '');
  const selectedProduct = location.state?.product;
  const inStock = selectedProduct?.inStock !== false;
  const [quantity, setQuantity] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [isRent, setIsRent] = useState(true);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isCareGuideOpen, setIsCareGuideOpen] = useState(false);
  const [openPolicyItem, setOpenPolicyItem] = useState('');
  const [wishlistedIds, setWishlistedIds] = useState(
    () => new Set(getWishlistItems().map((item) => String(item.id)))
  );
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, selectedProduct?.id]);

  const parseAmount = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    const numeric = Number(String(value).replace(/[^0-9]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  };

  const price = parseAmount(selectedProduct?.price, 85000);
  const pricePerDay = parseAmount(selectedProduct?.rent, 4500);
  const productCity = String(selectedProduct?.city || "").trim();

  const normalizeCity = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\b\d{5,6}\b/g, " ")
      .replace(/[()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const extractCityCandidate = useCallback((value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const withoutPincode = text
      .replace(/\b\d{5,6}\b/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*,\s*$/, "")
      .trim();
    if (!withoutPincode) return "";
    const commaParts = withoutPincode
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return commaParts.length > 0 ? commaParts[commaParts.length - 1] : withoutPincode;
  }, []);

  const readLocalUserCity = () => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      const direct = String(user?.city || "").trim();
      if (direct) return direct;
      return "";
    } catch {
      return "";
    }
  };

  const customerIdentity = useMemo(() => {
    if (isClerkLoaded && isSignedIn) {
      const clerkId = String(clerkUser?.id || "").trim();
      const email = String(clerkUser?.primaryEmailAddress?.emailAddress || "")
        .trim()
        .toLowerCase();
      return { clerkId, email };
    }

    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      const clerkId = String(user?.id || "").trim();
      const email = String(user?.email || "")
        .trim()
        .toLowerCase();
      return { clerkId, email };
    } catch {
      return { clerkId: "", email: "" };
    }
  }, [clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, isClerkLoaded, isSignedIn]);

  const [userCity, setUserCity] = useState(() => readLocalUserCity());
  const [userCityLoading, setUserCityLoading] = useState(false);

  useEffect(() => {
    if (readLocalUserCity()) return undefined;
    if (!customerIdentity.email && !customerIdentity.clerkId) return undefined;

    let cancelled = false;

    const refresh = async () => {
      const qs = new URLSearchParams();
      if (customerIdentity.email) qs.set("email", customerIdentity.email);
      if (customerIdentity.clerkId) qs.set("clerkId", customerIdentity.clerkId);

      setUserCityLoading(true);
      try {
        const res = await requestJson(`${API_BASE}/api/users/addresses?${qs.toString()}`);
        const rows = Array.isArray(res?.addresses) ? res.addresses : [];
        const nextCity =
          rows.map((row) => extractCityCandidate(row?.line2)).find(Boolean) ||
          rows.map((row) => extractCityCandidate(row?.line1)).find(Boolean) ||
          "";
        if (!cancelled) setUserCity(nextCity);
      } catch {
        // keep existing city on failures
      } finally {
        if (!cancelled) setUserCityLoading(false);
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [API_BASE, customerIdentity.clerkId, customerIdentity.email, extractCityCandidate]);

  const hasRentPrice = Number(pricePerDay || 0) > 0;
  const shouldEnforceCity = Boolean(normalizeCity(productCity)) && Boolean(customerIdentity.email || customerIdentity.clerkId);
  const rentCityMatch =
    Boolean(normalizeCity(productCity)) &&
    Boolean(normalizeCity(userCity)) &&
    normalizeCity(productCity) === normalizeCity(userCity);
  const rentAllowed =
    hasRentPrice &&
    (!shouldEnforceCity || !userCity || rentCityMatch) &&
    (!shouldEnforceCity || !userCityLoading);

  useEffect(() => {
    if (!rentAllowed) setIsRent(false);
  }, [rentAllowed]);

  const productCategory = selectedProduct?.category || 'JEWELLERY';
  const normalizedCategory = String(productCategory).toLowerCase();
  const isSizeApplicable =
    normalizedCategory.includes('lehenga') ||
    normalizedCategory.includes('saree') ||
    normalizedCategory.includes('dress') ||
    normalizedCategory.includes('gown') ||
    normalizedCategory.includes('kurta') ||
    normalizedCategory.includes('sharara') ||
    normalizedCategory.includes('traditional wear') ||
    normalizedCategory.includes('ethnic wear') ||
    normalizedCategory.includes('clothing') ||
    normalizedCategory.includes('apparel');
  const productName = selectedProduct?.name || 'Royal Kundan Bridal Necklace Set';
  const productDescription =
    selectedProduct?.description ||
    'A magnificent kundan bridal set featuring intricate craftsmanship with uncut diamonds, pearls, and 22k gold plating. This heirloom-quality piece includes a statement necklace, matching earrings, and maang tikka.';
  const [selectedDays, setSelectedDays] = useState(3);
  const [rentalDate, setRentalDate] = useState('');
  const [showRentalDateError, setShowRentalDateError] = useState(false);
  const [rentalAvailability, setRentalAvailability] = useState({
    checked: false,
    loading: false,
    available: true,
    message: '',
  });
  const sizeOptions = ['XS', 'S', 'M', 'L', 'XL'];
  const [selectedSize, setSelectedSize] = useState('M');
  const effectiveSize = isSizeApplicable ? selectedSize : 'Free Size';

  const durations = [2, 3, 5, 7];
  const totalPrice = pricePerDay * selectedDays;
  const buySubtotal = price * quantity;
  const minDate = new Date().toISOString().split('T')[0];

  const rentalReturnDate = useMemo(() => {
    const startDate = String(rentalDate || '').trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
    const base = new Date(Date.UTC(year, month - 1, day));
    const normalizedStart = base.toISOString().slice(0, 10);
    if (normalizedStart !== startDate) return '';
    const days = Number(selectedDays);
    if (!Number.isFinite(days) || days <= 0) return '';
    base.setUTCDate(base.getUTCDate() + Math.max(0, Math.trunc(days) - 1));
    return base.toISOString().slice(0, 10);
  }, [rentalDate, selectedDays]);
  const policyItems = [
    {
      id: 'duration',
      title: 'Rental Duration & Booking',
      icon: CalendarDays,
      points: [
        'Minimum rental period is 2 days, maximum 7 days',
        'Book at least 5 days in advance for availability',
        'Extensions available upon request (subject to availability)',
        'Same-day bookings not accepted',
      ],
    },
    {
      id: 'delivery',
      title: 'Delivery & Return Process',
      icon: Truck,
      points: [
        'Free delivery within city limits for orders above \u20B95,000',
        'Items delivered 1 day before your event date',
        'Return pickup scheduled on the day after event',
        'Self-pickup available from our boutique',
      ],
    },
    {
      id: 'deposit',
      title: 'Security Deposit',
      icon: Shield,
      points: [
        "Refundable deposit of 30% of item's buy price",
        'Deposit returned within 3-5 business days after return',
        'Paid via UPI, card, or bank transfer',
        'Deposit held until item inspection is complete',
      ],
    },
    {
      id: 'damage',
      title: 'Damage & Late Return',
      icon: AlertCircle,
      points: [
        'Minor wear is expected and not charged',
        'Significant damage assessed on case-by-case basis',
        'Late returns charged at 1.5x daily rental rate',
        'Lost items charged at full replacement value',
      ],
    },
  ];

  const extractNumericId = (value) => {
    const match = String(value ?? "").trim().match(/\d+/);
    return match ? match[0] : "";
  };

  const currentProductId = extractNumericId(params.id) || extractNumericId(selectedProduct?.id);

  useEffect(() => {
    if (!isRent || !inStock || !rentAllowed) {
      setRentalAvailability({ checked: false, loading: false, available: true, message: '' });
      return;
    }
    if (!currentProductId || !rentalDate || !rentalReturnDate) {
      setRentalAvailability({ checked: false, loading: false, available: true, message: '' });
      return;
    }

    let cancelled = false;

    const check = async () => {
      setRentalAvailability((prev) => ({ ...prev, loading: true, message: '' }));
      const qs = new URLSearchParams();
      qs.set('pickupDate', rentalDate);
      qs.set('returnDate', rentalReturnDate);
      try {
        const payload = await requestJson(
          `${API_BASE}/api/products/${encodeURIComponent(currentProductId)}/rental-availability?${qs.toString()}`
        );
        const available = Boolean(payload?.available);
        if (cancelled) return;
        setRentalAvailability({
          checked: true,
          loading: false,
          available,
          message: available ? '' : String(payload?.message || 'Sold out for the selected dates.'),
        });
      } catch (err) {
        if (cancelled) return;
        setRentalAvailability({
          checked: true,
          loading: false,
          available: false,
          message: String(err?.body?.message || err?.message || 'Failed to check availability'),
        });
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, currentProductId, inStock, isRent, rentAllowed, rentalDate, rentalReturnDate]);

  useEffect(() => {
    if (!currentProductId) {
      setRelatedProducts([]);
      setRelatedLoading(false);
      setRelatedError("");
      return;
    }

    let alive = true;

    const fetchRelated = async () => {
      setRelatedLoading(true);
      setRelatedError("");
      try {
        const data = await requestJson(
          `http://localhost:5000/api/products/related/${encodeURIComponent(currentProductId)}?limit=6`
        );
        const rows = Array.isArray(data?.products) ? data.products : [];
        let nextRows = rows;

        if (nextRows.length === 0) {
          const all = await fetchAdminProducts();
          const normalizedCurrentId = String(currentProductId);
          const normalizedCategory = String(productCategory || "").trim().toLowerCase();

          const candidates = all
            .filter((item) => item?.inStock !== false && String(item?.id || "") !== normalizedCurrentId)
            .filter((item) => Boolean(item?.image || item?.images?.[0]));

          const categoryMatches = candidates.filter(
            (item) => String(item?.category || "").trim().toLowerCase() === normalizedCategory
          );

          nextRows = (categoryMatches.length ? categoryMatches : candidates).slice(0, 6);
        }
        if (!alive) return;
        setRelatedProducts(nextRows);
        setRelatedLoading(false);
      } catch (err) {
        console.log("Failed to fetch related products:", err?.body || err.message);
        if (!alive) return;
        setRelatedProducts([]);
        setRelatedLoading(false);
        setRelatedError("Failed to load related products.");
      }
    };

    fetchRelated();
    return () => {
      alive = false;
    };
  }, [currentProductId, productCategory]);

  const formatDate = (value) => {
    if (!value) return '';
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const defaultImage = 'https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg';
  const productImages = Array.isArray(selectedProduct?.images) ? selectedProduct.images.filter(Boolean) : [];
  const selectedImage = productImages[0] || selectedProduct?.img || defaultImage;
  const images = productImages.length > 0 ? productImages : [selectedImage];

  useEffect(() => {
    setActiveImg(0);
  }, [selectedProduct?.id]);

  const nextImage = () => setActiveImg((prev) => (prev + 1) % images.length);
  const prevImage = () => setActiveImg((prev) => (prev - 1 + images.length) % images.length);
  const makeWishlistId = (id, name) => `${id}-${name}`;
  const addItemToWishlist = (item) => {
    if (!canUseWishlist()) {
      alert("Admin account cannot add products to wishlist.");
      return;
    }
    const added = addToWishlist(item);
    if (added) {
      setWishlistedIds((prev) => new Set(prev).add(String(item.id)));
    }
  };

  const handleMainWishlistClick = () => {
    const wishlistId = makeWishlistId(selectedProduct?.id ?? 'product', productName);
    addItemToWishlist({
      id: wishlistId,
      name: productName,
      image: selectedImage,
      rentPrice: pricePerDay,
      buyPrice: price,
      category: productCategory,
    });
  };

  const handleRelatedWishlistClick = (item) => {
    const wishlistId = makeWishlistId(item.id, item.name);
    addItemToWishlist({
      id: wishlistId,
      name: item.name,
      image: item.image,
      rentPrice: Number(item.rentPrice || 0),
      buyPrice: Number(item.buyPrice || 0),
      category: item.category,
    });
  };

  const handleRelatedProductClick = (item) => {
    navigate(`/product/${item.id}`, {
      state: {
        product: {
          id: item.id,
          img: item.image,
          images: Array.isArray(item.images) && item.images.length > 0 ? item.images : [item.image].filter(Boolean),
          category: item.category,
          name: item.name,
          description: item.description || '',
          price: item.buyPrice,
          rent: item.rentPrice,
        },
      },
    });
  };

  const isLoggedIn = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      return Boolean(user?.id || user?.email);
    } catch {
      return false;
    }
  };

  const handleReserveNow = () => {
    if (!inStock) {
      alert("This product is sold out right now.");
      return;
    }
    if (!rentalDate) {
      setShowRentalDateError(true);
      return;
    }
    if (rentalAvailability.checked && !rentalAvailability.available) {
      alert(rentalAvailability.message || "This product is already booked (sold out) for the selected dates.");
      return;
    }

    const rentalCheckoutState = {
      product: {
        id: selectedProduct?.id ?? 'product',
        name: productName,
        img: selectedImage,
        category: productCategory,
        size: effectiveSize,
      },
      selectedDays,
      rentalDate,
      pricePerDay,
      selectedSize: effectiveSize,
    };

    if (!isLoggedIn()) {
      navigate('/login', {
        state: {
          redirectTo: '/rental-checkout',
          redirectState: rentalCheckoutState,
        },
      });
      return;
    }

    navigate('/rental-checkout', {
      state: rentalCheckoutState,
    });
  };

  const handleAddToCart = () => {
    if (!inStock) {
      alert("This product is sold out right now.");
      return;
    }
    if (!canUseCart()) {
      alert("Admin account cannot add products to cart.");
      return;
    }

    const cartItem = {
      id: selectedProduct?.id ?? 'product',
      name: productName,
      image: selectedImage,
      price,
      quantity,
      mode: 'buy',
      size: effectiveSize,
    };

    if (!isLoggedIn()) {
      navigate('/login', {
        state: {
          redirectTo: '/cart',
          redirectState: {
            postLoginAction: 'add_to_cart',
            cartItem,
          },
        },
      });
      return;
    }

    addToCart(cartItem);

    navigate('/cart');
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0] font-serif text-black/80">
      <main className="max-w-[1440px] mx-auto px-6 md:px-12 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
        <div className="space-y-6">
          <div className="relative aspect-5/6 mt-10 bg-white rounded-3xl overflow-hidden shadow-sm">
            <img
              src={images[activeImg]}
              className="w-full h-full object-cover mix-blend-multiply"
              alt={selectedProduct?.name || "Jewellery"}
            />

            <div className="absolute top-6 right-6 flex gap-3">
              <button
                onClick={handleMainWishlistClick}
                className="p-3 bg-white/90 rounded-full shadow-sm hover:bg-white transition-all"
              >
                <Heart
                  size={20}
                  className={`${
                    wishlistedIds.has(String(makeWishlistId(selectedProduct?.id ?? 'product', productName)))
                      ? 'text-black fill-black'
                      : 'text-gray-600'
                  }`}
                />
              </button>
              <button className="p-3 bg-white/90 rounded-full shadow-sm hover:bg-white transition-all">
                <Share2 size={20} className="text-gray-600" />
              </button>
            </div>

            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full shadow-md"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full shadow-md"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="flex gap-4">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border-2 transition-all ${
                  activeImg === i
                    ? 'border-black/40 ring-4 ring-black/10'
                    : 'border-transparent'
                }`}
              >
                <img src={img} className="w-full h-full object-cover" alt={`Thumbnail ${i + 1}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col mt-5 py-2">
          <span className="text-xs md:text-sm tracking-[0.2em] text-black/70 uppercase opacity-75 mb-2">
            {productCategory}
          </span>
          <h2 className="text-2xl md:text-3xl font-semibold mb-4 text-black">
            {productName}
          </h2>
          {!inStock && (
            <div className="mb-5">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white border border-black/15 text-black">
                Sold out
              </span>
            </div>
          )}
          <p className="text-black/60 font-serif leading-relaxed mb-8 text-sm md:text-base max-w-none">
            {productDescription}
          </p>

          {rentAllowed ? (
            <div className="flex bg-black/5 p-1.5 rounded-2xl w-full max-w-none mb-8">
              <button
                onClick={() => setIsRent(true)}
                className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                  isRent ? 'bg-white shadow-sm text-black/80' : 'text-black/60'
                }`}
              >
                Rent
              </button>

              <button
                onClick={() => setIsRent(false)}
                className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                  !isRent ? 'bg-white shadow-sm text-black/80' : 'text-black/60'
                }`}
              >
                Buy
              </button>
            </div>
          ) : null}

          {isRent ? (
            <div className="w-full max-w-none rounded-[22px] bg-[#FFFFFF] p-4 md:p-6 shadow-sm">
              {!rentAllowed ? (
                <p className="text-black/60 text-[14px] md:text-[16px]">
                  Rent not available{userCity && productCity ? ` in ${userCity}` : ""}.
                </p>
              ) : (
              <p className="text-black/60 text-[14px] ml-3 md:text-[16px] mb-1">Rental Price</p>
              )}
              {rentAllowed ? (
              <h3 className="text-black text-[28px] md:text-[34px] leading-none font-semibold mb-4">
                {'\u20B9'}{pricePerDay.toLocaleString('en-IN')}
                <span className="text-[18px] md:text-[22px] font-normal text-black/50">/day</span>
              </h3>
              ) : null}

              <p className="text-black/60 text-[16px] ml-3 md:text-[18px] mb-3">Rental Duration</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {durations.map((day) => {
                  const active = selectedDays === day;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDays(day)}
                      className={`h-10 md:h-11 rounded-2xl text-[15px] md:text-[18px] transition-all ${
                        active
                          ? 'bg-[#111111] text-white'
                          : 'bg-black/5 text-black/80 hover:bg-black/10'
                      }`}
                    >
                      {day} Days
                    </button>
                  );
                })}
              </div>

              <p className="text-black/60 text-[16px] ml-3 md:text-[18px] mb-2">Select Dates</p>
              <label
                className={`relative w-full h-10 md:h-11 rounded-2xl px-4 md:px-5 text-left text-[16px] md:text-[18px] flex items-center gap-3 mb-2 cursor-pointer border ${
                  showRentalDateError && !rentalDate
                    ? 'bg-[#FFECEC] border-[#E35D5D] text-[#B64949]'
                    : 'bg-white border-black/10 text-black/80'
                }`}
              >
                <Calendar className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {rentalDate ? formatDate(rentalDate) : 'Choose your rental dates'}
                </span>
                <input
                  type="date"
                  value={rentalDate}
                  min={minDate}
                  onChange={(e) => {
                    setRentalDate(e.target.value);
                    if (e.target.value) {
                      setShowRentalDateError(false);
                    }
                  }}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="absolute inset-0 z-10 opacity-0 cursor-pointer"
                />
              </label>
              {showRentalDateError && !rentalDate && (
                <p className="text-[#C14A4A] text-xs mb-3 ml-1">Please select rental date first</p>
              )}
              {!showRentalDateError && <div className="mb-3" />}
              {rentalAvailability.loading && (
                <p className="text-xs mb-3 ml-1 text-black/60">Checking availability…</p>
              )}
              {rentalAvailability.checked && !rentalAvailability.available && !rentalAvailability.loading && (
                <p className="text-xs mb-3 ml-1 text-[#C14A4A]">
                  {rentalAvailability.message || 'Sold out for the selected dates. Please choose another date.'}
                </p>
              )}

              {isSizeApplicable && (
                <>
                  <p className="text-black/60 text-[16px] ml-3 md:text-[18px] mb-3">Select Size</p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                    {sizeOptions.map((size) => {
                      const active = selectedSize === size;
                      return (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`h-10 md:h-11 rounded-2xl text-[15px] md:text-[18px] transition-all ${
                            active
                              ? 'bg-[#111111] text-white'
                              : 'bg-black/5 text-black/80 hover:bg-black/10'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className=" mt-3 mb-3 flex justify-between items-center">
                <p className="text-[15px] ml-3 md:text-[18px]">Total for {selectedDays} days</p>
                <p className="text-[20px] md:text-[24px] leading-none font-semibold">
                  {'\u20B9'}{totalPrice.toLocaleString('en-IN')}
                </p>
              </div>

              <button
                onClick={handleReserveNow}
                disabled={!inStock || !rentAllowed || rentalAvailability.loading || (rentalAvailability.checked && !rentalAvailability.available)}
                className={[
                  "w-full h-12 rounded-[16px] text-base font-semibold tracking-wide transition-colors flex items-center justify-center gap-3",
                  inStock && rentAllowed && !(rentalAvailability.checked && !rentalAvailability.available) && !rentalAvailability.loading
                    ? "bg-[#111111] text-white hover:bg-black"
                    : "bg-black/15 text-black/50 cursor-not-allowed",
                ].join(" ")}
              >
                <Calendar className="h-5 w-5 md:h-5 md:w-5" />
                RESERVE NOW
              </button>
            </div>
          ) : (
            <div className="w-full max-w-none rounded-[22px] bg-[#FFFFFF] p-4 md:p-6 shadow-sm">
              {isSizeApplicable && (
                <>
                  <p className="text-black/60 text-[16px] md:text-[18px] ml-3 mb-3">Select Size</p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                    {sizeOptions.map((size) => {
                      const active = selectedSize === size;
                      return (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`h-10 md:h-11 rounded-2xl text-[15px] md:text-[18px] transition-all ${
                            active
                              ? 'bg-[#111111] text-white'
                              : 'bg-black/5 text-black/80 hover:bg-black/10'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <p className="text-black/60 text-[14px] md:text-[16px] ml-3 mb-1">Buy Price</p>
              <h3 className="text-black text-[26px] md:text-[30px] leading-none font-semibold mb-5">
                {'\u20B9'}{price.toLocaleString('en-IN')}
              </h3>

              <p className="text-black/60 text-[16px] md:text-[18px] ml-3 mb-3">Quantity</p>
              <div className="flex items-center gap-7 mb-5">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/5 text-black/80 flex items-center justify-center hover:bg-black/10 transition-colors"
                >
                  <Minus size={24} />
                </button>
                <span className="text-black text-[22px] md:text-[26px] leading-none min-w-8 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/5 text-black/80 flex items-center justify-center hover:bg-black/10 transition-colors"
                >
                  <Plus size={24} />
                </button>
              </div>

              <div className="border-t border-black/10 pt-3 mb-3 flex justify-between items-center text-black/80">
                <p className="text-[16px] ml-3 md:text-[22px]">Subtotal</p>
                <p className="text-[22px] md:text-[30px] leading-none font-semibold">
                  {'\u20B9'}{buySubtotal.toLocaleString('en-IN')}
                </p>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={!inStock}
                className={[
                  "w-full h-12 rounded-[16px] text-base font-semibold tracking-wide transition-colors flex items-center justify-center gap-3",
                  inStock ? "bg-[#111111] text-white hover:bg-black" : "bg-black/15 text-black/50 cursor-not-allowed",
                ].join(" ")}
              >
                <ShoppingBag className="h-5 w-5 md:h-5 md:w-5" />
                ADD TO CART
              </button>
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            <div>
              <h3 className="text-[18px] md:text-[24px] text-black mb-3">Product Features</h3>
              <ul className="space-y-2 text-black/60 text-[14px] md:text-[18px]">
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>22K Gold Plated</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Genuine Kundan Stones</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Freshwater Pearls</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Set of 3 pieces</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Comes in premium box</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-[18px] md:text-[24px] text-black mb-3">Rental Includes</h3>
              <ul className="space-y-2 text-black/60 text-[14px] md:text-[18px]">
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Professional cleaning before &nbsp;after</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Insurance coverage</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Free alterations for earrings</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-black/70 font-semibold">&#10003;</span>
                  <span>Complimentary storage pouch</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
        </div>

        <div className="mt-10 space-y-5">
          <button
            onClick={() => setIsPolicyOpen((prev) => !prev)}
            className="w-full rounded-3xl bg-white border border-black/10 px-6 py-2.5 md:py-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-4">
              <span className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-black/5 text-black/70 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </span>
              <span className="text-black text-[14px] md:text-[18px]">Rental Policy</span>
            </div>
            <ChevronDown className={`text-black/70 transition-transform ${isPolicyOpen ? 'rotate-180' : ''}`} size={22} />
          </button>

          {isPolicyOpen && (
            <div className="w-full rounded-3xl border border-black/10 overflow-hidden bg-white">
              {policyItems.map((item, index) => {
                const ItemIcon = item.icon;
                const isOpen = openPolicyItem === item.id;
                return (
                  <div key={item.id} className={index > 0 ? 'border-t border-black/10' : ''}>
                    <button
                      onClick={() => setOpenPolicyItem((prev) => (prev === item.id ? '' : item.id))}
                      className="w-full bg-white px-6 py-2.5 md:py-3 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-black/5 text-black/70 flex items-center justify-center">
                          <ItemIcon size={18} />
                        </span>
                        <span className="text-black text-[14px] md:text-[18px]">{item.title}</span>
                      </div>
                      <ChevronDown className={`text-black/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} size={20} />
                    </button>

                    {isOpen && (
                      <div className="pb-4 md:pb-5 pl-[76px] pr-6">
                        <ul className="list-disc space-y-2 text-black/60 text-[14px] md:text-[17px]">
                          {item.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setIsCareGuideOpen((prev) => !prev)}
            className="w-full rounded-3xl bg-white border border-black/10 px-6 py-2.5 md:py-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-4">
              <span className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-black/5 text-black/70 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </span>
              <span className="text-black text-[14px] md:text-[18px]">Care Guide</span>
            </div>
            <ChevronDown className={`text-black/70 transition-transform ${isCareGuideOpen ? 'rotate-180' : ''}`} size={22} />
          </button>

          {isCareGuideOpen && (
            <div className="w-full rounded-3xl border border-black/10 bg-white p-4 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="rounded-2xl border border-black/10 bg-white p-4 md:p-5">
                  <h4 className="text-black text-[16px] md:text-[20px] text-center mb-4">Jewellery Care</h4>
                  <p className="text-black/70 text-[12px] tracking-[0.2em] mb-3">DO'S</p>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-black/5 p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-white border border-black/10 text-black/70 flex items-center justify-center shrink-0">
                        <Package size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Store Safely</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Keep in the provided pouch, away from other jewellery</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-black/5 p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-white border border-black/10 text-black/70 flex items-center justify-center shrink-0">
                        <Sparkles size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Wipe Gently</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Use soft cloth to remove fingerprints after wearing</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-black/10 my-4" />
                  <p className="text-[#E27D7D] text-[12px] tracking-[0.2em] mb-3">DON'TS</p>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-[#F8EFF0] p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-[#F2DFE1] text-[#E27D7D] flex items-center justify-center shrink-0">
                        <Droplets size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Avoid Water</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Remove before washing hands, swimming, or bathing</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#F8EFF0] p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-[#F2DFE1] text-[#E27D7D] flex items-center justify-center shrink-0">
                        <Sun size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">No Direct Sunlight</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Store away from prolonged sun exposure</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 bg-white p-4 md:p-5">
                  <h4 className="text-black text-[16px] md:text-[20px] text-center mb-4">Clothing Care</h4>
                  <p className="text-black/70 text-[12px] tracking-[0.2em] mb-3">DO'S</p>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-black/5 p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-white border border-black/10 text-black/70 flex items-center justify-center shrink-0">
                        <Wind size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Air After Wear</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Hang in a ventilated space before returning</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-black/5 p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-white border border-black/10 text-black/70 flex items-center justify-center shrink-0">
                        <Hand size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Handle Gently</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Be careful with embroidery, beadwork, and delicate fabrics</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-black/10 my-4" />
                  <p className="text-[#E27D7D] text-[12px] tracking-[0.2em] mb-3">DON'TS</p>

                  <div className="space-y-3">
                    <div className="rounded-2xl bg-[#F8EFF0] p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-[#F2DFE1] text-[#E27D7D] flex items-center justify-center shrink-0">
                        <Droplets size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">No Perfume</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Apply perfume before wearing, not on the garment</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#F8EFF0] p-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-full bg-[#F2DFE1] text-[#E27D7D] flex items-center justify-center shrink-0">
                        <Flame size={17} />
                      </span>
                      <div>
                        <p className="text-black text-[15px] md:text-[18px] leading-tight">Avoid Heat</p>
                        <p className="text-black/60 text-[12px] md:text-[14px]">Keep away from irons, heaters, and hot surfaces</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <section className="mt-14">
          <h3 className="text-black ml-3 text-[22px] md:text-[34px] mb-6">You May Also Like</h3>
          {relatedLoading ? (
            <p className="text-black/60 ml-3 text-sm">Loading related products...</p>
          ) : relatedError ? (
            <p className="text-black/60 ml-3 text-sm">{relatedError}</p>
          ) : relatedProducts.length === 0 ? (
            <p className="text-black/60 ml-3 text-sm">No related products found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.slice(0, 8).map((item) => {
                const buyPrice = Number(item.buyPrice || 0);
                const rentPrice = Number(item.rentPrice || 0);
                const availabilityType = String(item.availabilityType || '').toLowerCase();
                const isRental = availabilityType === 'all' || availabilityType === 'available for rent' || rentPrice > 0;
                const badge = isRental ? 'Rental Available' : 'Buy Only';

                return (
                  <article key={item.id} className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition group">
                    <div className="relative h-[360px] overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />

                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition duration-300" />

                      <span className="absolute top-4 left-4 bg-white text-black/70 text-[11px] px-4 py-1 rounded-full font-medium">
                        {badge}
                      </span>
                      <button
                        onClick={() => handleRelatedWishlistClick(item)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 text-black/70 flex items-center justify-center"
                      >
                        <Heart
                          size={18}
                          className={`${
                            wishlistedIds.has(String(makeWishlistId(item.id, item.name)))
                              ? 'fill-black text-black'
                              : ''
                          }`}
                        />
                      </button>

                      <div className="absolute bottom-6 left-6 right-6 opacity-0 group-hover:opacity-100 transition duration-300">
                        <button
                          onClick={() => handleRelatedProductClick(item)}
                          className="w-full bg-white text-black/80 py-3 rounded-2xl font-medium text-md flex items-center justify-center gap-2 hover:bg-[#111111] hover:text-white transition"
                        >
                          View Details
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="p-5">
                      <p className="text-black/60 text-[12px] tracking-widest font-semibold uppercase mb-2">{item.category}</p>
                      <h4 className="text-black font-serif text-[20px] mb-3">{item.name}</h4>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-black font-bold text-lg">
                          {'\u20B9'}{(buyPrice || rentPrice || 0).toLocaleString('en-IN')}
                        </span>
                        {isRental && rentPrice > 0 ? (
                          <span className="text-black/60 text-sm">
                            Rent from {'\u20B9'}{rentPrice.toLocaleString('en-IN')}/day
                          </span>
                        ) : (
                          <span className="text-black/60 text-sm">Purchase only</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <div className="mt-10 md:mt-14">
        <Footer />
      </div>
    </div>
  );
};

export default ProductDetailPage;
