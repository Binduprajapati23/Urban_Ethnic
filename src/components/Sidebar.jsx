import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {LayoutDashboard,Package,ShoppingCart,Calendar,Users,Settings,LogOut,PackageCheck,List,User, DollarSign,} from "lucide-react";
import { Gem } from "lucide-react";
import { useClerk } from "@clerk/clerk-react";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const API_ALL_ORDERS = `${API_BASE}/api/admin/all-orders`;
const API_OWNER_REQUESTS = `${API_BASE}/api/admin/owners/requests`;
const API_ADMIN_NOTIFICATION_COUNTS = `${API_BASE}/api/admin/notifications/unread-counts`;

const readLocalArray = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const Sidebar = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const [pendingCount, setPendingCount] = useState(0);
  const [ownerRequestsCount, setOwnerRequestsCount] = useState(0);
  const [adminBadgeCounts, setAdminBadgeCounts] = useState({
    new_user: 0,
    new_buy_order: 0,
    new_rental_order: 0,
  });
  const ownerName = (() => {
    try {
      const owner = JSON.parse(localStorage.getItem("admin_owner_profile") || "null");
      return String(owner?.name || "Admin").trim() || "Admin";
    } catch {
      return "Admin";
    }
  })();
  const ownerInitials =
    ownerName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "AD";

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    localStorage.removeItem("user");
    localStorage.removeItem("isAdmin");
    navigate("/login", { replace: true });
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-5 py-3 rounded-xl font-medium transition [&_svg]:text-current
     ${
       isActive
         ? "bg-[#111111] text-white"
         : "text-black/60 hover:bg-black/5"
     }`;

  const markAdminNotificationsRead = async (types) => {
    const safeTypes = Array.isArray(types) ? types.filter(Boolean) : [];
    if (!safeTypes.length) return;

    try {
      await fetch(`${API_BASE}/api/admin/notifications/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: safeTypes }),
      });
    } catch {
      // ignore
    }

    setAdminBadgeCounts((prev) => {
      const next = { ...prev };
      for (const type of safeTypes) {
        if (Object.prototype.hasOwnProperty.call(next, type)) next[type] = 0;
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const computePending = (rows) =>
      rows.filter((o) => String(o?.status || "").trim().toLowerCase() === "pending").length;

    const load = async () => {
      try {
        const res = await fetch(API_ALL_ORDERS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data?.orders) ? data.orders : [];
        if (!cancelled) setPendingCount(computePending(rows));
      } catch {
        const fallback = readLocalArray("admin_orders");
        if (!cancelled) setPendingCount(computePending(fallback));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(API_OWNER_REQUESTS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data?.requests) ? data.requests : [];
        if (!cancelled) setOwnerRequestsCount(rows.length);
      } catch {
        if (!cancelled) setOwnerRequestsCount(0);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(API_ADMIN_NOTIFICATION_COUNTS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const counts = data?.counts && typeof data.counts === "object" ? data.counts : {};
        if (!cancelled) {
          setAdminBadgeCounts({
            new_user: Number(counts.new_user || 0) || 0,
            new_buy_order: Number(counts.new_buy_order || 0) || 0,
            new_rental_order: Number(counts.new_rental_order || 0) || 0,
          });
        }
      } catch {
        if (!cancelled) {
          setAdminBadgeCounts({ new_user: 0, new_buy_order: 0, new_rental_order: 0 });
        }
      }
    };

    void load();
    window.addEventListener("focus", load);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  return (
    <aside className="w-72 bg-white border-r border-black/10 flex flex-col justify-between p-5">
      <div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-4 pb-6 border-b border-black/10 w-full text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-[#111111] flex items-center justify-center shadow">
            <Gem size={22} className="text-white" />
          </div>

          <div>
            <h1 className="text-xl font-semibold text-black leading-tight">
              Urban Ethnic
            </h1>
            <p className="text-sm text-black/60">
              Admin Panel
            </p>
          </div>
        </button>

        <nav className="pt-5 space-y-5">
          <div className="space-y-1">
            <NavLink to="/admin" end className={linkClass}>
              <LayoutDashboard size={20} /> Dashboard
            </NavLink>
          </div>

          <div className="border-t border-black/15" />

          <div className="space-y-1">
            <div className="px-2 pt-1 text-xs text-black/40">Catalog</div>
            <NavLink to="/admin/products" className={linkClass}>
              <Package size={20} /> Products
            </NavLink>
            <NavLink to="/admin/categories" className={linkClass}>
              <List size={20} /> Categories
            </NavLink>
          </div>

          <div className="mx-2 border-t border-black/10" />

          <div className="space-y-1">
            <div className="px-2 pt-1 text-xs text-black/40">Orders</div>
            <NavLink to="/admin/orders" className={linkClass}>
              <ShoppingCart size={20} /> <span className="flex-1">All orders</span>
              {pendingCount > 0 && (
                <span className="min-w-5 h-5 px-2 rounded-full bg-rose-100 text-rose-700 text-[11px] flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/admin/buy-orders"
              className={linkClass}
              onClick={() => markAdminNotificationsRead(["new_buy_order"])}
            >
              <PackageCheck size={20} /> <span className="flex-1">Buy orders</span>
              {adminBadgeCounts.new_buy_order > 0 && (
                <span className="min-w-5 h-5 px-2 rounded-full bg-emerald-100 text-emerald-700 text-[11px] flex items-center justify-center">
                  {adminBadgeCounts.new_buy_order}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/admin/rentals"
              className={linkClass}
              onClick={() => markAdminNotificationsRead(["new_rental_order"])}
            >
              <Calendar size={20} /> <span className="flex-1">Rental orders</span>
              {adminBadgeCounts.new_rental_order > 0 && (
                <span className="min-w-5 h-5 px-2 rounded-full bg-sky-100 text-sky-700 text-[11px] flex items-center justify-center">
                  {adminBadgeCounts.new_rental_order}
                </span>
              )}
            </NavLink>
          </div>

          <div className="mx-2 border-t border-black/10" />

          <div className="space-y-1">
            <div className="px-2 pt-1 text-xs text-black/40">People</div>
            <NavLink to="/admin/users" className={linkClass} onClick={() => markAdminNotificationsRead(["new_user"])}>
              <Users size={20} /> <span className="flex-1">Users</span>
              {adminBadgeCounts.new_user > 0 && (
                <span className="min-w-5 h-5 px-2 rounded-full bg-amber-100 text-amber-700 text-[11px] flex items-center justify-center">
                  {adminBadgeCounts.new_user}
                </span>
              )}
            </NavLink>
            <NavLink to="/admin/owners" className={linkClass}>
              <User size={20} /> <span className="flex-1">Owners</span>
              {ownerRequestsCount > 0 && (
                <span className="min-w-5 h-5 px-2 rounded-full bg-emerald-100 text-emerald-700 text-[11px] flex items-center justify-center">
                  {ownerRequestsCount}
                </span>
              )}
            </NavLink>
          </div>

          <div className="mx-2 border-t border-black/10" />

          <div className="space-y-1">
            <div className="px-2 pt-1 text-xs text-black/40">Finance</div>
            <NavLink to="/admin/revenue" className={linkClass}>
              <DollarSign size={20} /> Revenue
            </NavLink>
          </div>

          <div className="mx-2 border-t border-black/10" />

          <div className="space-y-1">
            <NavLink to="/admin/settings" className={linkClass}>
              <Settings size={20} /> Settings
            </NavLink>
          </div>
        </nav>
      </div>

     
      <div className="pt-6 border-t border-black/10">
        
        <div className="flex items-center mr-4 gap-4 mb-6">
          <div className="w-11 h-11 rounded-full bg-black/5 flex items-center justify-center text-black/70 font-semibold text-sm">
            {ownerInitials}
          </div>

          <div>
            <p className="text-sm font-semibold text-black leading-tight">
              {ownerName}
            </p>
            <p className="text-xs text-black/60">Admin</p>
          </div>
        </div>

       
        <button
          onClick={handleLogout}
          className="flex items-center ml-3 gap-3 text-black/60 hover:text-red-600 transition text-sm"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
