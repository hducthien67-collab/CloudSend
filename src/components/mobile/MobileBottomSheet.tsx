import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
  showCloseButton?: boolean;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxHeight = 'max-h-[85vh]',
  showCloseButton = true
}) => {
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('bottomsheet-open');

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.classList.remove('bottomsheet-open');
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/80 backdrop-blur-[2px] animate-in fade-in duration-150 touch-none overscroll-none"
      onClick={onClose}
    >
      <div
        className={`w-full bg-[#131926] border-t border-slate-700/80 rounded-t-[28px] shadow-2xl flex flex-col ${maxHeight} animate-in slide-in-from-bottom duration-200 overscroll-contain`}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
      >
        {/* Swipe Handle Indicator */}
        <div className="w-full flex items-center justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing" onClick={onClose}>
          <div className="w-12 h-1.5 rounded-full bg-slate-600/80 hover:bg-slate-500 transition-colors" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {typeof title === 'string' ? (
                  <h3 className="text-base font-bold text-white truncate">{title}</h3>
                ) : (
                  title
                )}
                {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
              </div>
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0 active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};
