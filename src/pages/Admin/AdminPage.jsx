import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AdminLayout from "./AdminLayout";
import AdminDashboard from "./AdminDashboard";
import AdminOrders from "./AdminOrders";
import AdminBuyOrders from "./AdminBuyOrders";
import AdminProducts from "./AdminProducts";
import AdminRentals from "./AdminRentals";
import AdminSettings from "./AdminSettings";
import AdminUsers from "./AdminUsers";
import AdminCategories from "./AdminCategories";
import AdminOwners from "./AdminOwners";
import AdminRevenue from "./AdminRevenue";
import AdminProfile from "./AdminProfile";

const AdminPage = () => {
  return (
    <Routes>
      <Route path="profile" element={<AdminProfile />} />
    
      <Route element={<AdminLayout />}>
        
        <Route index element={<AdminDashboard />} />

        
        <Route path="products" element={<AdminProducts />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="buy-orders" element={<AdminBuyOrders />} />
        <Route path="rentals" element={<AdminRentals />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="owners" element={<AdminOwners />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="settings" element={<AdminSettings />} />

        
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
};

export default AdminPage;
