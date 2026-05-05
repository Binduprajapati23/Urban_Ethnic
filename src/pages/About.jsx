import React from "react";
import { Link } from "react-router-dom";
import { Heart, Award, Leaf, Users } from "lucide-react";
import Footer from "../components/Footer";
import storyBg from "../assets/image3.jpg";


const AboutPage = () => {
  const values = [
    {
      icon: Heart,
      title: "Crafted with Love",
      description: "Every piece in our collection is handpicked with care and attention to detail.",
    },
    {
      icon: Award,
      title: "Quality Assured",
      description: "We partner only with master artisans who uphold the highest standards of craftsmanship.",
    },
    {
      icon: Leaf,
      title: "Sustainable Fashion",
      description: "Rental options promote conscious consumption and reduce fashion waste.",
    },
    {
      icon: Users,
      title: "Woman-Owned",
      description: "Proudly woman-owned, supporting female artisans and entrepreneurs across India.",
    },
  ];

  return (
    <div className="w-full bg-[#f3f0f0]">
      
      <div className="relative py-20 lg:py-32 overflow-hidden bg-black">
        <div
          className="absolute inset-0 bg-cover bg-center"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${storyBg})`,
            filter: "saturate(1.08) contrast(1.08)",
            transform: "scale(1.05)",
          }}
        />
        <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
        <div className="container mx-auto px-6 lg:px-12 relative text-center">
          <div className="max-w-3xl mx-auto">
            <span className="text-[12px] uppercase tracking-[0.35em] text-white/80 font-semibold mb-4 block">
              Our Story
            </span>
            <h1 className="text-4xl lg:text-6xl font-serif text-white mb-6 leading-tight">
              Celebrating Heritage,
              <span className="text-white/80 italic block font-normal">Empowering Women</span>
            </h1>
            <p className="text-lg text-white/80 leading-relaxed font-sans">
              Urban Ethnic was born from a passion to make exquisite ethnic fashion accessible 
              to every woman celebrating her special moments.
            </p>
          </div>
        </div>
      </div>

    
      <div className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="relative">
              <div className="aspect-4/5 rounded-4xl overflow-hidden shadow-xl">
                <img
                  src="https://i.pinimg.com/736x/ad/01/5d/ad015dd3e19f14a58317f42de3393632.jpg" 
                  alt="Founder"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-[#f3f0f0] rounded-3xl -z-10" />
            </div>
            
            <div className="space-y-6">
              <span className="text-[12px] uppercase tracking-[0.35em] text-black/70 font-semibold">
                Meet The Founder
              </span>
              <h2 className="text-3xl lg:text-4xl font-serif text-black">
                A Dream Woven in Tradition
              </h2>
              <div className="space-y-4 text-black/60 leading-relaxed text-base">
                <p>
                  Growing up surrounded by the rich textile heritage of India, I always dreamed 
                  of sharing this beauty with women everywhere. After years in fashion design, 
                  I noticed a gap — beautiful ethnic wear was either inaccessible or unaffordable 
                  for many women.
                </p>
                <p>
                  Urban Ethnic was born from this realization. We believe every woman deserves 
                  to feel like royalty on her special day, without the burden of owning expensive 
                  pieces she may wear only once.
                </p>
                <p>
                  Our rental model not only makes luxury accessible but also promotes sustainable 
                  fashion. Each piece in our collection tells a story of skilled artisans.
                </p>
              </div>
              <div className="pt-4 border-l-4 border-black/20 pl-6">
                <p className="text-xl italic text-black/70 font-serif">
                  "Fashion should empower, not burden."
                </p>
                <p className="text-sm text-black/50 mt-2">
                  — Founder, Urban Ethnic
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    
      <div className="py-20 lg:py-28 bg-[#f3f0f0]">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="text-center mb-14">
            <span className="text-[12px] uppercase tracking-[0.35em] text-black/70 font-semibold mb-3 block">
              What We Stand For
            </span>
            <h2 className="text-3xl lg:text-4xl font-serif text-black">
              Our Values
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, idx) => (
              <div
                key={idx}
                className="bg-white rounded-3xl p-8 shadow-sm text-center hover:shadow-md transition-shadow duration-300"
              >
                <div className="w-16 h-16 bg-white border border-black/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <value.icon className="w-8 h-8 text-black/70" />
                </div>
                <h3 className="text-xl font-serif text-black mb-3">
                  {value.title}
                </h3>
                <p className="text-sm text-black/60 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>


      <div className="py-20 lg:py-28 bg-white">
        <div className="container mx-auto px-6 lg:px-12 text-center">
          <div className="mb-14 text-center">
            <span className="text-[12px] uppercase tracking-[0.35em] text-black/70 font-semibold mb-3 block">
              Behind The Scenes
            </span>
            <h2 className="text-3xl lg:text-4xl font-serif text-black">
              Our Craft
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <div className="aspect-square rounded-4xl overflow-hidden shadow-md">
              <img
                src="https://i.pinimg.com/736x/48/08/20/48082010533c53df76636e87a7e704aa.jpg"
                alt="Jewellery crafting"
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-700"
              />
            </div>
            <div className="aspect-square rounded-4xl overflow-hidden shadow-md">
              <img
                src="https://i.pinimg.com/1200x/39/23/35/3923356a0fbbb675f94e74b6dffc6add.jpg"
                alt="Fabric selection"
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-700"
              />
            </div>
            <div className="aspect-square rounded-4xl overflow-hidden shadow-md">
              <img
                src="https://i.pinimg.com/1200x/7c/33/31/7c33315e2da954d8e371a712f9076865.jpg"
                alt="Quality check"
                className="w-full h-full object-cover hover:scale-110 transition-transform duration-700"
              />
            </div>
          </div>
        </div>
      </div>

     
      <div className="py-20 lg:py-28 bg-[#111111]">
        <div className="container mx-auto px-6 lg:px-12 text-center text-white">
          <h2 className="text-3xl lg:text-5xl font-serif mb-6">
            Ready to Find Your Perfect Look?
          </h2>
          <p className="text-lg text-white/80 mb-10 max-w-xl mx-auto font-sans">
            Explore our curated collection and make your special moments unforgettable.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link
              to="/collections"
              className="bg-white text-black/80 px-10 py-4 rounded-full font-bold text-lg hover:bg-gray-100 transition shadow-lg"
            >
              Browse Collection
            </Link>
            <Link
              to="/register"
              className="border-2 border-white text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-white/10 transition"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-10">
        <Footer />
      </div>
    </div>
  );
};

export default AboutPage;








