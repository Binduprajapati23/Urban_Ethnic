import { SignIn } from "@clerk/clerk-react";
import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEY = "post_auth_redirect";

const clerkAppearance = {
  variables: {
    colorPrimary: "#111111",
    colorText: "#111111",
    colorTextSecondary: "#6B7280",
    fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
    borderRadius: "24px",
  },
  elements: {
   
    main: "!p-0",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton:
      "w-full rounded-3xl min-h-[35px] border border-black/10 shadow-sm hover:bg-white bg-white/70 text-black/80",
    dividerLine: "bg-black/10",
    dividerText: "text-[#6B7280] text-[12px] tracking-widest uppercase",
    formFieldLabel: "text-[#6B7280] text-sm",
    formFieldInput:
      "rounded-3xl border border-black/10 bg-white/90 text-black/80 placeholder:text-black/40 focus:ring-2 focus:ring-black/15 h-12",
    formButtonPrimary:
      "w-full rounded-3xl bg-[#111111] hover:bg-black text-white shadow-sm tracking-widest uppercase text-xs py-4 min-h-[35px]",
    footer: "hidden",
    footerAction: "hidden",
    badge: "hidden",
  },
};

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo;
  const redirectState = location.state?.redirectState;
  const message = location.state?.message;
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    try {
      if (!redirectTo && !redirectState) return;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ redirectTo, redirectState }));
    } catch {
  
    }
  }, [redirectTo, redirectState]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      navigate(redirectTo || "/", { replace: true, state: redirectState });
    }
  }, [isLoaded, isSignedIn, navigate, redirectTo, redirectState]);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center bg-[#E6E6E6] px-3 sm:px-6 py-12">
        <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg bg-white/80 backdrop-blur rounded-[32px] shadow-2xl shadow-black/10 border border-black/5 p-5 sm:p-10 overflow-hidden">
          <div className="text-center mb-8">
            <h1 className="text-xl font-serif text-[#6B7280]">Urban Ethnic</h1>
            <p className="text-[11px] tracking-[0.3em] text-[#6B7280] mt-1">LUXURY RENTALS & FASHION</p>
          </div>

          {message && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {message}
            </div>
          )}

          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/register"
            afterSignInUrl={redirectTo || "/"}
            appearance={clerkAppearance}
          />

          <p className="text-center mt-8 text-sm text-[#6B7280]">
            Don&apos;t have an account?{" "}
            <Link to="/register" state={{ redirectTo, redirectState }} className="font-medium hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:block relative overflow-hidden">
        <img
          src="https://i.pinimg.com/1200x/36/e7/ec/36e7ec14a2ce4718c41ffcd934be6fbe.jpg"
          alt="Luxury Jewellery"
          className="absolute inset-0 w-full h-screen object-cover"
        />
        <div className="absolute inset-0 bg-[#111111]/10 mix-blend-multiply" />
        <div className="absolute bottom-16 left-12 right-12 text-white">
          <h3 className="font-serif text-5xl mb-4">Timeless Elegance</h3>
          <p className="text-white/90 max-w-md text-lg leading-relaxed">
            Access exclusive bridal collections and manage your rentals with ease.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
