import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CloudSendLogo } from './CloudSendLogo';
import { 
  Send, 
  Download, 
  MessagesSquare, 
  Settings, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Globe, 
  Radio
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'send' | 'receive' | 'chat';
  setActiveTab: (tab: 'send' | 'receive' | 'chat') => void;
  onOpenSettings: () => void;
  incomingCount?: number;
  unreadMessagesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  incomingCount = 0,
  unreadMessagesCount = 0,
}) => {
  const { currentUser, settings } = useAuth();

  const getDeviceIcon = () => {
    switch (settings.deviceType) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      case 'desktop': return <Monitor className="w-4 h-4" />;
      default: return <Laptop className="w-4 h-4" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo and Status */}
        <div className="flex items-center gap-3">
          <div className="relative group cursor-pointer" onClick={() => setActiveTab('send')}>
            <CloudSendLogo className="w-10 h-10 shadow-lg shadow-emerald-500/10 rounded-xl transition-transform group-hover:scale-105" size={40} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base tracking-tight">CloudSend</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                Relay Server
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate hidden md:block">
              Kết nối qua Internet phong cách LocalSend
            </p>
          </div>
        </div>

        {/* Center Tabs (Send / Receive / Chat) */}
        <nav className="flex items-center p-1 bg-slate-950/70 border border-slate-800 rounded-xl">
          <button
            id="nav-send-tab"
            type="button"
            onClick={() => setActiveTab('send')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'send'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Gửi</span>
          </button>

          <button
            id="nav-receive-tab"
            type="button"
            onClick={() => setActiveTab('receive')}
            className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'receive'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Nhận</span>
            {incomingCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                {incomingCount}
              </span>
            )}
          </button>

          <button
            id="nav-chat-tab"
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'chat'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessagesSquare className="w-3.5 h-3.5" />
            <span>Phòng Chat</span>
            {unreadMessagesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
            )}
          </button>
        </nav>

        {/* Right Actions: Device Pill, Settings Gear Button */}
        <div className="flex items-center gap-2.5">
          {/* Current device preview badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
            <span className="text-emerald-400">{getDeviceIcon()}</span>
            <span className="font-medium text-white max-w-[140px] truncate">
              {settings.deviceName}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          {/* Settings Button (Gear Logo) */}
          <button
            id="open-settings-btn"
            type="button"
            onClick={onOpenSettings}
            title="Cài đặt (Settings)"
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 transition-all hover:rotate-45"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Avatar */}
          <div
            onClick={onOpenSettings}
            title={`${currentUser?.displayName || 'Tài khoản'} - Nhấn để xem cài đặt`}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold cursor-pointer ring-2 ring-emerald-500/40 hover:ring-emerald-400 transition-all"
            style={{ backgroundColor: settings.avatarColor }}
          >
            {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
};
