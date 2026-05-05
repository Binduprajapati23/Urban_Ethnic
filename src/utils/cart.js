const CART_STORAGE_KEY_PREFIX = "urban_ethnic_cart";
const CART_UPDATED_EVENT = "urban_ethnic_cart_updated";

const isCurrentUserAdmin = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const role = String(user?.role || "").trim().toLowerCase();
    return role === "admin" || role === "owner";
  } catch {
    return false;
  }
};

export const canUseCart = () => !isCurrentUserAdmin();

const getCurrentUserIdentity = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user) return "guest";
    return String(user.email || user.id || "guest").trim().toLowerCase() || "guest";
  } catch {
    return "guest";
  }
};

const getCartStorageKey = () => `${CART_STORAGE_KEY_PREFIX}:${getCurrentUserIdentity()}`;

const getLegacyCartStorageKey = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user) return `${CART_STORAGE_KEY_PREFIX}:guest`;

    const identity = String(user.email || user.id || "guest").trim().toLowerCase() || "guest";
    const role = String(user.role || "user").trim().toLowerCase();
    return `${CART_STORAGE_KEY_PREFIX}:${role}:${identity}`;
  } catch {
    return `${CART_STORAGE_KEY_PREFIX}:guest`;
  }
};

const parseCart = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getCartItems = () => {
  const currentKey = getCartStorageKey();
  const currentItems = parseCart(localStorage.getItem(currentKey));
  if (currentItems.length > 0) return currentItems;

  const legacyKey = getLegacyCartStorageKey();
  if (legacyKey === currentKey) return currentItems;

  const legacyItems = parseCart(localStorage.getItem(legacyKey));
  if (legacyItems.length > 0) {
    localStorage.setItem(currentKey, JSON.stringify(legacyItems));
    return legacyItems;
  }

  return currentItems;
};

const saveCartItems = (items) => {
  localStorage.setItem(getCartStorageKey(), JSON.stringify(items));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
};

export const getCartUpdatedEventName = () => CART_UPDATED_EVENT;

export const addToCart = (item) => {
  if (!canUseCart()) return getCartItems();
  if (!item || item.id === undefined || item.id === null) return getCartItems();

  const mode = item.mode || "buy";
  const itemSize = String(item.size || "").trim() || "Free Size";
  const cartItems = getCartItems();
  const existingIndex = cartItems.findIndex(
    (cartItem) =>
      String(cartItem.id) === String(item.id) &&
      cartItem.mode === mode &&
      String(cartItem.size || "").trim() === itemSize
  );

  if (existingIndex >= 0) {
    const updatedItems = [...cartItems];
    const existing = updatedItems[existingIndex];
    updatedItems[existingIndex] = {
      ...existing,
      quantity: (existing.quantity || 1) + (item.quantity || 1),
    };
    saveCartItems(updatedItems);
    return updatedItems;
  }

  const nextItems = [{ quantity: 1, ...item, mode, size: itemSize }, ...cartItems];
  saveCartItems(nextItems);
  return nextItems;
};

export const removeFromCartById = (id, mode = null, size = null) => {
  const cartItems = getCartItems();
  const nextItems = cartItems.filter((item) => {
    const sameId = String(item.id) === String(id);
    if (!sameId) return true;
    if (!mode) return false;
    const sameMode = item.mode === mode;
    if (!sameMode) return true;
    if (!size) return false;
    return String(item.size || "").trim() !== String(size).trim();
  });
  saveCartItems(nextItems);
  return nextItems;
};

export const updateCartItemQuantity = (id, mode, quantity, size = null) => {
  const cartItems = getCartItems();
  const safeQuantity = Math.max(1, quantity || 1);

  const nextItems = cartItems.map((item) => {
    const sameId = String(item.id) === String(id);
    const sameMode = item.mode === mode;
    const sameSize = !size || String(item.size || "").trim() === String(size).trim();
    if (!sameId || !sameMode || !sameSize) return item;
    return { ...item, quantity: safeQuantity };
  });

  saveCartItems(nextItems);
  return nextItems;
};

export const updateCartItemSize = (id, mode, currentSize, nextSize) => {
  const cartItems = getCartItems();
  const normalizedCurrentSize = String(currentSize || "").trim() || "Free Size";
  const normalizedNextSize = String(nextSize || "").trim() || "Free Size";

  if (normalizedCurrentSize === normalizedNextSize) return cartItems;

  const sourceIndex = cartItems.findIndex(
    (item) =>
      String(item.id) === String(id) &&
      item.mode === mode &&
      (String(item.size || "").trim() || "Free Size") === normalizedCurrentSize
  );

  if (sourceIndex < 0) return cartItems;

  const sourceItem = cartItems[sourceIndex];
  const remaining = cartItems.filter((_, index) => index !== sourceIndex);

  const mergeIndex = remaining.findIndex(
    (item) =>
      String(item.id) === String(id) &&
      item.mode === mode &&
      (String(item.size || "").trim() || "Free Size") === normalizedNextSize
  );

  if (mergeIndex >= 0) {
    const merged = [...remaining];
    merged[mergeIndex] = {
      ...merged[mergeIndex],
      quantity: Number(merged[mergeIndex].quantity || 1) + Number(sourceItem.quantity || 1),
    };
    saveCartItems(merged);
    return merged;
  }

  const updated = [
    { ...sourceItem, size: normalizedNextSize },
    ...remaining,
  ];
  saveCartItems(updated);
  return updated;
};

export const clearCartItems = () => {
  saveCartItems([]);
  return [];
};
