import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getClientDeviceId } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { PresenceDevice, DirectTransfer } from '../../types';
import { 
  Camera, 
  Image as ImageIcon, 
  FileText, 
  AlignLeft, 
  Clipboard, 
  Cloud, 
  Smartphone, 
  Laptop, 
  Monitor, 
  Tv, 
  Send, 
  Search, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Share2
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { uploadFileToServer, isImageFile, generateImageThumbnail, createClientFallbackFileInfo } from '../../utils/fileUpload';
import { CloudDrivePickerModal } from '../CloudDrivePickerModal';

export const MobileSendView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  const [onlineDevices, setOnlineDevices] = useState<PresenceDevice[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTargetDevice, setSelectedTargetDevice] = useState<PresenceDevice | null>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isSelectDeviceSheetOpen, setIsSelectDeviceSheetOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [isTextSheetOpen, setIsTextSheetOpen] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [isCloudPickerOpen, setIsCloudPickerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<number | null>(null);
  const [statusToast, setStatusToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [manualCode, setManualCode] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusToast({ type, text });
    setTimeout(() => {
      setStatusToast(null);
    }, 3500);
  };

  // Real-time listener for online presence across the network
  useEffect(() => {
    if (!currentUser) return;
    const currentDevId = getClientDeviceId();
    const presenceRef = collection(db, 'presence');

    const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
      const now = Date.now();
      const deviceMap = new Map<string, PresenceDevice & { id: string; peerTime: number }>();

      snapshot.docs.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as PresenceDevice & { id: string };

        // Ignore self device
        if (data.deviceId && data.deviceId === currentDevId) return;
        if (!data.deviceId && data.uid === currentUser.uid) return;
        if (data.status === 'offline') return;

        const peerTime = data.lastSeenServer?.toMillis?.() || 
          (data.lastSeenServer?.seconds ? data.lastSeenServer.seconds * 1000 : 0) || 
          data.lastSeenMs || 0;

        // Skip records inactive for > 35s
        if (peerTime && Math.abs(now - peerTime) > 35000) return;

        const key = data.deviceId || data.uid;
        deviceMap.set(key, { ...data, peerTime });
      });

      const list: PresenceDevice[] = [];
      deviceMap.forEach((dev) => list.push(dev));
      setOnlineDevices(list);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Handle Send File to target device
  const handleSendFiles = async (files: FileList | null, targetDev?: PresenceDevice | null) => {
    const target = targetDev || selectedTargetDevice;
    if (!files || files.length === 0 || !target || !currentUser) {
      showToast('Vui lòng chọn thiết bị nhận trước!', 'error');
      return;
    }

    setIsSending(true);
    setSendProgress(10);
    setIsActionSheetOpen(false);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileUrl = '';
        let thumbnail: string | null = null;

        if (isImageFile(file)) {
          try {
            thumbnail = await generateImageThumbnail(file, 480, 0.75);
          } catch {}
        }

        try {
          const uploaded = await uploadFileToServer(file, (pct) => {
            setSendProgress(Math.min(95, Math.round((i * 100 + pct) / files.length)));
          });
          fileUrl = uploaded.url;
          if (uploaded.thumbnail) thumbnail = uploaded.thumbnail;
        } catch {
          const fallback = await createClientFallbackFileInfo(file);
          fileUrl = fallback.url;
          thumbnail = fallback.thumbnail || null;
        }

        const safeUrl = (fileUrl && fileUrl.length < 700000) ? fileUrl : '';
        const safeThumb = (thumbnail && thumbnail.length < 700000) ? thumbnail : null;

        await addDoc(collection(db, 'transfers'), {
          senderId: currentUser.uid,
          senderName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Thiết bị di động',
          senderDevice: settings?.deviceName || 'Điện thoại',
          receiverId: target.uid,
          receiverName: target.displayName || target.deviceName || 'Thiết bị nhận',
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          fileUrl: safeUrl,
          fileData: safeThumb,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      showToast(`Đã gửi ${files.length} tệp tới ${target.displayName || target.deviceName}!`, 'success');
    } catch (err: any) {
      console.error('Send file error:', err);
      showToast(err.message || 'Lỗi khi gửi tệp. Vui lòng thử lại.', 'error');
    } finally {
      setIsSending(false);
      setSendProgress(null);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Send Text to target device
  const handleSendText = async () => {
    if (!textMessage.trim() || !selectedTargetDevice || !currentUser) return;

    setIsSending(true);
    setIsTextSheetOpen(false);

    try {
      await addDoc(collection(db, 'transfers'), {
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Thiết bị di động',
        senderDevice: settings?.deviceName || 'Điện thoại',
        receiverId: selectedTargetDevice.uid,
        receiverName: selectedTargetDevice.displayName || selectedTargetDevice.deviceName || 'Thiết bị nhận',
        textContent: textMessage.trim(),
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      showToast(`Đã gửi văn bản tới ${selectedTargetDevice.displayName || selectedTargetDevice.deviceName}!`, 'success');
      setTextMessage('');
    } catch (err: any) {
      console.error('Send text error:', err);
      showToast('Không thể gửi văn bản. Vui lòng thử lại.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Handle Paste from Clipboard
  const handlePasteAndSend = async (targetDev?: PresenceDevice) => {
    const target = targetDev || selectedTargetDevice;
    if (!target) {
      showToast('Vui lòng chọn thiết bị nhận trước!', 'error');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showToast('Bộ nhớ tạm đang trống.', 'info');
        return;
      }

      setTextMessage(text);
      setSelectedTargetDevice(target);
      setIsTextSheetOpen(true);
      setIsActionSheetOpen(false);
    } catch (err) {
      showToast('Không thể truy cập bộ nhớ tạm. Vui lòng dán thủ công.', 'error');
    }
  };

  // Device icon helper
  const getDeviceIcon = (type?: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case 'tablet':
        return <Smartphone className="w-5 h-5 text-teal-400" />;
      case 'laptop':
        return <Laptop className="w-5 h-5 text-sky-400" />;
      case 'tv':
        return <Tv className="w-5 h-5 text-purple-400" />;
      default:
        return <Monitor className="w-5 h-5 text-blue-400" />;
    }
  };

  const filteredDevices = onlineDevices.filter((d) => {
    const name = (d.displayName || d.deviceName || '').toLowerCase();
    const q = searchFilter.toLowerCase().trim();
    return !q || name.includes(q) || d.connectCode?.toLowerCase().includes(q);
  });

  return (
    <div className="w-full flex-1 flex flex-col px-3 py-2.5 space-y-3 overscroll-contain no-scrollbar">
      {/* Hidden Mobile Native Inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleSendFiles(e.target.files)}
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleSendFiles(e.target.files)}
      />
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => handleSendFiles(e.target.files)}
      />

      {/* Floating Status Toast */}
      {statusToast && (
        <div className={`fixed top-16 left-3.5 right-3.5 z-50 p-3 rounded-2xl shadow-2xl backdrop-blur-md border flex items-center gap-2.5 animate-in slide-in-from-top-3 duration-200 ${
          statusToast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
            : statusToast.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            : 'bg-slate-900/90 border-slate-700 text-slate-200'
        }`}>
          {statusToast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : statusToast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-sky-400 animate-spin shrink-0" />
          )}
          <span className="text-xs font-semibold flex-1 truncate">{statusToast.text}</span>
          <button type="button" onClick={() => setStatusToast(null)} className="p-1 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Progress Bar when Sending */}
      {isSending && (
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-3 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang truyền tệp tin siêu tốc...
            </span>
            <span className="text-white font-mono font-bold">{sendProgress || 10}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200 rounded-full"
              style={{ width: `${sendProgress || 10}%` }}
            />
          </div>
        </div>
      )}

      {/* Quick Action Matrix (6 Compact Cards) */}
      <div className="space-y-1">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
          Hành Động Nhanh
        </h2>

        <div className="grid grid-cols-3 gap-1.5">
          {/* 1. Camera */}
          <button
            type="button"
            onClick={() => {
              if (onlineDevices.length === 0) {
                showToast('Chưa có thiết bị nào đang online để gửi tới.', 'info');
              }
              cameraInputRef.current?.click();
            }}
            className="p-2 rounded-xl bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 border border-emerald-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Chụp ảnh
            </span>
          </button>

          {/* 2. Photo Library */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="p-2 rounded-xl bg-gradient-to-b from-sky-500/15 to-sky-500/5 border border-sky-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ImageIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Thư viện ảnh
            </span>
          </button>

          {/* 3. Files & Documents */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl bg-gradient-to-b from-amber-500/15 to-amber-500/5 border border-amber-500/30 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Tập tin
            </span>
          </button>

          {/* 4. Text Message */}
          <button
            type="button"
            onClick={() => {
              if (onlineDevices.length === 1 && !selectedTargetDevice) {
                setSelectedTargetDevice(onlineDevices[0]);
              }
              setIsTextSheetOpen(true);
            }}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlignLeft className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Văn bản
            </span>
          </button>

          {/* 5. Paste Clipboard */}
          <button
            type="button"
            onClick={() => handlePasteAndSend()}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clipboard className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Dán
            </span>
          </button>

          {/* 6. Cloud Drive Picker */}
          <button
            type="button"
            onClick={() => setIsCloudPickerOpen(true)}
            className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-sm group"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Cloud className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-200 tracking-tight text-center">
              Kho Cloud
            </span>
          </button>
        </div>
      </div>

      {/* Online Devices Section */}
      <div className="space-y-2 flex-1 flex flex-col">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Thiết Bị Xung Quanh ({onlineDevices.length})
            </h2>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm máy..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-28 bg-slate-900 border border-slate-800 rounded-lg pl-6 pr-2 py-0.5 text-[11px] text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {filteredDevices.length === 0 ? (
          <div className="flex-1 min-h-[160px] rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin duration-3000" />
            </div>
            <p className="text-xs font-bold text-slate-300">Đang quét tìm thiết bị khác...</p>
            <p className="text-[11px] text-slate-500 max-w-[240px]">
              Mở CLSend trên máy tính, điện thoại hoặc Smart TV khác trong cùng mạng để gửi tệp tức thì.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDevices.map((device) => {
              const devName = device.displayName || device.deviceName || 'Thiết bị';
              const devTypeLabel = device.deviceType === 'mobile' ? 'Điện thoại' : device.deviceType === 'laptop' ? 'Laptop' : device.deviceType === 'tv' ? 'Smart TV' : 'Máy tính';

              return (
                <div
                  key={device.deviceId || device.uid}
                  onClick={() => {
                    setSelectedTargetDevice(device);
                    setIsActionSheetOpen(true);
                  }}
                  className="p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 flex items-center justify-between gap-3 shadow-md active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white truncate">{devName}</h3>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {devTypeLabel} {device.connectCode ? `• Mã: ${device.connectCode}` : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors shrink-0 shadow-sm"
                  >
                    <span>Gửi</span>
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Target Device Action Bottom Sheet */}
      <MobileBottomSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        title={selectedTargetDevice?.displayName || selectedTargetDevice?.deviceName || 'Chọn nội dung gửi'}
        subtitle="Chọn loại tệp hoặc văn bản bạn muốn truyền siêu tốc:"
        icon={getDeviceIcon(selectedTargetDevice?.deviceType)}
      >
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setIsActionSheetOpen(false);
              cameraInputRef.current?.click();
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Chụp ảnh / Video</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsActionSheetOpen(false);
              galleryInputRef.current?.click();
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Thư viện ảnh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsActionSheetOpen(false);
              fileInputRef.current?.click();
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Tập tin / File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsActionSheetOpen(false);
              setIsTextSheetOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <AlignLeft className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Văn bản / Tin nhắn</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsActionSheetOpen(false);
            setIsCloudPickerOpen(true);
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98"
        >
          <Cloud className="w-4 h-4 text-sky-400" />
          <span>Chọn từ Kho Cloud Drive Cá Nhân</span>
        </button>
      </MobileBottomSheet>

      {/* Text Message Bottom Sheet */}
      <MobileBottomSheet
        isOpen={isTextSheetOpen}
        onClose={() => setIsTextSheetOpen(false)}
        title="Gửi Tin Nhắn / Văn Bản"
        subtitle={selectedTargetDevice ? `Tới: ${selectedTargetDevice.displayName || selectedTargetDevice.deviceName}` : 'Nhập nội dung cần gửi:'}
        icon={<AlignLeft className="w-5 h-5 text-sky-400" />}
      >
        <div className="space-y-3">
          <textarea
            value={textMessage}
            onChange={(e) => setTextMessage(e.target.value)}
            placeholder="Nhập nội dung văn bản, mật khẩu, link web cần chuyển qua điện thoại/máy tính..."
            className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-2xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            autoFocus
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  const clip = await navigator.clipboard.readText();
                  if (clip) setTextMessage(clip);
                } catch {}
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Dán từ máy</span>
            </button>

            <button
              type="button"
              onClick={handleSendText}
              disabled={!textMessage.trim()}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span>Gửi Ngay</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </MobileBottomSheet>

      {/* Cloud Drive Picker Modal */}
      {isCloudPickerOpen && (
        <CloudDrivePickerModal
          isOpen={isCloudPickerOpen}
          onClose={() => setIsCloudPickerOpen(false)}
          onSelectFiles={async (selectedFiles) => {
            setIsCloudPickerOpen(false);
            if (selectedFiles.length === 0 || !selectedTargetDevice || !currentUser) return;
            
            setIsSending(true);
            try {
              for (const file of selectedFiles) {
                await addDoc(collection(db, 'transfers'), {
                  senderId: currentUser.uid,
                  senderName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Thiết bị di động',
                  senderDevice: settings?.deviceName || 'Điện thoại',
                  receiverId: selectedTargetDevice.uid,
                  receiverName: selectedTargetDevice.displayName || selectedTargetDevice.deviceName || 'Thiết bị nhận',
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type || 'application/octet-stream',
                  fileUrl: file.url,
                  fileData: file.thumbnail || null,
                  status: 'pending',
                  createdAt: new Date().toISOString()
                });
              }
              showToast(`Đã gửi ${selectedFiles.length} tệp từ Cloud tới ${selectedTargetDevice.displayName || selectedTargetDevice.deviceName}!`, 'success');
            } catch (err) {
              showToast('Lỗi khi gửi tệp từ Cloud.', 'error');
            } finally {
              setIsSending(false);
            }
          }}
        />
      )}
    </div>
  );
};
