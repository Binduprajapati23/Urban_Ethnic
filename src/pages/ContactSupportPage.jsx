import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Clock3, Headset, Mail, MessageCircle, PhoneCall } from "lucide-react";
import Footer from "../components/Footer";

const ContactSupportPage = () => {
  const location = useLocation();
  const prefilledOrderId = location.state?.orderId || "";
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    orderId: prefilledOrderId,
    issue: "",
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.issue.trim()) {
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#f3f0f0]">
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-12">
        <header className="mb-8">
          <p className="text-sm text-[#6B7280]">
            <Link to="/track-order" className="hover:underline">
              Track Order
            </Link>{" "}
            / Contact Support
          </p>
          <h1 className="text-3xl font-serif text-[#111111] mt-2">Contact Support</h1>
          <p className="text-[#6B7280] mt-2">Share your issue and our team will get back within 24 hours.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-6">
          <section className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6">
            <h2 className="text-2xl font-serif text-[#111111] mb-5">Raise a Ticket</h2>

            {submitted ? (
              <div className="rounded-2xl border border-[#E6E6E6] bg-[#E6E6E6] p-5">
                <p className="text-[#111111] text-lg font-medium">Request submitted successfully.</p>
                <p className="text-[#6B7280] mt-2">Ticket ID: UE-SUP-2026-1092</p>
                <p className="text-[#6B7280] mt-1">
                  We have received your message and will contact you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm text-[#6B7280] mb-1">
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Enter your name"
                    className="w-full h-12 rounded-xl border border-[#E6E6E6] bg-white px-4 text-[#111111] outline-none focus:ring-2 focus:ring-[#111111]"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm text-[#6B7280] mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    className="w-full h-12 rounded-xl border border-[#E6E6E6] bg-white px-4 text-[#111111] outline-none focus:ring-2 focus:ring-[#111111]"
                  />
                </div>

                <div>
                  <label htmlFor="orderId" className="block text-sm text-[#6B7280] mb-1">
                    Order ID (Optional)
                  </label>
                  <input
                    id="orderId"
                    name="orderId"
                    value={form.orderId}
                    onChange={handleChange}
                    placeholder="Example: #UE-2026-4851"
                    className="w-full h-12 rounded-xl border border-[#E6E6E6] bg-white px-4 text-[#111111] outline-none focus:ring-2 focus:ring-[#111111]"
                  />
                </div>

                <div>
                  <label htmlFor="issue" className="block text-sm text-[#6B7280] mb-1">
                    Issue Details
                  </label>
                  <textarea
                    id="issue"
                    name="issue"
                    value={form.issue}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Describe your issue..."
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-4 text-[#111111] outline-none resize-none focus:ring-2 focus:ring-[#111111]"
                  />
                </div>

                <button
                  type="submit"
                  className="h-12 px-8 rounded-2xl bg-[#111111] text-white text-sm font-semibold transition-all duration-200 hover:bg-[#111111] active:scale-[0.98]"
                >
                  Submit Request
                </button>
              </form>
            )}
          </section>

          <section className="space-y-4">
            <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6">
              <h3 className="text-xl font-serif text-[#111111] mb-4 inline-flex items-center gap-2">
                <Headset size={20} />
                Other Ways to Reach Us
              </h3>
              <div className="space-y-3 text-[#111111]">
                <p className="inline-flex items-center gap-3">
                  <PhoneCall size={16} />
                  +91 98765 43210
                </p>
                <p className="inline-flex items-center gap-3">
                  <Mail size={16} />
                  hello@urbanethnic.com
                </p>
                <p className="inline-flex items-center gap-3">
                  <MessageCircle size={16} />
                  WhatsApp support available
                </p>
                <p className="inline-flex items-center gap-3">
                  <Clock3 size={16} />
                  Mon - Sat, 10:00 AM to 7:00 PM
                </p>
              </div>
            </div>

            <div className="bg-[#FFFFFF] rounded-[24px] border border-[#E6E6E6] p-6">
              <h3 className="text-xl font-serif text-[#111111] mb-4">Common Help</h3>
              <ul className="space-y-2 text-[#6B7280]">
                <li>Order status and delivery updates</li>
                <li>Rental extension and return support</li>
                <li>Refund and security deposit timelines</li>
                <li>Damaged or incorrect item assistance</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ContactSupportPage;









