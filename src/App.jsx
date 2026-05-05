import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthenticateWithRedirectCallback, useUser } from "@clerk/clerk-react";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import FeaturesSection from "./components/FeaturesSection";
import ShopByCategory from "./components/ShopByCategory";
import FeaturesAndCollection from "./components/FeaturesAndCollection";
import LandingPage from "./components/LandingPage";
import Footer from "./components/Footer";
import CollectionsPage from "./pages/Collection Page/CollectionsPage";
import About from "./pages/About";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CartPage from "./pages/CartPage";
import WishlistPage from "./pages/WishlistPage";
import AdminRoute from "./components/AdminRoute";
import AdminPage from "./pages/Admin/AdminPage";
import OwnerRoute from "./components/OwnerRoute";
import OwnerPage from "./pages/Owner/OwnerPage";
import RentalPolicy from "./pages/RentalPolicy";
import ProductDetailPage from "./pages/ProductDetailPage";
import RentalCheckout from "./pages/RentalCheckout";
import PaymentPage from "./pages/PaymentPage";
import TrackOrderPage from "./pages/TrackOrderPage";
import CheckoutPage from "./pages/CheckoutPage";
import AccountPage from "./pages/AccountPage";
import ReturnRequestPage from "./pages/ReturnRequestPage";
import LearnMorePage from "./pages/LearnMorePage";
import MyRentalsOrdersPage from "./pages/MyRentalsOrdersPage";
import ContactSupportPage from "./pages/ContactSupportPage";
import ClerkUserSync from "./components/ClerkUserSync";
import PostAuthHandler from "./components/PostAuthHandler";
import CityOnboardingGate from "./components/CityOnboardingGate";
import MaintenancePage from "./pages/MaintenancePage";
import { readFeatureToggles, writeFeatureToggles } from "./utils/adminConfig";
import { requestJson } from "./utils/http";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";

const readRoleFromClerkUser = (user) => {
  const raw =
    user?.unsafeMetadata?.role ||
    user?.publicMetadata?.role ||
    user?.unsafeMetadata?.user_role ||
    user?.publicMetadata?.user_role ||
    "";
  return String(raw).trim().toLowerCase();
};

const readLocalRole = () => {
  try {
    const localUser = JSON.parse(localStorage.getItem("user") || "null");
    return String(localUser?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const RouteScrollTop = () => {
  const location = useLocation();

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, location.hash]);

  return null;
};

const Home = () => {
  return (
    <div className="w-full overflow-x-hidden">
      <Hero />
      <FeaturesSection />
      <ShopByCategory />
      <FeaturesAndCollection />
      <LandingPage />
      <Footer />
    </div>
  );
};

const App = () => {
  const location = useLocation();
  const { isLoaded, isSignedIn, user } = useUser();
  const [maintenanceMode, setMaintenanceMode] = React.useState(() => Boolean(readFeatureToggles().maintenanceMode));
  const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

  React.useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "admin_feature_toggles_v1") {
        setMaintenanceMode(Boolean(readFeatureToggles().maintenanceMode));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  React.useEffect(() => {
    const onToggles = (event) => {
      const next = event?.detail;
      if (next && typeof next === "object") {
        setMaintenanceMode(Boolean(next.maintenanceMode));
      }
    };
    window.addEventListener("ue:feature-toggles", onToggles);
    return () => window.removeEventListener("ue:feature-toggles", onToggles);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const res = await requestJson(`${API_BASE}/api/admin/settings`);
        if (cancelled) return;
        if (res?.featureToggles) {
          const next = writeFeatureToggles(res.featureToggles);
          setMaintenanceMode(Boolean(next.maintenanceMode));
        }
      } catch {
        // ignore (fallback to local defaults)
      }
    };

    void sync();
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [API_BASE]);

  const email = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const role = (isLoaded && isSignedIn ? readRoleFromClerkUser(user) : "") || readLocalRole();
  const isAdmin = email === ADMIN_EMAIL || role === "admin";

  if (maintenanceMode && !location.pathname.startsWith("/admin") && !isAdmin) {
    return (
      <div>
        <RouteScrollTop />
        <ClerkUserSync />
        <PostAuthHandler />
        <MaintenancePage />
      </div>
    );
  }

  const hideNavbar =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/owner");

  return (
    <div>
      <RouteScrollTop />
      <ClerkUserSync />
      <PostAuthHandler />
      <CityOnboardingGate />
      {!hideNavbar && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
        <Route path="/product/:id" element={<ProductDetailPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/login/*" element={<LoginPage />} />
        <Route path="/register/*" element={<RegisterPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/rental-checkout" element={<RentalCheckout />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/track-order" element={<TrackOrderPage />} />
        <Route path="/my-rentals-orders" element={<MyRentalsOrdersPage />} />
        <Route path="/contact-support" element={<ContactSupportPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/return-request" element={<ReturnRequestPage />} />
        <Route path="/learn-more" element={<LearnMorePage />} />

        <Route path="/admin/*" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/owner/*" element={<OwnerRoute><OwnerPage /></OwnerRoute>} />
        <Route path="/rental-policy" element={<RentalPolicy />} />
      </Routes>
    </div>
  );
};

export default App;
