import React, { useState, useEffect } from 'react';
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
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { getSavedZoom, changeZoomBy, resetZoom } from '../utils/zoom';

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
  const [zoomScale, setZoomScale] = useState(1.00);

  useEffect(() => {
    setZoomScale(getSavedZoom());
    const handleZoom = (e: any) => {
      if (e.detail?.zoom) {
        setZoomScale(e.detail.zoom);
      }
    };
    window.addEventListener('cloudsend-zoom-change', handleZoom);
    return () => window.removeEventListener('cloudsend-zoom-change', handleZoom);
  }, []);

  const getDeviceIcon = () => {
    switch (settings.deviceType) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      case 'desktop': return <Monitor className="w-4 h-4" />;
      default: return <Laptop className="w-4 h-4" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
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
                <span className="font-bold text-white text-sm sm:text-base tracking-tight">CloudSend</span>
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

        {/* === GÓC BÊN PHẢI: Kích thước Zoom + Thiết bị + Cài đặt + Avatar === */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Zoom Controller - Controls entire web & taskbar size (Ctrl + Mouse Wheel) */}
          <div 
            className="hidden lg:flex items-center p-0.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs"
            title="Điều chỉnh kích thước toàn bộ Web & Taskbar (Hỗ trợ phím Ctrl + Lăn Chuột)"
          >
            <button
              id="zoom-out-btn"
              type="button"
              onClick={() => changeZoomBy(-0.05)}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Thu nhỏ (-5%)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              id="zoom-reset-btn"
              type="button"
              onClick={() => resetZoom()}
              className="px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Nhấn để đặt lại kích thước chuẩn (Ctrl + 0)"
            >
              {Math.round(zoomScale * 100)}%
            </button>
            <button
              id="zoom-in-btn"
              type="button"
              onClick={() => changeZoomBy(0.05)}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Phóng to (+5%)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Current device preview badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
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
