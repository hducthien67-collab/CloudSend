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
  Scale
} from 'lucide-react';
import { DeviceType } from '../types';
import { AVATAR_COLORS, getDeviceTypeInfo } from '../utils/device';
import { playReceiveSound } from '../utils/sound';
import { isDevUser } from '../utils/devModeration';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRules?: () => void;
  onOpenDevConsole?: () => void;
  onOpenDevPage?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onOpenRules, 
  onOpenDevConsole,
  onOpenDevPage 
}) => {
  const { currentUser, userProfile, settings, updateSettings, logout } = useAuth();
  
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [avatarColor, setAvatarColor] = useState(settings.avatarColor);
  const [autoAccept, setAutoAccept] = useState(settings.autoAccept);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [tvModeEnabled, setTvModeEnabled] = useState(settings.tvModeEnabled ?? (settings.deviceType === 'tv'));
  const [tvDpiScale, setTvDpiScale] = useState(settings.tvDpiScale || 1.4);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Synchronize internal form fields whenever the modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setDeviceName(settings.deviceName);
      setAvatarColor(settings.avatarColor);
      setAutoAccept(settings.autoAccept);
      setSoundEnabled(settings.soundEnabled);
      setTvModeEnabled(settings.tvModeEnabled ?? (settings.deviceType === 'tv'));
      setTvDpiScale(settings.tvDpiScale || 1.4);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await updateSettings({
      deviceName: deviceName.trim() || settings.deviceName,
      avatarColor,
      autoAccept,
      soundEnabled,
      tvModeEnabled,
      tvDpiScale,
    });
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestSound = () => {
    playReceiveSound();
  };

  const deviceInfo = getDeviceTypeInfo(settings.deviceType);

  const renderCurrentDeviceIcon = () => {
    switch (settings.deviceType) {
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case 'tablet':
        return <Tablet className="w-5 h-5 text-emerald-400" />;
      case 'desktop':
        return <Monitor className="w-5 h-5 text-emerald-400" />;
      case 'tv':
        return <Tv className="w-5 h-5 text-emerald-400" />;
      case 'laptop':
      default:
        return <Laptop className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="settings-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]"
      >
        {/* Mobile Swipe Handle Indicator */}
        <div className="sm:hidden w-full pt-2.5 pb-1 flex items-center justify-center bg-slate-950/40">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Cài đặt thiết bị & Mạng</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">Tùy chỉnh danh tính thiết bị và kết nối</p>
            </div>
          </div>
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Đóng cài đặt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Section 1: Device Identity */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Định danh thiết bị (LocalSend Alias)
            </h3>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5 font-medium">
                Tên thiết bị hiển thị với người khác
              </label>
              <input
                id="setting-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Tên thiết bị..."
                className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            {/* Auto-detected Hardware Device (Locked, No manual override) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <span>Loại thiết bị phần cứng</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <Lock className="w-2.5 h-2.5" />
                  Tự động nhận diện (Đã khóa)
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  {renderCurrentDeviceIcon()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {deviceInfo.label}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      Auto-detected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {deviceInfo.description}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 italic">
                * Hệ thống tự động xác định chính xác thiết bị của bạn để hiển thị đúng Icon trên toàn mạng và không cho phép chọn sang thiết bị khác.
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5 font-medium flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                Màu nhận diện thiết bị
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                {AVATAR_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setAvatarColor(col)}
                    className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center min-w-[32px] min-h-[32px] ${
                      avatarColor === col ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  >
                    {avatarColor === col && <Check className="w-4 h-4 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Transfer & Sound Options */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <DownloadCloud className="w-3.5 h-3.5" />
              Tùy chọn nhận tệp & Âm thanh
            </h3>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700 cursor-pointer">
                <div>
                  <div className="text-xs sm:text-sm font-medium text-white">Tự động nhận tệp (Quick Save)</div>
                  <div className="text-[11px] sm:text-xs text-slate-400">Tự động chấp nhận tệp từ bạn bè mà không cần xác nhận thủ công</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900 ml-3"
                />
              </label>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/80">
                <div className="flex-1 mr-3">
                  <div className="text-xs sm:text-sm font-medium text-white flex items-center gap-2">
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                    Âm thanh thông báo
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-400">Phát âm thanh chuông nhẹ khi gửi/nhận tệp hoặc có tin nhắn mới</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestSound}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Thử chuông
                  </button>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="w-5 h-5 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Smart TV & TV DPI Scaling Fix */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5" />
                Chế độ Smart TV & Sửa lỗi DPI Màn hình lớn
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                10-Foot UI
              </span>
            </div>

            <div className="space-y-3">
              {/* TV Mode Switch */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                <div className="pr-3">
                  <div className="text-xs sm:text-sm font-semibold text-white flex items-center gap-2">
                    <span>Kích hoạt Chế độ Tivi (Smart TV Mode)</span>
                    {tvModeEnabled && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Đang bật
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                    Tối ưu giao diện cho màn hình Tivi (Samsung Tizen, LG WebOS, Android TV). Tự động nhận diện thiết bị là Smart TV trên mạng và hỗ trợ điều khiển Remote D-Pad.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tvModeEnabled}
                  onChange={(e) => setTvModeEnabled(e.target.checked)}
                  className="w-5 h-5 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 focus:ring-offset-slate-900 shrink-0"
                />
              </label>

              {/* TV DPI Zoom Selector */}
              <div className={`p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5 transition-all ${
                !tvModeEnabled ? 'opacity-60' : ''
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Tỷ lệ phóng to DPI TV (Khắc phục lỗi chữ nhỏ trên TV)
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {Math.round(tvDpiScale * 100)}%
                  </span>
                </div>
                
                <p className="text-[11px] text-slate-400">
                  Trình duyệt TV thường bị lỗi DPI khiến chữ và nút bấm quá nhỏ khi nhìn từ xa. Hãy chọn mức phóng to phù hợp với kích thước TV của bạn:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
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
                        className={`p-2 rounded-xl text-center border transition-all ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{preset.label}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{preset.note}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TV Remote Navigation Tip */}
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>🎮 Hỗ trợ phím Điều khiển Tivi (Remote Control)</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                  <li><strong>Mũi tên Trái / Phải:</strong> Chuyển nhanh giữa tab Gửi, Nhận và Phòng Chat.</li>
                  <li><strong>Phím OK / Enter:</strong> Chọn nút và gửi/tải tệp.</li>
                  <li><strong>Phím Back / Return:</strong> Thoát menu cài đặt hoặc đóng cửa sổ.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 3: Intermediate Server Info */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Máy chủ trung gian (Relay Server)
            </h3>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Trạng thái kết nối:</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Đang hoạt động (Trực tuyến 24/7)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Hạ tầng đám mây:</span>
                <span className="text-slate-300 font-mono">Firebase Firestore Cloud Relay</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Giao thức truyền tải:</span>
                <span className="text-slate-300 font-mono">TLS 1.3 / End-to-End WebSocket Stream</span>
              </div>
            </div>
          </div>

          {/* Section 4: Current Account Info */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Tài khoản & Phiên đăng nhập
            </h3>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
                  style={{ backgroundColor: avatarColor }}
                >
                  {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {currentUser?.displayName || 'Người dùng'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {currentUser?.email || 'Khách trực tuyến'}
                  </div>
                </div>
              </div>

              <button
                id="logout-btn"
                type="button"
                onClick={async () => {
                  onClose();
                  await logout();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất
              </button>
            </div>

            {/* Community Rules & Legal Terms Card */}
            {onOpenRules && (
              <div className="mt-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      Nội Quy & Điều Khoản Sử Dụng CloudSend
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Danh sách các điều cấm (từ ngữ thô tục, 18+, virus, lừa đảo) và khung chế tài xử lý vi phạm.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRules();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shrink-0"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Xem Bảng Nội Quy</span>
                </button>
              </div>
            )}

            {/* Special DEV Console Access (Restricted to Developer only) */}
            {isDevUser(currentUser?.email) && (
              <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-900/20 border border-emerald-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Quyền hạn DEV: Datastore & Quản trị Hệ thống
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Kho dữ liệu Firestore trực tiếp (users, rooms, messages, transfers, presence, sanctions) & Bảng kỷ luật.
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Mở DATASTORE</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      window.open('/?page=datastore', '_blank');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all flex items-center gap-1"
                  >
                    <span>Tab mới</span>
                    <ExternalLink className="w-3 h-3 text-emerald-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {savedSuccess && (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-4 h-4" /> Đã lưu cài đặt!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors min-h-[42px]"
            >
              Đóng
            </button>
            <button
              id="save-settings-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50 min-h-[42px]"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

