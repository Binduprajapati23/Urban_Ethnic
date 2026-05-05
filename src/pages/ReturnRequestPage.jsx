import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, CheckCircle2, Check, ClipboardList, Info } from "lucide-react";
import { requestJson } from "../utils/http";
import Footer from "../components/Footer";

const USER_RENTALS_PREFIX = "urban_ethnic_user_rentals";

const formatDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const getCurrentUserScope = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const role = String(user?.role || "user").trim().toLowerCase();
    const identity = String(user?.email || user?.id || "guest").trim().toLowerCase();
    return `${role}:${identity || "guest"}`;
  } catch {
    return "guest";
  }
};

const updateCurrentUserRentalStatus = ({ rentalId, nextStatus }) => {
  const scope = getCurrentUserScope();
  const key = `${USER_RENTALS_PREFIX}:${scope}`;

  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    const rentals = Array.isArray(raw) ? raw : [];
    const next = rentals.map((r) => (String(r?.id || "") === String(rentalId || "") ? { ...r, status: nextStatus } : r));
    localStorage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
};

const StepPill = ({ state, label, step }) => (
  <div className="flex flex-col items-center gap-2">
    <div
      className={[
        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border",
        state === "done"
          ? "bg-[#111111] text-white border-[#111111]"
          : state === "active"
            ? "bg-white text-[#111111] border-[#111111]"
            : "bg-white text-[#6B7280] border-[#E6E6E6]",
      ].join(" ")}
    >
      {state === "done" ? <Check size={16} /> : step}
    </div>
    <div className={state === "active" || state === "done" ? "text-sm text-[#111111] font-semibold" : "text-sm text-[#6B7280]"}>
      {label}
    </div>
  </div>
);

const ReturnRequestPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state || {};

  const rental = data.rental || {};
  const name = String(data.name || rental.name || "Rental item");
  const dailyRate = Number(data.dailyRate || rental.dailyRate || 0);
  const ownerName = String(data.ownerName || "").trim();
  const dueDate = rental.returnDate || data.returnDate || "";

  const [step, setStep] = React.useState(1);
  const [reason, setReason] = React.useState("period_over");
  const [condition, setCondition] = React.useState("good");
  const [notes, setNotes] = React.useState("");
  const [submittedAt, setSubmittedAt] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [step]);

  const canContinue = Boolean(rental?.id);

  const backToRentals = () => navigate("/account?tab=active-rentals");

  const next = () => {
    if (!canContinue) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const back = () => {
    if (step === 1) {
      backToRentals();
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const confirm = async () => {
    if (!rental?.id) return;
    setIsSubmitting(true);
    setSubmitError("");

    const user = (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "null");
      } catch {
        return null;
      }
    })();

    const customerName = String(user?.name || user?.f_name || user?.firstName || "Customer").trim() || "Customer";
    const customerEmail = String(user?.email || "").trim().toLowerCase();
    const rentalEndDate = String(dueDate || rental?.returnDate || data.returnDate || "").trim();

    try {
      await requestJson("http://localhost:5000/api/returns/request", {
        method: "POST",
        body: JSON.stringify({
          rentalId: String(rental.id || ""),
          orderId: String(rental.orderId || rental.order_id || data.orderId || ""),
          customerName,
          customerEmail,
          productName: name,
          rentalEndDate,
          returnReason: reasonLabel,
          conditionReported: conditionLabel,
          notes: notes.trim(),
        }),
      });

      updateCurrentUserRentalStatus({ rentalId: rental.id, nextStatus: "return_requested" });
      setSubmittedAt(new Date().toISOString());
      setStep(3);
    } catch (err) {
      console.log("Return request submit failed:", err?.body || err.message);
      const raw = err?.body;
      const msgFromBody = raw && typeof raw === "object" ? String(raw.message || raw.error || "") : "";
      const msgFromText = typeof err?.message === "string" ? err.message : "";
      const friendly =
        msgFromBody ||
        (msgFromText.includes("Cannot POST /api/returns/request")
          ? "Backend endpoint missing. Please restart the backend server so the latest API is loaded."
          : msgFromText) ||
        "Failed to submit return request.";
      setSubmitError(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitle = step === 2 ? "Confirm return" : step === 3 ? "Request submitted" : "Return request";
  const reasonLabel =
    reason === "period_over" ? "Rental period is over" : reason === "return_early" ? "Returning early" : "Item has an issue";
  const conditionLabel =
    condition === "good" ? "Good condition — no damage" : condition === "minor" ? "Minor issue — small wear/tear" : "Damaged — needs review";

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <main className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif text-[#111111]">{stepTitle}</h1>
            <p className="text-[#6B7280] text-sm mt-1">Return only applies to rental orders.</p>
          </div>
          <span className="inline-flex px-4 py-1 rounded-full text-xs bg-[#E6E6E6] text-[#6B7280]">
            Step {step} of 3
          </span>
        </div>

        <div className="mt-7 bg-white border border-[#E6E6E6] rounded-[24px] p-6">
          <div className="flex items-center justify-between gap-4">
            <StepPill state={step > 1 ? "done" : "active"} step={1} label="Your details" />
            <div className="flex-1 h-px bg-[#E6E6E6]" />
            <StepPill state={step === 2 ? "active" : step > 2 ? "done" : "todo"} step={2} label={step > 2 ? "Confirmed" : "Confirm"} />
            <div className="flex-1 h-px bg-[#E6E6E6]" />
            <StepPill state={step === 3 ? "active" : "todo"} step={3} label="Done" />
          </div>

          <div className="mt-6 bg-[#F7F7F7] border border-[#E6E6E6] rounded-2xl p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-[#111111] font-serif text-lg">{name}</div>
              <div className="text-[#6B7280] text-sm mt-1">
                Rental{dailyRate ? ` · \u20B9${dailyRate.toLocaleString("en-IN")}` : ""}{dueDate ? ` · Due: ${formatDate(dueDate)}` : ""}
                {ownerName ? ` · Owner: ${ownerName}` : ""}
              </div>
            </div>
            <span className="inline-flex px-3 py-1 rounded-full text-xs bg-[#E6E6E6] text-[#111111]">
              Active
            </span>
          </div>

          {step === 1 && (
            <div className="mt-7 space-y-6">
              {!canContinue && (
                <div className="rounded-2xl border border-[#E6E6E6] bg-white p-4 text-sm text-[#6B7280]">
                  Open this page from an active rental to start a return request.
                </div>
              )}

              <div>
                <div className="text-[#111111] font-semibold">Why are you returning?</div>
                <div className="mt-3 space-y-3">
                  {[
                    { key: "period_over", title: "Rental period is over", desc: "Returning on time as planned" },
                    { key: "return_early", title: "Returning early", desc: "Done with it before due date" },
                    { key: "issue", title: "Item has an issue", desc: "Damage, wrong size, or quality problem" },
                  ].map((row) => {
                    const selected = reason === row.key;
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => setReason(row.key)}
                        className={[
                          "w-full text-left rounded-2xl border p-4 transition",
                          selected ? "border-[#111111] bg-black/5" : "border-[#E6E6E6] bg-white hover:bg-black/5",
                        ].join(" ")}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={[
                              "mt-1 w-5 h-5 rounded-full border flex items-center justify-center",
                              selected ? "border-[#111111]" : "border-[#E6E6E6]",
                            ].join(" ")}
                          >
                            {selected ? <span className="w-2.5 h-2.5 rounded-full bg-[#111111]" /> : null}
                          </span>
                          <div>
                            <div className="text-[#111111] font-semibold">{row.title}</div>
                            <div className="text-[#6B7280] text-sm mt-0.5">{row.desc}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[#111111] font-semibold">Item condition when returning</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="mt-3 w-full h-12 rounded-xl border border-[#E6E6E6] bg-white px-4 text-[#111111] outline-none"
                >
                  <option value="good">Good condition — no damage</option>
                  <option value="minor">Minor issue — small wear/tear</option>
                  <option value="damaged">Damaged — needs review</option>
                </select>
              </div>

              <div>
                <label className="text-[#111111] font-semibold">Additional notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any details for the owner about the item..."
                  className="mt-3 w-full min-h-[120px] rounded-xl border border-[#E6E6E6] bg-white px-4 py-3 text-[#111111] outline-none resize-y"
                />
              </div>

              <div className="rounded-2xl border border-[#E6E6E6] bg-[#F7F2E8] p-4 text-[#111111] text-sm">
                Return only applies to rental orders. You must physically hand the item to the owner — they will confirm receipt.
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={back}
                  className="h-11 px-6 rounded-xl border border-[#E6E6E6] bg-white text-[#111111] font-semibold hover:bg-black/5 transition"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={!canContinue}
                  className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold hover:bg-black/90 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  Continue <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-7 space-y-6">
              <div className="rounded-2xl border border-[#CFE0FF] bg-[#D9E6FF] p-4 text-[#111111]">
                <div className="flex items-start gap-3">
                  <Info size={18} className="text-[#2862D6] mt-0.5" />
                  <div className="text-sm text-[#2862D6] leading-relaxed">
                    Once submitted, owner {ownerName || "gets"} an instant notification. The order stays "Return requested" until he physically receives and confirms the item.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E6E6E6] bg-white overflow-hidden">
                <div className="grid grid-cols-2 gap-0 px-5 py-3 text-xs font-semibold text-[#6B7280] border-b border-[#E6E6E6]">
                  <div>FIELD</div>
                  <div>YOUR ANSWER</div>
                </div>

                {[
                  { k: "Product", v: name },
                  { k: "Return reason", v: reasonLabel },
                  { k: "Item condition", v: conditionLabel },
                  { k: "Owner", v: ownerName ? ownerName : "—" },
                  { k: "Owner address", v: data.ownerAddress ? String(data.ownerAddress) : "—" },
                ].map((row) => (
                  <div key={row.k} className="grid grid-cols-2 gap-0 px-5 py-3 text-sm border-b border-[#E6E6E6] last:border-b-0">
                    <div className="text-[#111111]">{row.k}</div>
                    <div className="text-[#111111] font-semibold">{row.v}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={back}
                  className="h-11 px-6 rounded-xl border border-[#E6E6E6] bg-white text-[#111111] font-semibold hover:bg-black/5 transition"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={isSubmitting}
                  className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold hover:bg-black/90 transition inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Submit return request <CheckCircle2 size={18} />
                </button>
              </div>

              {submitError && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="mt-7 space-y-6">
              <div className="rounded-2xl border border-[#D6EBC6] bg-[#EAF5DF] p-8 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-[#1B5E20] text-white flex items-center justify-center">
                  <Check size={26} />
                </div>
                <h2 className="mt-4 text-2xl font-serif text-[#111111]">Return request sent!</h2>
                <p className="mt-2 text-[#111111]/80">
                  Owner {ownerName || "has"} been notified. Please go and hand over the item at{" "}
                  {data.ownerAddress ? "his shop." : "the owner."}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E6E6E6] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#111111]">What happens next</h3>

                <div className="mt-5">
                  <div className="space-y-6">
                    <div className="relative pl-8">
                      <div className="absolute left-[10px] top-6 -bottom-6 w-px bg-[#E6E6E6]" />
                      <span className="absolute left-[2px] top-1 w-4 h-4 rounded-full bg-[#111111]" />
                      <div className="text-[#111111] font-semibold">Return requested</div>
                      <div className="text-[#6B7280] text-sm mt-1">You submitted the form successfully</div>
                      <div className="text-[#6B7280] text-xs mt-1">
                        {submittedAt ? new Date(submittedAt).toLocaleString("en-IN") : ""}
                      </div>
                    </div>

                    <div className="relative pl-8">
                      <div className="absolute left-[10px] top-6 -bottom-6 w-px bg-[#E6E6E6]" />
                      <span className="absolute left-[2px] top-1 w-4 h-4 rounded-full bg-[#111111]" />
                      <div className="text-[#111111] font-semibold">Go hand item to owner</div>
                      <div className="text-[#6B7280] text-sm mt-1">
                        {ownerName ? `Visit ${ownerName}` : "Visit the owner"}
                        {data.ownerAddress ? ` at ${String(data.ownerAddress)}` : ""}
                      </div>
                      <div className="text-[#6B7280] text-sm mt-1">Waiting for you</div>
                    </div>

                    <div className="relative pl-8">
                      <div className="absolute left-[10px] top-6 -bottom-6 w-px bg-[#E6E6E6]" />
                      <span className="absolute left-[2px] top-1 w-4 h-4 rounded-full bg-[#111111]" />
                      <div className="text-[#111111] font-semibold">Owner confirms receipt</div>
                      <div className="text-[#6B7280] text-sm mt-1">He checks the item and confirms the return</div>
                      <div className="text-[#6B7280] text-sm mt-1">Pending</div>
                    </div>

                    <div className="relative pl-8">
                      <span className="absolute left-[2px] top-1 w-4 h-4 rounded-full bg-[#BDBDBD]" />
                      <div className="text-[#111111] font-semibold">Order marked returned</div>
                      <div className="text-[#6B7280] text-sm mt-1">You get notified · product goes available for others</div>
                      <div className="text-[#6B7280] text-sm mt-1">Pending</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={backToRentals}
                    className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold hover:bg-black/90 transition"
                  >
                    Back to my orders
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ReturnRequestPage;
