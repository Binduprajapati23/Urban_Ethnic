import React, { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import Footer from "../components/Footer";
import {
  AlertCircle,
  CalendarDays,
  Droplets,
  Hand,
  Package,
  Shield,
  ShieldX,
  Sparkles,
  Sun,
  Truck,
  Wind,
} from "lucide-react";

const policyCards = [
  {
    icon: CalendarDays,
    title: "Rental Duration & Booking",
    points: [
      "Minimum rental period is 2 days, maximum 7 days",
      "Book at least 5 days in advance for availability",
      "Extensions available upon request (subject to availability)",
      "Same-day bookings not accepted",
    ],
  },
  {
    icon: Truck,
    title: "Delivery & Return Process",
    points: [
      "Free delivery within city limits for orders above \u20B95,000",
      "Items delivered 1 day before your event date",
      "Return pickup scheduled on the day after event",
      "Self-pickup available from our boutique",
    ],
  },
  {
    icon: Shield,
    title: "Security Deposit",
    points: [
      "Refundable deposit of 30% of item's buy price",
      "Deposit returned within 3-5 business days after return",
      "Paid via UPI, card, or bank transfer",
      "Deposit held until item inspection is complete",
    ],
  },
  {
    icon: AlertCircle,
    title: "Damage & Late Return",
    points: [
      "Minor wear is expected and not charged",
      "Significant damage assessed on case-by-case basis",
      "Late returns charged at 1.5x daily rental rate",
      "Lost items charged at full replacement value",
    ],
  },
];

const jewelleryDos = [
  {
    icon: Package,
    title: "Store Safely",
    desc: "Keep in the provided pouch, away from other jewellery",
  },
  {
    icon: Sparkles,
    title: "Wipe Gently",
    desc: "Use soft cloth to remove fingerprints after wearing",
  },
];

const jewelleryDonts = [
  {
    icon: Droplets,
    title: "Avoid Water",
    desc: "Remove before washing hands, swimming, or bathing",
  },
  {
    icon: Sun,
    title: "No Direct Sunlight",
    desc: "Store away from prolonged sun exposure",
  },
];

const clothingDos = [
  {
    icon: Wind,
    title: "Air After Wear",
    desc: "Hang in a ventilated space before returning",
  },
  {
    icon: Hand,
    title: "Handle Gently",
    desc: "Be careful with embroidery, beadwork, and delicate fabrics",
  },
];

const clothingDonts = [
  {
    icon: ShieldX,
    title: "No Perfume",
    desc: "Apply perfume before wearing, not on the garment",
  },
  {
    icon: AlertCircle,
    title: "Avoid Heat",
    desc: "Keep away from irons, heaters, and hot surfaces",
  },
];

const CareList = ({ heading, color, items }) => (
  <div className="space-y-4">
    <p className={`text-[12px] tracking-[0.25em] ${color}`}>{heading}</p>
    {items.map((item) => {
      const ItemIcon = item.icon;
      return (
        <div
          key={item.title}
          className={`rounded-2xl p-4 flex items-start gap-4 ${
            heading === "DO'S" ? "bg-[#E6E6E6]" : "bg-[#F4EBEC]"
          }`}
        >
          <span
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
              heading === "DO'S"
                ? "bg-[#E6E6E6] text-[#6B7280]"
                : "bg-[#F2DFE1] text-[#E47A7A]"
            }`}
          >
            <ItemIcon size={20} />
          </span>
          <div>
            <p className="text-[#111111] text-[18px] md:text-[20px] font-serif leading-none">{item.title}</p>
            <p className="text-[#6B7280] text-[14px] md:text-[15px] leading-tight mt-1">{item.desc}</p>
          </div>
        </div>
      );
    })}
  </div>
);

const RentalPolicy = () => {
  const location = useLocation();
  const careGuideRef = useRef(null);

  useEffect(() => {
    const isCareGuideTarget =
      location.hash === "#care-guide" || location.state?.section === "care-guide";

    if (isCareGuideTarget && careGuideRef.current) {
      setTimeout(() => {
        careGuideRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [location.hash, location.state]);

  return (
    <div className="bg-[#f3f0f0] min-h-screen text-[#111111]">
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="text-[12px] md:text-[14px] tracking-[0.3em] uppercase text-[#6B7280]">
          Rental Information
        </p>
        <h1 className="text-3xl md:text-5xl font-serif mt-6 mb-6">
          Everything You Need to Know
        </h1>
        <p className="text-sm md:text-[16px] leading-relaxed max-w-3xl mx-auto text-[#6B7280]">
          Our rental process is designed to be seamless and stress-free. Here's
          everything you need to know about renting and caring for your pieces.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-6 pt-8 pb-16">
        <div className="flex items-center ml-3 gap-4 mb-6">
          <span className="w-12 h-12 rounded-xl bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
            <CalendarDays size={22} />
          </span>
          <div>
            <h2 className="text-xl md:text-2xl font-serif">Rental Policy</h2>
            <p className="text-[14px] md:text-[16px] text-[#6B7280]">
              Clear guidelines for a smooth rental experience
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {policyCards.map((card) => {
            const CardIcon = card.icon;
            return (
              <article key={card.title} className="rounded-3xl bg-[#FFFFFF] p-8 border border-[#E6E6E6]">
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-14 h-14 rounded-2xl bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center shrink-0">
                    <CardIcon size={25} />
                  </span>
                  <h3 className="font-serif text-xl md:text-2xl leading-tight">{card.title}</h3>
                </div>
                <ul className="space-y-3 text-[#6B7280] text-[14px] md:text-[15px]">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <span className="text-[#8D9B7A] mt-1">&bull;</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section id="care-guide" ref={careGuideRef} className="max-w-7xl mx-auto px-6 pt-2 pb-16">
        <div className="flex items-center ml-3 gap-4 mb-6">
          <span className="w-12 h-12 rounded-xl bg-[#E6E6E6] text-[#6B7280] flex items-center justify-center">
            <Sparkles size={22} />
          </span>
          <div>
            <h2 className="text-xl md:text-2xl font-serif">Care Guide</h2>
            <p className="text-[14px] md:text-[16px] text-[#6B7280]">
              Keep your rented pieces pristine with these tips
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <article className="rounded-3xl bg-[#FFFFFF] p-8 border border-[#E6E6E6]">
            <h3 className="text-2xl md:text-3xl font-serif text-center mb-8">Jewellery Care</h3>
            <CareList heading="DO'S" color="text-[#111111]" items={jewelleryDos} />
            <div className="h-px bg-[#E6E6E6] my-6" />
            <CareList heading="DON'TS" color="text-[#E27D7D]" items={jewelleryDonts} />
          </article>

          <article className="rounded-3xl bg-[#FFFFFF] p-8 border border-[#E6E6E6]">
            <h3 className="text-2xl md:text-3xl font-serif text-center mb-8">Clothing Care</h3>
            <CareList heading="DO'S" color="text-[#111111]" items={clothingDos} />
            <div className="h-px bg-[#E6E6E6] my-6" />
            <CareList heading="DON'TS" color="text-[#E27D7D]" items={clothingDonts} />
          </article>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="rounded-[34px] bg-gradient-to-r from-[#E6E6E6] via-[#E6E6E6] to-[#E6E6E6] py-16 px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-4">Have More Questions?</h2>
          <p className="text-[14px] md:text-[16px] text-[#6B7280] max-w-3xl mx-auto">
            Our team is here to help you with any queries about rentals,
            bookings, or care instructions.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/contact-support"
              className="px-10 py-4 rounded-2xl bg-[#111111] text-white text-sm md:text-base hover:bg-[#111111] transition"
            >
              Contact Us
            </Link>
            <Link
              to="/collections"
              className="px-10 py-4 rounded-2xl border border-[#E6E6E6] text-[#111111] text-sm md:text-base hover:bg-white/60 transition"
            >
              Browse Collection
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default RentalPolicy;









