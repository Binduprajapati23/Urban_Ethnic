import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  Bell,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { requestJson } from "../../utils/http";

const ADMIN_OWNER_PROFILE_KEY = "admin_owner_profile";
const ADMIN_BUSINESS_DETAILS_KEY = "admin_business_details";
const OWNER_PROFILE_META_KEY = "owner_profile_meta_v1";
const OWNER_ADDRESSES_KEY = "owner_profile_addresses_v1";
const OWNER_BANK_DETAILS_KEY = "owner_profile_bank_details_v1";
const OWNER_NOTIFICATIONS_PREFIX = "urban_ethnic_owner_notifications";
const OWNER_SHOP_STATUS_KEY = "owner_shop_status_v1";

const formatINR = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
  return value;
};

const LEGACY_OWNER_ADDRESS_STREET = /123\s+Ethnic\s+Street/i;

const readOwnerAddresses = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_ADDRESSES_KEY) || "null");
    if (!Array.isArray(raw)) return [];
    const cleaned = raw.filter(
      (a) =>
        !(
          String(a?.id || "") === "default-address" &&
          LEGACY_OWNER_ADDRESS_STREET.test(String(a?.line1 || ""))
        )
    );
    if (cleaned.length !== raw.length) {
      writeJson(OWNER_ADDRESSES_KEY, cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
};

const writeOwnerAddresses = (addresses) => writeJson(OWNER_ADDRESSES_KEY, addresses);

const formatOwnerAddress = (addr) => {
  const line1 = String(addr?.line1 || "").trim();
  const line2 = String(addr?.line2 || "").trim();
  return [line1, line2].filter(Boolean).join(", ");
};

const EMPTY_BANK_DETAILS = {
  accountHolder: "",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  upiId: "",
  payoutSchedule: "",
};

const isLegacyDummyBankPayload = (raw) => {
  if (!raw || typeof raw !== "object") return false;
  return (
    String(raw.bankName || "").trim() === "HDFC Bank" &&
    String(raw.ifsc || "").trim() === "HDFC0001234" &&
    String(raw.upiId || "").trim() === "raj@hdfcbank"
  );
};

const readOwnerBankDetails = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_BANK_DETAILS_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...EMPTY_BANK_DETAILS };
    if (isLegacyDummyBankPayload(raw)) {
      try {
        localStorage.removeItem(OWNER_BANK_DETAILS_KEY);
      } catch {
        // ignore
      }
      return { ...EMPTY_BANK_DETAILS };
    }
    return {
      ...EMPTY_BANK_DETAILS,
      accountHolder: String(raw.accountHolder || "").trim(),
      bankName: String(raw.bankName || "").trim(),
      accountNumber: String(raw.accountNumber || "").trim(),
      ifsc: String(raw.ifsc || "").trim(),
      upiId: String(raw.upiId || "").trim(),
      payoutSchedule: String(raw.payoutSchedule || "").trim(),
    };
  } catch {
    return { ...EMPTY_BANK_DETAILS };
  }
};

const writeOwnerBankDetails = (next) => writeJson(OWNER_BANK_DETAILS_KEY, next);

const maskAccountNumber = (value) => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "—";
  const last4 = digits.slice(-4);
  return `\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ${last4}`;
};

const getOwnerNotificationsKey = ({ ownerEmail, clerkId }) =>
  `${OWNER_NOTIFICATIONS_PREFIX}:${String(ownerEmail || clerkId || "guest").trim().toLowerCase()}`;

const readOwnerNotifications = ({ ownerEmail, clerkId }) => {
  try {
    const key = getOwnerNotificationsKey({ ownerEmail, clerkId });
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && typeof raw === "object") {
      return {
        newOrder: raw?.newOrder !== false,
        returnRequested: raw?.returnRequested !== false,
        returnDueTomorrow: raw?.returnDueTomorrow !== false,
        payoutProcessed: raw?.payoutProcessed !== false,
        monthlyEarnings: Boolean(raw?.monthlyEarnings),
      };
    }
  } catch {
    // ignore
  }

  try {
    const legacy = JSON.parse(localStorage.getItem("owner_notifications") || "null");
    if (legacy && typeof legacy === "object") {
      return {
        newOrder: legacy?.newOrder !== false,
        returnRequested: legacy?.returnRequested !== false,
        returnDueTomorrow: legacy?.returnDueTomorrow !== false,
        payoutProcessed: legacy?.payoutProcessed !== false,
        monthlyEarnings: Boolean(legacy?.monthlyEarnings ?? legacy?.monthlySummary),
      };
    }
  } catch {
    // ignore
  }

  return {
    newOrder: true,
    returnRequested: true,
    returnDueTomorrow: true,
    payoutProcessed: true,
    monthlyEarnings: false,
  };
};

const writeOwnerNotifications = ({ ownerEmail, clerkId }, next) => {
  const payload = {
    newOrder: Boolean(next?.newOrder),
    returnRequested: Boolean(next?.returnRequested),
    returnDueTomorrow: Boolean(next?.returnDueTomorrow),
    payoutProcessed: Boolean(next?.payoutProcessed),
    monthlyEarnings: Boolean(next?.monthlyEarnings),
  };
  try {
    const key = getOwnerNotificationsKey({ ownerEmail, clerkId });
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.removeItem("owner_notifications");
  } catch {
    // ignore
  }
  return payload;
};

const readShopStatus = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_SHOP_STATUS_KEY) || "null");
    if (raw && typeof raw === "object") return raw;
  } catch {
    // ignore
  }
  return { deactivated: false };
};

const writeShopStatus = (next) => writeJson(OWNER_SHOP_STATUS_KEY, next);

const Switch = ({ checked, onChange, disabled = false, labelId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelId}
    onClick={() => {
      if (disabled) return;
      onChange?.(!checked);
    }}
    className={[
      "w-12 h-7 rounded-full border transition relative shrink-0",
      checked ? "bg-[#111111] border-[#111111]" : "bg-black/10 border-black/10",
      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    ].join(" ")}
  >
    <span
      className={[
        "absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-sm transition",
        checked ? "right-1" : "left-1",
      ].join(" ")}
    />
  </button>
);

const getInitials = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "O";
  const parts = normalized.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
};

const defaultOwnerProfile = ({ clerkUser }) => {
  const email = String(clerkUser?.primaryEmailAddress?.emailAddress || "").trim();
  const name =
    String(clerkUser?.fullName || "").trim() ||
    `${String(clerkUser?.firstName || "").trim()} ${String(clerkUser?.lastName || "").trim()}`.trim() ||
    email ||
    "Owner";

  const savedOwner = readJson(ADMIN_OWNER_PROFILE_KEY) || {};
  const savedBiz = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
  const meta = readJson(OWNER_PROFILE_META_KEY) || {};

  const clerkCity = String(
    clerkUser?.unsafeMetadata?.city || clerkUser?.publicMetadata?.city || ""
  ).trim();

  const cityFromBusinessAddress = () => {
    const address = String(savedBiz?.address || "").trim();
    const match = address.match(/,\s*([A-Za-z\s]+)\s*\d{5,6}\s*$/);
    if (match?.[1]) return String(match[1]).trim();
    return "";
  };

  const metaCity = String(meta?.city || "").trim();
  const city = metaCity || clerkCity || cityFromBusinessAddress();

  return {
    fullName: String(savedOwner?.name || name).trim() || "Owner",
    email: String(savedOwner?.email || email).trim() || "owner@urbanethnic.in",
    phone: String(savedOwner?.phone || savedBiz?.phone || "+91 98765 43210").trim() || "+91 98765 43210",
    city,
    shopName: String(savedBiz?.name || "Urban Ethnic").trim() || "Urban Ethnic",
    memberSince: String(meta?.memberSince || "Dec 2025").trim() || "Dec 2025",
    avgRating: Number.isFinite(Number(meta?.avgRating)) ? Number(meta.avgRating) : null,
  };
};

const MenuItem = ({ active, onClick, icon, label, right }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold transition",
      active ? "bg-[#111111] text-white" : "text-[#111111] hover:bg-black/5",
    ].join(" ")}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {right || null}
  </button>
);

const OwnerProfile = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

  const [activeSection, setActiveSection] = useState("personal_info");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [addresses, setAddresses] = useState(() => readOwnerAddresses());
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressDraft, setAddressDraft] = useState({ line1: "", line2: "" });
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressDraft, setNewAddressDraft] = useState({ line1: "", line2: "" });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [bankDraft, setBankDraft] = useState(null);
  const [notifications, setNotifications] = useState(() =>
    readOwnerNotifications({
      ownerEmail: String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase(),
      clerkId: String(user?.id || "").trim().toLowerCase(),
    })
  );
  const [notificationFeed, setNotificationFeed] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const notificationSaveTimerRef = useRef(null);
  const [shopStatus, setShopStatus] = useState(() => readShopStatus());
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [ownerStats, setOwnerStats] = useState({
    totalProducts: 0,
    availableProducts: 0,
    totalOrders: 0,
    totalEarned: 0,
    thisMonthEarned: 0,
    activeRentals: 0,
    avgRating: null,
  });
  const [ownerStatsLoading, setOwnerStatsLoading] = useState(true);
  const [ownerStatsError, setOwnerStatsError] = useState("");

  const profile = defaultOwnerProfile({ clerkUser: user });
  const ownerEmail = useMemo(() => {
    const clerkEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
    if (clerkEmail) return clerkEmail;
    return String(profile.email || "").trim().toLowerCase();
  }, [profile.email, user]);
  const bankDetails = readOwnerBankDetails();

  const hasBankOnFile =
    Boolean(String(bankDetails.bankName || "").trim()) &&
    (String(bankDetails.accountNumber || "").replace(/\D/g, "").length >= 4 ||
      Boolean(String(bankDetails.upiId || "").trim()) ||
      Boolean(String(bankDetails.ifsc || "").trim()));

  const initials = getInitials(profile.fullName);

  useEffect(() => {
    if (!isLoaded || !ownerEmail) {
      setOwnerStatsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setOwnerStatsLoading(true);
    setOwnerStatsError("");
    const statsUrl = `${API_BASE}/api/owner/stats?${new URLSearchParams({ ownerEmail }).toString()}`;
    void requestJson(statsUrl)
      .then((data) => {
        if (cancelled) return;
        setOwnerStats({
          totalProducts: Number(data?.totalProducts || 0),
          availableProducts: Number(data?.availableProducts || 0),
          totalOrders: Number(data?.totalOrders || 0),
          totalEarned: Number(data?.totalEarned || 0),
          thisMonthEarned: Number(data?.thisMonthEarned || 0),
          activeRentals: Number(data?.activeRentals || 0),
          avgRating:
            data?.avgRating != null && Number.isFinite(Number(data.avgRating)) ? Number(data.avgRating) : null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setOwnerStatsError(err?.message || "Failed to load stats");
      })
      .finally(() => {
        if (!cancelled) setOwnerStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [API_BASE, isLoaded, ownerEmail]);

  const logout = async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
  };

  const savePersonalInfo = () => {
    const next = {
      ...profile,
      ...draft,
      fullName: String(draft?.fullName ?? profile.fullName).trim(),
      phone: String(draft?.phone ?? profile.phone).trim(),
      city: String(draft?.city ?? profile.city).trim(),
      memberSince: String(profile.memberSince).trim(),
      shopName: String(profile.shopName).trim(),
      email: String(profile.email).trim(),
    };

    writeJson(ADMIN_OWNER_PROFILE_KEY, {
      name: next.fullName,
      email: next.email,
      phone: next.phone,
      role: "Owner",
    });

    const existingBiz = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
    writeJson(ADMIN_BUSINESS_DETAILS_KEY, { ...existingBiz, name: next.shopName, phone: next.phone, city: next.city });

    const existingMeta = readJson(OWNER_PROFILE_META_KEY) || {};
    writeJson(OWNER_PROFILE_META_KEY, { ...existingMeta, city: next.city, memberSince: next.memberSince });

    if (user && next.city) {
      void user
        .update({
          unsafeMetadata: { ...(user.unsafeMetadata || {}), city: next.city },
        })
        .catch(() => {
          // ignore Clerk sync failures; local profile is still saved
        });
    }

    setIsEditing(false);
    setDraft(null);
  };

  const startEditAddress = (id) => {
    const current = addresses.find((a) => a.id === id);
    if (!current) return;
    setEditingAddressId(id);
    setAddressDraft({ line1: current.line1, line2: current.line2 });
  };

  const cancelEditAddress = () => {
    setEditingAddressId(null);
    setAddressDraft({ line1: "", line2: "" });
  };

  const saveEditAddress = () => {
    if (!editingAddressId) return;
    const line1 = String(addressDraft.line1 || "").trim();
    const line2 = String(addressDraft.line2 || "").trim();
    if (!line1) return;
    const next = addresses.map((a) => (a.id === editingAddressId ? { ...a, line1, line2 } : a));
    setAddresses(writeOwnerAddresses(next));

    const updated = next.find((a) => a.id === editingAddressId) || null;
    if (updated) {
      const existingBiz = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
      writeJson(ADMIN_BUSINESS_DETAILS_KEY, { ...existingBiz, address: formatOwnerAddress(updated) });
    }
    cancelEditAddress();
  };

  const deleteAddress = (id) => {
    const confirmed = window.confirm("Delete this address?");
    if (!confirmed) return;
    const removed = addresses.find((a) => a.id === id) || null;
    const next = addresses.filter((a) => a.id !== id);
    setAddresses(writeOwnerAddresses(next));

    try {
      const existingBiz = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
      const currentBizAddress = String(existingBiz?.address || "").trim();
      const removedText = formatOwnerAddress(removed);
      if (removedText && currentBizAddress === removedText) {
        const fallback = formatOwnerAddress(next[next.length - 1] || null);
        writeJson(ADMIN_BUSINESS_DETAILS_KEY, { ...existingBiz, address: fallback });
      }
    } catch {
      // ignore
    }
  };

  const cancelAddAddress = () => {
    setIsAddingAddress(false);
    setNewAddressDraft({ line1: "", line2: "" });
  };

  const saveNewAddress = () => {
    const line1 = String(newAddressDraft.line1 || "").trim();
    const line2 = String(newAddressDraft.line2 || "").trim();
    if (!line1 || !line2) {
      window.alert("Please enter street / area and city, state & pincode.");
      return;
    }
    const created = { id: `addr-${Date.now()}`, line1, line2 };
    const next = [...addresses, created];
    setAddresses(writeOwnerAddresses(next));

    const existingBiz = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
    writeJson(ADMIN_BUSINESS_DETAILS_KEY, { ...existingBiz, address: formatOwnerAddress(created) });
    cancelAddAddress();
  };

  const openAddAddress = () => {
    setEditingAddressId(null);
    setAddressDraft({ line1: "", line2: "" });
    setIsAddingAddress(true);
    setNewAddressDraft({ line1: "", line2: "" });
  };

  useEffect(() => {
    return () => {
      if (notificationSaveTimerRef.current) clearTimeout(notificationSaveTimerRef.current);
    };
  }, []);

  const queueSaveOwnerNotificationPrefs = (nextPrefs) => {
    if (!ownerEmail) return;
    if (notificationSaveTimerRef.current) clearTimeout(notificationSaveTimerRef.current);

    notificationSaveTimerRef.current = setTimeout(() => {
      void requestJson(`${API_BASE}/api/owner/notification-prefs`, {
        method: "PUT",
        body: JSON.stringify({ ownerEmail, prefs: nextPrefs }),
      }).catch(() => {
        // ignore (local fallback still exists)
      });
    }, 350);
  };

  const updateNotification = (key, value) => {
    setNotifications((prev) => {
      const next = { ...(prev || {}), [key]: Boolean(value) };
      writeOwnerNotifications({ ownerEmail, clerkId: user?.id }, next);
      queueSaveOwnerNotificationPrefs(next);
      return next;
    });
  };

  const formatNotificationDate = (value) => {
    const d = new Date(value || "");
    if (Number.isNaN(d.getTime())) return "Unknown date";
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const markAllOwnerNotificationsRead = useCallback(async () => {
    if (!ownerEmail) return;
    setUnreadCount(0);
    setNotificationFeed((prev) => (Array.isArray(prev) ? prev : []).map((n) => ({ ...n, isRead: true })));
    try {
      await requestJson(`${API_BASE}/api/owner/notifications/mark-read`, {
        method: "POST",
        body: JSON.stringify({ ownerEmail }),
      });
    } catch {
      // ignore
    }
  }, [API_BASE, ownerEmail]);

  useEffect(() => {
    if (!isLoaded) return undefined;
    if (!ownerEmail) return undefined;

    let cancelled = false;

    const loadPrefsAndFeed = async () => {
      setNotifications(
        readOwnerNotifications({
          ownerEmail,
          clerkId: user?.id,
        })
      );

      try {
        const prefRes = await requestJson(`${API_BASE}/api/owner/notification-prefs?ownerEmail=${encodeURIComponent(ownerEmail)}`);
        if (!cancelled && prefRes?.prefs) {
          writeOwnerNotifications({ ownerEmail, clerkId: user?.id }, prefRes.prefs);
          setNotifications(prefRes.prefs);
        }
      } catch {
        // keep local fallback
      }

      setNotificationError("");
      setNotificationLoading(true);
      try {
        const feedRes = await requestJson(`${API_BASE}/api/owner/notifications?ownerEmail=${encodeURIComponent(ownerEmail)}&limit=50`);
        if (cancelled) return;
        const incoming = Array.isArray(feedRes?.notifications) ? feedRes.notifications : [];
        const seen = new Set();
        const deduped = incoming.filter((n) => {
          const meta = n?.meta && typeof n.meta === "object" ? n.meta : null;
          const stableId =
            String(meta?.orderId || meta?.order_id || meta?.requestId || meta?.request_id || meta?.rentalId || meta?.rental_id || "").trim();
          const dedupeKey = String(n?.dedupeKey || meta?.dedupeKey || "").trim();
          const fingerprint =
            dedupeKey ||
            (stableId ? `${String(n?.type || "")}:${stableId}` : `${String(n?.type || "")}:${String(n?.title || "")}:${String(n?.body || "")}`);
          if (!fingerprint) return true;
          if (seen.has(fingerprint)) return false;
          seen.add(fingerprint);
          return true;
        });
        setNotificationFeed(deduped);
        setUnreadCount(Number(feedRes?.unreadCount || 0) || 0);
      } catch (err) {
        if (cancelled) return;
        setNotificationFeed([]);
        setUnreadCount(0);
        setNotificationError(err?.message || "Failed to load notifications.");
      } finally {
        if (!cancelled) setNotificationLoading(false);
      }
    };

    void loadPrefsAndFeed();
    const onFocus = () => void loadPrefsAndFeed();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [API_BASE, isLoaded, ownerEmail, user]);

  useEffect(() => {
    if (activeSection !== "notifications") return;
    if (unreadCount <= 0) return;
    void markAllOwnerNotificationsRead();
  }, [activeSection, markAllOwnerNotificationsRead, unreadCount]);

  const changePassword = async () => {
    if (!isLoaded || !user) return;
    setPasswordMessage("");
    const currentPassword = String(passwordForm.currentPassword || "");
    const newPassword = String(passwordForm.newPassword || "");
    const confirmPassword = String(passwordForm.confirmPassword || "");

    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }
    if (typeof user?.updatePassword === "function" && !currentPassword) {
      setPasswordMessage("Enter your current password.");
      return;
    }

    setPasswordBusy(true);
    try {
      if (typeof user.updatePassword === "function") {
        await user.updatePassword({ currentPassword, newPassword });
      } else if (typeof user.update === "function") {
        await user.update({ password: newPassword });
      } else {
        throw new Error("Password update is not available for this account.");
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage("Password updated.");
    } catch (err) {
      const first = err?.errors?.[0];
      const message = first?.longMessage || first?.message || err?.message || "Something went wrong. Please try again.";
      setPasswordMessage(message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const deactivateShop = () => {
    const confirmed = window.confirm("Deactivate shop? This will hide all products and pause new orders.");
    if (!confirmed) return;
    const next = { ...(shopStatus || {}), deactivated: true };
    setShopStatus(writeShopStatus(next));
  };

  const deleteAccount = async () => {
    const confirmed = window.confirm("Delete account? This action cannot be undone.");
    if (!confirmed) return;

    try {
      try {
        await fetch(`${API_BASE}/api/users/clerk-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: user?.id || "",
            email: String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase(),
          }),
        });
      } catch {
        // ignore backend failures
      }

      try {
        localStorage.removeItem("user");
      } catch {
        // ignore
      }
      if (typeof user?.delete === "function") {
        await user.delete();
      }
      await signOut();
      navigate("/", { replace: true });
    } catch {
      alert("Unable to delete account. Please try again.");
    }
  };

  const renderSavedAddressesCard = () => (
    <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
      <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
        <div className="text-2xl font-serif text-[#111111]">Saved Addresses</div>
        {isAddingAddress ? (
          <button
            type="button"
            onClick={cancelAddAddress}
            className="text-black/60 text-sm px-4 py-2 border border-black/15 rounded-xl hover:bg-black/5 transition"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={openAddAddress}
            className="h-10 px-5 rounded-xl border border-black/15 bg-[#111111] text-white text-sm font-semibold hover:bg-black transition inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Add address
          </button>
        )}
      </div>

      <div className="p-7">
        {isAddingAddress ? (
          <div className="mb-6 p-4 rounded-2xl bg-[#E6E6E6] border border-black/10 space-y-3">
            <input
              value={newAddressDraft.line1}
              onChange={(e) => setNewAddressDraft((prev) => ({ ...prev, line1: e.target.value }))}
              className="w-full max-w-[520px] h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Street / area"
            />
            <input
              value={newAddressDraft.line2}
              onChange={(e) => setNewAddressDraft((prev) => ({ ...prev, line2: e.target.value }))}
              className="w-full max-w-[520px] h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="City, state, pincode"
            />
            <button
              type="button"
              onClick={saveNewAddress}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#111111] text-white hover:bg-black transition"
            >
              Save address
            </button>
          </div>
        ) : null}

        {addresses.length === 0 && !isAddingAddress ? (
          <p className="text-sm text-black/60 mb-4">No saved addresses yet. Use Add address above to save pickup or delivery details.</p>
        ) : null}

        <div className="space-y-4">
          {addresses.map((addr) => {
            const isEditingThis = editingAddressId === addr.id;

            return (
              <div
                key={addr.id}
                className="rounded-2xl bg-[#E6E6E6] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="mt-0.5 w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-black/60" />
                  </div>
                  <div className="min-w-0">
                    {isEditingThis ? (
                      <div className="space-y-2">
                        <input
                          value={addressDraft.line1}
                          onChange={(e) => setAddressDraft((prev) => ({ ...prev, line1: e.target.value }))}
                          className="w-full max-w-[520px] h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                          placeholder="Address line 1"
                        />
                        <input
                          value={addressDraft.line2}
                          onChange={(e) => setAddressDraft((prev) => ({ ...prev, line2: e.target.value }))}
                          className="w-full max-w-[520px] h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                          placeholder="Address line 2"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="text-base font-semibold text-[#111111]">{addr.line1}</div>
                        <div className="text-sm text-black/60 mt-1">{addr.line2}</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  {isEditingThis ? (
                    <>
                      <button
                        type="button"
                        onClick={saveEditAddress}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#111111] text-white hover:bg-black transition"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditAddress}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-black/60 hover:bg-black/5 transition"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingAddress(false);
                        setNewAddressDraft({ line1: "", line2: "" });
                        startEditAddress(addr.id);
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-black/60 hover:bg-black/5 transition"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteAddress(addr.id)}
                    disabled={isEditingThis}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-[#FF4A4A] border border-[#FF4A4A]/50 hover:bg-[#FFF5F5] transition inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f7f2] p-6 lg:p-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">
        <aside className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden h-fit">
          <div className="p-7">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-[#f3f0f0] border border-black/10 flex items-center justify-center text-[#111111]/70 text-xl font-semibold">
                  {initials}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection("personal_info");
                    setIsEditing(true);
                    setDraft({ fullName: profile.fullName, phone: profile.phone, city: profile.city });
                  }}
                  className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center hover:bg-black/5 transition"
                  aria-label="Edit profile"
                >
                  <Pencil size={16} className="text-black/60" />
                </button>
              </div>

              <div className="mt-4 text-xl font-serif text-[#111111] font-bold">{profile.fullName}</div>
              <div className="mt-1 text-sm text-[#6B7280]">{profile.email}</div>
              <div className="mt-3 inline-flex px-4 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200">
                Owner
              </div>

            </div>
          </div>

          <div className="h-px bg-black/10" />

          <div className="p-5 space-y-1.5">
            <MenuItem
              active={activeSection === "personal_info"}
              onClick={() => setActiveSection("personal_info")}
              icon={<UserRound size={19} className={activeSection === "personal_info" ? "text-white/90" : "text-black/50"} />}
              label="Personal info"
            />
            <MenuItem
              active={activeSection === "my_stats"}
              onClick={() => setActiveSection("my_stats")}
              icon={<BarChart3 size={19} className={activeSection === "my_stats" ? "text-white/90" : "text-black/50"} />}
              label="My stats"
            />
            <MenuItem
              active={activeSection === "bank_details"}
              onClick={() => setActiveSection("bank_details")}
              icon={<Banknote size={19} className={activeSection === "bank_details" ? "text-white/90" : "text-black/50"} />}
              label="Bank details"
            />
            <MenuItem
              active={activeSection === "notifications"}
              onClick={() => setActiveSection("notifications")}
              icon={<Bell size={19} className={activeSection === "notifications" ? "text-white/90" : "text-black/50"} />}
              label="Notifications"
              right={
                unreadCount > 0 ? (
                  <span
                    className={[
                      "min-w-5 h-5 px-2 rounded-full text-[11px] flex items-center justify-center",
                      activeSection === "notifications" ? "bg-white/15 text-white" : "bg-rose-100 text-rose-700",
                    ].join(" ")}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null
              }
            />
            <MenuItem
              active={activeSection === "security"}
              onClick={() => setActiveSection("security")}
              icon={<Shield size={19} className={activeSection === "security" ? "text-white/90" : "text-black/50"} />}
              label="Security"
            />
          </div>

          <div className="px-6 pb-6">
            <div className="h-px bg-black/10" />
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#FF4A4A] hover:bg-[#FFF5F5] transition"
            >
              <LogOut size={19} className="text-[#FF4A4A]" />
              Sign out
            </button>
          </div>
        </aside>

        <main>
          {activeSection === "personal_info" ? (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#111111]">Personal information</div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={savePersonalInfo}
                      className="h-10 px-5 rounded-xl bg-[#111111] text-white text-sm font-semibold hover:bg-black transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setDraft(null);
                      }}
                      className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setDraft({ fullName: profile.fullName, phone: profile.phone, city: profile.city });
                    }}
                    className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition inline-flex items-center gap-2"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                )}
              </div>

              <div className="p-7">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Full name</div>
                    {isEditing ? (
                      <input
                        value={draft?.fullName ?? profile.fullName}
                        onChange={(e) => setDraft((prev) => ({ ...(prev || {}), fullName: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{profile.fullName}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Email</div>
                    <div className="text-base font-semibold text-[#111111]">{profile.email}</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Phone</div>
                    {isEditing ? (
                      <input
                        value={draft?.phone ?? profile.phone}
                        onChange={(e) => setDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{profile.phone}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">City</div>
                    {isEditing ? (
                      <input
                        value={draft?.city ?? profile.city}
                        onChange={(e) => setDraft((prev) => ({ ...(prev || {}), city: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{profile.city || "—"}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Account status</div>
                    <div>
                      <span className="inline-flex px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                        Active · Verified
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Member since</div>
                    <div className="text-base font-semibold text-[#111111]">{profile.memberSince}</div>
                  </div>
                </div>
              </div>
            </div>
              {renderSavedAddressesCard()}
          </div>
          ) : activeSection === "saved_addresses" ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-serif text-[#111111]">Your addresses</h1>
              <p className="text-sm text-black/55">Save pickup or delivery addresses for your shop. They stay on this device until you clear site data.</p>
              {renderSavedAddressesCard()}
            </div>
          ) : activeSection === "my_stats" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10">
                <div className="text-xl font-semibold text-[#111111]">My performance</div>
                <p className="text-sm text-black/55 mt-1">Numbers from your listings and orders in the database.</p>
              </div>

              <div className="p-7">
                {ownerStatsLoading ? (
                  <p className="text-sm text-black/60">Loading your stats…</p>
                ) : ownerStatsError ? (
                  <p className="text-sm text-red-700">{ownerStatsError}</p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-[#f8f7f2] border border-black/10 p-5">
                    <div className="text-sm font-semibold text-black/60">Total products</div>
                    <div className="mt-2 text-2xl font-semibold text-[#111111]">{ownerStats.totalProducts}</div>
                    <div className="mt-1 text-sm text-black/60">{ownerStats.availableProducts} available</div>
                  </div>

                  <div className="rounded-2xl bg-[#f8f7f2] border border-black/10 p-5">
                    <div className="text-sm font-semibold text-black/60">Total orders</div>
                    <div className="mt-2 text-2xl font-semibold text-[#111111]">{ownerStats.totalOrders}</div>
                    <div className="mt-1 text-sm text-black/60">All time</div>
                  </div>

                  <div className="rounded-2xl bg-[#f8f7f2] border border-black/10 p-5">
                    <div className="text-sm font-semibold text-black/60">Total earned</div>
                    <div className="mt-2 text-2xl font-semibold text-[#111111]">{formatINR(ownerStats.totalEarned)}</div>
                    <div className="mt-1 text-sm text-black/60">All time</div>
                  </div>

                  <div className="rounded-2xl bg-[#f8f7f2] border border-black/10 p-5">
                    <div className="text-sm font-semibold text-black/60">This month</div>
                    <div className="mt-2 text-2xl font-semibold text-[#111111]">
                      {formatINR(ownerStats.thisMonthEarned)}
                    </div>
                    <div className="mt-1 text-sm text-black/60">Completed orders</div>
                  </div>

                  <div className="rounded-2xl bg-[#f8f7f2] border border-black/10 p-5">
                    <div className="text-sm font-semibold text-black/60">Active rentals</div>
                    <div className="mt-2 text-2xl font-semibold text-[#111111]">{ownerStats.activeRentals}</div>
                    <div className="mt-1 text-sm text-black/60">Not yet returned</div>
                  </div>
                </div>
                )}
              </div>
            </div>
          ) : activeSection === "bank_details" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#111111]">Bank details</div>
                {isEditingBank ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = {
                          accountHolder: String(bankDraft?.accountHolder ?? bankDetails?.accountHolder ?? "").trim(),
                          bankName: String(bankDraft?.bankName ?? bankDetails?.bankName ?? "").trim(),
                          accountNumber: String(bankDraft?.accountNumber ?? bankDetails?.accountNumber ?? "").trim(),
                          ifsc: String(bankDraft?.ifsc ?? bankDetails?.ifsc ?? "").trim(),
                          upiId: String(bankDraft?.upiId ?? bankDetails?.upiId ?? "").trim(),
                          payoutSchedule: String(bankDraft?.payoutSchedule ?? bankDetails?.payoutSchedule ?? "").trim(),
                        };
                        if (!next.bankName) {
                          window.alert("Please enter your bank name.");
                          return;
                        }
                        const digits = next.accountNumber.replace(/\D/g, "");
                        if (digits.length < 4 && !next.upiId && !next.ifsc) {
                          window.alert("Enter account number (at least 4 digits), UPI ID, or IFSC code.");
                          return;
                        }
                        writeOwnerBankDetails(next);
                        setIsEditingBank(false);
                        setBankDraft(null);
                      }}
                      className="h-10 px-5 rounded-xl bg-[#111111] text-white text-sm font-semibold hover:bg-black transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingBank(false);
                        setBankDraft(null);
                      }}
                      className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingBank(true);
                      setBankDraft({ ...readOwnerBankDetails() });
                    }}
                    className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition inline-flex items-center gap-2"
                  >
                    <Pencil size={16} />
                    {hasBankOnFile ? "Edit" : "Add bank details"}
                  </button>
                )}
              </div>

              <div className="p-7">
                {!isEditingBank && !hasBankOnFile ? (
                  <p className="text-sm text-black/60 mb-6">
                    No bank details saved yet. Tap &quot;Add bank details&quot; to enter your payout information — nothing
                    is prefilled.
                  </p>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Account holder</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.accountHolder ?? bankDetails?.accountHolder ?? ""}
                        onChange={(e) => setBankDraft((prev) => ({ ...(prev || {}), accountHolder: e.target.value }))}
                        placeholder="Name as on bank account"
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">
                        {bankDetails?.accountHolder?.trim() || "—"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Bank name</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.bankName ?? bankDetails?.bankName ?? ""}
                        onChange={(e) => setBankDraft((prev) => ({ ...(prev || {}), bankName: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{bankDetails?.bankName || "—"}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Account number</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.accountNumber ?? bankDetails?.accountNumber ?? ""}
                        onChange={(e) => setBankDraft((prev) => ({ ...(prev || {}), accountNumber: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">
                        {maskAccountNumber(bankDetails?.accountNumber)}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">IFSC code</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.ifsc ?? bankDetails?.ifsc ?? ""}
                        onChange={(e) => setBankDraft((prev) => ({ ...(prev || {}), ifsc: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{bankDetails?.ifsc || "—"}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">UPI ID</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.upiId ?? bankDetails?.upiId ?? ""}
                        onChange={(e) => setBankDraft((prev) => ({ ...(prev || {}), upiId: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{bankDetails?.upiId || "—"}</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Payout schedule</div>
                    {isEditingBank ? (
                      <input
                        value={bankDraft?.payoutSchedule ?? bankDetails?.payoutSchedule ?? ""}
                        onChange={(e) =>
                          setBankDraft((prev) => ({ ...(prev || {}), payoutSchedule: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">
                        {bankDetails?.payoutSchedule || "—"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeSection === "notifications" ? (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                <div className="px-7 py-6 border-b border-black/10">
                  <div className="text-xl font-semibold text-[#111111]">Notification preferences</div>
                </div>

                <div className="divide-y divide-black/10">
                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="owner-notif-new-order" className="font-semibold text-[#111111]">
                        New order received
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">Instant alert when customer places order</div>
                    </div>
                    <Switch
                      checked={Boolean(notifications?.newOrder)}
                      onChange={(v) => updateNotification("newOrder", v)}
                      labelId="owner-notif-new-order"
                    />
                  </div>

                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="owner-notif-return-due" className="font-semibold text-[#111111]">
                        Return due tomorrow
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">Reminder 1 day before rental return date</div>
                    </div>
                    <Switch
                      checked={Boolean(notifications?.returnDueTomorrow)}
                      onChange={(v) => updateNotification("returnDueTomorrow", v)}
                      labelId="owner-notif-return-due"
                    />
                  </div>

                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="owner-notif-payout" className="font-semibold text-[#111111]">
                        Payout processed
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">When weekly payout is sent to your bank</div>
                    </div>
                    <Switch
                      checked={Boolean(notifications?.payoutProcessed)}
                      onChange={(v) => updateNotification("payoutProcessed", v)}
                      labelId="owner-notif-payout"
                    />
                  </div>

                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="owner-notif-monthly" className="font-semibold text-[#111111]">
                        Monthly earnings report
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">Email summary at end of each month</div>
                    </div>
                    <Switch
                      checked={Boolean(notifications?.monthlyEarnings)}
                      onChange={(v) => updateNotification("monthlyEarnings", v)}
                      labelId="owner-notif-monthly"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                  <div className="text-xl font-semibold text-[#111111]">Recent notifications</div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={markAllOwnerNotificationsRead}
                      className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                    >
                      Mark all as read
                    </button>
                  ) : null}
                </div>

                <div className="p-7 space-y-3">
                  {notificationLoading ? (
                    <p className="text-[#6B7280]">Loading notifications...</p>
                  ) : notificationError ? (
                    <p className="text-[#6B7280]">{notificationError}</p>
                  ) : notificationFeed.length > 0 ? (
                    notificationFeed.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-2xl border p-4 ${
                          n.isRead ? "border-black/10 bg-white" : "border-rose-200 bg-rose-50/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="text-[15px] font-semibold text-[#111111]">{n.title}</div>
                          <div className="text-xs text-[#6B7280] shrink-0">{formatNotificationDate(n.createdAt)}</div>
                        </div>
                        {n.body ? <div className="text-sm text-[#6B7280] mt-1">{n.body}</div> : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-[#6B7280]">No notifications yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeSection === "security" ? (
            <div className="space-y-6">
              <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                <div className="px-7 py-6 border-b border-black/10">
                  <div className="text-xl font-semibold text-[#111111]">Change password</div>
                </div>
                <div className="p-7">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-black/70">Current password</label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-black/70">New password</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-black/70">Confirm password</label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={passwordBusy || !isLoaded || !user}
                      className="h-11 px-6 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition disabled:opacity-60"
                    >
                      {passwordBusy ? "Updating..." : "Update password"}
                    </button>
                  </div>

                  {passwordMessage ? <div className="mt-3 text-sm text-black/60">{passwordMessage}</div> : null}
                </div>
              </div>

              <div className="rounded-[28px] bg-[#fff7f7] border border-rose-400/70 shadow-[0_18px_45px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-7 py-6 border-b border-rose-400/40">
                  <div className="text-xl font-semibold text-rose-700">Danger zone</div>
                </div>

                <div className="divide-y divide-rose-400/30">
                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#111111]">Deactivate shop</div>
                      <div className="text-sm text-black/60 mt-1">Hide all products and pause new orders</div>
                    </div>
                    <button
                      type="button"
                      onClick={deactivateShop}
                      disabled={Boolean(shopStatus?.deactivated)}
                      className="h-11 px-6 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {shopStatus?.deactivated ? "Deactivated" : "Deactivate"}
                    </button>
                  </div>

                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#111111]">Delete account</div>
                      <div className="text-sm text-black/60 mt-1">Permanently remove shop and all data</div>
                    </div>
                    <button
                      type="button"
                      onClick={deleteAccount}
                      className="h-11 px-6 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] p-10 text-[#6B7280]">
              Coming soon.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default OwnerProfile;
