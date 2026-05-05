import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import lahenga from "../assets/lahenga.png";
import { fetchAdminProducts } from "../utils/adminProductsApi";

const Hero = () => {
  const navigate = useNavigate();

  const fallbackSlides = useMemo(
    () => [
      { key: "jewellery", 
        label: "Jewellery", 
        image: "https://i.pinimg.com/736x/b1/3c/0f/b13c0f05f0399c590399e72880e3c1ec.jpg" 
      },
      { key: "lehenga", 
        label: "Lehenga", 
        image:lahenga
       },
      {
        key: "accessories",
        label: "Accessories",
        image: "https://i.pinimg.com/736x/6a/68/dd/6a68dd5faddbf7b2cde5271f49db1cfc.jpg",
      },
    ],
    []
  );

  const [heroProducts, setHeroProducts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchAdminProducts().then((rows) => {
      if (!alive) return;
      const heroRows = rows.filter((item) => Boolean(item?.isHero) && item?.inStock !== false);
      setHeroProducts(heroRows.slice(0, 5));
    });
    return () => {
      alive = false;
    };
  }, []);

  const slides = useMemo(() => {
    if (!heroProducts.length) return fallbackSlides;
    const heroSlides = heroProducts.map((product) => ({
      key: `hero-${product.id}`,
      label: product.name || product.category || "Featured",
      image: product.image || product.images?.[0] || "",
    })).filter((slide) => Boolean(slide.image));

    return heroSlides.length ? heroSlides : fallbackSlides;
  }, [fallbackSlides, heroProducts]);

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    slides.forEach((slide) => {
      const img = new Image();
      img.src = slide.image;
    });
  }, [slides]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) return;

    const intervalMs = 4500;
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [slides.length]);

  return (
    <>
      <div className="relative w-full h-screen overflow-hidden bg-[#F7FAF2] heroLuxury">
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {slides.map((slide, index) => (
            <div
              key={slide.key}
              className={`heroLuxury__bg ${index === activeIndex ? "is-active" : ""}`}
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}
          <div className="heroLuxury__shade" />
        </div>

        <div className="relative z-10 flex h-full items-center justify-center px-6 md:px-10 py-24">
          <div className="max-w-3xl w-full text-center">
            

            <div className="flex flex-col items-center gap-10 md:gap-12">
              <div key={activeIndex} className="heroLuxury__text">
                <h1 className="text-6xl md:text-8xl font-semibold font-serif text-white leading-tight tracking-tight">
                  <span
                    className="heroLuxury__category"
                  
                  >
                    {slides[activeIndex]?.label}
                  </span>
                </h1>
 
                <p className="mt-9 text-white/90 leading-relaxed max-w-2xl mx-auto">
                  {
                   "Curated ethnic luxury designed for unforgettable celebrations."
                  }
                </p>
              </div>
 
              <div className="flex gap-6  justify-center flex-wrap">
                <button
                  onClick={() => navigate("/collections")}
                  className="px-8 md:px-10 py-2 bg-white/85 text-black/80 rounded-xl text-xs md:text-sm tracking-[0.35em] font-semibold hover:bg-white transition"
                >
                  RENT NOW
                </button>
 
                <button
                  onClick={() => navigate("/collections")}
                  className="px-10 md:px-12 py-3 border border-white/55 text-white rounded-xl text-xs md:text-sm tracking-[0.35em] font-semibold hover:bg-white/10 hover:text-white transition"
                >
                  SHOP COLLECTION
                </button>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400;1,600&display=swap");
          @import url("https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@1,6..96,400;1,6..96,600&display=swap");

          .heroLuxury__bg {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            opacity: 0;
            transform: scale(1.03);
            transition: opacity 1200ms ease, transform 5200ms ease;
            will-change: opacity, transform;
            filter: brightness(0.75) contrast(1.05) saturate(1.05);
          }

          .heroLuxury__bg.is-active {
            opacity: 1;
            transform: scale(1.1);
          }

          .heroLuxury__shade {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.35);
            pointer-events: none;
          }

          .heroLuxury__text {
            animation: heroLuxuryFadeIn 900ms ease both;
            text-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
          }

          .heroLuxury__category {
            display: inline-block;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }

          @keyframes heroLuxuryFadeIn {
            from {
              opacity: 0;
              transform: translate3d(0, 10px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .heroLuxury__bg {
              transition: none;
              transform: none;
            }
            .heroLuxury__text {
              animation: none;
            }
          }
        `}</style>
      </div>

      <div className="w-full h-[1px] bg-[#CFE1B9]" />
    </>
  );
};

export default Hero;
