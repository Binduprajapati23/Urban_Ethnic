import { useUser } from "@clerk/clerk-react";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { readFeatureToggles } from "../utils/adminConfig";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";

const normalizeCity = (value) => String(value || "").trim().replace(/\s+/g, " ");

const VALID_ROLES = new Set(["user", "owner", "admin"]);

const CityOnboardingGate = () => {
  const location = useLocation();
  const { isLoaded, isSignedIn, user } = useUser();
  const [role, setRole] = useState("user");
  const [city, setCity] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [allowOwnerRegistration, setAllowOwnerRegistration] = useState(
    () => Boolean(readFeatureToggles().ownerSelfRegistration)
  );

  const email = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const metadataRole = String(user?.unsafeMetadata?.role || user?.publicMetadata?.role || "")
    .trim()
    .toLowerCase();
  const isAdmin = email === ADMIN_EMAIL || metadataRole === "admin";

  const storedCity = useMemo(
    () => normalizeCity(user?.unsafeMetadata?.city || user?.publicMetadata?.city || ""),
    [user]
  );

  const hasValidRole = VALID_ROLES.has(metadataRole);
  const needsRole = !hasValidRole;
  const needsCity = !storedCity;

  const shouldBlock =
    isLoaded &&
    isSignedIn &&
    Boolean(user) &&
    !isAdmin &&
    (needsRole || needsCity) &&
    !location.pathname.startsWith("/login") &&
    !location.pathname.startsWith("/register") &&
    !location.pathname.startsWith("/sso-callback");

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "admin_feature_toggles_v1") {
        setAllowOwnerRegistration(Boolean(readFeatureToggles().ownerSelfRegistration));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onToggles = (event) => {
      const next = event?.detail;
      if (next && typeof next === "object") {
        setAllowOwnerRegistration(Boolean(next.ownerSelfRegistration));
      }
    };
    window.addEventListener("ue:feature-toggles", onToggles);
    return () => window.removeEventListener("ue:feature-toggles", onToggles);
  }, []);

  useEffect(() => {
    if (!shouldBlock || !user) return;
    if (hasValidRole) {
      setRole(metadataRole === "owner" && !allowOwnerRegistration ? "user" : metadataRole);
    } else {
      setRole("user");
    }
    setCity(storedCity);
  }, [shouldBlock, user?.id, hasValidRole, metadataRole, storedCity, allowOwnerRegistration]);

  useEffect(() => {
    if (!allowOwnerRegistration && role === "owner") {
      setRole("user");
    }
  }, [allowOwnerRegistration, role]);

  const saveProfile = useCallback(async () => {
    if (!user) return;

    const nextRole = hasValidRole
      ? metadataRole === "owner" && !allowOwnerRegistration
        ? "user"
        : metadataRole
      : role;
    const nextCity = needsCity ? normalizeCity(city) : storedCity;

    if (!nextCity) {
      setError("City is required.");
      return;
    }
    if (!hasValidRole && (!nextRole || (nextRole === "owner" && !allowOwnerRegistration))) {
      setError("Please select a valid role.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata || {}),
          role: nextRole,
          city: nextCity,
        },
      });

      // Keep localStorage user in sync so city-based pricing/filtering works immediately.
      try {
        const existing = JSON.parse(localStorage.getItem("user") || "null");
        if (existing && typeof existing === "object") {
          localStorage.setItem("user", JSON.stringify({ ...existing, city: nextCity }));
        }
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || e?.message || "Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [
    allowOwnerRegistration,
    city,
    hasValidRole,
    metadataRole,
    needsCity,
    role,
    storedCity,
    user,
  ]);

  if (!shouldBlock) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] bg-white border border-black/10 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="text-xl font-serif text-[#111111] font-bold">Complete your profile</div>
          <p className="text-sm text-black/60 mt-1">
            Pick how you use Urban Ethnic and your city so we can show the right options.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {needsRole ? (
            <div>
              <label className="text-sm font-semibold text-black/70">Role</label>
              <div className="relative mt-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full appearance-none rounded-3xl border border-black/10 bg-white text-black/80 focus:ring-2 focus:ring-black/15 h-11 px-4 pr-11 outline-none"
                  disabled={isSaving}
                >
                  <option value="user">User</option>
                  {allowOwnerRegistration ? <option value="owner">Owner</option> : null}
                </select>
                <ChevronDown
                  size={18}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/45"
                />
              </div>
            </div>
          ) : null}

          {needsCity ? (
            <div>
              <label className="text-sm font-semibold text-black/70">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                list="city-options"
                className="mt-2 w-full rounded-3xl border border-black/10 bg-white text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-11 px-4 outline-none"
                placeholder="Enter your city (e.g., Mumbai)"
                autoComplete="address-level2"
                disabled={isSaving}
              />
              <datalist id="city-options">
                {[
                  "Mumbai",
                  "Delhi",
                  "Bengaluru",
                  "Hyderabad",
                  "Chennai",
                  "Kolkata",
                  "Pune",
                  "Ahmedabad",
                  "Jaipur",
                  "Surat",
                ].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          ) : null}

          <button
            type="button"
            onClick={saveProfile}
            disabled={
              isSaving ||
              (needsCity && !city.trim()) ||
              (needsRole && (!role || (role === "owner" && !allowOwnerRegistration)))
            }
            className="w-full h-11 rounded-3xl bg-[#111111] hover:bg-black text-white shadow-sm tracking-widest uppercase text-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CityOnboardingGate;
