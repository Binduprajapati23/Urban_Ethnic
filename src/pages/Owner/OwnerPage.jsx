import { Routes, Route, Navigate } from "react-router-dom";

import OwnerLayout from "./OwnerLayout";
import OwnerDashboard from "./OwnerDashboard";
import OwnerOrders from "./OwnerOrders";
import OwnerBuyOrders from "./OwnerBuyOrders";
import OwnerRentalOrders from "./OwnerRentalOrders";
import OwnerAllProducts from "./OwnerAllProducts";
import OwnerAddProduct from "./OwnerAddProduct";
import OwnerAvailability from "./OwnerAvailability";
import OwnerEarnings from "./OwnerEarnings";
import OwnerReports from "./OwnerReports";
import OwnerSettings from "./OwnerSettings";
import OwnerProfile from "./OwnerProfile";

const OwnerPage = () => {
  return (
    <Routes>
      <Route path="profile" element={<OwnerProfile />} />
      <Route element={<OwnerLayout />}>
        <Route index element={<OwnerDashboard />} />
        <Route path="dashboard" element={<OwnerDashboard />} />
        <Route path="orders" element={<OwnerOrders />} />
        <Route path="orders/buy" element={<OwnerBuyOrders />} />
        <Route path="orders/rentals" element={<OwnerRentalOrders />} />
        <Route path="products" element={<OwnerAllProducts />} />
        <Route path="products/all" element={<OwnerAllProducts />} />
        <Route path="products/add" element={<OwnerAddProduct />} />
        <Route path="products/availability" element={<OwnerAvailability />} />
        <Route path="earnings" element={<OwnerEarnings />} />
        <Route path="reports" element={<OwnerReports />} />
        <Route path="settings" element={<OwnerSettings />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
};

export default OwnerPage;
