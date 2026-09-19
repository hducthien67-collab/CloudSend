import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { PresenceDevice, DeviceType } from '../types';
import { 
  Send, 
  FileText, 
  Image as ImageIcon, 
  UploadCloud, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Globe, 
  Search, 
  Check, 
  AlertCircle,
  Copy,
  Radio,
  FileUp,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playSendSound } from '../utils/sound';

export const SendView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  const [onlineDevices, setOnlineDevices] = useState<PresenceDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text state
  const [textContent, setTextContent] = useState('');

  // Sending feedback
  const [sendingTargetId, setSendingTargetId] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<{ [peerId: string]: 'idle' | 'sending' | 'success' | 'error' }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Real-time listener for online presence across Internet
  useEffect(() => {
    if (!currentUser) return;

    const presenceRef = collection(db, 'presence');
    const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
      const devices: PresenceDevice[] = [];
      const now = new Date().getTime();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PresenceDevice;
        // Ignore self
        if (data.uid === currentUser.uid) return;

        // Check if lastSeen is within last 90 seconds
        const lastSeenTime = data.lastSeen ? new Date(data.lastSeen).getTime() : 0;
        const isRecent = (now - lastSeenTime) < 90000;

        if (isRecent) {
          devices.push(data);
        }
      });

      setOnlineDevices(devices);
    }, (error) => {
      console.warn('Presence listener notice:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Handle file selection
  const handleFileChange = (file: File) => {
    // 750KB limit for direct instant relay through Firestore document
    const MAX_SIZE = 750 * 1024;
    if (file.size > MAX_SIZE) {
      setStatusMessage(`Tệp "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn 750KB truyền tức thời. Vui lòng chọn tệp nhỏ hơn.`);
      return;
    }

    setStatusMessage(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFileBase64(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Perform send to target device
  const sendToPeer = async (target: PresenceDevice) => {
    if (!currentUser) return;
    if (mode === 'file' && (!selectedFile || !fileBase64)) {
      setStatusMessage('Vui lòng chọn hoặc kéo thả tệp tin cần gửi trước.');
      return;
    }
    if (mode === 'text' && !textContent.trim()) {
      setStatusMessage('Vui lòng nhập nội dung văn bản cần gửi.');
      return;
    }

    setSendingTargetId(target.uid);
    setTransferStatus(prev => ({ ...prev, [target.uid]: 'sending' }));
    setStatusMessage(null);

    try {
      const payload: any = {
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
        senderDevice: settings.deviceName,
        receiverId: target.uid,
        receiverName: target.displayName || target.deviceName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      if (mode === 'file' && selectedFile && fileBase64) {
        payload.fileName = selectedFile.name;
        payload.fileSize = selectedFile.size;
        payload.fileType = selectedFile.type || 'application/octet-stream';
        payload.fileData = fileBase64;
      } else {
        payload.textContent = textContent.trim();
      }

      await addDoc(collection(db, 'transfers'), payload);

      if (settings.soundEnabled) {
        playSendSound();
      }

      setTransferStatus(prev => ({ ...prev, [target.uid]: 'success' }));
      setStatusMessage(`Đã chuyển thành công đến ${target.deviceName}!`);

      // Reset selection
      if (mode === 'text') {
        setTextContent('');
      }

      setTimeout(() => {
        setTransferStatus(prev => ({ ...prev, [target.uid]: 'idle' }));
        setSendingTargetId(null);
      }, 3000);
    } catch (error) {
      console.error('Send error:', error);
      setTransferStatus(prev => ({ ...prev, [target.uid]: 'error' }));
      setStatusMessage('Lỗi khi gửi tệp qua server trung gian. Vui lòng thử lại.');
      setSendingTargetId(null);
    }
  };

  const renderDeviceIcon = (type: DeviceType) => {
    switch (type) {
      case 'mobile': return <Smartphone className="w-5 h-5" />;
      case 'tablet': return <Tablet className="w-5 h-5" />;
      case 'desktop': return <Monitor className="w-5 h-5" />;
      default: return <Laptop className="w-5 h-5" />;
    }
  };

  const filteredDevices = onlineDevices.filter(d => 
    d.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Top Bar / Content Selector (LocalSend Style) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-400" />
              Nội dung cần gửi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chọn tệp hoặc văn bản để truyền qua máy chủ trung gian tới các thiết bị khác
            </p>
          </div>

          {/* Type Toggle: File vs Text */}
          <div className="inline-flex p-1 bg-slate-950/70 border border-slate-800 rounded-xl self-start sm:self-auto">
            <button
              id="send-mode-file"
              type="button"
              onClick={() => setMode('file')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'file' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" />
              Tệp tin
            </button>
            <button
              id="send-mode-text"
              type="button"
              onClick={() => setMode('text')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'text' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Văn bản / Link
            </button>
          </div>
        </div>

        {/* Content Dropzone / Input */}
        {mode === 'file' ? (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              className="hidden"
            />
            
            <div
              id="file-dropzone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : 'border-slate-700 hover:border-emerald-500/40 bg-slate-950/40 hover:bg-slate-950/60'
              }`}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      Kích thước: {formatFileSize(selectedFile.size)} • Nhấn để chọn tệp khác
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center group-hover:text-emerald-400 transition-colors">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white block">
                      Kéo thả tệp tin vào đây hoặc nhấn để duyệt tệp
                    </span>
                    <span className="text-xs text-slate-400">
                      Hỗ trợ hình ảnh, tài liệu, video ngắn (tối ưu tới 750KB để chuyển tức thời qua Relay)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <textarea
              id="send-text-input"
              rows={3}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Dán đường dẫn link, mã code hoặc ghi chú cần gửi nhanh tới thiết bị khác..."
              className="w-full p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
            />
          </div>
        )}

        {/* Status notice */}
        {statusMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Target Devices (Nearby / Online on Internet Relay) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              Thiết bị trực tuyến qua Server trung gian
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {onlineDevices.length} thiết bị
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tất cả các máy đang mở CloudSend qua mạng Internet sẽ hiển thị ở đây
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm thiết bị..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Devices Grid (LocalSend style) */}
        {filteredDevices.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 text-slate-400 mx-auto flex items-center justify-center animate-pulse">
              <Radio className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-white">Đang dò tìm thiết bị trên mạng...</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Chưa có thiết bị nào khác đang trực tuyến. Hãy mở trang web này trên điện thoại hoặc máy tính khác để thử kết nối, hoặc vào mục <strong>"Phòng Chat"</strong> để tạo phòng trao đổi!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map((device) => {
              const status = transferStatus[device.uid] || 'idle';
              const isSendingToThis = sendingTargetId === device.uid;

              return (
                <div
                  key={device.uid}
                  id={`peer-card-${device.uid}`}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between group relative overflow-hidden"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Device Icon Avatar */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: device.avatarColor || '#10B981' }}
                    >
                      {renderDeviceIcon(device.deviceType)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-white truncate">
                          {device.deviceName}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {device.displayName}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Internet Relay
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Send Action Button */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-end">
                    <button
                      id={`send-to-${device.uid}`}
                      type="button"
                      disabled={isSendingToThis}
                      onClick={() => sendToPeer(device)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        status === 'success'
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : status === 'error'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-[0.98]'
                      }`}
                    >
                      {status === 'sending' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang gửi qua Server...</span>
                        </>
                      ) : status === 'success' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã gửi thành công!</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Gửi đến thiết bị này</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
