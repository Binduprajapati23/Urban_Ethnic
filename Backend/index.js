const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");

// Ensure env is loaded before importing `./db`
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const db = require("./db");

const app = express();

app.use(cors());
const BODY_LIMIT = process.env.BODY_LIMIT || "25mb";
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";
const PASSWORD_SCHEME = "scrypt";

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeScopedEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";

  if (normalized.includes(":")) {
    const parts = normalized.split(":").filter(Boolean);
    const maybeEmail = String(parts[parts.length - 1] || "").trim().toLowerCase();
    return maybeEmail.includes("@") ? maybeEmail : "";
  }

  return normalized.includes("@") ? normalized : "";
};

const normalizePhoneForDb = (phone) => {
  const onlyDigits = String(phone || "").replace(/\D/g, "");
  if (!onlyDigits) return null;
  const value = Number(onlyDigits.slice(-10));
  return Number.isFinite(value) ? value : null;
};

const normalizePhoneForClerkUsers = (phone) => {
  const onlyDigits = String(phone || "").replace(/\D/g, "");
  if (!onlyDigits) return null;
  return onlyDigits.slice(-15);
};

const normalizeStockForDb = (value) => {
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "1";
  if (["0", "false", "out", "out of stock", "no", "inactive"].includes(text)) return "0";
  return "1";
};

const stockToBoolean = (value) => normalizeStockForDb(value) === "1";

const normalizeOrderType = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "Buy";
  if (text === "rent" || text.includes("rent")) return "Rent";
  if (text === "mixed" || text.includes("mix")) return "Mixed";
  if (text === "buy" || text.includes("buy")) return "Buy";
  return "Buy";
};

const normalizeCity = (value) => {
  const city = String(value || "").replace(/\s+/g, " ").trim();
  if (!city) return "";
  if (city.length > 100) return city.slice(0, 100);
  return city;
};

const normalizeAddress = (value) => {
  const address = String(value || "").replace(/\s+/g, " ").trim();
  if (!address) return "";
  if (address.length > 500) return address.slice(0, 500);
  return address;
};

const extractCityFromAddress = (addressText) => {
  const address = normalizeAddress(addressText);
  if (!address) return "";
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const tail = parts[parts.length - 1] || "";
  return normalizeCity(tail.replace(/\d+/g, "").trim());
};

const extractOrderCityAndAddress = (payload) => {
  const directCity =
    payload?.city ??
    payload?.customerCity ??
    payload?.shippingAddress?.city ??
    payload?.deliveryAddress?.city ??
    payload?.address?.city;

  const city = normalizeCity(directCity);

  const addressRaw =
    payload?.address ??
    payload?.shippingAddress ??
    payload?.deliveryAddress ??
    payload?.shipping_address ??
    payload?.delivery_address;

  const address =
    typeof addressRaw === "string"
      ? normalizeAddress(addressRaw)
      : normalizeAddress(addressRaw ? JSON.stringify(addressRaw) : "");

  if (city) return { city, address };
  return { city: extractCityFromAddress(address), address };
};

const parseItemsJson = (itemsText) => {
  if (!itemsText) return [];
  try {
    const parsed = JSON.parse(String(itemsText));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const splitOrderBuyRentTotals = ({ type, total, items, itemsText }) => {
  const safeTotal = Math.max(0, Number(total || 0));
  const normalizedType = normalizeOrderType(type);
  const safeItems = Array.isArray(items) ? items : parseItemsJson(itemsText);

  if (safeItems.length > 0) {
    let buy = 0;
    let rent = 0;
    for (const item of safeItems) {
      const mode = String(item?.mode || item?.type || "buy").trim().toLowerCase();
      const qty = Math.max(1, Number(item?.quantity || 1));
      const price = Math.max(0, Number(item?.price || 0));
      const line = qty * price;
      if (mode.includes("rent")) rent += line;
      else buy += line;
    }
    const sum = buy + rent;
    if (sum > 0) return { buy, rent, total: sum };
  }

  if (normalizedType === "Rent") return { buy: 0, rent: safeTotal, total: safeTotal };
  if (normalizedType === "Buy") return { buy: safeTotal, rent: 0, total: safeTotal };
  return { buy: safeTotal, rent: 0, total: safeTotal };
};

const normalizeAccountStatus = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "deactivated") return "Deactivated";
  if (text === "deleted") return "Deleted";
  if (text === "suspended") return "Suspended";
  return "Active";
};

const extractProductIdsFromRentalItems = (itemsPayload) => {
  const unique = new Set();
  const out = [];
  for (const item of Array.isArray(itemsPayload) ? itemsPayload : []) {
    const rawId = String(item?.id ?? item?.productId ?? item?.product_id ?? "").trim();
    const numeric = Number(rawId);
    if (!rawId || !Number.isFinite(numeric) || numeric <= 0) continue;
    const id = Math.floor(numeric);
    if (unique.has(id)) continue;
    unique.add(id);
    out.push(id);
  }
  return out;
};

const extractProductIdsFromItems = (itemsPayload, { mode } = {}) => {
  const desired = String(mode || "").trim().toLowerCase();
  const unique = new Set();
  const out = [];
  for (const item of Array.isArray(itemsPayload) ? itemsPayload : []) {
    if (desired) {
      const itemMode = String(item?.mode || item?.type || "").trim().toLowerCase();
      if (!itemMode) continue;
      if (!itemMode.includes(desired)) continue;
    }
    const rawId = String(item?.id ?? item?.productId ?? item?.product_id ?? "").trim();
    const numeric = Number(rawId);
    if (!rawId || !Number.isFinite(numeric) || numeric <= 0) continue;
    const id = Math.floor(numeric);
    if (unique.has(id)) continue;
    unique.add(id);
    out.push(id);
  }
  return out;
};

const extractNumericProductIdFromItem = (item) => {
  const raw = item?.id ?? item?.productId ?? item?.product_id ?? "";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const summarizeOwners = (owners) => {
  const unique = Array.from(new Set((Array.isArray(owners) ? owners : []).map((o) => String(o || "").trim()).filter(Boolean)));
  if (!unique.length) return "";
  if (unique.length === 1) return unique[0];
  return `${unique[0]} +${unique.length - 1} more`;
};

const deriveOwnerLabelsForItems = (items, ownerByProductId) => {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const explicit = String(
      item?.ownerName ?? item?.owner_name ?? item?.owner ?? item?.vendor ?? item?.shopName ?? item?.shop ?? ""
    )
      .trim();
    if (explicit) out.push(explicit);

    const pid = extractNumericProductIdFromItem(item);
    if (pid) {
      const fromProduct = String(ownerByProductId?.get(pid) || "").trim();
      if (fromProduct) out.push(fromProduct);
    }
  }
  return out;
};

const normalizeIsoDateOnly = (value) => {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  const normalized = d.toISOString().slice(0, 10);
  return normalized === text ? text : null;
};

const isBlockingRentalStatus = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text.includes("cancel")) return false;
  if (text.includes("refund")) return false;
  if (text.includes("returned")) return false;
  return true;
};

const findRentalAvailabilityConflict = async ({ productIds, pickupDate, returnDate, excludeOrderId }) => {
  const ids = Array.isArray(productIds) ? productIds.filter((n) => Number.isFinite(Number(n)) && Number(n) > 0) : [];
  if (!ids.length) return null;

  const start = normalizeIsoDateOnly(pickupDate);
  const end = normalizeIsoDateOnly(returnDate);
  if (!start || !end) return null;
  if (end < start) return null;

  const params = [end, start];
  let sql = `
    SELECT order_id, status, pickup_date, return_date, items
    FROM rental_orders
    WHERE pickup_date IS NOT NULL
      AND return_date IS NOT NULL
      AND pickup_date <= ?
      AND return_date >= ?
  `;
  const exclude = String(excludeOrderId || "").trim();
  if (exclude) {
    sql += " AND order_id <> ? ";
    params.push(exclude);
  }

  const rows = await queryAsync(sql, params);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isBlockingRentalStatus(row?.status)) continue;
    let parsedItems = [];
    try {
      const maybe = JSON.parse(String(row?.items || "[]"));
      parsedItems = Array.isArray(maybe) ? maybe : [];
    } catch {
      parsedItems = [];
    }

    const bookedIds = extractProductIdsFromRentalItems(parsedItems);
    const booked = new Set(bookedIds);
    for (const id of ids) {
      const numeric = Math.floor(Number(id));
      if (booked.has(numeric)) {
        return {
          orderId: String(row?.order_id || "").trim(),
          productId: numeric,
          pickupDate: row?.pickup_date ? String(row.pickup_date).slice(0, 10) : null,
          returnDate: row?.return_date ? String(row.return_date).slice(0, 10) : null,
          status: String(row?.status || "").trim(),
        };
      }
    }
  }

  return null;
};

const hashPassword = (plainPassword) => {
  const normalized = String(plainPassword || "").trim();
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(normalized, salt, 64).toString("hex");
  return `${PASSWORD_SCHEME}$${salt}$${derived}`;
};

const verifyPassword = (plainPassword, storedPassword) => {
  const normalized = String(plainPassword || "").trim();
  const stored = String(storedPassword || "");

  if (!stored.includes("$")) {
    return stored.trim() === normalized;
  }

  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== PASSWORD_SCHEME || !salt || !hash) {
    return false;
  }

  const derived = crypto.scryptSync(normalized, salt, 64).toString("hex");
  if (hash.length !== derived.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
};

const ensureUserSchema = () => {
  const migrations = [
    "ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NOT NULL",
    "ALTER TABLE users MODIFY COLUMN phone VARCHAR(20) NULL",
  ];

  migrations.forEach((sql) => {
    db.query(sql, (err) => {
      if (err) {
        console.log("Schema migration warning:", err.sqlMessage || err.message);
      }
    });
  });
};

ensureUserSchema();

const ensureAdminUserSchema = () => {
  const migrations = [
    "ALTER TABLE order_user MODIFY COLUMN phone BIGINT NULL",
  ];

  migrations.forEach((sql) => {
    db.query(sql, (err) => {
      if (err) {
        console.log("Admin user schema migration warning:", err.sqlMessage || err.message);
      }
    });
  });
};

ensureAdminUserSchema();

const ensureRentalOrderSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS rental_orders (
        id INT NOT NULL AUTO_INCREMENT,
        rental_id VARCHAR(100) NULL,
        order_id VARCHAR(100) NOT NULL,
        customer VARCHAR(150) NOT NULL,
        customer_email VARCHAR(191) NULL,
        items LONGTEXT NOT NULL,
        amount BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        date DATE NULL,
        pickup_date DATE NULL,
        return_date DATE NULL,
        daily_rate BIGINT NULL,
        total_days INT NULL,
        deposit BIGINT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_rental_orders_order_id (order_id),
        KEY ix_rental_orders_customer_email (customer_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Rental order schema migration warning:", err.sqlMessage || err.message);
  }

  const migrations = [
    "ALTER TABLE rental_orders MODIFY COLUMN order_id VARCHAR(100) NOT NULL",
    "ALTER TABLE rental_orders MODIFY COLUMN customer VARCHAR(150) NOT NULL",
    "ALTER TABLE rental_orders MODIFY COLUMN items LONGTEXT NOT NULL",
    "ALTER TABLE rental_orders MODIFY COLUMN amount BIGINT NOT NULL",
    "ALTER TABLE rental_orders MODIFY COLUMN status VARCHAR(50) NOT NULL",
  ];

  for (const sql of migrations) {
    try {
      await queryAsync(sql);
    } catch (err) {
      console.log("Rental order schema migration warning:", err.sqlMessage || err.message);
    }
  }
};

const ensureBuyOrderSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS buy_orders (
        id INT NOT NULL AUTO_INCREMENT,
        order_id VARCHAR(100) NOT NULL,
        customer VARCHAR(150) NOT NULL,
        customer_email VARCHAR(191) NULL,
        items LONGTEXT NOT NULL,
        amount BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        date DATE NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_buy_orders_order_id (order_id),
        KEY ix_buy_orders_customer_email (customer_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Buy order schema migration warning:", err.sqlMessage || err.message);
  }

  const migrations = [
    "ALTER TABLE buy_orders MODIFY COLUMN order_id VARCHAR(100) NOT NULL",
    "ALTER TABLE buy_orders MODIFY COLUMN customer VARCHAR(150) NOT NULL",
    "ALTER TABLE buy_orders MODIFY COLUMN items LONGTEXT NOT NULL",
    "ALTER TABLE buy_orders MODIFY COLUMN amount BIGINT NOT NULL",
    "ALTER TABLE buy_orders MODIFY COLUMN status VARCHAR(50) NOT NULL",
  ];

  for (const sql of migrations) {
    try {
      await queryAsync(sql);
    } catch (err) {
      console.log("Buy order schema migration warning:", err.sqlMessage || err.message);
    }
  }
};

const ensureAllOrderSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS all_order (
        id INT NOT NULL AUTO_INCREMENT,
        order_id VARCHAR(100) NOT NULL,
        customer VARCHAR(150) NOT NULL,
        customer_email VARCHAR(191) NULL,
        city VARCHAR(100) NULL,
        address TEXT NULL,
        type VARCHAR(20) NOT NULL,
        items LONGTEXT NOT NULL,
        total BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        date DATE NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_all_order_order_id (order_id),
        KEY ix_all_order_customer_email (customer_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("All order schema migration warning:", err.sqlMessage || err.message);
  }

  const migrations = [
    "ALTER TABLE all_order MODIFY COLUMN order_id VARCHAR(100) NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN customer VARCHAR(150) NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN type VARCHAR(20) NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN items LONGTEXT NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN total BIGINT NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN status VARCHAR(50) NOT NULL",
    "ALTER TABLE all_order MODIFY COLUMN date DATE NOT NULL",
  ];

  for (const sql of migrations) {
    try {
      await queryAsync(sql);
    } catch (err) {
      console.log("All order schema migration warning:", err.sqlMessage || err.message);
    }
  }
};

const ensureOrderTablesSchema = async () => {
  await ensureAllOrderSchema();
  await ensureBuyOrderSchema();
  await ensureRentalOrderSchema();
};

const ensureCustomerOrderIdentitySchema = async () => {
  const ensureColumn = async ({ table, column, ddl }) => {
    const columnRows = await queryAsync(
      `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [table]
    );
    const existing = new Set(columnRows.map((row) => String(row.COLUMN_NAME || "").toLowerCase()));
    if (!existing.has(String(column).toLowerCase())) {
      await queryAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  try {
    await ensureColumn({ table: "all_order", column: "customer_email", ddl: "customer_email VARCHAR(191) NULL" });
    await ensureColumn({ table: "all_order", column: "city", ddl: "city VARCHAR(100) NULL" });
    await ensureColumn({ table: "all_order", column: "address", ddl: "address TEXT NULL" });
    await ensureColumn({ table: "buy_orders", column: "customer_email", ddl: "customer_email VARCHAR(191) NULL" });
    await ensureColumn({ table: "rental_orders", column: "customer_email", ddl: "customer_email VARCHAR(191) NULL" });

    await ensureColumn({ table: "rental_orders", column: "rental_id", ddl: "rental_id VARCHAR(100) NULL" });
    await ensureColumn({ table: "rental_orders", column: "pickup_date", ddl: "pickup_date DATE NULL" });
    await ensureColumn({ table: "rental_orders", column: "return_date", ddl: "return_date DATE NULL" });
    await ensureColumn({ table: "rental_orders", column: "daily_rate", ddl: "daily_rate BIGINT NULL" });
    await ensureColumn({ table: "rental_orders", column: "total_days", ddl: "total_days INT NULL" });
    await ensureColumn({ table: "rental_orders", column: "deposit", ddl: "deposit BIGINT NULL" });
  } catch (err) {
    console.log("Customer order identity schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureUserNotificationsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS user_notification_prefs (
        id INT NOT NULL AUTO_INCREMENT,
        identity_key VARCHAR(255) NOT NULL,
        customer_email VARCHAR(191) NULL,
        clerk_id VARCHAR(191) NULL,
        order_confirmation TINYINT(1) NOT NULL DEFAULT 1,
        rental_activated TINYINT(1) NOT NULL DEFAULT 1,
        rental_return_reminder TINYINT(1) NOT NULL DEFAULT 1,
        new_arrivals_city TINYINT(1) NOT NULL DEFAULT 0,
        promotions_offers TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_user_notification_prefs_identity_key (identity_key),
        KEY ix_user_notification_prefs_email (customer_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id INT NOT NULL AUTO_INCREMENT,
        identity_key VARCHAR(255) NOT NULL,
        customer_email VARCHAR(191) NULL,
        clerk_id VARCHAR(191) NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(191) NOT NULL,
        body TEXT NULL,
        meta LONGTEXT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY ix_user_notifications_identity_created (identity_key, created_at),
        KEY ix_user_notifications_identity_read (identity_key, is_read, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("User notifications schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureUserAddressesSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id BIGINT NOT NULL AUTO_INCREMENT,
        identity_key VARCHAR(255) NOT NULL,
        customer_email VARCHAR(191) NULL,
        clerk_id VARCHAR(191) NULL,
        line1 VARCHAR(255) NOT NULL,
        line2 VARCHAR(255) NOT NULL,
        address_hash CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_user_addresses_identity_hash (identity_key, address_hash),
        KEY ix_user_addresses_email (customer_email),
        KEY ix_user_addresses_clerk (clerk_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("User addresses schema migration warning:", err.sqlMessage || err.message);
  }
};

const resolveIdentityKeyFromPayload = async ({ email, clerkId }) => {
  const resolvedEmail = await resolveUserEmailFromIdentity({ email, clerkId });
  const safeClerkId = String(clerkId || "").trim();
  if (!resolvedEmail) return { identityKey: "", email: "", clerkId: safeClerkId };
  return { identityKey: `email:${resolvedEmail}`, email: resolvedEmail, clerkId: safeClerkId };
};

const resolveIdentityKeyFromRequest = async (req) =>
  resolveIdentityKeyFromPayload({ email: req.query?.email, clerkId: req.query?.clerkId });

const getDefaultUserNotificationPrefs = () => ({
  orderConfirmation: true,
  rentalActivated: true,
  rentalReturnReminder: true,
  newArrivalsCity: false,
  promotionsOffers: false,
});

const readUserNotificationPrefsDb = async ({ identityKey }) => {
  if (!identityKey) return getDefaultUserNotificationPrefs();
  try {
    const rows = await queryAsync(
      `
      SELECT order_confirmation, rental_activated, rental_return_reminder, new_arrivals_city, promotions_offers
      FROM user_notification_prefs
      WHERE identity_key = ?
      LIMIT 1
      `,
      [identityKey]
    );
    if (!rows.length) return getDefaultUserNotificationPrefs();
    const row = rows[0] || {};
    return {
      orderConfirmation: Boolean(row.order_confirmation),
      rentalActivated: Boolean(row.rental_activated),
      rentalReturnReminder: Boolean(row.rental_return_reminder),
      newArrivalsCity: Boolean(row.new_arrivals_city),
      promotionsOffers: Boolean(row.promotions_offers),
    };
  } catch (err) {
    console.log("User notification prefs read error:", err.sqlMessage || err.message);
    return getDefaultUserNotificationPrefs();
  }
};

const upsertUserNotificationPrefsDb = async ({ identityKey, email, clerkId, prefs }) => {
  if (!identityKey) return getDefaultUserNotificationPrefs();
  const next = {
    orderConfirmation: prefs?.orderConfirmation !== false,
    rentalActivated: prefs?.rentalActivated !== false,
    rentalReturnReminder: prefs?.rentalReturnReminder !== false,
    newArrivalsCity: Boolean(prefs?.newArrivalsCity),
    promotionsOffers: Boolean(prefs?.promotionsOffers),
  };

  const now = new Date();
  try {
    await queryAsync(
      `
      INSERT INTO user_notification_prefs
        (identity_key, customer_email, clerk_id, order_confirmation, rental_activated, rental_return_reminder, new_arrivals_city, promotions_offers, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        customer_email = VALUES(customer_email),
        clerk_id = VALUES(clerk_id),
        order_confirmation = VALUES(order_confirmation),
        rental_activated = VALUES(rental_activated),
        rental_return_reminder = VALUES(rental_return_reminder),
        new_arrivals_city = VALUES(new_arrivals_city),
        promotions_offers = VALUES(promotions_offers),
        updated_at = VALUES(updated_at)
      `,
      [
        identityKey,
        email || null,
        clerkId || null,
        next.orderConfirmation ? 1 : 0,
        next.rentalActivated ? 1 : 0,
        next.rentalReturnReminder ? 1 : 0,
        next.newArrivalsCity ? 1 : 0,
        next.promotionsOffers ? 1 : 0,
        now,
        now,
      ]
    );
  } catch (err) {
    console.log("User notification prefs upsert error:", err.sqlMessage || err.message);
  }

  return next;
};

const createUserNotification = async ({ identityKey, email, clerkId, type, title, body, meta }) => {
  if (!identityKey) return;
  const now = new Date();
  try {
    await queryAsync(
      `
      INSERT INTO user_notifications (identity_key, customer_email, clerk_id, type, title, body, meta, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `,
      [
        identityKey,
        email || null,
        clerkId || null,
        String(type || "generic"),
        String(title || "Notification"),
        body || null,
        meta ? JSON.stringify(meta) : null,
        now,
      ]
    );
  } catch (err) {
    console.log("User notification insert error:", err.sqlMessage || err.message);
  }
};

const ensureAdminSettingsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INT NOT NULL AUTO_INCREMENT,
        setting_key VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_settings_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Admin settings schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureOwnerNotificationsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_notification_prefs (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        new_order TINYINT(1) NOT NULL DEFAULT 1,
        return_requested TINYINT(1) NOT NULL DEFAULT 1,
        return_due_tomorrow TINYINT(1) NOT NULL DEFAULT 1,
        payout_processed TINYINT(1) NOT NULL DEFAULT 1,
        monthly_earnings TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_notification_prefs_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_notifications (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        dedupe_key VARCHAR(191) NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(191) NOT NULL,
        body TEXT NULL,
        meta LONGTEXT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_notifications_dedupe (owner_email, dedupe_key),
        KEY ix_owner_notifications_owner_created (owner_email, created_at),
        KEY ix_owner_notifications_owner_read (owner_email, is_read, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Backfill schema upgrades for existing installations (add dedupe_key + unique index).
    try {
      const columnRows = await queryAsync(
        `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owner_notifications'
        `
      );
      const existing = new Set(columnRows.map((row) => String(row.COLUMN_NAME || "").toLowerCase()));
      if (!existing.has("dedupe_key")) {
        await queryAsync("ALTER TABLE owner_notifications ADD COLUMN dedupe_key VARCHAR(191) NULL");
      }
    } catch (err) {
      console.log("Owner notifications schema migration warning:", err.sqlMessage || err.message);
    }

    try {
      const idxRows = await queryAsync(
        `
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owner_notifications'
          AND INDEX_NAME = 'uq_owner_notifications_dedupe'
        LIMIT 1
        `
      );
      if (!idxRows.length) {
        await queryAsync(
          "ALTER TABLE owner_notifications ADD UNIQUE KEY uq_owner_notifications_dedupe (owner_email, dedupe_key)"
        );
      }
    } catch (err) {
      // If duplicates already exist in table, unique index creation can fail.
      // In that case, we still dedupe at read-time and in app-level logic.
      console.log("Owner notifications index migration warning:", err.sqlMessage || err.message);
    }
  } catch (err) {
    console.log("Owner notifications schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureAdminNotificationsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT NOT NULL AUTO_INCREMENT,
        dedupe_key VARCHAR(191) NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(191) NOT NULL,
        body TEXT NULL,
        meta LONGTEXT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_notifications_dedupe (dedupe_key),
        KEY ix_admin_notifications_created (created_at),
        KEY ix_admin_notifications_read (is_read, created_at),
        KEY ix_admin_notifications_type_read (type, is_read, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      const columnRows = await queryAsync(
        `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'admin_notifications'
        `
      );
      const existing = new Set(columnRows.map((row) => String(row.COLUMN_NAME || "").toLowerCase()));
      if (!existing.has("dedupe_key")) {
        await queryAsync("ALTER TABLE admin_notifications ADD COLUMN dedupe_key VARCHAR(191) NULL");
      }
    } catch (err) {
      console.log("Admin notifications schema migration warning:", err.sqlMessage || err.message);
    }

    try {
      const idxRows = await queryAsync(
        `
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'admin_notifications'
          AND INDEX_NAME = 'uq_admin_notifications_dedupe'
        LIMIT 1
        `
      );
      if (!idxRows.length) {
        await queryAsync("ALTER TABLE admin_notifications ADD UNIQUE KEY uq_admin_notifications_dedupe (dedupe_key)");
      }
    } catch (err) {
      console.log("Admin notifications index migration warning:", err.sqlMessage || err.message);
    }
  } catch (err) {
    console.log("Admin notifications schema migration warning:", err.sqlMessage || err.message);
  }
};

const buildAdminNotificationDedupeKey = ({ type, title, meta }) => {
  const safeType = String(type || "generic").trim().toLowerCase() || "generic";
  const safeTitle = String(title || "").trim().toLowerCase();
  const ref =
    String(meta?.orderId || meta?.order_id || meta?.email || meta?.clerkId || meta?.id || "").trim().toLowerCase();
  const pieces = [safeType, ref || safeTitle].filter(Boolean);
  return pieces.join(":").slice(0, 180);
};

const createAdminNotification = async ({ type, title, body, meta }) => {
  try {
    const now = new Date();
    const dedupeKey = buildAdminNotificationDedupeKey({ type, title, meta }) || null;
    await queryAsync(
      `
      INSERT IGNORE INTO admin_notifications (dedupe_key, type, title, body, meta, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
      `,
      [
        dedupeKey,
        String(type || "generic"),
        String(title || "Notification"),
        body || null,
        meta ? JSON.stringify(meta) : null,
        now,
      ]
    );
  } catch (err) {
    console.log("Admin notification insert error:", err.sqlMessage || err.message);
  }
};

const getDefaultOwnerNotificationPrefs = () => ({
  newOrder: true,
  returnRequested: true,
  returnDueTomorrow: true,
  payoutProcessed: true,
  monthlyEarnings: false,
});

const readOwnerNotificationPrefsDb = async (ownerEmail) => {
  const email = normalizeEmail(ownerEmail);
  if (!email) return getDefaultOwnerNotificationPrefs();

  try {
    const rows = await queryAsync(
      `
      SELECT new_order, return_requested, return_due_tomorrow, payout_processed, monthly_earnings
      FROM owner_notification_prefs
      WHERE owner_email = ?
      LIMIT 1
      `,
      [email]
    );
    if (!rows.length) return getDefaultOwnerNotificationPrefs();
    const row = rows[0] || {};
    return {
      newOrder: Boolean(row.new_order),
      returnRequested: Boolean(row.return_requested),
      returnDueTomorrow: Boolean(row.return_due_tomorrow),
      payoutProcessed: Boolean(row.payout_processed),
      monthlyEarnings: Boolean(row.monthly_earnings),
    };
  } catch (err) {
    console.log("Owner notification prefs read error:", err.sqlMessage || err.message);
    return getDefaultOwnerNotificationPrefs();
  }
};

const upsertOwnerNotificationPrefsDb = async (ownerEmail, prefs) => {
  const email = normalizeEmail(ownerEmail);
  if (!email) return getDefaultOwnerNotificationPrefs();

  const next = {
    newOrder: prefs?.newOrder !== false,
    returnRequested: prefs?.returnRequested !== false,
    returnDueTomorrow: prefs?.returnDueTomorrow !== false,
    payoutProcessed: prefs?.payoutProcessed !== false,
    monthlyEarnings: Boolean(prefs?.monthlyEarnings),
  };

  const now = new Date();
  try {
    await queryAsync(
      `
      INSERT INTO owner_notification_prefs
        (owner_email, new_order, return_requested, return_due_tomorrow, payout_processed, monthly_earnings, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        new_order = VALUES(new_order),
        return_requested = VALUES(return_requested),
        return_due_tomorrow = VALUES(return_due_tomorrow),
        payout_processed = VALUES(payout_processed),
        monthly_earnings = VALUES(monthly_earnings),
        updated_at = VALUES(updated_at)
      `,
      [
        email,
        next.newOrder ? 1 : 0,
        next.returnRequested ? 1 : 0,
        next.returnDueTomorrow ? 1 : 0,
        next.payoutProcessed ? 1 : 0,
        next.monthlyEarnings ? 1 : 0,
        now,
        now,
      ]
    );
  } catch (err) {
    console.log("Owner notification prefs upsert error:", err.sqlMessage || err.message);
  }

  return next;
};

const buildOwnerNotificationDedupeKey = ({ type, title, meta }) => {
  const safeType = String(type || "generic").trim().toLowerCase() || "generic";
  const safeTitle = String(title || "notification").trim().toLowerCase() || "notification";
  const orderId = String(meta?.orderId || meta?.order_id || "").trim();
  const requestId = String(meta?.requestId || meta?.request_id || "").trim();
  const rentalId = String(meta?.rentalId || meta?.rental_id || "").trim();
  const productName = String(meta?.productName || meta?.product || "").trim().toLowerCase();
  const customer = String(meta?.customer || meta?.customerName || "").trim().toLowerCase();
  const stableId = orderId || requestId || rentalId;
  if (stableId) return `${safeType}:${stableId}`;
  // Fallback: dedupe on semantic content (best-effort).
  return `${safeType}:${safeTitle}:${productName}:${customer}`;
};

const createOwnerNotification = async ({ ownerEmail, type, title, body, meta }) => {
  const email = normalizeEmail(ownerEmail);
  if (!email) return;
  const now = new Date();
  const dedupeKey = buildOwnerNotificationDedupeKey({ type, title, meta });
  try {
    await queryAsync(
      `
      INSERT IGNORE INTO owner_notifications (owner_email, dedupe_key, type, title, body, meta, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `,
      [
        email,
        dedupeKey || null,
        String(type || "generic"),
        String(title || "Notification"),
        body || null,
        meta ? JSON.stringify(meta) : null,
        now,
      ]
    );
  } catch (err) {
    console.log("Owner notification insert error:", err.sqlMessage || err.message);
  }
};

const getOwnerEmailsForItems = async (itemsPayload) => {
  const productIds = extractProductIdsFromRentalItems(itemsPayload);
  if (!productIds.length) return [];
  try {
    const rows = await queryAsync(
      "SELECT DISTINCT owner_email FROM products WHERE id IN (?) AND owner_email IS NOT NULL AND owner_email <> ''",
      [productIds]
    );
    return rows.map((r) => normalizeEmail(r.owner_email)).filter(Boolean);
  } catch (err) {
    console.log("Owner email lookup error:", err.sqlMessage || err.message);
    return [];
  }
};

app.get("/api/owner/notification-prefs", async (req, res) => {
  try {
    const ownerEmail = normalizeEmail(req.query?.ownerEmail || req.query?.email);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    const prefs = await readOwnerNotificationPrefsDb(ownerEmail);
    return res.json({ ownerEmail, prefs });
  } catch (err) {
    console.log("Owner notification prefs fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner notification preferences" });
  }
});

app.put("/api/owner/notification-prefs", async (req, res) => {
  try {
    const ownerEmail = normalizeEmail(req.body?.ownerEmail || req.body?.email || req.query?.ownerEmail || req.query?.email);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    const prefs = await upsertOwnerNotificationPrefsDb(ownerEmail, req.body?.prefs ?? req.body);
    return res.json({ ownerEmail, prefs });
  } catch (err) {
    console.log("Owner notification prefs update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update owner notification preferences" });
  }
});

app.get("/api/owner/notifications", async (req, res) => {
  try {
    const ownerEmail = normalizeEmail(req.query?.ownerEmail || req.query?.email);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const limitRaw = Number(req.query?.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;

    const rows = await queryAsync(
      `
      SELECT id, dedupe_key, type, title, body, meta, is_read, created_at
      FROM owner_notifications
      WHERE owner_email = ?
      ORDER BY id DESC
      LIMIT ${limit}
      `,
      [ownerEmail]
    );

    const countRows = await queryAsync(
      "SELECT COUNT(*) AS unread FROM owner_notifications WHERE owner_email = ? AND is_read = 0",
      [ownerEmail]
    );
    const unreadCount = Number(countRows?.[0]?.unread || 0) || 0;

    const seen = new Set();
    const notifications = (Array.isArray(rows) ? rows : [])
      .map((row) => {
      let metaObj = null;
      try {
        metaObj = row.meta ? JSON.parse(String(row.meta)) : null;
      } catch {
        metaObj = null;
      }

      return {
        id: Number(row.id),
        dedupeKey: String(row.dedupe_key || ""),
        type: String(row.type || "generic"),
        title: String(row.title || "Notification"),
        body: row.body == null ? "" : String(row.body),
        meta: metaObj,
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
      };
    })
      .filter((n) => {
        const computedKey =
          String(n.dedupeKey || "").trim() ||
          buildOwnerNotificationDedupeKey({ type: n.type, title: n.title, meta: n.meta });
        if (!computedKey) return true;
        if (seen.has(computedKey)) return false;
        seen.add(computedKey);
        return true;
      });

    return res.json({ ownerEmail, unreadCount, notifications });
  } catch (err) {
    console.log("Owner notifications fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner notifications" });
  }
});

app.post("/api/owner/notifications/mark-read", async (req, res) => {
  try {
    const ownerEmail = normalizeEmail(req.body?.ownerEmail || req.body?.email || req.query?.ownerEmail || req.query?.email);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length) {
      const numeric = ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 200);
      if (numeric.length) {
        await queryAsync(
          `UPDATE owner_notifications SET is_read = 1 WHERE owner_email = ? AND id IN (${numeric.map(() => "?").join(",")})`,
          [ownerEmail, ...numeric]
        );
      }
    } else {
      await queryAsync("UPDATE owner_notifications SET is_read = 1 WHERE owner_email = ?", [ownerEmail]);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.log("Owner notifications mark-read error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update owner notifications" });
  }
});

app.get("/api/admin/notifications/unread-counts", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT type, COUNT(*) AS unread
      FROM admin_notifications
      WHERE is_read = 0
      GROUP BY type
      `
    );

    const counts = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const type = String(row?.type || "").trim();
      if (!type) continue;
      counts[type] = Number(row?.unread || 0) || 0;
    }

    return res.json({ counts });
  } catch (err) {
    console.log("Admin notifications unread-counts error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch admin notification counts" });
  }
});

app.post("/api/admin/notifications/mark-read", async (req, res) => {
  try {
    const types = Array.isArray(req.body?.types) ? req.body.types : [];
    const normalized = types
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .slice(0, 25);

    if (normalized.length) {
      await queryAsync(
        `UPDATE admin_notifications SET is_read = 1 WHERE type IN (${normalized.map(() => "?").join(",")})`,
        normalized
      );
      return res.json({ ok: true, types: normalized });
    }

    await queryAsync("UPDATE admin_notifications SET is_read = 1");
    return res.json({ ok: true });
  } catch (err) {
    console.log("Admin notifications mark-read error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update admin notifications" });
  }
});

const clampNumber = (value, { min, max, fallback }) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
};

const getDefaultAdminPlatformConfig = () => ({
  platformName: "Urban Ethnic",
  supportEmail: "support@urbanethnic.in",
  commissionRatePct: 10,
  maxImagesPerProduct: 5,
});

const getDefaultAdminFeatureToggles = () => ({
  ownerSelfRegistration: true,
  rentalFeature: true,
  cityBasedFiltering: true,
  emailNotifications: false,
  maintenanceMode: false,
});

const sanitizeAdminPlatformConfig = (next) => {
  const defaults = getDefaultAdminPlatformConfig();
  return {
    platformName: String(next?.platformName ?? defaults.platformName).trim() || defaults.platformName,
    supportEmail: String(next?.supportEmail ?? defaults.supportEmail).trim() || defaults.supportEmail,
    commissionRatePct: clampNumber(next?.commissionRatePct, { min: 0, max: 100, fallback: defaults.commissionRatePct }),
    maxImagesPerProduct: clampNumber(next?.maxImagesPerProduct, { min: 1, max: 20, fallback: defaults.maxImagesPerProduct }),
  };
};

const sanitizeAdminFeatureToggles = (next) => {
  const defaults = getDefaultAdminFeatureToggles();
  return {
    ownerSelfRegistration: Boolean(next?.ownerSelfRegistration ?? defaults.ownerSelfRegistration),
    rentalFeature: Boolean(next?.rentalFeature ?? defaults.rentalFeature),
    cityBasedFiltering: Boolean(next?.cityBasedFiltering ?? defaults.cityBasedFiltering),
    emailNotifications: Boolean(next?.emailNotifications ?? defaults.emailNotifications),
    maintenanceMode: Boolean(next?.maintenanceMode ?? defaults.maintenanceMode),
  };
};

const readAdminSettingJson = async (settingKey) => {
  try {
    const rows = await queryAsync(
      "SELECT payload, updated_at FROM admin_settings WHERE setting_key = ? LIMIT 1",
      [String(settingKey || "").trim()]
    );
    if (!rows.length) return null;
    const raw = rows[0] || {};
    const text = String(raw.payload || "");
    const parsed = JSON.parse(text || "null");
    return { value: parsed, updatedAt: raw.updated_at };
  } catch (err) {
    console.log("Admin settings read error:", err.sqlMessage || err.message);
    return null;
  }
};

const upsertAdminSettingJson = async (settingKey, value) => {
  const now = new Date();
  try {
    await queryAsync(
      `
      INSERT INTO admin_settings (setting_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)
      `,
      [String(settingKey || "").trim(), JSON.stringify(value ?? null), now]
    );
  } catch (err) {
    console.log("Admin settings upsert error:", err.sqlMessage || err.message);
  }
  return now;
};

app.get("/api/admin/settings", async (_req, res) => {
  try {
    const platformRow = await readAdminSettingJson("platform_config");
    const togglesRow = await readAdminSettingJson("feature_toggles");

    const platformConfig = sanitizeAdminPlatformConfig(platformRow?.value);
    const featureToggles = sanitizeAdminFeatureToggles(togglesRow?.value);

    return res.json({
      platformConfig,
      featureToggles,
      updatedAt: togglesRow?.updatedAt || platformRow?.updatedAt || null,
    });
  } catch (err) {
    console.log("Admin settings fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch admin settings" });
  }
});

app.put("/api/admin/settings", async (req, res) => {
  try {
    const incomingPlatform =
      req.body?.platformConfig ?? req.body?.platform_config ?? req.body?.platform ?? {};
    const incomingToggles =
      req.body?.featureToggles ?? req.body?.feature_toggles ?? req.body?.features ?? {};

    const existingPlatformRow = await readAdminSettingJson("platform_config");
    const existingTogglesRow = await readAdminSettingJson("feature_toggles");

    const platformConfig = sanitizeAdminPlatformConfig({ ...(existingPlatformRow?.value || {}), ...(incomingPlatform || {}) });
    const featureToggles = sanitizeAdminFeatureToggles({ ...(existingTogglesRow?.value || {}), ...(incomingToggles || {}) });

    await upsertAdminSettingJson("platform_config", platformConfig);
    const updatedAt = await upsertAdminSettingJson("feature_toggles", featureToggles);

    return res.json({ platformConfig, featureToggles, updatedAt });
  } catch (err) {
    console.log("Admin settings update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update admin settings" });
  }
});

const ensureClerkUsersSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS clerk_users (
        id INT NOT NULL AUTO_INCREMENT,
        clerk_id VARCHAR(191) NULL,
        email VARCHAR(191) NOT NULL,
        name VARCHAR(191) NOT NULL,
        phone VARCHAR(20) NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        city VARCHAR(100) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_clerk_users_email (email),
        UNIQUE KEY uq_clerk_users_clerk_id (clerk_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Clerk users schema migration warning:", err.sqlMessage || err.message);
  }

  try {
    const columnRows = await queryAsync(
      `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clerk_users'
      `
    );
    const existingColumns = new Set(columnRows.map((row) => String(row.COLUMN_NAME || "").toLowerCase()));
    if (!existingColumns.has("city")) {
      await queryAsync("ALTER TABLE clerk_users ADD COLUMN city VARCHAR(100) NULL");
    }
    if (!existingColumns.has("phone")) {
      await queryAsync("ALTER TABLE clerk_users ADD COLUMN phone VARCHAR(20) NULL");
    }
    if (!existingColumns.has("status")) {
      await queryAsync("ALTER TABLE clerk_users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active'");
    }
    if (!existingColumns.has("approval_status")) {
      await queryAsync("ALTER TABLE clerk_users ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'approved'");
    }
  } catch (err) {
    console.log("Clerk users schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureDeletedAccountsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS deleted_accounts (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(191) NOT NULL,
        role VARCHAR(20) NULL,
        deleted_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_deleted_accounts_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Deleted accounts schema migration warning:", err.sqlMessage || err.message);
  }
};

const isDeletedAccount = async ({ email }) => {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return false;
  try {
    const rows = await queryAsync("SELECT id FROM deleted_accounts WHERE email = ? LIMIT 1", [safeEmail]);
    return rows.length > 0;
  } catch {
    return false;
  }
};

const upsertDeletedAccount = async ({ email, role }) => {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail) return;

  const safeRole = String(role || "").trim().toLowerCase();
  const normalizedRole = safeRole === "owner" ? "owner" : safeRole === "user" ? "user" : safeRole || null;
  const now = new Date();

  try {
    const existing = await queryAsync("SELECT id FROM deleted_accounts WHERE email = ? LIMIT 1", [safeEmail]);
    if (existing.length > 0) {
      await queryAsync("UPDATE deleted_accounts SET role = ?, deleted_at = ? WHERE id = ?", [
        normalizedRole,
        now,
        existing[0].id,
      ]);
      return;
    }
    await queryAsync("INSERT INTO deleted_accounts (email, role, deleted_at) VALUES (?, ?, ?)", [
      safeEmail,
      normalizedRole,
      now,
    ]);
  } catch {
    // ignore
  }
};

const ensureReturnRequestsSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS rental_return_requests (
        id INT NOT NULL AUTO_INCREMENT,
        request_id VARCHAR(64) NOT NULL,
        order_id VARCHAR(100) NULL,
        rental_id VARCHAR(100) NULL,
        customer VARCHAR(150) NOT NULL,
        customer_email VARCHAR(191) NULL,
        product_name VARCHAR(255) NOT NULL,
        rental_end_date DATE NULL,
        return_reason VARCHAR(255) NOT NULL,
        condition_reported VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        stage VARCHAR(50) NOT NULL DEFAULT 'Request Sent',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_rental_return_requests_request_id (request_id),
        KEY ix_rental_return_requests_order_id (order_id),
        KEY ix_rental_return_requests_rental_id (rental_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Return requests schema migration warning:", err.sqlMessage || err.message);
  }
};

app.post("/api/users/clerk-sync", async (req, res) => {
  try {
    const clerkId = String(req.body?.clerkId || "").trim() || null;
    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || "").trim() || email;
    const role = String(req.body?.role || "user").trim().toLowerCase();
    const safeRole = role === "owner" ? "owner" : "user";
    const city = String(req.body?.city || "").trim();
    const safeCity = city ? city : null;
    const safePhone = normalizePhoneForClerkUsers(req.body?.phone);
    const mode = String(req.body?.mode || "").trim().toLowerCase() || "login";
    const desiredApproval = safeRole === "owner" ? "pending" : "approved";

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (mode !== "register") {
      const deleted = await isDeletedAccount({ email });
      if (deleted) {
        return res.status(410).json({ message: "Account does not exist. Please register." });
      }
    }

    const now = new Date();

    let existing = [];
    if (clerkId) {
      existing = await queryAsync("SELECT id, role, approval_status FROM clerk_users WHERE clerk_id = ? LIMIT 1", [clerkId]);
    }
    if (existing.length === 0) {
      existing = await queryAsync("SELECT id, role, approval_status FROM clerk_users WHERE email = ? LIMIT 1", [email]);
    }

    if (existing.length > 0) {
      const id = existing[0].id;
      const currentRole = String(existing[0].role || "user").trim().toLowerCase();
      const currentApproval = String(existing[0].approval_status || "").trim().toLowerCase();

      // Only brand-new owner registrations should create a pending approval request.
      // Existing accounts should keep their current approval status; if missing, default to approved.
      const nextApproval = currentApproval || (mode === "register" && currentRole !== "owner" && safeRole === "owner" ? "pending" : "approved");

      await queryAsync(
        "UPDATE clerk_users SET clerk_id = ?, email = ?, name = ?, phone = ?, role = ?, city = ?, status = ?, approval_status = ?, updated_at = ? WHERE id = ?",
        [clerkId, email, name, safePhone, safeRole, safeCity, "Active", nextApproval, now, id]
      );
      return res.json({
        message: "User synced",
        user: { id, clerkId, email, name, role: safeRole, city: safeCity, phone: safePhone, approvalStatus: nextApproval },
      });
    }

    if (mode !== "register") {
      return res.status(404).json({ message: "Account does not exist. Please register." });
    }

    try {
      await queryAsync("DELETE FROM deleted_accounts WHERE email = ?", [email]);
    } catch {
      // ignore
    }

    const insert = await queryAsync(
      "INSERT INTO clerk_users (clerk_id, email, name, phone, role, city, approval_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [clerkId, email, name, safePhone, safeRole, safeCity, desiredApproval, now, now]
    );

    if (safeRole === "user") {
      await createAdminNotification({
        type: "new_user",
        title: "New user registered",
        body: `${name} (${email}) joined the platform.`,
        meta: { email, name, city: safeCity, clerkId, role: safeRole },
      });
    }

    return res.json({
      message: "User created",
      user: { id: insert.insertId, clerkId, email, name, role: safeRole, city: safeCity, phone: safePhone, approvalStatus: desiredApproval },
    });
  } catch (err) {
    console.log("Clerk user sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync user" });
  }
});

app.post("/api/users/clerk-delete", async (req, res) => {
  try {
    const clerkId = String(req.body?.clerkId || "").trim();
    const email = normalizeEmail(req.body?.email);

    if (!clerkId && !email) {
      return res.status(400).json({ message: "clerkId or email is required" });
    }

    const resolvedEmail = await resolveUserEmailFromIdentity({ email, clerkId });
    if (resolvedEmail) {
      try {
        const rows = await queryAsync("SELECT role FROM clerk_users WHERE email = ? LIMIT 1", [resolvedEmail]);
        await upsertDeletedAccount({ email: resolvedEmail, role: rows?.[0]?.role });
      } catch {
        await upsertDeletedAccount({ email: resolvedEmail, role: null });
      }
    }

    if (clerkId) {
      await queryAsync("DELETE FROM clerk_users WHERE clerk_id = ?", [clerkId]);
      try {
        await queryAsync("DELETE FROM user_notification_prefs WHERE clerk_id = ?", [clerkId]);
        await queryAsync("DELETE FROM user_notifications WHERE clerk_id = ?", [clerkId]);
      } catch {
        // ignore missing tables
      }
    }
    if (email) {
      await queryAsync("DELETE FROM clerk_users WHERE email = ?", [email]);
      try {
        const identityKey = `email:${email}`;
        await queryAsync("DELETE FROM user_notification_prefs WHERE identity_key = ? OR customer_email = ?", [identityKey, email]);
        await queryAsync("DELETE FROM user_notifications WHERE identity_key = ? OR customer_email = ?", [identityKey, email]);
      } catch {
        // ignore missing tables
      }

      try {
        await queryAsync("DELETE FROM owner_dashboard WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_all_product WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_all_order WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_rental_order WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_buy_order WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_add_product WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_notification_prefs WHERE owner_email = ?", [email]);
        await queryAsync("DELETE FROM owner_notifications WHERE owner_email = ?", [email]);
      } catch {
        // ignore missing tables
      }

      try {
        await queryAsync("DELETE FROM products WHERE LOWER(COALESCE(owner_email, '')) = ?", [email]);
      } catch {
        // ignore missing tables/columns
      }

      try {
        await queryAsync("DELETE FROM buy_orders WHERE customer_email = ?", [email]);
      } catch {
        // ignore missing tables
      }

      try {
        await queryAsync("DELETE FROM rental_orders WHERE customer_email = ?", [email]);
      } catch {
        // ignore missing tables
      }

      try {
        await queryAsync("DELETE FROM order_user WHERE LOWER(email) = ?", [email]);
      } catch {
        // ignore missing tables
      }
    }

    return res.json({ message: "User deleted" });
  } catch (err) {
    console.log("Clerk user delete error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to delete user" });
  }
});

app.post("/api/users/deactivate", async (req, res) => {
  try {
    const clerkId = String(req.body?.clerkId || "").trim();
    const email = normalizeEmail(req.body?.email);
    const action = String(req.body?.action || "deactivate").trim().toLowerCase();

    if (!clerkId && !email) {
      return res.status(400).json({ message: "clerkId or email is required" });
    }

    const nextStatus = action === "activate" ? "Active" : "Deactivated";
    const now = new Date();

    if (clerkId) {
      const result = await queryAsync("UPDATE clerk_users SET status = ?, updated_at = ? WHERE clerk_id = ?", [
        nextStatus,
        now,
        clerkId,
      ]);
      if (!result.affectedRows) return res.status(404).json({ message: "Account not found" });
      return res.json({ message: "Updated", status: nextStatus });
    }

    const result = await queryAsync("UPDATE clerk_users SET status = ?, updated_at = ? WHERE email = ?", [
      nextStatus,
      now,
      email,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: "Account not found" });
    return res.json({ message: "Updated", status: nextStatus });
  } catch (err) {
    console.log("Account deactivate error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update account" });
  }
});

const resolveUserEmailFromIdentity = async ({ email, clerkId }) => {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) return normalizedEmail;
  const safeClerkId = String(clerkId || "").trim();
  if (!safeClerkId) return "";

  const rows = await queryAsync("SELECT email FROM clerk_users WHERE clerk_id = ? LIMIT 1", [safeClerkId]);
  if (!rows.length) return "";
  return normalizeEmail(rows[0].email);
};

const parseItemsText = (raw) => {
  try {
    const maybe = JSON.parse(String(raw || "[]"));
    return Array.isArray(maybe) ? maybe : [];
  } catch {
    return [];
  }
};

app.get("/api/users/orders", async (req, res) => {
  try {
    const email = await resolveUserEmailFromIdentity({ email: req.query?.email, clerkId: req.query?.clerkId });
    if (!email) return res.status(400).json({ message: "email or clerkId is required" });

    const rows = await queryAsync(
      `
      SELECT id, order_id, customer, customer_email, type, items, total, status, date
      FROM all_order
      WHERE LOWER(TRIM(customer_email)) = ?
      ORDER BY id DESC
      `,
      [email]
    );

    const rentOrderIds = Array.from(
      new Set(
        rows
          .filter((row) => String(row?.type || "").trim().toLowerCase().includes("rent"))
          .map((row) => String(row?.order_id || "").trim())
          .filter(Boolean)
      )
    );

    const returnStageByOrderId = new Map();
    if (rentOrderIds.length) {
      try {
        const stageRows = await queryAsync(
          `
          SELECT order_id, stage, updated_at
          FROM rental_return_requests
          WHERE order_id IN (?)
          ORDER BY updated_at DESC, id DESC
          `,
          [rentOrderIds]
        );
        for (const row of stageRows) {
          const orderId = String(row?.order_id || "").trim();
          if (!orderId) continue;
          if (returnStageByOrderId.has(orderId)) continue;
          returnStageByOrderId.set(orderId, String(row?.stage || "").trim());
        }
      } catch (err) {
        console.log("User orders return-stage lookup warning:", err.sqlMessage || err.message);
      }
    }

    const orders = rows.map((row) => {
      const items = parseItemsText(row.items);
      const first = items[0] || {};
      const orderId = String(row.order_id || "");
      return {
        id: orderId,
        customer: String(row.customer || "Customer"),
        email: normalizeScopedEmail(row.customer_email) || email,
        type: String(row.type || "Buy"),
        items,
        amount: Number(row.total || 0),
        status: String(row.status || "Pending"),
        date: row.date,
        returnStage: returnStageByOrderId.get(orderId) || null,
        name: String(first?.name || "").trim() || undefined,
        image: String(first?.image || "").trim() || undefined,
      };
    });

    return res.json({ email, orders });
  } catch (err) {
    console.log("User orders fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.get("/api/users/orders/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || "").trim();
    const email = await resolveUserEmailFromIdentity({ email: req.query?.email, clerkId: req.query?.clerkId });
    if (!orderId) return res.status(400).json({ message: "orderId is required" });
    if (!email) return res.status(400).json({ message: "email or clerkId is required" });

    const rows = await queryAsync(
      `
      SELECT id, order_id, customer, customer_email, type, items, total, status, date
      FROM all_order
      WHERE order_id = ? AND LOWER(TRIM(customer_email)) = ?
      LIMIT 1
      `,
      [orderId, email]
    );
    if (!rows.length) return res.status(404).json({ message: "Order not found" });

    const row = rows[0];
    const items = parseItemsText(row.items);
    const first = items[0] || {};
    return res.json({
      order: {
        id: String(row.order_id || ""),
        customer: String(row.customer || "Customer"),
        email: normalizeScopedEmail(row.customer_email) || email,
        type: String(row.type || "Buy"),
        items,
        amount: Number(row.total || 0),
        status: String(row.status || "Pending"),
        date: row.date,
        name: String(first?.name || "").trim() || undefined,
        image: String(first?.image || "").trim() || undefined,
      },
    });
  } catch (err) {
    console.log("User order fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch order" });
  }
});

app.get("/api/users/notification-prefs", async (req, res) => {
  try {
    const { identityKey, email, clerkId } = await resolveIdentityKeyFromRequest(req);
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const prefs = await readUserNotificationPrefsDb({ identityKey });
    return res.json({ identityKey, email, clerkId, prefs });
  } catch (err) {
    console.log("User notification prefs fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch notification preferences" });
  }
});

app.put("/api/users/notification-prefs", async (req, res) => {
  try {
    const email = req.body?.email ?? req.query?.email;
    const clerkId = req.body?.clerkId ?? req.query?.clerkId;
    const { identityKey, email: resolvedEmail, clerkId: safeClerkId } = await resolveIdentityKeyFromPayload({ email, clerkId });
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const prefs = await upsertUserNotificationPrefsDb({
      identityKey,
      email: resolvedEmail,
      clerkId: safeClerkId,
      prefs: req.body?.prefs ?? req.body,
    });
    return res.json({ identityKey, email: resolvedEmail, clerkId: safeClerkId, prefs });
  } catch (err) {
    console.log("User notification prefs update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update notification preferences" });
  }
});

app.get("/api/users/notifications", async (req, res) => {
  try {
    const { identityKey, email, clerkId } = await resolveIdentityKeyFromRequest(req);
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const limitRaw = Number(req.query?.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;

    const rows = await queryAsync(
      `
      SELECT id, type, title, body, meta, is_read, created_at
      FROM user_notifications
      WHERE identity_key = ?
      ORDER BY id DESC
      LIMIT ${limit}
      `,
      [identityKey]
    );

    const countRows = await queryAsync(
      "SELECT COUNT(*) AS unread FROM user_notifications WHERE identity_key = ? AND is_read = 0",
      [identityKey]
    );
    const unreadCount = Number(countRows?.[0]?.unread || 0) || 0;

    const notifications = (Array.isArray(rows) ? rows : []).map((row) => {
      let metaObj = null;
      try {
        metaObj = row.meta ? JSON.parse(String(row.meta)) : null;
      } catch {
        metaObj = null;
      }

      return {
        id: Number(row.id),
        type: String(row.type || "generic"),
        title: String(row.title || "Notification"),
        body: row.body == null ? "" : String(row.body),
        meta: metaObj,
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
      };
    });

    return res.json({ identityKey, email, clerkId, unreadCount, notifications });
  } catch (err) {
    console.log("User notifications fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

app.post("/api/users/notifications/mark-read", async (req, res) => {
  try {
    const email = req.body?.email ?? req.query?.email;
    const clerkId = req.body?.clerkId ?? req.query?.clerkId;
    const { identityKey } = await resolveIdentityKeyFromPayload({ email, clerkId });
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length) {
      const numeric = ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 200);
      if (numeric.length) {
        await queryAsync(
          `UPDATE user_notifications SET is_read = 1 WHERE identity_key = ? AND id IN (${numeric.map(() => "?").join(",")})`,
          [identityKey, ...numeric]
        );
      }
    } else {
      await queryAsync("UPDATE user_notifications SET is_read = 1 WHERE identity_key = ?", [identityKey]);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.log("User notifications mark-read error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update notifications" });
  }
});

app.get("/api/users/rentals", async (req, res) => {
  try {
    const email = await resolveUserEmailFromIdentity({ email: req.query?.email, clerkId: req.query?.clerkId });
    if (!email) return res.status(400).json({ message: "email or clerkId is required" });

    const rows = await queryAsync(
      `
      SELECT id, rental_id, order_id, customer, customer_email, items, amount, status, date,
             pickup_date, return_date, daily_rate, total_days, deposit
      FROM rental_orders
      WHERE LOWER(TRIM(customer_email)) = ?
      ORDER BY id DESC
      `,
      [email]
    );

    const rentals = rows.map((row) => {
      const items = parseItemsText(row.items);
      const first = items[0] || {};
      return {
        id: String(row.rental_id || row.order_id || row.id || ""),
        orderId: String(row.order_id || ""),
        customer: String(row.customer || "Customer"),
        email: normalizeScopedEmail(row.customer_email) || email,
        name: String(first?.name || "").trim() || "Rental",
        image: String(first?.image || "").trim() || "",
        status: String(row.status || "Active"),
        pickupDate: row.pickup_date || row.date || null,
        returnDate: row.return_date || null,
        dailyRate: Number(row.daily_rate || 0),
        totalDays: row.total_days === null || row.total_days === undefined ? null : Number(row.total_days || 0),
        deposit: Number(row.deposit || 0),
        amount: Number(row.amount || 0),
        items,
      };
    });

    return res.json({ email, rentals });
  } catch (err) {
    console.log("User rentals fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch rentals" });
  }
});

const normalizeAddressLine = (value, maxLen) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const computeAddressHash = ({ line1, line2 }) =>
  crypto
    .createHash("sha256")
    .update(`${String(line1 || "").trim().toLowerCase()}|${String(line2 || "").trim().toLowerCase()}`)
    .digest("hex");

app.get("/api/users/addresses", async (req, res) => {
  try {
    const { identityKey } = await resolveIdentityKeyFromRequest(req);
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const rows = await queryAsync(
      `
      SELECT id, line1, line2, created_at, updated_at
      FROM user_addresses
      WHERE identity_key = ?
      ORDER BY created_at DESC
      `,
      [identityKey]
    );

    const addresses = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      line1: String(row.line1 || ""),
      line2: String(row.line2 || ""),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json({ addresses });
  } catch (err) {
    console.log("User addresses fetch error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to fetch saved addresses",
      ...(debug ? { error: err.sqlMessage || err.message, code: err.code } : {}),
    });
  }
});

app.post("/api/users/addresses", async (req, res) => {
  try {
    const email = req.body?.email ?? req.query?.email;
    const clerkId = req.body?.clerkId ?? req.body?.clerk_id ?? req.query?.clerkId;
    const onlyIfEmpty = Boolean(req.body?.onlyIfEmpty);

    const { identityKey, email: resolvedEmail, clerkId: safeClerkId } = await resolveIdentityKeyFromPayload({
      email,
      clerkId,
    });
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const line1 = normalizeAddressLine(req.body?.line1 ?? req.body?.street, 255);
    const line2 = normalizeAddressLine(req.body?.line2, 255);
    if (!line1 || !line2) return res.status(400).json({ message: "line1 and line2 are required" });

    if (onlyIfEmpty) {
      const existing = await queryAsync("SELECT id FROM user_addresses WHERE identity_key = ? LIMIT 1", [identityKey]);
      if (Array.isArray(existing) && existing.length > 0) {
        return res.json({ saved: false, skipped: true, reason: "already_has_addresses" });
      }
    }

    const now = new Date();
    const addressHash = computeAddressHash({ line1, line2 });

    await queryAsync(
      `
      INSERT IGNORE INTO user_addresses
        (identity_key, customer_email, clerk_id, line1, line2, address_hash, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [identityKey, resolvedEmail || null, safeClerkId || null, line1, line2, addressHash, now, now]
    );

    const rows = await queryAsync(
      `
      SELECT id, line1, line2, created_at, updated_at
      FROM user_addresses
      WHERE identity_key = ? AND address_hash = ?
      LIMIT 1
      `,
      [identityKey, addressHash]
    );

    const created = rows?.[0];
    if (!created) return res.status(500).json({ message: "Failed to save address" });
    return res.json({
      saved: true,
      address: {
        id: created.id,
        line1: String(created.line1 || ""),
        line2: String(created.line2 || ""),
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  } catch (err) {
    console.log("User address save error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to save address",
      ...(debug ? { error: err.sqlMessage || err.message, code: err.code } : {}),
    });
  }
});

app.put("/api/users/addresses/:id", async (req, res) => {
  try {
    const email = req.body?.email ?? req.query?.email;
    const clerkId = req.body?.clerkId ?? req.body?.clerk_id ?? req.query?.clerkId;
    const { identityKey, email: resolvedEmail, clerkId: safeClerkId } = await resolveIdentityKeyFromPayload({
      email,
      clerkId,
    });
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid address id" });

    const line1 = normalizeAddressLine(req.body?.line1 ?? req.body?.street, 255);
    const line2 = normalizeAddressLine(req.body?.line2, 255);
    if (!line1 || !line2) return res.status(400).json({ message: "line1 and line2 are required" });

    const addressHash = computeAddressHash({ line1, line2 });
    const now = new Date();

    await queryAsync(
      `
      UPDATE user_addresses
      SET customer_email = ?, clerk_id = ?, line1 = ?, line2 = ?, address_hash = ?, updated_at = ?
      WHERE id = ? AND identity_key = ?
      `,
      [resolvedEmail || null, safeClerkId || null, line1, line2, addressHash, now, id, identityKey]
    );

    const rows = await queryAsync(
      `
      SELECT id, line1, line2, created_at, updated_at
      FROM user_addresses
      WHERE id = ? AND identity_key = ?
      LIMIT 1
      `,
      [id, identityKey]
    );
    const updated = rows?.[0];
    if (!updated) return res.status(404).json({ message: "Address not found" });

    return res.json({
      address: {
        id: updated.id,
        line1: String(updated.line1 || ""),
        line2: String(updated.line2 || ""),
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    console.log("User address update error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to update address",
      ...(debug ? { error: err.sqlMessage || err.message, code: err.code } : {}),
    });
  }
});

app.delete("/api/users/addresses/:id", async (req, res) => {
  try {
    const { identityKey } = await resolveIdentityKeyFromRequest(req);
    if (!identityKey) return res.status(400).json({ message: "email or clerkId is required" });

    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid address id" });

    const result = await queryAsync("DELETE FROM user_addresses WHERE id = ? AND identity_key = ?", [id, identityKey]);
    const deleted = Boolean(result?.affectedRows);
    return res.json({ deleted });
  } catch (err) {
    console.log("User address delete error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to delete address",
      ...(debug ? { error: err.sqlMessage || err.message, code: err.code } : {}),
    });
  }
});

app.get("/api/users/access", async (req, res) => {
  try {
    const clerkId = String(req.query?.clerkId || "").trim();
    const email = normalizeEmail(req.query?.email);
    if (!clerkId && !email) {
      return res.status(400).json({ message: "email or clerkId is required" });
    }

    const rows = clerkId
      ? await queryAsync(
          "SELECT role, status, approval_status, email, clerk_id FROM clerk_users WHERE clerk_id = ? LIMIT 1",
          [clerkId]
        )
      : await queryAsync("SELECT role, status, approval_status, email, clerk_id FROM clerk_users WHERE email = ? LIMIT 1", [
          email,
        ]);

    if (!rows.length) {
      const resolvedEmail = email || (clerkId ? await resolveUserEmailFromIdentity({ clerkId }) : "");
      const deleted = resolvedEmail ? await isDeletedAccount({ email: resolvedEmail }) : false;
      return res.json({
        found: false,
        role: null,
        status: deleted ? "Deleted" : "NotFound",
        approvalStatus: "approved",
      });
    }

    const row = rows[0];
    const currentStatus = normalizeAccountStatus(row.status);
    let status = currentStatus;
    let reactivated = false;
    if (currentStatus === "Deactivated") {
      reactivated = true;
      status = "Active";
      try {
        await queryAsync("UPDATE clerk_users SET status = ?, updated_at = ? WHERE clerk_id = ? OR email = ?", [
          "Active",
          new Date(),
          row.clerk_id || "",
          normalizeEmail(row.email),
        ]);
      } catch {
        // ignore
      }
    }
    return res.json({
      found: true,
      role: String(row.role || "user").trim().toLowerCase(),
      status,
      approvalStatus: String(row.approval_status || "approved").trim().toLowerCase(),
      email: normalizeScopedEmail(row.email),
      clerkId: row.clerk_id || null,
      reactivated,
    });
  } catch (err) {
    console.log("Access check error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to check access" });
  }
});

const parseJsonPayload = (raw, fallback) => {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const ownerEmailFromParams = (req) => normalizeEmail(req.params?.ownerEmail);

const OWNER_TABLES = new Set([
  "owner_dashboard",
  "owner_all_product",
  "owner_all_order",
  "owner_buy_order",
  "owner_rental_order",
]);

const ensureOwnerDataSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_dashboard (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_dashboard_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_all_product (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_all_product_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_all_order (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_all_order_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_buy_order (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_buy_order_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_rental_order (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        payload LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_owner_rental_order_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS owner_add_product (
        id INT NOT NULL AUTO_INCREMENT,
        owner_email VARCHAR(191) NOT NULL,
        product_id VARCHAR(191) NULL,
        payload LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY ix_owner_add_product_owner_email (owner_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Owner data schema migration warning:", err.sqlMessage || err.message);
  }
};

const upsertOwnerPayload = async ({ table, ownerEmail, payload }) => {
  if (!OWNER_TABLES.has(table)) throw new Error("Invalid owner table");
  const safeEmail = normalizeEmail(ownerEmail);
  if (!safeEmail) throw new Error("ownerEmail is required");

  const now = new Date();
  const payloadText = JSON.stringify(payload ?? null);
  const existing = await queryAsync(`SELECT id FROM ${table} WHERE owner_email = ? LIMIT 1`, [safeEmail]);
  if (existing.length > 0) {
    await queryAsync(`UPDATE ${table} SET payload = ?, updated_at = ? WHERE id = ?`, [
      payloadText,
      now,
      existing[0].id,
    ]);
    return;
  }

  await queryAsync(`INSERT INTO ${table} (owner_email, payload, updated_at) VALUES (?, ?, ?)`, [
    safeEmail,
    payloadText,
    now,
  ]);
};

const readOwnerPayload = async ({ table, ownerEmail, fallback }) => {
  if (!OWNER_TABLES.has(table)) throw new Error("Invalid owner table");
  const safeEmail = normalizeEmail(ownerEmail);
  if (!safeEmail) return null;

  const rows = await queryAsync(`SELECT payload, updated_at FROM ${table} WHERE owner_email = ? LIMIT 1`, [safeEmail]);
  if (!rows.length) return null;

  return {
    payload: parseJsonPayload(rows[0].payload, fallback),
    updatedAt: rows[0].updated_at,
  };
};

app.get("/api/owner/:ownerEmail/dashboard", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const row = await readOwnerPayload({ table: "owner_dashboard", ownerEmail, fallback: {} });
    if (!row) return res.status(404).json({ message: "Owner dashboard not found" });

    return res.json({ ownerEmail, ...row });
  } catch (err) {
    console.log("Owner dashboard fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner dashboard" });
  }
});

app.post("/api/owner/:ownerEmail/dashboard/refresh", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);

    await upsertOwnerPayload({ table: "owner_dashboard", ownerEmail, payload: snapshot });
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: snapshot.products });
    await upsertOwnerPayload({ table: "owner_all_order", ownerEmail, payload: snapshot.orders });
    await upsertOwnerPayload({ table: "owner_rental_order", ownerEmail, payload: snapshot.rentals });
    await upsertOwnerPayload({ table: "owner_buy_order", ownerEmail, payload: snapshot.buyOrders });

    return res.json({ message: "Owner dashboard refreshed", ownerEmail, payload: snapshot });
  } catch (err) {
    console.log("Owner dashboard refresh error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to refresh owner dashboard" });
  }
});

app.post("/api/owner/:ownerEmail/dashboard/sync", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const rentals = Array.isArray(req.body?.rentals) ? req.body.rentals : [];
    const buyOrders = Array.isArray(req.body?.buyOrders) ? req.body.buyOrders : [];

    const dashboard = {
      products,
      orders,
      rentals,
      buyOrders,
      updatedAt: new Date().toISOString(),
    };

    await upsertOwnerPayload({ table: "owner_dashboard", ownerEmail, payload: dashboard });
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: products });
    await upsertOwnerPayload({ table: "owner_all_order", ownerEmail, payload: orders });
    await upsertOwnerPayload({ table: "owner_rental_order", ownerEmail, payload: rentals });
    await upsertOwnerPayload({ table: "owner_buy_order", ownerEmail, payload: buyOrders });

    return res.json({ message: "Owner dashboard synced" });
  } catch (err) {
    console.log("Owner dashboard sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync owner dashboard" });
  }
});

app.get("/api/owner/:ownerEmail/products", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: snapshot.products });
    return res.json({ ownerEmail, products: snapshot.products, updatedAt: snapshot.updatedAt });
  } catch (err) {
    console.log("Owner products fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner products" });
  }
});

app.post("/api/owner/:ownerEmail/products", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const name = String(req.body?.name || "").trim();
    const { images, primaryImage } = resolveImagesForDb(req.body);
    const category = String(req.body?.category || "Jewellery").trim() || "Jewellery";
    const availabilityType = String(req.body?.availabilityType || "All").trim() || "All";
    const description = String(req.body?.description || "").trim();
    const occasion = String(req.body?.occasion || "").trim();
    const size = String(req.body?.size || "").trim();
    const color = String(req.body?.color || "").trim();
    const city = String(req.body?.city || "").trim();
    const rentPrice = Math.max(0, Number(req.body?.rentPrice || 0));
    const buyPrice = Math.max(0, Number(req.body?.buyPrice || 0));
    const stock = normalizeStockForDb(req.body?.inStock);
    const isDraft = normalizeBooleanFlag(req.body?.isDraft);
    const ownerName = String(req.body?.ownerName || "").trim();
    const now = new Date();

    if (!name || !primaryImage) {
      return res.status(400).json({ message: "name and image are required" });
    }

    const result = await queryAsync(
      `
      INSERT INTO products
      (product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_draft, is_hero, is_category_highlight, is_featured, is_collection, description, occasion, size, color, city, owner_email, owner_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        category,
        rentPrice,
        buyPrice,
        stock,
        primaryImage,
        JSON.stringify(images),
        availabilityType,
        isDraft,
        0,
        0,
        0,
        1,
        description,
        occasion,
        size,
        color,
        city,
        ownerEmail,
        ownerName || null,
        now,
        now,
      ]
    );

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: snapshot.products });

    return res.json({ message: "Product created", id: String(result.insertId) });
  } catch (err) {
    console.log("Owner product create error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to create product" });
  }
});

app.put("/api/owner/:ownerEmail/products/:id", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const id = Number(req.params?.id || 0);
    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const owned = await queryAsync(
      "SELECT id FROM products WHERE id = ? AND LOWER(COALESCE(owner_email, '')) = ? LIMIT 1",
      [id, ownerEmail]
    );
    if (!owned.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    const name = String(req.body?.name || "").trim();
    const { images, primaryImage } = resolveImagesForDb(req.body);
    const category = String(req.body?.category || "Jewellery").trim() || "Jewellery";
    const availabilityType = String(req.body?.availabilityType || "All").trim() || "All";
    const description = String(req.body?.description || "").trim();
    const occasion = String(req.body?.occasion || "").trim();
    const size = String(req.body?.size || "").trim();
    const color = String(req.body?.color || "").trim();
    const city = String(req.body?.city || "").trim();
    const rentPrice = Math.max(0, Number(req.body?.rentPrice || 0));
    const buyPrice = Math.max(0, Number(req.body?.buyPrice || 0));
    const stock = normalizeStockForDb(req.body?.inStock);
    const isDraft = normalizeBooleanFlag(req.body?.isDraft);
    const ownerName = String(req.body?.ownerName || "").trim();
    const now = new Date();

    if (!name || !primaryImage) {
      return res.status(400).json({ message: "name and image are required" });
    }

    const result = await queryAsync(
      `
      UPDATE products
      SET product_name = ?, category = ?, rent_price = ?, buy_price = ?, stock = ?, image_url = ?, image_urls = ?, availability_type = ?, is_draft = ?, description = ?, occasion = ?, size = ?, color = ?, city = ?, owner_name = COALESCE(NULLIF(?, ''), owner_name), updated_at = ?
      WHERE id = ? AND LOWER(COALESCE(owner_email, '')) = ?
      `,
      [
        name,
        category,
        rentPrice,
        buyPrice,
        stock,
        primaryImage,
        JSON.stringify(images),
        availabilityType,
        isDraft,
        description,
        occasion,
        size,
        color,
        city,
        ownerName,
        now,
        id,
        ownerEmail,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Product not found" });
    }

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: snapshot.products });

    return res.json({ message: "Product updated" });
  } catch (err) {
    console.log("Owner product update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update product" });
  }
});

app.delete("/api/owner/:ownerEmail/products/:id", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const id = Number(req.params?.id || 0);
    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const result = await queryAsync(
      "DELETE FROM products WHERE id = ? AND LOWER(COALESCE(owner_email, '')) = ?",
      [id, ownerEmail]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Product not found" });
    }

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_dashboard", ownerEmail, payload: snapshot });
    await upsertOwnerPayload({ table: "owner_all_product", ownerEmail, payload: snapshot.products });
    await upsertOwnerPayload({ table: "owner_all_order", ownerEmail, payload: snapshot.orders });
    await upsertOwnerPayload({ table: "owner_rental_order", ownerEmail, payload: snapshot.rentals });
    await upsertOwnerPayload({ table: "owner_buy_order", ownerEmail, payload: snapshot.buyOrders });

    return res.json({ message: "Product deleted" });
  } catch (err) {
    console.log("Owner product delete error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to delete product" });
  }
});

app.get("/api/owner/:ownerEmail/orders", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const row = await readOwnerPayload({ table: "owner_all_order", ownerEmail, fallback: [] });
    if (!row) return res.status(404).json({ message: "Owner orders not found" });

    return res.json({ ownerEmail, orders: Array.isArray(row.payload) ? row.payload : [], updatedAt: row.updatedAt });
  } catch (err) {
    console.log("Owner orders fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner orders" });
  }
});

app.get("/api/owner/:ownerEmail/reports", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    const rentals = Array.isArray(snapshot.rentals) ? snapshot.rentals : [];
    const buyOrders = Array.isArray(snapshot.buyOrders) ? snapshot.buyOrders : [];

    const isCountedEarned = (status) => {
      const s = String(status || "").trim().toLowerCase();
      return s && s !== "pending";
    };
    const rowAmount = (row) => Number(row?.total ?? row?.amount ?? 0) || 0;
    const rowDate = (row) => {
      const text = String(row?.date || "").trim();
      if (!text) return null;
      const d = new Date(text);
      return Number.isFinite(d.getTime()) ? d : null;
    };
    const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const labelFromKey = (key) => {
      const [y, m] = String(key || "").split("-");
      const date = new Date(Number(y), Math.max(0, Number(m) - 1), 1);
      return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { month: "short" }) : "";
    };

    const base = new Date();
    const monthlyKeys = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(base.getFullYear(), base.getMonth() - offset, 1);
      monthlyKeys.push(monthKey(d));
    }

    const monthTotals = new Map(monthlyKeys.map((k) => [k, 0]));
    const productCounts = new Map();

    const allRows = [...rentals, ...buyOrders].filter((row) => isCountedEarned(row?.status));
    for (const row of allRows) {
      const d = rowDate(row);
      if (d) {
        const k = monthKey(d);
        if (monthTotals.has(k)) monthTotals.set(k, (monthTotals.get(k) || 0) + rowAmount(row));
      }

      const items = Array.isArray(row?.items) ? row.items : [];
      const label = String(items?.[0]?.name || row?.product || row?.productName || "Order").trim() || "Order";
      productCounts.set(label, (productCounts.get(label) || 0) + 1);
    }

    const monthly = monthlyKeys.map((k) => ({ key: k, label: labelFromKey(k), amount: monthTotals.get(k) || 0 }));
    const maxAmount = Math.max(1, ...monthly.map((m) => Number(m.amount || 0)));
    const topProducts = Array.from(productCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return res.json({
      ownerEmail,
      monthly,
      maxAmount,
      topProducts,
      updatedAt: snapshot.updatedAt,
    });
  } catch (err) {
    console.log("Owner reports fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner reports" });
  }
});

app.get("/api/owner/:ownerEmail/rentals", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_rental_order", ownerEmail, payload: snapshot.rentals });

    return res.json({
      ownerEmail,
      rentals: Array.isArray(snapshot.rentals) ? snapshot.rentals : [],
      updatedAt: snapshot.updatedAt,
    });
  } catch (err) {
    console.log("Owner rentals fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner rentals" });
  }
});

const parseItemsSafe = (raw) => {
  try {
    const maybeItems = JSON.parse(String(raw || "[]"));
    return Array.isArray(maybeItems) ? maybeItems : [];
  } catch {
    return [];
  }
};

const ownerOwnsAnyProductId = async ({ ownerEmail, productIds }) => {
  const safeOwner = normalizeEmail(ownerEmail);
  const numeric = (Array.isArray(productIds) ? productIds : [])
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));

  if (!safeOwner || numeric.length === 0) return false;

  try {
    const rows = await queryAsync(
      "SELECT id FROM products WHERE id IN (?) AND LOWER(COALESCE(owner_email, '')) = ? LIMIT 1",
      [numeric, safeOwner]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

app.patch("/api/owner/:ownerEmail/rentals/:orderId/status", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    const orderId = String(req.params?.orderId || "").trim();
    const status = String(req.body?.status || "").trim();

    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    if (!orderId || !status) return res.status(400).json({ message: "orderId and status are required" });

    const rentalRows = await queryAsync("SELECT items FROM rental_orders WHERE order_id = ? LIMIT 1", [orderId]);
    if (!rentalRows.length) return res.status(404).json({ message: "Rental order not found" });

    const parsedItems = parseItemsSafe(rentalRows[0].items);
    const productIds = extractProductIdsFromRentalItems(parsedItems);
    const allowed = await ownerOwnsAnyProductId({ ownerEmail, productIds });
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const result = await queryAsync("UPDATE rental_orders SET status = ? WHERE order_id = ?", [status, orderId]);
    if (!result.affectedRows) return res.status(404).json({ message: "Rental order not found" });

    const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
    await upsertOwnerPayload({ table: "owner_dashboard", ownerEmail, payload: snapshot });
    await upsertOwnerPayload({ table: "owner_all_order", ownerEmail, payload: snapshot.orders });
    await upsertOwnerPayload({ table: "owner_rental_order", ownerEmail, payload: snapshot.rentals });
    await upsertOwnerPayload({ table: "owner_buy_order", ownerEmail, payload: snapshot.buyOrders });

    return res.json({ message: "Rental status updated" });
  } catch (err) {
    console.log("Owner rental status update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update rental status" });
  }
});

const OWNER_RETURN_REQUEST_STAGES = ["Request Sent", "Item Received", "Return Confirmed", "Returned"];

const normalizeOwnerReturnStage = (value) => {
  const text = String(value || "").trim();
  if (!text) return "Request Sent";
  const normalized = text.toLowerCase();
  const match = OWNER_RETURN_REQUEST_STAGES.find((s) => s.toLowerCase() === normalized);
  return match || "Request Sent";
};

const mapReturnRequestRow = (row) => ({
  id: String(row.request_id || ""),
  request_id: String(row.request_id || ""),
  orderId: String(row.order_id || ""),
  rentalId: String(row.rental_id || ""),
  customerName: String(row.customer || "Customer"),
  customerEmail: normalizeScopedEmail(row.customer_email),
  productName: String(row.product_name || ""),
  rentalEndDate: row.rental_end_date,
  returnReason: String(row.return_reason || ""),
  conditionReported: String(row.condition_reported || ""),
  notes: String(row.notes || ""),
  stage: normalizeOwnerReturnStage(row.stage),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fetchReturnRequestProductIds = async ({ orderId, rentalId }) => {
  const safeOrderId = String(orderId || "").trim();
  const safeRentalId = String(rentalId || "").trim();
  if (!safeOrderId && !safeRentalId) return [];

  try {
    const rows = safeOrderId
      ? await queryAsync("SELECT items FROM rental_orders WHERE order_id = ? LIMIT 1", [safeOrderId])
      : await queryAsync("SELECT items FROM rental_orders WHERE rental_id = ? LIMIT 1", [safeRentalId]);
    if (!rows.length) return [];
    const parsedItems = parseItemsSafe(rows[0].items);
    return extractProductIdsFromRentalItems(parsedItems);
  } catch {
    return [];
  }
};

app.get("/api/owner/:ownerEmail/returns/requests", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });

    const rows = await queryAsync(
      `
      SELECT request_id, order_id, rental_id, customer, customer_email, product_name, rental_end_date,
             return_reason, condition_reported, notes, stage, created_at, updated_at
      FROM rental_return_requests
      ORDER BY id DESC
      `
    );

    if (!rows.length) return res.json({ ownerEmail, requests: [] });

    const normalizedOwner = normalizeEmail(ownerEmail);
    const requestProductIds = new Map();
    const allProductIds = new Set();

    for (const row of rows) {
      const orderId = String(row.order_id || "").trim();
      const rentalId = String(row.rental_id || "").trim();
      const productIds = await fetchReturnRequestProductIds({ orderId, rentalId });
      requestProductIds.set(String(row.request_id || ""), productIds);
      for (const id of productIds) allProductIds.add(id);
    }

    const ids = Array.from(allProductIds);
    let ownerMap = new Map();
    if (ids.length > 0) {
      try {
        const productRows = await queryAsync("SELECT id, owner_email FROM products WHERE id IN (?)", [ids]);
        ownerMap = new Map(
          productRows.map((p) => [Number(p.id), normalizeEmail(p.owner_email)]).filter((pair) => Number.isFinite(pair[0]))
        );
      } catch {
        ownerMap = new Map();
      }
    }

    const visible = rows.filter((row) => {
      const list = requestProductIds.get(String(row.request_id || "")) || [];
      return list.some((id) => ownerMap.get(Number(id)) === normalizedOwner);
    });

    return res.json({ ownerEmail, requests: visible.map(mapReturnRequestRow) });
  } catch (err) {
    console.log("Owner return requests fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch return requests" });
  }
});

app.patch("/api/owner/:ownerEmail/returns/requests/:requestId/stage", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    const requestId = String(req.params?.requestId || "").trim();
    const stage = normalizeOwnerReturnStage(req.body?.stage);

    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    if (!requestId) return res.status(400).json({ message: "requestId is required" });

    const rows = await queryAsync(
      "SELECT request_id, order_id, rental_id FROM rental_return_requests WHERE request_id = ? LIMIT 1",
      [requestId]
    );
    if (!rows.length) return res.status(404).json({ message: "Return request not found" });

    const row = rows[0];
    const productIds = await fetchReturnRequestProductIds({ orderId: row.order_id, rentalId: row.rental_id });
    const allowed = await ownerOwnsAnyProductId({ ownerEmail, productIds });
    if (!allowed) return res.status(403).json({ message: "Not allowed" });

    const now = new Date();
    const result = await queryAsync(
      "UPDATE rental_return_requests SET stage = ?, updated_at = ? WHERE request_id = ?",
      [stage, now, requestId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Return request not found" });

    if (String(stage || "").trim().toLowerCase() === "returned") {
      const safeOrderId = String(row.order_id || "").trim();
      const safeRentalId = String(row.rental_id || "").trim();
      if (safeOrderId) {
        await queryAsync("UPDATE rental_orders SET status = ? WHERE order_id = ?", ["returned", safeOrderId]);
      } else if (safeRentalId) {
        await queryAsync("UPDATE rental_orders SET status = ? WHERE rental_id = ?", ["returned", safeRentalId]);
      }
    }

    return res.json({ message: "Return request updated", stage });
  } catch (err) {
    console.log("Owner return request stage update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update return request" });
  }
});

const ensureProductsSchema = async () => {
  try {
    const columnRows = await queryAsync(
      `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
      `
    );
    const indexRows = await queryAsync(
      `
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
      `
    );

    const existingColumns = new Set(columnRows.map((row) => String(row.COLUMN_NAME || "").toLowerCase()));
    const existingIndexes = new Set(indexRows.map((row) => String(row.INDEX_NAME || "").toLowerCase()));

    const mandatoryAlterations = [
      "ALTER TABLE products MODIFY COLUMN product_name VARCHAR(255) NOT NULL",
      "ALTER TABLE products MODIFY COLUMN category VARCHAR(100) NOT NULL",
      "ALTER TABLE products MODIFY COLUMN rent_price BIGINT NOT NULL",
      "ALTER TABLE products MODIFY COLUMN buy_price BIGINT NOT NULL",
      "ALTER TABLE products MODIFY COLUMN stock VARCHAR(20) NOT NULL",
    ];

    for (const sql of mandatoryAlterations) {
      try {
        await queryAsync(sql);
      } catch (err) {
        console.log("Products schema migration warning:", err.sqlMessage || err.message);
      }
    }

    if (!existingColumns.has("image_url")) {
      await queryAsync("ALTER TABLE products ADD COLUMN image_url TEXT NULL");
    }
    if (!existingColumns.has("image_urls")) {
      await queryAsync("ALTER TABLE products ADD COLUMN image_urls TEXT NULL");
    }
    if (!existingColumns.has("availability_type")) {
      await queryAsync("ALTER TABLE products ADD COLUMN availability_type VARCHAR(50) NOT NULL DEFAULT 'All'");
    }
    if (!existingColumns.has("is_hero")) {
      await queryAsync("ALTER TABLE products ADD COLUMN is_hero TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existingColumns.has("is_category_highlight")) {
      await queryAsync("ALTER TABLE products ADD COLUMN is_category_highlight TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existingColumns.has("is_featured")) {
      await queryAsync("ALTER TABLE products ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existingColumns.has("is_collection")) {
      await queryAsync("ALTER TABLE products ADD COLUMN is_collection TINYINT(1) NOT NULL DEFAULT 1");
    }
    if (!existingColumns.has("description")) {
      await queryAsync("ALTER TABLE products ADD COLUMN description TEXT NULL");
    }
    if (!existingColumns.has("legacy_id")) {
      await queryAsync("ALTER TABLE products ADD COLUMN legacy_id VARCHAR(120) NULL");
    }
    if (!existingColumns.has("created_at")) {
      await queryAsync("ALTER TABLE products ADD COLUMN created_at DATETIME NULL");
    }
    if (!existingColumns.has("updated_at")) {
      await queryAsync("ALTER TABLE products ADD COLUMN updated_at DATETIME NULL");
    }
    if (!existingColumns.has("occasion")) {
      await queryAsync("ALTER TABLE products ADD COLUMN occasion VARCHAR(100) NULL");
    }
    if (!existingColumns.has("size")) {
      await queryAsync("ALTER TABLE products ADD COLUMN size VARCHAR(50) NULL");
    }
    if (!existingColumns.has("color")) {
      await queryAsync("ALTER TABLE products ADD COLUMN color VARCHAR(100) NULL");
    }
    if (!existingColumns.has("city")) {
      await queryAsync("ALTER TABLE products ADD COLUMN city VARCHAR(100) NULL");
    }
    if (!existingColumns.has("owner_email")) {
      await queryAsync("ALTER TABLE products ADD COLUMN owner_email VARCHAR(191) NULL");
    }
    if (!existingColumns.has("owner_name")) {
      await queryAsync("ALTER TABLE products ADD COLUMN owner_name VARCHAR(191) NULL");
    }
    if (!existingColumns.has("is_draft")) {
      await queryAsync("ALTER TABLE products ADD COLUMN is_draft TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!existingIndexes.has("uq_products_legacy_id")) {
      await queryAsync("ALTER TABLE products ADD UNIQUE KEY uq_products_legacy_id (legacy_id)");
    }

    const optionalAlterations = [
      "ALTER TABLE products MODIFY COLUMN image_url LONGTEXT NULL",
      "ALTER TABLE products MODIFY COLUMN image_urls LONGTEXT NULL",
      "ALTER TABLE products MODIFY COLUMN description LONGTEXT NULL",
    ];

    for (const sql of optionalAlterations) {
      try {
        await queryAsync(sql);
      } catch (err) {
        console.log("Products schema migration warning:", err.sqlMessage || err.message);
      }
    }
  } catch (err) {
    console.log("Products schema migration warning:", err.sqlMessage || err.message);
  }
};

// Schemas are ensured during bootstrap before the server starts.

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
    // ignore json parsing
  }

  // Data URLs contain a comma after the mime header, so splitting on commas breaks them.
  if (raw.startsWith("data:")) {
    return raw
      .split(/\n+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return raw
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeBooleanFlag = (value) => {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return 0;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on" ? 1 : 0;
};

const flagToBoolean = (value) => Number(value) === 1;

const repairDataUrlFragments = (list) => {
  const repaired = [];
  for (let i = 0; i < list.length; i += 1) {
    const current = String(list[i] || "").trim();
    const next = String(list[i + 1] || "").trim();

    const isHeaderOnly = /^data:image\/[a-z0-9.+-]+;base64$/i.test(current);
    const isBase64Body = /^[a-z0-9+/=]+$/i.test(next) && next.length > 128;

    if (isHeaderOnly && isBase64Body) {
      repaired.push(`${current},${next}`);
      i += 1;
      continue;
    }

    const isBodyOnly = /^[a-z0-9+/=]+$/i.test(current) && current.length > 128;
    const isNextHeaderOnly = /^data:image\/[a-z0-9.+-]+;base64$/i.test(next);

    if (isBodyOnly && isNextHeaderOnly) {
      repaired.push(`${next},${current}`);
      i += 1;
      continue;
    }

    repaired.push(current);
  }

  return repaired.map((item) => String(item || "").trim()).filter(Boolean);
};

const resolveImagesForDb = (body) => {
  const images = normalizeImageList(body?.images ?? body?.imageUrls ?? body?.image_urls);
  const fallbackImage = String(body?.image || "").trim();
  const merged = repairDataUrlFragments([fallbackImage, ...images])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(merged));
  return {
    images: unique,
    primaryImage: unique[0] || "",
  };
};

const parseImagesFromDb = (row) => {
  const fromList = normalizeImageList(row?.image_urls);
  const primary = String(row?.image_url || "").trim();
  const merged = repairDataUrlFragments([primary, ...fromList])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(merged));
  return {
    images: unique,
    primaryImage: unique[0] || primary,
  };
};

const computeOwnerDashboardSnapshot = async (ownerEmail) => {
  const safeOwner = normalizeEmail(ownerEmail);
  const nowIso = new Date().toISOString();

  const productRows = await queryAsync(
    "SELECT id, product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_hero, is_category_highlight, is_featured, is_collection, description, occasion, size, color, city, owner_email, owner_name, is_draft, created_at, updated_at FROM products WHERE LOWER(owner_email) = ? ORDER BY id DESC",
    [safeOwner]
  );

  const products = productRows.map((row) => ({
    ...(() => {
      const { images, primaryImage } = parseImagesFromDb(row);
      return { image: primaryImage, images };
    })(),
    id: String(row.id),
    name: String(row.product_name || ""),
    category: String(row.category || "Jewellery"),
    availabilityType: String(row.availability_type || "All"),
    description: row.description === null || row.description === undefined ? "" : String(row.description),
    occasion: row.occasion === null || row.occasion === undefined ? "" : String(row.occasion),
    size: row.size === null || row.size === undefined ? "" : String(row.size),
    color: row.color === null || row.color === undefined ? "" : String(row.color),
    city: row.city === null || row.city === undefined ? "" : String(row.city),
    ownerEmail: row.owner_email === null || row.owner_email === undefined ? "" : String(row.owner_email),
    ownerName: row.owner_name === null || row.owner_name === undefined ? "" : String(row.owner_name),
    rentPrice: Number(row.rent_price || 0),
    buyPrice: Number(row.buy_price || 0),
    inStock: stockToBoolean(row.stock),
    isDraft: flagToBoolean(row.is_draft),
    isHero: flagToBoolean(row.is_hero),
    isCategoryHighlight: flagToBoolean(row.is_category_highlight),
    isFeatured: flagToBoolean(row.is_featured),
    isCollection: flagToBoolean(row.is_collection),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));

  let ownerDisplayName =
    String(products.find((p) => String(p?.ownerName || "").trim())?.ownerName || "").trim() || "";
  if (!ownerDisplayName) {
    try {
      const rows = await queryAsync("SELECT name FROM clerk_users WHERE LOWER(email) = ? LIMIT 1", [safeOwner]);
      ownerDisplayName = String(rows?.[0]?.name || "").trim();
    } catch {
      // ignore
    }
  }
  if (!ownerDisplayName) ownerDisplayName = safeOwner || "Owner";

  const ownerProductIds = new Set(products.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0));

  const parseItemsSafe = (raw) => {
    try {
      const maybeItems = JSON.parse(String(raw || "[]"));
      return Array.isArray(maybeItems) ? maybeItems : [];
    } catch {
      return [];
    }
  };

  const filterRowsByOwnerItems = (rows, getItems, mapRow) =>
    rows
      .map((row) => {
        const parsedItems = getItems(row);
        const ids = extractProductIdsFromRentalItems(parsedItems);
        if (!ids.some((id) => ownerProductIds.has(id))) return null;
        return mapRow(row, parsedItems);
      })
      .filter(Boolean);

  const allOrderRows = await queryAsync(
    "SELECT id, order_id, customer, type, items, total, status, date FROM all_order ORDER BY id DESC"
  );
  const orders = filterRowsByOwnerItems(
    allOrderRows,
    (row) => parseItemsSafe(row.items),
    (row, parsedItems) => ({
      db_id: row.id,
      id: String(row.order_id || ""),
      order_id: String(row.order_id || ""),
      customer: String(row.customer || "Customer"),
      type: String(row.type || "Buy"),
      ownerName: ownerDisplayName,
      ownerEmail: safeOwner,
      items: parsedItems,
      total: Number(row.total || 0),
      status: String(row.status || "Pending"),
      date: row.date,
    })
  );

  const rentalRows = await queryAsync(
    "SELECT id, rental_id, order_id, customer, items, amount, status, date, pickup_date, return_date, daily_rate, total_days, deposit FROM rental_orders ORDER BY id DESC"
  );
  const rentals = filterRowsByOwnerItems(
    rentalRows,
    (row) => parseItemsSafe(row.items),
    (row, parsedItems) => ({
      id: String(row.order_id || row.rental_id || row.id || ""),
      rental_id: row.rental_id === null || row.rental_id === undefined ? "" : String(row.rental_id),
      order_id: String(row.order_id || ""),
      customer: String(row.customer || "Customer"),
      ownerName: ownerDisplayName,
      ownerEmail: safeOwner,
      items: parsedItems,
      amount: Number(row.amount || 0),
      status: String(row.status || "Pending"),
      date: row.date,
      pickup_date: row.pickup_date || null,
      return_date: row.return_date || null,
      daily_rate: Number(row.daily_rate || 0),
      total_days: row.total_days === null || row.total_days === undefined ? null : Number(row.total_days || 0),
      deposit: Number(row.deposit || 0),
    })
  );

  const buyRows = await queryAsync(
    "SELECT id, order_id, customer, items, amount, status, date FROM buy_orders ORDER BY id DESC"
  );
  const buyOrders = filterRowsByOwnerItems(
    buyRows,
    (row) => parseItemsSafe(row.items),
    (row, parsedItems) => ({
      id: row.id,
      order_id: String(row.order_id || ""),
      customer: String(row.customer || "Customer"),
      ownerName: ownerDisplayName,
      ownerEmail: safeOwner,
      items: parsedItems,
      amount: Number(row.amount || 0),
      status: String(row.status || "Pending"),
      date: row.date,
    })
  );

  return {
    products,
    orders,
    rentals,
    buyOrders,
    updatedAt: nowIso,
  };
};

const buildOwnerStatsResponse = async (ownerEmail) => {
  const snapshot = await computeOwnerDashboardSnapshot(ownerEmail);
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
  const rentals = Array.isArray(snapshot.rentals) ? snapshot.rentals : [];
  const buyOrders = Array.isArray(snapshot.buyOrders) ? snapshot.buyOrders : [];

  const listed = products.filter((p) => !p?.isDraft);
  const totalProducts = listed.length;
  const availableProducts = listed.filter((p) => Boolean(p?.inStock)).length;

  const rowAmount = (row) => Number(row?.total ?? row?.amount ?? 0);
  const isCountedEarned = (status) => {
    const s = String(status || "").trim().toLowerCase();
    return s && s !== "pending";
  };
  const parseRowDate = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    const d = new Date(text);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  const monthKeyStats = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  // Use consolidated owner orders as the source of truth to avoid double-counting
  // rows that also exist in buy_orders / rental_orders tables.
  const primaryRows =
    orders.length > 0
      ? orders
      : [
          ...rentals.map((o) => ({ ...o, type: "rent" })),
          ...buyOrders.map((o) => ({ ...o, type: "buy" })),
        ];

  const allRows = primaryRows.map((o) => ({ amount: rowAmount(o), status: o.status, date: o.date }));

  const totalOrders = allRows.length;
  const totalEarned = allRows.filter((o) => isCountedEarned(o.status)).reduce((sum, o) => sum + o.amount, 0);

  const now = new Date();
  const thisKey = monthKeyStats(now);
  const thisMonthEarned = allRows
    .filter((o) => {
      if (!isCountedEarned(o.status)) return false;
      const d = parseRowDate(o.date);
      if (!d) return false;
      return monthKeyStats(d) === thisKey;
    })
    .reduce((sum, o) => sum + o.amount, 0);

  const activeRentals = rentals.filter((o) => {
    const s = String(o?.status || "").trim().toLowerCase();
    return s !== "returned";
  }).length;

  return {
    ownerEmail,
    totalProducts,
    availableProducts,
    totalOrders,
    totalEarned,
    thisMonthEarned,
    activeRentals,
    avgRating: null,
    updatedAt: snapshot.updatedAt,
  };
};

app.get("/api/owner/stats", async (req, res) => {
  try {
    const ownerEmail = normalizeEmail(req.query?.ownerEmail || req.query?.email);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    const payload = await buildOwnerStatsResponse(ownerEmail);
    return res.json(payload);
  } catch (err) {
    console.log("Owner stats fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner stats" });
  }
});

app.get("/api/owner/:ownerEmail/stats", async (req, res) => {
  try {
    const ownerEmail = ownerEmailFromParams(req);
    if (!ownerEmail) return res.status(400).json({ message: "ownerEmail is required" });
    const payload = await buildOwnerStatsResponse(ownerEmail);
    return res.json(payload);
  } catch (err) {
    console.log("Owner stats fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner stats" });
  }
});

const ensureDashboardSchema = async () => {
  const migrations = [
    "ALTER TABLE dashboard MODIFY COLUMN order_id VARCHAR(100) NOT NULL",
    "ALTER TABLE dashboard MODIFY COLUMN customer VARCHAR(150) NOT NULL",
    "ALTER TABLE dashboard MODIFY COLUMN type VARCHAR(20) NOT NULL",
    "ALTER TABLE dashboard MODIFY COLUMN amount BIGINT NOT NULL",
    "ALTER TABLE dashboard MODIFY COLUMN status VARCHAR(50) NOT NULL",
  ];

  for (const sql of migrations) {
    try {
      await queryAsync(sql);
    } catch (err) {
      console.log("Dashboard schema migration warning:", err.sqlMessage || err.message);
    }
  }

  try {
    const indexRows = await queryAsync(
      `
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dashboard'
      `
    );
    const hasOrderIdIndex = indexRows.some(
      (row) => String(row.INDEX_NAME || "").toLowerCase() === "uq_dashboard_order_id"
    );
    if (!hasOrderIdIndex) {
      await queryAsync("ALTER TABLE dashboard ADD UNIQUE KEY uq_dashboard_order_id (order_id)");
    }
  } catch (err) {
    console.log("Dashboard schema migration warning:", err.sqlMessage || err.message);
  }
};

const ensureAdminDashboardSchema = async () => {
  try {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS admin_dashboard (
        id INT NOT NULL AUTO_INCREMENT,
        order_id VARCHAR(100) NOT NULL,
        customer VARCHAR(150) NOT NULL,
        type VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_admin_dashboard_order_id (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    console.log("Admin dashboard schema migration warning:", err.sqlMessage || err.message);
  }

  const migrations = [
    "ALTER TABLE admin_dashboard MODIFY COLUMN order_id VARCHAR(100) NOT NULL",
    "ALTER TABLE admin_dashboard MODIFY COLUMN customer VARCHAR(150) NOT NULL",
    "ALTER TABLE admin_dashboard MODIFY COLUMN type VARCHAR(20) NOT NULL",
    "ALTER TABLE admin_dashboard MODIFY COLUMN amount BIGINT NOT NULL",
    "ALTER TABLE admin_dashboard MODIFY COLUMN status VARCHAR(50) NOT NULL",
  ];

  for (const sql of migrations) {
    try {
      await queryAsync(sql);
    } catch (err) {
      console.log("Admin dashboard schema migration warning:", err.sqlMessage || err.message);
    }
  }

  try {
    const indexRows = await queryAsync(
      `
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_dashboard'
      `
    );
    const hasOrderIdIndex = indexRows.some(
      (row) => String(row.INDEX_NAME || "").toLowerCase() === "uq_admin_dashboard_order_id"
    );
    if (!hasOrderIdIndex) {
      await queryAsync("ALTER TABLE admin_dashboard ADD UNIQUE KEY uq_admin_dashboard_order_id (order_id)");
    }
  } catch (err) {
    console.log("Admin dashboard schema migration warning:", err.sqlMessage || err.message);
  }
};

// Schemas are ensured during bootstrap before the server starts.

const upsertDashboardOrder = async ({ orderId, customer, type, amount, status }) => {
  const safeOrderId = String(orderId || "").trim();
  if (!safeOrderId) return;

  const safeCustomer = String(customer || "Customer").trim() || "Customer";
  const safeType = normalizeOrderType(type);
  const safeAmount = Math.max(0, Number(amount || 0));
  const safeStatus = String(status || "Pending").trim() || "Pending";

  const upsertInto = async (tableName) => {
    const existing = await queryAsync(`SELECT id FROM ${tableName} WHERE order_id = ? LIMIT 1`, [safeOrderId]);
    if (existing.length > 0) {
      await queryAsync(
        `UPDATE ${tableName} SET customer = ?, type = ?, amount = ?, status = ? WHERE id = ?`,
        [safeCustomer, safeType, safeAmount, safeStatus, existing[0].id]
      );
    } else {
      await queryAsync(
        `INSERT INTO ${tableName} (order_id, customer, type, amount, status) VALUES (?, ?, ?, ?, ?)`,
        [safeOrderId, safeCustomer, safeType, safeAmount, safeStatus]
      );
    }
  };

  await upsertInto("dashboard");
  await upsertInto("admin_dashboard");
};

app.post("/api/register", (req, res) => {
  const { f_name, l_name, email, password, phone } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!f_name || !normalizedEmail || !password) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  const checkSql = "SELECT id FROM users WHERE LOWER(email) = ?";
  db.query(checkSql, [normalizedEmail], (checkErr, existing) => {
    if (checkErr) {
      console.log("Register Check Error:", checkErr);
      return res.status(500).json({ message: "Database error" });
    }

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already registered. Please login." });
    }

    const insertSql = `
      INSERT INTO users (f_name, l_name, email, password, phone)
      VALUES (?, ?, ?, ?, ?)
    `;

    const hashedPassword = hashPassword(password);
    db.query(insertSql, [f_name, l_name, normalizedEmail, hashedPassword, phone], (insertErr, result) => {
      if (insertErr) {
        console.log("Register Error:", insertErr);
        return res.status(500).json({ message: "Database error" });
      }

      const role = normalizedEmail === ADMIN_EMAIL ? "admin" : "user";
      return res.json({
        message: "User Registration Successful",
        user: {
          id: result.insertId,
          f_name,
          l_name,
          email: normalizedEmail,
          role,
        },
      });
    });
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "").trim();

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ message: "Email & password required" });
  }

  const sql = "SELECT * FROM users WHERE LOWER(email) = ?";

  db.query(sql, [normalizedEmail], (err, results) => {
    if (err) {
      console.log("Login Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];
    if (!verifyPassword(normalizedPassword, user.password)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!String(user.password || "").includes("$")) {
      const upgradedHash = hashPassword(normalizedPassword);
      db.query("UPDATE users SET password = ? WHERE id = ?", [upgradedHash, user.id], (upgradeErr) => {
        if (upgradeErr) {
          console.log("Password upgrade warning:", upgradeErr.sqlMessage || upgradeErr.message);
        }
      });
    }

    const role = String(user.email || "").trim().toLowerCase() === ADMIN_EMAIL ? "admin" : "user";

    return res.json({
      message: "Login successful",
      user: {
        id: user.id,
        f_name: user.f_name,
        l_name: user.l_name,
        email: user.email,
        role,
      },
    });
  });
});

app.post("/api/forgot-password", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  return res.json({
    message: "Reset request received. Please check your email for next steps.",
  });
});

app.post("/api/admin/users/sync", async (req, res) => {
  try {
    const users = Array.isArray(req.body?.users) ? req.body.users : [];

    let processed = 0;
    for (const user of users) {
      const customer = String(user?.name || user?.customer || "").trim() || "Customer";
      const email = normalizeScopedEmail(user?.email);
      if (!email) continue;

      const phone = normalizePhoneForDb(user?.phone);
      const totalOrders = Number(user?.totalOrders || user?.order || 0);
      const totalRentals = Number(user?.totalRentals || user?.rental || 0);
      const totalSpent = Number(user?.totalSpent || user?.spent || 0);

      const existing = await queryAsync("SELECT id FROM order_user WHERE LOWER(email) = ? LIMIT 1", [email]);

      if (existing.length > 0) {
        await queryAsync(
          "UPDATE order_user SET customer = ?, phone = ?, `order` = ?, rental = ?, spent = ? WHERE id = ?",
          [customer, phone, totalOrders, totalRentals, totalSpent, existing[0].id]
        );
      } else {
        await queryAsync(
          "INSERT INTO order_user (customer, email, phone, `order`, rental, spent) VALUES (?, ?, ?, ?, ?, ?)",
          [customer, email, phone, totalOrders, totalRentals, totalSpent]
        );
      }

      processed += 1;
    }

    return res.json({ message: "Users synced", processed });
  } catch (err) {
    console.log("Users sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync users" });
  }
});

app.post("/api/admin/users/order-event", async (req, res) => {
  try {
    const customer = String(req.body?.customer || "").trim() || "Customer";
    const email = normalizeScopedEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const phone = normalizePhoneForDb(req.body?.phone);
    const total = Math.max(0, Number(req.body?.total || 0));
    const rawOrderType = String(req.body?.orderType || "").trim().toLowerCase();
    const orderType = rawOrderType === "rent" ? "rent" : rawOrderType === "mixed" ? "mixed" : "buy";

    const incrementOrders = orderType === "buy" || orderType === "mixed" ? 1 : 0;
    const incrementRentals = orderType === "rent" || orderType === "mixed" ? 1 : 0;

    const existing = await queryAsync("SELECT id FROM order_user WHERE LOWER(email) = ? LIMIT 1", [email]);
    if (existing.length > 0) {
      await queryAsync(
        "UPDATE order_user SET customer = ?, phone = COALESCE(?, phone), `order` = `order` + ?, rental = rental + ?, spent = spent + ? WHERE id = ?",
        [customer, phone, incrementOrders, incrementRentals, total, existing[0].id]
      );
    } else {
      await queryAsync(
        "INSERT INTO order_user (customer, email, phone, `order`, rental, spent) VALUES (?, ?, ?, ?, ?, ?)",
        [customer, email, phone, incrementOrders, incrementRentals, total]
      );
    }

    return res.json({ message: "Order event stored" });
  } catch (err) {
    console.log("Order event save error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to store order event" });
  }
});

app.get("/api/admin/users", async (_req, res) => {
  try {
    const rows = await queryAsync(
      "SELECT id, customer, email, phone, `order` AS totalOrders, rental AS totalRentals, spent AS totalSpent FROM order_user ORDER BY id DESC"
    );

    const users = rows.map((row) => ({
      id: row.id,
      name: String(row.customer || "Customer"),
      email: normalizeScopedEmail(row.email),
      phone: row.phone ? String(row.phone) : "",
      totalOrders: Number(row.totalOrders || 0),
      totalRentals: Number(row.totalRentals || 0),
      totalSpent: Number(row.totalSpent || 0),
    }));

    return res.json({ users });
  } catch (err) {
    console.log("Users fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

const mapOwnerRow = (row) => ({
  id: row.id,
  clerkId: row.clerk_id || null,
  clerk_id: row.clerk_id || null,
  email: normalizeScopedEmail(row.email),
  name: String(row.name || "Owner"),
  city: String(row.city || "").trim(),
  phone: row.phone === null || row.phone === undefined ? "" : String(row.phone).trim(),
  status: String(row.status || "Active").trim(),
  approvalStatus: String(row.approval_status || "pending").trim().toLowerCase(),
  approval_status: String(row.approval_status || "pending").trim().toLowerCase(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

app.get("/api/admin/owners", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT id, clerk_id, email, name, phone, city, status, approval_status, created_at, updated_at
      FROM clerk_users
      WHERE LOWER(role) = 'owner' AND LOWER(approval_status) = 'approved'
      ORDER BY id DESC
      `
    );
    return res.json({ owners: rows.map(mapOwnerRow) });
  } catch (err) {
    console.log("Admin owners fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owners" });
  }
});

app.get("/api/admin/owners/requests", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT id, clerk_id, email, name, phone, city, status, approval_status, created_at, updated_at
      FROM clerk_users
      WHERE LOWER(role) = 'owner' AND LOWER(approval_status) = 'pending'
      ORDER BY id DESC
      `
    );
    return res.json({ requests: rows.map(mapOwnerRow) });
  } catch (err) {
    console.log("Admin owner requests fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch owner requests" });
  }
});

app.post("/api/admin/owners/approve", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const clerkId = String(req.body?.clerkId || req.body?.clerk_id || "").trim();
    if (!email && !clerkId) return res.status(400).json({ message: "email or clerkId is required" });

    const now = new Date();
    const result = clerkId
      ? await queryAsync(
          "UPDATE clerk_users SET role = 'owner', approval_status = 'approved', status = 'Active', updated_at = ? WHERE clerk_id = ?",
          [now, clerkId]
        )
      : await queryAsync(
          "UPDATE clerk_users SET role = 'owner', approval_status = 'approved', status = 'Active', updated_at = ? WHERE email = ?",
          [now, email]
        );

    if (!result.affectedRows) return res.status(404).json({ message: "Owner request not found" });
    return res.json({ message: "Owner approved" });
  } catch (err) {
    console.log("Approve owner error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to approve owner" });
  }
});

app.post("/api/admin/owners/reject", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const clerkId = String(req.body?.clerkId || req.body?.clerk_id || "").trim();
    if (!email && !clerkId) return res.status(400).json({ message: "email or clerkId is required" });

    const now = new Date();
    const result = clerkId
      ? await queryAsync(
          "UPDATE clerk_users SET approval_status = 'rejected', status = 'Suspended', updated_at = ? WHERE clerk_id = ?",
          [now, clerkId]
        )
      : await queryAsync(
          "UPDATE clerk_users SET approval_status = 'rejected', status = 'Suspended', updated_at = ? WHERE email = ?",
          [now, email]
        );

    if (!result.affectedRows) return res.status(404).json({ message: "Owner request not found" });
    return res.json({ message: "Owner rejected" });
  } catch (err) {
    console.log("Reject owner error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to reject owner" });
  }
});

const mapPersonRow = (row) => ({
  id: row.id,
  clerkId: row.clerk_id || null,
  clerk_id: row.clerk_id || null,
  email: normalizeScopedEmail(row.email),
  name: String(row.name || "User").trim() || "User",
  role: String(row.role || "user").trim().toLowerCase() || "user",
  city: String(row.city || "").trim(),
  status: String(row.status || "Active").trim() || "Active",
  approvalStatus: String(row.approval_status || "approved").trim().toLowerCase(),
  approval_status: String(row.approval_status || "approved").trim().toLowerCase(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

app.get("/api/admin/people", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT id, clerk_id, email, name, role, city, status, approval_status, created_at, updated_at
      FROM clerk_users
      ORDER BY id DESC
      `
    );
    return res.json({ people: rows.map(mapPersonRow) });
  } catch (err) {
    console.log("Admin people fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch people" });
  }
});

app.patch("/api/admin/people/:email/status", async (req, res) => {
  try {
    const email = normalizeEmail(req.params?.email);
    const status = String(req.body?.status || "").trim() || "Active";
    if (!email) return res.status(400).json({ message: "email is required" });

    const now = new Date();
    const result = await queryAsync("UPDATE clerk_users SET status = ?, updated_at = ? WHERE email = ?", [
      status,
      now,
      email,
    ]);

    if (!result.affectedRows) return res.status(404).json({ message: "Person not found" });
    return res.json({ message: "Status updated", status });
  } catch (err) {
    console.log("Admin people status update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update status" });
  }
});

app.post("/api/admin/rentals/order-event", async (req, res) => {
  try {
    const orderId = String(req.body?.order_id || "").trim();
    if (!orderId) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const customer = String(req.body?.customer || "").trim() || "Customer";
    const customerEmail = normalizeEmail(req.body?.customerEmail ?? req.body?.customer_email ?? req.body?.email);
    const itemsPayload = Array.isArray(req.body?.items) ? req.body.items : [];
    const itemsText = JSON.stringify(itemsPayload);
    const amount = Math.max(0, Number(req.body?.amount || 0));
    const status = String(req.body?.status || "Pending").trim() || "Pending";
    const dateValue = String(req.body?.date || "").trim();
    const date = dateValue ? new Date(dateValue) : new Date();
    const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
    const pickupDate = String(req.body?.pickupDate || req.body?.pickup_date || "").trim() || null;
    const returnDate = String(req.body?.returnDate || req.body?.return_date || "").trim() || null;
    const dailyRate = Math.max(0, Number(req.body?.dailyRate ?? req.body?.daily_rate ?? 0));
    const totalDaysRaw = Number(req.body?.totalDays ?? req.body?.total_days ?? 0);
    const totalDays = Number.isFinite(totalDaysRaw) && totalDaysRaw > 0 ? Math.trunc(totalDaysRaw) : null;
    const deposit = Math.max(0, Number(req.body?.deposit || 0));

    const normalizedPickup = pickupDate ? normalizeIsoDateOnly(pickupDate) : null;
    const normalizedReturn = returnDate ? normalizeIsoDateOnly(returnDate) : null;
    if (!normalizedPickup || !normalizedReturn) {
      return res.status(400).json({ message: "pickupDate and returnDate are required (YYYY-MM-DD)" });
    }
    if (normalizedReturn < normalizedPickup) {
      return res.status(400).json({ message: "returnDate cannot be before pickupDate" });
    }

    const rentalProductIds = extractProductIdsFromItems(itemsPayload, { mode: "rent" });
    const conflict = await findRentalAvailabilityConflict({
      productIds: rentalProductIds,
      pickupDate: normalizedPickup,
      returnDate: normalizedReturn,
      excludeOrderId: orderId,
    });
    if (conflict) {
      return res.status(409).json({
        message: "This product is already booked (sold out) for the selected dates.",
        conflict,
      });
    }

    const existing = await queryAsync("SELECT id FROM rental_orders WHERE order_id = ? LIMIT 1", [orderId]);
    if (existing.length > 0) {
      await queryAsync(
        "UPDATE rental_orders SET customer = ?, customer_email = ?, items = ?, amount = ?, status = ?, date = ?, pickup_date = ?, return_date = ?, daily_rate = ?, total_days = ?, deposit = ? WHERE id = ?",
        [
          customer,
          customerEmail,
          itemsText,
          amount,
          status,
          mysqlDate,
          normalizedPickup,
          normalizedReturn,
          dailyRate,
          totalDays,
          deposit,
          existing[0].id,
        ]
      );
    } else {
      await queryAsync(
        "INSERT INTO rental_orders (order_id, customer, customer_email, items, amount, status, date, pickup_date, return_date, daily_rate, total_days, deposit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          orderId,
          customer,
          customerEmail,
          itemsText,
          amount,
          status,
          mysqlDate,
          normalizedPickup,
          normalizedReturn,
          dailyRate,
          totalDays,
          deposit,
        ]
      );
    }

    await createAdminNotification({
      type: "new_rental_order",
      title: "New rental order",
      body: `Rental order ${orderId} was placed by ${customer}.`,
      meta: { orderId, customer, customerEmail, amount, status, type: "Rent" },
    });

    try {
      const ownerEmails = await getOwnerEmailsForItems(itemsPayload);
      for (const ownerEmail of ownerEmails) {
        const prefs = await readOwnerNotificationPrefsDb(ownerEmail);
        if (!prefs.newOrder) continue;
        await createOwnerNotification({
          ownerEmail,
          type: "new_order",
          title: "New rental order received",
          body: `Rental order ${orderId} was placed by ${customer}.`,
          meta: { orderId, type: "Rent", amount, status, customer },
        });
      }
    } catch {
      // ignore notification failures
    }

    return res.json({ message: "Rental order stored" });
  } catch (err) {
    console.log("Rental order save error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to store rental order" });
  }
});

app.post("/api/admin/rentals/sync", async (req, res) => {
  try {
    const incomingRentals = Array.isArray(req.body?.rentals) ? req.body.rentals : [];
    let processed = 0;

    for (const raw of incomingRentals) {
      const orderId = String(raw?.order_id || raw?.orderId || raw?.id || "").trim();
      if (!orderId) continue;

      const customer = String(raw?.customer || "Customer").trim() || "Customer";
      const customerEmail = normalizeEmail(raw?.customerEmail ?? raw?.customer_email ?? raw?.email);
      const itemsPayload = Array.isArray(raw?.items)
        ? raw.items
        : raw?.product
          ? [{ name: raw.product, image: raw.productImage || "", quantity: 1, mode: "rent" }]
          : [];
      const itemsText = JSON.stringify(itemsPayload);
      const amount = Math.max(0, Number(raw?.amount ?? raw?.total ?? raw?.dailyRate ?? 0));
      const status = String(raw?.status || "Pending").trim() || "Pending";
      const dateValue = String(raw?.date || raw?.pickupDate || "").trim();
      const date = dateValue ? new Date(dateValue) : new Date();
      const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
      const pickupDate = String(raw?.pickupDate || raw?.pickup_date || "").trim() || null;
      const returnDate = String(raw?.returnDate || raw?.return_date || "").trim() || null;
      const dailyRate = Math.max(0, Number(raw?.dailyRate ?? raw?.daily_rate ?? raw?.rate ?? 0));
      const totalDaysRaw = Number(raw?.totalDays ?? raw?.total_days ?? raw?.days ?? 0);
      const totalDays = Number.isFinite(totalDaysRaw) && totalDaysRaw > 0 ? Math.trunc(totalDaysRaw) : null;
      const deposit = Math.max(0, Number(raw?.deposit || 0));

      const existing = await queryAsync("SELECT id FROM rental_orders WHERE order_id = ? LIMIT 1", [orderId]);
      if (existing.length > 0) {
        await queryAsync(
          "UPDATE rental_orders SET customer = ?, customer_email = ?, items = ?, amount = ?, status = ?, date = ?, pickup_date = ?, return_date = ?, daily_rate = ?, total_days = ?, deposit = ? WHERE id = ?",
          [customer, customerEmail, itemsText, amount, status, mysqlDate, pickupDate, returnDate, dailyRate, totalDays, deposit, existing[0].id]
        );
      } else {
        await queryAsync(
          "INSERT INTO rental_orders (order_id, customer, customer_email, items, amount, status, date, pickup_date, return_date, daily_rate, total_days, deposit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [orderId, customer, customerEmail, itemsText, amount, status, mysqlDate, pickupDate, returnDate, dailyRate, totalDays, deposit]
        );
      }

      processed += 1;
    }

    return res.json({ message: "Rentals synced", processed });
  } catch (err) {
    console.log("Rentals sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync rentals" });
  }
});

app.get("/api/admin/rentals", async (_req, res) => {
  try {
    const rows = await queryAsync(
      "SELECT id, order_id, customer, items, amount, deposit, daily_rate, total_days, pickup_date, return_date, status, date FROM rental_orders ORDER BY id DESC"
    );

    const parsed = rows.map((row) => {
      let parsedItems = [];
      try {
        const maybeItems = JSON.parse(String(row.items || "[]"));
        parsedItems = Array.isArray(maybeItems) ? maybeItems : [];
      } catch {
        parsedItems = [];
      }

      return {
        id: row.id,
        order_id: String(row.order_id || ""),
        customer: String(row.customer || "Customer"),
        items: parsedItems,
        amount: Number(row.amount || 0),
        deposit: Number(row.deposit || 0),
        dailyRate: Number(row.daily_rate || 0),
        totalDays: row.total_days === null || row.total_days === undefined ? null : Number(row.total_days || 0),
        pickupDate: row.pickup_date || null,
        returnDate: row.return_date || null,
        status: String(row.status || "Pending"),
        date: row.date,
      };
    });

    const productIds = new Set();
    for (const rental of parsed) {
      const ids = extractProductIdsFromItems(rental.items);
      for (const id of ids) productIds.add(id);
    }

    const ownerByProductId = new Map();
    if (productIds.size > 0) {
      const products = await queryAsync(
        `
        SELECT
          p.id,
          COALESCE(NULLIF(p.owner_name, ''), NULLIF(u.name, ''), p.owner_email) AS owner_label
        FROM products p
        LEFT JOIN clerk_users u ON LOWER(u.email) = LOWER(p.owner_email)
        WHERE p.id IN (?)
        `,
        [Array.from(productIds)]
      );
      for (const product of Array.isArray(products) ? products : []) {
        const id = Number(product?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const label = String(product?.owner_label || "").trim();
        if (label) ownerByProductId.set(Math.floor(id), label);
      }
    }

    const rentals = parsed.map((rental) => {
      const ownerNames = deriveOwnerLabelsForItems(rental.items, ownerByProductId);
      const ownerName = summarizeOwners(ownerNames);
      return ownerName ? { ...rental, ownerName, owner: ownerName } : rental;
    });

    return res.json({ rentals });
  } catch (err) {
    console.log("Rental orders fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch rental orders" });
  }
});

app.patch("/api/admin/rentals/:orderId/status", async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!orderId || !status) {
      return res.status(400).json({ message: "orderId and status are required" });
    }

    const result = await queryAsync("UPDATE rental_orders SET status = ? WHERE order_id = ?", [status, orderId]);
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Rental order not found" });
    }

    return res.json({ message: "Rental status updated" });
  } catch (err) {
    console.log("Rental status update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update rental status" });
  }
});

const RETURN_REQUEST_STAGES = ["Request Sent", "Item Received", "Return Confirmed", "Returned"];

const randomRequestId = () => crypto.randomBytes(8).toString("hex");

const normalizeReturnStage = (value) => {
  const text = String(value || "").trim();
  if (!text) return "Request Sent";
  const normalized = text.toLowerCase();
  const match = RETURN_REQUEST_STAGES.find((s) => s.toLowerCase() === normalized);
  return match || "Request Sent";
};

app.get("/api/admin/returns/requests", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT request_id, order_id, rental_id, customer, customer_email, product_name, rental_end_date,
             return_reason, condition_reported, notes, stage, created_at, updated_at
      FROM rental_return_requests
      ORDER BY id DESC
      `
    );

    const requests = rows.map((row) => ({
      id: String(row.request_id || ""),
      request_id: String(row.request_id || ""),
      orderId: String(row.order_id || ""),
      rentalId: String(row.rental_id || ""),
      customerName: String(row.customer || "Customer"),
      customerEmail: normalizeScopedEmail(row.customer_email),
      productName: String(row.product_name || ""),
      rentalEndDate: row.rental_end_date,
      returnReason: String(row.return_reason || ""),
      conditionReported: String(row.condition_reported || ""),
      notes: String(row.notes || ""),
      stage: normalizeReturnStage(row.stage),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json({ requests });
  } catch (err) {
    console.log("Return requests fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch return requests" });
  }
});

app.post("/api/returns/request", async (req, res) => {
  try {
    const rentalId = String(req.body?.rentalId || req.body?.rental_id || "").trim() || null;
    const orderId = String(req.body?.orderId || req.body?.order_id || "").trim() || null;
    const customer = String(req.body?.customerName || req.body?.customer || "").trim() || "Customer";
    const customerEmail = normalizeEmail(req.body?.customerEmail);
    const productName = String(req.body?.productName || req.body?.product || "").trim();
    const returnReason = String(req.body?.returnReason || "").trim();
    const conditionReported = String(req.body?.conditionReported || "").trim();
    const notes = String(req.body?.notes || "").trim() || null;
    const rentalEndDateRaw = String(req.body?.rentalEndDate || req.body?.rental_end_date || "").trim();

    if (!productName || !returnReason || !conditionReported) {
      return res.status(400).json({ message: "productName, returnReason and conditionReported are required" });
    }

    let rentalEndDate = null;
    if (rentalEndDateRaw) {
      const d = new Date(rentalEndDateRaw);
      rentalEndDate = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }

    const now = new Date();
    const requestId = `RR-${randomRequestId()}`;

    await queryAsync(
      `
      INSERT INTO rental_return_requests
        (request_id, order_id, rental_id, customer, customer_email, product_name, rental_end_date,
         return_reason, condition_reported, notes, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        requestId,
        orderId,
        rentalId,
        customer,
        customerEmail || null,
        productName,
        rentalEndDate,
        returnReason,
        conditionReported,
        notes,
        "Request Sent",
        now,
        now,
      ]
    );

    try {
      const safeOrderId = String(orderId || "").trim();
      const safeRentalId = String(rentalId || "").trim();
      if (safeOrderId) {
        await queryAsync("UPDATE rental_orders SET status = ? WHERE order_id = ?", ["return_requested", safeOrderId]);
      } else if (safeRentalId) {
        await queryAsync("UPDATE rental_orders SET status = ? WHERE rental_id = ?", ["return_requested", safeRentalId]);
      }
    } catch {
      // ignore status sync failures for request creation response
    }

    try {
      const lookupId = orderId || rentalId;
      if (lookupId) {
        const rentalRows = await queryAsync(
          "SELECT items FROM rental_orders WHERE order_id = ? LIMIT 1",
          [lookupId]
        );
        if (rentalRows.length) {
          let parsedItems = [];
          try {
            const maybe = JSON.parse(String(rentalRows[0].items || "[]"));
            parsedItems = Array.isArray(maybe) ? maybe : [];
          } catch {
            parsedItems = [];
          }

          const ownerEmails = await getOwnerEmailsForItems(parsedItems);
          for (const ownerEmail of ownerEmails) {
            const prefs = await readOwnerNotificationPrefsDb(ownerEmail);
            if (!prefs.returnRequested) continue;
            await createOwnerNotification({
              ownerEmail,
              type: "return_requested",
              title: "Return requested",
              body: `${customer} requested a return for ${productName}.`,
              meta: { requestId, orderId, rentalId, productName, customer, customerEmail },
            });
          }
        }
      }
    } catch {
      // ignore notification failures
    }

    return res.json({
      message: "Return request created",
      request: {
        id: requestId,
        request_id: requestId,
        orderId: orderId || "",
        rentalId: rentalId || "",
        customerName: customer,
        customerEmail,
        productName,
        rentalEndDate,
        returnReason,
        conditionReported,
        notes: notes || "",
        stage: "Request Sent",
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    console.log("Return request create error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to create return request" });
  }
});

app.patch("/api/admin/returns/requests/:requestId/stage", async (req, res) => {
  try {
    const requestId = String(req.params?.requestId || "").trim();
    const stage = normalizeReturnStage(req.body?.stage);
    if (!requestId) return res.status(400).json({ message: "requestId is required" });

    const now = new Date();
    const result = await queryAsync(
      "UPDATE rental_return_requests SET stage = ?, updated_at = ? WHERE request_id = ?",
      [stage, now, requestId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Return request not found" });

    return res.json({ message: "Return request updated", stage });
  } catch (err) {
    console.log("Return request stage update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update return request" });
  }
});

app.post("/api/admin/buy-orders/order-event", async (req, res) => {
  try {
    const orderId = String(req.body?.order_id || "").trim();
    if (!orderId) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const customer = String(req.body?.customer || "").trim() || "Customer";
    const customerEmail = normalizeEmail(req.body?.customerEmail ?? req.body?.customer_email ?? req.body?.email);
    const itemsPayload = Array.isArray(req.body?.items) ? req.body.items : [];
    const itemsText = JSON.stringify(itemsPayload);
    const amount = Math.max(0, Number(req.body?.amount || 0));
    const status = String(req.body?.status || "Pending").trim() || "Pending";
    const dateValue = String(req.body?.date || "").trim();
    const date = dateValue ? new Date(dateValue) : new Date();
    const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);

    const existing = await queryAsync("SELECT id FROM buy_orders WHERE order_id = ? LIMIT 1", [orderId]);
    if (existing.length > 0) {
      await queryAsync(
        "UPDATE buy_orders SET customer = ?, customer_email = ?, items = ?, amount = ?, status = ?, date = ? WHERE id = ?",
        [customer, customerEmail, itemsText, amount, status, mysqlDate, existing[0].id]
      );
    } else {
      await queryAsync(
        "INSERT INTO buy_orders (order_id, customer, customer_email, items, amount, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [orderId, customer, customerEmail, itemsText, amount, status, mysqlDate]
      );
    }

    try {
      const purchasedProductIds = extractProductIdsFromItems(itemsPayload, { mode: "buy" });
      if (purchasedProductIds.length) {
        const now = new Date();
        await queryAsync("UPDATE products SET stock = ?, is_collection = 0, updated_at = ? WHERE id IN (?)", [
          normalizeStockForDb(false),
          now,
          purchasedProductIds,
        ]);
      }
    } catch (err) {
      console.log("Purchased product removal warning:", err.sqlMessage || err.message);
    }

    await createAdminNotification({
      type: "new_buy_order",
      title: "New buy order",
      body: `Order ${orderId} was placed by ${customer}.`,
      meta: { orderId, customer, customerEmail, amount, status, type: "Buy" },
    });

    try {
      const ownerEmails = await getOwnerEmailsForItems(itemsPayload);
      for (const ownerEmail of ownerEmails) {
        const prefs = await readOwnerNotificationPrefsDb(ownerEmail);
        if (!prefs.newOrder) continue;
        await createOwnerNotification({
          ownerEmail,
          type: "new_order",
          title: "New order received",
          body: `Order ${orderId} was placed by ${customer}.`,
          meta: { orderId, type: "Buy", amount, status, customer },
        });
      }
    } catch {
      // ignore notification failures
    }

    return res.json({ message: "Buy order stored" });
  } catch (err) {
    console.log("Buy order save error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to store buy order" });
  }
});

app.get("/api/products/:id/rental-availability", async (req, res) => {
  try {
    const rawId = String(req.params?.id || "").trim();
    const productId = Math.floor(Number(rawId));
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ message: "Valid product id is required" });
    }

    const pickupDate = normalizeIsoDateOnly(req.query?.pickupDate ?? req.query?.pickup_date ?? req.query?.pickup);
    const returnDate = normalizeIsoDateOnly(req.query?.returnDate ?? req.query?.return_date ?? req.query?.return);
    if (!pickupDate || !returnDate) {
      return res.status(400).json({ message: "pickupDate and returnDate are required (YYYY-MM-DD)" });
    }
    if (returnDate < pickupDate) {
      return res.status(400).json({ message: "returnDate cannot be before pickupDate" });
    }

    const conflict = await findRentalAvailabilityConflict({
      productIds: [productId],
      pickupDate,
      returnDate,
      excludeOrderId: "",
    });

    return res.json({
      productId,
      pickupDate,
      returnDate,
      available: !conflict,
      conflict: conflict || null,
    });
  } catch (err) {
    console.log("Rental availability check error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to check rental availability" });
  }
});

app.post("/api/admin/buy-orders/sync", async (req, res) => {
  try {
    const incomingOrders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    let processed = 0;

    for (const rawOrder of incomingOrders) {
      const orderId = String(rawOrder?.order_id || rawOrder?.orderId || rawOrder?.id || "").trim();
      if (!orderId) continue;

      const rawType = String(rawOrder?.type || "buy").trim().toLowerCase();
      const itemsPayload = Array.isArray(rawOrder?.items) ? rawOrder.items : [];
      const buyItems = itemsPayload.filter((item) => String(item?.mode || "buy").trim().toLowerCase() === "buy");
      const hasAnyBuyData = rawType === "buy" || rawType === "mixed" || buyItems.length > 0;
      if (!hasAnyBuyData) continue;

      const customer = String(rawOrder?.customer || rawOrder?.name || "Customer").trim() || "Customer";
      const customerEmail = normalizeEmail(rawOrder?.customerEmail ?? rawOrder?.customer_email ?? rawOrder?.email);
      const itemsText = JSON.stringify(buyItems.length > 0 ? buyItems : itemsPayload);
      const amount = Math.max(0, Number(rawOrder?.amount ?? rawOrder?.total ?? 0));
      const status = String(rawOrder?.status || "Pending").trim() || "Pending";
      const dateValue = String(rawOrder?.date || "").trim();
      const date = dateValue ? new Date(dateValue) : new Date();
      const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);

      const existing = await queryAsync("SELECT id FROM buy_orders WHERE order_id = ? LIMIT 1", [orderId]);
      if (existing.length > 0) {
        await queryAsync(
          "UPDATE buy_orders SET customer = ?, customer_email = ?, items = ?, amount = ?, status = ?, date = ? WHERE id = ?",
          [customer, customerEmail, itemsText, amount, status, mysqlDate, existing[0].id]
        );
      } else {
        await queryAsync(
          "INSERT INTO buy_orders (order_id, customer, customer_email, items, amount, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [orderId, customer, customerEmail, itemsText, amount, status, mysqlDate]
        );
      }

      processed += 1;
    }

    return res.json({ message: "Buy orders synced", processed });
  } catch (err) {
    console.log("Buy orders sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync buy orders" });
  }
});

app.get("/api/admin/buy-orders", async (_req, res) => {
  try {
    const rows = await queryAsync(
      "SELECT id, order_id, customer, items, amount, status, date FROM buy_orders ORDER BY id DESC"
    );

    const parsed = rows.map((row) => {
      let parsedItems = [];
      try {
        const maybeItems = JSON.parse(String(row.items || "[]"));
        parsedItems = Array.isArray(maybeItems) ? maybeItems : [];
      } catch {
        parsedItems = [];
      }

      return {
        id: row.id,
        order_id: String(row.order_id || ""),
        customer: String(row.customer || "Customer"),
        items: parsedItems,
        amount: Number(row.amount || 0),
        status: String(row.status || "Pending"),
        date: row.date,
      };
    });

    const productIds = new Set();
    for (const order of parsed) {
      const ids = extractProductIdsFromItems(order.items);
      for (const id of ids) productIds.add(id);
    }

    const ownerByProductId = new Map();
    if (productIds.size > 0) {
      const products = await queryAsync(
        `
        SELECT
          p.id,
          COALESCE(NULLIF(p.owner_name, ''), NULLIF(u.name, ''), p.owner_email) AS owner_label
        FROM products p
        LEFT JOIN clerk_users u ON LOWER(u.email) = LOWER(p.owner_email)
        WHERE p.id IN (?)
        `,
        [Array.from(productIds)]
      );
      for (const product of Array.isArray(products) ? products : []) {
        const id = Number(product?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const label = String(product?.owner_label || "").trim();
        if (label) ownerByProductId.set(Math.floor(id), label);
      }
    }

    const orders = parsed.map((order) => {
      const ownerNames = deriveOwnerLabelsForItems(order.items, ownerByProductId);
      const ownerName = summarizeOwners(ownerNames);
      return ownerName ? { ...order, ownerName, owner: ownerName } : order;
    });

    return res.json({ orders });
  } catch (err) {
    console.log("Buy orders fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch buy orders" });
  }
});

app.patch("/api/admin/buy-orders/:orderId/status", async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!orderId || !status) {
      return res.status(400).json({ message: "orderId and status are required" });
    }

    const result = await queryAsync("UPDATE buy_orders SET status = ? WHERE order_id = ?", [status, orderId]);
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Buy order not found" });
    }

    return res.json({ message: "Buy order status updated" });
  } catch (err) {
    console.log("Buy order status update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update buy order status" });
  }
});

app.post("/api/admin/all-orders/order-event", async (req, res) => {
  try {
    const orderId = String(req.body?.order_id || req.body?.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const customer = String(req.body?.customer || "Customer").trim() || "Customer";
    const customerEmail = normalizeEmail(req.body?.customerEmail ?? req.body?.customer_email ?? req.body?.email);
    const orderType = String(req.body?.type || "Buy").trim() || "Buy";
    const itemsPayload = Array.isArray(req.body?.items) ? req.body.items : [];
    const itemsText = JSON.stringify(itemsPayload);
    const total = Math.max(0, Number(req.body?.total || req.body?.amount || 0));
    const status = String(req.body?.status || "Pending").trim() || "Pending";
    const dateValue = String(req.body?.date || "").trim();
    const date = dateValue ? new Date(dateValue) : new Date();
    const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
    const { city, address } = extractOrderCityAndAddress(req.body);

    const existing = await queryAsync("SELECT id FROM all_order WHERE order_id = ? LIMIT 1", [orderId]);
    if (existing.length > 0) {
      await queryAsync(
        "UPDATE all_order SET customer = ?, customer_email = ?, city = ?, address = ?, type = ?, items = ?, total = ?, status = ?, date = ? WHERE id = ?",
        [customer, customerEmail, city || null, address || null, orderType, itemsText, total, status, mysqlDate, existing[0].id]
      );
    } else {
      await queryAsync(
        "INSERT INTO all_order (order_id, customer, customer_email, city, address, type, items, total, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [orderId, customer, customerEmail, city || null, address || null, orderType, itemsText, total, status, mysqlDate]
      );
    }

    await upsertDashboardOrder({
      orderId,
      customer,
      type: orderType,
      amount: total,
      status,
    });

    try {
      const purchasedProductIds = extractProductIdsFromItems(itemsPayload, { mode: "buy" });
      if (purchasedProductIds.length) {
        const now = new Date();
        await queryAsync("UPDATE products SET stock = ?, is_collection = 0, updated_at = ? WHERE id IN (?)", [
          normalizeStockForDb(false),
          now,
          purchasedProductIds,
        ]);
      }
    } catch (err) {
      console.log("All order purchased product removal warning:", err.sqlMessage || err.message);
    }

    try {
      const ownerEmails = await getOwnerEmailsForItems(itemsPayload);
      for (const ownerEmail of ownerEmails) {
        const prefs = await readOwnerNotificationPrefsDb(ownerEmail);
        if (!prefs.newOrder) continue;
        await createOwnerNotification({
          ownerEmail,
          type: "new_order",
          title: "New order received",
          body: `Order ${orderId} was placed by ${customer}.`,
          meta: { orderId, type: orderType, amount: total, status, customer },
        });
      }
    } catch {
      // ignore notification failures
    }

    return res.json({ message: "All order stored" });
  } catch (err) {
    console.log("All order save error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to store all order" });
  }
});

app.post("/api/admin/all-orders/sync", async (req, res) => {
  try {
    const incomingOrders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    let processed = 0;

    for (const rawOrder of incomingOrders) {
      const orderId = String(rawOrder?.order_id || rawOrder?.orderId || rawOrder?.id || "").trim();
      if (!orderId) continue;

      const customer = String(rawOrder?.customer || "Customer").trim() || "Customer";
      const customerEmail = normalizeEmail(rawOrder?.customerEmail ?? rawOrder?.customer_email ?? rawOrder?.email);
      const orderType = String(rawOrder?.type || "Buy").trim() || "Buy";
      const itemsPayload = Array.isArray(rawOrder?.items) ? rawOrder.items : [];
      const itemsText = JSON.stringify(itemsPayload);
      const total = Math.max(0, Number(rawOrder?.total ?? rawOrder?.amount ?? 0));
      const status = String(rawOrder?.status || "Pending").trim() || "Pending";
      const dateValue = String(rawOrder?.date || "").trim();
      const date = dateValue ? new Date(dateValue) : new Date();
      const mysqlDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
      const { city, address } = extractOrderCityAndAddress(rawOrder);

      const existing = await queryAsync("SELECT id FROM all_order WHERE order_id = ? LIMIT 1", [orderId]);
      if (existing.length > 0) {
        await queryAsync(
          "UPDATE all_order SET customer = ?, customer_email = ?, city = ?, address = ?, type = ?, items = ?, total = ?, status = ?, date = ? WHERE id = ?",
          [customer, customerEmail, city || null, address || null, orderType, itemsText, total, status, mysqlDate, existing[0].id]
        );
      } else {
        await queryAsync(
          "INSERT INTO all_order (order_id, customer, customer_email, city, address, type, items, total, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [orderId, customer, customerEmail, city || null, address || null, orderType, itemsText, total, status, mysqlDate]
        );
      }

      await upsertDashboardOrder({
        orderId,
        customer,
        type: orderType,
        amount: total,
        status,
      });

      processed += 1;
    }

    return res.json({ message: "All orders synced", processed });
  } catch (err) {
    console.log("All orders sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync all orders" });
  }
});

app.get("/api/admin/all-orders", async (_req, res) => {
  try {
    const rows = await queryAsync(
      "SELECT id, order_id, customer, type, items, total, status, date FROM all_order ORDER BY id DESC"
    );

    const parsed = rows.map((row) => {
      let parsedItems = [];
      try {
        const maybeItems = JSON.parse(String(row.items || "[]"));
        parsedItems = Array.isArray(maybeItems) ? maybeItems : [];
      } catch {
        parsedItems = [];
      }

      return {
        db_id: row.id,
        id: String(row.order_id || ""),
        order_id: String(row.order_id || ""),
        customer: String(row.customer || "Customer"),
        type: String(row.type || "Buy"),
        items: parsedItems,
        total: Number(row.total || 0),
        status: String(row.status || "Pending"),
        date: row.date,
      };
    });

    const productIds = new Set();
    for (const order of parsed) {
      const ids = extractProductIdsFromItems(order.items);
      for (const id of ids) productIds.add(id);
    }

    const ownerByProductId = new Map();
    if (productIds.size > 0) {
      const products = await queryAsync(
        `
        SELECT
          p.id,
          COALESCE(NULLIF(p.owner_name, ''), NULLIF(u.name, ''), p.owner_email) AS owner_label
        FROM products p
        LEFT JOIN clerk_users u ON LOWER(u.email) = LOWER(p.owner_email)
        WHERE p.id IN (?)
        `,
        [Array.from(productIds)]
      );
      for (const product of Array.isArray(products) ? products : []) {
        const id = Number(product?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const label = String(product?.owner_label || "").trim();
        if (label) ownerByProductId.set(Math.floor(id), label);
      }
    }

    const orders = parsed.map((order) => {
      const ownerNames = deriveOwnerLabelsForItems(order.items, ownerByProductId);
      const ownerName = summarizeOwners(ownerNames);
      return ownerName ? { ...order, ownerName, owner: ownerName } : order;
    });

    return res.json({ orders });
  } catch (err) {
    console.log("All orders fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch all orders" });
  }
});

app.patch("/api/admin/all-orders/:orderId/status", async (req, res) => {
  try {
    const orderId = String(req.params?.orderId || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!orderId || !status) {
      return res.status(400).json({ message: "orderId and status are required" });
    }

    const existingRows = await queryAsync(
      "SELECT order_id, status, customer_email, customer FROM all_order WHERE order_id = ? LIMIT 1",
      [orderId]
    );
    if (!existingRows.length) return res.status(404).json({ message: "Order not found" });
    const existing = existingRows[0] || {};
    const previousStatus = String(existing.status || "").trim();

    const result = await queryAsync("UPDATE all_order SET status = ? WHERE order_id = ?", [status, orderId]);
    if (!result.affectedRows) return res.status(404).json({ message: "Order not found" });

    await queryAsync("UPDATE dashboard SET status = ? WHERE order_id = ?", [status, orderId]);
    await queryAsync("UPDATE admin_dashboard SET status = ? WHERE order_id = ?", [status, orderId]);

    const email = normalizeEmail(existing.customer_email);
    if (email && previousStatus.toLowerCase() !== status.toLowerCase()) {
      const identityKey = `email:${email}`;
      const prefs = await readUserNotificationPrefsDb({ identityKey });
      if (prefs.orderConfirmation) {
        await createUserNotification({
          identityKey,
          email,
          clerkId: null,
          type: "order_status",
          title: "Order update",
          body: `Order ${String(existing.order_id || orderId)} is now ${status}.`,
          meta: {
            orderId: String(existing.order_id || orderId),
            from: previousStatus || null,
            to: status,
            customer: String(existing.customer || "").trim() || null,
          },
        });
      }
    }

    return res.json({ message: "Order status updated" });
  } catch (err) {
    console.log("All order status update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update order status" });
  }
});

app.get("/api/admin/products", async (_req, res) => {
  try {
    const rows = await queryAsync(
      `
      SELECT
        p.id, p.product_name, p.category, p.rent_price, p.buy_price, p.stock, p.image_url, p.image_urls,
        p.availability_type, p.is_hero, p.is_category_highlight, p.is_featured, p.is_collection,
        p.description, p.occasion, p.size, p.color,
        COALESCE(NULLIF(p.city, ''), u.city, '') AS city,
        p.owner_email, p.owner_name, p.is_draft, p.created_at, p.updated_at
      FROM products p
      LEFT JOIN clerk_users u ON LOWER(u.email) = LOWER(p.owner_email)
      ORDER BY p.id DESC
      `
    );

    const products = rows.map((row) => ({
      ...(() => {
        const { images, primaryImage } = parseImagesFromDb(row);
        return { image: primaryImage, images };
      })(),
      id: String(row.id),
      name: String(row.product_name || ""),
      category: String(row.category || "Jewellery"),
      availabilityType: String(row.availability_type || "All"),
      description: row.description === null || row.description === undefined ? "" : String(row.description),
      occasion: row.occasion === null || row.occasion === undefined ? "" : String(row.occasion),
      size: row.size === null || row.size === undefined ? "" : String(row.size),
      color: row.color === null || row.color === undefined ? "" : String(row.color),
      city: row.city === null || row.city === undefined ? "" : String(row.city),
      ownerEmail: row.owner_email === null || row.owner_email === undefined ? "" : String(row.owner_email),
      ownerName: row.owner_name === null || row.owner_name === undefined ? "" : String(row.owner_name),
      rentPrice: Number(row.rent_price || 0),
      buyPrice: Number(row.buy_price || 0),
      inStock: stockToBoolean(row.stock),
      isDraft: flagToBoolean(row.is_draft),
      isHero: flagToBoolean(row.is_hero),
      isCategoryHighlight: flagToBoolean(row.is_category_highlight),
      isFeatured: flagToBoolean(row.is_featured),
      isCollection: flagToBoolean(row.is_collection),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    }));

    return res.json({ products });
  } catch (err) {
    console.log("Products fetch error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to fetch products",
      ...(debug
        ? {
            error: err.sqlMessage || err.message,
            code: err.code,
          }
        : {}),
    });
  }
});

app.get("/api/products/related/:id", async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    const limitRaw = Number(req.query?.limit || 6);
    const limit = Math.max(4, Math.min(8, Number.isFinite(limitRaw) ? limitRaw : 6));

    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const currentRows = await queryAsync("SELECT category FROM products WHERE id = ? LIMIT 1", [id]);
    if (!currentRows.length) {
      return res.json({ products: [] });
    }

    const category = String(currentRows[0]?.category || "").trim();
    if (!category) {
      return res.json({ products: [] });
    }

    let rows = await queryAsync(
      `
      SELECT id, product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_hero, is_category_highlight, is_featured, is_collection, description, created_at, updated_at
      FROM products
      WHERE LOWER(TRIM(category)) = LOWER(TRIM(?)) AND id <> ? AND stock <> '0'
      ORDER BY is_featured DESC, created_at DESC, id DESC
      LIMIT ?
      `,
      [category, id, limit]
    );

    if (!rows.length) {
      rows = await queryAsync(
        `
        SELECT id, product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_hero, is_category_highlight, is_featured, is_collection, description, created_at, updated_at
        FROM products
        WHERE id <> ? AND stock <> '0'
        ORDER BY is_featured DESC, created_at DESC, id DESC
        LIMIT ?
        `,
        [id, limit]
      );
    }

    const products = rows
      .map((row) => ({
        ...(() => {
          const { images, primaryImage } = parseImagesFromDb(row);
          return { image: primaryImage, images };
        })(),
        id: String(row.id),
        name: String(row.product_name || ""),
        category: String(row.category || "Jewellery"),
        availabilityType: String(row.availability_type || "All"),
        description: row.description === null || row.description === undefined ? "" : String(row.description),
        rentPrice: Number(row.rent_price || 0),
        buyPrice: Number(row.buy_price || 0),
        inStock: stockToBoolean(row.stock),
        isHero: flagToBoolean(row.is_hero),
        isCategoryHighlight: flagToBoolean(row.is_category_highlight),
        isFeatured: flagToBoolean(row.is_featured),
        isCollection: flagToBoolean(row.is_collection),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      }))
      .filter((item) => item.inStock);

    return res.json({ products });
  } catch (err) {
    console.log("Related products fetch error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to fetch related products" });
  }
});

app.post("/api/admin/products", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const { images, primaryImage } = resolveImagesForDb(req.body);
    const category = String(req.body?.category || "Jewellery").trim() || "Jewellery";
    const availabilityType = String(req.body?.availabilityType || "All").trim() || "All";
    const description = String(req.body?.description || "").trim();
    const occasion = String(req.body?.occasion || "").trim();
    const size = String(req.body?.size || "").trim();
    const color = String(req.body?.color || "").trim();
    const city = String(req.body?.city || "").trim();
    const rentPrice = Math.max(0, Number(req.body?.rentPrice || 0));
    const buyPrice = Math.max(0, Number(req.body?.buyPrice || 0));
    const stock = normalizeStockForDb(req.body?.inStock);
    const isDraft = normalizeBooleanFlag(req.body?.isDraft);
    const isHero = normalizeBooleanFlag(req.body?.isHero);
    const isCategoryHighlight = normalizeBooleanFlag(req.body?.isCategoryHighlight);
    const isFeatured = normalizeBooleanFlag(req.body?.isFeatured);
    const isCollection = req.body?.isCollection === undefined ? 1 : normalizeBooleanFlag(req.body?.isCollection);
    const now = new Date();

    if (!name || !primaryImage) {
      return res.status(400).json({ message: "name and image are required" });
    }

    const result = await queryAsync(
      `
      INSERT INTO products
      (product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_draft, is_hero, is_category_highlight, is_featured, is_collection, description, occasion, size, color, city, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name,
        category,
        rentPrice,
        buyPrice,
        stock,
        primaryImage,
        JSON.stringify(images),
        availabilityType,
        isDraft,
        isHero,
        isCategoryHighlight,
        isFeatured,
        isCollection,
        description,
        occasion,
        size,
        color,
        city,
        now,
        now,
      ]
    );

    return res.json({ message: "Product created", id: result.insertId });
  } catch (err) {
    console.log("Product create error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to create product" });
  }
});

app.put("/api/admin/products/:id", async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const name = String(req.body?.name || "").trim();
    const { images, primaryImage } = resolveImagesForDb(req.body);
    const category = String(req.body?.category || "Jewellery").trim() || "Jewellery";
    const availabilityType = String(req.body?.availabilityType || "All").trim() || "All";
    const description = String(req.body?.description || "").trim();
    const occasion = String(req.body?.occasion || "").trim();
    const size = String(req.body?.size || "").trim();
    const color = String(req.body?.color || "").trim();
    const city = req.body?.city === undefined ? null : String(req.body?.city || "").trim();
    const rentPrice = Math.max(0, Number(req.body?.rentPrice || 0));
    const buyPrice = Math.max(0, Number(req.body?.buyPrice || 0));
    const stock = normalizeStockForDb(req.body?.inStock);
    const isDraft = normalizeBooleanFlag(req.body?.isDraft);
    const isHero = normalizeBooleanFlag(req.body?.isHero);
    const isCategoryHighlight = normalizeBooleanFlag(req.body?.isCategoryHighlight);
    const isFeatured = normalizeBooleanFlag(req.body?.isFeatured);
    const isCollection = req.body?.isCollection === undefined ? 1 : normalizeBooleanFlag(req.body?.isCollection);
    const now = new Date();

    if (!name || !primaryImage) {
      return res.status(400).json({ message: "name and image are required" });
    }

    const result = await queryAsync(
      `
      UPDATE products
      SET product_name = ?, category = ?, rent_price = ?, buy_price = ?, stock = ?, image_url = ?, image_urls = ?, availability_type = ?, is_draft = ?, is_hero = ?, is_category_highlight = ?, is_featured = ?, is_collection = ?, description = ?, occasion = ?, size = ?, color = ?, city = COALESCE(NULLIF(?, ''), city), updated_at = ?
      WHERE id = ?
      `,
      [
        name,
        category,
        rentPrice,
        buyPrice,
        stock,
        primaryImage,
        JSON.stringify(images),
        availabilityType,
        isDraft,
        isHero,
        isCategoryHighlight,
        isFeatured,
        isCollection,
        description,
        occasion,
        size,
        color,
        city,
        now,
        id,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product updated" });
  } catch (err) {
    console.log("Product update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update product" });
  }
});

app.patch("/api/admin/products/:id/stock", async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const stock = normalizeStockForDb(req.body?.inStock);
    const now = new Date();
    const result = await queryAsync("UPDATE products SET stock = ?, updated_at = ? WHERE id = ?", [stock, now, id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product stock updated" });
  } catch (err) {
    console.log("Product stock update error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to update product stock" });
  }
});

app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    if (!id) {
      return res.status(400).json({ message: "Valid id is required" });
    }

    const result = await queryAsync("DELETE FROM products WHERE id = ?", [id]);
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product deleted" });
  } catch (err) {
    console.log("Product delete error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to delete product" });
  }
});

app.post("/api/admin/products/sync", async (req, res) => {
  try {
    const incomingProducts = Array.isArray(req.body?.products) ? req.body.products : [];
    let processed = 0;

    for (const raw of incomingProducts) {
      const legacyId = String(raw?.id || "").trim();
      const name = String(raw?.name || "").trim();
      const { images, primaryImage } = resolveImagesForDb(raw);
      const category = String(raw?.category || "Jewellery").trim() || "Jewellery";
      const availabilityType = String(raw?.availabilityType || "All").trim() || "All";
      const isHero = normalizeBooleanFlag(raw?.isHero);
      const isCategoryHighlight = normalizeBooleanFlag(raw?.isCategoryHighlight);
      const isFeatured = normalizeBooleanFlag(raw?.isFeatured);
      const isCollection = raw?.isCollection === undefined ? 1 : normalizeBooleanFlag(raw?.isCollection);
      const description = String(raw?.description || "").trim();
      const rentPrice = Math.max(0, Number(raw?.rentPrice || 0));
      const buyPrice = Math.max(0, Number(raw?.buyPrice || 0));
      const stock = normalizeStockForDb(raw?.inStock);
      const createdAt = raw?.createdAt ? new Date(raw.createdAt) : new Date();
      const updatedAt = raw?.updatedAt ? new Date(raw.updatedAt) : new Date();
      const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
      const safeUpdatedAt = Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt;

      if (!name || !primaryImage) continue;

      if (legacyId) {
        const existing = await queryAsync("SELECT id FROM products WHERE legacy_id = ? LIMIT 1", [legacyId]);
        if (existing.length > 0) {
          await queryAsync(
            `
            UPDATE products
            SET product_name = ?, category = ?, rent_price = ?, buy_price = ?, stock = ?, image_url = ?, image_urls = ?, availability_type = ?, is_hero = ?, is_category_highlight = ?, is_featured = ?, is_collection = ?, description = ?, created_at = ?, updated_at = ?
            WHERE id = ?
            `,
            [
              name,
              category,
              rentPrice,
              buyPrice,
              stock,
              primaryImage,
              JSON.stringify(images),
              availabilityType,
              isHero,
              isCategoryHighlight,
              isFeatured,
              isCollection,
              description,
              safeCreatedAt,
              safeUpdatedAt,
              existing[0].id,
            ]
          );
        } else {
          await queryAsync(
            `
            INSERT INTO products
            (legacy_id, product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_hero, is_category_highlight, is_featured, is_collection, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              legacyId,
              name,
              category,
              rentPrice,
              buyPrice,
              stock,
              primaryImage,
              JSON.stringify(images),
              availabilityType,
              isHero,
              isCategoryHighlight,
              isFeatured,
              isCollection,
              description,
              safeCreatedAt,
              safeUpdatedAt,
            ]
          );
        }
      } else {
        await queryAsync(
          `
          INSERT INTO products
          (product_name, category, rent_price, buy_price, stock, image_url, image_urls, availability_type, is_hero, is_category_highlight, is_featured, is_collection, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            name,
            category,
            rentPrice,
            buyPrice,
            stock,
            primaryImage,
            JSON.stringify(images),
            availabilityType,
            isHero,
            isCategoryHighlight,
            isFeatured,
            isCollection,
            description,
            safeCreatedAt,
            safeUpdatedAt,
          ]
        );
      }

      processed += 1;
    }

    return res.json({ message: "Products synced", processed });
  } catch (err) {
    console.log("Products sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync products" });
  }
});

app.get("/api/admin/dashboard", async (_req, res) => {
  try {
    const orderRows = await queryAsync(
      "SELECT order_id, customer, type, items, total, status, date, city, address FROM all_order ORDER BY date DESC, id DESC"
    );
    const rentalRows = await queryAsync("SELECT order_id, amount, deposit FROM rental_orders");
    const productRows = await queryAsync("SELECT category, stock FROM products");

    const orders = orderRows.map((row) => ({
      id: String(row.order_id || "").trim(),
      customer: String(row.customer || "Customer"),
      type: normalizeOrderType(row.type),
      items: parseItemsJson(row.items),
      total: Number(row.total || 0),
      status: String(row.status || "Pending"),
      date: row.date,
      city: normalizeCity(row.city) || extractCityFromAddress(row.address),
      address: normalizeAddress(row.address),
    }));

    const totalOrders = orders.length;
    const totalRentals = rentalRows.length;
    const totalRevenue = orders.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const activeProducts = productRows.filter((item) => normalizeStockForDb(item.stock) === "1").length;
    const pendingOrders = orders.filter((item) => String(item.status || "").trim().toLowerCase() === "pending").length;

    const jewelleryProducts = productRows.filter((item) => String(item.category || "") === "Jewellery").length;
    const ethnicWearProducts = productRows.filter((item) => String(item.category || "") === "Ethnic Wear").length;
    const accessoriesProducts = productRows.filter((item) => String(item.category || "") === "Accessories").length;
    const totalCatalog = productRows.length || 1;

    let buyOrdersCount = 0;
    let rentOrdersCount = 0;
    let mixedOrdersCount = 0;

    for (const order of orders) {
      const items = Array.isArray(order?.items) ? order.items : [];

      if (items.length > 0) {
        const hasRent = items.some((item) => String(item?.mode || item?.type || "").toLowerCase().includes("rent"));
        const hasBuy = items.some(
          (item) => !String(item?.mode || item?.type || "buy").toLowerCase().includes("rent")
        );

        if (hasBuy) buyOrdersCount += 1;
        if (hasRent) rentOrdersCount += 1;
        if (hasBuy && hasRent) mixedOrdersCount += 1;
        continue;
      }

      if (order.type === "Rent") rentOrdersCount += 1;
      else if (order.type === "Buy") buyOrdersCount += 1;
      else if (order.type === "Mixed") mixedOrdersCount += 1;
    }

    let buyRevenue = 0;
    let rentalRevenue = 0;

    const rentalByOrderId = new Map();
    for (const row of Array.isArray(rentalRows) ? rentalRows : []) {
      const orderId = String(row?.order_id || "").trim();
      if (!orderId) continue;
      const amount = Math.max(0, Number(row?.amount || 0));
      const deposit = Math.max(0, Number(row?.deposit || 0));
      rentalByOrderId.set(orderId, { amount, deposit });
    }

    for (const order of orders) {
      const split = splitOrderBuyRentTotals({ type: order.type, total: order.total, items: order.items });
      let rent = split.rent;

      // For rental orders, `all_order.total` includes the refundable deposit.
      // Prefer `rental_orders.amount - rental_orders.deposit` when available.
      const rentalMeta = rentalByOrderId.get(order.id);
      if (rentalMeta) {
        const deposit = Math.max(0, Number(rentalMeta.deposit || 0));
        const amount = Math.max(0, Number(rentalMeta.amount || 0));
        const depositToUse = deposit > 0 ? deposit : amount > 5000 ? 5000 : 0;
        rent = Math.max(0, amount - depositToUse);
      } else if (order.type === "Rent") {
        const rawTotal = Math.max(0, Number(order.total || 0));
        const assumedDeposit = rawTotal > 5000 ? 5000 : 0;
        rent = Math.max(0, rawTotal - assumedDeposit);
      }

      buyRevenue += split.buy;
      rentalRevenue += rent;
    }

    const recentOrders = orders.slice(0, 5);

    const todayKey = new Date().toISOString().slice(0, 10);
    let todayTotal = 0;
    let todayBuy = 0;
    let todayRent = 0;
    for (const order of orders) {
      const rawDate = order?.date;
      const dateKey =
        rawDate instanceof Date
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate || "").slice(0, 10);
      if (dateKey !== todayKey) continue;
      todayTotal += 1;
      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length > 0) {
        const hasRent = items.some((item) => String(item?.mode || item?.type || "").toLowerCase().includes("rent"));
        const hasBuy = items.some((item) => !String(item?.mode || item?.type || "buy").toLowerCase().includes("rent"));
        if (hasBuy) todayBuy += 1;
        if (hasRent) todayRent += 1;
      } else if (order.type === "Rent") {
        todayRent += 1;
      } else if (order.type === "Buy") {
        todayBuy += 1;
      }
    }

    const cityTotals = new Map();
    for (const order of orders) {
      const city = normalizeCity(order.city);
      if (!city) continue;
      cityTotals.set(city, (cityTotals.get(city) || 0) + Math.max(0, Number(order.total || 0)));
    }
    const topCityRows = Array.from(cityTotals.entries())
      .map(([city, total]) => ({ city, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    const topCities = {
      rows: topCityRows,
      max: topCityRows.length > 0 ? topCityRows[0].total : 0,
    };

    return res.json({
      metrics: {
        totalOrders,
        totalRentals,
        totalRevenue,
        activeProducts,
        pendingOrders,
        jewelleryProducts,
        ethnicWearProducts,
        accessoriesProducts,
        totalCatalog,
        buyOrdersCount,
        rentOrdersCount,
        mixedOrdersCount,
        buyRevenue,
        rentalRevenue,
      },
      recentOrders,
      todayOrders: { total: todayTotal, buy: todayBuy, rent: todayRent },
      topCities,
    });
  } catch (err) {
    console.log("Dashboard fetch error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to fetch dashboard data",
      ...(debug
        ? {
            error: err.sqlMessage || err.message,
            code: err.code,
          }
        : {}),
    });
  }
});

app.post("/api/admin/dashboard/sync", async (_req, res) => {
  try {
    const rows = await queryAsync(
      "SELECT order_id, customer, type, total, status FROM all_order ORDER BY id DESC"
    );

    let processed = 0;
    for (const row of rows) {
      await upsertDashboardOrder({
        orderId: row.order_id,
        customer: row.customer,
        type: row.type,
        amount: row.total,
        status: row.status,
      });
      processed += 1;
    }

    return res.json({ message: "Dashboard synced", processed });
  } catch (err) {
    console.log("Dashboard sync error:", err.sqlMessage || err.message);
    return res.status(500).json({ message: "Failed to sync dashboard table" });
  }
});

app.get("/api/admin/revenue/monthly", async (req, res) => {
  try {
    const monthsRaw = Number(req.query?.months || 6);
    const months = Math.max(1, Math.min(24, Number.isFinite(monthsRaw) ? Math.floor(monthsRaw) : 6));

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const startDate = start.toISOString().slice(0, 10);

    const rows = await queryAsync(
      `
      SELECT DATE_FORMAT(date, '%Y-%m') AS month_key, SUM(total) AS total
      FROM all_order
      WHERE date >= ?
      GROUP BY month_key
      ORDER BY month_key ASC
      `,
      [startDate]
    );

    const totalsByMonth = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row?.month_key || "").trim();
      if (!key) continue;
      totalsByMonth.set(key, Math.max(0, Number(row?.total || 0)));
    }

    const series = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short" });
      series.push({ key, label, total: totalsByMonth.get(key) || 0 });
    }

    return res.json({ months, series });
  } catch (err) {
    console.log("Monthly revenue fetch error:", err.sqlMessage || err.message);
    const debug = process.env.DEBUG_ERRORS === "1";
    return res.status(500).json({
      message: "Failed to fetch monthly revenue",
      ...(debug
        ? {
            error: err.sqlMessage || err.message,
            code: err.code,
          }
        : {}),
    });
  }
});

const startServer = async () => {
  try {
    await ensureProductsSchema();
    await ensureOrderTablesSchema();
    await ensureDashboardSchema();
    await ensureAdminDashboardSchema();
    await ensureClerkUsersSchema();
    await ensureDeletedAccountsSchema();
    await ensureCustomerOrderIdentitySchema();
    await ensureUserNotificationsSchema();
    await ensureUserAddressesSchema();
    await ensureAdminSettingsSchema();
    await ensureOwnerNotificationsSchema();
    await ensureAdminNotificationsSchema();
    await ensureOwnerDataSchema();
    await ensureReturnRequestsSchema();
  } catch (err) {
    console.log("Schema bootstrap error:", err?.sqlMessage || err?.message || err);
  }

  const port = Number(process.env.PORT || 5000) || 5000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer();
