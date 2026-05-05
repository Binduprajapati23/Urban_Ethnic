import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";

const LearnMorePage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return (
    <div className="min-h-screen bg-[#f3f0f0] text-[#111111]">
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-[#FFFFFF] border border-[#E6E6E6] rounded-3xl p-8 md:p-12">
          <h1 className="font-serif text-4xl md:text-5xl text-[#111111]">
            Learn More About Urban Ethnic
          </h1>
          <p className="mt-5 text-base md:text-lg text-[#6B7280] leading-relaxed">
            Urban Ethnic brings premium ethnic wear and jewellery to your special
            occasions through flexible rental and purchase options. Our focus is
            quality styling, transparent pricing, and smooth delivery experience.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border border-[#E6E6E6] p-5">
              <h2 className="font-serif text-2xl text-[#111111]">Curated Pieces</h2>
              <p className="mt-2 text-sm text-[#6B7280]">
                Handpicked bridal and festive collections for modern and
                traditional looks.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E6E6E6] p-5">
              <h2 className="font-serif text-2xl text-[#111111]">Flexible Rentals</h2>
              <p className="mt-2 text-sm text-[#6B7280]">
                Rent high-value pieces at affordable prices for the exact days
                you need.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E6E6E6] p-5">
              <h2 className="font-serif text-2xl text-[#111111]">Easy Support</h2>
              <p className="mt-2 text-sm text-[#6B7280]">
                Get support for sizing, styling, delivery updates, and return
                guidance.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/collections")}
              className="px-6 py-3 rounded-2xl bg-[#111111] text-white text-sm hover:bg-[#111111] transition"
            >
              Explore Collections
            </button>
            <button
              onClick={() => navigate("/register")}
              className="px-6 py-3 rounded-2xl border border-[#111111] text-[#111111] text-sm"
            >
              Create Account
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default LearnMorePage;









