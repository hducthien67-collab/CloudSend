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
  Tv,
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
  CheckCircle2,
  Camera,
  Plus,
  Files,
  Cloud,
  Link as LinkIcon,
  ExternalLink
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playSendSound } from '../utils/sound';
import { censorProfanity } from '../utils/moderation';
import { extractUrls, hasUrls, renderClickableText } from '../utils/textFormat';
import { 
  uploadFileToServer, 
  generateImageThumbnail, 
  compressImageForDirectTransfer,
  isImageFile,
  MAX_FILE_SIZE, 
  MAX_FILE_SIZE_LABEL 
} from '../utils/fileUpload';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';
import { CloudDrivePickerModal } from './CloudDrivePickerModal';
import { SmoothSpaceTextarea } from './SmoothSpaceTextarea';
import { CloudDriveFile } from '../types';

export interface SendFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
  cloudUrl?: string;
  viewUrl?: string;
  thumbnail?: string;
  isFromCloud?: boolean;
}

export const SendView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  const [onlineDevices, setOnlineDevices] = useState<PresenceDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');

  // File state (supports multiple local & Cloud Drive files seamlessly on both phone and PC)
  const [selectedFiles, setSelectedFiles] = useState<SendFileItem[]>([]);
  const [fileThumbnails, setFileThumbnails] = useState<{ [fileName: string]: string }>({});
  const [isCloudPickerOpen, setIsCloudPickerOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Text state
  const [textContent, setTextContent] = useState('');
  const [spaceStepProgress, setSpaceStepProgress] = useState(1);
  const spaceLoopRef = useRef<number | null>(null);

  // Vòng lặp tăng tiến t từ 0 -> 1 (bước nhảy 0.05)
  const triggerSpaceStepLoop = () => {
    let t = 0;
    const step = 0.05;

    const runSpaceLoop = () => {
      t = Math.min(1, parseFloat((t + step).toFixed(4)));
      setSpaceStepProgress(t);

      if (t < 1) {
        spaceLoopRef.current = requestAnimationFrame(runSpaceLoop);
      }
    };

    if (spaceLoopRef.current !== null) {
      cancelAnimationFrame(spaceLoopRef.current);
    }
    setSpaceStepProgress(0);
    spaceLoopRef.current = requestAnimationFrame(runSpaceLoop);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      triggerSpaceStepLoop();
    }
  };

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

      // Avoid re-rendering whole SendView if device list is identical
      setOnlineDevices((prev) => {
        if (prev.length === devices.length) {
          const isIdentical = prev.every((p, i) => 
            p.uid === devices[i]?.uid &&
            p.deviceName === devices[i]?.deviceName &&
            p.deviceType === devices[i]?.deviceType &&
            p.avatarColor === devices[i]?.avatarColor &&
            p.status === devices[i]?.status
          );
          if (isIdentical) return prev;
        }
        return devices;
      });
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

  // Handle file addition (supports multiple files from local disk)
  const handleFilesAdded = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const validFiles: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_SIZE) {
        setStatusMessage(`Tệp "${f.name}" (${formatFileSize(f.size)}) vượt quá giới hạn tối đa ${MAX_FILE_SIZE_LABEL}.`);
      } else {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) return;

    setStatusMessage(null);

    const newItems: SendFileItem[] = validFiles.map((file) => ({
      id: `local_${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      file: file,
      isFromCloud: false
    }));

    setSelectedFiles(prev => {
      const existingKeys = new Set(prev.map(p => `${p.name}_${p.size}`));
      const nonDuplicates = newItems.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...nonDuplicates];
    });

    // Generate thumbnails for image files
    for (const file of validFiles) {
      if (isImageFile(file)) {
        try {
          const thumb = await generateImageThumbnail(file, 480, 0.75);
          if (thumb) {
            setFileThumbnails(prev => ({ ...prev, [file.name]: thumb }));
          }
        } catch {
          // ignore thumbnail errors
        }
      }
    }
  };

  // Handle files selected from Cloud Drive
  const handleCloudFilesAdded = (chosen: CloudDriveFile[]) => {
    if (!chosen.length) return;

    const newItems: SendFileItem[] = chosen.map((cf) => ({
      id: `cloud_${cf.id}`,
      name: cf.name,
      size: cf.size,
      type: cf.type,
      cloudUrl: cf.url,
      viewUrl: cf.viewUrl,
      thumbnail: cf.thumbnail,
      isFromCloud: true
    }));

    setSelectedFiles(prev => {
      const existingKeys = new Set(prev.map(p => `${p.name}_${p.size}`));
      const nonDuplicates = newItems.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...nonDuplicates];
    });

    const newThumbs: { [fileName: string]: string } = {};
    for (const cf of chosen) {
      if (cf.thumbnail) {
        newThumbs[cf.name] = cf.thumbnail;
      } else if (isImageFile(cf) && (cf.viewUrl || cf.url)) {
        newThumbs[cf.name] = cf.viewUrl || cf.url;
      }
    }
    setFileThumbnails(prev => ({ ...prev, ...newThumbs }));
    setStatusMessage(`Đã thêm ${newItems.length} tệp từ Kho Cloud vào danh sách gửi.`);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllFiles = () => {
    setSelectedFiles([]);
    setFileThumbnails({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  // Perform send to target device
  const sendToPeer = async (target: PresenceDevice) => {
    if (!currentUser) return;
    if (mode === 'file' && selectedFiles.length === 0) {
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
      if (mode === 'file') {
        const totalFiles = selectedFiles.length;
        for (let i = 0; i < totalFiles; i++) {
          const item = selectedFiles[i];
          const currentNumber = i + 1;
          setUploadProgress(Math.round((i / totalFiles) * 100) + 1);
          setUploadProgressText(`Đang xử lý tệp ${currentNumber}/${totalFiles}: "${item.name}"...`);

          let fileUrl = '';
          let serverThumbnail = fileThumbnails[item.name] || item.thumbnail || '';

          if (item.isFromCloud && item.cloudUrl) {
            // Already stored securely in personal Cloud Drive!
            fileUrl = item.cloudUrl;
            const fileShare = 100 / totalFiles;
            const overall = Math.min(99, Math.round((i + 1) * fileShare));
            setUploadProgress(overall);
            setUploadProgressText(`Đã chuẩn bị tệp Cloud ${currentNumber}/${totalFiles}: "${item.name}"...`);
          } else if (item.file) {
            // Local file: upload to server
            try {
              const uploaded = await uploadFileToServer(item.file, (pct) => {
                const fileShare = 100 / totalFiles;
                const overall = Math.min(99, Math.round(i * fileShare + (pct / 100) * fileShare));
                setUploadProgress(overall);
                setUploadProgressText(`Đang gửi tệp ${currentNumber}/${totalFiles}: "${item.name}" (${pct}%)...`);
              });
              fileUrl = uploaded.url;
              if (uploaded.thumbnail) {
                serverThumbnail = uploaded.thumbnail;
              }
            } catch (uploadErr: any) {
              console.warn(`Server upload failed for ${item.name}, trying direct fallback:`, uploadErr);
              let directData = fileThumbnails[item.name];
              if (!directData && isImageFile(item.file)) {
                directData = await compressImageForDirectTransfer(item.file, 1280, 0.82);
              }
              if (directData && directData.length < 850 * 1024) {
                serverThumbnail = directData;
                fileUrl = '';
              } else {
                throw uploadErr;
              }
            }
          }

          const payload: any = {
            senderId: currentUser.uid,
            senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
            senderDevice: settings.deviceName,
            receiverId: target.uid,
            receiverName: target.displayName || target.deviceName,
            status: 'pending',
            createdAt: new Date().toISOString(),
            fileName: item.name,
            fileSize: item.size,
            fileType: item.type || (isImageFile(item) ? 'image/jpeg' : 'application/octet-stream'),
            fileUrl: fileUrl,
            fileData: serverThumbnail || ''
          };

          await addDoc(collection(db, 'transfers'), payload);
        }

        setUploadProgress(100);
        setUploadProgressText(`Hoàn tất gửi ${totalFiles} tệp!`);
      } else {
        // Text mode
        const payload: any = {
          senderId: currentUser.uid,
          senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
          senderDevice: settings.deviceName,
          receiverId: target.uid,
          receiverName: target.displayName || target.deviceName,
          status: 'pending',
          createdAt: new Date().toISOString(),
          textContent: censorProfanity(textContent.trim()).cleanText
        };
        await addDoc(collection(db, 'transfers'), payload);
      }

      if (settings.soundEnabled) {
        playSendSound();
      }

      setTransferStatus(prev => ({ ...prev, [target.uid]: 'success' }));
      setStatusMessage(
        mode === 'file'
          ? `Đã chuyển thành công ${selectedFiles.length} tệp đến ${target.deviceName}!`
          : `Đã gửi văn bản thành công đến ${target.deviceName}!`
      );

      // Clear/Reset selection when sent successfully as requested by user
      setSelectedFiles([]);
      setFileThumbnails({});
      setUploadProgress(null);
      setUploadProgressText(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (mode === 'text') {
        setTextContent('');
      }

      setTimeout(() => {
        setTransferStatus(prev => ({ ...prev, [target.uid]: 'idle' }));
        setSendingTargetId(null);
      }, 3000);
    } catch (error: any) {
      console.error('Send error:', error);
      setTransferStatus(prev => ({ ...prev, [target.uid]: 'error' }));
      setStatusMessage(error?.message || 'Lỗi khi tải hoặc gửi tệp tin. Vui lòng thử lại.');
      setSendingTargetId(null);
      setUploadProgress(null);
      setUploadProgressText(null);
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
      case 'tv': return <Tv className="w-5 h-5 text-emerald-400" />;
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
              Chọn tệp từ máy, kho Cloud hoặc văn bản để truyền tới các thiết bị khác
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
            {/* General file input - multiple allowed for any file types */}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            {/* Dedicated image & video picker input - multiple allowed */}
            <input
              type="file"
              multiple
              accept="image/*,video/*,.heic,.heif,.dng,.raw"
              ref={imageInputRef}
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            {/* Direct Camera input for mobile phones */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            
            <div
              id="file-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => selectedFiles.length === 0 && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-4 sm:p-6 text-center transition-all ${
                isDragOver
                  ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                  : selectedFiles.length > 0
                  ? 'border-emerald-500/60 bg-emerald-500/5 cursor-default'
                  : 'border-slate-700/80 hover:border-emerald-500/50 bg-slate-950/40 hover:bg-slate-950/60 cursor-pointer'
              }`}
            >
              {selectedFiles.length > 0 ? (
                <div className="space-y-3">
                  {/* Header info bar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Files className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-bold text-white block">
                          Đã chọn {selectedFiles.length} tệp tin
                        </span>
                        <span className="text-xs text-slate-400">
                          Tổng dung lượng: {formatFileSize(selectedFiles.reduce((acc, f) => acc + f.size, 0))} • Sẵn sàng gửi
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCloudPickerOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <Cloud className="w-3.5 h-3.5 text-sky-400" />
                        <span>Từ Cloud</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Thêm tệp</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearAllFiles();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Xóa tất cả</span>
                      </button>
                    </div>
                  </div>

                  {/* Files List / Cards */}
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {selectedFiles.map((file, idx) => {
                      const isImg = isImageFile(file);
                      const thumb = fileThumbnails[file.name];

                      return (
                        <div
                          key={`${file.name}_${file.size}_${idx}`}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-left hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isImg ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (thumb) setViewingImage(thumb);
                                }}
                                className={`relative group w-12 h-12 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0 ${
                                  thumb ? 'cursor-pointer' : ''
                                }`}
                              >
                                {thumb ? (
                                  <img src={thumb} alt={file.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-800 text-emerald-400">
                                    <ImageIcon className="w-5 h-5" />
                                  </div>
                                )}
                                {thumb && (
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Eye className="w-3.5 h-3.5 text-white" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <FileDocIcon fileName={file.name} mimeType={file.type} size="md" />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-white block truncate max-w-[180px] sm:max-w-md">
                                  {file.name}
                                </span>
                                {file.isFromCloud && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold inline-flex items-center gap-1 shrink-0">
                                    <Cloud className="w-2.5 h-2.5" /> Kho Cloud
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {formatFileSize(file.size)} • {getDocumentTypeInfo(file.name, file.type).label}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            title="Xóa tệp này"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(idx);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-emerald-400 font-medium text-center pt-1">
                    ✓ Chọn thiết bị ở danh sách bên dưới và nhấn "Gửi đến thiết bị này" để truyền file
                  </p>
                </div>
              ) : (
                /* Empty state matching the user's design specification */
                <div className="flex flex-col items-center justify-center py-2 sm:py-4">
                  {/* Rounded icon badge matching image.png */}
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 mb-3 shadow-inner">
                    <FileUp className="w-6 h-6 text-slate-300" />
                  </div>

                  {/* Main Title */}
                  <h3 className="text-sm sm:text-base font-bold text-white mb-1">
                    Kéo thả tệp tin hoặc ảnh vào đây để gửi
                  </h3>

                  {/* Subtitle based on device */}
                  {settings.deviceType === 'mobile' || settings.deviceType === 'tablet' ? (
                    <p className="text-xs text-slate-400 mb-4 max-w-lg px-2">
                      Hỗ trợ ảnh chụp điện thoại (JPG, PNG, iPhone HEIC, RAW) và tài liệu lên đến {MAX_FILE_SIZE_LABEL}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mb-4 max-w-lg px-2">
                      Hỗ trợ các loại tệp, loại ảnh, video, tài liệu lên đến {MAX_FILE_SIZE_LABEL}
                    </p>
                  )}

                  {/* Action Buttons: Phone/Tablet layout vs PC layout */}
                  {settings.deviceType === 'mobile' || settings.deviceType === 'tablet' ? (
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      {/* Chọn từ kho Cloud */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCloudPickerOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <Cloud className="w-4 h-4" />
                        <span>Chọn từ kho Cloud</span>
                      </button>

                      {/* Chọn ảnh từ máy */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          imageInputRef.current?.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Chọn ảnh từ máy</span>
                      </button>

                      {/* Chụp ảnh mới */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cameraInputRef.current?.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Chụp ảnh mới</span>
                      </button>

                      {/* Chọn tệp tin */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <FileUp className="w-4 h-4 text-slate-300" />
                        <span>Chọn tệp tin</span>
                      </button>
                    </div>
                  ) : (
                    /* Desktop / PC layout: Kéo thả tệp tin + Các nút chọn tệp, ảnh và kho Cloud */
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCloudPickerOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <Cloud className="w-4 h-4 text-sky-400" />
                        <span>Chọn từ kho Cloud</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                      >
                        <FileUp className="w-4 h-4" />
                        <span>Chọn tệp tin</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          imageInputRef.current?.click();
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
                      >
                        <ImageIcon className="w-4 h-4 text-emerald-400" />
                        <span>Chọn ảnh từ máy</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploadProgress !== null && (
              <div className="mt-3 p-3 bg-slate-900/90 border border-emerald-500/40 rounded-xl space-y-1.5 shadow-lg animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5 truncate">
                    <UploadCloud className="w-3.5 h-3.5 animate-bounce shrink-0" />
                    <span>{uploadProgressText || 'Đang tải tệp lên máy chủ...'}</span>
                  </span>
                  <span className="text-white font-mono font-bold shrink-0">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative group">
              {/* Ô soạn thảo tích hợp vạch bước chuyển động | | | | | | | trực tiếp bên trong */}
              <SmoothSpaceTextarea
                id="send-text-input"
                rows={3}
                value={textContent}
                onChange={(val) => setTextContent(val)}
                placeholder="Dán đường dẫn link (https://...), mã code hoặc văn bản cần gửi nhanh..."
              />

              {/* Thanh hiển thị trạng thái nút cách & thao tác nhanh */}
              <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between pointer-events-none text-[11px] text-slate-500 z-20">
                <div className="flex items-center gap-2 pointer-events-auto">
                  {/* Huy hiệu hiển thị trạng thái vạch bước */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 shadow-sm">
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">␣ Vạch cách | | | |</span>
                    {textContent.length > 0 && (
                      <span className="font-mono text-[11px] text-slate-400 border-l border-slate-800 pl-2">
                        {textContent.split(/\s+/).filter(Boolean).length} từ
                      </span>
                    )}
                  </div>

                  {hasUrls(textContent) && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 flex items-center gap-1.5 animate-in fade-in text-[10px] shadow-sm">
                      <LinkIcon className="w-3 h-3 text-emerald-400" />
                      <span>Đã nhận diện Link</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
                  {textContent.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTextContent('')}
                      className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 text-[10px] font-medium transition-colors"
                    >
                      Xóa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const clipText = await navigator.clipboard.readText();
                        if (clipText) setTextContent(clipText);
                      } catch {}
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-850 text-slate-400 hover:text-emerald-300 border border-slate-800 text-[10px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Dán
                  </button>
                </div>
              </div>
            </div>

            {/* Thẻ nhận diện liên kết thông minh: Người gửi có thể nhấn trực tiếp vào đây để mở link */}
            {extractUrls(textContent).length > 0 && (
              <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-teal-950/30 border border-emerald-500/30 shadow-lg space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    Liên kết web được phát hiện ({extractUrls(textContent).length}):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">Người gửi & người nhận đều bấm mở trực tiếp</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {extractUrls(textContent).map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 shadow-sm group"
                      title={`Bấm để mở trực tiếp liên kết: ${url}`}
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-45 transition-transform" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
                    </a>
                  ))}
                </div>
              </div>
            )}
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
                      <div className="text-xs font-semibold text-white block truncate">
                        {item.fileName ? (
                          <span>{item.fileName}</span>
                        ) : item.textContent ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-normal">Gửi:</span>
                            {renderClickableText(item.textContent, true, 'text-emerald-300 underline font-semibold hover:text-white inline-flex items-center gap-1')}
                          </div>
                        ) : (
                          'Tệp tin'
                        )}
                      </div>
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

      {/* Cloud Drive Picker Modal */}
      <CloudDrivePickerModal
        isOpen={isCloudPickerOpen}
        onClose={() => setIsCloudPickerOpen(false)}
        onSelectFiles={handleCloudFilesAdded}
        alreadySelectedUrls={selectedFiles.filter(f => f.cloudUrl).map(f => f.cloudUrl!)}
      />

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
