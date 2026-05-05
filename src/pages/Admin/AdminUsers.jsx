import React, { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "../../utils/http";
import AdminOrdersPageShell from "../../components/AdminOrdersPageShell";
import { downloadCsv } from "../../utils/csv";

const API_BASE = String(import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const API_PEOPLE = `${API_BASE}/api/admin/people`;
const API_SET_STATUS = (email) =>
  `${API_BASE}/api/admin/people/${encodeURIComponent(String(email || "").trim().toLowerCase())}/status`;

const normalizeRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner") return "Owner";
  return "User";
};

const formatMonthYear = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const roleBadgeClass = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

const statusBadgeClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "suspended") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
};

const AdminUsers = () => {
  const [peopleRows, setPeopleRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  useEffect(() => {
    void requestJson(`${API_BASE}/api/admin/notifications/mark-read`, {
      method: "POST",
      body: JSON.stringify({ types: ["new_user"] }),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await requestJson(API_PEOPLE);
        const rows = Array.isArray(data?.people) ? data.people : [];

        const normalized = rows
          .filter((row) => String(row?.role || "").trim().toLowerCase() !== "admin")
          .map((row) => ({
            id: String(row?.id || row?.email || ""),
            name: String(row?.name || "User").trim() || "User",
            email: String(row?.email || "").trim().toLowerCase(),
            role: String(row?.role || "user").trim().toLowerCase(),
            city: String(row?.city || "").trim() || "-",
            joinedAt: row?.createdAt || row?.updatedAt || null,
            status: String(row?.status || "Active").trim() || "Active",
          }));

        if (!cancelled) setPeopleRows(normalized);
      } catch (err) {
        console.log("Failed to fetch users from database:", err?.body || err.message);
        if (!cancelled) {
          setPeopleRows([]);
          setErrorMessage("Database data load failed.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchUsers();
    window.addEventListener("focus", fetchUsers);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", fetchUsers);
    };
  }, []);

  const people = useMemo(() => (Array.isArray(peopleRows) ? peopleRows : []), [peopleRows]);

  const cities = useMemo(() => {
    const set = new Set();
    for (const person of people) {
      set.add(String(person.city || "-").trim() || "-");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filteredPeople = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();
    const role = String(roleFilter || "all").trim().toLowerCase();
    const city = String(cityFilter || "all").trim().toLowerCase();

    return people.filter((person) => {
      const matchesSearch =
        !q ||
        String(person.name || "").toLowerCase().includes(q) ||
        String(person.email || "").toLowerCase().includes(q);

      const normalizedRole = normalizeRole(person.role).toLowerCase();
      const matchesRole = role === "all" || normalizedRole === role;

      const normalizedCity = String(person.city || "-").trim().toLowerCase();
      const matchesCity = city === "all" || normalizedCity === city;

      return matchesSearch && matchesRole && matchesCity;
    });
  }, [cityFilter, people, roleFilter, searchQuery]);

  const setPersonStatus = useCallback(async (email, nextStatus) => {
    const key = String(email || "").trim().toLowerCase();
    if (!key) return;

    const safeStatus = String(nextStatus || "").trim().toLowerCase() === "suspended" ? "Suspended" : "Active";

    let previous = null;
    setPeopleRows((prev) => {
      previous = prev;
      return (Array.isArray(prev) ? prev : []).map((p) =>
        String(p?.email || "").trim().toLowerCase() === key ? { ...p, status: safeStatus } : p
      );
    });

    try {
      await requestJson(API_SET_STATUS(key), {
        method: "PATCH",
        body: JSON.stringify({ status: safeStatus }),
      });
    } catch (err) {
      console.log("Failed to update status:", err?.body || err.message);
      if (previous) setPeopleRows(previous);
      setErrorMessage("Failed to update status. Please try again.");
    }
  }, []);

  const exportCsv = useCallback(() => {
    const rows = filteredPeople.map((person) => [
      String(person.name || ""),
      String(person.email || ""),
      normalizeRole(person.role),
      String(person.city || "-"),
      formatMonthYear(person.joinedAt),
      String(person.status || "Active"),
    ]);

    downloadCsv({
      filename: "users.csv",
      headers: ["Name", "Email", "Role", "City", "Joined", "Status"],
      rows,
    });
  }, [filteredPeople]);

  const cityOptions = useMemo(
    () => [{ value: "all", label: "All cities" }, ...cities.map((c) => ({ value: c.toLowerCase(), label: c }))],
    [cities]
  );

  return (
    <AdminOrdersPageShell
      title="Users"
      subtitle="All registered customers and owners on the platform."
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      searchPlaceholder="Search name / email..."
      typeFilter={roleFilter}
      onTypeFilterChange={setRoleFilter}
      typeOptions={[
        { value: "all", label: "All roles" },
        { value: "user", label: "User" },
        { value: "owner", label: "Owner" },
      ]}
      statusFilter={cityFilter}
      onStatusFilterChange={setCityFilter}
      statusOptions={cityOptions}
      onExportCsv={exportCsv}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111111]">
              <tr className="text-xs font-bold tracking-[0.22em] uppercase text-white/90">
                <th className="text-left px-6 py-5 border-b border-white/10">Name</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Email</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Role</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">City</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Joined</th>
                <th className="text-left px-4 py-5 border-b border-white/10 border-l border-white/10">Status</th>
                <th className="text-right px-6 py-5 border-b border-white/10 border-l border-white/10">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : errorMessage ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-red-500">
                    {errorMessage}
                  </td>
                </tr>
              ) : filteredPeople.length > 0 ? (
                filteredPeople.map((person) => {
                  const role = normalizeRole(person.role);
                  const status = String(person.status || "Active");
                  const suspended = status.toLowerCase() === "suspended";
                  const emailKey = String(person.email || "").trim().toLowerCase();

                  return (
                    <tr key={emailKey || person.id} className="bg-white hover:bg-[#E6E6E6] transition-colors">
                      <td className="py-4 px-6">
                        <div className="text-sm font-bold text-[#111111]">{person.name}</div>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-600">{person.email || "-"}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${roleBadgeClass(role)}`}>
                          {role}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm font-semibold text-[#111111]">{person.city || "-"}</td>
                      <td className="py-4 px-4 text-sm font-semibold text-[#111111]">{formatMonthYear(person.joinedAt)}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-bold ${statusBadgeClass(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => setPersonStatus(person.email, suspended ? "Active" : "Suspended")}
                          className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-semibold text-[#111111] transition"
                          disabled={!person.email}
                          title={!person.email ? "Missing email" : ""}
                        >
                          {suspended ? "Restore" : "Suspend"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOrdersPageShell>
  );
};

export default AdminUsers;
