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
  RefreshCw
} from 'lucide-react';
import { DeviceType } from '../types';
import { AVATAR_COLORS } from '../utils/device';
import { playReceiveSound } from '../utils/sound';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, userProfile, settings, updateSettings, logout } = useAuth();
  
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [deviceType, setDeviceType] = useState<DeviceType>(settings.deviceType);
  const [avatarColor, setAvatarColor] = useState(settings.avatarColor);
  const [autoAccept, setAutoAccept] = useState(settings.autoAccept);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Synchronize internal form fields whenever the modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setDeviceName(settings.deviceName);
      setDeviceType(settings.deviceType);
      setAvatarColor(settings.avatarColor);
      setAutoAccept(settings.autoAccept);
      setSoundEnabled(settings.soundEnabled);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    await updateSettings({
      deviceName: deviceName.trim() || settings.deviceName,
      deviceType,
      avatarColor,
      autoAccept,
      soundEnabled,
    });
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestSound = () => {
    playReceiveSound();
  };

  const deviceTypes: { type: DeviceType; label: string; icon: React.ReactNode }[] = [
    { type: 'laptop', label: 'Laptop', icon: <Laptop className="w-4 h-4" /> },
    { type: 'desktop', label: 'PC / Máy bàn', icon: <Monitor className="w-4 h-4" /> },
    { type: 'mobile', label: 'Điện thoại', icon: <Smartphone className="w-4 h-4" /> },
    { type: 'tablet', label: 'Máy tính bảng', icon: <Tablet className="w-4 h-4" /> },
  ];

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
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" />
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

            <div>
              <label className="block text-xs text-slate-300 mb-1.5 font-medium">
                Loại thiết bị
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {deviceTypes.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setDeviceType(item.type)}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      deviceType === item.type
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
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

