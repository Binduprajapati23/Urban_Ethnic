import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import { useEffect } from "react";
import { requestJson } from "../../utils/http";
import { writeFeatureToggles, writePlatformConfig } from "../../utils/adminConfig";

const AdminLayout = () => {
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
        const res = await requestJson(`${API_BASE}/api/admin/settings`);
        if (cancelled) return;
        if (res?.platformConfig) writePlatformConfig(res.platformConfig);
        if (res?.featureToggles) writeFeatureToggles(res.featureToggles);
      } catch {
        // ignore (localStorage fallback still works)
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f3f0f0]">
      
      <Sidebar />

      
      <div className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default AdminLayout;






