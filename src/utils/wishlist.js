const WISHLIST_STORAGE_KEY_PREFIX = "urban_ethnic_wishlist";

const isCurrentUserAdmin = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const role = String(user?.role || "").trim().toLowerCase();
    return role === "admin" || role === "owner";
  } catch {
    return false;
  }
};

export const canUseWishlist = () => !isCurrentUserAdmin();

const getCurrentUserIdentity = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user) return "guest";
    return String(user.email || user.id || "guest").trim().toLowerCase() || "guest";
  } catch {
    return "guest";
  }
};

const getWishlistStorageKey = () => `${WISHLIST_STORAGE_KEY_PREFIX}:${getCurrentUserIdentity()}`;

const getLegacyWishlistStorageKey = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user) return `${WISHLIST_STORAGE_KEY_PREFIX}:guest`;

    const identity = String(user.email || user.id || "guest").trim().toLowerCase() || "guest";
    const role = String(user.role || "user").trim().toLowerCase();
    return `${WISHLIST_STORAGE_KEY_PREFIX}:${role}:${identity}`;
  } catch {
    return `${WISHLIST_STORAGE_KEY_PREFIX}:guest`;
  }
};

const parseWishlist = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getWishlistItems = () => {
  const currentKey = getWishlistStorageKey();
  const currentItems = parseWishlist(localStorage.getItem(currentKey));
  if (currentItems.length > 0) return currentItems;

  const legacyKey = getLegacyWishlistStorageKey();
  if (legacyKey === currentKey) return currentItems;

  const legacyItems = parseWishlist(localStorage.getItem(legacyKey));
  if (legacyItems.length > 0) {
    localStorage.setItem(currentKey, JSON.stringify(legacyItems));
    return legacyItems;
  }

  return currentItems;
};

const saveWishlistItems = (items) => {
  localStorage.setItem(getWishlistStorageKey(), JSON.stringify(items));
};

export const isInWishlist = (id) => {
  const items = getWishlistItems();
  return items.some((item) => String(item.id) === String(id));
};

export const addToWishlist = (item) => {
  if (!canUseWishlist()) return false;
  if (!item || item.id === undefined || item.id === null) return false;

  const items = getWishlistItems();
  const exists = items.some((wishlistItem) => String(wishlistItem.id) === String(item.id));
  if (exists) return false;

  saveWishlistItems([item, ...items]);
  return true;
};

export const removeFromWishlistById = (id) => {
  const items = getWishlistItems();
  const nextItems = items.filter((item) => String(item.id) !== String(id));
  saveWishlistItems(nextItems);
  return nextItems;
};
