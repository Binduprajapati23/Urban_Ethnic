import React from "react";
import {Instagram,Facebook,Mail,Phone,MapPin,} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const CollectionFooter = () => {
  const navigate = useNavigate();

  const handleCollectionsClick = (e) => {
    e.preventDefault();
    navigate("/collections");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRentalPolicyClick = (e) => {
    e.preventDefault();
    navigate("/rental-policy");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCareGuideClick = (e) => {
    e.preventDefault();
    navigate("/rental-policy#care-guide", { state: { section: "care-guide" } });
  };

  return (
    <div className="bg-[#0B0B0B] text-white pt-16 pb-8 px-6 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
        
       
        <div>
          <h3 className="text-2xl font-serif mb-6 italic">
            Urban Ethnic
          </h3>
          <p className="opacity-80 text-sm leading-relaxed mb-8">
            Curating timeless ethnic fashion and exquisite jewellery for your most
            cherished celebrations. Rent or own pieces that tell your story.
          </p>
          <div className="flex space-x-4">
            <div className="bg-white/10 p-2 rounded-full hover:bg-white/20 cursor-pointer transition">
              <Instagram size={18} />
            </div>
            <div className="bg-white/10 p-2 rounded-full hover:bg-white/20 cursor-pointer transition">
              <Facebook size={18} />
            </div>
          </div>
        </div>

       
        <div>
          <h4 className="font-bold text-sm uppercase tracking-widest mb-6">
            Quick Links
          </h4>
          <ul className="space-y-4 opacity-80 text-sm">
            <li className="hover:translate-x-1 transition cursor-pointer">
              <Link to="/collections" onClick={handleCollectionsClick}>
                Collections
              </Link>
            </li>
            <li className="hover:translate-x-1 transition cursor-pointer">
              <Link to="/rental-policy" onClick={handleRentalPolicyClick}>
                Rental Policy
              </Link>
            </li>
            <li className="hover:translate-x-1 transition cursor-pointer">
              <Link to="/rental-policy#care-guide" onClick={handleCareGuideClick}>
                Care Guide
              </Link>
            </li>
          </ul>
        </div>

        
        <div>
          <h4 className="font-bold text-sm uppercase tracking-widest mb-6">
            Categories
          </h4>
          <ul className="space-y-4 opacity-80 text-sm">
            <li className="hover:translate-x-1 transition cursor-pointer">Jewellery</li>
            <li className="hover:translate-x-1 transition cursor-pointer">Lehengas</li>
            <li className="hover:translate-x-1 transition cursor-pointer">Accessories</li>
          </ul>
        </div>


        <div>
          <h4 className="font-bold text-sm uppercase tracking-widest mb-6">
            Get in Touch
          </h4>
          <ul className="space-y-5 text-sm opacity-80">
            <li className="flex items-center gap-3">
              <Mail size={16} /> hello@urbanethnic.com
            </li>
            <li className="flex items-center gap-3">
              <Phone size={16} /> +91 98765 43210
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={16} />
              <span>
                123 Fashion Street <br />
                Mumbai 400001
              </span>
            </li>
          </ul>
        </div>
      </div>

     
      <div className="max-w-7xl mx-auto pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center text-xs opacity-60">
        <p>© 2024 Urban Ethnic. All rights reserved.</p>
        <div className="flex space-x-6 mt-4 md:mt-0">
          <span className="cursor-pointer">Privacy Policy</span>
          <span className="cursor-pointer">Terms of Service</span>
        </div>
      </div>
    </div>
  );
};

export default CollectionFooter;







