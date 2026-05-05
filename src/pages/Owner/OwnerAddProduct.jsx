import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Upload, X } from "lucide-react";
import { useUser } from "@clerk/clerk-react";

const API_ORIGIN = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_OWNER_PRODUCTS = (email) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products`;
const API_OWNER_PRODUCT = (email, id) =>
  `${API_ORIGIN}/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/products/${encodeURIComponent(id)}`;
const ADMIN_OWNER_PROFILE_KEY = "admin_owner_profile";
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

const readOwnerName = (clerkUser) => {
  const fullName = String(clerkUser?.fullName || "").trim();
  if (fullName) return fullName;

  const composed = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim();
  if (composed) return composed;

  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_OWNER_PROFILE_KEY) || "null");
    const name = String(saved?.name || saved?.yourName || "").trim();
    if (name) return name;
  } catch {
    // ignore
  }

  return "";
};

const normalizeImageList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // ignore
  }
  return raw
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });

const OwnerAddProduct = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const editId = String(searchParams.get("edit") || "").trim();

  const city = useMemo(() => readBusinessCity(user), [user]);
  const ownerName = useMemo(() => readOwnerName(user), [user]);

  const fileInputRef = useRef(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [occasion, setOccasion] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [availabilityType, setAvailabilityType] = useState("Buy");
  const [buyPrice, setBuyPrice] = useState("0");
  const [rentPrice, setRentPrice] = useState("0");
  const [images, setImages] = useState([]);

  const [isLoading, setIsLoading] = useState(Boolean(editId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadForEdit = useCallback(async () => {
    if (!editId) return;
    setIsLoading(true);
    setError("");
    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const res = await fetch(API_OWNER_PRODUCTS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.products) ? data.products : [];
      const found = rows.find((p) => getProductId(p) === editId);
      if (!found) {
        setError("Product not found.");
        return;
      }

      setName(String(found?.name || ""));
      setDescription(String(found?.description || ""));
      setCategory(String(found?.category || ""));
      setOccasion(String(found?.occasion || ""));
      setSize(String(found?.size || ""));
      setColor(String(found?.color || ""));
      setAvailabilityType(String(found?.availabilityType || "All"));
      setBuyPrice(String(Number(found?.buyPrice || 0)));
      setRentPrice(String(Number(found?.rentPrice || 0)));
      const list = normalizeImageList(found?.images || found?.image_urls || found?.imageUrls);
      const primary = String(found?.image || "").trim();
      const merged = Array.from(new Set([primary, ...list].filter(Boolean)));
      setImages(merged.slice(0, 5));
    } catch (err) {
      console.log("OwnerAddProduct edit load failed:", err?.message || err);
      setError("Unable to load product details.");
    } finally {
      setIsLoading(false);
    }
  }, [editId, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    void loadForEdit();
  }, [loadForEdit]);

  const openFilePicker = () => fileInputRef.current?.click();

  const onFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    const maxImages = 5;
    const remaining = Math.max(0, maxImages - images.length);
    const slice = files.slice(0, remaining);
    if (slice.length === 0) return;

    for (const file of slice) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) {
        setError("Max 5MB per image.");
        continue;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        setImages((prev) => {
          const next = Array.from(new Set([...prev, dataUrl]));
          return next.slice(0, 5);
        });
      } catch {
        setError("Failed to upload one of the images.");
      }
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const saveProduct = async ({ asDraft }) => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      setError("Product title is required.");
      return;
    }
    if (images.length === 0) {
      setError("Please upload at least 1 product image.");
      return;
    }
    if (!category) {
      setError("Please select a category.");
      return;
    }

    setIsSaving(true);
    setError("");

    const payload = {
      name: trimmedName,
      description: String(description || "").trim(),
      category,
      occasion,
      size,
      color: String(color || "").trim(),
      city: city || "",
      ownerName: ownerName || "",
      availabilityType,
      buyPrice: Number(buyPrice || 0),
      rentPrice: Number(rentPrice || 0),
      images,
      inStock: true,
      isDraft: Boolean(asDraft),
    };

    try {
      const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
      if (!ownerEmail) throw new Error("Missing owner email");

      const url = editId ? API_OWNER_PRODUCT(ownerEmail, editId) : API_OWNER_PRODUCTS(ownerEmail);
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      navigate("/owner/products/all");
    } catch (err) {
      console.log("OwnerAddProduct save failed:", err?.message || err);
      const msg = String(err?.message || err || "").trim();
      const isNetwork =
        msg === "Failed to fetch" ||
        /network|load failed|fetch/i.test(msg) ||
        err?.name === "TypeError";
      setError(
        isNetwork
          ? "Could not reach the server. From the project folder run: cd Backend && npm start (ensure MySQL is configured in Backend/.env)."
          : msg || "Failed to save product."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">{editId ? "Edit product" : "Add product"}</h1>
          <p className="text-sm text-black/60 mt-1">
            Fill details below. City is auto-set to your shop location{city ? `: ${city}.` : "."}
          </p>
        </div>

      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="max-w-2xl mx-auto rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <h2 className="text-lg font-serif text-black">Product details</h2>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-sm text-white/60">Loading…</div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm text-black/80">Product images</label>
                  <span className="text-xs text-black/45">{images.length}/5</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onFilesSelected}
                  disabled={isSaving || isLoading}
                />

                {images.length === 0 ? (
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={isSaving || isLoading}
                    className="w-full rounded-2xl border border-dashed border-black/15 bg-gray-50 hover:bg-black/5 transition min-h-[150px] flex flex-col items-center justify-center gap-2 text-black/70 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Upload size={20} className="text-black/60" />
                    <span className="text-sm font-semibold">Upload images</span>
                    <span className="text-[11px] text-black/45">
                      JPG/PNG {"\u2022"} max 5MB each {"\u2022"} up to 5 images
                    </span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((src, index) => (
                      <div
                        key={`${src}-${index}`}
                        className="relative rounded-2xl border border-black/10 bg-gray-50 overflow-hidden aspect-[4/3]"
                      >
                        <img src={src} alt={`Product ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 h-8 w-8 rounded-xl border border-black/10 bg-white/80 hover:bg-white inline-flex items-center justify-center"
                          aria-label="Remove image"
                        >
                          <X size={16} className="text-black/70" />
                        </button>
                      </div>
                    ))}

                    {images.length < 5 && (
                      <button
                        type="button"
                        onClick={openFilePicker}
                        disabled={isSaving || isLoading}
                        className="rounded-2xl border border-dashed border-black/15 bg-gray-50 hover:bg-black/5 transition aspect-[4/3] flex flex-col items-center justify-center gap-2 text-black/70 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Upload size={18} className="text-black/60" />
                        <span className="text-xs font-semibold">Upload</span>
                        <span className="text-[10px] text-black/45">JPG/PNG {"\u2022"} max 5MB</span>
                      </button>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-black/55">
                  Upload 1{"\u2013"}5 images. The first image will be used as the main thumbnail.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-black/80">Product title</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Bandhani Lehenga Set"
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black placeholder:text-black/40 px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-black/80">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe fabric, embroidery, occasion etc."
                  className="w-full min-h-[110px] rounded-2xl border border-black/10 bg-gray-50 text-black placeholder:text-black/40 px-4 py-3 outline-none focus:ring-2 focus:ring-black/10 resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-black/80">Category</label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black px-4 pr-11 outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <option value="" disabled>
                        Select category
                      </option>
                      <option value="Jewellery">Jewellery</option>
                      <option value="Ethnic Wear">Ethnic Wear</option>
                      <option value="Accessories">Accessories</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-black/80">Occasion</label>
                  <div className="relative">
                    <select
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value)}
                      className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black px-4 pr-11 outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <option value="">Select occasion</option>
                      <option value="Wedding">Wedding</option>
                      <option value="Festival">Festival</option>
                      <option value="Casual">Casual</option>
                      <option value="Party">Party</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-black/80">Size</label>
                  <div className="relative">
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black px-4 pr-11 outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <option value="">Select size</option>
                      <option value="Free size">Free size</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-black/80">Color</label>
                  <input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Red, Gold"
                    className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black placeholder:text-black/40 px-4 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-black/80">Listing type</label>
                  <div className="relative">
                    <select
                      value={availabilityType}
                      onChange={(e) => setAvailabilityType(e.target.value)}
                      className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-gray-50 text-black px-4 pr-11 outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <option value="Buy">For sale only</option>
                      <option value="Rent">For rent only</option>
                      <option value="All">Both (sale + rent)</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-black/80">City (auto-tagged)</label>
                  <input
                    value={city}
                    disabled
                    className="w-full h-11 rounded-2xl border border-black/10 bg-gray-100 text-black/70 px-4 outline-none"
                    placeholder="City"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-black/80">Sale price (₹)</label>
                  <input
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    type="number"
                    min="0"
                    className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-black/80">Rent price per day (₹)</label>
                  <input
                    value={rentPrice}
                    onChange={(e) => setRentPrice(e.target.value)}
                    type="number"
                    min="0"
                    className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              </div>


            </>
          )}
        </div>

        <div className="p-6 border-t border-black/10 bg-white">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={isSaving || isLoading}
              onClick={() => saveProduct({ asDraft: false })}
              className="sm:flex-1 h-11 rounded-2xl bg-[#111111] text-white font-semibold hover:bg-[#111111]/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Publish product
            </button>
            <button
              type="button"
              disabled={isSaving || isLoading}
              onClick={() => saveProduct({ asDraft: true })}
              className="sm:flex-1 h-11 rounded-2xl border border-black/15 bg-white text-black font-semibold hover:bg-black/5 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Save as draft
            </button>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => navigate("/owner/products/all")}
            className="mt-4 text-xs text-black/50 hover:text-black/75 transition"
          >
            Back to all products
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerAddProduct;
