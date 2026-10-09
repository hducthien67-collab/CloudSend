import React, { useState } from 'react';
import { Crown, Zap, Server, Trash2, Calendar, Check, AlertTriangle, X, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { resetRoomMessagesServer } from '../utils/devModeration';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface ResetServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
  totalMessagesCount?: number;
  isAutoWeeklyEnabled?: boolean;
  onResetSuccess?: () => void;
}

export const ResetServerModal: React.FC<ResetServerModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomName,
  totalMessagesCount = 0,
  isAutoWeeklyEnabled = false,
  onResetSuccess
}) => {
  const [selectedMode, setSelectedMode] = useState<'all' | 'older_than_7_days'>('older_than_7_days');
  const [autoWeekly, setAutoWeekly] = useState(isAutoWeeklyEnabled);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    setIsProcessing(true);
    setResultMessage(null);

    try {
      // 1. If autoWeekly changed, persist to room doc
      if (roomId && roomId !== 'public-relay-lounge') {
        try {
          await updateDoc(doc(db, 'rooms', roomId), {
            autoWeeklyReset: autoWeekly
          });
        } catch (e) {
          console.warn('Could not update autoWeeklyReset flag on room:', e);
        }
      }

      // 2. Execute server messages reset
      const result = await resetRoomMessagesServer(roomId, selectedMode, 'DEV Quản Trị Viên');
      if (result.success) {
        setResultMessage({
          type: 'success',
          text: result.message
        });
        if (onResetSuccess) {
          onResetSuccess();
        }
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setResultMessage({
          type: 'error',
          text: result.message
        });
      }
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        text: err.message || 'Lỗi không xác định khi reset máy chủ.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-5 w-full max-w-md shadow-2xl shadow-amber-500/10 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 p-0.5 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-base font-extrabold text-white">Reset Máy Chủ Trò Chuyện</h3>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                  DEV
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Phòng: <span className="text-emerald-400 font-semibold">{roomName}</span> ({totalMessagesCount} tin nhắn)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explain info */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-300">
            <Server className="w-3.5 h-3.5" />
            <span>Tối ưu hóa máy chủ & Chống lag (Anti-Lag Engine)</span>
          </div>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            Tin nhắn dồn ứ qua nhiều tuần sẽ làm máy chủ Firestore bị quá tải và gây giật lag khi tải chat. Bạn có thể chọn reset dọn dẹp các tin nhắn cũ để giải phóng máy chủ ngay lập tức.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Chọn phương thức Reset:
          </label>

          {/* Option 1: Clean > 7 days */}
          <div
            onClick={() => setSelectedMode('older_than_7_days')}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
              selectedMode === 'older_than_7_days'
                ? 'bg-amber-500/15 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${selectedMode === 'older_than_7_days' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Dọn tin nhắn cũ hơn 1 tuần (7 ngày)</span>
                <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 bg-emerald-500/10 rounded">
                  Khuyên dùng
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Xóa các tin nhắn cũ hơn 7 ngày để giải phóng lag, đồng thời giữ lại các tin nhắn mới trong tuần gần nhất.
              </p>
            </div>
          </div>

          {/* Option 2: Full Purge */}
          <div
            onClick={() => setSelectedMode('all')}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
              selectedMode === 'all'
                ? 'bg-rose-500/15 border-rose-500/60 shadow-md ring-1 ring-rose-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${selectedMode === 'all' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-200">Reset Toàn Bộ (Xóa sạch tin nhắn phòng)</span>
                <span className="text-[10px] text-rose-400 font-mono font-bold px-1.5 py-0.5 bg-rose-500/10 rounded">
                  100% Sạch
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Xóa sạch toàn bộ tin nhắn đã nhắn trong phòng này. Máy chủ trở về trạng thái ban đầu, xóa bỏ 100% độ trễ và lag.
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Auto-Prune Toggle */}
        <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-950">
          <input
            type="checkbox"
            checked={autoWeekly}
            onChange={(e) => setAutoWeekly(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-700 cursor-pointer"
          />
          <div className="text-[11px] min-w-0">
            <span className="font-bold text-slate-200 block">Tự động reset dọn dẹp mỗi tuần (7 ngày)</span>
            <span className="text-slate-400 text-[10px]">
              Hệ thống sẽ tự động quét và xóa tin nhắn cũ hơn 7 ngày khi mở phòng để máy chủ luôn mượt mà.
            </span>
          </div>
        </label>

        {/* Status Feedback */}
        {resultMessage && (
          <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            resultMessage.type === 'success'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
          }`}>
            {resultMessage.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{resultMessage.text}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleExecuteReset}
            className={`px-4 py-2 rounded-xl font-bold text-xs shadow-lg flex items-center gap-1.5 transition-all active:scale-95 text-white ${
              selectedMode === 'all'
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 shadow-rose-600/20'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/20'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý dọn dẹp...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Thực hiện Reset Máy Chủ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
