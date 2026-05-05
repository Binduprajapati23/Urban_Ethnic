import React, { useEffect, useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ChevronRight, LogOut, Pencil, Save, Settings, Shield, UserRound, Users, X } from "lucide-react";
import {
  readFeatureToggles,
  readPlatformConfig,
  writeFeatureToggles,
  writePlatformConfig,
} from "../../utils/adminConfig";
import { requestJson } from "../../utils/http";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";
const ADMIN_ACCOUNTS_KEY = "admin_profile_admin_accounts_v1";
const ADMIN_ACTIVITY_KEY = "admin_profile_activity_log_v1";
const ADMIN_SECURITY_KEY = "admin_profile_security_v1";
const ADMIN_ACCOUNT_KEY = "admin_profile_account_v1";

const PROFILE_SECTIONS = new Set(["my_account", "platform_config", "manage_admins", "activity_log", "security"]);

const normalizeProfileSection = (value) => {
  const key = String(value || "").trim().toLowerCase();
  return PROFILE_SECTIONS.has(key) ? key : "";
};

const readLocalUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const formatDateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatDateTimeLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const readClerkCity = (clerkUser) =>
  String(clerkUser?.unsafeMetadata?.city || clerkUser?.publicMetadata?.city || "").trim();

const formatAdminLastLogin = (value) => {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const readAdminAccount = ({ name, email, isSuperAdmin, clerkUser, localUser }) => {
  const city = readClerkCity(clerkUser);
  const liveLastLogin = formatDateTimeLabel(clerkUser?.lastSignInAt || localUser?.lastSignInAt);
  const lastLogin = city && liveLastLogin !== "—" ? `${liveLastLogin} · ${city}` : liveLastLogin;
  const createdAt = formatDateLabel(clerkUser?.createdAt || localUser?.createdAt);
  const defaults = {
    adminName: String(name || "Admin").trim() || "Admin",
    email: String(email || "admin@urbanethnic.in").trim() || "admin@urbanethnic.in",
    phone: String(localUser?.phone || "").trim(),
    role: isSuperAdmin ? "Super Admin" : "Admin",
    lastLogin,
    createdAt,
  };

  try {
    const raw = JSON.parse(localStorage.getItem(ADMIN_ACCOUNT_KEY) || "null");
    if (raw && typeof raw === "object") {
      const merged = { ...defaults, ...raw };
      const legacyLastLogin = String(merged.lastLogin || "").trim() === "Today, 10:32 AM · Mumbai";
      const legacyCreated = String(merged.createdAt || "").trim() === "1 Jan 2025";
      if (legacyLastLogin) merged.lastLogin = defaults.lastLogin;
      if (legacyCreated) merged.createdAt = defaults.createdAt;
      return merged;
    }
  } catch {
    // ignore
  }
  return defaults;
};

const writeAdminAccount = (next) => {
  try {
    localStorage.setItem(ADMIN_ACCOUNT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
};

const formatActivityDateTime = (value) => {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const readSecurityPrefs = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(ADMIN_SECURITY_KEY) || "null");
    if (raw && typeof raw === "object") return raw;
  } catch {
    // ignore
  }

  return { enable2fa: false, loginAlertEmails: true };
};

const writeSecurityPrefs = (next) => {
  try {
    localStorage.setItem(ADMIN_SECURITY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
};

const rolePill = (label) => {
  const normalized = String(label || "").trim().toLowerCase();
  const base = "inline-flex px-3 py-1 rounded-full text-xs font-semibold border";
  if (normalized.includes("super")) return `${base} bg-[#111111] border-black/10 text-white`;
  return `${base} bg-black/5 border-black/10 text-black/70`;
};

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

const MenuButton = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "w-full h-12 px-5 rounded-2xl flex items-center gap-3 text-[16px] font-semibold transition",
      active ? "bg-[#111111] text-white" : "text-[#6B7280] hover:text-[#111111] hover:bg-black/5",
    ].join(" ")}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {active ? <ChevronRight className="w-4 h-4 text-white/70" /> : null}
  </button>
);

const PLATFORM_FEATURE_ROWS = [
  {
    key: "ownerSelfRegistration",
    title: "Owner self-registration",
    desc: "Allow new owners without admin invite",
  },
  {
    key: "rentalFeature",
    title: "Rental feature",
    desc: "Enable rental listings platform-wide",
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
];

const AdminProfile = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

  const localUser = useMemo(() => readLocalUser(), []);
  const emailFromClerk = String(user?.primaryEmailAddress?.emailAddress || "").trim();
  const email = emailFromClerk || String(localUser?.email || "").trim();
  const nameFromClerk = String(user?.fullName || "").trim();
  const name = nameFromClerk || String(localUser?.name || localUser?.fullName || "Admin").trim();
  const initial = (name || "A").charAt(0).toUpperCase();
  const isSuperAdmin = String(email || "").toLowerCase() === ADMIN_EMAIL;

  const [activeSection, setActiveSection] = useState(
    () => normalizeProfileSection(searchParams.get("section")) || "my_account"
  );
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [securityPrefs, setSecurityPrefs] = useState(() => readSecurityPrefs());
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [platformConfig, setPlatformConfig] = useState(() => readPlatformConfig());
  const [featureTogglesDraft, setFeatureTogglesDraft] = useState(() => readFeatureToggles());
  const [adminAccount, setAdminAccount] = useState(null);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [adminAccountDraft, setAdminAccountDraft] = useState(null);

  useEffect(() => {
    const fromUrl = normalizeProfileSection(searchParams.get("section"));
    if (fromUrl && fromUrl !== activeSection) setActiveSection(fromUrl);
  }, [activeSection, searchParams]);

  const setSection = (nextSection) => {
    const normalized = normalizeProfileSection(nextSection) || "my_account";
    setActiveSection(normalized);
    const next = new URLSearchParams(searchParams);
    next.set("section", normalized);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setAdminAccount(readAdminAccount({ name, email, isSuperAdmin, clerkUser: user, localUser }));
    const onStorage = (event) => {
      if (event.key === "admin_platform_config_v1") setPlatformConfig(readPlatformConfig());
      if (event.key === "admin_feature_toggles_v1") setFeatureTogglesDraft(readFeatureToggles());
      if (event.key === ADMIN_ACCOUNT_KEY) {
        setAdminAccount(readAdminAccount({ name, email, isSuperAdmin, clerkUser: user, localUser }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [name, email, isSuperAdmin, user, localUser]);

  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      setActivityLoading(true);
      setActivityError("");
      try {
        const response = await requestJson(`${API_BASE}/api/admin/dashboard`);
        if (cancelled) return;
        const recentOrders = Array.isArray(response?.recentOrders) ? response.recentOrders : [];
        const rows = recentOrders.map((item, idx) => {
          const id = String(item?.id || `order-${idx}`);
          const status = String(item?.status || "Pending").trim();
          const type = String(item?.type || "Buy").trim();
          const customer = String(item?.customer || "Customer").trim();
          return {
            id,
            time: formatActivityDateTime(item?.date),
            action: `${type} order ${status}`,
            target: `${customer} · #${id}`,
          };
        });
        setActivityLog(rows);
      } catch (err) {
        if (cancelled) return;
        setActivityLog([]);
        setActivityError(err?.message || "Failed to load activity log.");
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    };

    void loadActivity();
    const onFocus = () => void loadActivity();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [API_BASE]);

  useEffect(() => {
    let cancelled = false;

    const loadAdminAccounts = async () => {
      setAccountsLoading(true);
      setAccountsError("");
      try {
        const data = await requestJson(`${API_BASE}/api/admin/people`);
        if (cancelled) return;
        const people = Array.isArray(data?.people) ? data.people : [];
        const admins = people
          .filter((row) => String(row?.email || "").trim().toLowerCase() === ADMIN_EMAIL)
          .map((row) => ({
            id: String(row?.id || row?.email || Math.random()),
            name: String(row?.name || "Admin").trim() || "Admin",
            email: String(row?.email || "").trim().toLowerCase() || "—",
            role: "Super admin",
            lastLogin: formatAdminLastLogin(row?.updatedAt),
            locked: true,
          }));
        setAccounts(admins);
      } catch (err) {
        if (cancelled) return;
        setAccounts([]);
        setAccountsError(err?.message || "Failed to load admin accounts.");
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    };

    void loadAdminAccounts();
    const onFocus = () => void loadAdminAccounts();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [API_BASE]);

  const logout = async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
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
      const first = err?.errors?.[0];
      const message = first?.longMessage || first?.message || err?.message || "Something went wrong. Please try again.";
      setPasswordError(message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const updateSecurityPref = (key, value) => {
    setSecurityPrefs((prev) => writeSecurityPrefs({ ...(prev || {}), [key]: Boolean(value) }));
  };

  const savePlatformConfig = () => {
    const nextPlatform = writePlatformConfig(platformConfig);
    const nextToggles = writeFeatureToggles(featureTogglesDraft || {});
    setPlatformConfig(nextPlatform);
    setFeatureTogglesDraft(nextToggles);
    alert("Settings saved");
  };

  return (
    <div className="min-h-screen bg-white p-6 lg:p-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">
        <aside className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
          <div className="p-7">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-[#f3f0f0] border border-black/10 flex items-center justify-center text-[#111111]/70 text-xl font-semibold">
                {initial}
              </div>
              <div className="mt-4 text-xl font-serif text-[#111111] font-bold">{name}</div>
              <div className="mt-1 text-sm text-[#6B7280]">{email || "admin@urbanethnic.in"}</div>
              <div className="mt-3 inline-flex px-4 py-1.5 rounded-full bg-[#111111] text-white text-xs font-semibold border border-black/10">
                {isSuperAdmin ? "Super Admin" : "Admin"}
              </div>
            </div>
          </div>

          <div className="h-px bg-black/10" />

          <div className="p-5 space-y-1.5">
            <MenuButton
              active={activeSection === "my_account"}
              onClick={() => setSection("my_account")}
              icon={<UserRound size={19} className={activeSection === "my_account" ? "text-white/90" : "text-black/50"} />}
              label="My account"
            />
            <MenuButton
              active={activeSection === "platform_config"}
              onClick={() => setSection("platform_config")}
              icon={<Settings size={19} className={activeSection === "platform_config" ? "text-white/90" : "text-black/50"} />}
              label="Platform config"
            />
            <MenuButton
              active={activeSection === "manage_admins"}
              onClick={() => setSection("manage_admins")}
              icon={<Users size={19} className={activeSection === "manage_admins" ? "text-white/90" : "text-black/50"} />}
              label="Manage admins"
            />
            <MenuButton
              active={activeSection === "activity_log"}
              onClick={() => setSection("activity_log")}
              icon={<Activity size={19} className={activeSection === "activity_log" ? "text-white/90" : "text-black/50"} />}
              label="Activity log"
            />
            <MenuButton
              active={activeSection === "security"}
              onClick={() => setSection("security")}
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
          {activeSection === "manage_admins" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#111111]">Admin accounts</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-[#111111]">
                    <tr className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                      <th className="text-left px-6 py-4">Name</th>
                      <th className="text-left px-4 py-4">Email</th>
                      <th className="text-left px-4 py-4">Role</th>
                      <th className="text-left px-4 py-4 min-w-[200px]">Last login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10">
                    {accountsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-sm text-[#6B7280]">Loading admin accounts...</td>
                      </tr>
                    ) : accountsError ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-sm text-rose-700">{accountsError}</td>
                      </tr>
                    ) : accounts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-sm text-[#6B7280]">No admin accounts found.</td>
                      </tr>
                    ) : (
                      accounts.map((account) => (
                        <tr key={account.id} className="text-[#111111]">
                          <td className="px-6 py-5 font-semibold">{account.name}</td>
                          <td className="px-4 py-5 text-[#6B7280]">{account.email}</td>
                          <td className="px-4 py-5">
                            <span className={rolePill(account.role)}>{account.role}</span>
                          </td>
                          <td className="px-4 py-5 text-[#6B7280] whitespace-nowrap min-w-[200px]">{account.lastLogin || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSection === "platform_config" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#111111]">Platform configuration</div>
                <button
                  type="button"
                  onClick={savePlatformConfig}
                  className="h-10 px-5 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition"
                >
                  Save all
                </button>
              </div>

              <div className="p-7 space-y-7">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-black/70">Platform name</label>
                    <input
                      value={platformConfig.platformName}
                      onChange={(e) => setPlatformConfig((prev) => ({ ...prev, platformName: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-black/70">Support email</label>
                    <input
                      value={platformConfig.supportEmail}
                      onChange={(e) => setPlatformConfig((prev) => ({ ...prev, supportEmail: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
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
                      className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
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
                      className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>
                </div>

                <div className="border-t border-black/10">
                  <div className="divide-y divide-black/10">
                    {PLATFORM_FEATURE_ROWS.map((row) => {
                      const id = `platform-feature-${row.key}`;
                      const enabled = Boolean(featureTogglesDraft?.[row.key]);
                      return (
                        <div key={row.key} className="py-6 flex items-center justify-between gap-6">
                          <div className="min-w-0">
                            <div id={id} className="font-semibold text-[#111111]">
                              {row.title}
                            </div>
                            <div className="text-sm text-[#6B7280] mt-1">{row.desc}</div>
                          </div>
                          <Switch
                            checked={enabled}
                            onChange={(v) =>
                              setFeatureTogglesDraft((prev) => ({ ...(prev || {}), [row.key]: Boolean(v) }))
                            }
                            labelId={id}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : activeSection === "my_account" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10 flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#111111]">Admin account</div>
                {isEditingAccount ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = writeAdminAccount(adminAccountDraft || adminAccount || {});
                        setAdminAccount(next);
                        setAdminAccountDraft(null);
                        setIsEditingAccount(false);
                      }}
                      className="h-10 px-4 rounded-xl bg-[#111111] text-white text-sm font-semibold hover:bg-black transition inline-flex items-center gap-2"
                    >
                      <Save size={16} />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminAccountDraft(null);
                        setIsEditingAccount(false);
                      }}
                      className="h-10 px-4 rounded-xl border border-black/15 bg-white text-[#111111] text-sm font-semibold hover:bg-black/5 transition inline-flex items-center gap-2"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const base = adminAccount || readAdminAccount({ name, email, isSuperAdmin });
                      setAdminAccountDraft({ ...base });
                      setIsEditingAccount(true);
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
                    <div className="text-xs font-semibold text-black/45">Admin name</div>
                    {isEditingAccount ? (
                      <input
                        value={adminAccountDraft?.adminName ?? adminAccount?.adminName ?? name}
                        onChange={(e) =>
                          setAdminAccountDraft((prev) => ({ ...(prev || {}), adminName: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">{adminAccount?.adminName || name}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Email</div>
                    <div className="text-base font-semibold text-[#111111]">{adminAccount?.email || email}</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Phone</div>
                    {isEditingAccount ? (
                      <input
                        value={adminAccountDraft?.phone ?? adminAccount?.phone ?? ""}
                        onChange={(e) =>
                          setAdminAccountDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))
                        }
                        className="w-full h-11 px-4 rounded-xl bg-white border border-black/10 text-[#111111] outline-none focus:ring-2 focus:ring-black/10"
                      />
                    ) : (
                      <div className="text-base font-semibold text-[#111111]">
                        {adminAccount?.phone || "—"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Role</div>
                    <div>
                      <span className="inline-flex px-4 py-1.5 rounded-full bg-[#111111] text-white text-xs font-semibold border border-black/10">
                        {adminAccount?.role || (isSuperAdmin ? "Super Admin" : "Admin")}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Last login</div>
                    <div className="text-base font-semibold text-[#111111]">{adminAccount?.lastLogin || "—"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-black/45">Account created</div>
                    <div className="text-base font-semibold text-[#111111]">{adminAccount?.createdAt || "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeSection === "activity_log" ? (
            <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
              <div className="px-7 py-6 border-b border-black/10">
                <div className="text-xl font-semibold text-[#111111]">Recent activity log</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#111111]">
                    <tr className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                      <th className="text-left px-6 py-4">Time</th>
                      <th className="text-left px-4 py-4">Action</th>
                      <th className="text-left px-4 py-4">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10">
                    {activityLoading ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-6 text-sm text-[#6B7280]">
                          Loading activity...
                        </td>
                      </tr>
                    ) : activityError ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-6 text-sm text-rose-700">
                          {activityError}
                        </td>
                      </tr>
                    ) : activityLog.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-6 text-sm text-[#6B7280]">
                          No recent activity yet.
                        </td>
                      </tr>
                    ) : (
                      activityLog.map((row) => (
                        <tr key={row.id} className="text-[#111111]">
                          <td className="px-6 py-5 text-[#6B7280]">{row.time}</td>
                          <td className="px-4 py-5 font-semibold">{row.action}</td>
                          <td className="px-4 py-5 font-semibold">{row.target}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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

                  {passwordError ? <div className="mt-3 text-sm text-rose-700">{passwordError}</div> : null}

                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={passwordBusy || !isLoaded || !user}
                      className="h-11 px-6 rounded-xl border border-black/15 bg-white text-[#111111] font-semibold hover:bg-black/5 transition disabled:opacity-60"
                    >
                      {passwordBusy ? "Updating…" : "Update password"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] bg-white border border-black/10 shadow-[0_18px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                <div className="px-7 py-6 border-b border-black/10">
                  <div className="text-xl font-semibold text-[#111111]">Two-factor authentication</div>
                </div>
                <div className="divide-y divide-black/10">
                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="security-2fa" className="font-semibold text-[#111111]">
                        Enable 2FA
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">Extra login security via OTP on phone</div>
                    </div>
                    <Switch
                      checked={Boolean(securityPrefs?.enable2fa)}
                      onChange={(v) => updateSecurityPref("enable2fa", v)}
                      labelId="security-2fa"
                    />
                  </div>

                  <div className="px-7 py-6 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                      <div id="security-alerts" className="font-semibold text-[#111111]">
                        Login alert emails
                      </div>
                      <div className="text-sm text-[#6B7280] mt-1">Email on every new login to admin account</div>
                    </div>
                    <Switch
                      checked={Boolean(securityPrefs?.loginAlertEmails)}
                      onChange={(v) => updateSecurityPref("loginAlertEmails", v)}
                      labelId="security-alerts"
                    />
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

export default AdminProfile;
