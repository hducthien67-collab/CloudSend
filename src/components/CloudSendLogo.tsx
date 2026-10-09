import React from 'react';
import { Send, ShieldCheck, Sparkles } from 'lucide-react';

interface CloudSendLogoProps {
  className?: string;
  size?: number;
  showRays?: boolean;
  showVerifiedShield?: boolean;
}

/**
 * Logo chính thức của CLSend:
 * - Được thiết kế tỉ mỉ, hiện đại, mang lại cảm giác an tâm, bảo mật và tốc độ cao
 * - Dải lụa phản quang mềm mại cuộn từ góc trên-trái xuống góc dưới-phải (Silk Wave Sheen)
 * - Tông màu Ngọc Lục Bảo (Emerald) phối Lam Ngọc (Teal) và Lục Bạc Hà (Mint) biểu trưng cho an toàn & ổn định
 * - Huy hiệu bảo vệ nhỏ tinh tế (Shield Check) tạo dựng niềm tin tuyệt đối cho người dùng
 */
export const CloudSendLogo: React.FC<CloudSendLogoProps> = ({ 
  className = "w-10 h-10",
  size = 40,
  showRays = true,
  showVerifiedShield = false,
}) => {
  return (
    <div 
      style={{ width: size, height: size }}
      className={`relative group flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 text-slate-950 font-bold shadow-lg shadow-emerald-500/25 shrink-0 select-none overflow-hidden isolate ${className}`}
    >
      {/* 1. Lớp ánh sáng dải lụa cuộn từ góc trên-trái xuống góc dưới-phải (Rolling Silk Light Drape) */}
      <div 
        className="absolute -inset-[150%] pointer-events-none animate-silk-roll opacity-75 mix-blend-overlay"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.7) 48%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.7) 52%, rgba(255,255,255,0.05) 70%, rgba(255,255,255,0) 100%)',
        }}
      />

      {/* 2. Lớp sóng lụa phụ uốn lượn mềm mại thứ hai với tốc độ lệch */}
      <div 
        className="absolute -inset-[120%] pointer-events-none animate-silk-wave-secondary opacity-60 mix-blend-color-dodge"
        style={{
          background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.85) 0%, rgba(52,211,153,0.4) 40%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* 3. Viền phản quang góc trên uốn cong nhẹ & đường viền an ninh */}
      <div className="absolute inset-0 rounded-2xl border border-white/40 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl pointer-events-none" />

      {/* 4. Hình máy bay Send tốc độ cao với bóng đổ mềm & đường cong mượt mà */}
      <div className="relative z-10 flex items-center justify-center w-full h-full transform transition-transform duration-300 group-hover:scale-105">
        <Send className="w-1/2 h-1/2 -rotate-12 text-slate-950 fill-white/20 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] stroke-[2.3]" />
      </div>

      {/* 5. Vệt sáng óng ánh góc dưới */}
      <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white/25 rounded-full blur-sm pointer-events-none" />

      {/* 6. Chấm sáng an ninh góc trên */}
      <div className="absolute top-1.5 left-1.5 w-1 h-1 bg-white/80 rounded-full blur-[0.5px] pointer-events-none" />

      {/* 7. Tùy chọn huy hiệu bảo mật */}
      {showVerifiedShield && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full flex items-center justify-center shadow-xs ring-1 ring-slate-950">
          <ShieldCheck className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
        </div>
      )}
    </div>
  );
};
