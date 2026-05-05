import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";

const API_OWNER_RENTALS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/rentals`;
const API_OWNER_RETURN_REQUESTS = (email) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/returns/requests`;
const API_OWNER_RETURN_STAGE = (email, id) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/returns/requests/${encodeURIComponent(String(id || ""))}/stage`;
const API_OWNER_RENTAL_STATUS = (email, orderId) =>
  `http://localhost:5000/api/owner/${encodeURIComponent(String(email || "").trim().toLowerCase())}/rentals/${encodeURIComponent(String(orderId || ""))}/status`;

const formatINR = (value) => `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;

const formatDateSimple = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB").replaceAll("/", "-");
};

const normalizeDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
};

const RETURN_STEPS = ["Request Sent", "Item Received", "Return Confirmed", "Returned"];

const stepIndexFromStage = (stage) => {
  const normalized = String(stage || "").trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized.includes("returned")) return 3;
  if (normalized.includes("confirm")) return 2;
  if (normalized.includes("received")) return 1;
  return 0;
};

const nextReturnStage = (stage) => {
  const idx = stepIndexFromStage(stage);
  return RETURN_STEPS[Math.min(RETURN_STEPS.length - 1, idx + 1)];
};

const ReturnTimeline = ({ stage = "Request Sent" }) => {
  const activeIdx = stepIndexFromStage(stage);
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max pr-2">
        {RETURN_STEPS.map((label, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          const circleClass = done
            ? "bg-emerald-600 border-emerald-600"
            : active
              ? "bg-[#111111] border-[#111111]"
              : "bg-white border-black/20";
          const textClass = done ? "text-black/80" : active ? "text-black" : "text-black/50";
          return (
            <div key={label} className="flex items-center gap-2 min-w-0">
              <span className={["h-6 w-6 rounded-full border flex items-center justify-center shadow-sm", circleClass].join(" ")}>
                <span className={["h-2.5 w-2.5 rounded-full", done || active ? "bg-white" : "bg-black/20"].join(" ")} />
              </span>
              <span className={["text-xs font-medium whitespace-nowrap", textClass].join(" ")}>{label}</span>
              {idx < RETURN_STEPS.length - 1 && (
                <span className={["h-px w-8 sm:w-12", done ? "bg-emerald-200" : "bg-black/10"].join(" ")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const computeDays = ({ totalDays, pickupDate, returnDate }) => {
  const explicit = Number(totalDays);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const start = new Date(String(pickupDate || ""));
  const end = new Date(String(returnDate || ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const ms = end.getTime() - start.getTime();
  const diff = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diff);
};

const deriveReturnDate = ({ returnDate, pickupDate, totalDays }) => {
  if (returnDate) return returnDate;
  const start = new Date(String(pickupDate || ""));
  const days = Number(totalDays);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(days) || days <= 0) return "";
  const next = new Date(start);
  next.setDate(next.getDate() + Math.max(0, Math.trunc(days) - 1));
  return next.toISOString().slice(0, 10);
};

const statusPill = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized === "returned") return "bg-slate-100 text-slate-700 border-slate-200";
  if (normalized === "return_requested") return "bg-orange-50 text-orange-700 border-orange-200";
  if (normalized === "delivered") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "active") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-black/5 text-black/70 border-black/10";
};

const normalizeRentalStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "active";
  if (normalized === "return_requested" || normalized.includes("return request") || normalized.includes("requested")) {
    return "return_requested";
  }
  if (
    normalized === "returned" ||
    normalized === "return_confirmed" ||
    normalized === "returnconfirmed" ||
    normalized.includes("return confirmed") ||
    normalized.includes("returned") ||
    normalized === "completed" ||
    normalized === "approved" ||
    normalized === "delivered"
  ) {
    return "history";
  }
  // Pending/active-like states remain visible in active rentals.
  return "active";
};

const rentalIdentityKey = (r) =>
  String(r?.orderId || r?.rentalId || r?.id || "").trim() ||
  `${String(r?.customer || "").trim().toLowerCase()}::${String(r?.product || "").trim().toLowerCase()}::${normalizeDateKey(
    r?.pickupDate
  )}`;

const normalizeRental = (rental) => {
  const id = String(rental?.id || rental?.rental_id || rental?.order_id || "").trim() || "-";
  const orderId = String(rental?.orderId || rental?.order_id || "").trim();
  const rentalId = String(rental?.rentalId || rental?.rental_id || "").trim();
  const customer = String(rental?.customer || rental?.name || "").trim() || "Customer";
  const owner =
    String(rental?.owner || rental?.ownerName || "").trim() ||
    String((Array.isArray(rental?.items) ? rental.items : [])?.[0]?.owner || (Array.isArray(rental?.items) ? rental.items : [])?.[0]?.ownerName || "").trim() ||
    "—";
  const items = Array.isArray(rental?.items) ? rental.items : [];
  const firstItem = items[0] || {};
  const image = String(
    firstItem?.image ||
      rental?.image ||
      rental?.productImage ||
      rental?.product_image ||
      ""
  ).trim();
  const product = String(
    items?.[0]?.name ||
      rental?.product ||
      rental?.productName ||
      rental?.product_name ||
      rental?.item ||
      rental?.name ||
      ""
  ).trim() || "-";
  const pickupDate =
    rental?.pickupDate ||
    rental?.pickup_date ||
    rental?.rentFrom ||
    rental?.startDate ||
    rental?.rentalDate ||
    rental?.date;
  const returnDateRaw =
    rental?.returnDate ||
    rental?.return_date ||
    rental?.dueDate ||
    rental?.due_date ||
    rental?.rentalEndDate ||
    rental?.rental_end_date ||
    rental?.endDate;
  const amount = Number(rental?.amount || rental?.total || 0);
  const dailyRate = Number(
    rental?.dailyRate || rental?.daily_rate || rental?.rate || rental?.pricePerDay || firstItem?.price || 0
  );
  const explicitTotalDays = Number(
    rental?.totalDays || rental?.total_days || rental?.days || firstItem?.days || firstItem?.totalDays || 0
  );
  const depositRaw = Number(rental?.deposit || rental?.securityDeposit || 0);
  const inferredDeposit = depositRaw > 0 ? depositRaw : amount > 5000 ? 5000 : 0;
  const derivedDaysFromAmount =
    dailyRate > 0 && amount > inferredDeposit
      ? Math.max(1, Math.round((amount - inferredDeposit) / dailyRate))
      : null;
  const normalizedTotalDays =
    Number.isFinite(explicitTotalDays) && explicitTotalDays > 0
      ? Math.trunc(explicitTotalDays)
      : derivedDaysFromAmount;
  const returnDate = deriveReturnDate({ returnDate: returnDateRaw, pickupDate, totalDays: normalizedTotalDays });
  const normalizedAmount =
    amount || (dailyRate && computeDays({ totalDays: normalizedTotalDays, pickupDate, returnDate }) ? dailyRate * computeDays({ totalDays: normalizedTotalDays, pickupDate, returnDate }) : 0);
  const normalizedStatus = normalizeRentalStatus(rental?.status);
  const rawStatus = String(rental?.status || "").trim();
  const status =
    normalizedStatus === "history"
      ? rawStatus || "Returned"
      : normalizedStatus === "return_requested"
        ? "Return requested"
        : "Active";

  return {
    raw: rental,
    id,
    orderId,
    rentalId,
    customer,
    owner,
    product,
    image,
    pickupDate,
    returnDate,
    days: computeDays({ totalDays: normalizedTotalDays, pickupDate, returnDate }) || normalizedTotalDays || null,
    amount: normalizedAmount,
    status,
    normalizedStatus,
  };
};

const normalizeReturnRequest = (req, index) => {
  const id = String(req?.id || req?.request_id || req?.requestId || `RR-${index}`).trim();
  const customerName = String(req?.customerName || req?.customer || "Customer").trim() || "Customer";
  const productName = String(req?.productName || req?.product_name || req?.product || "Product").trim() || "Product";
  const rentalEndDate = String(req?.rentalEndDate || req?.rental_end_date || req?.returnDate || "").trim();
  const returnReason = String(req?.returnReason || req?.return_reason || "").trim();
  const conditionReported = String(req?.conditionReported || req?.condition_reported || "").trim();
  const stage = String(req?.stage || "Request Sent").trim() || "Request Sent";
  const orderId = String(req?.orderId || req?.order_id || "").trim();
  const rentalId = String(req?.rentalId || req?.rental_id || "").trim();
  return { id, customerName, productName, rentalEndDate, returnReason, conditionReported, stage, orderId, rentalId };
};

const OwnerRentalOrders = () => {
  const { user } = useUser();
  const ownerEmail = String(user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const [rentals, setRentals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [returnRequests, setReturnRequests] = useState([]);
  const [returnRequestsLoading, setReturnRequestsLoading] = useState(true);
  const [returnRequestsError, setReturnRequestsError] = useState("");
  const [details, setDetails] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const fetchRentals = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      if (!ownerEmail) throw new Error("Missing owner email");
      const res = await fetch(API_OWNER_RENTALS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.rentals) ? data.rentals : [];
      const normalizedRows = rows.map(normalizeRental);
      const statusRank = { history: 3, return_requested: 2, active: 1 };
      const deduped = new Map();
      for (const row of normalizedRows) {
        const key = rentalIdentityKey(row);
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, row);
          continue;
        }
        const prevRank = statusRank[String(existing?.normalizedStatus || "active")] || 0;
        const nextRank = statusRank[String(row?.normalizedStatus || "active")] || 0;
        if (nextRank >= prevRank) deduped.set(key, row);
      }
      setRentals(Array.from(deduped.values()));
    } catch (err) {
      console.log("OwnerRentalOrders rentals fetch failed:", err?.message || err);
      setRentals([]);
      setError("Unable to load rental orders for this owner.");
    } finally {
      setIsLoading(false);
    }
  }, [ownerEmail]);

  const fetchReturnRequests = useCallback(async () => {
    setReturnRequestsLoading(true);
    setReturnRequestsError("");
    try {
      if (!ownerEmail) throw new Error("Missing owner email");
      const res = await fetch(API_OWNER_RETURN_REQUESTS(ownerEmail));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.requests) ? data.requests : [];
      setReturnRequests(
        rows
          .map(normalizeReturnRequest)
          .filter((r) => String(r?.stage || "").trim().toLowerCase() !== "returned")
      );
    } catch (err) {
      console.log("OwnerRentalOrders return-requests fetch failed:", err?.message || err);
      setReturnRequests([]);
      setReturnRequestsError("Unable to load return requests.");
    } finally {
      setReturnRequestsLoading(false);
    }
  }, [ownerEmail]);

  useEffect(() => {
    fetchRentals();
  }, [fetchRentals]);

  useEffect(() => {
    fetchReturnRequests();
  }, [fetchReturnRequests]);

  const activeVisible = useMemo(
    () => {
      const returnRequestKeys = new Set(
        returnRequests.flatMap((req) => [
          String(req?.orderId || "").trim(),
          String(req?.rentalId || "").trim(),
        ]).filter(Boolean)
      );
      const returnedKeys = new Set(
        rentals
          .filter((r) => String(r?.normalizedStatus || "").trim().toLowerCase() === "history")
          .flatMap((r) => [
            String(r?.id || "").trim(),
            String(r?.orderId || "").trim(),
            String(r?.rentalId || "").trim(),
            rentalIdentityKey(r),
          ])
          .filter(Boolean)
      );
      return rentals.filter((r) => {
        const status = String(r?.normalizedStatus || "").trim().toLowerCase();
        if (status !== "active" && status !== "return_requested") return false;
        if (returnedKeys.has(String(r?.id || "").trim())) return false;
        if (returnedKeys.has(String(r?.orderId || "").trim())) return false;
        if (returnedKeys.has(String(r?.rentalId || "").trim())) return false;
        if (returnedKeys.has(rentalIdentityKey(r))) return false;
        if (returnRequestKeys.has(String(r?.id || "").trim())) return false;
        if (returnRequestKeys.has(String(r?.orderId || "").trim())) return false;
        if (returnRequestKeys.has(String(r?.rentalId || "").trim())) return false;
        return true;
      });
    },
    [rentals, returnRequests]
  );
  const historyVisible = useMemo(
    () => rentals.filter((r) => String(r?.normalizedStatus || "").trim().toLowerCase() === "history"),
    [rentals]
  );

  const openDetails = useCallback((kind, payload) => setDetails({ kind, payload }), []);
  const closeDetails = useCallback(() => setDetails(null), []);

  const confirmReturn = useCallback(
    async (requestId) => {
      const current = returnRequests.find((r) => r.id === requestId);
      if (!current) return;

      const nextStage = "Returned";
      const lookupOrderId = String(current.orderId || current.rentalId || "").trim();
      const lookupRentalId = String(current.rentalId || "").trim();
      const normalizedProduct = String(current.productName || "").trim().toLowerCase();
      const normalizedCustomer = String(current.customerName || "").trim().toLowerCase();

      if (details?.kind === "returnRequest" && details?.payload?.id === requestId) {
        setDetails(null);
      }
      setReturnRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRentals((prev) =>
        prev.map((r) => {
          const rOrder = String(r?.orderId || r?.id || "").trim();
          const rRental = String(r?.rentalId || "").trim();
          const byId = Boolean(lookupOrderId) && rOrder === lookupOrderId;
          const byRentalId = Boolean(lookupRentalId) && rRental === lookupRentalId;
          const byIdentity =
            String(r?.product || "").trim().toLowerCase() === normalizedProduct &&
            String(r?.customer || "").trim().toLowerCase() === normalizedCustomer;
          if (!byId && !byRentalId && !byIdentity) return r;
          return { ...r, status: "Returned", normalizedStatus: "returned" };
        })
      );
      showToast("Return confirmed.");

      try {
        if (!ownerEmail) throw new Error("Missing owner email");

        await fetch(API_OWNER_RETURN_STAGE(ownerEmail, requestId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: nextStage }),
        });

        if (lookupOrderId) {
          await fetch(API_OWNER_RENTAL_STATUS(ownerEmail, lookupOrderId), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "returned" }),
          });
        }
        fetchRentals();
        fetchReturnRequests();
      } catch (err) {
        console.log("OwnerRentalOrders confirm return sync failed:", err?.message || err);
      }
    },
    [details?.kind, details?.payload?.id, fetchRentals, fetchReturnRequests, ownerEmail, returnRequests, showToast]
  );

  return (
    <div className="space-y-6">
      {details && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          onClick={closeDetails}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-black/10 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-serif text-black">
                  {details.kind === "returnRequest"
                    ? "Return request details"
                    : details.kind === "activeRental"
                      ? "Active rental details"
                      : "Rental details"}
                </div>
                <p className="text-sm text-black/60 mt-1 truncate">
                  {details.kind === "returnRequest"
                    ? `${details.payload.customerName} - ${details.payload.productName}`
                    : details.kind === "activeRental"
                      ? `${details.payload.customerName} - ${details.payload.productName}`
                      : `${details.payload.customer} - ${details.payload.product}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="px-3 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              {details.kind === "returnRequest" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rental end date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.rentalEndDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Condition reported</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.conditionReported}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3 sm:col-span-2">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Return reason</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.returnReason}</div>
                    </div>
                  </div>
                  <ReturnTimeline stage={details.payload.stage} />
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeDetails}
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmReturn(details.payload.id)}
                      className="px-4 py-2 rounded-xl border border-[#111111] bg-[#111111] hover:bg-black text-sm font-semibold text-white shadow-sm"
                    >
                      Confirm return
                    </button>
                  </div>
                </>
              )}

              {details.kind === "activeRental" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rent from</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.rentFrom)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Due date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.dueDate)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeDetails}
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeDetails();
                      }}
                      className="px-4 py-2 rounded-xl border border-[#111111] bg-[#111111] hover:bg-black text-sm font-semibold text-white shadow-sm"
                    >
                      Mark returned
                    </button>
                  </div>
                </>
              )}

              {details.kind === "rental" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rental ID</div>
                      <div className="text-sm font-medium text-black mt-1 font-mono">{details.payload.id}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Status</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.status}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rent from</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.pickupDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Due date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.returnDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Days</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.days ?? "—"}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Amount</div>
                      <div className="text-sm font-semibold text-black mt-1">{formatINR(details.payload.amount)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeDetails}
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {details.kind === "history" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rental ID</div>
                      <div className="text-sm font-medium text-black mt-1 font-mono">{details.payload.id}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Status</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.status}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rent from</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.pickupDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Due date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(details.payload.returnDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Days</div>
                      <div className="text-sm font-medium text-black mt-1">{details.payload.days ?? "—"}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Amount</div>
                      <div className="text-sm font-semibold text-black mt-1">{formatINR(details.payload.amount)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeDetails}
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      Done
                    </button>
                    {String(details.payload.status || "").trim().toLowerCase() !== "returned" && (
                      <button
                        type="button"
                        onClick={() => closeDetails()}
                        className="px-4 py-2 rounded-xl border border-[#111111] bg-[#111111] hover:bg-black text-sm font-semibold text-white shadow-sm"
                      >
                        Mark returned
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-2xl border border-black/10 bg-white shadow-lg px-4 py-3 text-sm font-medium text-black">
            {toast}
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-serif text-black">Notifications</div>
              <p className="text-sm text-black/70 mt-1">New return requests that need your action.</p>
              {returnRequestsError && <p className="text-xs text-amber-700 mt-2">{returnRequestsError}</p>}
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 bg-white text-xs font-semibold text-black/70">
              {returnRequestsLoading ? "Loading..." : `${returnRequests.length} new requests`}
            </div>
          </div>
        </div>

        <div className="p-6">
          {returnRequestsLoading ? (
            <div className="text-sm text-black/60">Loading return requests...</div>
          ) : returnRequests.length === 0 ? (
            <div className="text-sm text-black/60">No new return requests.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {returnRequests.map((n) => (
                <div key={n.id} className="rounded-2xl border border-black/10 bg-white shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-black truncate">{n.customerName}</div>
                      <div className="text-sm text-black/70 mt-0.5 truncate">{n.productName}</div>
                    </div>
                    <span className="shrink-0 inline-flex items-center px-3 py-1 rounded-full border border-black/10 bg-white text-xs font-semibold text-black/70">
                      Return request
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Rental end date</div>
                      <div className="text-sm font-medium text-black mt-1">{formatDateSimple(n.rentalEndDate)}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Condition reported</div>
                      <div className="text-sm font-medium text-black mt-1">{n.conditionReported}</div>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white p-3 sm:col-span-2">
                      <div className="text-[11px] font-semibold tracking-wide uppercase text-black/50">Return reason</div>
                      <div className="text-sm font-medium text-black mt-1">{n.returnReason}</div>
                    </div>
                  </div>

                  <ReturnTimeline stage={n.stage} />

                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openDetails("returnRequest", n)}
                      className="px-4 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmReturn(n.id)}
                      className="px-4 py-2 rounded-xl border border-[#111111] bg-[#111111] hover:bg-black text-sm font-semibold text-white shadow-sm"
                    >
                      Confirm return
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-serif text-black">Active Rentals</div>
              <p className="text-sm text-black/60 mt-1">Ongoing rentals that haven't been returned yet.</p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 bg-white text-xs font-semibold text-black/70">
              {activeVisible.length} active
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            {activeVisible.map((r) => (
              <div
                key={r.id}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#faf7f1] shadow-sm px-4 py-4"
                role="button"
                tabIndex={0}
                onClick={() => openDetails("rental", r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openDetails("rental", r);
                }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt={r.product}
                      className="h-12 w-12 rounded-xl border border-black/10 bg-white object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-xl border border-black/10 bg-white flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                        <path
                          d="M8 3v3M16 3v3M4.5 8.5h15"
                          stroke="currentColor"
                          className="text-black/60"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M7 6h10c2.2 0 3 1 3 3v9c0 2-1 3-3 3H7c-2.2 0-3-1-3-3V9c0-2 1-3 3-3Z"
                          stroke="currentColor"
                          className="text-black/60"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-black truncate">{r.product}</div>
                    <div className="text-sm text-black/60 truncate">
                      {r.customer}
                      {String(formatDateSimple(r.returnDate)).trim() !== "-"
                        ? `    Due ${formatDateSimple(r.returnDate)}`
                        : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold", statusPill(r.status)].join(" ")}>
                    {r.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails("rental", r);
                      }}
                      className="px-3 py-2 rounded-xl border border-black/15 bg-white hover:bg-black/5 text-sm font-medium text-black"
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-serif text-black">Rental History</div>
              <p className="text-sm text-black/60 mt-1">Past rentals with approvals and returns.</p>
              {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1020px]">
            <thead className="sticky top-0 z-10">
              <tr className="text-xs font-bold tracking-wide uppercase text-white/90">
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10">
                  Rental ID
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Customer
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Product
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Rent from
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Days
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Amount
                </th>
                <th scope="col" className="pl-8 pr-6 py-4 bg-[#111111] border-b border-black/10 border-l border-white/5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-sm text-black/60">
                    Loading rental orders...
                  </td>
                </tr>
              ) : historyVisible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-sm text-black/60">
                    No returned rentals yet.
                  </td>
                </tr>
              ) : (
                historyVisible.map((rental) => (
                  <tr key={rental.id} className="odd:bg-white even:bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors">
                    <td className="pl-8 pr-6 py-5 font-mono text-sm text-black/70">{rental.id}</td>
                    <td className="pl-8 pr-6 py-5">
                      <div className="text-sm font-semibold text-black">{rental.customer}</div>
                    </td>
                    <td className="pl-8 pr-6 py-5">
                      <div className="text-sm font-medium text-black/90">{rental.product}</div>
                    </td>
                    <td className="pl-8 pr-6 py-5 text-sm text-black/60 whitespace-nowrap">{formatDateSimple(rental.pickupDate)}</td>
                    <td className="pl-8 pr-6 py-5 text-sm text-black/60">{rental.days ?? "—"}</td>
                    <td className="pl-8 pr-6 py-5 text-sm font-semibold text-black">{formatINR(rental.amount)}</td>
                    <td className="pl-8 pr-6 py-5">
                      <span className={["inline-flex items-center px-3 py-1 rounded-full border text-xs", statusPill("Returned")].join(" ")}>
                        Returned
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OwnerRentalOrders;
