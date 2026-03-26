import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => {
  return (
    <div className={`${className} relative flex items-center justify-center`}>
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[#E6C35C]/20 rounded-full blur-xl animate-pulse" />
      
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full drop-shadow-sm"
      >
        {/* Book Base (Left Page) */}
        <path 
          d="M50 80C35 80 20 75 15 65V25C20 35 35 40 50 40V80Z" 
          fill="#5A5A40" 
          stroke="#4a4a34" 
          strokeWidth="1"
        />
        {/* Book Base (Right Page) */}
        <path 
          d="M50 80C65 80 80 75 85 65V25C80 35 65 40 50 40V80Z" 
          fill="#5A5A40" 
          stroke="#4a4a34" 
          strokeWidth="1"
        />
        
        {/* Pages (Left) */}
        <path 
          d="M50 75C35 75 22 70 18 62V28C22 36 35 41 50 41V75Z" 
          fill="#f5f2ed" 
        />
        {/* Pages (Right) */}
        <path 
          d="M50 75C65 75 78 70 82 62V28C78 36 65 41 50 41V75Z" 
          fill="#f5f2ed" 
        />
        
        {/* Sprout/Leaf Growing from Center */}
        <path 
          d="M50 45C50 45 52 35 58 32C52 32 50 40 50 45Z" 
          fill="#5A5A40" 
        />
        <path 
          d="M50 45C50 45 48 35 42 32C48 32 50 40 50 45Z" 
          fill="#5A5A40" 
        />
        <path 
          d="M50 55V40" 
          stroke="#5A5A40" 
          strokeWidth="2" 
          strokeLinecap="round"
        />
        
        {/* Subtle Cross or Star in the Center */}
        <circle cx="50" cy="40" r="1.5" fill="#E6C35C" />
      </svg>
    </div>
  );
};

export default Logo;
