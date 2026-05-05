import React from "react";
import herobgFallback from "../../assets/image11.jpg";

const HERO_BG_URL = "https://i.pinimg.com/736x/ba/5d/79/ba5d79560e4722d0ca5d7d28cc1d60d2.jpg";

const CollectionsSection = () => {
  return (
    <div className="relative bg-black py-24 px-6 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${HERO_BG_URL || herobgFallback})`,
          backgroundPosition: "center 60%",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          filter: "saturate(1.08) contrast(1.08)",
          transform: "scale(1.05)",
        }}
      />
      <div
        className="absolute inset-0 bg-black/35"
        aria-hidden="true"
       
      />

      <div className="relative max-w-3xl mx-auto text-center">
        
        <p className="text-[12px] text-white/80 tracking-[0.35em] uppercase mb-4">
          Explore Our Collection
        </p>

      
        <h2 className="text-4xl md:text-6xl font-serif font-semibold text-white mb-4">
          Our Collections
        </h2>

        
        <p className="text-white/80 text-lg">
          Discover exquisite pieces handpicked for your most special occasions
        </p>
      </div>
    </div>
  );
};

export default CollectionsSection;
