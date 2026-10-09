import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  UserCheck, 
  Sparkles, 
  Check, 
  ShieldCheck, 
  ArrowRight,
  User
} from 'lucide-react';

interface GoogleDisplayNameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDisplayNameModal: React.FC<GoogleDisplayNameModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, userProfile, updateDisplayName, updateSettings } = useAuth();
  
  const initialName = currentUser?.displayName || userProfile?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Người dùng CloudSend');
  const [displayNameInput, setDisplayNameInput] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = displayNameInput.trim();
    if (!cleanName) {
      setErrorMsg('Vui lòng nhập tên hiển thị.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await updateDisplayName(cleanName);
      await updateSettings({ deviceName: cleanName });
      localStorage.setItem(`cloudsend_google_name_set_${currentUser.uid}`, 'true');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu tên hiển thị. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    const fallbackName = initialName.trim();
    try {
      if (fallbackName && (!currentUser.displayName || currentUser.displayName !== fallbackName)) {
        await updateDisplayName(fallbackName);
        await updateSettings({ deviceName: fallbackName });
      }
    } catch {
      // ignore
    }
    localStorage.setItem(`cloudsend_google_name_set_${currentUser.uid}`, 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-emerald-950/60 overflow-hidden space-y-5">
        
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header with Google and CloudSend icon */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 text-emerald-400 border border-emerald-500/40 shadow-inner">
            <UserCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Thiết Lập Tên Hiển Thị
          </h2>
          <p className="text-xs text-slate-300">
            Chào mừng bạn gia nhập <strong className="text-emerald-400 font-semibold">CloudSend Relay</strong> qua tài khoản Google!
          </p>
        </div>

        {/* Google Account Summary Card (Read-only) */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Tài khoản Google (Tên đăng nhập):</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Chính chủ
            </span>
          </div>
          <div className="flex items-center gap-3">
            {currentUser.photoURL ? (
              <img 
                src={currentUser.photoURL} 
                alt="Avatar Google" 
                className="w-10 h-10 rounded-full border border-emerald-500/40 object-cover" 
              />
            ) : (
              <div className="p-2.5 rounded-full bg-slate-800 text-teal-400">
                <User className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white font-mono truncate">
                {currentUser.email}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Đăng nhập an toàn qua Google OAuth 2.0
              </div>
            </div>
          </div>
        </div>

        {/* Input Form for Display Name */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nhập Tên Hiển Thị & Tên Thiết Bị:</span>
              </label>
              <span className="text-[10px] text-emerald-400 font-bold">
                Chỉ tên này mới được chỉnh
              </span>
            </div>
            
            <input
              type="text"
              maxLength={30}
              autoFocus
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              placeholder="Ví dụ: Hoàng Đức Thiện, Laptop Pro..."
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
            />
            
            <p className="text-[11px] text-slate-400 italic">
              * Tên này sẽ hiển thị với bạn bè khi gửi tệp và tham gia phòng trò chuyện. Bạn có thể đổi lại bất cứ lúc nào trong Cài Đặt.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSkip}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold transition-colors order-2 sm:order-1"
            >
              Dùng tên mặc định
            </button>

            <button
              type="submit"
              disabled={isSaving || !displayNameInput.trim()}
              className="w-full sm:flex-1 py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2 cursor-pointer"
            >
              {isSaving ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <span>Lưu & Bắt Đầu</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
