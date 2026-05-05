import { useSignUp, useUser } from "@clerk/clerk-react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readFeatureToggles } from "../utils/adminConfig";

const STORAGE_KEY = "post_auth_redirect";
const REGISTER_SYNC_KEY = "ue:register_sync_v1";

const prettyClerkError = (err) => {
  const first = err?.errors?.[0];
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  return err?.message || "Something went wrong. Please try again.";
};

const Field = ({ label, optional = false, children }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <label className="text-[#111111]/80 text-sm">{label}</label>
      {optional && <span className="text-xs text-[#6B7280]">Optional</span>}
    </div>
    {children}
  </div>
);

const RegisterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo;
  const redirectState = location.state?.redirectState;
  const { isLoaded, isSignedIn } = useUser();
  const { isLoaded: isSignUpLoaded, signUp, setActive } = useSignUp();

  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [allowOwnerRegistration, setAllowOwnerRegistration] = useState(
    () => Boolean(readFeatureToggles().ownerSelfRegistration)
  );

  const isRoleOwner = role === "owner";
  const canSubmit = useMemo(() => {
    if (step === "verify") return Boolean(verificationCode.trim());
    return Boolean(email.trim()) && Boolean(password) && Boolean(role) && Boolean(city.trim());
  }, [email, password, role, city, step, verificationCode]);

  const normalizedPhone = useMemo(() => String(phone || "").replace(/\D/g, ""), [phone]);
  const isPhoneValid = useMemo(() => !normalizedPhone || normalizedPhone.length >= 10, [normalizedPhone]);

  useEffect(() => {
    try {
      if (!redirectTo && !redirectState) return;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ redirectTo, redirectState }));
    } catch {
      // ignore
    }
  }, [redirectTo, redirectState]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      navigate(redirectTo || "/", { replace: true, state: redirectState });
    }
  }, [isLoaded, isSignedIn, navigate, redirectTo, redirectState]);

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
    if (!allowOwnerRegistration && role === "owner") {
      setRole("user");
    }
  }, [allowOwnerRegistration, role]);

  const signUpWithGoogle = async () => {
    if (!isSignUpLoaded) return;
    setError("");
    setIsSubmitting(true);
    try {
      try {
        sessionStorage.setItem(REGISTER_SYNC_KEY, "1");
      } catch {
        // ignore
      }
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectTo || "/",
      });
    } catch (err) {
      setError(prettyClerkError(err));
      setIsSubmitting(false);
    }
  };

  const submitSignUp = async (event) => {
    event.preventDefault();
    if (!isSignUpLoaded) return;

    setError("");
    setIsSubmitting(true);

    try {
      if (step === "verify") {
        const result = await signUp.attemptEmailAddressVerification({ code: verificationCode.trim() });
        if (result.status === "complete") {
          try {
            sessionStorage.setItem(REGISTER_SYNC_KEY, "1");
          } catch {
            // ignore
          }
          await setActive({ session: result.createdSessionId });
        }
        return;
      }

      if (!isPhoneValid) {
        setError("Please enter a valid phone number.");
        return;
      }

      const normalizedName = name.trim();
      const nameParts = normalizedName.split(/\s+/).filter(Boolean);
      const derivedFirstName = nameParts[0] || undefined;
      const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: derivedFirstName,
        lastName: derivedLastName,
        unsafeMetadata: { role: role || "user", city: city.trim(), phone: normalizedPhone || "" },
      });

      if (result.status === "complete") {
        try {
          sessionStorage.setItem(REGISTER_SYNC_KEY, "1");
        } catch {
          // ignore
        }
        await setActive({ session: result.createdSessionId });
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err) {
      setError(prettyClerkError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="relative hidden md:block overflow-hidden">
        <img
          src="https://i.pinimg.com/1200x/37/08/46/370846460f8eae5398eeca60cba6b66d.jpg"
          alt="Urban Ethnic"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-black/10" aria-hidden="true" />

        <div className="absolute bottom-12 left-12 text-white max-w-sm z-10">
          <h2 className="text-3xl font-serif mb-3">Join Our Community</h2>
          <p className="text-sm opacity-90">
            Create an account to save favorites, track orders, and get exclusive member benefits
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[#E6E6E6] px-3 sm:px-6 py-8">
        <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg bg-white/80 backdrop-blur rounded-[32px] shadow-2xl shadow-black/10 border border-black/5 p-5 sm:p-8 overflow-hidden">
          <div className="text-center mb-3">
            <h1 className="text-xl font-serif text-[#6B7280]">Urban Ethnic</h1>
            <p className="text-[11px] tracking-[0.3em] text-[#6B7280] mt-2 mb-2">LUXURY RENTALS &amp; FASHION</p>
          </div>

          <button
            type="button"
            disabled={isSubmitting || !isSignUpLoaded}
            onClick={signUpWithGoogle}
            className="w-full min-h-[30px] py-1.5 mt-2 flex items-center justify-center gap-2 rounded-3xl border border-black/10 shadow-sm hover:bg-white bg-white/70 text-black/80 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.74 1.22 9.26 3.62l6.9-6.9C35.97 2.18 30.4 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.05 6.25C12.5 13.16 17.77 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.5 24.5c0-1.64-.14-3.21-.4-4.73H24v9.02h12.65c-.55 2.94-2.19 5.43-4.65 7.12l7.22 5.6c4.22-3.89 6.28-9.62 6.28-17.01z"
              />
              <path
                fill="#FBBC05"
                d="M10.61 28.53A14.5 14.5 0 0 1 9.85 24c0-1.58.28-3.11.76-4.53l-8.05-6.25A24.02 24.02 0 0 0 0 24c0 3.88.93 7.55 2.56 10.78l8.05-6.25z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.4 0 11.77-2.11 15.7-5.73l-7.22-5.6c-2 1.34-4.56 2.13-8.48 2.13-6.23 0-11.5-3.66-13.39-8.97l-8.05 6.25C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px bg-black/10 flex-1" />
            <div className="text-[#6B7280] text-[12px] tracking-widest uppercase">OR</div>
            <div className="h-px bg-black/10 flex-1" />
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={submitSignUp} className="space-y-4">
            {step === "form" ? (
              <>
                <Field label="Name" optional>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 outline-none"
                    placeholder="Enter your name"
                    autoComplete="name"
                  />
                </Field>

                <Field label="Email address">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 outline-none"
                    placeholder="Enter your email address"
                    autoComplete="email"
                    inputMode="email"
                  />
                </Field>

                <Field label="Password">
                  <div className="relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 pr-12 outline-none"
                      placeholder="Enter your password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-black/45 hover:text-black/70"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>

                <div className="pt-1">
                  <div className="text-[13px]  tracking-[0.25em] text-black/80 mb-4">Role</div>
                  <div className="relative">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full appearance-none rounded-3xl border border-black/25 bg-white/90 text-black/80 focus:ring-2 focus:ring-black/15 h-10 px-4 pr-11 outline-none"
                      required
                    >
                      <option value="" >
                        Role
                      </option>
                      <option value="user">User</option>
                      {allowOwnerRegistration ? <option value="owner">Owner</option> : null}
                    </select>
                    <ChevronDown
                      size={18}
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/45"
                    />
                  </div>
                  {isRoleOwner && allowOwnerRegistration && (
                    <p className="mt-2 text-xs text-[#6B7280]">Owner accounts have admin-style access in this app.</p>
                  )}
                  {!allowOwnerRegistration ? (
                    <p className="mt-2 text-xs text-[#6B7280]">Owner registration is currently disabled by admin.</p>
                  ) : null}
                </div>

                <Field label="City">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 outline-none"
                    placeholder="Enter your city"
                    autoComplete="address-level2"
                  />
                </Field>

                <Field label="Phone" optional>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 outline-none"
                    placeholder="Enter phone number (optional)"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  {!isPhoneValid && (
                    <p className="text-xs text-[#C14A4A] mt-2">Please enter a valid phone number.</p>
                  )}
                </Field>
              </>
            ) : (
              <Field label="Email verification code">
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-10 px-4 outline-none"
                  placeholder="Enter the code from your email"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </Field>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isSignUpLoaded || !canSubmit}
              className="w-full rounded-3xl bg-[#111111] hover:bg-black text-white shadow-sm tracking-widest uppercase text-xs py-3 min-h-[35px]  disabled:cursor-not-allowed"
            >
              {step === "verify" ? "Verify Email" : "Create Account"}
            </button>
          </form>

          <p className="text-center mt-4 text-sm text-[#6B7280]">
            Already have an account?{" "}
            <Link to="/login" state={{ redirectTo, redirectState }} className="font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
