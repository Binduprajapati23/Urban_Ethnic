import { useUser } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../utils/http";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";

const readRole = (user) => {
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

const OwnerRoute = ({ children }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const API_BASE = "http://localhost:5000";

  if (!isLoaded) return null;
  if (!isSignedIn || !user) return <Navigate to="/login" replace />;

  const identity = useMemo(() => {
    const clerkId = String(user?.id || "").trim();
    const email = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
    return { clerkId, email };
  }, [user?.id, user?.primaryEmailAddress?.emailAddress]);

  const [access, setAccess] = useState({ loading: true, role: null, status: "Active", approvalStatus: "approved" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (identity.clerkId) params.set("clerkId", identity.clerkId);
        if (identity.email) params.set("email", identity.email);
        const qs = params.toString();
        const data = await requestJson(`${API_BASE}/api/users/access?${qs}`);

        if (cancelled) return;
        setAccess({
          loading: false,
          role: String(data?.role || "").trim().toLowerCase() || null,
          status: String(data?.status || "Active").trim() || "Active",
          approvalStatus: String(data?.approvalStatus || "approved").trim().toLowerCase() || "approved",
        });
      } catch {
        if (cancelled) return;
        const role = readRole(user) || readLocalRole();
        setAccess({ loading: false, role, status: "Active", approvalStatus: "approved" });
      }
    };

    if (!identity.clerkId && !identity.email) {
      const role = readRole(user) || readLocalRole();
      setAccess({ loading: false, role, status: "Active", approvalStatus: "approved" });
      return () => {
        cancelled = true;
      };
    }

    setAccess((prev) => ({ ...prev, loading: true }));
    void load();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, identity.clerkId, identity.email, user]);

  if (access.loading) return null;

  const isOwner = String(access.role || "").trim().toLowerCase() === "owner";
  if (!isOwner) return <Navigate to="/" replace />;

  const normalizedStatus = String(access.status || "").trim().toLowerCase();
  if (normalizedStatus === "suspended") return <Navigate to="/" replace />;

  const normalizedApproval = String(access.approvalStatus || "").trim().toLowerCase();
  if (normalizedApproval !== "approved") return <Navigate to="/" replace />;

  return children;
};

export default OwnerRoute;
