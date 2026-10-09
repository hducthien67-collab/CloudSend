import React from 'react';
import { Send, Download, MessageSquareText, Cloud, Settings } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'send' | 'receive' | 'chat' | 'drive';
  onTabChange: (tab: 'send' | 'receive' | 'chat' | 'drive') => void;
  onOpenSettings: () => void;
  incomingCount: number;
  unreadChatCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  incomingCount,
  unreadChatCount
}) => {
  const navItems = [
    {
      id: 'send' as const,
      label: 'Gửi',
      icon: Send,
      badge: 0
    },
    {
      id: 'receive' as const,
      label: 'Nhận',
      icon: Download,
      badge: incomingCount
    },
    {
      id: 'chat' as const,
      label: 'Phòng Chat',
      icon: MessageSquareText,
      badge: unreadChatCount
    },
    {
      id: 'drive' as const,
      label: 'Kho Cloud',
      icon: Cloud,
      badge: 0
    }
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b0f19]/95 backdrop-blur-xl border-t border-slate-800/80 flex items-center justify-around px-1.5 py-1 transition-all shadow-2xl"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 6px))' }}
    >
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const IconComponent = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            title={item.label}
            className={`relative flex items-center justify-center flex-1 h-9 rounded-xl transition-all duration-150 active:scale-90 ${
              isActive
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {/* Active Pill Highlight */}
            <div
              className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 scale-105 shadow-sm shadow-emerald-500/10'
                  : 'bg-transparent'
              }`}
            >
              <IconComponent className={`w-4 h-4 transition-transform ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />

              {/* Badge Counter */}
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-1 px-1 py-0.1 min-w-[15px] h-[15px] rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-[#0b0f19] animate-pulse shadow-md">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {/* Settings Navigation Item - Icon only */}
      <button
        type="button"
        onClick={onOpenSettings}
        title="Cài đặt"
        className="flex items-center justify-center flex-1 h-9 rounded-xl text-slate-400 hover:text-slate-200 transition-all active:scale-90"
      >
        <div className="flex items-center justify-center w-10 h-7 rounded-full hover:bg-slate-800/60">
          <Settings className="w-4 h-4 stroke-2" />
        </div>
      </button>
    </nav>
  );
};
