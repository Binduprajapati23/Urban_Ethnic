import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminProducts } from "../utils/adminProductsApi";


const ShopByCategory = () => {

  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [highlightProducts, setHighlightProducts] = useState([]);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsRevealed(true);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);


  useEffect(() => {
    let alive = true;
    fetchAdminProducts().then((rows) => {
      if (!alive) return;
      const highlights = rows
        .filter((item) => Boolean(item?.isCategoryHighlight) && item?.inStock !== false)
        .slice(0, 3);
      setHighlightProducts(highlights);
    });
    return () => {
      alive = false;
    };
  }, []);

  const cards = useMemo(() => {
    if (highlightProducts.length) {
      const highlightCards = highlightProducts.map((product) => ({
        key: `highlight-${product.id}`,
        title: product.category || "Featured",
        count: "HIGHLIGHT",
        desc: product.name || "Explore this pick",
        img: product.image || product.images?.[0] || "",
        onClick: () =>
          navigate(`/product/${product.id}`, {
            state: {
              product: {
                id: product.id,
                img: product.image || product.images?.[0] || "",
                images: Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image].filter(Boolean),
                category: product.category,
                name: product.name,
                description: product.description,
                price: product.buyPrice,
                rent: product.rentPrice,
              },
            },
          }),
      })).filter((item) => Boolean(item.img));

      if (highlightCards.length) return highlightCards;
    }

    return [
      {
        key: "cat-jewellery",
        title: "Jewellery",
        count: "150+ PIECES",
        desc: "Kundan and bridal jewellery collections",
        img: "https://i.pinimg.com/1200x/40/ed/bb/40edbb65976ede2c3f2edff49ab31ab0.jpg",
        onClick: () => navigate(`/collections?category=${encodeURIComponent("Jewellery")}`),
      },
      {
        key: "cat-lehengas",
        title: "Lehengas",
        count: "120+ PIECES",
        desc: "Bridal and festive lehenga collections",
        img: "https://i.pinimg.com/1200x/ed/dc/45/eddc450f50a0fb3ce113e24b7db9b537.jpg",
        onClick: () => navigate(`/collections?category=${encodeURIComponent("Lehengas")}`),
      },
      {
        key: "cat-accessories",
        title: "Accessories",
        count: "90+ PIECES",
        desc: "Hair and styling accessories for every look",
        img: "https://i.pinimg.com/1200x/d3/03/00/d303008619bd0b60d9b3e8056599fee0.jpg",
        onClick: () => navigate(`/collections?category=${encodeURIComponent("Accessories")}`),
      },
    ];
  }, [highlightProducts, navigate]);

  return (
    <div ref={sectionRef} className="bg-[#f3f0f0] py-14 px-8 border-t border-black/30">



      <div
        className={`text-center py-10 transition-all duration-[1400ms] ease-out ${
          isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <p className="text-md tracking-widest text-black">
          EXPLORE OUR WORLD
        </p>
        <h2 className="text-6xl font-serif text-black mt-2">
          Shop by Category
        </h2>
      </div>

     
      <div className="max-w-7xl mx-auto px-6 pb-20 grid md:grid-cols-3 gap-9">
        {cards.map((cat, index) => (
          <div
            key={cat.key}
            className={`shopByCat__card group relative h-[550px] rounded-2xl overflow-hidden transition-all duration-[1400ms] ease-in-out hover:shadow-[0_24px_70px_rgba(0,0,0,0.18)] ${
              isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{
              transitionDuration: "1400ms",
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: prefersReducedMotion ? "0ms" : `${index * 200}ms`,
            }}
          >
             
            <img
              onClick={cat.onClick}
              src={cat.img}
              alt={cat.title}
              className="w-full h-full object-cover cursor-pointer transition-transform duration-500 ease-in-out will-change-transform group-hover:scale-[1.05]"
            />

            <div className="absolute inset-0 pointer-events-none bg-transparent z-[1]" />

            <div className="absolute bottom-6 left-6 text-white z-[2]">
              <p className="text-xs tracking-widest mb-2">
                {cat.count}
              </p>
              <h3 className="shopByCat__title text-3xl font-serif mb-2">
                {cat.title}
              </h3>
              <p className="text-sm mb-4 max-w-xs">
                {cat.desc}
              </p>

              <div 
                onClick={cat.onClick}
                className="flex items-center gap-2 text-sm">
                Explore Collection <ArrowRight size={16} />
              </div>
            </div>

          </div>
        ))}
      </div>

      <style>{`
        .shopByCat__card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.18);
          z-index: 1;
          opacity: 0;
          transition: opacity 450ms ease-in-out;
          pointer-events: none;
        }

        .shopByCat__card:hover::after {
          opacity: 1;
        }

        .shopByCat__card:hover .shopByCat__title {
          text-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
        }

        @media (prefers-reduced-motion: reduce) {
          .shopByCat__card,
          .shopByCat__card::after {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ShopByCategory;



