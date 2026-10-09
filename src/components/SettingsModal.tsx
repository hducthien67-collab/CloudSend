import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase/config';
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
  Inbox,
  Camera
} from 'lucide-react';
import { DeviceType, LoginSession } from '../types';
import { AVATAR_COLORS, getDeviceTypeInfo, generateDefaultDeviceName } from '../utils/device';
import { playReceiveSound } from '../utils/sound';
import { isDevUser } from '../utils/devModeration';
import { FullscreenDesignStudio } from './FullscreenDesignStudio';

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
    logoutAllDevices,
    syncGoogleProfilePhoto,
    linkWithGoogleAccount
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
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | undefined>(settings.customAvatarUrl);
  const [customDesignData, setCustomDesignData] = useState<string | undefined>(settings.customDesignData);
  const [isFullscreenStudioOpen, setIsFullscreenStudioOpen] = useState(false);
  const [devToastMessage, setDevToastMessage] = useState<string | null>(null);

  const avatarFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const showUnderDevelopmentToast = (msg = 'Tính năng đang phát triển. Studio Tự Thiết Kế sẽ sớm mở lại trong bản cập nhật tới!') => {
    setDevToastMessage(msg);
    setTimeout(() => {
      setDevToastMessage(null);
    }, 3800);
  };

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP...)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) {
        setCustomAvatarUrl(result);
        updateSettings({ customAvatarUrl: result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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
  const isGoogleUser = Boolean(
    auth.currentUser?.providerData?.some((p: any) => p.providerId === 'google.com') ||
    (currentUser?.email && !userProfile?.username && !currentUser.email.includes('@cloudsend.local') && !currentUser.email.startsWith('guest_')) ||
    Boolean(currentUser?.photoURL)
  );
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
      setCustomAvatarUrl(settings.customAvatarUrl);
      setCustomDesignData(settings.customDesignData);
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
      customAvatarUrl,
      customDesignData,
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

  // 4. Verify 6-Digit OTP Code & Link Email (Supports auto-verify on paste or 6 digits)
  const executeVerifyOtp = async (codeToVerify: string) => {
    const cleanEmail = linkEmailInput.trim().toLowerCase();
    const cleanCode = codeToVerify.trim();

    if (!cleanCode || cleanCode.length !== 6) {
      return;
    }

    setLinkEmailError(null);
    setLinkEmailSuccess(null);

    if (isOtpExpired || (otpExpiresTimestamp && Date.now() > otpExpiresTimestamp)) {
      setLinkEmailError('Mã xác nhận đã hết hạn (chỉ có hiệu lực trong 15 phút). Vui lòng nhấn "Gửi lại mã mới".');
      setIsOtpExpired(true);
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await verifyEmailCodeAndLink(cleanEmail, cleanCode);
      setLinkEmailSuccess(`Chúc mừng! Tài khoản đã xác thực thành công với Email [${cleanEmail}].`);
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

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeVerifyOtp(otpCodeInput);
  };

  const handleOtpInputChange = (rawVal: string) => {
    const cleaned = rawVal.replace(/[^0-9]/g, '').slice(0, 6);
    setOtpCodeInput(cleaned);
    if (cleaned.length === 6 && !isVerifyingOtp) {
      executeVerifyOtp(cleaned);
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const digits = pasted.replace(/[^0-9]/g, '').slice(0, 6);
    if (digits.length === 6) {
      e.preventDefault();
      setOtpCodeInput(digits);
      if (!isVerifyingOtp) {
        executeVerifyOtp(digits);
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 animate-in fade-in duration-150">
      {/* Background soft ambient light (Lightweight GPU radial glow) */}
      <div className="absolute w-[400px] h-[200px] bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Main Container: Compact, Modern, GPU-Accelerated */}
      <div 
        id="settings-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] relative z-10 gpu-smooth-card"
      >
        {/* ============================================================ */}
        {/* MODAL HEADER */}
        {/* ============================================================ */}
        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-800/90 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400 border border-emerald-500/30 shadow-inner shrink-0">
              <Sliders className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-bold tracking-tight text-white truncate">
                  Cài Đặt Hệ Thống & Tùy Biến
                </h2>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shrink-0">
                  v2.5
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 truncate hidden sm:block">
                Quản lý tài khoản, phiên đăng nhập, phần cứng và tùy biến
              </p>
            </div>
          </div>
          
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center min-h-[30px] min-w-[30px] active:scale-95 shrink-0"
            title="Đóng cửa sổ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* COMPACT TAB NAVIGATION BAR */}
        {/* ============================================================ */}
        <div className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-slate-950/60 border-b border-slate-800/80 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-max">
            {/* TAB 1: THIẾT BỊ & MẠNG */}
            <button
              type="button"
              onClick={() => setActiveTab('device')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95 ${
                activeTab === 'device'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Thiết Bị & Mạng</span>
            </button>

            {/* TAB 2: HIỂN THỊ & SMART TV */}
            <button
              type="button"
              onClick={() => setActiveTab('display_tv')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95 ${
                activeTab === 'display_tv'
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Hiển Thị & Smart TV</span>
            </button>

            {/* TAB 3: KHUNG TỰ THIẾT KẾ (DESIGN STUDIO & CANVAS) */}
            <button
              type="button"
              onClick={() => setActiveTab('custom_design')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95 relative ${
                activeTab === 'custom_design'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 font-bold ring-1 ring-purple-400/50'
                  : 'bg-slate-900 text-purple-300 hover:text-white hover:bg-slate-800 border border-purple-500/30'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Khung Thiết Kế</span>
            </button>

            {/* TAB 4: TÀI KHOẢN & PHIÊN ĐĂNG NHẬP */}
            <button
              type="button"
              onClick={() => setActiveTab('account_rules')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 active:scale-95 relative ${
                activeTab === 'account_rules'
                  ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/20 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Tài Khoản & Phiên</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL BODY (CONTENT BY TAB) */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-4 space-y-3 sm:space-y-4 smooth-modal-scroll">
          
          {/* ------------------------------------------------------------ */}
          {/* TAB 1: THIẾT BỊ & MẠNG */}
          {/* ------------------------------------------------------------ */}
          {activeTab === 'device' && (
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200">
              
              {/* 1. ĐỊNH DANH THIẾT BỊ */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[11px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
                    <Cpu className="w-3.5 h-3.5 shrink-0" />
                    <span>Định danh thiết bị</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleRandomizeDeviceName}
                    className="text-[10.5px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-colors shrink-0"
                    title="Tạo tên ngẫu nhiên vui nhộn"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>Tên ngẫu nhiên</span>
                  </button>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between mb-1 gap-1">
                    <label className="text-[11px] text-slate-300 font-medium min-w-0">
                      Tên thiết bị hiển thị trong mạng
                    </label>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 shrink-0">
                      <RefreshCw className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Đồng bộ mạng</span>
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
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Phần cứng tự động nhận diện */}
                <div>
                  <div className="flex flex-wrap items-center justify-between mb-1 gap-1">
                    <label className="text-[11px] text-slate-300 font-medium flex items-center gap-1 min-w-0">
                      <span>Loại phần cứng đã nhận diện</span>
                    </label>
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/25 shrink-0">
                      <Lock className="w-2.5 h-2.5" />
                      Khóa phần cứng
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                      {renderCurrentDeviceIcon('w-4 h-4')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {deviceInfo.label}
                        </span>
                        <span className="text-[9px] font-mono text-emerald-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800 shrink-0">
                          Auto-detected
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                        {deviceInfo.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. MÁY CHỦ TRUNG GIAN & TRẠNG THÁI RELAY */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5">
                <h3 className="text-[11px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  Máy chủ trung gian & Hạ tầng Relay
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Trạng thái kết nối</div>
                    <div className="text-[11px] font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Trực tuyến 24/7
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Hạ tầng Cloud</div>
                    <div className="text-[11px] font-semibold text-white mt-0.5">
                      Firestore Cloud Relay
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Giao thức bảo mật</div>
                    <div className="text-[11px] font-semibold text-slate-200 mt-0.5 font-mono">
                      TLS 1.3 End-to-End
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. TÙY CHỌN TỰ ĐỘNG NHẬN TỆP & ÂM THANH */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5">
                <h3 className="text-[11px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <DownloadCloud className="w-3.5 h-3.5" />
                  Tùy chọn nhận tệp & Âm thanh
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                    <div className="pr-2">
                      <div className="text-xs font-semibold text-white">Tự động nhận tệp (Quick Save)</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Tự động chấp nhận tệp từ bạn bè mà không cần duyệt</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoAccept}
                      onChange={(e) => setAutoAccept(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500 shrink-0 ml-2"
                    />
                  </label>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="pr-2">
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                        Âm thanh thông báo
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Chuông nhẹ khi gửi/nhận tệp & tin nhắn</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTestSound}
                        className="px-2 py-0.5 text-[11px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      >
                        Thử chuông
                      </button>
                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={(e) => setSoundEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500"
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
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200">
              
              {/* CHẾ ĐỘ SMART TV & PHÓNG TO DPI */}
              <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <h3 className="text-[11px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5 shrink-0" />
                    <span>Chế độ Smart TV & Sửa lỗi DPI Màn hình lớn</span>
                  </h3>
                  <span className="text-[9.5px] font-mono px-2 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold whitespace-nowrap shrink-0 w-fit">
                    10-Foot UI
                  </span>
                </div>

                {/* Nút gạt bật tắt TV Mode */}
                <label className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors gap-2.5">
                  <div className="pr-2 min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                      <span>Kích hoạt Chế độ Tivi (Smart TV Mode)</span>
                      {tvModeEnabled && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                          Đang bật
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 leading-snug">
                      Tối ưu giao diện cho màn hình Tivi (Samsung Tizen, LG WebOS, Android TV, Sony, TCL). Tự động nhận diện thiết bị là Smart TV.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tvModeEnabled}
                    onChange={(e) => setTvModeEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500 shrink-0 cursor-pointer"
                  />
                </label>

                {/* Bộ chọn Tỷ lệ phóng to DPI TV */}
                <div className="p-2.5 sm:p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Tỷ lệ phóng to DPI TV</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.2 rounded border border-amber-500/20 whitespace-nowrap shrink-0 w-fit">
                      {Math.round(tvDpiScale * 100)}%
                    </span>
                  </div>

                  <p className="text-[10.5px] text-slate-400 leading-snug">
                    Chọn mức phóng to phù hợp với kích thước TV của bạn:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-0.5">
                    {[
                      { scale: 1.0, label: '100%', note: 'Chuẩn PC' },
                      { scale: 1.25, label: '125%', note: 'TV 32-43"' },
                      { scale: 1.4, label: '140%', note: 'TV 49-55"' },
                      { scale: 1.6, label: '160%', note: 'TV 65-75"' },
                      { scale: 1.85, label: '185%', note: 'TV 4K' },
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
                          className={`p-2 rounded-lg text-center border transition-all ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold">{preset.label}</div>
                          <div className="text-[9px] text-slate-400 mt-0.2">{preset.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hướng dẫn phím Remote TV */}
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[10.5px] text-slate-300 space-y-1.5">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>🎮 Phím điều khiển Remote Tivi</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5 text-slate-400">
                    <div className="p-2 rounded-md bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.2">◀ / ▶ Trái - Phải:</strong>
                      Chuyển tab nhanh
                    </div>
                    <div className="p-2 rounded-md bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.2">🔘 OK / Enter:</strong>
                      Chọn và gửi tệp
                    </div>
                    <div className="p-2 rounded-md bg-slate-950 border border-slate-800/80">
                      <strong className="text-white block mb-0.2">↩ Back / Return:</strong>
                      Đóng cửa sổ
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
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200">
              
              {/* STUDIO LAUNCH BANNER - TẠM KHÓA ĐANG PHÁT TRIỂN */}
              <div 
                onClick={() => showUnderDevelopmentToast()}
                className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:border-amber-500/40 transition-all"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="p-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                      Studio Tự Thiết Kế Toàn Màn Hình
                    </h3>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 inline-flex items-center gap-1 shrink-0">
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                      <span>ĐANG PHÁT TRIỂN</span>
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 leading-snug">
                    Tính năng đang được hoàn thiện và sẽ sớm ra mắt trong bản cập nhật tới.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      showUnderDevelopmentToast();
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold shadow-sm border border-amber-500/30 transition-all active:scale-95"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Mở Studio (Đang phát triển)</span>
                  </button>
                </div>
              </div>

              {/* Giao diện 2 cột: Cột trái tùy chỉnh, Cột phải Khung Xem Trước Thời Gian Thực */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-3.5">
                
                {/* CỘT TRÁI (7 CỘT): CÁC CÔNG CỤ TÙY BIẾN */}
                <div className="lg:col-span-7 space-y-3">
                  
                  {/* 1. Chọn Theme Preset */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-purple-400" />
                        <span>Chủ đề phong cách (Theme Presets)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => showUnderDevelopmentToast()}
                        className="text-[10px] text-slate-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                        <span>Thư viện mẫu</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
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
                            className={`p-2 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-slate-900 border-purple-400 ring-1 ring-purple-500/30 text-white font-bold shadow-sm'
                                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: p.color }} />
                              <span className="text-[11px] truncate">{p.name}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Chọn Kiểu Khung Thẻ (Card Style) */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Kiểu Khung Thẻ (Card Style)</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { id: 'glow', label: 'Neon', desc: 'Viền sáng tỏa' },
                        { id: 'glass', label: 'Glass', desc: 'Hiệu ứng mờ' },
                        { id: 'solid', label: 'OLED', desc: 'Đen sâu' },
                        { id: 'minimal', label: 'Tối giản', desc: 'Gọn gàng' },
                      ].map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setCardStyle(style.id as any)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            cardStyle === style.id
                              ? 'bg-purple-500/20 border-purple-500 text-purple-200 font-bold ring-1 ring-purple-500/40'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{style.label}</div>
                          <div className="text-[9.5px] text-slate-400 mt-0.2">{style.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Màu sắc Avatar & Đổi ảnh đại diện */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-purple-400" />
                        <span>Màu sắc & Ảnh đại diện</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="file" 
                          ref={avatarFileInputRef} 
                          onChange={handleAvatarFileUpload} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        <button
                          type="button"
                          onClick={() => avatarFileInputRef.current?.click()}
                          className="text-[10.5px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Đổi / Tải ảnh</span>
                        </button>
                        {customAvatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomAvatarUrl(undefined);
                              updateSettings({ customAvatarUrl: undefined });
                            }}
                            className="text-[9.5px] text-rose-400 hover:text-rose-300 font-semibold px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer"
                            title="Xóa ảnh đại diện tùy chỉnh"
                          >
                            Xóa ảnh
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {AVATAR_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => {
                            setAvatarColor(col);
                            setCustomHexColor(col);
                          }}
                          className={`w-6 h-6 rounded-lg transition-all flex items-center justify-center ${
                            avatarColor === col ? 'ring-2 ring-white scale-110 shadow-sm' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: col }}
                        >
                          {avatarColor === col && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        </button>
                      ))}

                      {/* Tùy chỉnh màu HEX tự do */}
                      <div className="flex items-center gap-1 pl-1.5 border-l border-slate-800">
                        <input
                          type="color"
                          value={customHexColor}
                          onChange={(e) => {
                            setCustomHexColor(e.target.value);
                            setAvatarColor(e.target.value);
                          }}
                          className="w-6 h-6 rounded-lg cursor-pointer bg-transparent border-0"
                          title="Chọn màu tự do bất kỳ"
                        />
                        <span className="text-[10px] text-slate-400 font-mono">Tự do</span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Huy hiệu & Danh xưng cá nhân */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-200 mb-0.5">
                        Huy hiệu hiển thị (Custom Badge)
                      </label>
                      <input
                        type="text"
                        maxLength={25}
                        value={customBadgeText}
                        onChange={(e) => setCustomBadgeText(e.target.value)}
                        placeholder="Ví dụ: VIP Relay, Chuyên Gia Tốc Độ..."
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-200 mb-0.5">
                        Tiểu sử / Lời chào (Bio Status)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={customBio}
                        onChange={(e) => setCustomBio(e.target.value)}
                        placeholder="Ví dụ: Đang online, sẵn sàng nhận file..."
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (5 CỘT): KHUNG XEM TRƯỚC TRỰC TIẾP (LIVE PREVIEW CANVAS) */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 sm:p-3.5 flex-1 flex flex-col justify-between space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1.5 border-b border-slate-800/80 gap-1.5">
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Khung Xem Trước Trực Tiếp</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => showUnderDevelopmentToast()}
                        className="text-[9.5px] text-amber-300 font-mono flex items-center gap-1 bg-amber-500/15 px-2 py-0.2 rounded-full border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 transition-all whitespace-nowrap shrink-0 w-fit"
                      >
                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                        <span>Studio (Đang phát triển)</span>
                      </button>
                    </div>

                    {/* KHUNG THẺ THỰC TẾ (THE DESIGN CANVAS) */}
                    <div className="my-auto py-2">
                      <div 
                        className={`rounded-xl p-3 sm:p-3.5 border transition-all duration-300 relative overflow-hidden group shadow-lg ${
                          cardStyle === 'glow' ? `bg-gradient-to-br ${currentThemeObj.gradient} ${currentThemeObj.border} ${currentThemeObj.glow}` :
                          cardStyle === 'glass' ? 'bg-slate-900/60 backdrop-blur-xl border-slate-700/80 shadow-slate-900/50' :
                          cardStyle === 'solid' ? 'bg-black border-slate-800' :
                          'bg-slate-900 border-slate-800'
                        }`}
                      >
                        {/* Header của thẻ Canvas */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div 
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md relative shrink-0 ring-1 ring-white/20 overflow-hidden"
                              style={{ backgroundColor: avatarColor }}
                            >
                              {(customAvatarUrl || currentUser?.photoURL) ? (
                                <img 
                                  src={customAvatarUrl || currentUser?.photoURL || ''} 
                                  alt="Avatar" 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                />
                              ) : (
                                (currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-slate-950" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                                <span className="truncate">{currentUser?.displayName || 'Người dùng'}</span>
                              </div>
                              <div className="text-[10.5px] text-slate-400 truncate font-mono">
                                {deviceName || 'Tên thiết bị'}
                              </div>
                            </div>
                          </div>

                          {/* Huy hiệu tùy chỉnh */}
                          <span 
                            className="text-[9.5px] font-bold px-2 py-0.2 rounded-full border shadow-sm shrink-0 whitespace-nowrap"
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
                        <div className="mt-2.5 pt-2 border-t border-white/10 text-[11px] text-slate-300 italic truncate">
                          "{customBio || 'Sẵn sàng truyền nhận dữ liệu tốc độ cao.'}"
                        </div>

                        {/* Thẻ phần cứng */}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 bg-slate-950/50 p-1.5 rounded-lg border border-white/5 gap-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-300 font-medium truncate">
                            {renderCurrentDeviceIcon('w-3 h-3 shrink-0')}
                            <span className="truncate">{deviceInfo.label}</span>
                          </span>
                          <span className="text-emerald-400 font-mono font-bold whitespace-nowrap shrink-0">Relay Ready</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 text-center italic">
                      * Tùy biến thời gian thực hiển thị ngay trên mạng
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
            <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200">
              
              {/* PHẦN ĐẦU: TIÊU ĐỀ KHU VỰC TÀI KHOẢN */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Tài Khoản & Phiên Đăng Nhập
                  </h3>
                  <p className="text-[10.5px] text-slate-400 mt-0.2">
                    Quản lý danh tính, bảo mật và đăng xuất từ xa
                  </p>
                </div>
                <span className="text-[10px] text-teal-300 font-mono bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 font-bold">
                  Account Center
                </span>
              </div>

              {/* ============================================================ */}
              {/* THANH 1: TÊN ĐĂNG NHẬP */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 border border-teal-500/30 shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-bold text-white">
                          1. Tên Đăng Nhập
                        </h4>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                          {isGoogleUser ? 'Gmail' : isLinkedEmail ? 'Email' : userProfile?.username ? 'CloudSend' : 'Tự Do'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.2 truncate">
                        {isGoogleUser 
                          ? 'Địa chỉ Gmail dùng để đăng nhập' 
                          : 'Tên tài khoản duy nhất của bạn'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUsername}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-teal-500/50 text-slate-300 hover:text-white text-[10.5px] transition-colors cursor-pointer shrink-0"
                    title="Sao chép tên đăng nhập"
                  >
                    {copiedUsername ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                        <span className="text-emerald-400 font-bold">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-teal-400" />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono">
                  <div className="text-xs font-bold text-teal-300 truncate copyable-text select-text cursor-text" data-copyable="true">
                    {currentUser?.email || rawUsername || 'Chưa thiết lập'}
                  </div>
                  <div className="text-[10px] text-slate-500 shrink-0 copyable-text select-text cursor-text" data-copyable="true">
                    ID: {currentUser?.uid ? currentUser.uid.substring(0, 8) + '...' : 'Google'}
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* THANH 2 (DÀNH CHO GOOGLE USER): TÊN HIỂN THỊ & ĐỊNH DANH THIẾT BỊ */}
              {/* ============================================================ */}
              {isGoogleUser ? (
                <>
                  <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>2. Tên Hiển Thị & Định Danh Thiết Bị</span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            Cho phép sửa
                          </span>
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.2">
                          Tên hiển thị với mọi người trong phòng trò chuyện và danh sách thiết bị.
                        </p>
                      </div>
                    </div>

                    {displayNameError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{displayNameError}</span>
                      </div>
                    )}

                    {displayNameSuccess && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{displayNameSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleUpdateDisplayNameSubmit} className="flex flex-col sm:flex-row items-center gap-2 pt-0.5">
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
                          placeholder="Nhập tên hiển thị / tên thiết bị của bạn"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUpdatingDisplayName || !editDisplayName.trim()}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 shrink-0 cursor-pointer"
                      >
                        {isUpdatingDisplayName ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                        <span>Lưu Tên</span>
                      </button>
                    </form>
                  </div>

                  {/* THÔNG TIN XÁC THỰC GOOGLE CHÍNH CHỦ */}
                  <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm relative overflow-hidden">
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-white">
                            3. Trạng Thái Xác Thực Google
                          </h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-0.5 font-bold shrink-0">
                            <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3]" />
                            Bảo mật Google
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.2 leading-snug">
                          Tài khoản được bảo vệ trực tiếp bởi Google OAuth.
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-500/20 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {currentUser?.photoURL ? (
                            <img 
                              src={currentUser.photoURL} 
                              alt="Avatar Google" 
                              className="w-7 h-7 rounded-full border border-emerald-500/30 object-cover shrink-0 shadow-sm" 
                            />
                          ) : (
                            <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-slate-400">Tài khoản Google đã đăng nhập:</div>
                            <div className="text-xs font-bold text-white font-mono mt-0.2 flex items-center gap-1.5 flex-wrap">
                              <span className="truncate max-w-[190px] sm:max-w-xs">{currentUser?.email}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                Đã bảo mật
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[10px] text-slate-400 font-mono">
                            Trạng thái: <strong className="text-emerald-400">Hoạt động</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* DÀNH CHO TÀI KHOẢN EMAIL/PASSWORD THƯỜNG */
                <>
                  {/* THANH 2: MẬT KHẨU */}
                  <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <KeyRound className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">
                          2. Mật Khẩu & Bảo Mật
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.2">
                          Điều chỉnh mật khẩu tài khoản (tối thiểu 6 ký tự)
                        </p>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{passwordError}</span>
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{passwordSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleChangePasswordSubmit} className="space-y-2 pt-0.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10.5px] font-medium text-slate-300 mb-0.5">
                            Mật khẩu cũ
                          </label>
                          <div className="relative">
                            <input
                              type={showCurrentPassword ? 'text' : 'password'}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="Nhập mật khẩu cũ"
                              className="w-full pl-2.5 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            >
                              {showCurrentPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10.5px] font-medium text-slate-300 mb-0.5">
                            Mật khẩu mới
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="≥ 6 ký tự"
                              className="w-full pl-2.5 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            >
                              {showNewPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10.5px] font-medium text-slate-300 mb-0.5">
                            Xác nhận mật khẩu
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmNewPassword ? 'text' : 'password'}
                              value={confirmNewPassword}
                              onChange={(e) => setConfirmNewPassword(e.target.value)}
                              placeholder="Nhập lại"
                              className="w-full pl-2.5 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                            >
                              {showConfirmNewPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-0.5">
                        <button
                          type="submit"
                          disabled={isUpdatingPassword || !currentPassword || !newPassword}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-40"
                        >
                          {isUpdatingPassword ? <RefreshCw className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                          <span>Lưu Mật Khẩu</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* THANH 3: TÊN HIỂN THỊ */}
                  <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>3. Tên Hiển Thị & Đồng Bộ Thiết Bị</span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                            <RefreshCw className="w-2.5 h-2.5 text-emerald-400" />
                            Đồng bộ
                          </span>
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.2">
                          Đồng bộ trực tiếp với tên thiết bị hiển thị với mọi người trong phòng trò chuyện.
                        </p>
                      </div>
                    </div>

                    {displayNameError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{displayNameError}</span>
                      </div>
                    )}

                    {displayNameSuccess && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{displayNameSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleUpdateDisplayNameSubmit} className="flex flex-col sm:flex-row items-center gap-2 pt-0.5">
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
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isUpdatingDisplayName || !editDisplayName.trim()}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 shrink-0"
                      >
                        {isUpdatingDisplayName ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                        <span>Lưu Tên</span>
                      </button>
                    </form>
                  </div>
                </>
              )}

              {/* ============================================================ */}
              {/* THANH 4 (CHỈ HIỂN THỊ KHI KHÔNG PHẢI GOOGLE): XÁC MINH EMAIL */}
              {/* ============================================================ */}
              {!isGoogleUser && (
                <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-3 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>4. Xác Minh & Liên Kết Email</span>
                          {isEmailFullyVerified ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5 font-bold">
                              <span>Đã xác thực</span>
                            </span>
                          ) : isLinkedEmail ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                              <span>Đã liên kết</span>
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                              Chưa xác minh
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.2">
                          Xác minh Email với mã bảo mật 6 số có hiệu lực 15 phút
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
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition-colors flex items-center gap-1 self-start sm:self-auto"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Đổi email</span>
                      </button>
                    )}
                  </div>

                  {/* Thông báo lỗi nếu có */}
                  {linkEmailError && (
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-1.5 animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-snug">
                        <span>{linkEmailError}</span>
                        {isOtpExpired && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={handleSendOtp}
                              disabled={isSendingOtp}
                              className="px-2.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${isSendingOtp ? 'animate-spin' : ''}`} />
                              <span>Gửi lại mã</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Thông báo thành công nếu có */}
                  {linkEmailSuccess && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{linkEmailSuccess}</span>
                    </div>
                  )}

                  {/* TRẠNG THÁI 1: ĐÃ LIÊN KẾT & XÁC THỰC THÀNH CÔNG */}
                  {isEmailFullyVerified && !isEditingLinkedEmail ? (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-500/30 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                            <Link2 className="w-3.5 h-3.5 -rotate-45" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-slate-400">Email đã xác thực an toàn:</div>
                            <div className="text-xs font-bold text-white font-mono mt-0.2 flex items-center gap-1.5 flex-wrap">
                              <span className="truncate max-w-[190px] sm:max-w-xs">{currentUser?.email || userProfile?.linkedEmail}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                Đã bảo mật
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[10px] text-slate-400 font-mono">
                            Xác thực: {userProfile?.emailVerifiedAt ? new Date(userProfile.emailVerifiedAt).toLocaleDateString('vi-VN') : 'Hoạt động'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* TRẠNG THÁI 2: ĐANG NHẬP EMAIL & XÁC THỰC MÃ 6 SỐ */
                    <div className="space-y-2.5 pt-0.5">
                      {/* BƯỚC 1: NHẬP ĐỊA CHỈ EMAIL */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1">
                          <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={linkEmailInput}
                            onChange={(e) => setLinkEmailInput(e.target.value)}
                            placeholder="Nhập email của bạn"
                            disabled={isOtpSent && !isOtpExpired}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-60"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSendingOtp || !linkEmailInput.trim()}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 shrink-0"
                        >
                          {isSendingOtp ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Đang gửi...</span>
                            </>
                          ) : isOtpSent ? (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              <span>{isOtpExpired ? 'Gửi lại' : 'Gửi lại'}</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Gửi mã 6 số</span>
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
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs transition-colors shrink-0"
                          >
                            Hủy
                          </button>
                        )}
                      </div>

                      {/* BƯỚC 2: Ô NHẬP 6 SỐ */}
                      {isOtpSent && (
                        <div className="space-y-2 pt-0.5 animate-in fade-in duration-200">
                          <form onSubmit={handleVerifyOtpSubmit} className="p-2.5 rounded-lg bg-slate-900 border border-blue-500/30 space-y-2">
                            <label className="block text-xs font-bold text-white flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <KeyRound className="w-3 h-3 text-blue-400" />
                                Nhập mã 6 chữ số từ Gmail:
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400">
                                {formatOtpCountdown(otpTimeLeftSeconds)}
                              </span>
                            </label>

                            <div className="flex flex-col sm:flex-row items-center gap-2">
                              <div className="relative flex-1 w-full">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={6}
                                  value={otpCodeInput}
                                  onChange={(e) => handleOtpInputChange(e.target.value)}
                                  onPaste={handleOtpPaste}
                                  placeholder="6 số (VD: 839201)"
                                  disabled={isOtpExpired || isVerifyingOtp}
                                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/90 rounded-lg text-center text-white placeholder-slate-500 text-xs font-mono font-bold tracking-widest focus:outline-none focus:border-blue-500"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={isVerifyingOtp || otpCodeInput.trim().length !== 6 || isOtpExpired}
                                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 shrink-0"
                              >
                                {isVerifyingOtp ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Đang xác thực...</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                                    <span>Xác Thực & Lưu</span>
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
              )}

              {/* ============================================================ */}
              {/* THANH 5: CÁC THIẾT BỊ ĐÃ ĐĂNG NHẬP */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 shrink-0">
                      <MonitorSmartphone className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-bold text-white">
                          {isGoogleUser ? '3. Thiết Bị Đã Đăng Nhập' : '5. Thiết Bị Đã Đăng Nhập'}
                        </h4>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0 font-bold">
                          {sessions.length} phiên
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.2 truncate">
                        Theo dõi thiết bị và thời gian đăng nhập
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white text-[10.5px] transition-colors shrink-0"
                    title="Làm mới"
                  >
                    <RefreshCw className={`w-3 h-3 text-purple-400 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>

                {/* Danh sách thẻ thiết bị */}
                <div className="space-y-1.5 pt-0.5">
                  {sessions.map((sess) => (
                    <div 
                      key={sess.id}
                      className={`p-2.5 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        sess.isCurrent 
                          ? 'bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/40 shadow-sm'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="p-1.5 rounded-md bg-slate-950 border border-slate-800 shrink-0 mt-0.5">
                          {renderDeviceIconByType(sess.deviceType || 'laptop', 'w-4 h-4')}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {sess.deviceName || 'Thiết bị'}
                            </span>
                            {sess.isCurrent && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Hiện tại
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-y-0.5 gap-x-2">
                            <span className="flex items-center gap-0.5 text-slate-300">
                              <Cpu className="w-2.5 h-2.5 text-emerald-400" />
                              {sess.browser ? (sess.browser.includes('trên') ? sess.browser.split('trên')[1].trim() : sess.browser) : 'Thiết bị'}
                            </span>
                            <span className="flex items-center gap-0.5 text-slate-300">
                              <MapPin className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                              {sess.location || 'Việt Nam'}
                            </span>
                            <span className="flex items-center gap-0.5 text-slate-400 font-mono">
                              <Clock className="w-2.5 h-2.5 text-teal-400 shrink-0" />
                              {formatSessionTime(sess.loginAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end shrink-0">
                        {sess.isCurrent ? (
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Online
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLogoutSession(sess.id)}
                            className="px-2 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10.5px] font-semibold transition-colors flex items-center gap-1"
                          >
                            <Power className="w-3 h-3" />
                            <span>Đăng xuất</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {sessions.length === 0 && !isLoadingSessions && (
                    <div className="text-center py-2 text-xs text-slate-500 italic">
                      Chưa có dữ liệu phiên. Nhấn "Làm mới" để tải.
                    </div>
                  )}
                </div>
              </div>

              {/* ============================================================ */}
              {/* THANH 6: ĐĂNG XUẤT */}
              {/* ============================================================ */}
              <div className="bg-slate-950/70 border border-rose-500/30 rounded-xl p-3 sm:p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <LogOut className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isGoogleUser ? '4. Đăng Xuất & Quản Lý Phiên' : '6. Đăng Xuất & Quản Lý Phiên'}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.2">
                      Đăng xuất thiết bị hiện tại hoặc tất cả các thiết bị
                    </p>
                  </div>
                </div>

                {/* Hộp xác nhận đăng xuất tất cả */}
                {showLogoutAllConfirm && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/60 space-y-2 animate-in fade-in">
                    <div className="flex items-start gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-rose-200 leading-snug">
                        <strong>Xác nhận:</strong> Toàn bộ các phiên làm việc trên các máy tính, điện thoại, tivi khác sẽ bị đăng xuất ngay lập tức.
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowLogoutAllConfirm(false)}
                        className="px-2.5 py-1 rounded text-[11px] font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleLogoutAllDevicesConfirm}
                        disabled={isLoggingOutAll}
                        className="px-3 py-1 rounded text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-sm transition-all flex items-center gap-1"
                      >
                        {isLoggingOutAll ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                        <span>Đăng Xuất Tất Cả</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2 NÚT ĐẶT CẠNH NHAU */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  <button
                    id="btn-single-logout"
                    type="button"
                    onClick={handleDirectLogout}
                    disabled={isLoggingOut}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 font-bold text-xs transition-all shadow-sm active:scale-[0.99]"
                  >
                    {isLoggingOut ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Đăng Xuất Thiết Bị Này</span>
                  </button>

                  <button
                    id="btn-logout-all-devices"
                    type="button"
                    onClick={() => setShowLogoutAllConfirm(true)}
                    disabled={isLoggingOutAll}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs transition-all shadow-sm border border-rose-400/40 active:scale-[0.99]"
                  >
                    <Power className="w-3.5 h-3.5 text-white" />
                    <span>Đăng Xuất Tất Cả</span>
                  </button>
                </div>
              </div>

              {/* ============================================================ */}
              {/* NỘI QUY & ĐIỀU KHOẢN */}
              {/* ============================================================ */}
              {onOpenRules && (
                <div className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                        <Scale className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          Nội Quy & Điều Khoản CloudSend
                        </div>
                        <div className="text-[10.5px] text-slate-400 leading-snug">
                          Quy định an toàn mạng, cấm phát tán nội dung xấu độc và chế tài xử lý.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRules();
                      }}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1 transition-all shrink-0 cursor-pointer"
                    >
                      <Scale className="w-3 h-3" />
                      <span>Xem Nội Quy</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SPECIAL DEV CONSOLE ACCESS (RESTRICTED TO DEVELOPER ONLY - CHỈ CHO PHÉP TRÊN MÁY TÍNH) */}
              {isDevUser(currentUser?.email) && (
                <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-900/20 border border-emerald-500/50 rounded-xl p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-emerald-400" />
                        Quyền hạn DEV: Datastore
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        Quản trị cơ sở dữ liệu Firestore trực tiếp (Chỉ hỗ trợ trên Máy tính / Laptop).
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const isMobileDevice = typeof window !== 'undefined' && (window.innerWidth <= 840 || /mobile|iphone|ipod|android/i.test(navigator.userAgent));
                          if (isMobileDevice) {
                            alert('Tính năng DEV DataStore chỉ hoạt động trên Máy Tính (Desktop) màn hình rộng để tránh lỗi hiển thị và thao tác bảng dữ liệu.');
                            return;
                          }
                          onClose();
                          if (onOpenDevPage) {
                            onOpenDevPage();
                          } else {
                            window.location.href = '/?page=datastore';
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1 transition-all"
                      >
                        <Database className="w-3 h-3" />
                        <span>Mở Datastore (Chỉ PC)</span>
                      </button>
                    </div>
                  </div>
                  <div className="text-[9.5px] text-amber-400/80 italic flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>Không hỗ trợ trên điện thoại do giao diện bảng dữ liệu Firestore chỉ dành cho máy tính.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER */}
        {/* ============================================================ */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-t border-slate-800/90 bg-slate-950/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-400 min-h-[16px] flex items-center">
            {savedSuccess && (
              <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px] animate-in fade-in">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Đã lưu cài đặt thành công!
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer text-center"
            >
              Đóng
            </button>
            <button
              id="save-settings-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 sm:flex-initial px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 border border-emerald-400/30 active:scale-[0.99] cursor-pointer"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </div>

      {/* THÔNG BÁO TÍNH NĂNG ĐANG PHÁT TRIỂN (TOAST Ở PHÍA DƯỚI) */}
      {devToastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] animate-in fade-in slide-in-from-bottom-5 duration-300 px-4 w-full max-w-md pointer-events-auto">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/95 border border-amber-500/50 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 text-amber-200 text-xs sm:text-sm font-semibold ring-2 ring-amber-500/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="leading-snug truncate">
                {devToastMessage}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDevToastMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* FULLSCREEN DESIGN STUDIO CANVAS OVERLAY (TẠM KHÓA) */}
      <FullscreenDesignStudio
        isOpen={isFullscreenStudioOpen}
        onClose={() => setIsFullscreenStudioOpen(false)}
        currentUser={currentUser}
        userProfile={userProfile}
        settings={settings}
        onSaveDesign={async (updated) => {
          await updateSettings(updated);
          if (updated.customAvatarUrl !== undefined) setCustomAvatarUrl(updated.customAvatarUrl);
          if (updated.customDesignData !== undefined) setCustomDesignData(updated.customDesignData);
          if (updated.themeStyle) setThemeStyle(updated.themeStyle);
          if (updated.avatarColor) setAvatarColor(updated.avatarColor);
          if (updated.customBadgeText) setCustomBadgeText(updated.customBadgeText);
          if (updated.customBio) setCustomBio(updated.customBio);
          if (updated.cardStyle) setCardStyle(updated.cardStyle);
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2500);
        }}
      />
    </div>
  );
};
