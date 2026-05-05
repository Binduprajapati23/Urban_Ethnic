import { useEffect, useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { LogOut } from "lucide-react";
import { requestJson } from "../../utils/http";

const ADMIN_OWNER_PROFILE_KEY = "admin_owner_profile";
const ADMIN_BUSINESS_DETAILS_KEY = "admin_business_details";
const OWNER_PROFILE_META_KEY = "owner_profile_meta_v1";
const OWNER_ADDRESSES_KEY = "owner_profile_addresses_v1";
const OWNER_NOTIFICATIONS_PREFIX = "urban_ethnic_owner_notifications";

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const readOwnerAddresses = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_ADDRESSES_KEY) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const formatOwnerAddress = (addr) => {
  const line1 = String(addr?.line1 || "").trim();
  const line2 = String(addr?.line2 || "").trim();
  return [line1, line2].filter(Boolean).join(", ");
};

const getOwnerStorageScope = (clerkUser) => {
  const email = String(clerkUser?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const id = String(clerkUser?.id || "").trim().toLowerCase();
  return email || id || "guest";
};

const getOwnerNotificationsKey = (clerkUser) => `${OWNER_NOTIFICATIONS_PREFIX}:${getOwnerStorageScope(clerkUser)}`;

const readOwnerNotificationPrefs = (clerkUser) => {
  const raw = readJson(getOwnerNotificationsKey(clerkUser)) || {};
  return {
    newOrder: raw?.newOrder !== false,
    returnRequested: raw?.returnRequested !== false,
    returnDueTomorrow: raw?.returnDueTomorrow !== false,
    payoutProcessed: raw?.payoutProcessed !== false,
    monthlyEarnings: Boolean(raw?.monthlyEarnings),
  };
};

const writeOwnerNotificationPrefs = (clerkUser, next) => {
  const payload = {
    newOrder: Boolean(next?.newOrder),
    returnRequested: Boolean(next?.returnRequested),
    returnDueTomorrow: Boolean(next?.returnDueTomorrow),
    payoutProcessed: Boolean(next?.payoutProcessed),
    monthlyEarnings: Boolean(next?.monthlyEarnings),
  };

  try {
    localStorage.setItem(getOwnerNotificationsKey(clerkUser), JSON.stringify(payload));
    localStorage.removeItem("owner_notifications");
  } catch {
    // ignore
  }

  return payload;
};

const Toggle = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    onClick={() => {
      if (disabled) return;
      onChange(!checked);
    }}
    className={[
      "relative inline-flex h-8 w-14 items-center rounded-full border transition",
      checked ? "bg-[#111111] border-black/10" : "bg-black/5 border-black/10",
      disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-black/10",
    ].join(" ")}
    aria-pressed={checked}
    aria-disabled={disabled}
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

const OwnerSettings = () => {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();

  const defaults = useMemo(() => {
    const email = String(user?.primaryEmailAddress?.emailAddress || "").trim();
    const name =
      String(user?.fullName || "").trim() ||
      `${String(user?.firstName || "").trim()} ${String(user?.lastName || "").trim()}`.trim() ||
      email ||
      "Owner";

    const ownerSaved = readJson(ADMIN_OWNER_PROFILE_KEY) || {};
    const businessSaved = readJson(ADMIN_BUSINESS_DETAILS_KEY) || {};
    const meta = readJson(OWNER_PROFILE_META_KEY) || {};
    const ownerAddresses = readOwnerAddresses();

    const clerkCity = String(user?.unsafeMetadata?.city || user?.publicMetadata?.city || "").trim();
    const metaCity = String(meta?.city || "").trim();
    const businessCity = String(businessSaved?.city || "").trim();

    return {
      yourName: String(ownerSaved?.name || name),
      email: String(ownerSaved?.email || email),
      phone: String(ownerSaved?.phone || businessSaved?.phone || ""),
      city: (() => {
        if (metaCity) return metaCity;
        if (clerkCity) return clerkCity;
        if (businessCity) return businessCity;

        const address = String(businessSaved?.address || "").trim();
        const match = address.match(/,\s*([A-Za-z\s]+)\s*\d{5,6}\s*$/);
        if (match?.[1]) return String(match[1]).trim();
        return "";
      })(),
      address:
        String(businessSaved?.address || "").trim() ||
        formatOwnerAddress(ownerAddresses[ownerAddresses.length - 1] || null),
    };
  }, [user]);

  const [profile, setProfile] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [notifications, setNotifications] = useState(() => readOwnerNotificationPrefs(user));
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsMessage, setNotificationsMessage] = useState("");
  const [notificationsSaving, setNotificationsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deactivateMessage, setDeactivateMessage] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setProfile(defaults);
  }, [defaults]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      try {
        localStorage.removeItem("user");
      } catch {
        // ignore
      }
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  const saveProfile = async () => {
    setSaveMessage("");
    if (!profile.yourName.trim() || !profile.email.trim()) {
      setSaveMessage("Name and email are required.");
      return;
    }

    setSaving(true);
    try {
      const ownerProfile = {
        name: profile.yourName.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        role: "Owner",
      };
      const businessDetails = {
        ...(readJson(ADMIN_BUSINESS_DETAILS_KEY) || {}),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        city: profile.city.trim(),
      };

      localStorage.setItem(ADMIN_OWNER_PROFILE_KEY, JSON.stringify(ownerProfile));
      localStorage.setItem(ADMIN_BUSINESS_DETAILS_KEY, JSON.stringify(businessDetails));

      const existingMeta = readJson(OWNER_PROFILE_META_KEY) || {};
      localStorage.setItem(
        OWNER_PROFILE_META_KEY,
        JSON.stringify({ ...existingMeta, city: profile.city.trim() })
      );

      if (user && profile.city.trim()) {
        void user
          .update({
            unsafeMetadata: { ...(user.unsafeMetadata || {}), city: profile.city.trim() },
          })
          .catch(() => {
            // ignore Clerk sync failures; local profile is still saved
          });
      }

      setSaveMessage("Saved.");
    } catch {
      setSaveMessage("Failed to save.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(""), 2000);
    }
  };

  useEffect(() => {
    if (!isLoaded) return undefined;
    if (!ownerEmail) return undefined;

    let cancelled = false;

    const loadPrefs = async () => {
      setNotificationsMessage("");
      setNotificationsLoading(true);
      try {
        const res = await requestJson(
          `${API_BASE}/api/owner/notification-prefs?ownerEmail=${encodeURIComponent(ownerEmail)}`
        );
        if (cancelled) return;
        const next = res?.prefs ? writeOwnerNotificationPrefs(user, res.prefs) : readOwnerNotificationPrefs(user);
        setNotifications(next);
      } catch {
        if (!cancelled) setNotifications(readOwnerNotificationPrefs(user));
      } finally {
        if (!cancelled) setNotificationsLoading(false);
      }
    };

    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, isLoaded, ownerEmail, user]);

  const saveNotifications = async (next) => {
    if (!ownerEmail) {
      setNotifications(writeOwnerNotificationPrefs(user, next));
      return;
    }

    setNotificationsMessage("");
    setNotificationsSaving(true);
    setNotifications(writeOwnerNotificationPrefs(user, next));

    try {
      const res = await requestJson(`${API_BASE}/api/owner/notification-prefs`, {
        method: "PUT",
        body: JSON.stringify({ ownerEmail, prefs: next }),
      });
      const saved = res?.prefs ? writeOwnerNotificationPrefs(user, res.prefs) : writeOwnerNotificationPrefs(user, next);
      setNotifications(saved);
      setNotificationsMessage("Saved.");
    } catch (err) {
      setNotificationsMessage(err?.message || "Failed to save.");
    } finally {
      setNotificationsSaving(false);
      setTimeout(() => setNotificationsMessage(""), 2000);
    }
  };

  const updatePassword = async () => {
    setPasswordMessage("");
    const current = String(currentPassword || "");
    const next = String(newPassword || "");
    if (!current || !next) {
      setPasswordMessage("Enter current and new password.");
      return;
    }

    if (!user?.updatePassword) {
      setPasswordMessage("Password update is not available in this build. Use Clerk settings instead.");
      return;
    }

    setPasswordSaving(true);
    try {
      await user.updatePassword({ currentPassword: current, newPassword: next });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated.");
    } catch (err) {
      setPasswordMessage(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteMessage("");
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteMessage('Type "DELETE" to confirm.');
      return;
    }

    const ok = window.confirm("Are you sure you want to delete your account? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    try {
      // best-effort: remove DB row
      try {
        await fetch(`${API_BASE}/api/users/clerk-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: user?.id || "",
            email: String(user?.primaryEmailAddress?.emailAddress || ""),
          }),
        });
      } catch {
        // ignore
      }

      if (user?.delete) {
        await user.delete();
      }

      try {
        localStorage.removeItem("user");
      } catch {
        // ignore
      }

      await signOut();
    } catch (err) {
      setDeleteMessage(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Failed to delete account.");
    } finally {
      setDeleting(false);
    }
  };

  const deactivateAccount = async () => {
    setDeactivateMessage("");
    const ok = window.confirm("Deactivate your account? You can log in again anytime to reactivate.");
    if (!ok) return;

    setDeactivating(true);
    try {
      try {
        await requestJson(`${API_BASE}/api/users/deactivate`, {
          method: "POST",
          body: JSON.stringify({
            clerkId: user?.id || "",
            email: String(user?.primaryEmailAddress?.emailAddress || ""),
            action: "deactivate",
          }),
        });
      } catch {
        // ignore and still sign out locally
      }

      try {
        localStorage.removeItem("user");
      } catch {
        // ignore
      }

      await signOut();
    } catch (err) {
      setDeactivateMessage(err?.message || "Failed to deactivate account.");
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif">Settings</h1>
          <p className="text-sm text-black/60 mt-1">Manage your shop profile and account preferences.</p>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="group h-10 px-4 rounded-xl border border-black/10 bg-white hover:bg-rose-50 hover:border-rose-200 transition inline-flex items-center gap-2 text-sm text-black/70 hover:text-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label="Logout"
        >
          <LogOut size={18} className="text-black/50 group-hover:text-rose-700" />
          <span className="group-hover:text-rose-700">{loggingOut ? "Logging out..." : "Logout"}</span>
        </button>
      </div>

      <div className="w-full max-w-4xl space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10">
            <div className="text-lg font-serif text-black">Shop profile</div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-black/80">Your name</label>
                <input
                  value={profile.yourName}
                  onChange={(e) => setProfile((p) => ({ ...p, yourName: e.target.value }))}
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-black/80">Email</label>
                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-black/80">Phone</label>
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-black/80">City</label>
                <input
                  value={profile.city}
                  onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
                <p className="text-xs text-black/45">All new products will be tagged with this city automatically</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-black/80">Full address</label>
                <input
                  value={profile.address}
                  onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="h-11 px-6 rounded-2xl bg-[#111111] text-white font-semibold hover:bg-[#111111]/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Save changes
              </button>
              {saveMessage && <span className="text-sm text-black/60">{saveMessage}</span>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-serif text-black">Notification preferences</div>
              <div className="text-xs font-semibold text-black/50">
                {notificationsLoading ? "Loading…" : notificationsSaving ? "Saving…" : notificationsMessage || ""}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {[
              {
                key: "newOrder",
                title: "New order received",
                desc: "Instant alert when customer places order",
              },
              {
                key: "returnDueTomorrow",
                title: "Return due tomorrow",
                desc: "Reminder 1 day before rental return date",
              },
              {
                key: "payoutProcessed",
                title: "Payout processed",
                desc: "When weekly payout is sent to your bank",
              },
              {
                key: "monthlyEarnings",
                title: "Monthly earnings report",
                desc: "Email summary at end of each month",
              },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4 py-2">
                <div>
                  <div className="text-sm font-semibold text-black">{row.title}</div>
                  <div className="text-xs text-black/55 mt-1">{row.desc}</div>
                </div>
                <Toggle
                  checked={Boolean(notifications[row.key])}
                  onChange={(next) => saveNotifications({ ...notifications, [row.key]: next })}
                  label={row.title}
                  disabled={notificationsLoading || notificationsSaving}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-black/10">
            <div className="text-lg font-serif text-black">Change password</div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-black/80">Current password</label>
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type="password"
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-black/80">New password</label>
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  className="w-full h-11 rounded-2xl border border-black/10 bg-gray-50 text-black px-4 outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={updatePassword}
                disabled={passwordSaving}
                className="h-11 px-6 rounded-2xl border border-black/15 bg-white text-black font-semibold hover:bg-black/5 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Update password
              </button>
              {passwordMessage && <span className="text-sm text-black/60">{passwordMessage}</span>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-rose-200">
            <div className="text-lg font-serif text-rose-700">Delete account</div>
            <div className="text-xs text-rose-700/70 mt-1">This permanently deletes your owner account.</div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deactivateAccount}
                disabled={deactivating}
                className="h-11 px-6 rounded-2xl border border-rose-300 bg-white text-rose-700 font-semibold hover:bg-rose-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deactivating ? "Deactivating..." : "Deactivate account"}
              </button>
              {deactivateMessage && <span className="text-sm text-rose-700/80">{deactivateMessage}</span>}
            </div>

            <div className="text-sm text-rose-700/80">
              Type <span className="font-mono">DELETE</span> to confirm.
            </div>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full h-11 rounded-2xl border border-rose-200 bg-white text-[#111111] px-4 outline-none focus:ring-2 focus:ring-rose-500/20"
              placeholder="DELETE"
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting}
                className="h-11 px-6 rounded-2xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Delete account
              </button>
              {deleteMessage && <span className="text-sm text-rose-700/80">{deleteMessage}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerSettings;
