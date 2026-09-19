import React from 'react';
import { Send } from 'lucide-react';

interface CloudSendLogoProps {
  className?: string;
  size?: number;
}

export const CloudSendLogo: React.FC<CloudSendLogoProps> = ({ 
  className = "w-10 h-10",
  size = 40 
}) => {
  return (
    <div 
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20 shrink-0 select-none ${className}`}
    >
      <Send className="w-1/2 h-1/2 -rotate-12" />
    </div>
  );
};
