import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Volume2, 
  VolumeX, 
  DownloadCloud, 
  Server, 
  LogOut, 
  User, 
  Check, 
  Sparkles,
  Shield,
  Palette,
  RefreshCw,
  Lock,
  Cpu,
  ShieldAlert,
  ExternalLink,
  Database,
  Tv,
  Sliders,
  Scale,
  Wand2,
  Layers,
  Flame,
  Eye,
  Shuffle,
  KeyRound,
  Mail,
  Link2,
  UserCheck,
  Copy,
  CheckCircle2,
  AlertCircle,
  MonitorSmartphone,
  MapPin,
  Clock,
  EyeOff,
  Radio,
  Power,
  ShieldCheck,
  FileText,
  Send,
  Inbox
} from 'lucide-react';
import { DeviceType, LoginSession } from '../types';
import { AVATAR_COLORS, getDeviceTypeInfo, generateDefaultDeviceName } from '../utils/device';
import { playReceiveSound } from '../utils/sound';
import { isDevUser } from '../utils/devModeration';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRules?: () => void;
  onOpenDevConsole?: () => void;
  onOpenDevPage?: () => void;
}

type SettingsTab = 'device' | 'display_tv' | 'custom_design' | 'account_rules';

// Theme Presets for Custom Design Frame
const THEME_PRESETS = [
  { id: 'emerald', name: 'Emerald Silk', color: '#10B981', gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent', border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20' },
  { id: 'cyan', name: 'Cyberpunk Cyan', color: '#06B6D4', gradient: 'from-cyan-500/20 via-blue-500/10 to-transparent', border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20' },
  { id: 'purple', name: 'Royal Amethyst', color: '#8B5CF6', gradient: 'from-purple-500/20 via-pink-500/10 to-transparent', border: 'border-purple-500/40', glow: 'shadow-purple-500/20' },
  { id: 'amber', name: 'Sunset Amber', color: '#F59E0B', gradient: 'from-amber-500/20 via-orange-500/10 to-transparent', border: 'border-amber-500/40', glow: 'shadow-amber-500/20' },
  { id: 'rose', name: 'Neon Crimson', color: '#EC4899', gradient: 'from-rose-500/20 via-pink-500/10 to-transparent', border: 'border-rose-500/40', glow: 'shadow-rose-500/20' },
  { id: 'midnight', name: 'Midnight OLED', color: '#64748B', gradient: 'from-slate-800/40 via-slate-900/40 to-black', border: 'border-slate-700', glow: 'shadow-slate-500/10' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onOpenRules, 
  onOpenDevConsole,
  onOpenDevPage 
}) => {
  const { 
    currentUser, 
    userProfile, 
    settings, 
    updateSettings, 
    logout,
    changePassword,
    updateDisplayName,
    linkEmail,
    sendEmailVerificationCode,
    verifyEmailCodeAndLink,
    getLoginSessions,
    logoutSession,
    logoutAllDevices
  } = useAuth();
  
  // Tab Management
  const [activeTab, setActiveTab] = useState<SettingsTab>('device');

  // Form states
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [avatarColor, setAvatarColor] = useState(settings.avatarColor);
  const [autoAccept, setAutoAccept] = useState(settings.autoAccept);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [tvModeEnabled, setTvModeEnabled] = useState(settings.tvModeEnabled ?? (settings.deviceType === 'tv'));
  const [tvDpiScale, setTvDpiScale] = useState(settings.tvDpiScale || 1.4);
  
  // Custom Design & Canvas parameters
  const [themeStyle, setThemeStyle] = useState<string>(settings.themeStyle || 'emerald');
  const [customBadgeText, setCustomBadgeText] = useState<string>(settings.customBadgeText || 'Thành viên CloudSend');
  const [customBio, setCustomBio] = useState<string>(settings.customBio || 'Sẵn sàng truyền nhận dữ liệu tốc độ cao.');
  const [cardStyle, setCardStyle] = useState<'glass' | 'glow' | 'minimal' | 'solid'>(settings.cardStyle || 'glow');
  const [customHexColor, setCustomHexColor] = useState<string>(settings.customHexColor || settings.avatarColor || '#10B981');

  const currentThemeObj = React.useMemo(() => {
    return THEME_PRESETS.find(t => t.id === themeStyle) || THEME_PRESETS[0];
  }, [themeStyle]);

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // ------------------------------------------------------------
  // ACCOUNT & SESSIONS STATES (6 BARS)
  // ------------------------------------------------------------
  // 1. Tên Đăng Nhập
  const rawUsername = userProfile?.username || (currentUser?.email?.includes('@cloudsend.local') ? currentUser.email.split('@')[0] : (currentUser?.displayName || ''));
  const [copiedUsername, setCopiedUsername] = useState(false);

  // 2. Mật Khẩu
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 3. Tên Hiển Thị
  const [editDisplayName, setEditDisplayName] = useState(currentUser?.displayName || userProfile?.displayName || '');
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [displayNameSuccess, setDisplayNameSuccess] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);

  // 4. Liên Kết Tài Khoản (Email) với Mã Bảo Mật 6 Số (OTP)
  const isLinkedEmail = Boolean(currentUser?.email && !currentUser.email.includes('@cloudsend.local') && !currentUser.email.startsWith('guest_'));
  const isEmailFullyVerified = Boolean(userProfile?.isEmailVerified || (isLinkedEmail && userProfile?.linkedEmail));
  const [linkEmailInput, setLinkEmailInput] = useState(isLinkedEmail ? (currentUser?.email || '') : '');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpExpiresTimestamp, setOtpExpiresTimestamp] = useState<number | null>(null);
  const [otpTimeLeftSeconds, setOtpTimeLeftSeconds] = useState<number>(0);
  const [isOtpExpired, setIsOtpExpired] = useState(false);
  const [emailDispatchData, setEmailDispatchData] = useState<{
    recipientEmail: string;
    code: string;
    expiresAt: string;
    formattedMessage: string;
  } | null>(null);
  const [isEditingLinkedEmail, setIsEditingLinkedEmail] = useState(false);
  const [linkEmailSuccess, setLinkEmailSuccess] = useState<string | null>(null);
  const [linkEmailError, setLinkEmailError] = useState<string | null>(null);

  // Countdown timer for 15-minute OTP lifespan
  useEffect(() => {
    if (!isOtpSent || !otpExpiresTimestamp) return;

    const updateTimer = () => {
      const now = Date.now();
      const diffMs = otpExpiresTimestamp - now;
      const secondsLeft = Math.max(0, Math.floor(diffMs / 1000));
      setOtpTimeLeftSeconds(secondsLeft);

      if (secondsLeft <= 0) {
        setIsOtpExpired(true);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOtpSent, otpExpiresTimestamp]);

  const formatOtpCountdown = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 5. Các Thiết Bị Đã Đăng Nhập
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // 6. Đăng Xuất & Đăng Xuất Tất Cả
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);

  // Synchronize internal form fields whenever the modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setDeviceName(settings.deviceName);
      setAvatarColor(settings.avatarColor);
      setAutoAccept(settings.autoAccept);
      setSoundEnabled(settings.soundEnabled);
      setTvModeEnabled(settings.tvModeEnabled ?? (settings.deviceType === 'tv'));
      setTvDpiScale(settings.tvDpiScale || 1.4);
      setThemeStyle(settings.themeStyle || 'emerald');
      setCustomBadgeText(settings.customBadgeText || 'Thành viên CloudSend');
      setCustomBio(settings.customBio || 'Sẵn sàng truyền nhận dữ liệu tốc độ cao.');
      setCardStyle(settings.cardStyle || 'glow');
      setCustomHexColor(settings.customHexColor || settings.avatarColor || '#10B981');
      setEditDisplayName(currentUser?.displayName || userProfile?.displayName || '');
    }
  }, [isOpen, settings, currentUser, userProfile]);

  // Load active logged-in device sessions when user visits Account & Rules tab
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const list = await getLoginSessions();
      setSessions(list);
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'account_rules') {
      fetchSessions();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    const syncedName = (deviceName || editDisplayName || settings.deviceName).trim();
    await updateSettings({
      deviceName: syncedName,
      avatarColor,
      autoAccept,
      soundEnabled,
      tvModeEnabled,
      tvDpiScale,
      themeStyle,
      customBadgeText: customBadgeText.trim(),
      customBio: customBio.trim(),
      cardStyle,
      customHexColor,
    });
    if (syncedName && (!currentUser?.displayName || currentUser.displayName !== syncedName)) {
      try {
        await updateDisplayName(syncedName);
      } catch {
        // ignore
      }
    }
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  const handleTestSound = () => {
    playReceiveSound();
  };

  const handleRandomizeDeviceName = () => {
    const newName = generateDefaultDeviceName(settings.deviceType);
    setDeviceName(newName);
    setEditDisplayName(newName);
  };

  const deviceInfo = getDeviceTypeInfo(settings.deviceType);

  const renderCurrentDeviceIcon = (sizeClass = 'w-5 h-5') => {
    switch (settings.deviceType) {
      case 'mobile':
        return <Smartphone className={`${sizeClass} text-emerald-400`} />;
      case 'tablet':
        return <Tablet className={`${sizeClass} text-emerald-400`} />;
      case 'desktop':
        return <Monitor className={`${sizeClass} text-emerald-400`} />;
      case 'tv':
        return <Tv className={`${sizeClass} text-emerald-400`} />;
      case 'laptop':
      default:
        return <Laptop className={`${sizeClass} text-emerald-400`} />;
    }
  };

  const renderDeviceIconByType = (type: string, sizeClass = 'w-4 h-4') => {
    switch (type) {
      case 'mobile':
        return <Smartphone className={`${sizeClass} text-emerald-400`} />;
      case 'tablet':
        return <Tablet className={`${sizeClass} text-emerald-400`} />;
      case 'desktop':
        return <Monitor className={`${sizeClass} text-emerald-400`} />;
      case 'tv':
        return <Tv className={`${sizeClass} text-amber-400`} />;
      case 'laptop':
      default:
        return <Laptop className={`${sizeClass} text-emerald-400`} />;
    }
  };

  // ------------------------------------------------------------
  // ACCOUNT ACTION HANDLERS
  // ------------------------------------------------------------
  // 1. Copy Username
  const handleCopyUsername = () => {
    if (rawUsername) {
      navigator.clipboard.writeText(rawUsername);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
    }
  };

  // 2. Change Password
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Mật khẩu xác nhận mới không khớp.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Đổi mật khẩu tài khoản thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setPasswordSuccess(null), 3000);
    } catch (err: any) {
      setPasswordError(err?.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // 3. Update Display Name & Device Name (Fully Synchronized)
  const handleUpdateDisplayNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisplayNameError(null);
    setDisplayNameSuccess(null);

    const clean = editDisplayName.trim();
    if (!clean) {
      setDisplayNameError('Vui lòng nhập tên hiển thị.');
      return;
    }

    setIsUpdatingDisplayName(true);
    try {
      setDeviceName(clean);
      await updateDisplayName(clean);
      await updateSettings({ deviceName: clean });
      setDisplayNameSuccess('Cập nhật & đồng bộ tên thiết bị thành công!');
      setTimeout(() => setDisplayNameSuccess(null), 3000);
    } catch (err: any) {
      setDisplayNameError(err?.message || 'Không thể cập nhật tên hiển thị.');
    } finally {
      setIsUpdatingDisplayName(false);
    }
  };

  // 4. Send 6-Digit OTP Security Code to Email (15-min Lifespan)
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLinkEmailError(null);
    setLinkEmailSuccess(null);
    const clean = linkEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!clean || !emailRegex.test(clean)) {
      setLinkEmailError('Vui lòng nhập đúng định dạng địa chỉ email (ví dụ: yourname@gmail.com).');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await sendEmailVerificationCode(clean);
      setIsOtpSent(true);
      setOtpExpiresTimestamp(res.expiresTimestamp);
      setOtpTimeLeftSeconds(Math.floor((res.expiresTimestamp - Date.now()) / 1000));
      setIsOtpExpired(false);
      setOtpCodeInput('');
      setEmailDispatchData({
        recipientEmail: res.recipientEmail,
        code: res.code,
        expiresAt: res.expiresAt,
        formattedMessage: res.emailMessage,
      });
      setLinkEmailSuccess(`Mã xác thực 6 số đã được tạo và gửi đến [${clean}]. Mã có hiệu lực trong đúng 15 phút!`);
    } catch (err: any) {
      setLinkEmailError(err?.message || 'Không thể gửi mã xác thực. Vui lòng kiểm tra lại địa chỉ email.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // 4. Verify 6-Digit OTP Code & Link Email
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkEmailError(null);
    setLinkEmailSuccess(null);

    const cleanEmail = linkEmailInput.trim().toLowerCase();
    const cleanCode = otpCodeInput.trim();

    if (!cleanCode) {
      setLinkEmailError('Vui lòng nhập mã xác nhận 6 chữ số.');
      return;
    }

    if (isOtpExpired || (otpExpiresTimestamp && Date.now() > otpExpiresTimestamp)) {
      setLinkEmailError('Mã xác nhận đã hết hạn (chỉ có hiệu lực trong 15 phút). Vui lòng nhấn "Gửi lại mã mới".');
      setIsOtpExpired(true);
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await verifyEmailCodeAndLink(cleanEmail, cleanCode);
      setLinkEmailSuccess(`Chúc mừng! Tài khoản đã liên kết và xác thực thành công với Email [${cleanEmail}].`);
      setIsOtpSent(false);
      setEmailDispatchData(null);
      setIsEditingLinkedEmail(false);
      setTimeout(() => setLinkEmailSuccess(null), 5000);
    } catch (err: any) {
      if (err?.code === 'OTP_EXPIRED') {
        setIsOtpExpired(true);
      }
      setLinkEmailError(err?.message || 'Mã xác thực không hợp lệ. Vui lòng thử lại.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // 5. Logout Single Session
  const handleLogoutSession = async (sessionId: string) => {
    await logoutSession(sessionId);
    await fetchSessions();
  };

  // 6. Logout Current Device
  const handleDirectLogout = async () => {
    setIsLoggingOut(true);
    onClose();
    await logout();
  };

  // 7. Logout All Devices
  const handleLogoutAllDevicesConfirm = async () => {
    setIsLoggingOutAll(true);
    setShowLogoutAllConfirm(false);
    onClose();
    await logoutAllDevices();
  };

  const formatSessionTime = (isoString?: string) => {
    if (!isoString) return 'Vừa xong';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-950/90 animate-in fade-in duration-150">
      {/* Background soft ambient light (Lightweight GPU radial glow) */}
      <div className="absolute w-[500px] h-[250px] bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Main Container: Wide, Spacious, Modern, GPU-Accelerated */}
      <div 
        id="settings-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative z-10 gpu-smooth-card"
      >
        {/* ============================================================ */}
        {/* MODAL HEADER */}
        {/* ============================================================ */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/90 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <Sliders className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Cài Đặt Hệ Thống & Tùy Biến
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  v2.5
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quản lý tài khoản, phiên đăng nhập, phần cứng, Smart TV và khung tự thiết kế
              </p>
            </div>
          </div>
          
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center min-h-[42px] min-w-[42px] active:scale-95"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* MODERN BIG TAB NAVIGATION BAR */}
        {/* ============================================================ */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            {/* TAB 1: THIẾT BỊ & MẠNG */}
            <button
              type="button"
              onClick={() => setActiveTab('device')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-150 active:scale-95 ${
                activeTab === 'device'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Thiết Bị & Mạng</span>
            </button>

            {/* TAB 2: HIỂN THỊ & SMART TV */}
            <button
              type="button"
              onClick={() => setActiveTab('display_tv')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-150 active:scale-95 ${
                activeTab === 'display_tv'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Hiển Thị & Smart TV</span>
            </button>

            {/* TAB 3: KHUNG TỰ THIẾT KẾ (DESIGN STUDIO & CANVAS) */}
            <button
              type="button"
              onClick={() => setActiveTab('custom_design')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-150 active:scale-95 relative ${
                activeTab === 'custom_design'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-bold ring-2 ring-purple-400/50'
                  : 'bg-slate-900 text-purple-300 hover:text-white hover:bg-slate-800 border border-purple-500/30'
              }`}
            >
              <Wand2 className="w-4 h-4 text-purple-300" />
              <span>Khung Tự Thiết Kế</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-400 text-slate-950 font-bold">
                Mới
              </span>
            </button>

            {/* TAB 4: TÀI KHOẢN & NỘI QUY (VỚI 6 THANH CHI TIẾT) */}
            <button
              type="button"
              onClick={() => setActiveTab('account_rules')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-150 active:scale-95 ${
                activeTab === 'account_rules'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Tài Khoản & Nội Quy</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL BODY (CONTENT BY TAB) */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 smooth-modal-scroll">
          
          {/* ------------------------------------------------------------ */}
          {/* TAB 1: THIẾT BỊ & MẠNG */}
          {/* ------------------------------------------------------------ */}
          {activeTab === 'device' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* 1. ĐỊNH DANH THIẾT BỊ */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Định danh thiết bị (LocalSend Alias)
                  </h3>
                  <button
                    type="button"
                    onClick={handleRandomizeDeviceName}
                    className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-colors"
                    title="Tạo tên ngẫu nhiên vui nhộn"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Tên ngẫu nhiên</span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <label className="text-xs text-slate-300 font-medium">
                      Tên thiết bị hiển thị với người khác trong mạng
                    </label>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 text-emerald-400" />
                      Đồng bộ trực tiếp với Tài khoản & Nội quy
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="setting-device-name"
                      type="text"
                      value={deviceName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDeviceName(val);
                        setEditDisplayName(val);
                      }}
                      placeholder="Ví dụ: Laptop Bạc Hà, PC Hổ Phách..."
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Phần cứng tự động nhận diện */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                      <span>Loại phần cứng đã nhận diện</span>
                    </label>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25">
                      <Lock className="w-3 h-3" />
                      Tự động khóa phần cứng
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                      {renderCurrentDeviceIcon('w-6 h-6')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {deviceInfo.label}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          Auto-detected
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {deviceInfo.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. MÁY CHỦ TRUNG GIAN & TRẠNG THÁI RELAY */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Máy chủ trung gian & Hạ tầng Relay
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Trạng thái kết nối</div>
                    <div className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Trực tuyến 24/7
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Hạ tầng Cloud</div>
                    <div className="text-xs font-semibold text-white mt-1">
                      Firestore Cloud Relay
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">Giao thức bảo mật</div>
                    <div className="text-xs font-semibold text-slate-200 mt-1 font-mono">
                      TLS 1.3 End-to-End
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. TÙY CHỌN TỰ ĐỘNG NHẬN TỆP & ÂM THANH */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-3.5">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <DownloadCloud className="w-4 h-4" />
                  Tùy chọn nhận tệp & Âm thanh
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                    <div className="pr-2">
                      <div className="text-xs sm:text-sm font-semibold text-white">Tự động nhận tệp (Quick Save)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Tự động chấp nhận tệp từ bạn bè mà không cần duyệt thủ công</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoAccept}
                      onChange={(e) => setAutoAccept(e.target.checked)}
                      className="w-5 h-5 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500 shrink-0 ml-2"
                    />
                  </label>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="pr-2">
                      <div className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                        {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                        Âm thanh thông báo
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Chuông nhẹ khi gửi/nhận tệp & tin nhắn</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleTestSound}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      >
                        Thử chuông
                      </button>
                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={(e) => setSoundEnabled(e.target.checked)}
                        className="w-5 h-5 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* TAB 2: HIỂN THỊ & SMART TV */}
          {/* ------------------------------------------------------------ */}
          {activeTab === 'display_tv' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* CHẾ ĐỘ SMART TV & PHÓNG TO DPI */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <Tv className="w-4 h-4" />
                    Chế độ Smart TV & Sửa lỗi DPI Màn hình lớn
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                    10-Foot UI
                  </span>
                </div>

                {/* Nút gạt bật tắt TV Mode */}
                <label className="flex items-center justify-between p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                  <div className="pr-4">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Kích hoạt Chế độ Tivi (Smart TV Mode)</span>
                      {tvModeEnabled && (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Đang bật
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Tối ưu giao diện cho màn hình Tivi (Samsung Tizen, LG WebOS, Android TV, Sony, TCL). Tự động nhận diện thiết bị là Smart TV trên mạng và hỗ trợ điều khiển Remote D-Pad.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tvModeEnabled}
                    onChange={(e) => setTvModeEnabled(e.target.checked)}
                    className="w-5 h-5 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500 shrink-0"
                  />
                </label>

                {/* Bộ chọn Tỷ lệ phóng to DPI TV */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-amber-400" />
                      Tỷ lệ phóng to DPI TV (Khắc phục lỗi chữ nhỏ trên TV)
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                      {Math.round(tvDpiScale * 100)}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    Trình duyệt TV thường bị lỗi DPI khiến chữ và nút bấm quá nhỏ khi nhìn từ xa. Hãy chọn mức phóng to phù hợp với kích thước TV của bạn:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                    {[
                      { scale: 1.0, label: '100%', note: 'Chuẩn PC' },
                      { scale: 1.25, label: '125%', note: 'TV 32-43"' },
                      { scale: 1.4, label: '140%', note: 'TV 49-55" (Chuẩn)' },
                      { scale: 1.6, label: '160%', note: 'TV 65-75"' },
                      { scale: 1.85, label: '185%', note: 'TV 4K Siêu to' },
                    ].map((preset) => {
                      const isSelected = Math.abs(tvDpiScale - preset.scale) < 0.05;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setTvDpiScale(preset.scale);
                            if (!tvModeEnabled) setTvModeEnabled(true);
                          }}
                          className={`p-3 rounded-xl text-center border transition-all ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          <div className="text-sm font-bold">{preset.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{preset.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hướng dẫn phím Remote TV */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-2">
                  <div className="font-bold text-amber-300 flex items-center gap-2">
                    <span>🎮 Hỗ trợ phím Điều khiển Tivi (Remote Control D-Pad)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-slate-400">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.5">◀ / ▶ Mũi tên Trái - Phải:</strong>
                      Chuyển nhanh tab Gửi, Nhận & Chat
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.5">🔘 Nút OK / Enter:</strong>
                      Chọn nút, gửi và tải tệp tin
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.5">↩ Phím Back / Return:</strong>
                      Đóng cửa sổ cài đặt hoặc thoát modal
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* TAB 3: KHUNG TỰ THIẾT KẾ (DESIGN STUDIO & CANVAS PLAYGROUND) */}
          {/* ------------------------------------------------------------ */}
          {activeTab === 'custom_design' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    Khung Tự Thiết Kế Giao Diện & Danh Tính
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tùy biến phong cách thẻ cá nhân, hiệu ứng ánh sáng, màu sắc avatar và huy hiệu riêng
                  </p>
                </div>
                <span className="text-xs text-purple-300 font-mono bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20 font-bold">
                  Design Studio
                </span>
              </div>

              {/* Giao diện 2 cột: Cột trái tùy chỉnh, Cột phải Khung Xem Trước Thời Gian Thực */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                
                {/* CỘT TRÁI (7 CỘT): CÁC CÔNG CỤ TÙY BIẾN */}
                <div className="lg:col-span-7 space-y-4">
                  
                  {/* 1. Chọn Theme Preset */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-purple-400" />
                      <span>Chủ đề phong cách (Theme Presets)</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      {THEME_PRESETS.map((p) => {
                        const isSelected = themeStyle === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setThemeStyle(p.id);
                              setAvatarColor(p.color);
                              setCustomHexColor(p.color);
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              isSelected
                                ? 'bg-slate-900 border-purple-400 ring-2 ring-purple-500/30 text-white font-bold shadow-md'
                                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: p.color }} />
                              <span className="text-xs truncate">{p.name}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Chọn Kiểu Khung Thẻ (Card Style) */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Kiểu Khung Thẻ (Card Style)</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'glow', label: 'Phát sáng Neon', desc: 'Viền sáng tỏa' },
                        { id: 'glass', label: 'Kính mờ Glass', desc: 'Hiệu ứng mờ ảo' },
                        { id: 'solid', label: 'Đen sâu OLED', desc: 'Độ tương phản cao' },
                        { id: 'minimal', label: 'Tối giản', desc: 'Gọn gàng sạch sẽ' },
                      ].map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setCardStyle(style.id as any)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            cardStyle === style.id
                              ? 'bg-purple-500/20 border-purple-500 text-purple-200 font-bold ring-1 ring-purple-500/40'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold">{style.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{style.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Màu sắc Avatar & Mã màu HEX */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-purple-400" />
                        <span>Bảng màu Avatar & Điểm nhấn</span>
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">
                        HEX: {customHexColor}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {AVATAR_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => {
                            setAvatarColor(col);
                            setCustomHexColor(col);
                          }}
                          className={`w-8 h-8 rounded-xl transition-all flex items-center justify-center ${
                            avatarColor === col ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: col }}
                        >
                          {avatarColor === col && <Check className="w-4 h-4 text-white stroke-[3]" />}
                        </button>
                      ))}

                      {/* Tùy chỉnh màu HEX tự do */}
                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                        <input
                          type="color"
                          value={customHexColor}
                          onChange={(e) => {
                            setCustomHexColor(e.target.value);
                            setAvatarColor(e.target.value);
                          }}
                          className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0"
                          title="Chọn màu tự do bất kỳ"
                        />
                        <span className="text-[11px] text-slate-400 font-mono">Tự do</span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Huy hiệu & Danh xưng cá nhân */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Huy hiệu hiển thị (Custom Badge)
                      </label>
                      <input
                        type="text"
                        maxLength={25}
                        value={customBadgeText}
                        onChange={(e) => setCustomBadgeText(e.target.value)}
                        placeholder="Ví dụ: VIP Relay, Chuyên Gia Tốc Độ..."
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Tiểu sử / Lời chào (Bio Status)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={customBio}
                        onChange={(e) => setCustomBio(e.target.value)}
                        placeholder="Ví dụ: Đang online, sẵn sàng nhận file..."
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (5 CỘT): KHUNG XEM TRƯỚC TRỰC TIẾP (LIVE PREVIEW CANVAS) */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-purple-400" />
                        Khung Xem Trước Trực Tiếp
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Live Canvas
                      </span>
                    </div>

                    {/* KHUNG THẺ THỰC TẾ (THE DESIGN CANVAS) */}
                    <div className="my-auto py-4">
                      <div 
                        className={`rounded-2xl p-5 border transition-all duration-300 relative overflow-hidden group hover:scale-[1.02] shadow-2xl ${
                          cardStyle === 'glow' ? `bg-gradient-to-br ${currentThemeObj.gradient} ${currentThemeObj.border} ${currentThemeObj.glow}` :
                          cardStyle === 'glass' ? 'bg-slate-900/60 backdrop-blur-xl border-slate-700/80 shadow-slate-900/50' :
                          cardStyle === 'solid' ? 'bg-black border-slate-800' :
                          'bg-slate-900 border-slate-800'
                        }`}
                      >
                        {/* Header của thẻ Canvas */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg relative shrink-0 ring-2 ring-white/20"
                              style={{ backgroundColor: avatarColor }}
                            >
                              {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
                              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                <span>{currentUser?.displayName || 'Người dùng'}</span>
                              </div>
                              <div className="text-xs text-slate-400 truncate font-mono">
                                {deviceName || 'Tên thiết bị'}
                              </div>
                            </div>
                          </div>

                          {/* Huy hiệu tùy chỉnh */}
                          <span 
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm truncate max-w-[130px]"
                            style={{ 
                              backgroundColor: `${avatarColor}20`,
                              borderColor: `${avatarColor}60`,
                              color: avatarColor 
                            }}
                          >
                            {customBadgeText || 'CloudSend'}
                          </span>
                        </div>

                        {/* Tiểu sử Status */}
                        <div className="mt-3.5 pt-3 border-t border-white/10 text-xs text-slate-300 italic">
                          "{customBio || 'Sẵn sàng truyền nhận dữ liệu tốc độ cao.'}"
                        </div>

                        {/* Thẻ phần cứng */}
                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded-xl border border-white/5">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            {renderCurrentDeviceIcon('w-3.5 h-3.5')}
                            {deviceInfo.label}
                          </span>
                          <span className="text-emerald-400 font-mono font-bold">Relay Ready</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 text-center italic">
                      * Nhấn "Lưu thay đổi" bên dưới để áp dụng toàn bộ giao diện đã thiết kế vào tài khoản của bạn.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* TAB 4: TÀI KHOẢN & NỘI QUY (VỚI 6 THANH TÍCH HỢP ĐẦY ĐỦ) */}
          {/* ------------------------------------------------------------ */}
          {activeTab === 'account_rules' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* PHẦN ĐẦU: TIÊU ĐỀ KHU VỰC TÀI KHOẢN */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Tài Khoản & Phiên Đăng Nhập (6 Chức Năng Quản Trị)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Quản lý danh tính, mật khẩu, liên kết email, danh sách thiết bị và đăng xuất từ xa
                  </p>
                </div>
                <span className="text-xs text-teal-300 font-mono bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/20 font-bold">
                  Account Center
                </span>
              </div>

              {/* ============================================================ */}
              {/* THANH 1: TÊN ĐĂNG NHẬP */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <span>1. Tên Đăng Nhập</span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {isLinkedEmail ? 'Tài khoản Email' : userProfile?.username ? 'Tài khoản CloudSend' : 'Phiên Tự Do'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tên tài khoản duy nhất của bạn dùng để đăng nhập vào hệ thống
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUsername}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-teal-500/50 text-slate-300 hover:text-white text-xs transition-colors"
                    title="Sao chép tên đăng nhập"
                  >
                    {copiedUsername ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                        <span className="text-emerald-400 font-bold">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-teal-400" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono">
                  <div className="text-xs sm:text-sm font-bold text-teal-300 truncate copyable-text select-text cursor-text" data-copyable="true">
                    {rawUsername || currentUser?.email || 'Chưa thiết lập'}
                  </div>
                  <div className="text-[11px] text-slate-500 shrink-0 copyable-text select-text cursor-text" data-copyable="true">
                    ID: {currentUser?.uid ? currentUser.uid.substring(0, 10) + '...' : 'Guest'}
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* THANH 2: MẬT KHẨU */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      2. Mật Khẩu & Bảo Mật
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Điều chỉnh mật khẩu tài khoản của bạn (tối thiểu 6 ký tự)
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleChangePasswordSubmit} className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Mật khẩu hiện tại */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Mật khẩu hiện tại
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Nhập mật khẩu cũ"
                          className="w-full pl-3.5 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Mật khẩu mới */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Mật khẩu mới
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mật khẩu mới (≥ 6 ký tự)"
                          className="w-full pl-3.5 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Xác nhận mật khẩu mới */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Xác nhận mật khẩu mới
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmNewPassword ? 'text' : 'password'}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Nhập lại mật khẩu mới"
                          className="w-full pl-3.5 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showConfirmNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword || !currentPassword || !newPassword}
                      className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {isUpdatingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      <span>Lưu Mật Khẩu Mới</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* ============================================================ */}
              {/* THANH 3: TÊN HIỂN THỊ & ĐỒNG BỘ THIẾT BỊ */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>3. Tên Hiển Thị & Định Danh Thiết Bị</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 text-emerald-400" />
                        Đồng bộ mạng
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Đồng bộ trực tiếp với tên thiết bị hiển thị với mọi người trong phòng trò chuyện và mạng nội bộ
                    </p>
                  </div>
                </div>

                {displayNameError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{displayNameError}</span>
                  </div>
                )}

                {displayNameSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{displayNameSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateDisplayNameSubmit} className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      maxLength={30}
                      value={editDisplayName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditDisplayName(val);
                        setDeviceName(val);
                      }}
                      placeholder="Nhập tên hiển thị / tên thiết bị mới của bạn"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingDisplayName || !editDisplayName.trim()}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 disabled:opacity-40 shrink-0 min-h-[40px]"
                  >
                    {isUpdatingDisplayName ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    <span>Lưu & Đồng Bộ Tên</span>
                  </button>
                </form>
              </div>

              {/* ============================================================ */}
              {/* THANH 4: LIÊN KẾT TÀI KHOẢN (EMAIL & BẢO MẬT OTP 6 CHỮ SỐ) */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                        <span>4. Liên Kết Tài Khoản (Bảo Mật OTP 6 Số)</span>
                        {isEmailFullyVerified ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-bold">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            Đã xác thực OTP 6 số
                          </span>
                        ) : isLinkedEmail ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                            Đã liên kết
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            Chưa liên kết
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Liên kết Email với mã xác nhận bảo mật 6 chữ số có hiệu lực 15 phút
                      </p>
                    </div>
                  </div>

                  {isEmailFullyVerified && !isEditingLinkedEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingLinkedEmail(true);
                        setIsOtpSent(false);
                        setEmailDispatchData(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-blue-400 hover:text-blue-300 text-xs font-semibold transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Đổi / Liên kết email khác</span>
                    </button>
                  )}
                </div>

                {/* Thông báo lỗi nếu có */}
                {linkEmailError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <span>{linkEmailError}</span>
                      {isOtpExpired && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={isSendingOtp}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className={`w-3 h-3 ${isSendingOtp ? 'animate-spin' : ''}`} />
                            <span>Gửi lại mã mới ngay</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Thông báo thành công nếu có */}
                {linkEmailSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{linkEmailSuccess}</span>
                  </div>
                )}

                {/* TRẠNG THÁI 1: ĐÃ LIÊN KẾT & XÁC THỰC THÀNH CÔNG (VÀ KHÔNG Ở CHẾ ĐỘ SỬA) */}
                {isEmailFullyVerified && !isEditingLinkedEmail ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400">Địa chỉ Email đã xác thực an toàn:</div>
                        <div className="text-sm font-bold text-white font-mono mt-0.5 flex items-center gap-2">
                          <span>{currentUser?.email || userProfile?.linkedEmail}</span>
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" />
                            Đã bảo mật
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 font-mono">
                          Xác thực: {userProfile?.emailVerifiedAt ? new Date(userProfile.emailVerifiedAt).toLocaleDateString('vi-VN') : 'Đang hoạt động'}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Tài khoản được bảo vệ bởi hệ thống xác thực OTP 6 số. Mọi quyền truy cập nhạy cảm đều được bảo vệ.</span>
                    </div>
                  </div>
                ) : (
                  /* TRẠNG THÁI 2: ĐANG NHẬP EMAIL & XÁC THỰC MÃ 6 SỐ */
                  <div className="space-y-4 pt-1">
                    {/* BƯỚC 1: NHẬP ĐỊA CHỈ EMAIL VÀ BẤM GỬI MÃ */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <div className="relative flex-1">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          value={linkEmailInput}
                          onChange={(e) => setLinkEmailInput(e.target.value)}
                          placeholder="Nhập địa chỉ email của bạn (ví dụ: yourname@gmail.com)"
                          disabled={isOtpSent && !isOtpExpired}
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-60"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp || !linkEmailInput.trim()}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 disabled:opacity-40 shrink-0 min-h-[40px]"
                      >
                        {isSendingOtp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang gửi mã...</span>
                          </>
                        ) : isOtpSent ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>{isOtpExpired ? 'Gửi lại mã mới' : 'Gửi lại mã'}</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Gửi mã xác nhận 6 số</span>
                          </>
                        )}
                      </button>

                      {isEditingLinkedEmail && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingLinkedEmail(false);
                            setIsOtpSent(false);
                            setEmailDispatchData(null);
                          }}
                          className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs transition-colors shrink-0"
                        >
                          Hủy
                        </button>
                      )}
                    </div>

                    {/* BƯỚC 2: KHI ĐÃ GỬI MÃ -> HIỂN THỊ ĐỒNG HỒ 15 PHÚT + VĂN BẢN EMAIL CÓ SẴN + Ô NHẬP 6 SỐ */}
                    {isOtpSent && (
                      <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                        
                        {/* 1. KHUNG ĐỒNG HỒ ĐẾM NGƯỢC 15 PHÚT */}
                        <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isOtpExpired 
                            ? 'bg-rose-950/40 border-rose-500/50 text-rose-300' 
                            : 'bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border-blue-500/40 text-blue-200'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <Clock className={`w-5 h-5 shrink-0 ${isOtpExpired ? 'text-rose-400' : 'text-blue-400'}`} />
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-2">
                                <span>{isOtpExpired ? 'Mã xác nhận đã hết hạn!' : 'Mã xác nhận đang có hiệu lực:'}</span>
                                <span className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-lg border ${
                                  isOtpExpired 
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse' 
                                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                }`}>
                                  {isOtpExpired ? '00:00 (Hết hạn)' : formatOtpCountdown(otpTimeLeftSeconds)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {isOtpExpired 
                                  ? 'Mã 6 số chỉ sống trong 15 phút. Bạn cần nhấn "Gửi lại mã mới" để tiếp tục.' 
                                  : 'Mỗi mã chỉ có thể sống trong 15 phút. Vui lòng nhập mã trước khi hết thời gian.'}
                              </div>
                            </div>
                          </div>

                          {isOtpExpired && (
                            <button
                              type="button"
                              onClick={handleSendOtp}
                              disabled={isSendingOtp}
                              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 shrink-0"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isSendingOtp ? 'animate-spin' : ''}`} />
                              <span>Gửi lại mã mới</span>
                            </button>
                          )}
                        </div>

                        {/* 2. THÔNG BÁO ĐÃ GỬI MÃ ĐẾN HÒM THƯ GMAIL */}
                        <div className="p-4 rounded-xl bg-slate-900 border border-blue-500/30 space-y-3.5 relative overflow-hidden">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Inbox className="w-4 h-4 text-emerald-400 animate-pulse" />
                              <span className="text-xs font-bold text-white">
                                Đã gửi mã đến: <span className="text-emerald-400 font-mono">[{emailDispatchData?.recipientEmail || linkEmailInput}]</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href="https://mail.google.com"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-all shadow-sm"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Mở Gmail</span>
                              </a>
                            </div>
                          </div>

                          {/* Hướng dẫn kiểm tra hộp thư & Thông tin cấu hình SMTP */}
                          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                            <div className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                              <Mail className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div className="space-y-1.5 w-full">
                                <p className="font-semibold text-white">
                                  Kiểm tra Gmail (Hộp thư đến hoặc Thư mục Rác/Spam):
                                </p>
                                <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                                  <li>Tìm thư từ <strong className="text-slate-200">CloudSend Security</strong> với tiêu đề <strong className="text-slate-200">[CloudSend] Mã xác nhận</strong>.</li>
                                  <li>Kiểm tra cả thư mục <strong className="text-amber-300">Spam (Thư rác)</strong> hoặc mục <strong className="text-amber-300">Quảng cáo (Promotions)</strong>.</li>
                                </ul>

                                {/* Nút xem nhanh mã khi thử nghiệm hoặc khi máy chủ chưa cấu hình tài khoản gửi SMTP */}
                                {emailDispatchData?.code && (
                                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                                    <span className="text-slate-400">
                                      Chưa nhận được thư? (Xem mã thử nghiệm trực tiếp):
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setOtpCodeInput(emailDispatchData.code)}
                                      className="font-mono text-emerald-400 hover:text-emerald-300 font-bold px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1 hover:bg-emerald-500/25 transition-colors"
                                    >
                                      <span>Mã test: {emailDispatchData.code}</span>
                                      <span className="text-[10px] underline font-sans font-normal">(Điền nhanh)</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3. Ô NHẬP MÃ 6 CHỮ SỐ VÀ NÚT XÁC THỰC HOÀN TẤT */}
                        <form onSubmit={handleVerifyOtpSubmit} className="p-4 rounded-xl bg-slate-900 border border-blue-500/30 space-y-3">
                          <label className="block text-xs font-bold text-white flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                              Nhập mã 6 chữ số từ Gmail để hoàn tất:
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {otpCodeInput.length}/6 ký tự
                            </span>
                          </label>

                          <div className="flex flex-col sm:flex-row items-center gap-2.5">
                            <div className="relative flex-1 w-full">
                              <input
                                type="text"
                                maxLength={6}
                                value={otpCodeInput}
                                onChange={(e) => setOtpCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Nhập 6 số xác nhận (VD: 839201)"
                                disabled={isOtpExpired || isVerifyingOtp}
                                className={`w-full px-4 py-2.5 bg-slate-950 border border-slate-700/90 rounded-xl text-center text-white placeholder-slate-500 placeholder:text-xs sm:placeholder:text-sm placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition-all ${
                                  otpCodeInput.length > 0 
                                    ? 'font-mono font-black text-base sm:text-lg tracking-[0.3em] text-emerald-300' 
                                    : 'text-xs sm:text-sm tracking-normal'
                                }`}
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={isVerifyingOtp || otpCodeInput.trim().length !== 6 || isOtpExpired}
                              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:via-indigo-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-40 shrink-0 min-h-[44px]"
                            >
                              {isVerifyingOtp ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang xác thực mã...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                                  <span>Xác Thực Mã & Liên Kết</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ============================================================ */}
              {/* THANH 5: CÁC THIẾT BỊ ĐÃ ĐĂNG NHẬP */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      <MonitorSmartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <span>5. Các Thiết Bị Đã Đăng Nhập</span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {sessions.length} phiên hoạt động
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Theo dõi thiết bị, địa điểm và thời gian đăng nhập tài khoản của bạn
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-xs transition-colors"
                    title="Làm mới danh sách thiết bị"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>

                {/* Danh sách thẻ thiết bị */}
                <div className="space-y-2.5 pt-1">
                  {sessions.map((sess) => (
                    <div 
                      key={sess.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        sess.isCurrent 
                          ? 'bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/40 shadow-sm'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0 mt-0.5">
                          {renderDeviceIconByType(sess.deviceType || 'laptop', 'w-5 h-5')}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {sess.deviceName || 'Thiết bị'}
                            </span>
                            {sess.isCurrent && (
                              <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Thiết bị này (Hiện tại)
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
                            <span className="flex items-center gap-1 font-medium text-slate-300">
                              <Cpu className="w-3 h-3 text-emerald-400" />
                              {sess.browser ? (sess.browser.includes('trên') ? sess.browser.split('trên')[1].trim() : sess.browser) : 'Thiết bị'}
                            </span>
                            <span className="flex items-center gap-1 text-slate-300">
                              <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                              {sess.location || 'Việt Nam'}
                            </span>
                            <span className="flex items-center gap-1 text-slate-400 font-mono">
                              <Clock className="w-3 h-3 text-teal-400 shrink-0" />
                              Đăng nhập: {formatSessionTime(sess.loginAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end shrink-0">
                        {sess.isCurrent ? (
                          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Đang hoạt động
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLogoutSession(sess.id)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>Đăng xuất thiết bị này</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {sessions.length === 0 && !isLoadingSessions && (
                    <div className="text-center py-4 text-xs text-slate-500 italic">
                      Chưa có dữ liệu phiên đăng nhập. Nhấn "Làm mới" để tải.
                    </div>
                  )}
                </div>
              </div>

              {/* ============================================================ */}
              {/* THANH 6: ĐĂNG XUẤT & ĐĂNG XUẤT TẤT CẢ CÁC THIẾT BỊ */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-rose-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg shadow-rose-950/20">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      6. Đăng Xuất & Quản Lý Phiên Từ Xa
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Đăng xuất thiết bị hiện tại hoặc đăng xuất trên toàn bộ các thiết bị đã từng đăng nhập
                    </p>
                  </div>
                </div>

                {/* Hộp xác nhận đăng xuất tất cả */}
                {showLogoutAllConfirm && (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/60 space-y-3 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-rose-200 leading-relaxed">
                        <strong>Xác nhận hành động an toàn:</strong> Toàn bộ các phiên làm việc trên các máy tính, điện thoại, tivi khác và cả thiết bị này sẽ bị đăng xuất ngay lập tức.
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowLogoutAllConfirm(false)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700"
                      >
                        Hủy bỏ
                      </button>
                      <button
                        type="button"
                        onClick={handleLogoutAllDevicesConfirm}
                        disabled={isLoggingOutAll}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition-all flex items-center gap-1.5"
                      >
                        {isLoggingOutAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        <span>Xác Nhận Đăng Xuất Tất Cả</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2 NÚT ĐẶT CẠNH NHAU THEO YÊU CẦU */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Nút 1: ĐĂNG XUẤT THIẾT BỊ HIỆN TẠI */}
                  <button
                    id="btn-single-logout"
                    type="button"
                    onClick={handleDirectLogout}
                    disabled={isLoggingOut}
                    className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 font-bold text-xs sm:text-sm transition-all shadow-md active:scale-[0.99] min-h-[46px]"
                  >
                    {isLoggingOut ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4 text-rose-400" />
                    )}
                    <span>Đăng Xuất Thiết Bị Này</span>
                  </button>

                  {/* Nút 2: ĐĂNG XUẤT TẤT CẢ CÁC THIẾT BỊ */}
                  <button
                    id="btn-logout-all-devices"
                    type="button"
                    onClick={() => setShowLogoutAllConfirm(true)}
                    disabled={isLoggingOutAll}
                    className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-rose-950/60 border border-rose-400/40 active:scale-[0.99] min-h-[46px]"
                  >
                    <Power className="w-4 h-4 text-white" />
                    <span>Đăng Xuất Tất Cả Các Thiết Bị</span>
                  </button>
                </div>
              </div>

              {/* ============================================================ */}
              {/* NỘI QUY & ĐIỀU KHOẢN SỬ DỤNG (GIỮ NGUYÊN) */}
              {/* ============================================================ */}
              {onOpenRules && (
                <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                        <Scale className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          Nội Quy & Điều Khoản Cộng Đồng CloudSend
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Danh sách quy định về an toàn mạng, cấm phát tán nội dung 18+, virus độc hại và khung chế tài xử lý vi phạm.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRules();
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 min-h-[40px]"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Xem Bảng Nội Quy</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SPECIAL DEV CONSOLE ACCESS (RESTRICTED TO DEVELOPER ONLY) */}
              {isDevUser(currentUser?.email) && (
                <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-900/20 border border-emerald-500/50 rounded-2xl p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        Quyền hạn DEV: Datastore & Quản trị Hệ thống
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Kho dữ liệu Firestore trực tiếp (users, rooms, messages, transfers, presence, sanctions) & Bảng kỷ luật.
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          if (onOpenDevPage) {
                            onOpenDevPage();
                          } else {
                            window.location.href = '/?page=datastore';
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all min-h-[40px]"
                      >
                        <Database className="w-4 h-4" />
                        <span>Mở Datastore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          window.open('/?page=datastore', '_blank');
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all flex items-center gap-1 min-h-[40px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER */}
        {/* ============================================================ */}
        <div className="px-6 py-4 border-t border-slate-800/90 bg-slate-950/70 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {savedSuccess && (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-4 h-4 stroke-[3]" /> Đã lưu cài đặt & thiết kế thành công!
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs sm:text-sm font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors min-h-[44px]"
            >
              Đóng
            </button>
            <button
              id="save-settings-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 disabled:opacity-50 min-h-[44px] border border-emerald-400/30 active:scale-[0.99]"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
