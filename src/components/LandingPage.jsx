import React from 'react';
import { useNavigate } from "react-router-dom";


const LandingPage = () => {

    const navigate = useNavigate();


    return (
    <div className="h-140 mt-15 font-sans">
        <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-[#0B0B0B] rounded-3xl min-h-[160] p-12 md:p-20 text-center text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-serif text-4xl font-bold md:text-5xl mb-6">Your Perfect Look Awaits</h2>
            <p className="max-w-9xl  mx-auto opacity-90 font-light leading-relaxed mb-10">
              Join thousands of brides who found their dream ethnic wear and jewellery with us. Create your wishlist today.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button 
               onClick={() => navigate("/register")}
              className="bg-white text-black px-8 py-3 rounded-2xl font-bold hover:bg-opacity-90 transition-all"
              >
              Create Account
              </button>
              <button
                onClick={() => navigate("/learn-more")}
                className="border border-white/60 text-white px-8 py-3 rounded-2xl font-medium hover:bg-white/10 transition-all"
              >
                Learn More
              </button>
            </div>
          </div>
          
          <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        </div>
      </section>

    </div>
  );
};

export default LandingPage;
   







