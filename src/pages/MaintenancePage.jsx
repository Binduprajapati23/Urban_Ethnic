import { useMemo } from "react";
import { readPlatformConfig } from "../utils/adminConfig";

const MaintenancePage = () => {
  const cfg = useMemo(() => readPlatformConfig(), []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E6E6E6] px-4">
      <div className="w-full max-w-lg bg-white/80 backdrop-blur rounded-[32px] shadow-2xl shadow-black/10 border border-black/5 p-6 sm:p-10">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-[#111111]">{cfg.platformName}</h1>
          <p className="text-[11px] tracking-[0.3em] text-[#6B7280] mt-2">MAINTENANCE</p>
        </div>

        <div className="mt-8 text-center space-y-3">
          <div className="text-lg font-semibold text-[#111111]">We&apos;ll be back soon</div>
          <div className="text-sm text-[#6B7280]">
            The platform is temporarily offline for maintenance.
          </div>
          <div className="text-sm text-[#6B7280]">
            Need help? Contact{" "}
            <span className="font-medium text-[#111111]">{cfg.supportEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;

