import { useClerk, useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";
const REGISTER_SYNC_KEY = "ue:register_sync_v1";
const ACCOUNT_MISSING_MESSAGE = "Account does not exist. Please register.";

const safeSetLocalUser = (value) => {
  try {
    if (value) {
      localStorage.setItem("user", JSON.stringify(value));
    } else {
      localStorage.removeItem("user");
    }
  } catch {
    // ignore storage failures
  }
};

const syncUserToDatabase = async ({ clerkId, name, email, role, city, phone, mode }) => {
  try {
    await fetch("http://localhost:5000/api/users/clerk-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkId, name, email, role, city, phone, mode }),
    });
  } catch {
    // ignore network failures
  }
};

const ClerkUserSync = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      safeSetLocalUser(null);
      return;
    }

    const email = String(user.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();

    const metadataRole = String(
      user.unsafeMetadata?.role || user.publicMetadata?.role || user.unsafeMetadata?.user_role || ""
    )
      .trim()
      .toLowerCase();

    let role = "";
    if (email === ADMIN_EMAIL) {
      role = "admin";
    } else if (metadataRole === "admin" || metadataRole === "owner" || metadataRole === "user") {
      role = metadataRole;
    }
    const name =
      String(user.fullName || "").trim() ||
      `${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim() ||
      email;
    const city = String(user.unsafeMetadata?.city || user.publicMetadata?.city || "").trim();
    const phone =
      String(user.unsafeMetadata?.phone || user.publicMetadata?.phone || "").trim() ||
      String(user.phoneNumbers?.[0]?.phoneNumber || "").trim();

    const payload = {
      id: user.id,
      name,
      email,
      role,
      city,
      phone,
    };

    safeSetLocalUser(payload);

    const isAdmin = payload.email === ADMIN_EMAIL;

    const doSync = async () => {
      if (isAdmin) {
        await syncUserToDatabase({
          clerkId: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          city: payload.city,
          phone: payload.phone,
          mode: "login",
        });
        return;
      }

      let registerMode = false;
      try {
        registerMode = sessionStorage.getItem(REGISTER_SYNC_KEY) === "1";
      } catch {
        registerMode = false;
      }

      if (registerMode) {
        try {
          sessionStorage.removeItem(REGISTER_SYNC_KEY);
        } catch {
          // ignore
        }

        await syncUserToDatabase({
          clerkId: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          city: payload.city,
          phone: payload.phone,
          mode: "register",
        });
        return;
      }

      try {
        const params = new URLSearchParams();
        params.set("clerkId", payload.id);
        params.set("email", payload.email);
        const res = await fetch(`http://localhost:5000/api/users/access?${params.toString()}`);
        const data = await res.json().catch(() => null);

        if (data?.found === false) {
          safeSetLocalUser(null);
          try {
            localStorage.removeItem("user");
          } catch {
            // ignore
          }
          await signOut();
          navigate("/login", { replace: true, state: { message: ACCOUNT_MISSING_MESSAGE } });
          return;
        }

        const normalizedStatus = String(data?.status || "").trim().toLowerCase();
        const reactivated = Boolean(data?.reactivated);
        if (reactivated || normalizedStatus === "active") {
          try {
            const existing = JSON.parse(localStorage.getItem("user") || "{}") || {};
            if (existing?.deactivated) {
              localStorage.setItem("user", JSON.stringify({ ...existing, deactivated: false, deactivatedAt: null }));
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // if access check fails (offline), fall back to syncing so existing users still work.
      }

      await syncUserToDatabase({
        clerkId: payload.id,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        city: payload.city,
        phone: payload.phone,
        mode: "login",
      });
    };

    void doSync();
  }, [
    isLoaded,
    isSignedIn,
    user?.id,
    user?.fullName,
    user?.firstName,
    user?.lastName,
    user?.primaryEmailAddress?.emailAddress,
    user?.unsafeMetadata?.role,
    user?.publicMetadata?.role,
    user?.unsafeMetadata?.user_role,
    user?.unsafeMetadata?.city,
    user?.publicMetadata?.city,
    navigate,
    signOut,
  ]);

  return null;
};

export default ClerkUserSync;
