import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { requestJson } from "../utils/http";
import { getUserOrderHistory } from "../utils/orderHistory";
import {
  UserRound,
  Box,
  Bell,
  Calendar,
  Settings,
  LogOut,
  Pencil,
  MapPin,
  ChevronRight,
  Shield,
  Activity,
  Users,
} from "lucide-react";

const USER_ORDERS_PREFIX = "urban_ethnic_user_orders";
const USER_RENTALS_PREFIX = "urban_ethnic_user_rentals";
const USER_WISHLIST_PREFIX = "urban_ethnic_wishlist";
const USER_CART_PREFIX = "urban_ethnic_cart";
const USER_NOTIFICATIONS_PREFIX = "urban_ethnic_user_notifications";

const getUserDisplayName = (user) => {
  const directName = String(user?.name || "").trim();
  if (directName) return directName;

  const firstName = String(user?.f_name || user?.firstName || "").trim();
  const lastName = String(user?.l_name || user?.lastName || "").trim();
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  return "Customer";
};

const getOrderStatusLabel = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "approved") return "Confirmed";
  return status || "Confirmed";
};

const isRentalOrder = (order) => String(order?.type || "").trim().toLowerCase().includes("rent");

const isRentalCompletedForCustomer = (order) => {
  const status = String(order?.status || "").trim().toLowerCase();
  if (status === "returned") return true;
  const stage = String(order?.returnStage || order?.return_stage || "").trim().toLowerCase();
  if (!stage) return false;
  // Completed for customer once owner marks item received (or later stages).
  return stage.includes("received") || stage.includes("confirm") || stage.includes("returned");
};

const isBuyCompletedForCustomer = (order) => String(order?.status || "").trim().toLowerCase() === "delivered";

const getRentalStatusLabel = (rental) => {
  if (isRentalCompletedForCustomer(rental)) return "Returned";
  const raw = String(rental?.status || "").trim();
  if (!raw) return "Active rental";
  if (raw.toLowerCase() === "active") return "Active rental";
  return raw;
};

const safeReadJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const LEGACY_PLACEHOLDER_STREET = /123\s+Ethnic\s+Street/i;

const sanitizeSavedAddresses = (list) => {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (a) =>
      !(
        String(a?.id || "") === "default-address" &&
        LEGACY_PLACEHOLDER_STREET.test(String(a?.line1 || ""))
      )
  );
};

const getUserStorageScope = (user) => {
  if (!user) return "guest";
  const role = String(user?.role || "user").trim().toLowerCase();
  const identity = String(user?.email || user?.id || "guest").trim().toLowerCase();
  return `${role}:${identity || "guest"}`;
};

const getUserNotificationsKey = (user) => `${USER_NOTIFICATIONS_PREFIX}:${getUserStorageScope(user)}`;

const readUserNotificationPrefs = (user) => {
  const raw = safeReadJson(getUserNotificationsKey(user)) || {};
  return {
    orderConfirmation: raw?.orderConfirmation !== false,
    rentalActivated: raw?.rentalActivated !== false,
    rentalReturnReminder: raw?.rentalReturnReminder !== false,
    newArrivalsCity: Boolean(raw?.newArrivalsCity),
    promotionsOffers: Boolean(raw?.promotionsOffers),
  };
};

const writeUserNotificationPrefs = (user, next) => {
  const payload = {
    orderConfirmation: Boolean(next?.orderConfirmation),
    rentalActivated: Boolean(next?.rentalActivated),
    rentalReturnReminder: Boolean(next?.rentalReturnReminder),
    newArrivalsCity: Boolean(next?.newArrivalsCity),
    promotionsOffers: Boolean(next?.promotionsOffers),
  };

  try {
    localStorage.setItem(getUserNotificationsKey(user), JSON.stringify(payload));
  } catch {
    // ignore write failures (private mode / quota)
  }

  return payload;
};

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={[
      "relative inline-flex h-8 w-14 items-center rounded-full border transition",
      checked ? "bg-[#111111] border-black/10" : "bg-black/5 border-black/10",
      "hover:bg-black/10",
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

const removeUserScopedKeys = (user) => {
  const scope = getUserStorageScope(user);
  const email = String(user?.email || "").trim().toLowerCase();

  const removeExact = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore remove failures
    }
  };

  removeExact(`${USER_ORDERS_PREFIX}:${scope}`);
  removeExact(`${USER_RENTALS_PREFIX}:${scope}`);
  removeExact(`${USER_WISHLIST_PREFIX}:${scope}`);
  removeExact(`${USER_CART_PREFIX}:${scope}`);
  removeExact(`${USER_NOTIFICATIONS_PREFIX}:${scope}`);

  if (!email) return;

  const prefixes = [USER_ORDERS_PREFIX, USER_RENTALS_PREFIX, USER_WISHLIST_PREFIX, USER_CART_PREFIX, USER_NOTIFICATIONS_PREFIX];
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    const matchedPrefix = prefixes.find((p) => key.startsWith(`${p}:`));
    if (!matchedPrefix) continue;

    if (key.endsWith(`:${email}`) || key === `${matchedPrefix}:${email}`) {
      removeExact(key);
    }
  }
};

const AccountPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const didAttemptOrdersBackfillRef = useRef(false);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  const isAdminRole = normalizedRole === "admin";
  const isAdmin = normalizedRole === "admin" || normalizedRole === "owner";

  const [profile, setProfile] = useState(() => ({
    name: getUserDisplayName(user),
    email: user?.email || "customer@email.com",
    phone: user?.phone || "+91 98765 43210",
  }));
  const [profileDraft, setProfileDraft] = useState(profile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "null");
      if (!stored || typeof stored !== "object") return;
      if (!Array.isArray(stored.addresses)) return;
      const { addresses: _addresses, ...rest } = stored;
      localStorage.setItem("user", JSON.stringify(rest));
    } catch {
      // ignore
    }
  }, []);

  const customerIdentity = useMemo(() => {
    const clerkId = String(clerkUser?.id || "").trim();
    const emailFromClerk = String(clerkUser?.primaryEmailAddress?.emailAddress || "")
      .trim()
      .toLowerCase();
    const emailFromProfile = String(profile?.email || "").trim().toLowerCase();
    return { clerkId, email: emailFromClerk || emailFromProfile };
  }, [clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, profile?.email]);

  const profileInitials = useMemo(() => {
    const parts = String(profile?.name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    const initials = parts.map((p) => p[0]?.toUpperCase()).join("");
    return initials || "C";
  }, [profile?.name]);

  const roleLabel = useMemo(() => {
    if (normalizedRole === "owner") return "Owner";
    if (normalizedRole === "admin") return "Admin";
    return "Customer";
  }, [normalizedRole]);

  const [addresses, setAddresses] = useState(() => []);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState("");

  useEffect(() => {
    const run = async () => {
      if (!customerIdentity.email && !customerIdentity.clerkId) return;

      setAddressesLoading(true);
      setAddressesError("");
      try {
        const qs = new URLSearchParams();
        if (customerIdentity.email) qs.set("email", customerIdentity.email);
        if (customerIdentity.clerkId) qs.set("clerkId", customerIdentity.clerkId);
        const res = await requestJson(`${API_BASE}/api/users/addresses?${qs.toString()}`);
        const rows = Array.isArray(res?.addresses) ? res.addresses : [];
        setAddresses(sanitizeSavedAddresses(rows));
      } catch (err) {
        console.log("Failed to load saved addresses:", err?.body || err.message);
        setAddresses([]);
        setAddressesError("Failed to load saved addresses.");
      } finally {
        setAddressesLoading(false);
      }
    };

    void run();
  }, [API_BASE, customerIdentity.clerkId, customerIdentity.email]);
  const primaryLocation = useMemo(() => {
    const line2 = String(addresses?.[0]?.line2 || "").trim();
    if (!line2) return "";
    return line2.replace(/\b\d{5,6}\b/g, "").replace(/\s{2,}/g, " ").replace(/\s*,\s*$/, "").trim();
  }, [addresses]);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ line1: "", line2: "" });
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [editingAddressDraft, setEditingAddressDraft] = useState({ line1: "", line2: "" });

  const notificationScopeUser = useMemo(
    () => ({
      role: normalizedRole || "user",
      id: String(clerkUser?.id || user?.id || "").trim() || undefined,
      email:
        String(clerkUser?.primaryEmailAddress?.emailAddress || user?.email || "")
          .trim()
          .toLowerCase() || undefined,
    }),
    [clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, normalizedRole, user?.email, user?.id]
  );

  const [notificationPrefs, setNotificationPrefs] = useState(() => readUserNotificationPrefs(notificationScopeUser));
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [isDeactivated, setIsDeactivated] = useState(Boolean(user?.deactivated));

  useEffect(() => {
    setNotificationPrefs(readUserNotificationPrefs(notificationScopeUser));
    if (!isClerkLoaded) return undefined;
    if (!customerIdentity.email && !customerIdentity.clerkId) return undefined;

    let cancelled = false;

    const loadPrefsAndNotifications = async () => {
      const qs = new URLSearchParams();
      if (customerIdentity.email) qs.set("email", customerIdentity.email);
      if (customerIdentity.clerkId) qs.set("clerkId", customerIdentity.clerkId);

      try {
        const prefsRes = await requestJson(`${API_BASE}/api/users/notification-prefs?${qs.toString()}`);
        const nextPrefs = prefsRes?.prefs || readUserNotificationPrefs(notificationScopeUser);
        if (!cancelled) setNotificationPrefs(nextPrefs);
        writeUserNotificationPrefs(notificationScopeUser, nextPrefs);
      } catch {
        // keep local fallback
      }

      setNotificationsError("");
      setNotificationsLoading(true);
      try {
        const notifRes = await requestJson(`${API_BASE}/api/users/notifications?${qs.toString()}&limit=50`);
        if (cancelled) return;
        setNotifications(Array.isArray(notifRes?.notifications) ? notifRes.notifications : []);
        setUnreadNotificationsCount(Number(notifRes?.unreadCount || 0) || 0);
      } catch (err) {
        if (cancelled) return;
        setNotifications([]);
        setUnreadNotificationsCount(0);
        setNotificationsError(err?.message || "Failed to load notifications.");
      } finally {
        if (!cancelled) setNotificationsLoading(false);
      }
    };

    void loadPrefsAndNotifications();

    const onFocus = () => void loadPrefsAndNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [API_BASE, customerIdentity.clerkId, customerIdentity.email, isClerkLoaded, notificationScopeUser]);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [userOrders, setUserOrders] = useState([]);
  const [userRentals, setUserRentals] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [rentalsLoading, setRentalsLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [rentalsError, setRentalsError] = useState("");
  const buyOrders = userOrders.filter(
    (order) => String(order?.type || "").trim().toLowerCase() === "buy"
  );
  const activeCustomerRentals = useMemo(
    () => userRentals.filter((rental) => !isRentalCompletedForCustomer(rental)),
    [userRentals]
  );
  const rentalHistory = useMemo(
    () => userRentals.filter((rental) => isRentalCompletedForCustomer(rental)),
    [userRentals]
  );

  useEffect(() => {
    if (!isClerkLoaded) return undefined;
    if (!customerIdentity.clerkId && !customerIdentity.email) return undefined;

    let cancelled = false;

    const refreshHistory = async () => {
      setOrdersError("");
      setRentalsError("");
      setOrdersLoading(true);
      setRentalsLoading(true);

      try {
        const params = new URLSearchParams();
        if (customerIdentity.clerkId) params.set("clerkId", customerIdentity.clerkId);
        if (customerIdentity.email) params.set("email", customerIdentity.email);
        const qs = params.toString();

        const [ordersResult, rentalsResult] = await Promise.allSettled([
          requestJson(`${API_BASE}/api/users/orders?${qs}`),
          requestJson(`${API_BASE}/api/users/rentals?${qs}`),
        ]);

        if (cancelled) return;

        if (ordersResult.status === "fulfilled") {
          const nextOrders = Array.isArray(ordersResult.value?.orders) ? ordersResult.value.orders : [];

          if (
            nextOrders.length === 0 &&
            customerIdentity.email &&
            !didAttemptOrdersBackfillRef.current
          ) {
            const localOrders = getUserOrderHistory();

            if (localOrders.length > 0) {
              didAttemptOrdersBackfillRef.current = true;

              await Promise.allSettled(
                localOrders.slice(0, 25).map((order) =>
                  requestJson(`${API_BASE}/api/admin/all-orders/order-event`, {
                    method: "POST",
                    body: JSON.stringify({
                      order_id: String(order?.id || "").trim(),
                      customer: String(order?.customer || "Customer").trim() || "Customer",
                      customerEmail: customerIdentity.email,
                      type: order?.type || "Buy",
                      items: Array.isArray(order?.items) ? order.items : [],
                      total: Number(order?.amount ?? order?.total ?? 0) || 0,
                      status: order?.status || "Pending",
                      date: order?.date || undefined,
                    }),
                  })
                )
              );

              try {
                const retried = await requestJson(`${API_BASE}/api/users/orders?${qs}`);
                setUserOrders(Array.isArray(retried?.orders) ? retried.orders : []);
              } catch {
                setUserOrders(nextOrders);
              }
            } else {
              setUserOrders(nextOrders);
            }
          } else {
            setUserOrders(nextOrders);
          }
        } else {
          setUserOrders([]);
          setOrdersError(ordersResult.reason?.message || "Failed to load orders");
        }

        if (rentalsResult.status === "fulfilled") {
          setUserRentals(Array.isArray(rentalsResult.value?.rentals) ? rentalsResult.value.rentals : []);
        } else {
          setUserRentals([]);
          setRentalsError(rentalsResult.reason?.message || "Failed to load rentals");
        }
      } catch (err) {
        if (cancelled) return;
        setUserOrders([]);
        setUserRentals([]);
        const msg = err?.message || "Failed to load order history";
        setOrdersError(msg);
        setRentalsError(msg);
      } finally {
        if (!cancelled) {
          setOrdersLoading(false);
          setRentalsLoading(false);
        }
      }
    };

    refreshHistory();
    window.addEventListener("focus", refreshHistory);
    return () => {
      window.removeEventListener("focus", refreshHistory);
      cancelled = true;
    };
  }, [API_BASE, customerIdentity.clerkId, customerIdentity.email, isClerkLoaded]);

  const updateStoredUser = (updates) => {
    try {
      const existing = JSON.parse(localStorage.getItem("user") || "{}") || {};
      localStorage.setItem("user", JSON.stringify({ ...existing, ...updates }));
    } catch {
      // no-op
    }
  };

  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const validTabs = isAdmin
      ? ["settings"]
      : ["orders", "buy-orders", "active-rentals", "notifications", "settings"];
    return validTabs.includes(tab) ? tab : (isAdmin ? "settings" : "orders");
  }, [location.search, isAdmin]);

  const setTab = (tab) => {
    navigate(`/account?tab=${tab}`);
  };

  useEffect(() => {
    if (isAdmin) return;
    if (activeTab !== "notifications") return;
    if (!customerIdentity.email && !customerIdentity.clerkId) return;

    setUnreadNotificationsCount(0);
    setNotifications((prev) =>
      (Array.isArray(prev) ? prev : []).map((n) => ({ ...n, isRead: true }))
    );

    void requestJson(`${API_BASE}/api/users/notifications/mark-read`, {
      method: "POST",
      body: JSON.stringify({
        email: customerIdentity.email || undefined,
        clerkId: customerIdentity.clerkId || undefined,
      }),
    }).catch(() => {
      // ignore
    });
  }, [API_BASE, activeTab, customerIdentity.clerkId, customerIdentity.email, isAdmin]);

  const logout = async () => {
    try {
      await signOut();
    } catch {
      // ignore and fall back to local cleanup
    }

    localStorage.removeItem("user");
    try {
      sessionStorage.removeItem("post_auth_redirect");
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
  };

  const startProfileEdit = () => {
    setProfileDraft(profile);
    setIsEditingProfile(true);
  };

  const cancelProfileEdit = () => {
    setProfileDraft(profile);
    setIsEditingProfile(false);
  };

  const saveProfile = () => {
    const nextProfile = {
      name: profileDraft.name.trim(),
      email: profileDraft.email.trim(),
      phone: profileDraft.phone.trim() || "+91 98765 43210",
    };

    if (!nextProfile.name || !nextProfile.email) {
      alert("Name and email are required");
      return;
    }

    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    setIsEditingProfile(false);
    updateStoredUser(nextProfile);
  };

  const addAddress = async () => {
    const line1 = addressDraft.line1.trim();
    const line2 = addressDraft.line2.trim();
    if (!line1 || !line2) {
      alert("Please fill full address details");
      return;
    }

    try {
      const res = await requestJson(`${API_BASE}/api/users/addresses`, {
        method: "POST",
        body: JSON.stringify({
          email: customerIdentity.email,
          clerkId: customerIdentity.clerkId,
          line1,
          line2,
        }),
      });

      const created = res?.address;
      if (created) {
        setAddresses((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
      } else {
        setAddresses((prev) => [{ id: `addr-${Date.now()}`, line1, line2 }, ...prev]);
      }

      setAddressDraft({ line1: "", line2: "" });
      setIsAddingAddress(false);
    } catch (err) {
      console.log("Save address error:", err?.body || err.message);
      alert("Unable to save address. Please try again.");
    }
  };

  const startAddressEdit = (address) => {
    setEditingAddressId(address.id);
    setEditingAddressDraft({ line1: address.line1 || "", line2: address.line2 || "" });
  };

  const cancelAddressEdit = () => {
    setEditingAddressId(null);
    setEditingAddressDraft({ line1: "", line2: "" });
  };

  const saveAddressEdit = async () => {
    if (!editingAddressId) return;

    const line1 = editingAddressDraft.line1.trim();
    const line2 = editingAddressDraft.line2.trim();
    if (!line1 || !line2) {
      alert("Please fill full address details");
      return;
    }

    try {
      const res = await requestJson(`${API_BASE}/api/users/addresses/${encodeURIComponent(editingAddressId)}`, {
        method: "PUT",
        body: JSON.stringify({
          email: customerIdentity.email,
          clerkId: customerIdentity.clerkId,
          line1,
          line2,
        }),
      });
      const updated = res?.address;
      if (updated) {
        setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        setAddresses((prev) => prev.map((a) => (a.id === editingAddressId ? { ...a, line1, line2 } : a)));
      }
      setEditingAddressId(null);
      setEditingAddressDraft({ line1: "", line2: "" });
    } catch (err) {
      console.log("Update address error:", err?.body || err.message);
      alert("Unable to update address. Please try again.");
    }
  };

  const deleteAddress = async (addressId) => {
    try {
      const qs = new URLSearchParams();
      if (customerIdentity.email) qs.set("email", customerIdentity.email);
      if (customerIdentity.clerkId) qs.set("clerkId", customerIdentity.clerkId);

      await requestJson(`${API_BASE}/api/users/addresses/${encodeURIComponent(addressId)}?${qs.toString()}`, {
        method: "DELETE",
      });
      setAddresses((prev) => prev.filter((address) => address.id !== addressId));
      if (editingAddressId === addressId) {
        setEditingAddressId(null);
        setEditingAddressDraft({ line1: "", line2: "" });
      }
    } catch (err) {
      console.log("Delete address error:", err?.body || err.message);
      alert("Unable to delete address. Please try again.");
    }
  };

  const toggleDeactivated = () => {
    const run = async () => {
      if (!clerkUser) return;

      if (isDeactivated) {
        try {
          await requestJson(`${API_BASE}/api/users/deactivate`, {
            method: "POST",
            body: JSON.stringify({
              clerkId: clerkUser?.id || "",
              email: String(clerkUser?.primaryEmailAddress?.emailAddress || ""),
              action: "activate",
            }),
          });
        } catch {
          // ignore and still update local
        }

        updateStoredUser({ deactivated: false, deactivatedAt: null });
        setIsDeactivated(false);
        alert("Account reactivated");
        return;
      }

      const ok = window.confirm("Deactivate your account? You can reactivate anytime from Settings.");
      if (!ok) return;

      try {
        await requestJson(`${API_BASE}/api/users/deactivate`, {
          method: "POST",
          body: JSON.stringify({
            clerkId: clerkUser?.id || "",
            email: String(clerkUser?.primaryEmailAddress?.emailAddress || ""),
            action: "deactivate",
          }),
        });
      } catch {
        // ignore and still update local
      }

      updateStoredUser({ deactivated: true, deactivatedAt: new Date().toISOString() });
      setIsDeactivated(true);
      alert("Account deactivated");
    };

    void run();
  };

  const changePassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    const currentPassword = String(passwordForm.currentPassword || "");
    const newPassword = String(passwordForm.newPassword || "");
    const confirmPassword = String(passwordForm.confirmPassword || "");

    if (!newPassword || newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (!isClerkLoaded || !clerkUser) {
      setPasswordError("Password update is not available in this build.");
      return;
    }
    if (typeof clerkUser.updatePassword === "function" && !currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }

    setPasswordBusy(true);
    try {
      if (typeof clerkUser.updatePassword === "function") {
        await clerkUser.updatePassword({ currentPassword, newPassword });
      } else if (typeof clerkUser.update === "function") {
        await clerkUser.update({ password: newPassword });
      } else {
        throw new Error("Password update is not available for this account.");
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordSuccess("Password updated.");
    } catch (err) {
      setPasswordError(
        err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Failed to update password."
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError("");
    const ok = window.confirm("Delete your account? This will permanently delete your account.");
    if (!ok) return;

    setDeleteBusy(true);
    try {
      try {
        await fetch(`${API_BASE}/api/users/clerk-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: customerIdentity.clerkId || clerkUser?.id || user?.id || "",
            email: customerIdentity.email || clerkUser?.primaryEmailAddress?.emailAddress || user?.email || "",
          }),
        });
      } catch {
        // ignore backend failures
      }

      if (isClerkLoaded && clerkUser && typeof clerkUser.delete === "function") {
        await clerkUser.delete();
      }

      try {
        await signOut();
      } catch {
        // ignore
      }

      try {
        removeUserScopedKeys(user);
        removeUserScopedKeys(notificationScopeUser);
        localStorage.removeItem("user");
      } catch {
        // ignore
      }

      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Failed to delete account.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const formatDate = (value) => {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const resolveRentalReturnDate = (rental) => {
    const directReturnDate =
      rental?.returnDate ||
      rental?.return_date ||
      rental?.returnBy ||
      rental?.return_by ||
      rental?.rentalEndDate ||
      rental?.rental_end_date;
    if (directReturnDate) return directReturnDate;

    const pickupRaw =
      rental?.pickupDate ||
      rental?.pickup_date ||
      rental?.rentalDate ||
      rental?.rental_date ||
      rental?.date;
    const pickup = new Date(pickupRaw || "");
    const totalDays = Number(rental?.totalDays || 0);
    if (Number.isNaN(pickup.getTime())) return "";

    if (Number.isFinite(totalDays) && totalDays > 0) {
      const next = new Date(pickup);
      next.setDate(next.getDate() + Math.max(0, Math.trunc(totalDays) - 1));
      return next.toISOString().slice(0, 10);
    }

    const dailyRate = Number(rental?.dailyRate || rental?.daily_rate || 0);
    const amount = Number(rental?.amount || 0);
    if (Number.isFinite(dailyRate) && dailyRate > 0 && Number.isFinite(amount) && amount > 0) {
      const derivedDays = Math.max(1, Math.round(amount / dailyRate));
      const next = new Date(pickup);
      next.setDate(next.getDate() + Math.max(0, derivedDays - 1));
      return next.toISOString().slice(0, 10);
    }

    return "";
  };

  const getDisplayItems = (order) => {
    if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
    return [
      {
        id: order?.id || "item",
        name: order?.name || "Ordered item",
        image: order?.image,
        quantity: 1,
        price: Number(order?.amount || 0),
      },
    ];
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[370px_1fr] gap-8">
          <aside
            className={`rounded-[24px] p-7 h-fit ${
              isAdminRole
                ? "bg-white border border-black/10 shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
                : "bg-[#FFFFFF] border border-[#E6E6E6]"
            }`}
          >
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto">
                <div className="w-24 h-24 rounded-full bg-[#F2EFEA] border border-black/10 flex items-center justify-center">
                  <span className="text-[28px] font-semibold text-[#111111] tracking-wide">{profileInitials}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTab("settings");
                    startProfileEdit();
                  }}
                  className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-white border border-black/10 shadow-[0_8px_18px_rgba(0,0,0,0.10)] flex items-center justify-center text-black/70 hover:text-black transition"
                  aria-label="Edit profile"
                >
                  <Pencil size={18} />
                </button>
              </div>
              <h2 className={`mt-5 text-2xl font-serif ${isAdminRole ? "text-[#111111]" : "text-[#111111]"}`}>
                {profile.name}
              </h2>
              <p className={`${isAdminRole ? "text-[#6B7280]" : "text-[#6B7280]"} text-base mt-1`}>{profile.email}</p>
              <div className="mt-4 flex justify-center">
                <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                  {roleLabel}
                </span>
              </div>
            </div>

            <div className={`my-7 h-px ${isAdminRole ? "bg-black/10" : "bg-[#E6E6E6]"}`} />

            <div className={`${isAdminRole ? "space-y-1.5" : "space-y-2"}`}>
              {isAdminRole ? (
                <>
                  <button
                    onClick={() => navigate("/admin/profile?section=my_account")}
                    className="w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold bg-[#111111] text-white"
                  >
                    <UserRound size={19} className="text-white/90" />
                    My account
                  </button>

                  <button
                    onClick={() => navigate("/admin/profile?section=platform_config")}
                    className="w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#6B7280] hover:text-[#111111] hover:bg-black/5 transition"
                  >
                    <Settings size={19} className="text-black/50" />
                    Platform config
                  </button>

                  <button
                    onClick={() => navigate("/admin/profile?section=manage_admins")}
                    className="w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#6B7280] hover:text-[#111111] hover:bg-black/5 transition"
                  >
                    <Users size={19} className="text-black/50" />
                    Manage admins
                  </button>

                  <button
                    onClick={() => navigate("/admin/profile?section=activity_log")}
                    className="w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#6B7280] hover:text-[#111111] hover:bg-black/5 transition"
                  >
                    <Activity size={19} className="text-black/50" />
                    Activity log
                  </button>

                  <button
                    onClick={() => navigate("/admin/profile?section=security")}
                    className="w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#6B7280] hover:text-[#111111] hover:bg-black/5 transition"
                  >
                    <Shield size={19} className="text-black/50" />
                    Security
                  </button>

                  <div className="pt-3">
                    <div className="h-px bg-black/10" />
                    <button
                      onClick={logout}
                      className="mt-3 w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold text-[#FF4A4A] hover:bg-[#FFF5F5] transition"
                    >
                      <LogOut size={19} className="text-[#FF4A4A]" />
                      Sign out
                    </button>
                  </div>
                </>
              ) : null}

              {!isAdminRole && !isAdmin && (
                <button
                  onClick={() => setTab("orders")}
                  className={`w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base ${
                    activeTab === "orders" ? "bg-[#111111] text-white" : "text-[#6B7280]"
                  }`}
                >
                  <Box size={23} />
                  My Orders
                </button>
              )}
              {!isAdminRole && !isAdmin && (
                <button
                  onClick={() => setTab("buy-orders")}
                  className={`w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base ${
                    activeTab === "buy-orders" ? "bg-[#111111] text-white" : "text-[#6B7280]"
                  }`}
                >
                  <Box size={23} />
                  My Buy Orders
                </button>
              )}
              {!isAdminRole && !isAdmin && (
                <button
                  onClick={() => setTab("active-rentals")}
                  className={`w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base ${
                    activeTab === "active-rentals" ? "bg-[#111111] text-white" : "text-[#6B7280]"
                  }`}
                >
                  <Calendar size={23} />
                  Active Rentals
                </button>
              )}
              {!isAdminRole && !isAdmin && (
                <button
                  onClick={() => setTab("notifications")}
                  className={`w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base ${
                    activeTab === "notifications" ? "bg-[#111111] text-white" : "text-[#6B7280]"
                  }`}
                >
                  <Bell size={23} />
                  <span className="flex-1 text-left">Notifications</span>
                  {unreadNotificationsCount > 0 && (
                    <span
                      className={`min-w-5 h-5 px-2 rounded-full text-[11px] flex items-center justify-center ${
                        activeTab === "notifications"
                          ? "bg-white/15 text-white"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                    </span>
                  )}
                </button>
              )}

              {!isAdminRole ? (
                <>
                  <button
                    onClick={() => setTab("settings")}
                    className={`w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base ${
                      activeTab === "settings" ? "bg-[#111111] text-white" : "text-[#6B7280]"
                    }`}
                  >
                    <Settings size={23} />
                    Settings
                  </button>

                  <div className="my-4 h-px bg-[#E6E6E6]" />

                  <button
                    onClick={logout}
                    className="w-full h-14 px-5 rounded-2xl flex items-center gap-3 text-base text-[#FF4A4A]"
                  >
                    <LogOut size={23} />
                    Sign Out
                  </button>
                </>
              ) : null}
            </div>
          </aside>

          <main className="space-y-7">
            {!isAdmin && activeTab === "orders" && (
              <>
                <h1 className="text-2xl font-serif text-[#111111]">Order History</h1>
                 {isDeactivated ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Your account is deactivated. Reactivate from Settings to view orders.</p>
                    </section>
                  ) : ordersLoading ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Loading your orders…</p>
                    </section>
                  ) : ordersError ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">{ordersError}</p>
                    </section>
                  ) : userOrders.length > 0 ? (
                    userOrders.map((order) => (
                      (() => {
                        const orderItems = getDisplayItems(order);
                       const firstItem = orderItems[0] || {};
                      return (
                    <section key={order.id} className="bg-[#FFFFFF] rounded-[24px] p-4 border border-[#E6E6E6]">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-[#6B7280]">Order {order.id}</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">Placed on {formatDate(order.date)}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex px-4 py-1 rounded-full text-xs bg-[#D9E6FF] text-[#2862D6]">
                            {getOrderStatusLabel(order.status)}
                          </span>
                          <p className="text-xl font-serif text-[#111111] mt-1">
                            {"\u20B9"}{Number(order.amount || 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                      <div className="my-3 h-px bg-[#E6E6E6]" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {orderItems.length <= 1 && (
                            <img
                              src={firstItem.image || order.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                              alt={firstItem.name || order.name || "Ordered item"}
                              className="w-14 h-14 rounded-xl object-cover"
                            />
                          )}
                          <div>
                            <p className="text-base font-serif text-[#111111]">
                              {orderItems.length > 1 ? `${orderItems.length} items in this order` : (firstItem.name || order.name || "Ordered item")}
                            </p>
                            {orderItems.length > 1 && (
                              <>
                                <div className="flex items-center gap-1.5 mt-2">
                                  {orderItems.slice(0, 4).map((item, index) => (
                                    <img
                                      key={`${item.id || item.name || "item"}-${index}`}
                                      src={item.image || firstItem.image || order.image}
                                      alt={item.name || "Item"}
                                      className="w-8 h-8 rounded-md object-cover border border-[#E6E6E6]"
                                    />
                                  ))}
                                  {orderItems.length > 4 && (
                                    <span className="text-[10px] text-[#6B7280] font-semibold">
                                      +{orderItems.length - 4}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#6B7280] mt-1">
                                  {orderItems.slice(0, 3).map((item) => item.name).join(", ")}
                                  {orderItems.length > 3 ? ` +${orderItems.length - 3} more` : ""}
                                </p>
                              </>
                            )}
                            <p className="text-sm text-[#6B7280]">{order.type === "Rent" ? "Rental" : "Purchase"}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (isRentalOrder(order) && isRentalCompletedForCustomer(order)) return;
                            navigate("/track-order", {
                              state: {
                                orderId: order.id,
                                product: { name: firstItem.name || order.name, image: firstItem.image || order.image },
                                items: orderItems,
                                type: order.type || "Buy",
                              },
                            });
                          }}
                          className={[
                            "text-base flex items-center gap-1",
                            isRentalOrder(order) && isRentalCompletedForCustomer(order)
                              ? "text-emerald-700 cursor-default"
                              : "text-[#111111]",
                          ].join(" ")}
                        >
                          {isRentalOrder(order) && isRentalCompletedForCustomer(order) ? (
                            "Completed"
                          ) : (
                            <>
                              Track <ChevronRight size={20} />
                            </>
                          )}
                        </button>
                      </div>
                    </section>
                      );
                    })()
                  ))
                ) : (
                  <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                    <p className="text-[#6B7280]">No orders yet.</p>
                  </section>
                )}
              </>
            )}

            {!isAdmin && activeTab === "active-rentals" && (
              <>
                <h1 className="text-2xl font-serif text-[#111111]">Active Rentals</h1>
                  {isDeactivated ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Your account is deactivated. Reactivate from Settings to view rentals.</p>
                    </section>
                  ) : rentalsLoading ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Loading your rentals…</p>
                    </section>
                  ) : rentalsError ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">{rentalsError}</p>
                    </section>
                  ) : activeCustomerRentals.length > 0 ? (
                    activeCustomerRentals.map((rental) => (
                       <section key={rental.id} className="bg-[#FFFFFF] rounded-[24px] p-4 border border-[#E6E6E6]">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <img
                              src={rental.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                              alt={rental.name || "Rental item"}
                              className="w-16 h-16 rounded-xl object-cover"
                            />
                            <div>
                              <p className="text-base font-serif text-[#111111]">{rental.name || "Rental item"}</p>
                              <p className="text-xs text-[#6B7280] mt-0.5">
                                Rental
                                {rental.dailyRate ? (
                                  <>
                                    {" "}
                                    · {"\u20B9"}
                                    {Number(rental.dailyRate || 0).toLocaleString("en-IN")}
                                  </>
                                ) : null}
                                {primaryLocation ? ` · ${primaryLocation}` : ""}
                              </p>
                              <p className="text-xs text-[#6B7280] mt-0.5">
                                Rented: {formatDate(rental.pickupDate)} Return date: {formatDate(resolveRentalReturnDate(rental))}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 self-center">
                            <span className="inline-flex px-3 py-1 rounded-full text-xs bg-[#E6E6E6] text-[#111111]">
                              {getRentalStatusLabel(rental)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                navigate("/return-request", {
                                  state: {
                                    rental,
                                    name: rental.name,
                                    dailyRate: rental.dailyRate,
                                    ownerName: "",
                                  },
                                })
                              }
                              className="h-9 px-4 rounded-xl border border-[#E6E6E6] bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                            >
                              <span className="inline-flex items-center gap-2">
                                Return this <ChevronRight size={18} />
                              </span>
                            </button>
                          </div>
                        </div>
                      </section>
                    ))
                ) : (
                  <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                    <p className="text-[#6B7280]">No active rentals yet.</p>
                  </section>
                )}

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <h2 className="text-xl font-serif text-[#111111]">Rental History</h2>
                  <p className="text-sm text-[#6B7280] mt-1">All returned and completed rental orders.</p>

                  <div className="mt-5 space-y-4">
                    {rentalHistory.length > 0 ? (
                      rentalHistory.map((rental) => (
                        <div key={`history-${rental.id}`} className="rounded-2xl border border-[#E6E6E6] bg-white p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <img
                                src={rental.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                                alt={rental.name || "Rental item"}
                                className="w-14 h-14 rounded-xl object-cover"
                              />
                              <div>
                                <p className="text-base font-serif text-[#111111]">{rental.name || "Rental item"}</p>
                                <p className="text-xs text-[#6B7280] mt-0.5">
                                  Rented: {formatDate(rental.pickupDate)} · Returned: {formatDate(resolveRentalReturnDate(rental))}
                                </p>
                              </div>
                            </div>
                            <span className="inline-flex px-3 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {getRentalStatusLabel(rental)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[#6B7280]">No rental history yet.</p>
                    )}
                  </div>
                </section>
              </>
            )}

            {!isAdmin && activeTab === "notifications" && (
              <>
                <h1 className="text-2xl font-serif text-[#111111]">Notifications</h1>

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <h2 className="text-2xl font-serif text-[#111111]">Notification preferences</h2>

                  <div className="mt-6 divide-y divide-[#E6E6E6]">
                    {[
                      {
                        key: "orderConfirmation",
                        title: "Order confirmation",
                        desc: "When your order is confirmed by owner",
                      },
                      {
                        key: "rentalActivated",
                        title: "Active rental",
                        desc: "When your rental becomes active",
                      },
                      {
                        key: "rentalReturnReminder",
                        title: "Rental return reminder",
                        desc: "1 day before return date",
                      },
                      {
                        key: "newArrivalsCity",
                        title: "New arrivals in my city",
                        desc: "When new products are added in your city",
                      },
                      {
                        key: "promotionsOffers",
                        title: "Promotions & offers",
                        desc: "Discount alerts and special events",
                      },
                    ].map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-5 py-5">
                        <div>
                          <div className="text-[15px] font-semibold text-[#111111]">{row.title}</div>
                          <div className="text-sm text-[#6B7280] mt-1">{row.desc}</div>
                        </div>
                        <Toggle
                          checked={Boolean(notificationPrefs[row.key])}
                          onChange={(next) => {
                            setNotificationPrefs((prev) => {
                              const updated = { ...prev, [row.key]: next };
                              writeUserNotificationPrefs(notificationScopeUser, updated);
                              if (customerIdentity.email || customerIdentity.clerkId) {
                                void requestJson(`${API_BASE}/api/users/notification-prefs`, {
                                  method: "PUT",
                                  body: JSON.stringify({
                                    email: customerIdentity.email || undefined,
                                    clerkId: customerIdentity.clerkId || undefined,
                                    prefs: updated,
                                  }),
                                }).catch(() => {
                                  // ignore (local fallback still exists)
                                });
                              }
                              return updated;
                            });
                          }}
                          label={row.title}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-serif text-[#111111]">Recent notifications</h2>
                    {unreadNotificationsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!customerIdentity.email && !customerIdentity.clerkId) return;
                          setUnreadNotificationsCount(0);
                          setNotifications((prev) =>
                            (Array.isArray(prev) ? prev : []).map((n) => ({ ...n, isRead: true }))
                          );
                          void requestJson(`${API_BASE}/api/users/notifications/mark-read`, {
                            method: "POST",
                            body: JSON.stringify({
                              email: customerIdentity.email || undefined,
                              clerkId: customerIdentity.clerkId || undefined,
                            }),
                          }).catch(() => {
                            // ignore
                          });
                        }}
                        className="h-10 px-4 rounded-xl border border-[#E6E6E6] bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="mt-6 space-y-3">
                    {notificationsLoading ? (
                      <p className="text-[#6B7280]">Loading notifications…</p>
                    ) : notificationsError ? (
                      <p className="text-[#6B7280]">{notificationsError}</p>
                    ) : notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`rounded-2xl border p-4 ${
                            n.isRead ? "border-[#E6E6E6] bg-white" : "border-rose-100 bg-rose-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="text-[15px] font-semibold text-[#111111]">{n.title}</div>
                            <div className="text-xs text-[#6B7280] shrink-0">{formatDate(n.createdAt)}</div>
                          </div>
                          {n.body ? <div className="text-sm text-[#6B7280] mt-1">{n.body}</div> : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-[#6B7280]">No notifications yet.</p>
                    )}
                  </div>
                </section>
              </>
            )}

            {!isAdmin && activeTab === "buy-orders" && (
              <>
                <h1 className="text-2xl font-serif text-[#111111]">Buy Order History</h1>
                 {isDeactivated ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Your account is deactivated. Reactivate from Settings to view orders.</p>
                    </section>
                  ) : ordersLoading ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">Loading your buy orders…</p>
                    </section>
                  ) : ordersError ? (
                    <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                      <p className="text-[#6B7280]">{ordersError}</p>
                    </section>
                  ) : buyOrders.length > 0 ? (
                    buyOrders.map((order) => (
                      (() => {
                        const orderItems = getDisplayItems(order);
                       const firstItem = orderItems[0] || {};
                      return (
                    <section key={order.id} className="bg-[#FFFFFF] rounded-[24px] p-5 border border-[#E6E6E6]">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-base text-[#6B7280]">Order {order.id}</p>
                          <p className="text-sm text-[#6B7280] mt-1">Placed on {formatDate(order.date)}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex px-4 py-1 rounded-full text-xs bg-[#D9E6FF] text-[#2862D6]">
                            {getOrderStatusLabel(order.status)}
                          </span>
                          <p className="text-2xl font-serif text-[#111111] mt-1.5">
                            {"\u20B9"}{Number(order.amount || 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>
                      <div className="my-4 h-px bg-[#E6E6E6]" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {orderItems.length <= 1 && (
                            <img
                              src={firstItem.image || order.image || "https://i.pinimg.com/1200x/53/87/d3/5387d3a33e2db9c8a628874285e56c18.jpg"}
                              alt={firstItem.name || order.name || "Ordered item"}
                              className="w-16 h-16 rounded-xl object-cover"
                            />
                          )}
                          <div>
                            <p className="text-lg font-serif text-[#111111]">
                              {orderItems.length > 1 ? `${orderItems.length} items in this order` : (firstItem.name || order.name || "Ordered item")}
                            </p>
                            {orderItems.length > 1 && (
                              <>
                                <div className="flex items-center gap-1.5 mt-2">
                                  {orderItems.slice(0, 4).map((item, index) => (
                                    <img
                                      key={`${item.id || item.name || "item"}-${index}`}
                                      src={item.image || firstItem.image || order.image}
                                      alt={item.name || "Item"}
                                      className="w-8 h-8 rounded-md object-cover border border-[#E6E6E6]"
                                    />
                                  ))}
                                  {orderItems.length > 4 && (
                                    <span className="text-[10px] text-[#6B7280] font-semibold">
                                      +{orderItems.length - 4}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#6B7280] mt-1">
                                  {orderItems.slice(0, 3).map((item) => item.name).join(", ")}
                                  {orderItems.length > 3 ? ` +${orderItems.length - 3} more` : ""}
                                </p>
                              </>
                            )}
                            <p className="text-xs text-[#6B7280]">Purchase</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (isBuyCompletedForCustomer(order)) return;
                            navigate("/track-order", {
                              state: {
                                orderId: order.id,
                                product: { name: firstItem.name || order.name, image: firstItem.image || order.image },
                                items: orderItems,
                                type: order.type || "Buy",
                              },
                            });
                          }}
                          className={[
                            "text-sm flex items-center gap-1",
                            isBuyCompletedForCustomer(order) ? "text-emerald-700 cursor-default" : "text-[#111111]",
                          ].join(" ")}
                        >
                          {isBuyCompletedForCustomer(order) ? (
                            "Completed"
                          ) : (
                            <>
                              Track <ChevronRight size={18} />
                            </>
                          )}
                        </button>
                      </div>
                    </section>
                      );
                    })()
                  ))
                ) : (
                  <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                    <p className="text-[#6B7280]">No buy orders yet.</p>
                  </section>
                )}
              </>
            )}

            {activeTab === "settings" && (
              <>
                <h1 className="text-2xl font-serif text-[#111111]">Account Settings</h1>

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-serif text-[#111111]">Personal Information</h2>
                    {isEditingProfile ? (
                      <div className="flex items-center gap-2">
                        <button onClick={cancelProfileEdit} className="text-[#6B7280] text-sm px-3 py-1.5 border border-[#E6E6E6] rounded-lg">
                          Cancel
                        </button>
                        <button onClick={saveProfile} className="text-white text-sm px-3 py-1.5 bg-[#111111] rounded-lg">
                          Save
                        </button>
                      </div>
                    ) : (
                      <button onClick={startProfileEdit} className="text-[#6B7280] text-base flex items-center gap-2">
                        <Pencil size={20} /> Edit
                      </button>
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-[#6B7280]">Full Name</p>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={profileDraft.name}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, name: e.target.value }))}
                          className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                        />
                      ) : (
                        <p className="text-xl text-[#111111] mt-2">{profile.name}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-[#6B7280]">Email</p>
                      {isEditingProfile ? (
                        <input
                          type="email"
                          value={profileDraft.email}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
                          className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                        />
                      ) : (
                        <p className="text-xl text-[#111111] mt-2">{profile.email}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-[#6B7280]">Phone</p>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={profileDraft.phone}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                          className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                        />
                      ) : (
                        <p className="text-xl text-[#111111] mt-2">{profile.phone}</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-serif text-[#111111]">Saved Addresses</h2>
                    {isAddingAddress ? (
                      <button
                        onClick={() => {
                          setAddressDraft({ line1: "", line2: "" });
                          setIsAddingAddress(false);
                        }}
                        className="text-[#6B7280] text-sm px-3 py-1.5 border border-[#E6E6E6] rounded-lg"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button onClick={() => setIsAddingAddress(true)} className="text-[#6B7280] text-base">
                        Add New
                      </button>
                    )}
                  </div>

                  {isAddingAddress && (
                    <div className="mt-5 p-4 bg-[#E6E6E6] rounded-2xl border border-[#E6E6E6]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Street / Area"
                          value={addressDraft.line1}
                          onChange={(e) => setAddressDraft((prev) => ({ ...prev, line1: e.target.value }))}
                          className="h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-sm text-[#111111] outline-none"
                        />
                        <input
                          type="text"
                          placeholder="City, State, Pincode"
                          value={addressDraft.line2}
                          onChange={(e) => setAddressDraft((prev) => ({ ...prev, line2: e.target.value }))}
                          className="h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-sm text-[#111111] outline-none"
                        />
                      </div>
                      <button onClick={addAddress} className="mt-3 text-white text-sm px-4 py-2 bg-[#111111] rounded-lg">
                        Save Address
                      </button>
                    </div>
                  )}

                  {addressesLoading && !isAddingAddress ? (
                    <p className="mt-6 text-sm text-[#6B7280]">Loading saved addresses...</p>
                  ) : null}

                  {addressesError && !isAddingAddress ? (
                    <p className="mt-6 text-sm text-[#B04B4B]">{addressesError}</p>
                  ) : null}

                  {!addressesLoading && !addressesError && addresses.length === 0 && !isAddingAddress ? (
                    <p className="mt-6 text-sm text-[#6B7280]">
                      No saved addresses yet. Add one with &quot;Add New&quot;, or save at checkout when you place your first order.
                    </p>
                  ) : null}

                  <div className="mt-6 space-y-4">
                    {addresses.map((address) => (
                      <div key={address.id} className="bg-[#E6E6E6] rounded-2xl p-5 text-[#111111]">
                        <div className="flex gap-4">
                          <MapPin size={24} className="shrink-0 mt-1" />
                          <div className="w-full">
                            {editingAddressId === address.id ? (
                              <div className="space-y-3">
                                <input
                                  type="text"
                                  value={editingAddressDraft.line1}
                                  onChange={(e) =>
                                    setEditingAddressDraft((prev) => ({ ...prev, line1: e.target.value }))
                                  }
                                  className="h-11 w-full px-4 rounded-xl border border-[#E6E6E6] bg-white text-sm text-[#111111] outline-none"
                                />
                                <input
                                  type="text"
                                  value={editingAddressDraft.line2}
                                  onChange={(e) =>
                                    setEditingAddressDraft((prev) => ({ ...prev, line2: e.target.value }))
                                  }
                                  className="h-11 w-full px-4 rounded-xl border border-[#E6E6E6] bg-white text-sm text-[#111111] outline-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button onClick={cancelAddressEdit} className="text-[#6B7280] text-sm px-3 py-1.5 border border-[#E6E6E6] rounded-lg">
                                    Cancel
                                  </button>
                                  <button onClick={saveAddressEdit} className="text-white text-sm px-3 py-1.5 bg-[#111111] rounded-lg">
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-lg">{address.line1}</p>
                                  <p className="text-base">{address.line2}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => startAddressEdit(address)}
                                    className="text-[#6B7280] text-sm px-3 py-1.5 border border-[#E6E6E6] rounded-lg"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteAddress(address.id)}
                                    className="text-[#B04B4B] text-sm px-3 py-1.5 border border-[#D7A9A9] rounded-lg"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[#FFFFFF] rounded-[24px] p-7 border border-[#E6E6E6]">
                  <h2 className="text-2xl font-serif text-[#111111]">Change password</h2>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-[#6B7280]">Current password</p>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-[#6B7280]">New password</p>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-[#6B7280]">Confirm password</p>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        className="mt-2 w-full h-11 px-4 rounded-xl border border-[#E6E6E6] bg-white text-base text-[#111111] outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={passwordBusy}
                      className="h-11 px-6 rounded-xl border border-[#E6E6E6] bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Update password
                    </button>
                    {passwordError && <span className="text-sm text-[#B04B4B]">{passwordError}</span>}
                    {!passwordError && passwordSuccess && <span className="text-sm text-[#2E7D32]">{passwordSuccess}</span>}
                    {!passwordError && !passwordSuccess && (!isClerkLoaded || !clerkUser) && (
                      <span className="text-sm text-[#6B7280]">Password update is available only for signed-in accounts.</span>
                    )}
                  </div>
                </section>

                <section className="rounded-[24px] p-7 border border-[#D7A9A9] bg-[#FFF7F7]">
                  <h2 className="text-2xl font-serif text-[#7A1F1F]">Danger zone</h2>

                  <div className="mt-5 space-y-5">
                    <div className="flex items-center justify-between gap-5">
                      <div>
                        <div className="text-[15px] font-semibold text-[#7A1F1F]">Deactivate account</div>
                        <div className="text-sm text-[#7A1F1F]/70 mt-1">Temporarily hide your profile and orders</div>
                      </div>
                      <button
                        type="button"
                        onClick={toggleDeactivated}
                        className="h-11 px-6 rounded-xl border border-[#D7A9A9] bg-white text-[#111111] text-sm font-semibold hover:bg-[#FFF0F0] transition"
                      >
                        {isDeactivated ? "Activate" : "Deactivate"}
                      </button>
                    </div>

                    <div className="h-px bg-[#D7A9A9]/60" />

                    <div className="flex items-center justify-between gap-5">
                      <div>
                        <div className="text-[15px] font-semibold text-[#7A1F1F]">Delete account</div>
                        <div className="text-sm text-[#7A1F1F]/70 mt-1">Permanently delete all your data</div>
                      </div>
                      <button
                        type="button"
                        onClick={deleteAccount}
                        disabled={deleteBusy}
                        className="h-11 px-6 rounded-xl border border-[#D7A9A9] bg-white text-[#B04B4B] text-sm font-semibold hover:bg-[#FFF0F0] transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deleteBusy ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                    {deleteError ? <div className="text-sm text-[#B04B4B]">{deleteError}</div> : null}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AccountPage;
