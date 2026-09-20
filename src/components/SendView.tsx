import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  deleteDoc,
  doc
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
  Sparkles,
  Trash2,
  Eye,
  X,
  Clock,
  CheckCircle2
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

  // Sent history and modal
  const [sentTransfers, setSentTransfers] = useState<any[]>([]);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

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

  // Real-time listener for transfers sent by this user
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'transfers'),
      where('senderId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSentTransfers(items.slice(0, 10));
    }, (err) => {
      console.warn('Sent transfers listener notice:', err);
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

      // Clear/Reset selection when sent successfully as requested by user
      setSelectedFile(null);
      setFileBase64(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const handleDeleteSentItem = async (transferId: string) => {
    try {
      await deleteDoc(doc(db, 'transfers', transferId));
    } catch (e) {
      console.warn('Failed to delete sent transfer record:', e);
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
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* Your Device Online Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md ring-2 ring-emerald-500/20"
            style={{ backgroundColor: settings.avatarColor || '#10B981' }}
          >
            {renderDeviceIcon(settings.deviceType)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-white truncate">
                {settings.deviceName}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Thiết bị của bạn (Đang trực tuyến)
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              Đang phát sóng trên Cloud Relay • Người khác trên mạng có thể tìm thấy và gửi tệp đến bạn
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <span>Tài khoản:</span>
          <span className="font-semibold text-white">{currentUser?.displayName || currentUser?.email?.split('@')[0]}</span>
        </div>
      </div>

      {/* Top Bar / Content Selector (LocalSend Style) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
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
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 sm:p-6 text-center transition-all ${
                selectedFile
                  ? 'border-emerald-500/60 bg-emerald-500/5 cursor-default'
                  : 'border-slate-700 hover:border-emerald-500/40 bg-slate-950/40 hover:bg-slate-950/60 cursor-pointer'
              }`}
            >
              {selectedFile ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-left">
                  <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
                    {/* Real Image thumbnail if it's an image */}
                    {fileBase64 && selectedFile.type.startsWith('image/') ? (
                      <div 
                        onClick={() => setViewingImage(fileBase64)}
                        className="relative group/thumb cursor-pointer w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shrink-0 shadow-md hover:ring-2 hover:ring-emerald-400 transition-all"
                        title="Nhấn để xem ảnh phóng to"
                      >
                        <img 
                          src={fileBase64} 
                          alt={selectedFile.name} 
                          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                        <FileText className="w-7 h-7" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold text-white block truncate max-w-[200px] sm:max-w-md">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        Kích thước: {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Tệp tin'}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-medium block mt-1">
                        ✓ Sẵn sàng gửi đến thiết bị nhận bên dưới
                      </span>
                    </div>
                  </div>

                  {/* Action buttons: Delete or Change file */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      id="remove-selected-file-btn"
                      type="button"
                      title="Xóa tệp này khỏi nội dung cần gửi"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setFileBase64(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Xóa ảnh/tệp</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                    >
                      Đổi tệp
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center group-hover:text-emerald-400 transition-colors">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white block">
                      Kéo thả tệp tin hoặc ảnh vào đây hoặc nhấn để duyệt
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-teal-400 shrink-0" />
                <span>Thiết bị trực tuyến qua Server</span>
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono whitespace-nowrap shrink-0">
                {onlineDevices.length} thiết bị
              </span>
            </div>
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

      {/* Sent History (Lịch sử các tệp và ảnh bạn đã gửi đi) */}
      {sentTransfers.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-800/60">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-emerald-400" />
              Lịch sử tệp bạn đã gửi ({sentTransfers.length})
            </h3>
            <span className="text-[11px] text-slate-400">Ảnh và tệp gần đây</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sentTransfers.map((item) => {
              const isImage = item.fileType?.startsWith('image/') && !!item.fileData;

              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Thumbnail for sent image */}
                    {isImage ? (
                      <div 
                        onClick={() => setViewingImage(item.fileData)}
                        className="relative group cursor-pointer w-12 h-12 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0"
                        title="Bấm để xem ảnh lớn"
                      >
                        <img src={item.fileData} alt={item.fileName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                        {item.fileName ? <FileText className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-teal-400" />}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-white block truncate">
                        {item.fileName || (item.textContent ? `Văn bản: "${item.textContent.slice(0, 20)}..."` : 'Tệp tin')}
                      </span>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        Tới: <strong className="text-slate-300">{item.receiverName}</strong> • {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === 'completed' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Đã nhận
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                        Đang chờ
                      </span>
                    )}
                    {item.status === 'declined' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold">
                        Từ chối
                      </span>
                    )}

                    <button
                      type="button"
                      title="Xóa bản ghi này"
                      onClick={() => handleDeleteSentItem(item.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {viewingImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setViewingImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-800 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="Xem trước" className="max-w-full max-h-[80vh] rounded-xl object-contain mx-auto shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
};
