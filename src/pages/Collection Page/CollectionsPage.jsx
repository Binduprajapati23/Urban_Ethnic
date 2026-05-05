import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CollectionsSection from "./CollectionsSection";
import ProductFilters from "./ProductFilters";
import ProductGrid from "./ProductGrid";
import CollectionFooter from "./CollectionFooter";

const CollectionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState("All Types");
  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState("All Prices");
  const [sortBy, setSortBy] = useState("Newest First");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const allowedCategories = ["All", "Jewellery", "Lehengas", "Accessories"];
  const categoryFromQuery = searchParams.get("category");
  const queryFromParams = searchParams.get("q") || "";
  const activeCategory = allowedCategories.includes(categoryFromQuery)
    ? categoryFromQuery
    : "All";

  useEffect(() => {
    setSearchTerm(queryFromParams);
  }, [queryFromParams]);

  const handleCategoryChange = (category) => {
    const nextParams = new URLSearchParams(searchParams);
    if (category === "All") {
      nextParams.delete("category");
    } else {
      nextParams.set("category", category);
    }
    setSearchParams(nextParams);
  };

  const handleSearchSubmit = () => {
    const nextParams = new URLSearchParams(searchParams);
    const query = searchTerm.trim();
    if (query) {
      nextParams.set("q", query);
    } else {
      nextParams.delete("q");
    }
    setSearchParams(nextParams);
  };

  return (
      <div>
        <CollectionsSection />
        <div className="bg-[#f3f0f0]">
          <ProductFilters
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            activeType={activeType}
          onTypeChange={setActiveType}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onSearchSubmit={handleSearchSubmit}
          priceRange={priceRange}
          onPriceRangeChange={setPriceRange}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
        <ProductGrid
          activeCategory={activeCategory}
          activeType={activeType}
          searchTerm={searchTerm}
          priceRange={priceRange}
          sortBy={sortBy}
        />
      </div>
      <div>
        <CollectionFooter />
      </div>
    </div>
  );
};

export default CollectionsPage;





