import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingBag, Trash2, Sparkles, Instagram, Facebook, Mail, Phone, MapPin } from "lucide-react";
import { getWishlistItems, removeFromWishlistById } from "../utils/wishlist";
import { addToCart, canUseCart } from "../utils/cart";

const WishlistPage = () => {
  const navigate = useNavigate();
  
  const [wishlistItems, setWishlistItems] = useState(() => getWishlistItems());

  const removeFromWishlist = (id) => {
    setWishlistItems(removeFromWishlistById(id));
  };

  const moveToCart = (item) => {
    if (!canUseCart()) {
      alert("Admin account cannot add products to cart.");
      return;
    }

    addToCart({
      id: item.id,
      name: item.name,
      image: item.image,
      price: item.buyPrice || item.rentPrice || 0,
      mode: "buy",
      quantity: 1,
      category: item.category,
    });
    alert("Item added to cart! ðŸŽ‰");
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
    <div className="min-h-screen flex flex-col bg-[#f9f8f8] text-black/80">
     
      <header className="bg-[#f9f8f8]  py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-serif text-black mb-4 font-medium">
            My Wishlist
          </h1>
          <p className="text-black/60 text-lg">
            {wishlistItems.length > 0 
              ? `${wishlistItems.length} treasured piece${wishlistItems.length > 1 ? 's' : ''} saved`
              : "Your collection of favourites"
            }
          </p>
        </div>
      </header>

      <main
        className={`grow max-w-7xl mx-auto px-6 w-full ${
          wishlistItems.length > 0 ? "py-12" : "pt-4 pb-12"
        }`}
      >
        {wishlistItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {wishlistItems.map((item) => (
              <div 
                key={item.id} 
                className="group w-full bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 border border-gray-100 flex flex-col"
              >
               
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 bg-white/90 backdrop-blur-sm text-[10px] font-bold uppercase tracking-widest text-black/70 rounded-full">
                      {item.category}
                    </span>
                  </div>
                  <button className="absolute top-3 right-3 w-9 h-9 bg-[#111111] rounded-full flex items-center justify-center shadow-lg transform transition hover:scale-110">
                    <Heart className="w-4 h-4 text-white fill-current" />
                  </button>
                </div>

               
                <div className="p-4 flex flex-col grow">
                  <h3 className="text-base font-serif text-black mb-3 line-clamp-1">
                    {item.name}
                  </h3>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Rent</span>
                      <span className="font-bold text-black">{'\u20B9'}{item.rentPrice.toLocaleString()}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-100" />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Buy</span>
                      <span className="font-bold text-black">{'\u20B9'}{item.buyPrice.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="mt-auto space-y-2">
                    <button 
                      onClick={() => moveToCart(item)}
                      className="w-full bg-[#111111] text-white py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors font-medium text-sm"
                    >
                      <ShoppingBag size={16} /> Move to Cart
                    </button>
                    <button 
                      onClick={() => removeFromWishlist(item.id)}
                      className="w-full py-1.5 flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} /> Remove from wishlist
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          
          <div className="flex flex-col items-center justify-center py-6 md:py-10 text-center">
            <div className="w-24 h-24 bg-black/5 rounded-full flex items-center justify-center mb-6">
              <Heart className="w-10 h-10 text-black/70" />
            </div>
            <h2 className="text-2xl font-serif text-black mb-2 font-medium">Your wishlist is empty</h2>
            <p className="text-black/60 max-w-xs mb-8">
              Explore our collection and save pieces you love for your next celebration.
            </p>
            <Link to="/collections" className="bg-[#111111] text-white px-8 py-3 rounded-full flex items-center gap-2 hover:bg-black transition-all">
              <Sparkles size={18} /> Explore Collection
            </Link>
          </div>
        )}
      </main>

      
    <footer className="bg-[#111111] text-white pt-16 pb-8 px-6">
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              <div className="md:col-span-1">
                <h3 className="text-2xl font-serif mb-6 italic">Urban Ethnic</h3>
                <p className="opacity-70 text-sm leading-relaxed mb-6">
                  Curating timeless ethnic fashion and exquisite jewellery for your most cherished celebrations. Rent or own pieces that tell your story.
                </p>
                <div className="flex space-x-4">
                  <Instagram size={20} className="cursor-pointer text-white/80 hover:opacity-60" />
                  <Facebook size={20} className="cursor-pointer text-white/80 hover:opacity-60" />
                </div>
              </div>
    
              <div>
                <h4 className="font-bold text-xs uppercase tracking-widest mb-6">Quick Links</h4>
                <ul className="space-y-4 text-sm opacity-70">
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">
                    <Link to="/collections">Collections</Link>
                  </li>
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">
                    <Link to="/rental-policy" onClick={handleRentalPolicyClick}>
                      Rental Policy
                    </Link>
                  </li>
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">
                    <Link to="/rental-policy#care-guide" onClick={handleCareGuideClick}>
                      Care Guide
                    </Link>
                  </li>
                </ul>
              </div>
    
              <div>
                <h4 className="font-bold text-xs uppercase tracking-widest mb-6">Categories</h4>
                <ul className="space-y-4 text-sm opacity-70">
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">Jewellery</li>
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">Lehengas</li>
                  <li className="hover:translate-x-1 transition-transform cursor-pointer">Accessories</li>
                </ul>
              </div>
    
              <div>
                <h4 className="font-bold text-xs uppercase tracking-widest mb-6">Contact</h4>
                <ul className="space-y-4 text-sm opacity-70">
                  <li className="flex items-center gap-3"><Mail size={16} /> hello@urbanethnic.com</li>
                  <li className="flex items-center gap-3"><Phone size={16} /> +91 98765 43210</li>
                  <li className="flex items-start gap-3"><MapPin size={16} /> <span>123 Fashion Street, Mumbai</span></li>
                </ul>
              </div>
            </div>
            <div className="max-w-6xl mx-auto pt-6 border-t border-white/10 text-center text-[10px] opacity-40 uppercase tracking-[2px]">
              © 2024 Urban Ethnic. All rights reserved.
            </div>
          </footer>
    </div>
  );
};

export default WishlistPage;












