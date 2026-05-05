import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Heart, ShoppingBag, User, Box, LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { getCartItems, getCartUpdatedEventName } from "../utils/cart";

const ADMIN_EMAIL = "binduprajapati1771@gmail.com";

const readRoleFromLocalUser = () => {
  try {
    const localUser = JSON.parse(localStorage.getItem("user") || "null");
    return String(localUser?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const readRoleFromClerkUser = (clerkUser) => {
  const raw =
    clerkUser?.unsafeMetadata?.role ||
    clerkUser?.publicMetadata?.role ||
    clerkUser?.unsafeMetadata?.user_role ||
    clerkUser?.publicMetadata?.user_role ||
    "";
  return String(raw).trim().toLowerCase();
};

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, user } = useUser();
  const profileButtonRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [cartCount, setCartCount] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [profileMenuPathname, setProfileMenuPathname] = useState(location.pathname);
  const [menuPosition, setMenuPosition] = useState({ top: 88, left: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const isActive = (path) => location.pathname === path;
  const isHome = location.pathname === "/";
  const effectiveIsScrolled = isHome ? isScrolled : false;
  const isTransparent = isHome && !effectiveIsScrolled;

  useEffect(() => {
    const syncCartCount = () => {
      const items = getCartItems();
      const total = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      setCartCount(total);
    };

    syncCartCount();

    const cartEvent = getCartUpdatedEventName();
    window.addEventListener(cartEvent, syncCartCount);
    window.addEventListener("storage", syncCartCount);

    return () => {
      window.removeEventListener(cartEvent, syncCartCount);
      window.removeEventListener("storage", syncCartCount);
    };
  }, [location.pathname]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const clickedOnButton =
        profileButtonRef.current &&
        profileButtonRef.current.contains(event.target);
      const clickedOnMenu =
        profileMenuRef.current &&
        profileMenuRef.current.contains(event.target);

      if (!clickedOnButton && !clickedOnMenu) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen || !profileButtonRef.current) return;

    const updateMenuPosition = () => {
      const rect = profileButtonRef.current.getBoundingClientRect();
      const menuWidth = 256; // w-64
      const left = Math.max(12, rect.right - menuWidth);
      const top = Math.max(10, rect.bottom - 8);
      setMenuPosition({ top, left });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (!isHome) return;

    const onScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const profileName = (() => {
    const email = String(user?.primaryEmailAddress?.emailAddress || "").trim();
    const fromClerk = String(user?.fullName || "").trim() || email.split("@")[0] || "";
    return fromClerk || "Profile";
  })();
  const profileInitial = profileName.charAt(0).toUpperCase();
  const profileAvatar = user?.imageUrl || "";
  const emailLower = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const role = readRoleFromClerkUser(user) || readRoleFromLocalUser();
  const isAdmin = role === "admin" || emailLower === ADMIN_EMAIL;
  const isOwner = role === "owner";
  const showDashboardLink = isAdmin || isOwner;
  const dashboardPath = isAdmin ? "/admin" : "/owner";

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    try {
      await signOut();
    } catch {
      // ignore
    }
    try {
      sessionStorage.removeItem("post_auth_redirect");
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
  };

  const handleSearchSubmit = () => {
    const query = searchTerm.trim();
    if (!query) {
      navigate("/collections");
      return;
    }
    navigate(`/collections?q=${encodeURIComponent(query)}`);
  };

  const links = [
    { path: "/", name: "Home" },
    { path: "/collections", name: "Collections" },
    { path: "/about", name: "About" },
   
  ];

  return (
    <>
      <div
        className={`w-full overflow-x-hidden transition-colors duration-500 ease-out ${
          isHome
            ? `${isTransparent ? "bg-transparent" : "bg-white"} ${
                isTransparent ? "" : "border-b border-black/10 shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
              } ${isTransparent ? "absolute" : "fixed"} top-0 left-0 right-0 z-[70]`
            : "bg-[#FFFFFF] border-b border-black/10"
        }`}
      >
      <div className="max-w-7xl mx-auto px-2 md:px-1">
        <div className="flex items-center justify-between h-20">
          
          <Link to="/" className="flex flex-col">
            <span
              className={`text-2xl font-serif font-semibold transition-colors duration-500 ${
                isTransparent ? "text-white" : "text-gray-900"
              }`}
            >
              Urban Ethnic
            </span>
            <span
              className={`text-[10px] tracking-[0.35em] transition-colors duration-500 ${
                isTransparent ? "text-white/70" : "text-gray-500"
              }`}
            >
              LUXURY RENTALS & FASHION
            </span>
          </Link>

        
          <div className="hidden md:flex items-center gap-10">
            {links.map((link, index) => (
              <Link
                key={index}
                to={link.path}
                className={`text-sm font-medium relative transition ${
                  isActive(link.path)
                    ? isTransparent
                      ? "text-white"
                      : "text-gray-900"
                    : isTransparent
                      ? "text-white/80 hover:text-white"
                      : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {link.name}
                {isActive(link.path) && (
                  <span
                    className={`absolute -bottom-2 left-0 w-full h-0.5 transition-colors duration-500 ${
                      isTransparent ? "bg-white" : "bg-gray-900"
                    }`}
                  />
                )}
              </Link>
            ))}
          </div>

          
          <div className="flex items-center gap-6">
           <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search jewellery, lehengas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              className={`pl-10 pr-4 py-2 rounded-full text-sm focus:outline-none focus:ring-1 w-64 transition-all ${
                isTransparent
                  ? "bg-white/10 border border-white/20 text-white placeholder:text-white/60 focus:ring-white/50"
                  : "bg-white border border-gray-200 text-gray-900 placeholder:text-gray-500 focus:ring-gray-400"
              }`}
            />
               <Search 
                className={`w-4 h-4 absolute left-3 cursor-pointer transition-colors duration-500 ${
                  isTransparent ? "text-white" : "text-gray-700"
                }`} 
                onClick={handleSearchSubmit}
              />
            </div>
              <Link to="/wishlist">
            <Heart className={`w-6 h-6 cursor-pointer transition-colors duration-500 ${isTransparent ? "text-white" : "text-gray-800"}`} />
            </Link>
            <div className="relative cursor-pointer">
           <Link to="/cart">
          <ShoppingBag className={`w-6 h-6 transition-colors duration-500 ${isTransparent ? "text-white" : "text-gray-800"}`} />
             </Link>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#111111] text-white text-xs rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </div>
            {isLoaded && isSignedIn ? (
              <button
                ref={profileButtonRef}
                title={profileName}
                onClick={() => {
                  setIsProfileMenuOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setProfileMenuPathname(location.pathname);
                    }
                    return next;
                  });
                }}
                className="w-10 h-10 rounded-full bg-white text-[#111111] flex items-center justify-center text-sm font-semibold overflow-hidden ring-1 ring-black/10 shadow-[0_10px_25px_rgba(0,0,0,0.15)] transition-shadow hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
              >
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt={profileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profileInitial
                )}
              </button>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-2 px-5 py-2 bg-[#111111] text-white rounded-full text-sm hover:bg-black transition"
              >
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
      </div>

      {isLoaded && isSignedIn && isProfileMenuOpen && profileMenuPathname === location.pathname && (
        <div
          ref={profileMenuRef}
          className="fixed w-64 bg-white ml-28 mt-5 border border-black/10 rounded-xl p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)] z-[80]"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button
            onClick={() => {
              navigate(isAdmin ? "/account" : isOwner ? "/owner/profile" : "/account");
              setIsProfileMenuOpen(false);
            }}
            className="w-full flex items-center gap-3 px-2 py-2.5 text-left text-[16px] text-black/80 hover:bg-black/5 rounded-lg"
          >
            <User size={19} />
            My Profile
          </button>

          {showDashboardLink ? (
            <button
              onClick={() => {
                navigate(dashboardPath);
                setIsProfileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-2 py-2.5 text-left text-[16px] text-black/80 hover:bg-black/5 rounded-lg"
            >
              <Box size={19} />
              Dashboard
            </button>
          ) : (
            <button
              onClick={() => {
                navigate("/my-rentals-orders");
                setIsProfileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-2 py-2.5 text-left text-[16px] text-black/80 hover:bg-black/5 rounded-lg"
            >
              <Box size={19} />
              My Rentals &amp; Orders
            </button>
          )}

          <div className="my-3 h-px bg-black/10" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2.5 text-left text-[16px] text-[#FF4A4A] hover:bg-[#FFF5F5] rounded-lg"
          >
            <LogOut size={19} />
            Logout
          </button>
        </div>
      )}
    </>
  );
};

export default Navbar;




