import React, { useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

const ProductFilters = ({
  activeCategory = "All",
  onCategoryChange = () => {},
  activeType = "All Types",
  onTypeChange = () => {},
  searchTerm = "",
  onSearchTermChange = () => {},
  onSearchSubmit = () => {},
  priceRange = "All Prices",
  onPriceRangeChange = () => {},
  sortBy = "Newest First",
  onSortByChange = () => {},
}) => {
  const [showFilters, setShowFilters] = useState(false);

  const categories = ["All", "Jewellery", "Lehengas", "Accessories"];
    const productTypes = ["All Types", "Available for Rent", "Buy Only"];

  return (
    <div className="w-full bg-transparent max-w-7xl mx-auto px-6 py-8 font-sans">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4 border-b border-black/15 pb-6">
        <div className="flex flex-wrap gap-3">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat
                  ? "bg-black text-white"
                  : "bg-white/70 text-black/70 hover:bg-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/60" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchSubmit();
                  }
                }}
                className="pl-11 pr-4 py-2.5 bg-white/70 rounded-full text-sm focus:outline-none w-64 text-black placeholder-black/40"
              />
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/70 text-black/70 rounded-full text-sm hover:bg-white transition"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-4xl p-10 shadow-sm border border-black/10 relative mb-8">
          <button
            onClick={() => setShowFilters(false)}
            className="absolute top-6 right-8 text-gray-400 hover:text-gray-700 transition"
          >
            <X className="w-6 h-6" />
          </button>

          <h3 className="text-2xl text-black mb-8 font-serif font-medium">Filters</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-3">
              <span className="text-xs ml-3 uppercase tracking-wider font-semibold text-black/60">
                Type
              </span>
              <div className="flex flex-wrap gap-2">
                {productTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => onTypeChange(type)}
                    className={`px-5 py-2 rounded-full text-sm transition ${
                      activeType === type
                        ? "bg-black text-white border border-black"
                        : "bg-white text-black/70 border border-black/25 hover:bg-white"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs ml-3 uppercase tracking-wider font-semibold text-black/60">
                Price Range
              </span>
              <div className="relative">
                <select
                  value={priceRange}
                  onChange={(e) => onPriceRangeChange(e.target.value)}
                  className="w-full px-5 pr-11 py-3 rounded-full bg-white text-black/70 text-sm appearance-none cursor-pointer border border-black/25 focus:ring-1 focus:ring-black/30"
                >
                  <option>All Prices</option>
                  <option>Under ₹5,000</option>
                  <option>₹5,000 - ₹20,000</option>
                  <option>Above ₹20,000</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/60" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs ml-3 uppercase tracking-wider font-semibold text-black/60">
                Sort By
              </span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => onSortByChange(e.target.value)}
                  className="w-full px-5 pr-11 py-3 rounded-full bg-white text-black/70 text-sm appearance-none cursor-pointer border border-black/25 focus:ring-1 focus:ring-black/30"
                >
                  <option>Newest First</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/60" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductFilters;









