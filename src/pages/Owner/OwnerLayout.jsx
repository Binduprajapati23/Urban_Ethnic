import { Outlet } from "react-router-dom";
import OwnerSidebar from "./OwnerSidebar";

const OwnerLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#f3f0f0] text-[#111111]">
      <OwnerSidebar />
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default OwnerLayout;
