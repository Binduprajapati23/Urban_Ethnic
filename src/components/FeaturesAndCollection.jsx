import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { addToWishlist, canUseWishlist, removeFromWishlistById } from "../utils/wishlist";
import { fetchAdminProducts } from "../utils/adminProductsApi";

const NEW_BADGE_DURATION_DAYS = 7;

const FeaturesAndCollection = () => {
  const navigate = useNavigate();
  const [wishlistedIds, setWishlistedIds] = useState(() => new Set());
  const likeTimersRef = useRef(new Map());
  const sliderViewportRef = useRef(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isSliderPaused, setIsSliderPaused] = useState(false);
  const [visibleCards, setVisibleCards] = useState(3);
  const [sliderViewportWidth, setSliderViewportWidth] = useState(0);
  const [isTrackInstant, setIsTrackInstant] = useState(false);
  const [isCardInstant, setIsCardInstant] = useState(false);

  const fallbackProducts = useMemo(
    () => [
      {
        id: 1,
        category: "JEWELLERY",
        name: "Necklace Set",
        price: "5,000",
        rent: "700",
        img: "https://i.pinimg.com/1200x/4a/f9/f7/4af9f75cbf0243647280264c4d226e85.jpg",
        badges: ["New", "Rental Available"],
      },
      {
        id: 2,
        category: "ACCESSORIES",
        name: "Diamond Bracelet",
        price: "2,000",
        rent: "500",
        img: "https://i.pinimg.com/736x/0e/20/a9/0e20a97c81be029eb83495dd172c7fac.jpg",
        badges: ["Rental Available"],
      },
      {
        id: 3,
        category: "LEHENGA",
        name: "Draped Saree Gown",
        price: "10,000",
        rent: "3,000",
        img: "https://i.pinimg.com/736x/bc/73/4b/bc734b7a16cc9edb6505cad8cbf3d667.jpg",
        badges: ["New", "Rental Available"],
      },
      {
        id: 4,
        category: "ACCESSORIES",
        name: "Antique Gold Earrings",
        price: "2,000",
        rent: "1,000",
        img: "https://i.pinimg.com/1200x/d4/ca/8e/d4ca8ed5c5aed9b5e8e3cd34eb320dba.jpg",
        badges: ["Rental Available"],
      },
    ],
    []
  );

  const [featuredProducts, setFeaturedProducts] = useState([]);

  const isWithinNewWindow = (createdAt) => {
    const created = new Date(createdAt || "");
    if (Number.isNaN(created.getTime())) return false;
    const ageMs = Date.now() - created.getTime();
    return ageMs >= 0 && ageMs <= NEW_BADGE_DURATION_DAYS * 24 * 60 * 60 * 1000;
  };

  useEffect(() => {
    let alive = true;
    fetchAdminProducts().then((rows) => {
      if (!alive) return;
      const mapped = rows
        .filter((item) => item?.inStock !== false && item?.isCollection !== false)
        .map((item) => {
          const availabilityType = String(item?.availabilityType || "All").toLowerCase();
          const isRental =
            availabilityType === "all" ||
            availabilityType === "available for rent" ||
            Number(item?.rentPrice || 0) > 0;
          const badges = [];
          if (isWithinNewWindow(item?.createdAt)) badges.push("New");
          badges.push(isRental ? "Rental Available" : "Buy Only");

          const buyPrice = Number(item?.buyPrice || 0);
          const rentPrice = Number(item?.rentPrice || 0);
          const image = item?.image || item?.images?.[0] || "";
          const images = Array.isArray(item?.images) && item.images.length > 0 ? item.images : [image].filter(Boolean);

          return {
            id: item.id,
            category: String(item?.category || "").toUpperCase(),
            name: String(item?.name || "Featured Product"),
            description: String(item?.description || ""),
            availabilityType: item?.availabilityType,
            isFeatured: Boolean(item?.isFeatured),
            price: buyPrice > 0 ? buyPrice.toLocaleString("en-IN") : "0",
            rent: rentPrice > 0 ? rentPrice.toLocaleString("en-IN") : "",
            img: image,
            images,
            badges,
          };
        })
        .filter((item) => Boolean(item.img));

      const featured = mapped.filter((item) => item.isFeatured);

      // If products are not added yet (or too few to look good), keep showing the local demo array.
      // This avoids the "single giant card" layout when the DB has 0–2 items.
      if (mapped.length < 3) {
        setFeaturedProducts([]);
        return;
      }

      if (!featured.length) {
        setFeaturedProducts(mapped.slice(0, 8));
        return;
      }

      // If only 1–2 products are marked featured, the slider turns into a single giant card.
      // Fill the remaining slots with other products so the Featured Collection looks like a carousel.
      const extras = mapped
        .filter((item) => !item.isFeatured)
        .slice(0, Math.max(0, 8 - featured.length));

      setFeaturedProducts([...featured, ...extras]);
    });

    return () => {
      alive = false;
    };
  }, []);

  const products = featuredProducts.length ? featuredProducts : fallbackProducts;

  useEffect(() => {
    const timers = likeTimersRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const updateVisibleCards = () => {
      const width = typeof window !== "undefined" ? window.innerWidth : 1200;
      let nextVisibleCards = 1;
      if (width >= 1024) nextVisibleCards = 3;
      else if (width >= 768) nextVisibleCards = 2;

      setVisibleCards(nextVisibleCards);

      const nextClamped = Math.max(1, Math.min(nextVisibleCards, products.length));
      const nextCloneCount = Math.min(products.length, nextClamped);
      setIsTrackInstant(true);
      setIsCardInstant(true);
      setTrackIndex(nextCloneCount);
    };

    updateVisibleCards();
    window.addEventListener("resize", updateVisibleCards);
    return () => window.removeEventListener("resize", updateVisibleCards);
  }, [products.length]);

  useEffect(() => {
    if (!sliderViewportRef.current) return;
    const el = sliderViewportRef.current;

    const measure = () => {
      setSliderViewportWidth(el.getBoundingClientRect().width);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const parseAmount = (value) => {
    const numeric = Number(String(value ?? "").replace(/[^0-9]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const makeWishlistId = (product) => `${product.id}-${product.name}`;

  const handleWishlistClick = (e, product) => {
    e.stopPropagation();
    if (!canUseWishlist()) {
      alert("Admin account cannot add products to wishlist.");
      return;
    }

    const wishlistId = makeWishlistId(product);
    const added = addToWishlist({
      id: wishlistId,
      name: product.name,
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
    navigate(`/product/${product.id}`, { state: { product } });
  };

  useEffect(() => {
    if (isSliderPaused || products.length <= 1) return;

    const id = window.setInterval(() => {
      setTrackIndex((prev) => (isTrackInstant ? prev : prev + 1));
    }, 3000);

    return () => window.clearInterval(id);
  }, [isSliderPaused, products.length, isTrackInstant]);

  const clampedVisibleCards = Math.max(1, Math.min(visibleCards, products.length));
  const cloneCount = Math.min(products.length, clampedVisibleCards);
  const centeredOffset = Math.floor(clampedVisibleCards / 2);
  const leftClones = products.slice(-cloneCount);
  const rightClones = products.slice(0, cloneCount);
  const sliderItems = [...leftClones, ...products, ...rightClones];

  useEffect(() => {
    if (!isTrackInstant) return;
    const id = window.setTimeout(() => {
      setIsTrackInstant(false);
      setIsCardInstant(false);
    }, 40);
    return () => window.clearTimeout(id);
  }, [isTrackInstant]);

  const slideWidth = sliderViewportWidth > 0 ? sliderViewportWidth / clampedVisibleCards : 0;
  const trackTranslateX =
    slideWidth > 0 ? -((trackIndex - centeredOffset) * slideWidth) : 0;

  return (
    <div className="bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">


        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-md ml-3 tracking-[4px] text-black/70 uppercase mb-4">
              Handpicked For You
            </p>
            <h2 className="text-4xl md:text-6xl font-serif text-black">
              Featured Collection
            </h2>
          </div>

          <div
            onClick={() => navigate("/collections")}
            className="hidden md:flex items-center gap-2 text-black cursor-pointer hover:gap-3 transition-all"
          >
            <span className="text-lg">View All Products</span>
            <ArrowRight size={20} />
          </div>
        </div>

      
        <div
          ref={sliderViewportRef}
          onMouseEnter={() => setIsSliderPaused(true)}
          onMouseLeave={() => setIsSliderPaused(false)}
          className="relative overflow-x-hidden overflow-y-visible py-6"
        >
          <div
            className={`flex -mx-4 will-change-transform ${
              isTrackInstant ? "" : "transition-transform duration-700 ease-in-out"
            }`}
            style={{ transform: `translate3d(${trackTranslateX}px, 0, 0)` }}
            onTransitionEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.propertyName !== "transform") return;

              if (trackIndex >= cloneCount + products.length) {
                setIsTrackInstant(true);
                setIsCardInstant(true);
                setTrackIndex(cloneCount);
              }
            }}
          >
            {sliderItems.map((p, index) => {
              const isActive = index === trackIndex;
              const slideStyle = slideWidth > 0 ? { width: `${slideWidth}px` } : undefined;
              return (
                <div
                  key={`${p.id}-slide-${index}`}
                  className="px-4 flex-none relative flex justify-center"
                  style={slideStyle}
                >
                  <div
                    className={`relative w-full max-w-[380px] md:max-w-none bg-white ring-1 ring-black/5 rounded-3xl overflow-hidden origin-center ${
                      isCardInstant ? "" : "transition-all duration-700 ease-in-out"
                    } ${
                      isActive
                        ? "scale-[1.08] z-30 shadow-[0_34px_86px_rgba(0,0,0,0.16)]"
                        : "scale-[0.92] z-10 shadow-sm"

                    }`}
                    style={{ willChange: "transform" }}
                  >
            
          <div
            className="relative h-[360px] group overflow-hidden cursor-pointer"
            onClick={() => handleProductClick(p)}
          >

         <img
           src={p.img}
           alt={p.name}
           className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
         />

  
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition duration-300" />

           <div className="absolute bottom-6 left-6 right-6 opacity-0 group-hover:opacity-100 transition duration-300">
             <button
               onClick={(e) => {
                 e.stopPropagation();
                 handleProductClick(p);
               }}
                className="w-full bg-white text-black py-3 rounded-2xl font-medium text-md flex items-center justify-center gap-2 hover:bg-black hover:text-white transition"
             >
               View Details <ArrowRight size={18} />
             </button>
           </div>



                
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  {p.badges.map((badge, i) => (
                    <span
                      key={i}
                      className={`text-[11px] px-4 py-1 rounded-full font-medium
                        ${
                          badge === "New"
                            ? "bg-black text-white"
                            : "bg-white text-[#2E2E2E]"
                        }`}
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                
                <button
                  onClick={(e) => handleWishlistClick(e, p)}
                  className="absolute top-4 right-4 bg-white p-2 rounded-full cursor-pointer"
                >
                  <Heart
                    size={16}
                    className={`${
                      wishlistedIds.has(String(makeWishlistId(p)))
                        ? "text-[#2E2E2E] fill-[#2E2E2E]"
                        : "text-[#2E2E2E]"
                    }`}
                  />
                </button>
              </div>

              
              <div className="p-6 bg-white border-t border-black/5">
                <p className="text-[#6A5A55] text-[11px] tracking-widest font-semibold uppercase mb-2">
                  {p.category}
                </p>

                <h3 className="text-[#2E2E2E] font-serif text-xl mb-4">
                  {p.name}
                </h3>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[#2E2E2E] font-bold text-lg">
                    {'\u20B9'}{p.price}
                  </span>
                  {parseAmount(p.rent) > 0 ? (
                    <span className="text-[#6A5A55] text-sm">
                      Rent from{" "}
                      <span className="font-medium text-[#2E2E2E]">
                        {'\u20B9'}{p.rent}/day
                      </span>
                    </span>
                  ) : (
                    <span className="text-[#6A5A55] text-sm font-medium">Purchase only</span>
                  )}
                </div>
              </div>
            </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default FeaturesAndCollection;
