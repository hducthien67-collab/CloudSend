import React from 'react';
import { Cloud, ShieldCheck, Sparkles, HardDrive, Upload, Lock, Clock, Zap } from 'lucide-react';

interface CloudAccountAvatarProps {
  size?: number; // pixel size, e.g. 36, 40, 48, 64
  className?: string;
  avatarUrl?: string | null;
  name?: string;
  showBadge?: boolean;
  showStatusDot?: boolean;
  isOnline?: boolean;
}

/**
 * Avatar nhận diện riêng biệt dành cho các tài khoản Cloud CLSend
 * Thiết kế mang đậm phong cách đám mây lưu trữ bảo mật (Cloud Node Shield):
 * - Nền Gradient Cyber Sky / Emerald Cyan cao cấp
 * - Biểu tượng Đám mây đồng bộ + Khiên an ninh tích hợp
 * - Vòng bảo vệ an toàn & Huy hiệu chứng nhận tài khoản Cloud
 */
export const CloudAccountAvatar: React.FC<CloudAccountAvatarProps> = ({
  size = 40,
  className = '',
  avatarUrl,
  name = 'Tài khoản Cloud',
  showBadge = true,
  showStatusDot = true,
  isOnline = true,
}) => {
  const initial = (name.trim().charAt(0) || 'C').toUpperCase();

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-2xl shrink-0 select-none group isolate ${className}`}
      title={`${name} - Tài khoản Cloud an toàn (Bảo vệ dữ liệu & Quota cá nhân)`}
    >
      {/* Vòng hào quang lưu trữ Cloud (Glow Pulse) */}
      <div 
        className="absolute -inset-0.5 rounded-2xl bg-gradient-to-tr from-cyan-500/40 via-teal-400/40 to-emerald-400/40 blur-[2px] opacity-75 group-hover:opacity-100 transition-opacity" 
      />

      {/* Thân Avatar */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-950 border border-cyan-400/40 shadow-inner flex items-center justify-center">
        {/* Họa tiết lưới vi mạch bảo mật chìm */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.4) 1px, transparent 1px)`,
            backgroundSize: '6px 6px'
          }}
        />

        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="relative z-10 flex flex-col items-center justify-center text-cyan-300">
            {/* Biểu tượng Cloud phối hợp với chữ cái đầu */}
            <div className="relative flex items-center justify-center">
              <Cloud className="w-4/5 h-4/5 text-cyan-400/90 drop-shadow-[0_1px_3px_rgba(6,182,212,0.4)]" />
              <span className="absolute inset-0 flex items-center justify-center font-black text-slate-950 text-[10px] mt-0.5 font-mono">
                {initial}
              </span>
            </div>
          </div>
        )}

        {/* Vệt sáng quét bảo mật an toàn */}
        <div 
          className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent pointer-events-none" 
        />
      </div>

      {/* Huy hiệu bảo mật góc dưới: Biểu tượng Khiên / Cloud Verified */}
      {showBadge && (
        <div 
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 border-2 border-slate-950 text-slate-950 flex items-center justify-center shadow-md shadow-cyan-500/30 ring-1 ring-cyan-300/50"
          title="Tài khoản Cloud đã bảo vệ & mã hóa"
        >
          <ShieldCheck className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
        </div>
      )}

      {/* Chấm trạng thái kết nối trực tuyến */}
      {showStatusDot && (
        <div 
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-950 flex items-center justify-center p-[1px]"
        >
          <span 
            className={`w-full h-full rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} 
          />
        </div>
      )}
    </div>
  );
};

interface CloudLimitsCardProps {
  usedBytes?: number;
  maxBytes?: number;
  className?: string;
}

/**
 * Thẻ thông tin giới hạn (Limits Card) dành cho tài khoản Cloud:
 * Giới hạn dung lượng lưu trữ 1 GB, hạn mức tệp tải lên 100 MB/lần, lưu trữ an toàn mã hóa
 */
export const CloudLimitsCard: React.FC<CloudLimitsCardProps> = ({
  usedBytes = 0,
  maxBytes = 1024 * 1024 * 1024, // 1 GB
  className = '',
}) => {
  const percent = Math.min(100, Math.round((usedBytes / maxBytes) * 100));

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={`p-3.5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-cyan-950/30 to-slate-900/90 border border-cyan-500/30 shadow-lg text-xs space-y-3 ${className}`}>
      {/* Tiêu đề & Huy hiệu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center shadow-inner">
            <Cloud className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>Đặc quyền & Giới hạn Tài khoản Cloud</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-bold">
                Cloud Tier
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400">Không gian lưu trữ cá nhân được mã hóa độc lập</p>
          </div>
        </div>

        <span className="font-mono text-cyan-400 font-bold text-xs bg-slate-950/80 px-2 py-0.5 rounded-lg border border-cyan-500/20">
          {percent}%
        </span>
      </div>

      {/* Thanh đo Dung Lượng Quota */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium">
          <span className="flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dung lượng đã dùng:</span>
            <strong className="text-white font-bold">{formatSize(usedBytes)}</strong>
          </span>
          <span className="text-slate-400">Hạn mức: 1 GB</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percent > 90 ? 'bg-rose-500' : percent > 75 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-500 to-teal-400'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Danh sách 3 Giới hạn bảo vệ tài khoản Cloud */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
        <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
          <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400">Giới hạn tệp/lần:</div>
            <div className="text-[11px] font-bold text-white font-mono">Tối đa 100 MB</div>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400">Bảo mật mã hóa:</div>
            <div className="text-[11px] font-bold text-emerald-300 font-mono">E2E TLS 1.3</div>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9.5px] text-slate-400">Thời gian lưu:</div>
            <div className="text-[11px] font-bold text-amber-300 font-mono">Vĩnh viễn</div>
          </div>
        </div>
      </div>
    </div>
  );
};
