import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { requestJson } from "../../utils/http";

const API_PRODUCTS = "http://localhost:5000/api/admin/products";
const ADMIN_CATEGORIES_KEY = "admin_categories";

const defaultCategories = [
  { id: "jewellery", name: "Jewellery", description: "Rings, necklaces and more." },
  { id: "ethnic-wear", name: "Ethnic Wear", description: "Sarees, lehengas and outfits." },
  { id: "accessories", name: "Accessories", description: "Bags, clutches and add-ons." },
];

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const makeId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `cat_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
};

const readLocalCategories = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_CATEGORIES_KEY) || "null");
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
};

const AdminCategories = () => {
  const [categories, setCategories] = useState(() => readLocalCategories() || defaultCategories);
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_CATEGORIES_KEY, JSON.stringify(categories));
    } catch {
      // ignore
    }
  }, [categories]);

  useEffect(() => {
    let cancelled = false;

    const readLocalProducts = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("admin_products") || "null");
        return Array.isArray(saved) ? saved : [];
      } catch {
        return [];
      }
    };

    const load = async () => {
      setIsLoadingProducts(true);
      setErrorMessage("");
      try {
        const data = await requestJson(API_PRODUCTS);
        const rows = Array.isArray(data?.products) ? data.products : [];
        if (!cancelled) setProducts(rows);
      } catch (err) {
        const fallback = readLocalProducts();
        if (!cancelled) setProducts(fallback);
        if (!cancelled) setErrorMessage("Unable to load products from database. Showing saved data.");
        console.log("Failed to load admin products for category stats:", err?.body || err.message);
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const productCounts = useMemo(() => {
    const counts = new Map();
    products.forEach((p) => {
      const key = String(p?.category || "").trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [products]);

  const rows = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    const base = categories
      .map((cat) => {
        const name = String(cat?.name || "").trim();
        const normalized = name.toLowerCase();
        return {
          id: String(cat?.id || slugify(name) || makeId()),
          name,
          description: String(cat?.description || "").trim(),
          createdAt: String(cat?.createdAt || "").trim(),
          count: productCounts.get(normalized) || 0,
        };
      })
      .filter((cat) => (query ? cat.name.toLowerCase().includes(query) || cat.description.toLowerCase().includes(query) : true));

    const sorted = [...base].sort((a, b) => {
      if (sortBy === "products") return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [categories, productCounts, searchQuery, sortBy]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", description: "" });
    setIsDialogOpen(true);
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, description: cat.description || "" });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setForm({ name: "", description: "" });
  };

  const upsertCategory = () => {
    const name = String(form.name || "").trim();
    const description = String(form.description || "").trim();
    if (!name) {
      setErrorMessage("Category name is required.");
      return;
    }

    const normalized = name.toLowerCase();
    const collision = categories.some((cat) => String(cat?.name || "").trim().toLowerCase() === normalized && String(cat?.id) !== String(editingId));
    if (collision) {
      setErrorMessage("This category already exists.");
      return;
    }

    setErrorMessage("");
    setCategories((prev) => {
      const now = new Date().toISOString().slice(0, 10);
      if (editingId) {
        return prev.map((cat) =>
          String(cat?.id) === String(editingId)
            ? { ...cat, name, description, id: String(cat?.id || slugify(name) || makeId()) }
            : cat
        );
      }
      return [
        ...prev,
        {
          id: slugify(name) || makeId(),
          name,
          description,
          createdAt: now,
        },
      ];
    });
    closeDialog();
  };

  const deleteCategory = (cat) => {
    const ok = window.confirm(`Delete category "${cat.name}"?`);
    if (!ok) return;
    setCategories((prev) => prev.filter((row) => String(row?.id) !== String(cat.id)));
  };

  return (
    <div className="p-6 lg:p-10 space-y-8 bg-[#f3f0f0] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-serif text-[#111111] font-bold">Categories</h1>
          <p className="text-gray-500 mt-1">Manage your product categories.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="h-10 px-4 rounded-xl bg-[#111111] text-white font-semibold hover:bg-[#111111] transition inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search categories..."
                className="w-full h-11 pl-11 pr-4 rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none focus:ring-2 focus:ring-black/10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full h-11 appearance-none rounded-2xl border border-black/10 bg-[#f3f0f0] text-sm outline-none px-4 pr-11 focus:ring-2 focus:ring-black/10"
              >
                <option value="name">Sort: Name</option>
                <option value="products">Sort: Products</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
            </div>
          </div>

          {errorMessage && <div className="mt-3 text-xs text-rose-600">{errorMessage}</div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Category
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Description
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Products
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
              {isLoadingProducts ? (
                <tr>
                  <td colSpan={4} className="pl-8 pr-6 py-10 text-sm text-black/60">
                    Loading categories...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="pl-8 pr-6 py-10 text-sm text-black/60">
                    No categories found.
                  </td>
                </tr>
              ) : (
                rows.map((cat) => (
                  <tr key={cat.id} className="bg-white hover:bg-[#f3f0f0] transition-colors even:bg-[#fafafa]">
                    <td className="pl-8 pr-6 py-5">
                      <div className="text-sm font-semibold text-[#111111] leading-5">{cat.name}</div>
                      {cat.createdAt && <div className="text-xs text-black/55 mt-1">Created {cat.createdAt}</div>}
                    </td>
                    <td className="pl-8 pr-6 py-5 text-sm text-black/70">{cat.description || "—"}</td>
                    <td className="pl-8 pr-6 py-5">
                      <span className="inline-flex items-center px-3 py-1 rounded-full border border-black/10 bg-[#f3f0f0] text-xs font-semibold text-black/70">
                        {cat.count} products
                      </span>
                    </td>
                    <td className="pl-8 pr-6 py-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(cat)}
                          className="inline-flex items-center px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                        >
                          <Pencil className="w-4 h-4 mr-2 text-black/60" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(cat)}
                          className="inline-flex items-center px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-rose-50 text-sm font-semibold text-[#111111] transition"
                        >
                          <Trash2 className="w-4 h-4 mr-2 text-black/60" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[0_25px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#f3f0f0]/60">
              <h2 className="text-xl font-serif text-[#111111] font-bold">{editingId ? "Edit Category" : "Add Category"}</h2>
              <button type="button" onClick={closeDialog} className="p-2 hover:bg-gray-200 rounded-full">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-4 bg-[#f3f0f0]/60">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">Category Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Jewellery"
                  className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest ml-1">
                  Description (Optional)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Short description for this category..."
                  rows={4}
                  className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm shadow-sm transition-shadow focus:outline-none focus:ring-1 focus:ring-[#111111] focus:shadow-md resize-none"
                />
              </div>
            </div>

            <div className="p-6 pt-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="flex-1 h-12 rounded-2xl border-2 border-[#111111] text-[#111111] text-sm font-semibold inline-flex items-center justify-center transition-all duration-200 hover:bg-[#111111] hover:text-white active:scale-[0.98]"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={upsertCategory}
                  className="flex-1 py-3 text-sm font-bold text-white bg-[#111111] rounded-xl hover:bg-[#111111] shadow-md shadow-[#111111]/20 transition-all"
                >
                  {editingId ? "Update Category" : "Save Category"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategories;
