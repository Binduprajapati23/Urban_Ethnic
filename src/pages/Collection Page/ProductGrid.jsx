import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { requestJson } from "../../utils/http";
import { addToWishlist, canUseWishlist, removeFromWishlistById } from "../../utils/wishlist";
import { readFeatureToggles } from "../../utils/adminConfig";

const NEW_BADGE_DURATION_DAYS = 7;

const ProductGrid = ({
  activeCategory = "All",
  activeType = "All Types",
  searchTerm = "",
  priceRange = "All Prices",
  sortBy = "Newest First",
}) => {
  const navigate = useNavigate();
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "http://localhost:5000").replace(/\/$/, "");
  const [, forceTogglesRefresh] = useState(0);
  const cityBasedFilteringEnabled = Boolean(readFeatureToggles().cityBasedFiltering);

  useEffect(() => {
    const onToggles = () => forceTogglesRefresh((v) => v + 1);
    window.addEventListener("ue:feature-toggles", onToggles);
    return () => window.removeEventListener("ue:feature-toggles", onToggles);
  }, []);

  const [wishlistedIds, setWishlistedIds] = useState(() => new Set());
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

    if (commaParts.length > 1) {
      const likelyCity =
        commaParts.find(
          (part) =>
            part.split(/\s+/).length <= 3 &&
            !/\b(street|st|road|rd|sector|block|flat|house|apt|apartment|near)\b/i.test(part)
        ) || commaParts[0];
      return likelyCity;
    }

    return withoutPincode;
  }, []);

  const readLocalUserCity = useCallback(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      const directCity = String(user?.city || "").trim();
      if (directCity) return directCity;
      return "";
    } catch {
      return "";
    }
  }, []);

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
  const likeTimersRef = useRef(new Map());
  const isWithinNewWindow = useCallback((createdAt) => {
    const created = new Date(createdAt || "");
    if (Number.isNaN(created.getTime())) return false;
    const ageMs = Date.now() - created.getTime();
    return ageMs >= 0 && ageMs <= NEW_BADGE_DURATION_DAYS * 24 * 60 * 60 * 1000;
  }, []);

  const [adminProducts, setAdminProducts] = useState([]);

  const mapApiProductToCard = useCallback((item, index) => {
    const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    const primaryImage = images[0] || item.image || "";
    const normalizedId =
      item?.id === undefined || item?.id === null || String(item.id).trim() === ""
        ? String(index)
        : String(item.id);

    const normalizedType = String(item.availabilityType || "").toLowerCase();
    const buyPrice = Number(item.buyPrice || 0);
    const rentPrice = Number(item.rentPrice || 0);
    const buyAvailable =
      typeof item.buyAvailable === "boolean"
        ? item.buyAvailable
        : normalizedType !== "available for rent" && buyPrice > 0;
    const rentAvailable =
      typeof item.rentAvailable === "boolean"
        ? item.rentAvailable
        : normalizedType !== "buy only" && rentPrice > 0;

    return {
      id: normalizedId,
      category: String(item.category || "ACCESSORIES").toUpperCase(),
      title: item.name || "New Product",
      description: String(item.description || ""),
      price: String(item.buyPrice ?? "0"),
      rent: String(item.rentPrice ?? "0"),
      availabilityType: String(item.availabilityType || "All"),
      img: primaryImage,
      images,
      isNew: isWithinNewWindow(item.createdAt),
      isRental: rentAvailable,
      buyAvailable,
      rentAvailable,
      city: String(item.city || item.locationCity || item.productCity || "").trim(),
      inStock: item.inStock !== false,
      isCollection: item.isCollection !== false,
    };
  }, [isWithinNewWindow]);

  useEffect(() => {
    const timers = likeTimersRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!cityBasedFilteringEnabled) return undefined;
    if (readLocalUserCity()) return undefined;
    if (!customerIdentity.email && !customerIdentity.clerkId) return undefined;

    let cancelled = false;

    const refresh = async () => {
      const qs = new URLSearchParams();
      if (customerIdentity.email) qs.set("email", customerIdentity.email);
      if (customerIdentity.clerkId) qs.set("clerkId", customerIdentity.clerkId);

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
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [
    API_BASE,
    cityBasedFilteringEnabled,
    customerIdentity.clerkId,
    customerIdentity.email,
    extractCityCandidate,
    readLocalUserCity,
  ]);

  useEffect(() => {
    const refreshAdminProducts = async () => {
      try {
        const data = await requestJson(`${API_BASE}/api/admin/products`);
        const rows = Array.isArray(data?.products) ? data.products : [];
        setAdminProducts(rows.map(mapApiProductToCard).filter((item) => item.isCollection));
      } catch (err) {
        console.log("Failed to fetch products for grid:", err?.body || err.message);
        setAdminProducts([]);
      }
    };

    refreshAdminProducts();
    window.addEventListener("focus", refreshAdminProducts);
    return () => {
      window.removeEventListener("focus", refreshAdminProducts);
    };
  }, [API_BASE, mapApiProductToCard]);

  const parseAmount = (value) => {
    const numeric = Number(String(value ?? "").replace(/[^0-9]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const formatAmount = (value) => parseAmount(value).toLocaleString("en-IN");

  const makeWishlistId = (product) => `${product.id}-${product.title}`;

  const normalizeCity = (value) => {
    const text = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\b\d{5,6}\b/g, " ")
      .replace(/[()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!text) return "";
    return text;
  };
  const getProductCity = (product) => String(product?.city || "").trim();
  const isCityMatch = (product) => {
    const productCity = normalizeCity(getProductCity(product));
    const userCityValue = normalizeCity(userCity);
    if (!productCity || !userCityValue) return false;
    if (productCity === userCityValue) return true;
    if (productCity.length >= 3 && userCityValue.length >= 3) {
      if (productCity.includes(userCityValue) || userCityValue.includes(productCity)) return true;
      const productTokens = productCity.split(" ").filter((token) => token.length >= 3);
      const userTokens = new Set(userCityValue.split(" ").filter((token) => token.length >= 3));
      return productTokens.some((token) => userTokens.has(token));
    }
    return false;
  };

  const isBuyAvailable = (product) => {
    if (typeof product?.buyAvailable === "boolean") return product.buyAvailable;
    const priceValue = Number(String(product?.price ?? "").replace(/[^0-9]/g, ""));
    return Number.isFinite(priceValue) && priceValue > 0;
  };

  const isRentAvailable = (product) => {
    if (typeof product?.rentAvailable === "boolean") return product.rentAvailable;
    return Boolean(product?.isRental) || Number(product?.rentPrice || 0) > 0;
  };

  const canRentInCity = (product) =>
    product?.inStock !== false &&
    isRentAvailable(product) &&
    (!cityBasedFilteringEnabled || isCityMatch(product));

  const handleWishlistClick = (e, product) => {
    e.stopPropagation();
    if (!canUseWishlist()) {
      alert("Admin account cannot add products to wishlist.");
      return;
    }

    const wishlistId = makeWishlistId(product);
    const added = addToWishlist({
      id: wishlistId,
      name: product.title,
      image: product.img,
      rentPrice: parseAmount(product.rent),
      buyPrice: parseAmount(product.price),
      category: product.category,
    });
    if (!added) return;

    setWishlistedIds((prev) => new Set(prev).add(String(wishlistId)));

    const existingTimer = likeTimersRef.current.get(wishlistId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timerId = setTimeout(() => {
      setWishlistedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(wishlistId));
        return next;
      });

      if (added) {
        removeFromWishlistById(wishlistId);
      }

      likeTimersRef.current.delete(wishlistId);
    }, 5000);

    likeTimersRef.current.set(wishlistId, timerId);
  };

  const handleProductClick = (product) => {
    navigate(`/product/${product.id}`, {
      state: {
        product: {
          id: product.id,
          img: product.img,
          images: Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.img].filter(Boolean),
          category: product.category,
          name: product.title,
          description: product.description,
          price: product.price,
          rent: product.rent,
          city: getProductCity(product),
          inStock: product?.inStock !== false,
          buyAvailable: isBuyAvailable(product),
          rentAvailable: isRentAvailable(product),
        },
      },
    });
  };

  const baseProducts = useMemo(() => [], []); /*
  {
    id: 1,
    category: "LEHENGA",
    title: "Floral lehenga",
    price: "85,000",
    rent: "5,500",
    img: "https://i.pinimg.com/1200x/7b/cc/cf/7bcccf5789ef948d1d2dc723ded34c0d.jpg",
    isNew: true,
    isRental: true
  },
  {
    id: 2,
    category: "Accessories",
    title: "Hexagon Charm Bracelet",
    price: "5,000",
    rent: "850",
    img: "https://i.pinimg.com/736x/50/3a/54/503a548f713f0892ebf8a2f095056f95.jpg",
    isNew: false,
    isRental: true
  },
  {
    id: 3,
    category: "Traditional Wear",
    title: "Royal Embroidered Lehenga",
    price: "87,000",
    rent: "25,500",
    img: "https://i.pinimg.com/1200x/5a/e8/99/5ae8995b953c0f8b0a377cbc23e46b2d.jpg",
    isNew: true,
    isRental: false
  },
  {
    id: 4,
    category: "JEWELLERY",
    title: "Dainty Gold Pendant Necklace",
    price: "2,000",
    rent: "500",
    img: "https://i.pinimg.com/736x/a5/9e/db/a59edbf1d03a3f04fa1ba692a7927b97.jpg",
    isNew: false,
    isRental: true
  },
  {
    id: 5,
    category: "ACCESSORIES",
    title: "Royal Earrings",
    price: "500",
    rent: "100",
    img: "https://i.pinimg.com/1200x/35/b0/b4/35b0b44093b6a831036e0b851b5de163.jpg",
    isNew: true,
    isRental: true
  },
  {
    id: 6,
    category: "LEHENGA",
    title: "Designer lehenga",
    price: "12,000",
    rent: "6,000",
    img: "https://i.pinimg.com/1200x/5b/fa/98/5bfa985eb3f07a3a8e3c4d2e407f6e66.jpg",
    isNew: false,
    isRental: true
  },
  {
    id: 7,
    category: "ACCESSORIES",
    title: "Antique Gold Earrings",
    price: "5,000",
    rent: "1,000",
    img: "https://i.pinimg.com/1200x/bf/4d/1c/bf4d1ccc59577d73666fb27047feee34.jpg",
    isNew: true,
    isRental: true
  },
  {
    id: 8,
    category: "LEHENGA",
    title: "Green Bridal Lehenga",
    price: "18,500",
    rent: "900",
    img: "https://i.pinimg.com/1200x/f3/9a/3f/f39a3f15c68852b86c4517dda21ba553.jpg",
    isNew: false,
    isRental: false
  },
 {
  id: 9,
  category: "JEWELLERY",
  title: "Heavy Bridal Necklace Set",
  price: "21,000",
  rent: "1,000",
  img: "https://i.pinimg.com/1200x/22/5d/e4/225de41e75950931f2a7b315e3b97d7d.jpg",
  isNew: true,
  isRental: false
},
{
  id: 10,
  category: "ACCESSORIES",
  title: "Beutiful Earrings",
  price: "1700",
  rent: "400",
  img: "https://i.pinimg.com/736x/9c/64/1f/9c641fc3a3d8e23a9c23fdd0329625e7.jpg",
  isNew: false,
  isRental: true
},
{
  id: 11,
  category: "LEHENGA",
  title: "Brown Lehenga with Embroidery",
  price: "65,000",
  rent: "3.500",
  img: "https://i.pinimg.com/1200x/30/d1/b4/30d1b4a61d78e4a3203bdf5969a21e7a.jpg",
  isNew: true,
  isRental: true
},
{
  id: 12,
  category: "ACCESSORIES",
  title: "Bracelet",
  price: "1,000",
  rent: "120",
  img: "https://i.pinimg.com/1200x/72/0b/8b/720b8b6c1ce9e38d0bffb908a1061e7c.jpg",
  isNew: false,
  isRental: false
},
{
  id: 13,
  category: "JEWELLERY",
  title: "Necklace Set",
  price: "2,900",
  rent: "150",
  img: "https://i.pinimg.com/1200x/17/90/ff/1790fffff99155a1df88a2ee63bd97f5.jpg",
  isNew: true,
  isRental: true
},
{
  id: 14,
  category: "LEHENGA",
  title: "Wine Reception Lehenga",
  price: "22,300",
  rent: "1,050",
  img: "https://i.pinimg.com/736x/a9/00/66/a90066d7988117e80efba30e9943ff6f.jpg",
  isNew: false,
  isRental: true
},
{
  id: 15,
  category: "ACCESSORIES",
  title: "Antique Gold Bracelet",
  price: "3,000",
  rent: "180",
  img: "https://i.pinimg.com/736x/fe/6b/7a/fe6b7abd7711b5d09c94301f148e8873.jpg",
  isNew: true,
  isRental: true
},
{
  id: 16,
  category: "LEHENGA",
  title: "Traditional Lehenga ",
  price: "1,600",
  rent: "90",
  img: "https://i.pinimg.com/1200x/a4/16/9b/a4169b231f16110064c8f2b076a0e8f3.jpg",
  isNew: false,
  isRental: true
},
{
  id: 17,
  category: "LEHENGA",
  title: "Brown Sarara Set",
  price: "15,700",
  rent: "750",
  img: "https://i.pinimg.com/736x/6c/01/38/6c0138dda94f88081aef53049cdcfa08.jpg",
  isNew: true,
  isRental: false
},
{
  id: 18,
  category: "ACCESSORIES",
  title: "Stone Earrings",
  price: "2,000",
  rent: "500",
  img: "https://i.pinimg.com/1200x/ba/9a/b8/ba9ab8bbba86937d92cbd6d8cbbdd10c.jpg",
  isNew: false,
  isRental: true
},
{
  id: 19,
  category: "LEHENGA",
  title: "Orange Embroidery Lehenga",
  price: "56,800",
  rent: "14,000",
  img: "https://i.pinimg.com/736x/33/3f/26/333f26b651f892590102f1630e611bd4.jpg",
  isNew: true,
  isRental: false
},
{
  id: 20,
  category: "JEWELLERY",
  title: "Antique Gold Necklace",
  price: "2,100",
  rent: "130",
  img: "https://i.pinimg.com/736x/61/33/01/613301a1c0d852afbc11ebdd05378ffa.jpg",
  isNew: true,
  isRental: false
},
{
  id: 21,
  category: "JEWELLERY",
  title: "Pink Diamond Necklace Set",
  price: "12,800",
  rent: "500",
  img: "https://i.pinimg.com/736x/11/86/11/118611139db86bb40197bc7b6bd433d0.jpg",
  isNew: false,
  isRental: true
},
{
  id: 22,
  category: "LEHENGA",
  title: "Printed Lehenga",
  price: "78,000",
  rent: "20,000",
  img: "https://i.pinimg.com/736x/f4/8b/fd/f48bfdba2e245ee668f1fe8eba5f3d3f.jpg",
  isNew: false,
  isRental: true
},
{
  id: 23,
  category: "JEWELLERY",
  title: "Diamond Necklace Set",
  price: "3,900",
  rent: "200",
  img: "https://i.pinimg.com/1200x/33/97/d7/3397d736f6c8d3ab1030ba30ba12f5ea.jpg",
  isNew: true,
  isRental: true
},
{
  id: 24,
  category: "LEHENGA",
  title: "Black Floral Lehenga",
  price: "55,200",
  rent: "12,000",
  img: "https://i.pinimg.com/1200x/df/64/6c/df646c0dde3686ec158994d7251d3c4b.jpg",
  isNew: false,
  isRental: false
}

], []); */

  const getSortSeed = (product) => {
    const numeric = Number(String(product?.id ?? "").replace(/[^0-9]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  // Collection page par sirf real (API) products dikhane hain.
  // Static/mock `baseProducts` ko empty rakha hai (above) so it never renders.
  const products = useMemo(() => [...adminProducts, ...baseProducts], [adminProducts, baseProducts]);

  const normalizeCategory = (category) => {
    const normalized = String(category || "").toLowerCase();
    if (normalized.includes("jewel")) return "Jewellery";
    if (normalized.includes("accessor")) return "Accessories";
    if (normalized.includes("lehenga") || normalized.includes("ethnic wear") || normalized.includes("traditional wear")) {
      return "Lehengas";
    }
    return "Other";
  };

  const getBuyPrice = (product) =>
    Number(String(product?.price ?? "").replace(/[^0-9]/g, "")) || 0;

  const matchesCategory = (product) =>
    activeCategory === "All" ||
    normalizeCategory(product.category) === activeCategory;

  const matchesType = (product) => {
    if (product?.inStock === false) return true;
    const canBuy = isBuyAvailable(product);
    const canRent = canRentInCity(product);
    const hasRentOption = isRentAvailable(product);

    // "Buy Only" should show ONLY products that are not rentable (hide "both price" products).
    if (activeType === "Buy Only") return canBuy && !hasRentOption;
    if (activeType === "Available for Rent") return canRent;
    if (activeType === "All Types") return canBuy || canRent;

    return canBuy || canRent;
  };

  const matchesSearch = (product) => {
    if (!searchTerm.trim()) return true;
    const text = `${product.title} ${product.category}`.toLowerCase();
    return text.includes(searchTerm.trim().toLowerCase());
  };

  const matchesPrice = (product) => {
    const price = getBuyPrice(product);
    const normalized = String(priceRange || "").toLowerCase();
    if (normalized.includes("all")) return true;
    if (normalized.includes("under")) return price < 5000;
    if (normalized.includes("5,000") && normalized.includes("20,000")) return price >= 5000 && price <= 20000;
    if (normalized.includes("above")) return price > 20000;
    return true;
  };

  const matchesCityFilter = (product) => {
    if (!cityBasedFilteringEnabled) return true;
    const userCityValue = normalizeCity(userCity);
    if (!userCityValue) return true;
    const productCityValue = normalizeCity(getProductCity(product));
    if (!productCityValue) return true;

    // Customer side: city-based restriction should apply only for rentals.
    // Buy listings should still be visible across cities.
    if (activeType !== "Available for Rent") return true;

    if (productCityValue === userCityValue) return true;
    if (productCityValue.length >= 3 && userCityValue.length >= 3) {
      return productCityValue.includes(userCityValue) || userCityValue.includes(productCityValue);
    }
    return false;
  };

  const filteredProducts = products
    .filter(matchesCityFilter)
    .filter(matchesCategory)
    .filter(matchesType)
    .filter(matchesSearch)
    .filter(matchesPrice)
    .sort((a, b) => {
      const priceA = getBuyPrice(a);
      const priceB = getBuyPrice(b);

      if (sortBy === "Price: Low to High") return priceA - priceB;
      if (sortBy === "Price: High to Low") return priceB - priceA;
      return getSortSeed(b) - getSortSeed(a);
    });

  return (
    <div className="bg-transparent p-8"> 
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7 max-w-7xl mx-auto">
        {filteredProducts.map((product) => {
          const soldOut = product?.inStock === false;
          const canBuy = !soldOut && isBuyAvailable(product);
          const canRent = !soldOut && canRentInCity(product);
          const rentNotInCity =
            cityBasedFilteringEnabled &&
            !soldOut &&
            isRentAvailable(product) &&
            !isCityMatch(product);

          return (
            <div
              key={product.id}
              className="group bg-white rounded-[28px] overflow-hidden border border-black/10 shadow-[0_10px_30px_rgba(0,0,0,0.10)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.14)] transition-shadow duration-300"
            >
            
            
            <div className="relative h-64 sm:h-72 overflow-hidden">
              <img 
                src={product.img} 
                alt={product.title} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              <div
                className={[
                  "absolute inset-0 bg-black/30 transition duration-300",
                  soldOut ? "opacity-35" : "opacity-0 group-hover:opacity-100",
                ].join(" ")}
              />
              
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {soldOut && (
                  <span className="bg-white/95 text-black text-[10px] px-4 py-1 rounded-full w-fit border border-black/15 font-semibold">
                    Sold out
                  </span>
                )}
                {product.isNew && (
                  <span className="bg-black text-white text-[10px] px-4 py-1 rounded-full w-fit">
                    New
                  </span>
                )}
                {(() => {
                  const normalizedType = String(product.availabilityType || "").toLowerCase();
                  const hasExplicitType = normalizedType.length > 0;
                  const rentAvailableInCity = canRentInCity(product);
                  const badgeLabel = hasExplicitType
                    ? normalizedType === "buy only"
                      ? "Buy Only"
                      : normalizedType === "available for rent"
                        ? rentAvailableInCity
                          ? "Rental Available"
                          : "Buy Only"
                        : ""
                    : product.isRental
                      ? rentAvailableInCity
                        ? "Rental Available"
                        : "Buy Only"
                      : "Buy Only";

                  if (!badgeLabel) return null;

                   return (
                    <span className="bg-white/80 text-black text-[10px] px-3 py-1 rounded-full border border-black/10 w-fit font-medium">
                      {badgeLabel}
                    </span>
                  );
                })()}
              </div>

              <button
                onClick={(e) => handleWishlistClick(e, product)}
                className="absolute top-4 right-4 bg-white/95 p-2 rounded-full border border-black/10 shadow-sm"
                aria-label="Add to wishlist"
              >
                <Heart
                  size={16}
                  className={
                    wishlistedIds.has(String(makeWishlistId(product)))
                      ? "text-black fill-black"
                      : "text-black"
                  }
                />
              </button>

              <div className="absolute bottom-5 left-5 right-5 opacity-0 group-hover:opacity-100 transition duration-300">
                <button
                  onClick={() => handleProductClick(product)}
                  className="w-full bg-white text-black py-2.5 rounded-2xl font-medium text-md flex items-center justify-center gap-2 hover:bg-black hover:text-white transition"
                >
                  View Details <ArrowRight size={18} />
                </button>
              </div>
            </div>

           
            <div className="p-4">
              <p className="text-[12px] tracking-[0.15em] text-black/60 font-bold uppercase mb-1">
                {product.category}
              </p>
              <h4 className="text-black font-serif text-xl mb-2">
                {product.title}
              </h4>

              {soldOut ? (
                <p className="text-[13px] text-black/60 font-medium">Sold out</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    {canBuy && (
                      <p className="text-[17px] text-black font-semibold">
                        Buy:{" "}
                        <span className="font-bold text-black">
                          {"\u20B9"}
                          {formatAmount(product.price)}
                        </span>
                      </p>
                    )}
                    {canRent && (
                      <p className="text-[17px] text-black font-semibold">
                        Rent:{" "}
                        <span className="text-black font-bold">
                          {"\u20B9"}
                          {formatAmount(product.rent)}/day
                        </span>
                      </p>
                    )}
                    {!canBuy && canRent && (
                      <p className="text-[13px] text-black/70 font-medium">Rent only</p>
                    )}
                  </div>

                  {rentNotInCity && canBuy && <p className="text-[12px] text-black/50">Rent not available</p>}

                  {canRent && (
                    <div className="flex items-center gap-2">
                     
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
          );
        })}
      </div>
      {filteredProducts.length === 0 && (
        <p className="text-center text-black/60 text-sm mt-8">
          No products found for this category.
        </p>
      )}
    </div>
  );
};

export default ProductGrid;
