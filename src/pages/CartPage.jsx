import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, Calendar, Instagram, Facebook, Mail, Phone, MapPin } from "lucide-react";
import { getCartItems, removeFromCartById, updateCartItemQuantity, updateCartItemSize } from "../utils/cart";

const CartPage = () => {
  const navigate = useNavigate();
  
  const [cartItems, setCartItems] = useState(() => getCartItems());

  const handleRemoveCartItem = (item) => {
    setCartItems(removeFromCartById(item.id, item.mode, item.size));
  };

  const handleQuantityChange = (item, delta) => {
    const nextQuantity = Math.max(1, (item.quantity || 1) + delta);
    setCartItems(updateCartItemQuantity(item.id, item.mode, nextQuantity, item.size));
  };

  const hasSelectableSizes = (item) => {
    const category = String(item?.category || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();
    const bucket = `${category} ${name}`;
    return (
      bucket.includes("lehenga") ||
      bucket.includes("saree") ||
      bucket.includes("dress") ||
      bucket.includes("gown") ||
      bucket.includes("kurta") ||
      bucket.includes("sharara") ||
      bucket.includes("traditional wear") ||
      bucket.includes("ethnic wear") ||
      bucket.includes("clothing") ||
      bucket.includes("apparel")
    );
  };

  const handleSizeChange = (item, nextSize) => {
    setCartItems(updateCartItemSize(item.id, item.mode, item.size, nextSize));
  };

  const subtotal = cartItems.reduce((acc, item) => {
    if (item.mode === "rent") {
      return acc + item.price * (item.days || 1);
    }
    return acc + item.price * item.quantity;
  }, 0);

  const delivery = 0;
  const total = subtotal + delivery;

  const handleRentalPolicyClick = (e) => {
    e.preventDefault();
    navigate("/rental-policy");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCollectionsClick = (e) => {
    e.preventDefault();
    navigate("/collections");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCareGuideClick = (e) => {
    e.preventDefault();
    navigate("/rental-policy#care-guide", { state: { section: "care-guide" } });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f0f0] font-sans">
     
      <main className="grow py-12 lg:py-16">
        <div className="max-w-6xl mx-auto px-6">
          
          
          <div className="mb-10 ">
            <h1 className="text-3xl lg:text-4xl font-serif text-[#111111] mb-2 font-semibold">
              Your Cart
            </h1>
            <p className="text-[#6B7280]">
              {cartItems.length} items in your cart
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-10">
           
            <div className="lg:col-span-2 space-y-4">
              {cartItems.length > 0 ? (
                cartItems.map((item) => (
                  <div key={`${item.id}-${item.mode}-${item.size || "free-size"}`} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex gap-5">
                    
                    <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-xl overflow-hidden shrink-0">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-serif text-[#111111] font-medium">{item.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.mode === "rent" ? "bg-[#E6E6E6] text-[#111111]" : "bg-gray-100 text-gray-600"
                            }`}>
                              {item.mode === "rent" ? "Rental" : "Purchase"}
                            </span>
                            {hasSelectableSizes(item) ? (
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#111111]">
                                  Size
                                </span>
                                {["XS", "S", "M", "L", "XL"].map((size) => (
                                  <button
                                    key={size}
                                    type="button"
                                    onClick={() => handleSizeChange(item, size)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                                      (item.size || "M") === size
                                        ? "bg-[#111111] text-white border-[#111111]"
                                        : "bg-[#E6E6E6] text-[#111111] border-[#E6E6E6]"
                                    }`}
                                  >
                                    {size}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E6E6E6] text-[#111111]">
                                Size {item.size || "Free Size"}
                              </span>
                            )}
                            {item.dates && (
                              <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                                <Calendar size={12} /> {item.dates}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveCartItem(item)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>

                      <div className="flex justify-between items-center mt-4">
                        
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleQuantityChange(item, -1)}
                            className="p-1.5 bg-[#f3f0f0] rounded-lg border border-[#E6E6E6] hover:bg-[#E6E6E6] transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => handleQuantityChange(item, 1)}
                            className="p-1.5 bg-[#f3f0f0] rounded-lg border border-[#E6E6E6] hover:bg-[#E6E6E6] transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-lg font-bold text-[#111111]">
                            {'\u20B9'}{(item.mode === "rent" ? item.price * (item.days || 1) : item.price).toLocaleString()}
                          </p>
                          {item.mode === "rent" && (
                            <p className="text-[10px] text-[#6B7280]">{'\u20B9'}{item.price.toLocaleString()}/day × {item.days} days</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
                  <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-[#6B7280] mb-6">Your cart is feeling light.</p>
                  <Link to="/collections" className="bg-[#111111] text-white px-8 py-3 rounded-full inline-block">Explore Collection</Link>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl p-8 shadow-md border border-[#E6E6E6] sticky top-6">
                <h3 className="text-xl font-serif text-[#111111] mb-6 font-semibold">Order Summary</h3>
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-[#6B7280] text-sm">
                    <span>Subtotal</span>
                    <span className="font-medium">{'\u20B9'}{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[#6B7280] text-sm">
                    <span>Delivery</span>
                    <span className="text-[#111111] font-bold">Free</span>
                  </div>
                  <hr className="border-gray-100" />
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-serif text-[#111111]">Total</span>
                    <span className="text-2xl font-bold text-[#111111]">{'\u20B9'}{total.toLocaleString()}</span>
                  </div>
                </div>

                <button onClick={() => navigate("/checkout")} className="w-full bg-[#111111] text-white py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#111111] transition-all font-semibold tracking-wide">
                  PROCEED TO CHECKOUT <ArrowRight size={18} />
                </button>

                <p className="text-center text-[10px] text-gray-400 mt-4 uppercase tracking-tighter">
                  Secure Payment via Razorpay
                </p>

              
                <div className="mt-1 pt-6 border-t border-gray-100">
                  <label className="block text-xs font-bold ml-3 text-[#111111] uppercase mb-2">Promo Code</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Enter code" 
                      className="flex-1 px-4 py-2 bg-[#f3f0f0] border border-[#E6E6E6] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#111111]" 
                    />
                    <button className="px-4 py-2 border border-[#111111] text-[#111111] rounded-lg text-sm font-semibold hover:bg-[#111111] hover:text-white transition-all">
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

   
      <footer className="bg-[#111111] text-white pt-16 pb-8 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-1">
            <h3 className="text-2xl font-serif mb-6 italic">Urban Ethnic</h3>
            <p className="opacity-70 text-sm leading-relaxed mb-6">
              Curating timeless ethnic fashion and exquisite jewellery for your most cherished celebrations. Rent or own pieces that tell your story.
            </p>
            <div className="flex space-x-4">
              <Instagram size={20} className="cursor-pointer hover:opacity-50" />
              <Facebook size={20} className="cursor-pointer hover:opacity-50" />
            </div>
          </div>

          <div>
            <h4 className="font-bold text-xs uppercase tracking-widest mb-6">Quick Links</h4>
            <ul className="space-y-4 text-sm opacity-70">
              <li className="hover:translate-x-1 transition-transform cursor-pointer">
                <Link to="/collections" onClick={handleCollectionsClick}>
                  Collections
                </Link>
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

export default CartPage;
