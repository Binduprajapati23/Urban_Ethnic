import { Clock, ShieldCheck, Truck, Sparkles } from 'lucide-react'; 

const FeaturesSection = () => {
  const features = [
    {
      icon: <Sparkles size={22} className="text-gray-900" />,
      title: "Curated Collection",
      description: "Handpicked pieces from master artisans across India"
    },
    {
      icon: <Clock size={24} className="text-gray-900" />,
      title: "Flexible Rentals",
      description: "Rent for 2-7 days with easy extensions available"
    },
    {
      icon: <ShieldCheck size={24} className="text-gray-900" />,
      title: "Quality Assured",
      description: "Every piece inspected and sanitized before delivery"
    },
    {
      icon: <Truck size={24} className="text-gray-900" />,
      title: "Pan-India Delivery",
      description: "Free shipping on orders above ₹5,000"
    }
  ];

  return (
    <>
      <div className="bg-white py-12 px-6 border-t border-[#CFE1B9] border-b border-[#CFE1B9]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
           {features.map((item, index) => (
             <div key={index} className="flex items-start space-x-4">
               
              <div className="shrink-0 w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                {item.icon}
              </div>
               
              <div className="flex flex-col">
                <h3 className="text-gray-900 font-serif text-lg font-semibold leading-tight">
                  {item.title}
                </h3>
                <p className="text-gray-700 font-sans text-sm mt-1 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default FeaturesSection;







