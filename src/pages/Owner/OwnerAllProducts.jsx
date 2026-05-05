import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search, MoreVertical } from "lucide-react";
import { useUser } from "@clerk/clerk-react";

const API_ORIGIN = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_OWNER_PRODUCTS = (email) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products`;
const API_OWNER_DELETE_PRODUCT = (email, id) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products/${encodeURIComponent(id)}`;
const ADMIN_BUSINESS_DETAILS_KEY = "admin_business_details";
const OWNER_PROFILE_META_KEY = "owner_profile_meta_v1";

const getProductId = (product) => {
  const raw =
    product?.id ??
    product?._id ??
    product?.productId ??
    product?.product_id ??
    product?.legacy_id ??
    product?.legacyId;
  const id = String(raw || "").trim();
  return id || "";
};

const getMenuPosition = (rect) => {
  if (typeof window === "undefined" || !rect) return { x: 12, y: 12 };
  const menuWidth = 160; // w-40
  const menuHeight = 104; // 2 items + padding
  const padding = 12;

  const idealX = rect.right - menuWidth;
  const x = Math.max(padding, Math.min(window.innerWidth - menuWidth - padding, idealX));

  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < menuHeight + 12;
  const idealY = openUp ? rect.top - menuHeight - 8 : rect.bottom + 8;
  const y = Math.max(padding, Math.min(window.innerHeight - menuHeight - padding, idealY));

  return { x, y };
};

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const readBusinessCity = (clerkUser) => {
  const clerkCity = String(clerkUser?.unsafeMetadata?.city || clerkUser?.publicMetadata?.city || "").trim();
  if (clerkCity) return clerkCity;

  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_BUSINESS_DETAILS_KEY) || "null");
    const explicitCity = String(saved?.city || "").trim();
    if (explicitCity) return explicitCity;

    const address = String(saved?.address || "").trim();
    if (address) {
      const match = address.match(/,\s*([A-Za-z\s]+)\s*\d{5,6}\s*$/);
      if (match?.[1]) return String(match[1]).trim();

      const parts = address
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const derived = String(parts[parts.length - 1] || "").replace(/\d+/g, "").trim();
      if (derived) return derived;
    }

    const meta = JSON.parse(localStorage.getItem(OWNER_PROFILE_META_KEY) || "null");
    const metaCity = String(meta?.city || "").trim();
    return metaCity;
  } catch {
    return "";
  }
};

const formatINR = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const getProductType = (product) => {
  const availabilityType = String(product?.availabilityType || "").trim().toLowerCase();
  const buy = Number(product?.buyPrice || 0) > 0;
  const rent = Number(product?.rentPrice || 0) > 0;

  if (availabilityType === "rent" || (!buy && rent)) return "rent";
  if (availabilityType === "buy" || (buy && !rent)) return "buy";
  if (availabilityType === "all" || (buy && rent)) return "both";
  return "both";
};

const typeBadgeClass = (type) => {
  if (type === "rent") return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "buy") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-indigo-50 text-indigo-700 border-indigo-200";
};

const statusBadge = ({ inStock, type }) => {
  if (inStock) {
    return { label: "Available", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }

  if (type === "rent") {
    return { label: "Rented", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }

  return { label: "Sold out", className: "bg-rose-50 text-rose-700 border-rose-200" };
};

const OwnerAllProducts = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);
  const city = useMemo(() => readBusinessCity(user), [user]);
  const isMenuOpen =
    Boolean(menu) && typeof menu === "object" && Number.isFinite(menu.x) && Number.isFinite(menu.y);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_PRODUCTS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.products) ? data.products : [];
      setProducts(rows);
    } catch (err) {
      console.log("OwnerAllProducts fetch failed:", err?.message || err);
      setProducts([]);
      setError("Unable to load products for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", close);
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  const deleteProduct = async (product) => {
    const id = getProductId(product);
    if (!id) return;

    const ok = window.confirm(`Delete "${String(product?.name || "this product")}"?`);
    if (!ok) return;

    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_DELETE_PRODUCT(ownerEmail, id), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setProducts((prev) => prev.filter((p) => getProductId(p) !== id));
      setMenu(null);
    } catch (err) {
      console.log("OwnerAllProducts delete failed:", err?.message || err);
      alert(String(err?.message || "Failed to delete product."));
    }
  };

  const filtered = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    const type = String(typeFilter || "all").trim().toLowerCase();
    const status = String(statusFilter || "all").trim().toLowerCase();

    return products.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const category = String(product?.category || "").toLowerCase();
      const matchesSearch = !search || name.includes(search) || category.includes(search);

      const pType = getProductType(product);
      const matchesType = type === "all" || pType === type;

      const isDraft = Boolean(product?.isDraft);
      const inStock = Boolean(product?.inStock);
      const matchesStatus =
        status === "all" ||
        (status === "draft" && isDraft) ||
        (status === "available" && !isDraft && inStock) ||
        (status === "sold_out" && !isDraft && !inStock && pType !== "rent") ||
        (status === "rented" && !isDraft && !inStock && pType === "rent");

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [products, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">All products</h1>
          <p className="text-sm text-black/60 mt-1">
            Products uploaded by your shop{city ? ` in ${city}.` : "."}
          </p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>

      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full h-11 pl-11 pr-4 rounded-2xl border border-black/10 bg-gray-50 text-black placeholder:text-black/40 outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All types</option>
                <option value="both">Both</option>
                <option value="buy">Sale</option>
                <option value="rent">Rent</option>
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All status</option>
                <option value="available">Available</option>
                <option value="sold_out">Sold out</option>
                <option value="rented">Rented</option>
                <option value="draft">Draft</option>
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Product
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Type
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Price
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Rent/Day
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Status
                </th>
                <th
                  scope="col"
                  className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5 text-right"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-sm text-black/60">
                    Loading products…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-sm text-black/60">
                    No products found.
                  </td>
                </tr>
              ) : (
                filtered.map((product, index) => {
                  const productId = getProductId(product);
                  const rowId = productId || `row-${index}`;
                  const type = getProductType(product);
                  const inStock = Boolean(product?.inStock);
                  const isDraft = Boolean(product?.isDraft);
                  const status = isDraft
                    ? { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" }
                    : statusBadge({ inStock, type });

                  return (
                    <tr key={rowId} className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4 min-w-0">
                          <img
                            src={
                              product?.image ||
                              "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"
                            }
                            alt={product?.name || "Product"}
                            className="h-12 w-12 rounded-xl object-cover border border-black/10 bg-gray-100 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-black leading-5 truncate">
                              {product?.name || "Product"}
                            </div>
                            <div className="text-xs text-black/55 mt-1 truncate">
                              {(() => {
                                const parts = [
                                  String(product?.category || "").trim(),
                                  String(product?.size || "").trim(),
                                  String(product?.color || "").trim(),
                                  String(product?.occasion || "").trim(),
                                ].filter(Boolean);
                                return parts.length ? parts.join(" \u00B7 ") : "Category";
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", typeBadgeClass(type)].join(" ")}>
                          {type === "both" ? "Both" : type === "buy" ? "Sale" : "Rent"}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm font-semibold text-black">
                        {Number(product?.buyPrice || 0) > 0 ? formatINR(product.buyPrice) : <span className="text-black/30">—</span>}
                      </td>
                      <td className="px-6 py-5 text-sm font-semibold text-black">
                        {Number(product?.rentPrice || 0) > 0 ? formatINR(product.rentPrice) : <span className="text-black/30">—</span>}
                      </td>
                      <td className="px-6 py-5">
                        <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", status.className].join(" ")}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="relative inline-flex items-center justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!rowId) return;
                              const rect = e.currentTarget?.getBoundingClientRect?.();
                              const { x, y } = getMenuPosition(rect);
                              setMenu((prev) => {
                                if (prev?.id === rowId) return null;

                                return { id: rowId, productId, product, x, y };
                              });
                            }}
                            className="h-10 w-10 rounded-xl border border-black/10 bg-white hover:bg-black/5 inline-flex items-center justify-center"
                            aria-label="Actions"
                            aria-haspopup="menu"
                            aria-expanded={menu?.id === rowId}
                          >
                            <MoreVertical size={18} className="text-black/60" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="fixed z-[91] w-40 rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              const id = menu.productId || getProductId(menu.product);
              if (!id) {
                setMenu(null);
                alert("Missing product id. Unable to edit this item.");
                return;
              }
              setMenu(null);
              navigate(`/owner/products/add?edit=${encodeURIComponent(id)}`);
            }}
            className="w-full text-left px-4 py-3 text-sm text-black/80 hover:bg-black/5"
            role="menuitem"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              const product = menu.product || products.find((p) => getProductId(p) === menu.productId);
              if (product) deleteProduct(product);
            }}
            className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
            role="menuitem"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default OwnerAllProducts;
