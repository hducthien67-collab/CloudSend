import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CloudSendLogo } from './CloudSendLogo';
import { 
  Send, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Tablet, 
  ShieldCheck, 
  Sparkles, 
  Lock, 
  Mail, 
  User, 
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  LogIn,
  UserPlus,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, loginAsGuest, settings } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState(settings.deviceName || '');
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoNotice(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Vui lòng điền đầy đủ email và mật khẩu.');
      return;
    }

    if (isRegistering) {
      if (!name.trim()) {
        setErrorMsg('Vui lòng nhập tên hiển thị của bạn.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Mật khẩu xác nhận không khớp.');
        return;
      }
    }

    setIsLoading(true);
    try {
      if (isRegistering) {
        await registerWithEmail(email.trim(), password, name.trim(), deviceName.trim() || undefined);
      } else {
        await loginWithEmail(email.trim(), password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrorMsg('Email này đã được đăng ký. Bạn vui lòng chuyển qua tab "Đăng nhập" để vào tài khoản nhé.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Email hoặc mật khẩu không chính xác. Vui lòng thử lại.');
      } else if (code === 'auth/weak-password') {
        setErrorMsg('Mật khẩu quá yếu, cần ít nhất 6 ký tự.');
      } else {
        setErrorMsg(err?.message || 'Đã xảy ra lỗi khi xác thực tài khoản.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setErrorMsg(null);
    setInfoNotice(null);
    setIsLoading(true);
    try {
      await loginAsGuest(name.trim() || deviceName.trim() || undefined, deviceName.trim() || undefined);
    } catch (err: any) {
      setErrorMsg('Không thể tạo phiên sử dụng nhanh: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsLoading(false);
    }
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoNotice(null);
    setIsUnauthorizedDomain(false);
    setIsLoading(true);
    setIsGoogleLoading(true);
    
    // Timeout safeguard after 25s so the UI never hangs indefinitely if popup is suppressed/blocked
    let timerId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error('POPUP_TIMEOUT'));
      }, 25000);
    });

    try {
      await Promise.race([loginWithGoogle(), timeoutPromise]);
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setInfoNotice('Bạn đã đóng cửa sổ đăng nhập Google. Bạn có thể nhấn lại để thử lại hoặc bấm "Vào nhanh ngay lập tức" bên dưới.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép popup trên thanh địa chỉ, hoặc bấm nút "⚡ Vào nhanh ngay lập tức (Chế độ Khách)" bên dưới để vào app ngay!');
      } else if (code === 'auth/unauthorized-domain') {
        setIsUnauthorizedDomain(true);
      } else if (msg === 'POPUP_TIMEOUT') {
        setErrorMsg('Cửa sổ Google phản hồi lâu hoặc bị trình duyệt chặn ngầm. Bạn hãy nhấp vào nút "⚡ Vào nhanh ngay lập tức (Chế độ Khách)" bên dưới để vào dùng ngay mà không cần chờ nhé!');
      } else {
        setErrorMsg('Không thể đăng nhập bằng Google: ' + (err?.message || 'Vui lòng thử lại'));
      }
    } finally {
      if (timerId) clearTimeout(timerId);
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  const renderDeviceIcon = () => {
    switch (settings.deviceType) {
      case 'mobile': return <Smartphone className="w-5 h-5" />;
      case 'tablet': return <Tablet className="w-5 h-5" />;
      case 'desktop': return <Monitor className="w-5 h-5" />;
      default: return <Laptop className="w-5 h-5" />;
    }
  };

  return (
    <div id="auth-screen-container" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-emerald-500 selection:text-slate-900">
      {/* Background glow subtle effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md z-10 my-8">
        {/* Header Branding (LocalSend style: Clean, modern, intuitive) */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3.5 shadow-xl shadow-emerald-500/10 rounded-2xl">
            <CloudSendLogo className="w-16 h-16 rounded-2xl" size={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            CloudSend
            <span className="text-[11px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
              Relay Web
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Giao diện chia sẻ tệp & tin nhắn qua máy chủ trung gian
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
          {/* Quick Device Notice */}
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center gap-3 text-xs text-slate-300">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
              {renderDeviceIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-slate-400 block text-[11px]">Thiết bị gửi/nhận:</span>
              <span className="font-semibold text-white truncate block">
                {deviceName || settings.deviceName}
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium whitespace-nowrap bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Sẵn sàng
            </span>
          </div>

          {/* Friendly Info notice (e.g., if popup was closed) */}
          {infoNotice && (
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
              <div className="flex-1 leading-relaxed">{infoNotice}</div>
            </div>
          )}

          {/* Unauthorized Domain Explanatory Card (Matches user screenshot) */}
          {isUnauthorizedDomain && (
            <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-500/15 to-amber-950/20 border border-amber-500/40 text-amber-200 text-xs space-y-3 animate-in fade-in duration-200 shadow-xl">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                    <span>Lỗi auth/unauthorized-domain</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Firebase Authentication bảo vệ tài khoản bằng cách chặn đăng nhập Google trên các tên miền chưa được khai báo. Tên miền xem trước hiện tại (<span className="font-mono text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/30">{typeof window !== 'undefined' ? window.location.hostname : 'run.app'}</span>) chưa có trong danh sách <b>Authorized Domains</b> trên Firebase Console.
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/20 space-y-2">
                <span className="text-[11px] font-semibold text-emerald-400 block">
                  👉 Giải pháp vào ứng dụng ngay tức thì (Không cần cài đặt):
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Dùng ngay (Chế độ Khách 1-chạm)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnauthorizedDomain(false);
                      setIsRegistering(false);
                    }}
                    className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all border border-slate-700 text-center"
                  >
                    Dùng Email & Mật khẩu bên dưới
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* PRIMARY RECOMMENDED LOGIN: Google Sign-In & 1-Click Guest Access */}
          <div className="space-y-2.5">
            <button
              id="google-auth-btn"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-950/50 hover:shadow-emerald-500/25 active:scale-[0.99] disabled:opacity-75 group border border-emerald-400/30"
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span className="font-bold tracking-wide">Đang mở Google (Kiểm tra popup)...</span>
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-3 h-3" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 14.5s.7 4.8 1.9 7.2l3.7-2.9z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                      />
                    </svg>
                  </div>
                  <span className="font-bold tracking-wide">Đăng nhập nhanh với Google</span>
                </>
              )}
            </button>

            {isGoogleLoading && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(false);
                    setIsGoogleLoading(false);
                    handleGuestLogin();
                  }}
                  className="text-xs text-amber-300 hover:underline inline-flex items-center gap-1 font-medium py-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cửa sổ Google lâu mở? Bấm vào đây để vào thẳng app ngay</span>
                </button>
              </div>
            )}

            {/* Quick Guest Access (Instant 1-Click Entry) */}
            <button
              id="guest-auth-btn"
              type="button"
              onClick={handleGuestLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs transition-all border border-slate-700 active:scale-[0.99] disabled:opacity-50 shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>⚡ Vào nhanh ngay lập tức (Chế độ Khách / Không cần tài khoản)</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center pt-1">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
              Hoặc dùng Email & Mật khẩu
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <button
              id="tab-login-btn"
              type="button"
              onClick={() => { setIsRegistering(false); setErrorMsg(null); setInfoNotice(null); }}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                !isRegistering 
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Đăng nhập
            </button>
            <button
              id="tab-register-btn"
              type="button"
              onClick={() => { setIsRegistering(true); setErrorMsg(null); setInfoNotice(null); }}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                isRegistering 
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Đăng ký tài khoản
            </button>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegistering && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Họ và Tên / Biệt danh
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-fullname"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ví dụ: Hải Đức"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tên thiết bị hiển thị (Relay alias)
                  </label>
                  <div className="relative">
                    <Laptop className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-devicename"
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="Ví dụ: MacBook Pro - Mint"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Địa chỉ Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="input-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="input-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            {isRegistering && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Xác nhận lại mật khẩu
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              id="submit-auth-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-all border border-slate-700 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegistering ? 'Đăng ký với Email' : 'Đăng nhập với Email'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Security / Relay feature bullet */}
        <div className="mt-5 flex items-center justify-center gap-6 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Firebase Relay
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            Trực tuyến 24/7
          </span>
        </div>
      </div>
    </div>
  );
};
