import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Package,
  Settings,
  ShoppingBag,
  PlusCircle,
  Activity,
  DollarSign,
  BarChart3,
  Tag,
  Calendar,
  LogOut,
  UserRound,
  Gem,
} from "lucide-react";
import { useClerk, useUser } from "@clerk/clerk-react";

const linkBase = "flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium transition [&_svg]:text-current";

const API_OWNER_ORDERS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/orders`;

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const OwnerSidebar = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [pendingCount, setPendingCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  const profile = useMemo(() => {
    const name =
      String(user?.fullName || "").trim() ||
      `${String(user?.firstName || "").trim()} ${String(user?.lastName || "").trim()}`.trim() ||
      String(user?.primaryEmailAddress?.emailAddress || "").trim() ||
      "Owner";

    const initials = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

    return { name, initials: initials || "O" };
  }, [user]);

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

  const linkClass = ({ isActive }) =>
    [linkBase, isActive ? "bg-[#111111] text-white" : "text-black/60 hover:bg-black/5"].join(" ");

  useEffect(() => {
    let cancelled = false;

    const computePending = (rows) =>
      rows.filter((o) => String(o?.status || "").trim().toLowerCase() === "pending").length;

    const load = async () => {
      try {
        const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
        if (!ownerEmail) throw new Error("Missing owner email");

        const res = await fetch(API_OWNER_ORDERS(ownerEmail));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data?.orders) ? data.orders : [];
        if (!cancelled) setPendingCount(computePending(rows));
      } catch {
        if (!cancelled) setPendingCount(0);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="w-72 shrink-0 bg-white border-r border-black/10 px-5 py-5 flex flex-col">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex items-center gap-4 pb-6 border-b border-black/10 w-full text-left cursor-pointer"
      >
        <div className="w-12 h-12 rounded-xl bg-[#111111] flex items-center justify-center shadow">
          <Gem size={22} className="text-white" />
        </div>

        <div>
          <h1 className="text-xl font-semibold text-black leading-tight">Urban Ethnic</h1>
          <p className="text-sm text-black/60">Owner Panel</p>
        </div>
      </button>

      <nav className="pt-5 space-y-5 flex-1">
        <div className="space-y-1">
          <NavLink to="/owner" end className={linkClass}>
            <LayoutGrid size={18} className="shrink-0" />
            Dashboard
          </NavLink>
        </div>

        <div className="border-t border-black/15" />

        <div className="space-y-1">
          <div className="px-2 pt-1 text-xs text-black/40">My products</div>
          <NavLink to="/owner/products/all" className={linkClass}>
            <Package size={18} className="shrink-0" />
            All products
          </NavLink>
          <NavLink to="/owner/products/add" className={linkClass}>
            <PlusCircle size={18} className="shrink-0" />
            Add product
          </NavLink>
          <NavLink to="/owner/products/availability" className={linkClass}>
            <Activity size={18} className="shrink-0" />
            Availability
          </NavLink>
        </div>

        <div className="mx-2 border-t border-black/10" />

        <div className="space-y-1">
          <div className="px-2 pt-1 text-xs text-black/40">Orders received</div>
          <NavLink to="/owner/orders" end className={linkClass}>
            <ShoppingBag size={18} className="shrink-0" />
            <span className="flex-1">All orders</span>
            {pendingCount > 0 && (
              <span className="min-w-5 h-5 px-2 rounded-full bg-rose-100 text-rose-700 text-[11px] flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/owner/orders/buy" className={linkClass}>
            <Tag size={18} className="shrink-0" />
            Buy orders
          </NavLink>
          <NavLink to="/owner/orders/rentals" className={linkClass}>
            <Calendar size={18} className="shrink-0" />
            Rental orders
          </NavLink>
        </div>

        <div className="mx-2 border-t border-black/10" />

        <div className="space-y-1">
          <div className="px-2 pt-1 text-xs text-black/40">Earnings</div>
          <NavLink to="/owner/earnings" className={linkClass}>
            <DollarSign size={18} className="shrink-0" />
            My earnings
          </NavLink>
          <NavLink to="/owner/reports" className={linkClass}>
            <BarChart3 size={18} className="shrink-0" />
            Reports
          </NavLink>
        </div>

        <div className="mx-2 border-t border-black/10" />

        <div className="space-y-1">
          <NavLink to="/owner/profile" className={linkClass}>
            <UserRound size={18} className="shrink-0" />
            Profile
          </NavLink>
          <NavLink to="/owner/settings" className={linkClass}>
            <Settings size={18} className="shrink-0" />
            Settings
          </NavLink>
        </div>
      </nav>

      <div className="pt-6 border-t border-black/10">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-11 w-11 rounded-full bg-black/5 flex items-center justify-center font-semibold text-sm text-black/70">
            {profile.initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-black truncate">{profile.name}</div>
            <div className="text-xs text-black/60 truncate">Owner</div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="group inline-flex items-center gap-3 text-black/60 hover:text-rose-600 transition text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LogOut size={18} className="text-black/50 group-hover:text-rose-600" />
          <span>{loggingOut ? "Logging out..." : "Logout"}</span>
        </button>
      </div>
    </aside>
  );
};

export default OwnerSidebar;
