import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CloudSendLogo } from '../CloudSendLogo';
import { Settings, Copy, Check, Monitor, Smartphone, ShieldCheck, Sparkles, Crown } from 'lucide-react';
import { PresenceDevice } from '../../types';
import { isDevUser } from '../../utils/devModeration';

interface MobileHeaderProps {
  onOpenSettings: () => void;
  onToggleViewMode?: () => void;
  viewMode?: 'mobile' | 'desktop';
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onOpenSettings
}) => {
  const { currentUser, userProfile, settings } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const isDev = isDevUser(currentUser?.email);

  const connectCode = userProfile?.uid
    ? userProfile.uid.substring(0, 6).toUpperCase()
    : currentUser?.uid?.substring(0, 6).toUpperCase() || '8888';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(connectCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const displayName = userProfile?.displayName || currentUser?.displayName || settings?.deviceName || 'Thiết bị di động';
  const avatarColor = userProfile?.avatarColor || settings?.avatarColor || 'emerald';
  const customAvatarUrl = userProfile?.customAvatarUrl || settings?.customAvatarUrl || currentUser?.photoURL;

  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-400 to-teal-500 text-emerald-950',
    blue: 'from-sky-400 to-blue-500 text-blue-950',
    purple: 'from-purple-400 to-indigo-500 text-purple-950',
    amber: 'from-amber-400 to-orange-500 text-amber-950',
    rose: 'from-rose-400 to-pink-500 text-rose-950',
    cyan: 'from-cyan-400 to-teal-500 text-cyan-950'
  };

  const gradientClass = colorMap[avatarColor] || colorMap.emerald;

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0b0f19]/90 backdrop-blur-md border-b border-slate-800/80 px-2.5 py-1 flex items-center justify-between gap-1.5 safe-top">
      {/* Brand & Live Online Indicator / DEV Badge */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-1">
          <CloudSendLogo className="w-4 h-4" />
          <span className="font-black text-xs tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
            CLSend
          </span>
        </div>
        {isDev ? (
          <div className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/40 text-[8px] font-bold text-amber-300 shadow-sm animate-pulse">
            <Crown className="w-2 h-2 text-amber-400 fill-amber-400" />
            <span>DEV</span>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-semibold text-emerald-400">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span>Mobile</span>
          </div>
        )}
      </div>

      {/* Right Controls: Connect Code Pill & Profile/Settings Avatar */}
      <div className="flex items-center gap-1.5">
        {/* Connect Code Quick Pill */}
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-[9px] text-slate-300 font-mono transition-all active:scale-95 shadow-sm"
          title="Bấm để sao chép mã kết nối nhanh"
        >
          <span className="text-slate-400 font-sans text-[8.5px]">Mã:</span>
          <span className="font-bold text-white tracking-wider">{connectCode}</span>
          {copiedCode ? (
            <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          ) : (
            <Copy className="w-2.5 h-2.5 text-slate-400 shrink-0" />
          )}
        </button>

        {/* User Profile / Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`relative flex items-center justify-center w-6 h-6 rounded-full ${isDev ? 'border border-amber-400 shadow-sm shadow-amber-500/20' : 'border border-slate-700'} overflow-hidden active:scale-95 transition-transform shrink-0`}
          title={isDev ? "Hồ sơ DEV chính chủ & Cài đặt" : "Mở Cài đặt & Hồ sơ"}
        >
          {customAvatarUrl ? (
            <img src={customAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-tr ${isDev ? 'from-amber-400 to-emerald-600 text-slate-950 font-black' : gradientClass} flex items-center justify-center font-bold text-[9px] uppercase`}>
              {isDev ? <Crown className="w-3 h-3 fill-slate-950 text-slate-950" /> : displayName.charAt(0)}
            </div>
          )}
          {isDev && (
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-950 flex items-center justify-center">
              <Crown className="w-1.5 h-1.5 text-slate-950 fill-slate-950" />
            </div>
          )}
        </button>
      </div>
    </header>
  );
};
