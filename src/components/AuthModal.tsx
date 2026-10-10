import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CloudSendLogo } from './CloudSendLogo';
import { SilkFabricBackground } from './SilkFabricBackground';
import { SmoothTypewriter } from './SmoothTypewriter';
import { CompactWheelDatePicker } from './CompactWheelDatePicker';
import { 
  ShieldCheck, 
  Sparkles, 
  Lock, 
  User, 
  ArrowRight, 
  AlertCircle, 
  LogIn, 
  UserPlus, 
  Info, 
  Loader2, 
  Calendar, 
  CheckCircle2, 
  ArrowLeft, 
  Eye, 
  EyeOff,
  Sliders,
  Check
} from 'lucide-react';

type AuthMode = 'welcome' | 'login' | 'register';
type GenderOption = 'Nam' | 'Nữ' | 'Không Muốn Trả Lời';

export const AuthModal: React.FC = () => {
  const { 
    loginWithGoogle, 
    loginWithAccount, 
    registerWithAccount, 
    loginAsGuest, 
    settings 
  } = useAuth();

  // Màn hình bắt đầu là Welcome với Logo ở trên cao và 2 nút Đăng Nhập / Đăng Ký
  const [authMode, setAuthMode] = useState<AuthMode>('welcome');

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  // Giới tính ban đầu CHƯA CHỌN GÌ CẢ (null) theo đúng yêu cầu
  const [gender, setGender] = useState<GenderOption | null>(null);
  const [deviceName, setDeviceName] = useState(settings.deviceName || '');

  // UI helpers
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Date Picker Wheel Modal (Cuộn lăn chuột & vuốt chạm điện thoại)
  const [showWheelDatePicker, setShowWheelDatePicker] = useState(false);

  const resetFormErrors = () => {
    setErrorMsg(null);
    setInfoNotice(null);
    setIsUnauthorizedDomain(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormErrors();

    if (!username.trim()) {
      setErrorMsg('Vui lòng nhập tên tài khoản.');
      return;
    }

    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu tài khoản.');
      return;
    }

    setIsLoading(true);
    try {
      await loginWithAccount(username.trim(), password);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Tên tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.');
      } else {
        setErrorMsg(err?.message || 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormErrors();

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg('Vui lòng nhập tên tài khoản.');
      return;
    }

    if (cleanUsername.length < 3) {
      setErrorMsg('Tên tài khoản phải có ít nhất 3 ký tự.');
      return;
    }

    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu tài khoản.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Mật khẩu tài khoản phải có tối thiểu 6 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
      return;
    }

    setIsLoading(true);
    try {
      await registerWithAccount({
        username: cleanUsername,
        pass: password,
        dob: dob ? dob.trim() : undefined,
        gender: gender || 'Không Muốn Trả Lời',
        deviceName: deviceName ? deviceName.trim() : undefined
      });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrorMsg('Tên tài khoản này đã có người đăng ký. Vui lòng chọn tên khác hoặc chuyển sang Đăng nhập.');
      } else {
        setErrorMsg(err?.message || 'Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    resetFormErrors();
    setIsLoading(true);
    try {
      await loginAsGuest(username.trim() || deviceName.trim() || undefined, deviceName.trim() || undefined);
    } catch (err: any) {
      setErrorMsg('Không thể tạo phiên sử dụng nhanh: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    resetFormErrors();
    setIsLoading(true);
    setIsGoogleLoading(true);
    
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
        setInfoNotice('Bạn đã đóng cửa sổ đăng nhập Google. Bạn có thể nhấn lại để thử lại hoặc chọn đăng nhập bằng tài khoản.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép popup hoặc đăng nhập bằng Tên tài khoản.');
      } else if (code === 'auth/unauthorized-domain') {
        setIsUnauthorizedDomain(true);
      } else if (msg === 'POPUP_TIMEOUT') {
        setInfoNotice('Cửa sổ đăng nhập Google đang phản hồi chậm. Bạn có thể bấm Đăng nhập nhanh hoặc dùng Tên tài khoản.');
      } else {
        setErrorMsg('Đăng nhập Google không thành công: ' + (err?.message || 'Vui lòng thử lại hoặc dùng Tên tài khoản'));
      }
    } finally {
      if (timerId) clearTimeout(timerId);
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-100 relative overflow-x-hidden overflow-y-auto font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background Silk Fabric Effect */}
      <SilkFabricBackground className="fixed inset-0 pointer-events-none" />

      {/* Decorative top soft glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      {/* Main Container with Smooth Screen Transition */}
      <div className="w-full max-w-md my-auto relative z-10 py-6 transition-all duration-300">

        {/* ============================================================ */}
        {/* 1. MÀN HÌNH CHÀO MỪNG (WELCOME SCREEN) */}
        {/* ============================================================ */}
        {authMode === 'welcome' && (
          <div className="w-full animate-in fade-in zoom-in-95 duration-300">
            {/* Logo lớn ở vị trí trang trọng trên cao */}
            <div className="text-center mb-6 flex flex-col items-center">
              <div className="relative group mb-3">
                <div className="absolute -inset-3 bg-gradient-to-br from-emerald-500/30 via-teal-500/20 to-emerald-600/30 rounded-3xl blur-lg opacity-70 group-hover:opacity-100 transition duration-500" />
                <div className="relative inline-flex items-center justify-center shadow-2xl rounded-2xl bg-slate-900 border border-emerald-500/40 p-1.5 transform group-hover:scale-105 transition-transform duration-300">
                  <CloudSendLogo className="w-20 h-20 rounded-xl" size={80} />
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>CloudSend Relay</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  v2.5
                </span>
              </h1>
              
              {/* Typewriter tagline mượt mà */}
              <div className="mt-2 min-h-[24px] flex items-center justify-center">
                <SmoothTypewriter
                  texts={[
                    "Chia sẻ tệp tin & phòng trò chuyện trực tuyến",
                    "Truyền dữ liệu tốc độ cao tới 250MB qua Relay",
                    "Đồng bộ ghi chú, liên kết và kho Cloud 24/7",
                    "Bảo mật đa nền tảng cho Điện thoại & Máy tính"
                  ]}
                  typingSpeed={40}
                  deletingSpeed={20}
                  pauseDuration={2600}
                  className="text-slate-300 text-xs sm:text-sm text-center leading-relaxed font-normal"
                  cursorClassName="text-emerald-400"
                />
              </div>
            </div>

            {/* Khung chứa 2 nút chính: Đăng Nhập & Đăng Ký */}
            <div className="w-full bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-2xl p-6 sm:p-7 shadow-2xl space-y-4">
              {/* NÚT 1: ĐĂNG NHẬP */}
              <button
                id="btn-nav-login"
                type="button"
                onClick={() => {
                  resetFormErrors();
                  setAuthMode('login');
                }}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white font-bold text-sm sm:text-base transition-all shadow-lg shadow-emerald-950/60 hover:shadow-emerald-500/25 active:scale-[0.99] border border-emerald-400/40 group relative overflow-hidden"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <LogIn className="w-5 h-5 group-hover:translate-x-0.5 transition-transform shrink-0" />
                <span>Đăng Nhập</span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-75 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* NÚT 2: ĐĂNG KÝ */}
              <button
                id="btn-nav-register"
                type="button"
                onClick={() => {
                  resetFormErrors();
                  setAuthMode('register');
                }}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-100 hover:text-white font-bold text-sm sm:text-base transition-all shadow-md active:scale-[0.99] border border-slate-700 hover:border-emerald-500/40 group"
              >
                <UserPlus className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                <span>Đăng Ký</span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-60 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Phân cách và các tùy chọn vào nhanh bổ sung */}
              <div className="relative flex items-center justify-center pt-2">
                <div className="border-t border-slate-800 w-full" />
                <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                  Hoặc truy cập nhanh
                </span>
              </div>

              <div className="space-y-2.5 w-full">
                {/* 1. Đăng nhập nhanh với Google */}
                <button
                  id="welcome-google-btn"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-200 hover:text-white font-medium text-xs sm:text-sm transition-all duration-200 border border-slate-800 hover:border-slate-700 active:scale-[0.99] disabled:opacity-50 shadow-md group"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Đang kết nối Google...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                          <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 14.5s.7 4.8 1.9 7.2l3.7-2.9z" />
                          <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z" />
                        </svg>
                      </div>
                      <span>Đăng nhập với Google</span>
                    </>
                  )}
                </button>

                {/* Unauthorized domain warning notice */}
                {isUnauthorizedDomain && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div className="font-semibold">Tên miền chưa được ủy quyền trong Firebase Auth</div>
                    </div>
                    <p className="text-amber-300/90 leading-relaxed">
                      Google yêu cầu tên miền ứng dụng (<code className="bg-black/30 px-1 py-0.5 rounded font-mono text-[11px] text-amber-300">{window.location.hostname}</code>) phải được thêm vào danh sách <strong className="text-amber-200">Authorized domains</strong> trong Firebase Console &gt; Authentication &gt; Settings.
                    </p>
                    <p className="text-slate-300">
                      Bạn có thể đăng nhập tức thì bằng <strong>Tên tài khoản / Mật khẩu</strong> hoặc <strong>Đăng nhập nhanh (Chế độ Khách)</strong> ngay bên dưới!
                    </p>
                  </div>
                )}

                {/* 2. Đăng nhập nhanh Chế độ Khách */}
                <button
                  id="welcome-guest-btn"
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-200 hover:text-emerald-300 font-medium text-xs sm:text-sm transition-all duration-200 border border-slate-800 hover:border-emerald-500/40 active:scale-[0.99] disabled:opacity-50 shadow-md group"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span>Đăng nhập nhanh (Chế độ Khách / Ẩn danh)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. MÀN HÌNH ĐĂNG NHẬP (LOGIN SCREEN) */}
        {/* ============================================================ */}
        {authMode === 'login' && (
          <div className="w-full animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            {/* Logo nhỏ ở trên cùng */}
            <div className="text-center mb-4 flex flex-col items-center">
              <div className="relative group mb-2">
                <div className="absolute -inset-2 bg-gradient-to-br from-emerald-500/30 to-teal-500/30 rounded-2xl blur-md opacity-60" />
                <div className="relative inline-flex items-center justify-center shadow-xl rounded-2xl bg-slate-900 border border-emerald-500/30 p-1">
                  <CloudSendLogo className="w-12 h-12 rounded-xl" size={48} />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                Đăng Nhập Tài Khoản
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Nhập thông tin tài khoản của bạn để tiếp tục
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-2xl p-5 sm:p-7 shadow-2xl space-y-4">
              {/* Header điều hướng & Tab Switcher mượt mà */}
              <div className="flex items-center justify-between pb-1">
                <button
                  type="button"
                  onClick={() => {
                    resetFormErrors();
                    setAuthMode('welcome');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Trang chính</span>
                </button>

                {/* Tab Switcher: Đăng Nhập / Đăng Ký */}
                <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 shadow-sm transition-all"
                  >
                    Đăng Nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormErrors();
                      setAuthMode('register');
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800/50"
                  >
                    Đăng Ký
                  </button>
                </div>
              </div>

              {/* Thông báo lỗi nếu có */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="flex-1 leading-relaxed">{errorMsg}</div>
                </div>
              )}

              {/* Friendly Info notice */}
              {infoNotice && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
                  <div className="flex-1 leading-relaxed">{infoNotice}</div>
                </div>
              )}

              {/* Form Đăng Nhập */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* THANH THỨ NHẤT: Tên tài khoản */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Tên tài khoản
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-login-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Nhập tên tài khoản"
                      className="smooth-input w-full pl-10 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                {/* THANH THỨ HAI: Mật khẩu */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu tài khoản"
                      className="smooth-input w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* NÚT ĐĂNG NHẬP */}
                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-950/50 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 border border-emerald-400/30"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang xác thực...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Đăng Nhập</span>
                    </>
                  )}
                </button>
              </form>

              {/* Chuyển sang Đăng ký */}
              <div className="pt-2 text-center text-xs text-slate-400 border-t border-slate-800">
                <span>Chưa có tài khoản? </span>
                <button
                  type="button"
                  onClick={() => {
                    resetFormErrors();
                    setAuthMode('register');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline ml-1"
                >
                  Đăng ký tài khoản mới &gt;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3. MÀN HÌNH ĐĂNG KÝ (REGISTER SCREEN) */}
        {/* ============================================================ */}
        {authMode === 'register' && (
          <div className="w-full animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            {/* Logo nhỏ ở trên cùng */}
            <div className="text-center mb-4 flex flex-col items-center">
              <div className="relative group mb-2">
                <div className="absolute -inset-2 bg-gradient-to-br from-emerald-500/30 to-teal-500/30 rounded-2xl blur-md opacity-60" />
                <div className="relative inline-flex items-center justify-center shadow-xl rounded-2xl bg-slate-900 border border-emerald-500/30 p-1">
                  <CloudSendLogo className="w-12 h-12 rounded-xl" size={48} />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                Đăng Ký Tài Khoản
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Điền thông tin bên dưới để tạo tài khoản mới
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-2xl p-5 sm:p-7 shadow-2xl space-y-4">
              {/* Header điều hướng & Tab Switcher mượt mà */}
              <div className="flex items-center justify-between pb-1">
                <button
                  type="button"
                  onClick={() => {
                    resetFormErrors();
                    setAuthMode('welcome');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Trang chính</span>
                </button>

                {/* Tab Switcher: Đăng Nhập / Đăng Ký */}
                <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      resetFormErrors();
                      setAuthMode('login');
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800/50"
                  >
                    Đăng Nhập
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 shadow-sm transition-all"
                  >
                    Đăng Ký
                  </button>
                </div>
              </div>

              {/* Thông báo lỗi nếu có */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="flex-1 leading-relaxed">{errorMsg}</div>
                </div>
              )}

              {/* Form Đăng Ký với 5 thanh theo yêu cầu */}
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                {/* 1. TÊN TÀI KHOẢN */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Tên tài khoản <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-reg-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Nhập tên tài khoản"
                      className="smooth-input w-full pl-10 pr-3 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                {/* 2. NGÀY/THÁNG/NĂM SINH (Cuộn khi lăn chuột hoặc vuốt trên điện thoại) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-200">
                      Ngày/Tháng/Năm sinh (không bắt buộc)
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">Tùy chọn</span>
                  </div>

                  <div className="relative flex items-center">
                    {/* Icon cuốn lịch nhỏ gọn, đặt ở góc trái của ô nhập */}
                    <button
                      type="button"
                      onClick={() => setShowWheelDatePicker(!showWheelDatePicker)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-300 transition-colors z-10 p-1 rounded-md hover:bg-slate-800/60 group cursor-pointer"
                      title="Bấm để cuộn chọn ngày tháng năm sinh (lăn chuột hoặc vuốt điện thoại)"
                    >
                      <Calendar className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    </button>

                    {/* Ô NHẬP TEXT: Bấm vào mở Bảng Cuộn Ngày Sinh */}
                    <input
                      id="input-reg-dob"
                      type="text"
                      readOnly
                      value={dob ? dob.split('-').reverse().join(' / ') : ''}
                      onClick={() => setShowWheelDatePicker(!showWheelDatePicker)}
                      placeholder="Bấm để cuộn chọn Ngày / Tháng / Năm sinh"
                      className="smooth-input w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700/80 hover:border-emerald-500/60 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none cursor-pointer transition-all duration-200 select-none"
                    />

                    {/* BẢNG CUỘN ĐẶT Ở DƯỚI GÓC TRÁI CỦA ICON CUỐN LỊCH */}
                    {showWheelDatePicker && (
                      <CompactWheelDatePicker
                        value={dob}
                        onSave={(newDate) => setDob(newDate)}
                        onClose={() => setShowWheelDatePicker(false)}
                      />
                    )}
                  </div>
                </div>

                {/* 3. MẬT KHẨU */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Mật Khẩu <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-reg-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu tài khoản"
                      className="smooth-input w-full pl-10 pr-10 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                      title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 4. XÁC NHẬN LẠI MẬT KHẨU */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Xác Nhận Lại Mật Khẩu <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-reg-confirmpass"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu để xác nhận"
                      className="smooth-input w-full pl-10 pr-10 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
                      title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 5. GIỚI TÍNH: BAN ĐẦU CHƯA CHỌN GÌ CẢ (KHI CHỌN SẼ SÁNG LÊN NHƯ BÌNH THƯỜNG) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-200">
                      Giới Tính:
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {gender ? `Đã chọn: ${gender}` : 'Chưa chọn'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Nam', 'Nữ', 'Không Muốn Trả Lời'] as GenderOption[]).map((g) => {
                      const isSelected = gender === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={`py-2 px-2 rounded-xl text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 border active:scale-95 ${
                            isSelected
                              ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500 ring-2 ring-emerald-500/30 font-bold shadow-md shadow-emerald-500/20 scale-[1.02]'
                              : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-in zoom-in-50 duration-150" />}
                          <span className="truncate">{g}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* NÚT CUỐI CÙNG: TẠO TÀI KHOẢN */}
                <button
                  id="submit-register-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:via-teal-500 hover:to-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-950/50 active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 border border-emerald-400/30"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang tạo tài khoản...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Tạo Tài Khoản</span>
                    </>
                  )}
                </button>
              </form>

              {/* Chuyển sang Đăng nhập */}
              <div className="pt-2 text-center text-xs text-slate-400 border-t border-slate-800">
                <span>Đã có tài khoản? </span>
                <button
                  type="button"
                  onClick={() => {
                    resetFormErrors();
                    setAuthMode('login');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline ml-1"
                >
                  Đăng nhập ngay &gt;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security / Relay feature footer */}
        <div className="mt-5 flex items-center justify-center gap-6 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Bảo mật Relay
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
