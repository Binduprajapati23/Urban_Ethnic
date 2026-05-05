import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "../../utils/http";
import { useLocation, useNavigate } from "react-router-dom";
import { readPlatformConfig } from "../../utils/adminConfig";
import {
  Plus,
  Search,
  Trash2,
  Download,
  ChevronDown,
  Upload,
  X,
} from "lucide-react";

const ADMIN_PRODUCTS_KEY = "admin_products";
const PRODUCTS_MIGRATION_KEY = "products_db_migrated_v1";

const emptyForm = {
  name: "",
  image: "",
  description: "",
  category: "Jewellery",
  city: "",
  availabilityType: "All",
  rentPrice: "",
  buyPrice: "",
  inStock: true,
  isHero: false,
  isCategoryHighlight: false,
  isFeatured: false,
  isCollection: true,
};

const normalizeImageList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  const lines = raw
    .split(/\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lines.some((line) => line.startsWith("data:"))) {
    return lines;
  }

  return raw
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

const AdminProducts = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingProductId, setEditingProductId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [imageStatus, setImageStatus] = useState("");
  const imageInputRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const view = String(params.get("view") || "").trim().toLowerCase();
    if (params.get("add") === "1" || view === "add") {
      setIsAddDialogOpen(true);
      if (params.get("add") === "1" && view !== "add") {
        params.delete("add");
        params.set("view", "add");
        navigate(`/admin/products?${params.toString()}`, { replace: true });
      }
    }
  }, [location.search, navigate]);

  const readLegacyProducts = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ADMIN_PRODUCTS_KEY) || "null");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }, []);

  const migrateLegacyProducts = useCallback(async () => {
    const alreadyMigrated = localStorage.getItem(PRODUCTS_MIGRATION_KEY) === "1";
    if (alreadyMigrated) return;

    const legacyProducts = readLegacyProducts();
    if (legacyProducts.length === 0) {
      localStorage.setItem(PRODUCTS_MIGRATION_KEY, "1");
      return;
    }

    try {
      await requestJson("http://localhost:5000/api/admin/products/sync", {
        method: "POST",
        body: JSON.stringify({ products: legacyProducts }),
      });
      localStorage.setItem(PRODUCTS_MIGRATION_KEY, "1");
    } catch (err) {
      console.log("Products migration failed:", err?.body || err.message);
    }
  }, [readLegacyProducts]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await requestJson("http://localhost:5000/api/admin/products");
      const rows = Array.isArray(data?.products) ? data.products : [];
      setProducts(rows);
    } catch (err) {
      console.log("Failed to fetch products:", err?.body || err.message);
      setProducts([]);
      setError("Unable to load products from database.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await migrateLegacyProducts();
      await fetchProducts();
    };
    bootstrap();
  }, [fetchProducts, migrateLegacyProducts]);

  const formatINR = useCallback((value) => `\u20B9${Number(value || 0).toLocaleString("en-IN")}`, []);

  const getProductType = useCallback((product) => {
    const availabilityType = String(product?.availabilityType || "").trim().toLowerCase();
    const buy = Number(product?.buyPrice || 0) > 0;
    const rent = Number(product?.rentPrice || 0) > 0;

    if (availabilityType === "rent" || (!buy && rent)) return "rent";
    if (availabilityType === "buy" || (buy && !rent)) return "buy";
    if (availabilityType === "all" || (buy && rent)) return "both";
    if (buy && rent) return "both";
    if (buy) return "buy";
    if (rent) return "rent";
    return "both";
  }, []);

  const getProductStatus = useCallback(
    (product) => {
      if (product?.isDraft) return "draft";
      if (product?.inStock) return "available";
      const type = getProductType(product);
      if (type === "rent") return "rented";
      return "sold_out";
    },
    [getProductType]
  );

  const getProductOwner = useCallback((product) => {
    const raw =
      product?.ownerName ??
      product?.owner ??
      product?.shopName ??
      product?.sellerName ??
      product?.vendorName ??
      product?.businessName ??
      product?.ownerEmail ??
      product?.owner_email;
    const label = String(raw || "").trim();
    return label || "Owner";
  }, []);

  const getProductCity = useCallback((product) => {
    const direct = String(product?.city || product?.businessCity || product?.ownerCity || "").trim();
    if (direct) return direct;
    const address = String(product?.address || product?.businessAddress || "").trim();
    if (!address) return "";
    const parts = address
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return last.replace(/\d+/g, "").trim();
  }, []);

  const cityOptions = useMemo(() => {
    const set = new Set();
    for (const product of products) {
      const city = getProductCity(product);
      if (city) set.add(city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [getProductCity, products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cityNorm = String(cityFilter || "all").trim().toLowerCase();
    const typeNorm = String(typeFilter || "all").trim().toLowerCase();
    const statusNorm = String(statusFilter || "all").trim().toLowerCase();

    return products.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const category = String(product?.category || "").toLowerCase();
      const matchesSearch = !q || name.includes(q) || category.includes(q);

      const city = getProductCity(product);
      const matchesCity = cityNorm === "all" || String(city || "").trim().toLowerCase() === cityNorm;

      const type = getProductType(product);
      const matchesType = typeNorm === "all" || type === typeNorm;

      const status = getProductStatus(product);
      const matchesStatus = statusNorm === "all" || status === statusNorm;

      return matchesSearch && matchesCity && matchesType && matchesStatus;
    });
  }, [cityFilter, getProductCity, getProductStatus, getProductType, products, searchQuery, statusFilter, typeFilter]);

  const deleteProduct = async (id) => {
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      await requestJson(`http://localhost:5000/api/admin/products/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.log("Failed to delete product:", err?.body || err.message);
      alert("Failed to delete product from database.");
      setProducts(previous);
    }
  };

  const openAddDialog = () => {
    setEditingProductId(null);
    setFormData(emptyForm);
    setImageStatus("");
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (product) => {
    setEditingProductId(product.id);
    const images = Array.isArray(product.images) ? product.images : [];
    setFormData({
      name: product.name,
      image: images.length > 0 ? images.join("\n") : product.image,
      description: product.description || "",
      category: product.category,
      city: getProductCity(product),
      availabilityType: product.availabilityType || "All",
      rentPrice: String(product.rentPrice),
      buyPrice: String(product.buyPrice),
      inStock: product.inStock,
      isHero: Boolean(product.isHero),
      isCategoryHighlight: Boolean(product.isCategoryHighlight),
      isFeatured: Boolean(product.isFeatured),
      isCollection: product.isCollection === undefined ? true : Boolean(product.isCollection),
    });
    setImageStatus("");
    setIsAddDialogOpen(true);
  };

  const closeDialog = () => {
    setIsAddDialogOpen(false);
    setEditingProductId(null);
    setFormData(emptyForm);
    setImageStatus("");
    const params = new URLSearchParams(location.search || "");
    if (String(params.get("view") || "").trim().toLowerCase() === "add") {
      params.delete("view");
      navigate(`/admin/products${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
    }
  };

  const handleImageFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const { maxImagesPerProduct } = readPlatformConfig();
    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
          })
      )
    ).then((urls) => {
      setFormData((prev) => {
        const existing = normalizeImageList(prev.image);
        const merged = [...existing, ...urls].filter(Boolean);
        const unique = Array.from(new Set(merged));
        const cap = Math.max(1, Number(maxImagesPerProduct || 5));
        const capped = unique.slice(0, cap);
        return { ...prev, image: capped.join("\n") };
      });
      setImageStatus(`${files.length} image${files.length === 1 ? "" : "s"} added`);
    });
  };

  const saveProduct = async () => {
    const name = formData.name.trim();
    const { maxImagesPerProduct } = readPlatformConfig();
    const cap = Math.max(1, Number(maxImagesPerProduct || 5));
    const images = normalizeImageList(formData.image).slice(0, cap);
    const image = images[0] || "";
    const additionalImages = images.slice(1);
    const description = String(formData.description || "").trim();
    const rawRentPrice = Number(String(formData.rentPrice).replace(/[^0-9.]/g, ""));
    const rawBuyPrice = Number(String(formData.buyPrice).replace(/[^0-9.]/g, ""));
    const availabilityType = String(formData.availabilityType || "All");
    const rentPrice = availabilityType === "Buy Only" ? 0 : rawRentPrice;
    const buyPrice = availabilityType === "Available for Rent" ? 0 : rawBuyPrice;

    if (!name || !image || !formData.category || !availabilityType) {
      alert("Please fill all product details");
      return;
    }

    if (availabilityType === "All" && (!rentPrice || !buyPrice)) {
      alert("Please enter both rent and buy price for All");
      return;
    }
    if (availabilityType === "Buy Only" && !buyPrice) {
      alert("Please enter buy price for Buy Only");
      return;
    }
    if (availabilityType === "Available for Rent" && !rentPrice) {
      alert("Please enter rent price for Available for Rent");
      return;
    }

    const payload = {
      name,
      image,
      images: additionalImages,
      description,
      category: formData.category,
      city: String(formData.city || "").trim(),
      availabilityType,
      rentPrice,
      buyPrice,
      inStock: formData.inStock,
      isHero: Boolean(formData.isHero),
      isCategoryHighlight: Boolean(formData.isCategoryHighlight),
      isFeatured: Boolean(formData.isFeatured),
      isCollection: formData.isCollection !== false,
    };

    try {
      if (editingProductId) {
        await requestJson(`http://localhost:5000/api/admin/products/${encodeURIComponent(editingProductId)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        alert("Product updated successfully");
      } else {
        await requestJson("http://localhost:5000/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        alert("Product added successfully");
      }

      closeDialog();
      fetchProducts();
    } catch (err) {
      console.log("Failed to save product:", err?.body || err.message);
      alert("Failed to save product in database.");
    }
  };

  const exportCsv = () => {
    const rows = filteredProducts.map((product) => {
      const type = getProductType(product);
      const status = getProductStatus(product);
      const city = getProductCity(product);
      const owner = getProductOwner(product);
      const buyPrice = Number(product?.buyPrice || 0);
      const rentPrice = Number(product?.rentPrice || 0);
      const price = type === "rent" && buyPrice <= 0 ? `${formatINR(rentPrice)}/day` : formatINR(buyPrice);

      return {
        id: String(product?.id || ""),
        name: String(product?.name || ""),
        category: String(product?.category || ""),
        owner,
        city,
        type,
        price,
        status,
      };
    });

    const header = ["id", "name", "category", "owner", "city", "type", "price", "status"];
    const escape = (value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const csv = [header.join(","), ...rows.map((r) => header.map((k) => escape(r[k])).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-10 space-y-8 bg-[#f3f0f0] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-serif text-[#111111] font-bold">Products</h1>
          <p className="text-gray-500 mt-1">All products across all owners and all cities.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exportCsv}
            className="h-10 px-4 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-black/60" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openAddDialog}
            className="h-10 px-4 rounded-xl bg-[#111111] text-white font-semibold hover:bg-[#111111] transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/10">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full h-11 pl-11 pr-4 rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none focus:ring-2 focus:ring-black/10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="relative">
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city.toLowerCase()}>
                    {city}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
            </div>

            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All types</option>
                <option value="both">Both</option>
                <option value="buy">Sale</option>
                <option value="rent">Rent</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All status</option>
                <option value="available">Available</option>
                <option value="sold_out">Sold out</option>
                <option value="rented">Rented</option>
                <option value="draft">Draft</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Product
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Owner
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  City
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Type
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Price
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Status
                </th>
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5 text-right"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="pl-8 pr-6 py-10 text-sm text-black/60">
                    Loading products...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="pl-8 pr-6 py-10 text-sm text-rose-600">
                    {error}
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="pl-8 pr-6 py-10 text-sm text-black/60">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product, idx) => {
                  const type = getProductType(product);
                  const status = getProductStatus(product);
                  const city = getProductCity(product) || "—";
                  const owner = getProductOwner(product);
                  const buyPrice = Number(product?.buyPrice || 0);
                  const rentPrice = Number(product?.rentPrice || 0);

                  const typePill =
                    type === "rent"
                      ? "bg-sky-50 text-sky-700 border-sky-200"
                      : type === "buy"
                        ? "bg-slate-100 text-slate-700 border-slate-200"
                        : "bg-indigo-50 text-indigo-700 border-indigo-200";

                  const statusPill =
                    status === "available"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : status === "rented"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : status === "draft"
                          ? "bg-slate-100 text-slate-700 border-slate-200"
                          : "bg-rose-50 text-rose-700 border-rose-200";

                  const pricePrimary =
                    type === "rent" && buyPrice <= 0 ? `${formatINR(rentPrice)}/day` : formatINR(buyPrice);
                  const priceSecondary = type === "both" && rentPrice > 0 ? `${formatINR(rentPrice)}/day` : "";

                  return (
                    <tr
                      key={product.id || idx}
                      className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors"
                      onClick={() => openEditDialog(product)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openEditDialog(product);
                      }}
                    >
                      <td className="pl-8 pr-6 py-5">
                        <div className="flex items-center gap-4 min-w-0">
                          <img
                            src={product?.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                            alt={product?.name || "Product"}
                            className="w-12 h-12 rounded-xl object-cover bg-gray-100 border border-black/10 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#111111] leading-5 truncate">
                              {product?.name || "Product"}
                            </div>
                            <div className="text-xs text-black/55 mt-1 truncate">{String(product?.category || "Category")}</div>
                          </div>
                        </div>
                      </td>
                      <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black/90">{owner}</td>
                      <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black/90">{city}</td>
                      <td className="pl-8 pr-6 py-5">
                        <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", typePill].join(" ")}>
                          {type === "both" ? "Both" : type === "buy" ? "Sale" : "Rent"}
                        </span>
                      </td>
                      <td className="pl-8 pr-6 py-5">
                        <div className="text-sm font-semibold text-[#111111]">{pricePrimary}</div>
                        {priceSecondary && <div className="text-xs text-black/55 mt-1">{priceSecondary}</div>}
                      </td>
                      <td className="pl-8 pr-6 py-5">
                        <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", statusPill].join(" ")}>
                          {status === "sold_out"
                            ? "Sold out"
                            : status === "available"
                              ? "Available"
                              : status === "rented"
                                ? "Rented"
                                : "Draft"}
                        </span>
                      </td>
                      <td className="pl-8 pr-6 py-5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const ok = window.confirm(`Remove "${String(product?.name || "this product")}"?`);
                            if (!ok) return;
                            deleteProduct(product.id);
                          }}
                          className="inline-flex items-center px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                        >
                          <Trash2 className="w-4 h-4 mr-2 text-black/60" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[0_25px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#f3f0f0]/60">
              <h2 className="text-xl font-serif text-[#111111] font-bold">
                {editingProductId ? "Edit Product" : "Add New Product"}
              </h2>
              <button onClick={closeDialog} className="p-2 hover:bg-gray-200 rounded-full">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="px-6 pb-4  space-y-5 overflow-y-auto flex-1 bg-[#f3f0f0]/60">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#E6E6E6] rounded-2xl p-8 text-center hover:border-[#111111] transition-colors bg-white"
              >
                <Upload className="w-8 h-8 text-[#111111] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#111111]">Upload Images</p>
                <p className="text-[10px] text-gray-400 mt-1 uppercase">Click to upload image</p>
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageFileChange}
                className="hidden"
              />
              {imageStatus && <p className="text-xs text-green-600 font-medium">{imageStatus}</p>}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Product Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Kundan Necklace"
                    className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Write a short product description..."
                    rows={4}
                    className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Category</label>
                  <div className="flex gap-2">
                    {["Jewellery", "Ethnic Wear", "Accessories"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, category: cat }))}
                        className={`flex-1 py-2 text-xs font-bold border rounded-xl transition-all ${
                          formData.category === cat
                            ? "border-[#111111] bg-[#111111] text-white"
                            : "border-[#111111] bg-[#f3f0f0] text-[#111111]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Mumbai"
                    className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Type</label>
                  <div className="flex gap-2">
                    {["All", "Buy Only", "Available for Rent"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, availabilityType: type }))}
                        className={`flex-1 py-2 text-xs font-bold border rounded-xl transition-all ${
                          formData.availabilityType === type
                            ? "border-[#111111] bg-[#111111] text-white"
                            : "border-[#111111] bg-[#f3f0f0] text-[#111111]"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Rent Price (Day)</label>
                    <input
                      type="text"
                      value={formData.rentPrice}
                      onChange={(e) => setFormData((prev) => ({ ...prev, rentPrice: e.target.value }))}
                      placeholder={`\u20B90`}
                      disabled={formData.availabilityType === "Buy Only"}
                      className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md disabled:bg-[#f3f0f0]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Buy Price</label>
                    <input
                      type="text"
                      value={formData.buyPrice}
                      onChange={(e) => setFormData((prev) => ({ ...prev, buyPrice: e.target.value }))}
                      placeholder={`\u20B90`}
                      disabled={formData.availabilityType === "Available for Rent"}
                      className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md disabled:bg-[#f3f0f0]"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E6E6E6] bg-white p-4 shadow-sm transition-shadow">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[#111111]">Display Settings</p>
                      <p className="text-[11px] text-gray-500">Control where this product appears on the homepage.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      {
                        key: "isHero",
                        label: "Show in Hero Section",
                      },
                      {
                        key: "isCategoryHighlight",
                        label: "Show in Shop by Category",
                      },
                      {
                        key: "isFeatured",
                        label: "Show in Featured Collection",
                      },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-between gap-4 rounded-xl border border-[#E6E6E6] px-4 py-3"
                      >
                        <span className="text-sm font-medium text-[#111111]">{item.label}</span>
                        <span className="relative inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={Boolean(formData[item.key])}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <span className="w-11 h-6 rounded-full bg-[#E6E6E6] peer-checked:bg-[#111111] transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#111111]/30" />
                          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white border border-black/10 transition-transform peer-checked:translate-x-5" />
                        </span>
                      </label>
                    ))}

                    <label className="flex items-center justify-between gap-4 rounded-xl border border-[#E6E6E6] px-4 py-3">
                      <span className="text-sm font-medium text-[#111111]">Show in Collection</span>
                      <span className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.isCollection)}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              isCollection: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <span className="w-11 h-6 rounded-full bg-[#E6E6E6] peer-checked:bg-[#111111] transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#111111]/30" />
                        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white border border-black/10 transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 pt-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <button
                  onClick={closeDialog}
                  className="flex-1 h-12 rounded-2xl border-2 border-[#111111] text-[#111111] text-sm font-semibold inline-flex items-center justify-center transition-all duration-200 hover:bg-[#111111] hover:text-white active:scale-[0.98]"
                >
                  CANCEL
                </button>
                <button
                  onClick={saveProduct}
                  className="flex-1 py-3 text-sm font-bold text-white bg-[#111111] rounded-xl hover:bg-[#111111] shadow-md shadow-[#111111]/20 transition-all"
                >
                  {editingProductId ? "Update Product" : "Save Product"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;







