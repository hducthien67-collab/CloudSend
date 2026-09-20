import React, { useState, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Flame, X, Clock, ShieldAlert, Trash2 } from 'lucide-react';
import { playDestructSound } from '../utils/sound';

interface SelfDestructViewerModalProps {
  isOpen: boolean;
  message: ChatMessage | null;
  onClose: () => void;
  onDestruct: (messageId: string) => Promise<void>;
}

export const SelfDestructViewerModal: React.FC<SelfDestructViewerModalProps> = ({
  isOpen,
  message,
  onClose,
  onDestruct
}) => {
  const [remaining, setRemaining] = useState<number>(0);
  const [isDestructing, setIsDestructing] = useState(false);

  const duration = message?.selfDestructDuration || 0;
  const isTimerMode = duration > 0;

  useEffect(() => {
    if (!isOpen || !message) return;

    if (isTimerMode) {
      setRemaining(duration);
      const interval = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            handleTriggerDestruct();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOpen, message?.id]);

  if (!isOpen || !message) return null;

  const images = (message.attachments || []).filter(a => a.type.startsWith('image/'));
  if (images.length === 0 && message.fileData && (message.fileType || '').startsWith('image/')) {
    images.push({
      name: message.fileName || 'image.jpg',
      size: message.fileSize || 0,
      type: message.fileType || 'image/jpeg',
      data: message.fileData
    });
  }

  const handleTriggerDestruct = async () => {
    if (isDestructing) return;
    setIsDestructing(true);
    playDestructSound();
    try {
      await onDestruct(message.id);
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-slate-900 border border-orange-500/40 rounded-3xl shadow-2xl shadow-orange-500/10 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0 shadow-lg shadow-orange-500/20">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Ảnh bảo mật tự hủy</h3>
                {isTimerMode ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs font-semibold">
                    <Clock className="w-3 h-3" />
                    Tự hủy trong {remaining}s
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold">
                    Xem 1 lần (View-Once)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Gửi bởi: <span className="text-slate-200 font-medium">{message.senderName}</span>
              </p>
            </div>
          </div>

          <button
            id="close-destruct-modal-btn"
            type="button"
            onClick={handleTriggerDestruct}
            disabled={isDestructing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors"
            title="Đóng và tiêu hủy ảnh ngay lập tức"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center gap-4 bg-black/40">
          {images.map((img, idx) => (
            <div key={idx} className="relative max-w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <img
                src={img.data}
                alt={img.name}
                className="max-h-[60vh] sm:max-h-[65vh] w-auto max-w-full object-contain rounded-2xl select-none"
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ))}

          {message.text && (
            <div className="w-full max-w-xl p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-slate-200 text-sm text-center">
              {message.text}
            </div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0" />
            <span>Ảnh sẽ tự động bị xóa vĩnh viễn khỏi phòng chat ngay khi đóng hoặc hết giờ.</span>
          </div>

          <button
            id="confirm-destruct-btn"
            type="button"
            onClick={handleTriggerDestruct}
            disabled={isDestructing}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDestructing ? 'Đang tiêu hủy...' : 'Đã xem - Tiêu hủy ảnh ngay'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
