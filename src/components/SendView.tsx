import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getClientDeviceId } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  getDocsFromServer
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
  ExternalLink,
  Folder,
  Clipboard,
  AlignLeft,
  Edit3
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
  fileToBase64,
  MAX_FILE_SIZE, 
  MAX_FILE_SIZE_LABEL 
} from '../utils/fileUpload';
import { downloadFileSafely } from '../utils/fileDownload';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';
import { CloudDrivePickerModal } from './CloudDrivePickerModal';
import { SmoothSpaceTextarea } from './SmoothSpaceTextarea';
import { RichChatInput } from './RichChatInput';
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
  const { currentUser, userProfile, settings, updatePresence } = useAuth();
  const activeAvatarUrl = settings.customAvatarUrl || userProfile?.customAvatarUrl || currentUser?.photoURL;
  const [onlineDevices, setOnlineDevices] = useState<PresenceDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [isRescanning, setIsRescanning] = useState(false);

  // File state (supports multiple local & Cloud Drive files seamlessly on both phone and PC)
  const [selectedFiles, setSelectedFiles] = useState<SendFileItem[]>([]);
  const [fileThumbnails, setFileThumbnails] = useState<{ [fileName: string]: string }>({});
  const [isCloudPickerOpen, setIsCloudPickerOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Quick choice modal when clicking a device without content
  const [showQuickChoiceModal, setShowQuickChoiceModal] = useState(false);
  const [targetDeviceForQuickChoice, setTargetDeviceForQuickChoice] = useState<PresenceDevice | null>(null);

  // Text message modal state (Nhập tin nhắn popup matching Image 1)
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [modalTextValue, setModalTextValue] = useState('');

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

  // Cached raw presence docs ref for periodic 5s freshness ticker
  const latestPresenceDocsRef = useRef<any[]>([]);

  // Core processing function: deduplicates devices by deviceId and purges stale/offline records
  const processPresenceDocs = (
    docs: any[],
    currentDevId: string,
    currentUid: string
  ) => {
    const now = Date.now();
    let myServerTime = 0;
    for (const docSnap of docs) {
      const d = docSnap.data({ serverTimestamps: 'estimate' });
      if (d.deviceId === currentDevId) {
        myServerTime = d.lastSeenServer?.toMillis?.() || 
          (d.lastSeenServer?.seconds ? d.lastSeenServer.seconds * 1000 : 0) || 
          d.lastSeenMs || 0;
      }
    }
    const referenceTime = myServerTime > 0 ? myServerTime : now;

    // Map by physical device ID (or uid if deviceId missing) to deduplicate devices
    const deviceMap = new Map<string, PresenceDevice & { id: string; peerTime: number }>();
    const toPurgeDocIds: string[] = [];

    for (const docSnap of docs) {
      const raw = docSnap.data({ serverTimestamps: 'estimate' });
      const data = { id: docSnap.id, ...raw } as PresenceDevice & { id: string };

      // Ignore this exact same browser instance
      if (data.deviceId && data.deviceId === currentDevId) continue;
      if (!data.deviceId && data.uid === currentUid) continue;

      // Skip explicitly offline
      if (data.status === 'offline') {
        toPurgeDocIds.push(docSnap.id);
        continue;
      }

      const peerTime = data.lastSeenServer?.toMillis?.() || 
        (data.lastSeenServer?.seconds ? data.lastSeenServer.seconds * 1000 : 0) || 
        data.lastSeenMs || 
        (data.lastSeen ? new Date(data.lastSeen).getTime() : 0);

      // If timestamp is 0, NaN, or completely missing -> stale legacy record -> purge
      if (!peerTime || isNaN(peerTime)) {
        toPurgeDocIds.push(docSnap.id);
        continue;
      }

      const diff = Math.abs(referenceTime - peerTime);

      // Fast Heartbeat interval is 7s. If no heartbeat for > 25s, the device has closed the tab or disconnected -> OFFLINE!
      if (diff > 25000) {
        toPurgeDocIds.push(docSnap.id);
        continue;
      }

      // Valid online device: deduplicate by deviceId or uid
      const key = data.deviceId || data.uid;
      const existing = deviceMap.get(key);
      if (!existing || peerTime > existing.peerTime) {
        if (existing) {
          toPurgeDocIds.push(existing.id);
        }
        deviceMap.set(key, { ...data, peerTime });
      } else {
        toPurgeDocIds.push(docSnap.id);
      }
    }

    // Auto-clean dead records from Firestore
    toPurgeDocIds.forEach((id) => {
      deleteDoc(doc(db, 'presence', id)).catch(() => {});
    });

    const liveDevices: PresenceDevice[] = [];
    deviceMap.forEach((data) => {
      if (data.uid === currentUid) {
        liveDevices.push({
          ...data,
          displayName: `${data.displayName} (Thiết bị khác của bạn)`
        });
      } else {
        liveDevices.push(data);
      }
    });

    return { liveDevices, toPurgeDocIds };
  };

  // Real-time listener for online presence across Internet
  useEffect(() => {
    if (!currentUser) return;

    const currentDevId = getClientDeviceId();
    const presenceRef = collection(db, 'presence');

    const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
      latestPresenceDocsRef.current = snapshot.docs;
      const { liveDevices } = processPresenceDocs(snapshot.docs, currentDevId, currentUser.uid);

      setOnlineDevices((prev) => {
        if (prev.length === liveDevices.length) {
          const isIdentical = prev.every((p, i) => 
            p.uid === liveDevices[i]?.uid &&
            p.deviceId === liveDevices[i]?.deviceId &&
            p.displayName === liveDevices[i]?.displayName &&
            p.deviceName === liveDevices[i]?.deviceName &&
            p.deviceType === liveDevices[i]?.deviceType &&
            p.avatarColor === liveDevices[i]?.avatarColor &&
            p.customAvatarUrl === liveDevices[i]?.customAvatarUrl &&
            p.connectCode === liveDevices[i]?.connectCode &&
            p.status === liveDevices[i]?.status
          );
          if (isIdentical) return prev;
        }
        return liveDevices;
      });
    }, (error) => {
      console.warn('Presence listener notice:', error);
    });

    // 2-second high-precision freshness ticker: automatically syncs devices in real-time without delay
    const tickerInterval = setInterval(() => {
      if (latestPresenceDocsRef.current.length > 0) {
        const { liveDevices } = processPresenceDocs(latestPresenceDocsRef.current, currentDevId, currentUser.uid);
        setOnlineDevices((prev) => {
          if (prev.length === liveDevices.length) {
            const isIdentical = prev.every((p, i) => 
              p.uid === liveDevices[i]?.uid &&
              p.deviceId === liveDevices[i]?.deviceId &&
              p.displayName === liveDevices[i]?.displayName &&
              p.deviceName === liveDevices[i]?.deviceName &&
              p.deviceType === liveDevices[i]?.deviceType &&
              p.avatarColor === liveDevices[i]?.avatarColor &&
              p.customAvatarUrl === liveDevices[i]?.customAvatarUrl &&
              p.connectCode === liveDevices[i]?.connectCode &&
              p.status === liveDevices[i]?.status
            );
            if (isIdentical) return prev;
          }
          return liveDevices;
        });
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(tickerInterval);
    };
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

  // Global paste handler: allows Ctrl+V anywhere on the Send view
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // If user is typing inside an input/textarea element, let the element handle it natively
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.clipboardData) {
        // 1. Check for files / images first
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          handleFilesAdded(e.clipboardData.files);
          setMode('file');
          setStatusMessage(`📋 Đã nhận ${e.clipboardData.files.length} tệp từ phím tắt Ctrl+V.`);
          setTimeout(() => setStatusMessage(null), 3500);
          return;
        }

        // 2. Check for text
        const text = e.clipboardData.getData('text');
        if (text && text.trim()) {
          e.preventDefault();
          setTextContent(text);
          setMode('text');
          setStatusMessage('📋 Đã nhận văn bản từ phím tắt Ctrl+V.');
          setTimeout(() => setStatusMessage(null), 3500);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

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

  // Handle Paste from Clipboard (Images, Files or Text)
  const handlePasteAction = async () => {
    // Check if Clipboard API is supported
    if (!navigator.clipboard) {
      setStatusMessage('ℹ️ Trình duyệt chưa hỗ trợ đọc trực tiếp. Bạn hãy nhấn phím Ctrl + V để dán ngay.');
      setTimeout(() => setStatusMessage(null), 4500);
      return;
    }

    try {
      // 1. Try reading rich media (images / files)
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          const files: File[] = [];
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/') || type.startsWith('application/')) {
                const blob = await item.getType(type);
                const ext = type.split('/')[1]?.split('+')[0] || 'png';
                const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type });
                files.push(file);
              }
            }
          }
          if (files.length > 0) {
            handleFilesAdded(files);
            setMode('file');
            setStatusMessage(`📋 Đã dán thành công ${files.length} ảnh/tệp từ bộ nhớ tạm!`);
            setTimeout(() => setStatusMessage(null), 3500);
            return;
          }
        } catch (mediaErr: any) {
          console.log('Clipboard rich media read notice:', mediaErr?.message);
        }
      }

      // 2. Try reading plain text / code
      if (navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setTextContent(text);
          setMode('text');
          setStatusMessage('📋 Đã dán thành công nội dung văn bản từ bộ nhớ tạm!');
          setTimeout(() => setStatusMessage(null), 3500);
          return;
        }
      }

      setStatusMessage('⚠️ Bộ nhớ tạm hiện đang trống. Hãy sao chép nội dung rồi nhấn Dán hoặc Ctrl+V.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.warn('Clipboard read permission error:', err);
      // Detailed explanation for why the browser prevented reading
      if (err?.name === 'NotAllowedError') {
        setStatusMessage('🔒 Trình duyệt đã chặn quyền đọc bộ nhớ tạm. Hãy chọn "Cho phép" (Allow) trên thanh địa chỉ, hoặc bấm Ctrl+V để dán trực tiếp.');
      } else {
        setStatusMessage('💡 Nhấn phím Ctrl + V (hoặc Cmd + V) trên bàn phím để dán nội dung ngay lập tức.');
      }
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Text Modal Handlers (Nhập tin nhắn modal matching Image 1)
  const handleOpenTextModal = (initialText?: string, targetDevice?: PresenceDevice) => {
    setModalTextValue(initialText !== undefined ? initialText : textContent);
    if (targetDevice) {
      setTargetDeviceForQuickChoice(targetDevice);
    }
    setIsTextModalOpen(true);
  };

  const handleConfirmTextModal = () => {
    const clean = modalTextValue.trim();
    setTextContent(modalTextValue);
    setIsTextModalOpen(false);

    if (targetDeviceForQuickChoice && clean) {
      sendDirectTextToPeer(targetDeviceForQuickChoice, modalTextValue);
      setTargetDeviceForQuickChoice(null);
    } else if (clean) {
      setStatusMessage('✓ Đã chuẩn bị tin nhắn văn bản. Chọn thiết bị bên dưới để gửi!');
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  // Direct send text to a target peer
  const sendDirectTextToPeer = async (target: PresenceDevice, textToSend: string) => {
    if (!currentUser || !textToSend.trim()) return;

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
        textContent: censorProfanity(textToSend.trim()).cleanText
      };
      await addDoc(collection(db, 'transfers'), payload);

      if (settings.soundEnabled) {
        playSendSound();
      }

      setTransferStatus(prev => ({ ...prev, [target.uid]: 'success' }));
      setStatusMessage(`Đã gửi tin nhắn thành công đến ${target.deviceName}!`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error('Send text error:', err);
      setTransferStatus(prev => ({ ...prev, [target.uid]: 'error' }));
      setStatusMessage('Lỗi khi gửi tin nhắn. Vui lòng thử lại.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setSendingTargetId(null);
      setTimeout(() => {
        setTransferStatus(prev => ({ ...prev, [target.uid]: 'idle' }));
      }, 3000);
    }
  };

  // Check if content is ready or open quick choice modal
  const handleDeviceClick = (target: PresenceDevice) => {
    const hasFiles = selectedFiles.length > 0;
    const hasText = textContent.trim().length > 0;

    if (!hasFiles && !hasText) {
      setTargetDeviceForQuickChoice(target);
      setShowQuickChoiceModal(true);
      return;
    }

    sendToPeer(target);
  };

  // Perform send to target device (files, text, or both)
  const sendToPeer = async (target: PresenceDevice) => {
    if (!currentUser) return;
    const hasFiles = selectedFiles.length > 0;
    const hasText = textContent.trim().length > 0;

    if (!hasFiles && !hasText) {
      setStatusMessage('Vui lòng chọn tệp tin hoặc nhập văn bản cần gửi.');
      return;
    }

    setSendingTargetId(target.uid);
    setTransferStatus(prev => ({ ...prev, [target.uid]: 'sending' }));
    setStatusMessage(null);

    try {
      if (hasFiles) {
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
              // Fail-safe for any file type under 850KB (documents, code, text, etc.)
              if (!directData && item.file.size < 850 * 1024) {
                try {
                  directData = await fileToBase64(item.file);
                } catch (b64Err) {
                  console.warn('File to base64 fallback failed:', b64Err);
                }
              }

              if (directData && directData.length < 900 * 1024) {
                serverThumbnail = directData;
                fileUrl = '';
              } else {
                throw new Error(
                  uploadErr?.message || 
                  `Không thể gửi tệp "${item.name}". Máy chủ lưu trữ đang khởi động hoặc đường truyền mạng bị gián đoạn. Vui lòng thử lại.`
                );
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
      }

      if (hasText) {
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
      const msgDesc = hasFiles && hasText
        ? `Đã chuyển thành công ${selectedFiles.length} tệp & tin nhắn đến ${target.deviceName}!`
        : hasFiles
        ? `Đã chuyển thành công ${selectedFiles.length} tệp đến ${target.deviceName}!`
        : `Đã gửi tin nhắn thành công đến ${target.deviceName}!`;
      setStatusMessage(msgDesc);

      // Clear/Reset selection when sent successfully
      setSelectedFiles([]);
      setTextContent('');
      setFileThumbnails({});
      setUploadProgress(null);
      setUploadProgressText(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';

      setTimeout(() => {
        setTransferStatus(prev => ({ ...prev, [target.uid]: 'idle' }));
        setSendingTargetId(null);
      }, 3000);
    } catch (error: any) {
      console.error('Send error:', error);
      setTransferStatus(prev => ({ ...prev, [target.uid]: 'error' }));
      setStatusMessage(error?.message || 'Lỗi khi tải hoặc gửi dữ liệu. Vui lòng thử lại.');
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

  // Manual Re-scan & Cache Purge:
  // Immediately emits fresh heartbeat, bypasses cache to fetch fresh records directly from server,
  // cleans up dead/stale offline devices, and updates the online list!
  const handleRescan = async () => {
    if (!currentUser || isRescanning) return;
    setIsRescanning(true);

    try {
      // 1. Immediately emit heartbeat for our device
      if (updatePresence) {
        await updatePresence(currentUser.uid);
      }

      // 2. Fetch fresh presence records directly from Firestore Server (bypass client cache)
      const presenceRef = collection(db, 'presence');
      let snap;
      try {
        snap = await getDocsFromServer(presenceRef);
      } catch {
        snap = await getDocs(presenceRef);
      }

      latestPresenceDocsRef.current = snap.docs;
      const currentDevId = getClientDeviceId();
      const { liveDevices, toPurgeDocIds } = processPresenceDocs(snap.docs, currentDevId, currentUser.uid);

      // Await purging of dead records from server
      if (toPurgeDocIds.length > 0) {
        await Promise.all(
          toPurgeDocIds.map((id) => deleteDoc(doc(db, 'presence', id)).catch(() => {}))
        );
      }

      setOnlineDevices(liveDevices);
      setStatusMessage(
        liveDevices.length > 0 
          ? `Đã cập nhật: Phát hiện ${liveDevices.length} thiết bị đang trực tuyến${toPurgeDocIds.length > 0 ? ` (đã dọn ${toPurgeDocIds.length} thiết bị cũ)` : ''}.` 
          : `Đã cập nhật: Hiện không có thiết bị nào khác trực tuyến${toPurgeDocIds.length > 0 ? ` (đã dọn dẹp ${toPurgeDocIds.length} thiết bị cũ đã tắt)` : ''}.`
      );
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.warn('Rescan error:', err);
    } finally {
      setTimeout(() => setIsRescanning(false), 500);
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

  const myDeviceId = getClientDeviceId();
  const myConnectCode = myDeviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();

  const [isSearchingCode, setIsSearchingCode] = useState(false);

  // Directly connect to any peer across internet by their 6-digit Connect Code
  const handleDirectCodeConnect = async (codeToSearch?: string) => {
    const rawCode = (codeToSearch || searchQuery).trim().toUpperCase().replace('#', '');
    if (!rawCode || isSearchingCode) return;
    setIsSearchingCode(true);

    try {
      const q = query(collection(db, 'presence'), where('connectCode', '==', rawCode));
      let snap;
      try {
        snap = await getDocsFromServer(q);
      } catch {
        snap = await getDocs(q);
      }

      if (snap.empty) {
        setStatusMessage(`Không tìm thấy thiết bị nào với mã #${rawCode}. Vui lòng kiểm tra lại mã trên máy người nhận.`);
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        const foundDoc = snap.docs[0];
        const data = { id: foundDoc.id, ...foundDoc.data({ serverTimestamps: 'estimate' }) } as unknown as PresenceDevice;
        if (data.deviceId === getClientDeviceId()) {
          setStatusMessage('Đây là mã ghép của chính thiết bị hiện tại của bạn!');
          setTimeout(() => setStatusMessage(null), 4000);
        } else {
          setOnlineDevices((prev) => {
            if (prev.some(d => d.uid === data.uid || (d.deviceId && d.deviceId === data.deviceId))) {
              return prev;
            }
            return [data, ...prev];
          });
          setStatusMessage(`Đã kết nối thành công với "${data.deviceName}" (${data.displayName})! Nhấn nút "Gửi đến thiết bị này" bên dưới để chuyển tệp.`);
          setTimeout(() => setStatusMessage(null), 6000);
        }
      }
    } catch (e) {
      console.warn('Direct code connect error:', e);
    } finally {
      setIsSearchingCode(false);
    }
  };

  const filteredDevices = onlineDevices.filter(d => 
    d.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.connectCode && d.connectCode.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* Your Device Online Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md ring-2 ring-emerald-500/20 overflow-hidden relative"
            style={{ backgroundColor: settings.avatarColor || '#10B981' }}
          >
            {activeAvatarUrl ? (
              <img 
                src={activeAvatarUrl} 
                alt={currentUser?.displayName || 'Avatar'} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              renderDeviceIcon(settings.deviceType)
            )}
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
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-emerald-500/30" title="Mã ghép nhanh 6 số của thiết bị này để máy khác kết nối ngay">
                <span className="text-slate-400 font-sans">Mã ghép:</span>
                <strong>{myConnectCode}</strong>
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              Đang phát sóng trên Cloud Relay • Người khác có thể tìm thấy tên hoặc nhập mã <strong>{myConnectCode}</strong> để gửi tệp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <span>Tài khoản:</span>
          <span className="font-semibold text-white">{currentUser?.displayName || currentUser?.email?.split('@')[0]}</span>
        </div>
      </div>

      {/* Top Bar / Content Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-400" />
              Nội dung cần gửi
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chọn tệp từ máy, kho Cloud hoặc văn bản để truyền tới các thiết bị khác
            </p>
          </div>
        </div>

        {/* Unified Content Dropzone / Queue */}
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
          {/* Folder input for full directories */}
          <input
            type="file"
            multiple
            ref={folderInputRef}
            {...({ webkitdirectory: "", directory: "" } as any)}
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
            onClick={() => selectedFiles.length === 0 && !textContent.trim() && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-4 sm:p-6 transition-all ${
              isDragOver
                ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                : (selectedFiles.length > 0 || textContent.trim().length > 0)
                ? 'border-emerald-500/60 bg-emerald-500/5 cursor-default'
                : 'border-slate-700/80 hover:border-emerald-500/50 bg-slate-950/40 hover:bg-slate-950/60 cursor-pointer'
            }`}
          >
            {(selectedFiles.length > 0 || textContent.trim().length > 0) ? (
              <div className="space-y-3">
                {/* Header info bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Files className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-white block">
                        Đã chọn {selectedFiles.length > 0 ? `${selectedFiles.length} tệp tin` : ''}
                        {selectedFiles.length > 0 && textContent.trim() ? ' & ' : ''}
                        {textContent.trim() ? '1 tin nhắn văn bản' : ''}
                      </span>
                      <span className="text-xs text-slate-400">
                        {selectedFiles.length > 0 && `Tổng: ${formatFileSize(selectedFiles.reduce((acc, f) => acc + f.size, 0))} • `}Sẵn sàng gửi
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
                        handleOpenTextModal(textContent);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <AlignLeft className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{textContent.trim() ? 'Sửa văn bản' : 'Viết văn bản'}</span>
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

                {/* Text Message Card if text is entered */}
                {textContent.trim().length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-left hover:border-slate-700 transition-all space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                          <AlignLeft className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block">Tin nhắn văn bản</span>
                          <span className="text-[11px] text-slate-400 block">
                            {textContent.split(/\s+/).filter(Boolean).length} từ • {textContent.length} ký tự
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Chỉnh sửa tin nhắn này"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTextModal(textContent);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3 h-3 text-sky-400" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          title="Xóa tin nhắn này"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTextContent('');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs text-slate-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-32 overflow-y-auto scrollbar-thin font-mono leading-relaxed">
                      {textContent}
                    </div>

                    {/* Detected links preview */}
                    {extractUrls(textContent).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                          <Globe className="w-3 h-3" /> Link:
                        </span>
                        {extractUrls(textContent).map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 underline font-semibold max-w-[200px] truncate"
                          >
                            <span>{url}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Files List / Cards */}
                {selectedFiles.length > 0 && (
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
                )}

                <p className="text-xs text-emerald-400 font-medium text-center pt-1">
                  ✓ Chọn thiết bị ở danh sách bên dưới và nhấn "Gửi đến thiết bị này" để truyền
                </p>
              </div>
            ) : (
              /* Empty state matching the user's design specification (Hình 3) */
              <div className="py-2 sm:py-3 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Lựa chọn
                  </h3>
                </div>

                {/* 4 Square/Rounded Action Cards as shown in Hình 3 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {/* 1. Tập tin */}
                  <button
                    id="pick-file-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="p-5 sm:p-6 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all active:scale-95 shadow-md group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-700/50 group-hover:bg-emerald-500/20 flex items-center justify-center text-slate-200 group-hover:text-emerald-400 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white">
                      Tập tin
                    </span>
                  </button>

                  {/* 2. Thư mục */}
                  <button
                    id="pick-folder-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                    className="p-5 sm:p-6 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all active:scale-95 shadow-md group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-700/50 group-hover:bg-amber-500/20 flex items-center justify-center text-slate-200 group-hover:text-amber-400 transition-colors">
                      <Folder className="w-5 h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white">
                      Thư mục
                    </span>
                  </button>

                  {/* 3. Văn bản -> opens Text Modal (Image 1) */}
                  <button
                    id="pick-text-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTextModal();
                    }}
                    className="p-5 sm:p-6 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all active:scale-95 shadow-md group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-700/50 group-hover:bg-sky-500/20 flex items-center justify-center text-slate-200 group-hover:text-sky-400 transition-colors">
                      <AlignLeft className="w-5 h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white">
                      Văn bản
                    </span>
                  </button>

                  {/* 4. Dán */}
                  <button
                    id="pick-paste-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePasteAction();
                    }}
                    className="p-5 sm:p-6 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all active:scale-95 shadow-md group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-700/50 group-hover:bg-teal-500/20 flex items-center justify-center text-slate-200 group-hover:text-teal-400 transition-colors">
                      <Clipboard className="w-5 h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white">
                      Dán
                    </span>
                  </button>
                </div>

                {/* Dropzone helper & Cloud picker */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-400">
                  <span className="text-slate-500">
                    💡 Bạn cũng có thể kéo thả trực tiếp tệp tin hoặc thư mục vào đây
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCloudPickerOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Cloud className="w-3.5 h-3.5 text-sky-400" />
                    <span>Chọn từ Kho Cloud</span>
                  </button>
                </div>
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

          {/* Search bar & Refresh */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleRescan}
              disabled={isRescanning}
              title="Cập nhật & Quét lại các thiết bị trực tuyến (loại bỏ thiết bị đã tắt)"
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">{isRescanning ? 'Đang quét...' : 'Quét lại'}</span>
            </button>
            <div className="relative flex-1 sm:w-72 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim().length >= 4) {
                      e.preventDefault();
                      handleDirectCodeConnect();
                    }
                  }}
                  placeholder="Tìm tên hoặc nhập mã 6 số..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              {searchQuery.trim().length >= 4 && (
                <button
                  type="button"
                  onClick={() => handleDirectCodeConnect()}
                  disabled={isSearchingCode}
                  title="Tìm và kết nối trực tiếp đến mã này trên Cloud"
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSearchingCode ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Radio className="w-3 h-3" />
                  )}
                  <span>Ghép mã</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Devices Grid (LocalSend style) */}
        {filteredDevices.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 sm:p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 text-slate-400 mx-auto flex items-center justify-center animate-pulse">
              <Radio className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Đang dò tìm thiết bị trên mạng...</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Chưa có thiết bị nào khác đang trực tuyến hoặc phù hợp với tìm kiếm của bạn.
              </p>
            </div>
            
            {/* School Network Tips */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 max-w-lg mx-auto text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Mẹo kết nối nhanh trên máy trường học:</span>
              </div>
              <ul className="text-slate-300 space-y-1 list-disc list-inside text-[11px] leading-relaxed">
                <li>Đảm bảo máy bạn bè bên cạnh đã <strong>đăng nhập</strong> tài khoản vào CloudSend.</li>
                <li>Hỏi bạn bè <strong>Mã ghép 6 số</strong> ở banner trên cùng và gõ vào ô tìm kiếm ở trên.</li>
                <li>Nếu mạng trường chặn kết nối ngang hàng (P2P), cả 2 bạn hãy chuyển sang tab <strong>"Phòng Chat"</strong> (Đại Sảnh Toàn Cầu) để gửi tệp và ảnh trực tiếp không giới hạn!</li>
              </ul>
            </div>
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
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md group-hover:scale-105 transition-transform overflow-hidden relative"
                      style={{ backgroundColor: device.avatarColor || '#10B981' }}
                    >
                      {device.customAvatarUrl ? (
                        <img 
                          src={device.customAvatarUrl} 
                          alt={device.displayName || 'Device'} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        renderDeviceIcon(device.deviceType)
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-white truncate">
                          {device.deviceName}
                        </h4>
                        {device.connectCode && (
                          <span className="text-[10px] font-mono text-emerald-300 bg-slate-950 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            #{device.connectCode}
                          </span>
                        )}
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
                      onClick={() => handleDeviceClick(device)}
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

      {/* Quick Choice Modal when clicking an online device without pre-selected content */}
      {showQuickChoiceModal && targetDeviceForQuickChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gửi tới {targetDeviceForQuickChoice.deviceName}</h3>
                  <p className="text-xs text-slate-400">Chọn loại nội dung bạn muốn gửi:</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuickChoiceModal(false);
                  setTargetDeviceForQuickChoice(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 Cards matching Hình 3 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 1. Tập tin */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickChoiceModal(false);
                  fileInputRef.current?.click();
                }}
                className="p-4 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-95 group shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-emerald-500/20 flex items-center justify-center text-slate-200 group-hover:text-emerald-400 transition-colors">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Tập tin
                </span>
              </button>

              {/* 2. Thư mục */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickChoiceModal(false);
                  folderInputRef.current?.click();
                }}
                className="p-4 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-95 group shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-amber-500/20 flex items-center justify-center text-slate-200 group-hover:text-amber-400 transition-colors">
                  <Folder className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Thư mục
                </span>
              </button>

              {/* 3. Văn bản */}
              <button
                type="button"
                onClick={() => {
                  const target = targetDeviceForQuickChoice;
                  setShowQuickChoiceModal(false);
                  handleOpenTextModal('', target || undefined);
                }}
                className="p-4 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-95 group shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-sky-500/20 flex items-center justify-center text-slate-200 group-hover:text-sky-400 transition-colors">
                  <AlignLeft className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Văn bản
                </span>
              </button>

              {/* 4. Dán */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickChoiceModal(false);
                  handlePasteAction();
                }}
                className="p-4 rounded-2xl bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-95 group shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-teal-500/20 flex items-center justify-center text-slate-200 group-hover:text-teal-400 transition-colors">
                  <Clipboard className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                  Dán
                </span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowQuickChoiceModal(false);
                  setIsCloudPickerOpen(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Chọn từ Kho Cloud Drive</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Message Input Modal (Image 1) */}
      {isTextModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            setIsTextModalOpen(false);
            setTargetDeviceForQuickChoice(null);
          }}
        >
          <div 
            className="bg-[#181e29] border border-slate-700/60 rounded-[26px] p-6 w-full max-w-sm sm:max-w-md shadow-2xl space-y-4 text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
              Nhập tin nhắn
            </h3>

            {/* Input area with animated gliding caret and WYSIWYG Ctrl+B / Ctrl+I formatting */}
            <div className="rounded-xl overflow-hidden bg-[#242b3b] border border-slate-700/60 focus-within:border-sky-400/80 focus-within:ring-2 focus-within:ring-sky-400/20 transition-all">
              <RichChatInput
                id="modal-message-input"
                value={modalTextValue}
                onChange={(md) => setModalTextValue(md)}
                onSend={handleConfirmTextModal}
                enterKeyMode="newline"
                placeholder="Nhập tin nhắn... (Bôi đen & Ctrl+B để in đậm, Ctrl+I để in nghiêng)"
                className="bg-transparent border-0 min-h-[90px]"
              />
            </div>

            {/* Actions: Thoát & Xác nhận (styled precisely like Image 1) */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsTextModalOpen(false);
                  setTargetDeviceForQuickChoice(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Thoát
              </button>
              <button
                type="button"
                onClick={handleConfirmTextModal}
                className="px-6 py-2 rounded-full bg-[#9fc5f8] hover:bg-[#b8d5fb] active:scale-95 text-slate-900 text-sm font-semibold shadow-md transition-all cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
