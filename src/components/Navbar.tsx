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
  Radio,
  ExternalLink,
  Database,
  Tv,
  Scale
} from 'lucide-react';
import { isDevUser } from '../utils/devModeration';

interface NavbarProps {
  activeTab: 'send' | 'receive' | 'chat';
  setActiveTab: (tab: 'send' | 'receive' | 'chat') => void;
  onOpenSettings: () => void;
  onOpenRules?: () => void;
  onOpenDevConsole?: () => void;
  onOpenDevPage?: () => void;
  incomingCount?: number;
  unreadMessagesCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenRules,
  onOpenDevConsole,
  onOpenDevPage,
  incomingCount = 0,
  unreadMessagesCount = 0,
}) => {
  const { currentUser, settings } = useAuth();
  const isDev = isDevUser(currentUser?.email);

  const getDeviceIcon = () => {
    switch (settings.deviceType) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      case 'desktop': return <Monitor className="w-4 h-4" />;
      case 'tv': return <Tv className="w-4 h-4 text-emerald-400 animate-pulse" />;
      default: return <Laptop className="w-4 h-4" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900 border-b border-slate-800 shadow-md">
      <div className="w-full px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* === GÓC BÊN TRÁI: Logo + Tên + Cụm Tab chuyển đổi === */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          {/* Logo and Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0" onClick={() => setActiveTab('send')}>
            <div className="relative group">
              <CloudSendLogo className="w-9 h-9 sm:w-10 sm:h-10 shadow-lg shadow-emerald-500/10 rounded-xl transition-transform group-hover:scale-105" size={40} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-sm sm:text-base tracking-tight m-0 p-0 inline-block leading-none">CloudSend</h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  Relay
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden xl:block">
                Kết nối qua Internet phong cách LocalSend
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Gửi / Nhận / Phòng Chat) - Placed directly on the left side */}
          <nav className="hidden md:flex items-center p-1 bg-slate-950/70 border border-slate-800 rounded-xl shrink-0">
            <button
              id="nav-send-tab"
              type="button"
              onClick={() => setActiveTab('send')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'send'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Nhận</span>
              {incomingCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center animate-bounce">
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <MessagesSquare className="w-3.5 h-3.5" />
              <span>Phòng Chat</span>
              {unreadMessagesCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              )}
            </button>
          </nav>
        </div>

        {/* === GÓC BÊN PHẢI: Thiết bị + Cài đặt + Avatar === */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* TV Mode Quick Status Pill */}
          {(settings.deviceType === 'tv' || settings.tvModeEnabled) && (
            <button
              id="navbar-tv-mode-badge"
              type="button"
              onClick={onOpenSettings}
              title="Chế độ Smart TV đang bật. Nhấn để mở Cài đặt & chỉnh DPI"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all shadow-sm"
            >
              <Tv className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline">Smart TV</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-500/20 rounded text-amber-200">
                {settings.tvDpiScale ? `${Math.round(settings.tvDpiScale * 100)}%` : '140%'}
              </span>
            </button>
          )}

          {/* Current device preview badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
            <span className="text-emerald-400">{getDeviceIcon()}</span>
            <span className="font-medium text-white max-w-[140px] truncate">
              {settings.deviceName}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          {/* DATASTORE Direct Button (CHỈ HIỂN THỊ DUY NHẤT CHO DEV: hducthien67@gmail.com) */}
          {isDev && (
            <div className="flex items-center bg-emerald-500/15 hover:bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-0.5 shadow-lg shadow-emerald-500/10 transition-colors">
              <button
                id="open-datastore-btn"
                type="button"
                onClick={() => {
                  if (onOpenDevPage) {
                    onOpenDevPage();
                  } else {
                    window.location.href = '/?page=datastore';
                  }
                }}
                title="Mở TRANG WEB DATASTORE (Dành riêng cho DEV)"
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-emerald-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">DEV DATASTORE</span>
              </button>
              <button
                id="open-datastore-tab-btn"
                type="button"
                onClick={() => {
                  window.open('/?page=datastore', '_blank');
                }}
                title="Mở trang web Datastore trong TAB MỚI riêng biệt"
                className="p-1.5 rounded-lg hover:bg-emerald-500/30 text-emerald-300 hover:text-white border-l border-emerald-500/30 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          )}

          {/* Rules / Nội quy Button */}
          {onOpenRules && (
            <button
              id="open-rules-navbar-btn"
              type="button"
              onClick={onOpenRules}
              title="Bảng Nội Quy & Điều Khoản Sử Dụng (Căn cứ xử lý vi phạm)"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-amber-400 border border-slate-700/80 hover:border-amber-500/40 text-xs font-semibold transition-all shadow-sm group"
            >
              <Scale className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Nội quy</span>
            </button>
          )}

          {/* Settings Button (Gear Logo) */}
          <button
            id="open-settings-btn"
            type="button"
            onClick={onOpenSettings}
            title="Cài đặt (Settings)"
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 transition-all hover:rotate-45"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Avatar */}
          <div
            onClick={onOpenSettings}
            title={`${currentUser?.displayName || 'Tài khoản'} - Nhấn để xem cài đặt`}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold cursor-pointer ring-2 ring-emerald-500/40 hover:ring-emerald-400 transition-all shadow-md"
            style={{ backgroundColor: settings.avatarColor }}
          >
            {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar - LocalSend native style */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-3 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center justify-around gap-1 max-w-md mx-auto">
          <button
            id="mobile-nav-send"
            type="button"
            onClick={() => setActiveTab('send')}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'send'
                ? 'text-emerald-400 font-semibold bg-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Gửi</span>
          </button>

          <button
            id="mobile-nav-receive"
            type="button"
            onClick={() => setActiveTab('receive')}
            className={`flex-1 relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'receive'
                ? 'text-emerald-400 font-semibold bg-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Download className="w-5 h-5 mb-0.5" />
              {incomingCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] flex items-center justify-center">
                  {incomingCount}
                </span>
              )}
            </div>
            <span className="text-[11px]">Nhận</span>
          </button>

          <button
            id="mobile-nav-chat"
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all ${
              activeTab === 'chat'
                ? 'text-emerald-400 font-semibold bg-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <MessagesSquare className="w-5 h-5 mb-0.5" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-teal-400 animate-ping" />
              )}
            </div>
            <span className="text-[11px]">Phòng Chat</span>
          </button>

          <button
            id="mobile-nav-settings"
            type="button"
            onClick={onOpenSettings}
            className="flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Cài đặt</span>
          </button>
        </div>
      </div>
    </header>
  );
};
