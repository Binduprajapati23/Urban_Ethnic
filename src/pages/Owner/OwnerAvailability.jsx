import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
  

const API_OWNER_PRODUCTS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products`;
const API_OWNER_STOCK = (email, id) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products/${encodeURIComponent(id)}/stock`;

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const formatINR = (value) => `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;

const getProductType = (product) => {
  const availabilityType = String(product?.availabilityType || "").trim().toLowerCase();
  const buy = Number(product?.buyPrice || 0) > 0;
  const rent = Number(product?.rentPrice || 0) > 0;

  if (availabilityType === "rent" || (!buy && rent)) return "rent";
  if (availabilityType === "buy" || (buy && !rent)) return "buy";
  if (availabilityType === "all" || (buy && rent)) return "both";
  return "both";
};

const statusBadge = ({ isDraft, inStock, type }) => {
  if (isDraft) return { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" };
  if (inStock) return { label: "Available", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (type === "rent") return { label: "Rented", className: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Sold out", className: "bg-rose-50 text-rose-700 border-rose-200" };
};

const buildSubline = (product, type) => {
  const buy = Number(product?.buyPrice || 0);
  const rent = Number(product?.rentPrice || 0);

  if (type === "both") {
    return `Both \u00B7 ${formatINR(buy)} sale \u00B7 ${formatINR(rent)}/day rent`;
  }
  if (type === "buy") {
    return `Sale \u00B7 ${formatINR(buy)}`;
  }
  return `Rent \u00B7 ${formatINR(rent)}/day`;
};

const Toggle = ({ checked, disabled, onChange, label }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={[
      "relative inline-flex h-8 w-14 items-center rounded-full border transition",
      checked ? "bg-[#111111] border-black/10" : "bg-black/5 border-black/10",
      disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-black/10",
    ].join(" ")}
    aria-pressed={checked}
    aria-label={label}
  >
    <span
      className={[
        "inline-block h-6 w-6 transform rounded-full bg-white transition",
        checked ? "translate-x-7" : "translate-x-1",
      ].join(" ")}
    />
  </button>
);

const OwnerAvailability = () => {
  const { user } = useUser();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

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
      console.log("OwnerAvailability fetch failed:", err?.message || err);
      setProducts([]);
      setError("Unable to load products for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const visibleProducts = useMemo(() => {
    return products.filter((p) => !p?.isDraft);
  }, [products]);

  const toggleStock = async (id, nextInStock) => {
    const safeId = String(id || "").trim();
    if (!safeId) return;

    setUpdatingId(safeId);
    const previous = products;
    setProducts((prev) =>
      prev.map((p) => (String(p?.id || "") === safeId ? { ...p, inStock: Boolean(nextInStock) } : p))
    );

    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_STOCK(ownerEmail, safeId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inStock: Boolean(nextInStock) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.log("OwnerAvailability stock update failed:", err?.message || err);
      alert("Failed to update availability. Make sure backend is running.");
      setProducts(previous);
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">Availability</h1>
          <p className="text-sm text-black/60 mt-1">Quickly toggle products on or off without deleting them.</p>
          {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
        </div>

      </div>

      <div className="w-full rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between gap-4">
          <div className="text-lg font-serif text-black">All products</div>
          <div className="text-xs text-black/45">Toggle = visible in customer search</div>
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-sm text-black/60">Loading products...</div>
        ) : visibleProducts.length === 0 ? (
          <div className="px-6 py-10 text-sm text-black/60">No products found.</div>
        ) : (
          <div className="divide-y divide-black/10">
            {visibleProducts.map((product) => {
              const id = String(product?.id || "");
              const type = getProductType(product);
              const inStock = Boolean(product?.inStock);
              const badge = statusBadge({ isDraft: Boolean(product?.isDraft), inStock, type });
              const isUpdating = updatingId === id;

              return (
                <div key={id} className="px-6 py-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl border border-black/10 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {product?.image ? (
                      <img src={product.image} alt={product?.name || "Product"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 rounded-lg bg-black/10" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-black truncate">{product?.name || "Product"}</div>
                    <div className="text-xs text-black/55 mt-1 truncate">{buildSubline(product, type)}</div>
                  </div>

                  <span
                    className={[
                      "inline-flex items-center px-3 py-1 rounded-full border text-xs",
                      badge.className,
                    ].join(" ")}
                  >
                    {badge.label}
                  </span>

                  <Toggle
                    checked={inStock}
                    disabled={isUpdating}
                    onChange={(next) => toggleStock(id, next)}
                    label={`Toggle ${product?.name || "product"}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerAvailability;
