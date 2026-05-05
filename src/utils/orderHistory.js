const USER_ORDERS_PREFIX = "urban_ethnic_user_orders";
const USER_RENTALS_PREFIX = "urban_ethnic_user_rentals";
const ADMIN_ORDERS_KEY = "admin_orders";
const ADMIN_RENTALS_KEY = "admin_rentals";

const safeReadArray = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeWriteArray = (key, items) => {
  localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []));
};

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const getUserScope = () => {
  const user = getCurrentUser();
  if (!user) return "guest";
  const role = String(user.role || "user").trim().toLowerCase();
  const identity = String(user.email || user.id || "guest").trim().toLowerCase();
  return `${role}:${identity || "guest"}`;
};

const getUserOrdersKey = () => `${USER_ORDERS_PREFIX}:${getUserScope()}`;
const getUserRentalsKey = () => `${USER_RENTALS_PREFIX}:${getUserScope()}`;

const prependUniqueById = (existing, item) => {
  const id = String(item?.id || "");
  if (!id) return existing;
  return [item, ...existing.filter((entry) => String(entry?.id || "") !== id)];
};

export const getUserOrderHistory = () => safeReadArray(getUserOrdersKey());
export const getUserRentalHistory = () => safeReadArray(getUserRentalsKey());
export const getAdminOrders = () => safeReadArray(ADMIN_ORDERS_KEY);
export const getAdminRentals = () => safeReadArray(ADMIN_RENTALS_KEY);
export const findUserOrderById = (orderId) => {
  const targetId = String(orderId || "").trim();
  if (!targetId) return null;
  return getUserOrderHistory().find((order) => String(order?.id || "").trim() === targetId) || null;
};

export const appendUserOrder = (order) => {
  const next = prependUniqueById(getUserOrderHistory(), order);
  safeWriteArray(getUserOrdersKey(), next);
  return next;
};

export const appendUserRental = (rental) => {
  const next = prependUniqueById(getUserRentalHistory(), rental);
  safeWriteArray(getUserRentalsKey(), next);
  return next;
};

export const appendAdminOrder = (order) => {
  const next = prependUniqueById(getAdminOrders(), order);
  safeWriteArray(ADMIN_ORDERS_KEY, next);
  return next;
};

export const appendAdminRental = (rental) => {
  const next = prependUniqueById(getAdminRentals(), rental);
  safeWriteArray(ADMIN_RENTALS_KEY, next);
  return next;
};

export const syncUserOrderStatusByEmail = ({ orderId, email, status }) => {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedOrderId) return false;

  let updatedAny = false;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(`${USER_ORDERS_PREFIX}:`)) continue;
    if (normalizedEmail && !(key === `${USER_ORDERS_PREFIX}:${normalizedEmail}` || key.endsWith(`:${normalizedEmail}`))) {
      continue;
    }

    const existingOrders = safeReadArray(key);
    let changed = false;
    const nextOrders = existingOrders.map((order) => {
      if (String(order?.id || "") !== normalizedOrderId) return order;
      changed = true;
      return { ...order, status };
    });

    if (changed) {
      safeWriteArray(key, nextOrders);
      updatedAny = true;
    }
  }

  return updatedAny;
};

export const generateRecordId = (prefix) => {
  const now = Date.now().toString().slice(-7);
  const random = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${now}${random}`;
};

export const getActiveUserProfile = () => {
  const user = getCurrentUser();
  return {
    name: String(user?.name || user?.f_name || "Customer"),
    email: String(user?.email || ""),
    phone: String(user?.phone || ""),
    role: String(user?.role || "user"),
  };
};
