import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Lock, Save } from "lucide-react";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { downloadCsv } from "../../utils/csv";
import { readFeatureToggles, readPlatformConfig, writeFeatureToggles, writePlatformConfig } from "../../utils/adminConfig";
import { requestJson } from "../../utils/http";

const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

const ADMIN_OWNER_PROFILE_KEY = "admin_owner_profile";
const ADMIN_BUSINESS_DETAILS_KEY = "admin_business_details";
const ADMIN_PRODUCTS_KEY = "admin_products";
const ADMIN_ORDERS_KEY = "admin_orders";
const ADMIN_RENTALS_KEY = "admin_rentals";
const USER_ORDERS_PREFIX = "urban_ethnic_user_orders";
const USER_RENTALS_PREFIX = "urban_ethnic_user_rentals";
const USER_WISHLIST_PREFIX = "urban_ethnic_wishlist";
const USER_CART_PREFIX = "urban_ethnic_cart";

const prettyClerkError = (err) => {
  const first = err?.errors?.[0];
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  return err?.message || "Something went wrong. Please try again.";
};

const Switch = ({ checked, onChange, disabled = false, labelId, variant = "light" }) => (
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
      variant === "dark"
        ? checked
          ? "bg-white border-white"
          : "bg-white/10 border-white/10"
        : checked
          ? "bg-[#111111] border-[#111111]"
          : "bg-black/10 border-black/10",
      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    ].join(" ")}
  >
    <span
      className={[
        "absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-sm transition",
        checked ? "right-1" : "left-1",
        variant === "dark" ? (checked ? "bg-[#111111]" : "bg-white") : "bg-white",
      ].join(" ")}
    />
  </button>
);

const AdminSettings = () => {
  const { user, isLoaded } = useUser();

  const [platformConfig, setPlatformConfig] = useState(() => readPlatformConfig());
  const [featureTogglesDraft, setFeatureTogglesDraft] = useState(() => readFeatureToggles());

  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const onStorage = () => {
      setPlatformConfig(readPlatformConfig());
      const nextToggles = readFeatureToggles();
      setFeatureTogglesDraft(nextToggles);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRemote = async () => {
      try {
        const res = await requestJson(`${API_BASE}/api/admin/settings`);
        if (cancelled) return;
        if (res?.platformConfig) setPlatformConfig(writePlatformConfig(res.platformConfig));
        if (res?.featureToggles) setFeatureTogglesDraft(writeFeatureToggles(res.featureToggles));
      } catch {
        // ignore (localStorage fallback still works)
      }
    };

    void loadRemote();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAll = async () => {
    try {
      const res = await requestJson(`${API_BASE}/api/admin/settings`, {
        method: "PUT",
        body: JSON.stringify({
          platformConfig,
          featureToggles: featureTogglesDraft || {},
        }),
      });

      const nextPlatform = writePlatformConfig(res?.platformConfig || platformConfig);
      const nextToggles = writeFeatureToggles(res?.featureToggles || (featureTogglesDraft || {}));
      setPlatformConfig(nextPlatform);
      setFeatureTogglesDraft(nextToggles);
      alert("Settings saved");
    } catch (err) {
      alert(err?.message || "Failed to save settings");
    }
  };

  const toggleSaveTimerRef = useRef(null);
  const pendingTogglePayloadRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toggleSaveTimerRef.current) clearTimeout(toggleSaveTimerRef.current);
    };
  }, []);

  const queueToggleSave = useCallback((nextToggles) => {
    pendingTogglePayloadRef.current = nextToggles;
    if (toggleSaveTimerRef.current) clearTimeout(toggleSaveTimerRef.current);

    toggleSaveTimerRef.current = setTimeout(async () => {
      const payload = pendingTogglePayloadRef.current;
      pendingTogglePayloadRef.current = null;
      try {
        await requestJson(`${API_BASE}/api/admin/settings`, {
          method: "PUT",
          body: JSON.stringify({ featureToggles: payload || {} }),
        });
      } catch {
        // ignore (localStorage fallback still works)
      }
    }, 350);
  }, []);

  const updateToggle = useCallback((key, value) => {
    setFeatureTogglesDraft((prev) => {
      const merged = { ...(prev || {}), [key]: Boolean(value) };
      writeFeatureToggles(merged);
      queueToggleSave(merged);
      return merged;
    });
  }, [queueToggleSave]);

  const exportFullDataCsv = () => {
    const rows = [["key", "value", "scope"]];
    rows.push(["exported_at", new Date().toISOString(), "meta"]);

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      let scope = "other";
      if (key === ADMIN_OWNER_PROFILE_KEY || key === ADMIN_BUSINESS_DETAILS_KEY) scope = "admin_profile";
      if (key === ADMIN_PRODUCTS_KEY || key === ADMIN_ORDERS_KEY || key === ADMIN_RENTALS_KEY) scope = "admin_data";
      if (
        key.startsWith(`${USER_ORDERS_PREFIX}:`) ||
        key.startsWith(`${USER_RENTALS_PREFIX}:`) ||
        key.startsWith(`${USER_WISHLIST_PREFIX}:`) ||
        key.startsWith(`${USER_CART_PREFIX}:`)
      ) {
        scope = "user_scoped";
      }

      rows.push([key, localStorage.getItem(key) || "", scope]);
    }

    downloadCsv({
      filename: `urban-ethnic-full-data-${Date.now()}.csv`,
      headers: rows[0],
      rows: rows.slice(1),
    });
  };

  const resetRentalLogs = () => {
    const confirmed = window.confirm("Are you sure you want to reset all rental logs?");
    if (!confirmed) return;
    localStorage.removeItem(ADMIN_RENTALS_KEY);

    const userRentalKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${USER_RENTALS_PREFIX}:`)) {
        userRentalKeys.push(key);
      }
    }
    userRentalKeys.forEach((key) => localStorage.removeItem(key));

    alert("All rental logs have been reset. Orders are unchanged.");
  };

  const changePassword = async () => {
    if (!isLoaded || !user) return;

    setPasswordError("");
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
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
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
      alert("Password updated");
    } catch (err) {
      setPasswordError(prettyClerkError(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  const featureRows = useMemo(
    () => [
      {
        key: "ownerSelfRegistration",
        title: "Owner self-registration",
        desc: "Allow new owners to register without admin invite",
      },
      {
        key: "rentalFeature",
        title: "Rental feature",
        desc: "Enable rental listing type platform-wide",
      },
      {
        key: "cityBasedFiltering",
        title: "City-based filtering",
        desc: "Show products filtered by customer's city",
      },
      {
        key: "maintenanceMode",
        title: "Maintenance mode",
        desc: "Take platform offline for all users",
      },
    ],
    []
  );

  return (
    <AdminOrdersPageShell
      title="Settings"
      subtitle="Platform-wide configuration and admin preferences."
      stats={[]}
      showFilters={false}
      searchQuery=""
      onSearchQueryChange={() => {}}
    >
      <div className="space-y-8">
        <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
          <div className="px-6 sm:px-8 py-6 border-b border-black/10 flex items-center justify-between gap-4">
            <div className="text-xl sm:text-2xl font-serif text-[#111111] font-bold">Platform configuration</div>
            <button
              type="button"
              onClick={saveAll}
              className="h-10 px-5 rounded-xl bg-[#111111] text-white text-sm font-semibold hover:bg-black transition inline-flex items-center gap-2"
            >
              <Save size={16} />
              Save all
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-7">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-black/70">Platform name</label>
                <input
                  value={platformConfig.platformName}
                  onChange={(e) => setPlatformConfig((prev) => ({ ...prev, platformName: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-[#f3f0f0] border border-black/10 text-[#111111] placeholder-black/30 outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-black/70">Support email</label>
                <input
                  value={platformConfig.supportEmail}
                  onChange={(e) => setPlatformConfig((prev) => ({ ...prev, supportEmail: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-[#f3f0f0] border border-black/10 text-[#111111] placeholder-black/30 outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-black/70">Commission rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={platformConfig.commissionRatePct}
                  onChange={(e) =>
                    setPlatformConfig((prev) => ({ ...prev, commissionRatePct: Number(e.target.value) }))
                  }
                  className="w-full h-11 px-4 rounded-xl bg-[#f3f0f0] border border-black/10 text-[#111111] placeholder-black/30 outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-black/70">Max images per product</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={platformConfig.maxImagesPerProduct}
                  onChange={(e) =>
                    setPlatformConfig((prev) => ({ ...prev, maxImagesPerProduct: Number(e.target.value) }))
                  }
                  className="w-full h-11 px-4 rounded-xl bg-[#f3f0f0] border border-black/10 text-[#111111] placeholder-black/30 outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-black/10">
              <div className="divide-y divide-black/10">
                {featureRows.map((row) => {
                  const id = `feature-${row.key}`;
                  const enabled = Boolean(featureTogglesDraft?.[row.key]);
                  return (
                    <div key={row.key} className="py-5 flex items-center justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        <div id={id} className="font-semibold text-[#111111]">
                          {row.title}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{row.desc}</div>
                      </div>
                      <Switch
                        checked={enabled}
                        onChange={(v) => updateToggle(row.key, v)}
                        labelId={id}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="text-lg font-serif text-[#111111] font-bold">Account</div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 bg-[#f3f0f0]/40 p-5">
              <div className="flex items-center gap-2 text-[#111111] font-bold">
                <Lock size={16} /> Update password
              </div>
              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#111111]"
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#111111]"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-[#E6E6E6] rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#111111]"
                />
                {passwordError ? <div className="text-xs text-rose-700">{passwordError}</div> : null}
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={passwordBusy || !isLoaded || !user}
                  className="w-full px-6 py-3 rounded-xl bg-[#111111] text-white text-sm font-bold hover:bg-black transition disabled:opacity-60"
                >
                  {passwordBusy ? "Updating…" : "Update password"}
                </button>
                <div className="text-[11px] text-gray-500">
                  If you signed up with Google, password update may be unavailable.
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="text-lg font-serif text-[#111111] font-bold">Data tools</div>
          </div>
          <div className="p-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={exportFullDataCsv}
              className="px-6 py-3 border border-black/15 text-[#111111] text-xs font-bold rounded-2xl hover:bg-black/5 transition-colors uppercase tracking-wider"
            >
              Export full data file
            </button>
            <button
              type="button"
              onClick={resetRentalLogs}
              className="px-6 py-3 bg-rose-600 text-white text-xs font-bold rounded-2xl hover:bg-rose-700 transition-colors shadow-sm uppercase tracking-wider"
            >
              Reset all rental logs
            </button>
          </div>
        </div>
      </div>
    </AdminOrdersPageShell>
  );
};

export default AdminSettings;
