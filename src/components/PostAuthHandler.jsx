import { useUser } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addToCart } from "../utils/cart";

const STORAGE_KEY = "post_auth_redirect";

const readRoleFromLocalUser = () => {
  try {
    const localUser = JSON.parse(localStorage.getItem("user") || "null");
    return String(localUser?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const readRoleFromClerkUser = (user) => {
  const raw =
    user?.unsafeMetadata?.role ||
    user?.publicMetadata?.role ||
    user?.unsafeMetadata?.user_role ||
    user?.publicMetadata?.user_role ||
    "";
  return String(raw).trim().toLowerCase();
};

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";

const PostAuthHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, user } = useUser();
  const hasHandledRef = useRef(false);
  const roleRetryRef = useRef(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (hasHandledRef.current) return;

    let payload = null;
    try {
      payload = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      payload = null;
    }

    const tryRoleRedirect = () => {
      const clerkRole = readRoleFromClerkUser(user);
      const localRole = readRoleFromLocalUser();
      const role = clerkRole || localRole;
      const email = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();

      const isAdmin = role === "admin" || email === ADMIN_EMAIL;
      const isOwner = role === "owner";

      if (isAdmin && !location.pathname.startsWith("/admin")) {
        hasHandledRef.current = true;
        navigate("/admin", { replace: true });
        return true;
      }

      if (isOwner && !location.pathname.startsWith("/owner")) {
        hasHandledRef.current = true;
        navigate("/owner", { replace: true });
        return true;
      }

      return Boolean(role) || Boolean(email);
    };

    if (!payload) {
      const roleKnown = tryRoleRedirect();
      if (hasHandledRef.current) return;

      if (!roleKnown) {
        roleRetryRef.current = setTimeout(() => {
          if (hasHandledRef.current) return;
          const knownAfterRetry = tryRoleRedirect();
          if (hasHandledRef.current) return;
          if (knownAfterRetry) hasHandledRef.current = true;
        }, 250);
        return;
      }

      hasHandledRef.current = true;
      return;
    }

    hasHandledRef.current = true;
    sessionStorage.removeItem(STORAGE_KEY);

    const redirectState = payload.redirectState || null;
    if (redirectState?.postLoginAction === "add_to_cart" && redirectState?.cartItem) {
      addToCart(redirectState.cartItem);
    }

    if (tryRoleRedirect()) return;

    const redirectTo = payload.redirectTo || "/";
    navigate(redirectTo, { state: redirectState });

    return;
  }, [isLoaded, isSignedIn, location.pathname, navigate, user]);

  useEffect(
    () => () => {
      if (roleRetryRef.current) clearTimeout(roleRetryRef.current);
    },
    []
  );

  return null;
};

export default PostAuthHandler;
