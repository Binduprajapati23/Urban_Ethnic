import { requestJson } from "./http";

const ADMIN_PRODUCTS_URL = "http://localhost:5000/api/admin/products";
const CACHE_TTL_MS = 15000;

let cachedProducts = null;
let cachedAt = 0;
let inflightPromise = null;

export const fetchAdminProducts = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cachedProducts && now - cachedAt < CACHE_TTL_MS) {
    return cachedProducts;
  }

  if (!force && inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = requestJson(ADMIN_PRODUCTS_URL)
    .then((data) => {
      const rows = Array.isArray(data?.products) ? data.products : [];
      cachedProducts = rows;
      cachedAt = Date.now();
      return rows;
    })
    .catch((err) => {
      console.log("Failed to fetch admin products:", err?.body || err.message);
      return [];
    })
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
};
