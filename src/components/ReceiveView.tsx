import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { DirectTransfer, DeviceType } from '../types';
import { 
  Download, 
  FileText, 
  Check, 
  X, 
  Copy, 
  Clock, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Tablet, 
  Radio, 
  Eye, 
  Trash2,
  CheckCircle2,
  Share2,
  Sparkles,
  Tv,
  Sliders,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Cloud,
  Database,
  Save,
  HardDrive,
  Filter,
  Search,
  FileCheck,
  CheckCheck,
  Layers,
  Inbox,
  ArrowDownCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playReceiveSound } from '../utils/sound';
import { isImageFile } from '../utils/fileUpload';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';
import { extractUrls, hasUrls, renderClickableText } from '../utils/textFormat';
import { downloadFileSafely } from '../utils/fileDownload';

type ReceiveCategoryTab = 'all' | 'files' | 'text' | 'saved_cloud' | 'pending';

function getFileCategory(mimeType: string, fileName: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (mimeType.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return 'video';
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('document') || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'document';
  return 'other';
}

export const ReceiveView: React.FC = () => {
  const { currentUser, settings, updateSettings } = useAuth();
  const [transfers, setTransfers] = useState<DirectTransfer[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Record<string, 'downloading' | 'done'>>({});
  const [savedCloudIds, setSavedCloudIds] = useState<Record<string, 'saving' | 'saved'>>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isSavingAllToCloud, setIsSavingAllToCloud] = useState(false);
  
  // Tab Management in ReceiveView
  const [activeTab, setActiveTab] = useState<ReceiveCategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auto-save toggle state (persisted locally)
  const [autoSaveToCloud, setAutoSaveToCloud] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('cloudsend_auto_save_cloud') === 'true';
  });

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const toggleAutoSaveToCloud = (enabled: boolean) => {
    setAutoSaveToCloud(enabled);
    localStorage.setItem('cloudsend_auto_save_cloud', enabled ? 'true' : 'false');
    showToast(
      enabled 
        ? '⚡ Đã BẬT tính năng Tự động lưu mọi tệp nhận vào Kho Cloud!' 
        : 'Đã tắt tính năng tự động lưu vào Kho Cloud.',
      'info'
    );
  };

  // Helper for Toast alerts
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Listen to transfers directed to this user
  useEffect(() => {
    if (!currentUser) return;

    const transfersRef = collection(db, 'transfers');
    const q = query(
      transfersRef, 
      where('receiverId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: DirectTransfer[] = [];
      let hasNewPending = false;

      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as DirectTransfer;
        items.push(data);
        if (data.status === 'pending') {
          hasNewPending = true;
          // If autoAccept is enabled, automatically mark as accepted
          if (settings.autoAccept) {
            updateDoc(doc(db, 'transfers', docSnap.id), { status: 'completed' }).catch(console.error);
          }
        }
      });

      // Sort descending by createdAt
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (hasNewPending && settings.soundEnabled) {
        playReceiveSound();
      }

      setTransfers(items);
    }, (err) => {
      console.warn('Transfers listener notice:', err);
    });

    return () => unsubscribe();
  }, [currentUser, settings.autoAccept, settings.soundEnabled]);

  // Handle Accept
  const handleAccept = async (id: string) => {
    try {
      await updateDoc(doc(db, 'transfers', id), { status: 'completed' });
      if (settings.soundEnabled) {
        playReceiveSound();
      }
      showToast('Đã chấp nhận tệp gửi đến!', 'success');
    } catch (err) {
      console.error('Accept transfer error:', err);
    }
  };

  // Handle Decline
  const handleDecline = async (id: string) => {
    try {
      await updateDoc(doc(db, 'transfers', id), { status: 'declined' });
      showToast('Đã từ chối tệp gửi đến.', 'info');
    } catch (err) {
      console.error('Decline transfer error:', err);
    }
  };

  // Handle Delete Single
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transfers', id));
      showToast('Đã xóa mục khỏi lịch sử nhận.', 'info');
    } catch (err) {
      console.error('Delete transfer error:', err);
    }
  };

  // Handle Clear All
  const handleClearAllTransfers = async () => {
    if (!currentUser || transfers.length === 0) return;
    setIsClearingAll(true);
    try {
      const batch = writeBatch(db);
      transfers.forEach((item) => {
        const docRef = doc(db, 'transfers', item.id);
        batch.delete(docRef);
      });
      await batch.commit();
      setShowClearConfirm(false);
      showToast('Đã xóa sạch toàn bộ lịch sử nhận tệp!', 'success');
    } catch (err: any) {
      showToast(`Không thể xóa: ${err?.message || 'Thử lại sau'}`, 'error');
    } finally {
      setIsClearingAll(false);
    }
  };

  // Handle Copy Text
  const handleCopyText = (id: string, text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Đã sao chép nội dung vào bộ nhớ tạm!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Handle Download File Safely
  const handleDownloadFile = async (item: DirectTransfer) => {
    const fileSource = item.fileUrl || item.fileData;
    if (!fileSource) return;
    const name = item.fileName || 'cloudsend-file';

    setDownloadingIds(prev => ({ ...prev, [item.id]: 'downloading' }));
    const success = await downloadFileSafely(fileSource, name);
    if (success) {
      setDownloadingIds(prev => ({ ...prev, [item.id]: 'done' }));
      showToast(`Đã tải xuống "${name}" thành công!`, 'success');
      setTimeout(() => {
        setDownloadingIds(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }, 2500);
    } else {
      setDownloadingIds(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  // Save single item to Cloud Drive
  const handleSaveToCloudDrive = async (item: DirectTransfer) => {
    if (!currentUser) {
      showToast('Vui lòng đăng nhập để lưu tệp vào Kho Cloud.', 'error');
      return;
    }

    setSavedCloudIds(prev => ({ ...prev, [item.id]: 'saving' }));

    try {
      const docId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const fileName = item.fileName || (item.textContent ? `Van_ban_${Date.now()}.txt` : 'tep_nhan.bin');
      const fileType = item.fileType || (item.textContent ? 'text/plain' : 'application/octet-stream');
      const category = getFileCategory(fileType, fileName);

      let fileUrl = item.fileUrl || item.fileData || '';
      let fileViewUrl = item.fileUrl ? item.fileUrl.replace('/api/files/download/', '/api/files/view/') : fileUrl;

      // For text snippets, create safe text data URL
      if (!item.fileUrl && !item.fileData && item.textContent) {
        fileUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(item.textContent)}`;
        fileViewUrl = fileUrl;
      }

      // Safety guard: ensure no gigantic strings are stored in Firestore properties
      const safeUrl = (fileUrl && fileUrl.length < 700000) ? fileUrl : '';
      const safeViewUrl = (fileViewUrl && fileViewUrl.length < 700000) ? fileViewUrl : safeUrl;
      const safeThumbnail = (item.fileData && item.fileData.length < 500000) ? item.fileData : null;

      await setDoc(doc(db, 'cloud_files', docId), {
        id: docId,
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: currentUser.displayName || settings.deviceName || 'Người dùng',
        name: fileName,
        size: item.fileSize || (item.textContent ? item.textContent.length : 0),
        type: fileType,
        url: safeUrl,
        viewUrl: safeViewUrl,
        thumbnail: safeThumbnail,
        category: category,
        isFavorite: false,
        createdAt: new Date().toISOString()
      });

      setSavedCloudIds(prev => ({ ...prev, [item.id]: 'saved' }));
      showToast(`✨ Đã lưu "${fileName}" vào Kho Cloud thành công!`, 'success');
    } catch (err: any) {
      console.error('Save to cloud error:', err);
      setSavedCloudIds(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      showToast(`Lỗi khi lưu vào Cloud: ${err.message || 'Thử lại sau'}`, 'error');
    }
  };

  // Save all items to Cloud Drive
  const handleSaveAllToCloudDrive = async () => {
    if (!currentUser) {
      showToast('Vui lòng đăng nhập để lưu vào Kho Cloud.', 'error');
      return;
    }
    if (transfers.length === 0) return;

    setIsSavingAllToCloud(true);
    let successCount = 0;

    try {
      for (const item of transfers) {
        if (savedCloudIds[item.id] === 'saved') continue;
        const docId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const fileName = item.fileName || (item.textContent ? `Van_ban_${Date.now()}.txt` : 'tep_nhan.bin');
        const fileType = item.fileType || (item.textContent ? 'text/plain' : 'application/octet-stream');
        const category = getFileCategory(fileType, fileName);

        let fileUrl = item.fileUrl || item.fileData || '';
        let fileViewUrl = item.fileUrl ? item.fileUrl.replace('/api/files/download/', '/api/files/view/') : fileUrl;

        if (!item.fileUrl && !item.fileData && item.textContent) {
          fileUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(item.textContent)}`;
          fileViewUrl = fileUrl;
        }

        const safeUrl = (fileUrl && fileUrl.length < 700000) ? fileUrl : '';
        const safeViewUrl = (fileViewUrl && fileViewUrl.length < 700000) ? fileViewUrl : safeUrl;
        const safeThumbnail = (item.fileData && item.fileData.length < 500000) ? item.fileData : null;

        await setDoc(doc(db, 'cloud_files', docId), {
          id: docId,
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: currentUser.displayName || settings.deviceName || 'Người dùng',
          name: fileName,
          size: item.fileSize || (item.textContent ? item.textContent.length : 0),
          type: fileType,
          url: safeUrl,
          viewUrl: safeViewUrl,
          thumbnail: safeThumbnail,
          category: category,
          isFavorite: false,
          createdAt: new Date().toISOString()
        });

        setSavedCloudIds(prev => ({ ...prev, [item.id]: 'saved' }));
        successCount++;
      }

      showToast(`✨ Đã lưu tất cả ${successCount} tệp/văn bản vào Kho Cloud thành công!`, 'success');
    } catch (err: any) {
      showToast(`Lỗi khi lưu vào Kho Cloud: ${err.message || 'Thử lại sau'}`, 'error');
    } finally {
      setIsSavingAllToCloud(false);
    }
  };

  // Export history to JSON backup file
  const handleExportHistory = () => {
    if (transfers.length === 0) {
      showToast('Chưa có lịch sử nhận dữ liệu để xuất.', 'info');
      return;
    }

    const historyData = transfers.map((t, idx) => ({
      stt: idx + 1,
      id: t.id,
      fileName: t.fileName || 'Đoạn văn bản',
      fileSize: t.fileSize ? formatFileSize(t.fileSize) : 'N/A',
      fileType: t.fileType || 'text',
      senderName: t.senderName || 'Người gửi ẩn danh',
      senderDevice: t.senderDevice || 'Thiết bị',
      createdAt: t.createdAt,
      status: t.status,
      textContent: t.textContent || '',
      fileUrl: t.fileUrl || ''
    }));

    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_su_nhan_cloudsend_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã sao lưu tệp lịch sử nhận (.json) thành công!', 'success');
  };

  // Filtered transfers by Tab and Search
  const filteredTransfers = useMemo(() => {
    return transfers.filter((item) => {
      // 1. Tab filter
      if (activeTab === 'files') {
        if (!item.fileName && !item.fileUrl && !item.fileData) return false;
      } else if (activeTab === 'text') {
        if (!item.textContent) return false;
      } else if (activeTab === 'saved_cloud') {
        if (savedCloudIds[item.id] !== 'saved') return false;
      } else if (activeTab === 'pending') {
        if (item.status !== 'pending') return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.fileName?.toLowerCase().includes(q);
        const matchText = item.textContent?.toLowerCase().includes(q);
        const matchSender = item.senderName?.toLowerCase().includes(q) || item.senderDevice?.toLowerCase().includes(q);
        if (!matchName && !matchText && !matchSender) return false;
      }

      return true;
    });
  }, [transfers, activeTab, searchQuery, savedCloudIds]);

  // Tab badge counts
  const tabCounts = useMemo(() => {
    return {
      all: transfers.length,
      files: transfers.filter(t => !!(t.fileName || t.fileUrl || t.fileData)).length,
      text: transfers.filter(t => !!t.textContent).length,
      saved_cloud: Object.values(savedCloudIds).filter(v => v === 'saved').length,
      pending: transfers.filter(t => t.status === 'pending').length,
    };
  }, [transfers, savedCloudIds]);

  // Total transferred size calculation
  const totalReceivedBytes = useMemo(() => {
    return transfers.reduce((acc, t) => acc + (t.fileSize || 0), 0);
  }, [transfers]);

  const isTv = settings.deviceType === 'tv' || settings.tvModeEnabled;

  return (
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-150">
      
      {/* Smart TV Leanback Banner */}
      {isTv && (
        <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-teal-500/15 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
                <Tv className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
                    Chế độ Smart TV (Truyền hình thông minh)
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Đã tối ưu DPI
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  Đã tự động tăng kích thước hiển thị chống mỏi mắt. Mở CloudSend trên Điện thoại/Máy tính và chọn <strong className="text-emerald-400">"{settings.deviceName}"</strong> để gửi ảnh, video hoặc tệp lên TV này.
                </p>
              </div>
            </div>

            {/* TV DPI Quick Zoom Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 self-start sm:self-auto shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-amber-400" />
                DPI TV:
              </span>
              {[
                { scale: 1.25, label: '125%' },
                { scale: 1.4, label: '140%' },
                { scale: 1.5, label: '150%' },
                { scale: 1.75, label: '175%' },
                { scale: 2.0, label: '200%' },
              ].map(({ scale, label }) => {
                const isSelected = Math.abs((settings.tvDpiScale || 1.4) - scale) < 0.05;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => updateSettings({ tvDpiScale: scale, tvModeEnabled: true })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-3 flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              🎮 <strong>Điều khiển từ xa (Remote):</strong> Dùng phím Mũi tên [⬅️ ➡️] chuyển Tab, [OK] chọn nút, [Back] quay lại.
            </span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              ⚡ Tự động nhận tệp (Auto Accept) đang bật cho TV.
            </span>
          </div>
        </div>
      )}

      {/* Ready to Receive Status Card & Storage Quick Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl relative overflow-hidden space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white shadow-xl shrink-0 ring-2 ring-white/10"
              style={{ backgroundColor: settings.avatarColor }}
            >
              <Download className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                  {settings.deviceName}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Sẵn sàng nhận dữ liệu
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Thiết bị đang trực tuyến. Nhận tệp tin, hình ảnh, video và văn bản tức thời qua máy chủ Relay.
              </p>
            </div>
          </div>

          {/* Quick Storage & Auto Save toggles */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle 1: Auto Accept */}
            <div className="flex items-center gap-3 bg-slate-950/70 p-3 rounded-2xl border border-slate-800/90 shadow-sm">
              <div className="text-left">
                <span className="text-xs font-bold text-white block">Tự động nhận tệp</span>
                <span className="text-[10px] text-slate-400 block">Duyệt tức thì</span>
              </div>
              <button
                id="toggle-quick-save-btn"
                type="button"
                onClick={() => updateSettings({ autoAccept: !settings.autoAccept })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.autoAccept ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.autoAccept ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2: Auto Save to Cloud */}
            <div className="flex items-center gap-3 bg-slate-950/70 p-3 rounded-2xl border border-sky-500/30 shadow-sm">
              <div className="text-left">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  Tự lưu vào Cloud
                </span>
                <span className="text-[10px] text-slate-400 block">Lưu trữ 24/7</span>
              </div>
              <button
                id="toggle-auto-cloud-btn"
                type="button"
                onClick={() => toggleAutoSaveToCloud(!autoSaveToCloud)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoSaveToCloud ? 'bg-sky-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoSaveToCloud ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Live Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block">Tổng mục nhận</span>
            <span className="text-sm font-bold text-white font-mono mt-0.5 block">
              {transfers.length} mục
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block">Tổng dung lượng</span>
            <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
              {formatFileSize(totalReceivedBytes)}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block">Đã lưu Kho Cloud</span>
            <span className="text-sm font-bold text-sky-300 font-mono mt-0.5 block">
              {tabCounts.saved_cloud} tệp
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block">Chờ xử lý</span>
            <span className="text-sm font-bold text-amber-400 font-mono mt-0.5 block">
              {tabCounts.pending} yêu cầu
            </span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200' 
            : toastMessage.type === 'error'
            ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
            : 'bg-slate-900/90 border-slate-700 text-slate-200'
        }`}>
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setToastMessage(null)} 
            className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* TABS & SEARCH BAR (DANH MỤC TAB NHẬN) */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* 5 SUB-TABS LIKE IMAGE */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto no-scrollbar">
            {/* TAB 1: TẤT CẢ */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tất Cả</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'all' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {tabCounts.all}
              </span>
            </button>

            {/* TAB 2: TỆP TIN & ẢNH */}
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'files'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileDocIcon fileName="sample.pdf" size="sm" />
              <span>Tệp & Ảnh</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'files' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {tabCounts.files}
              </span>
            </button>

            {/* TAB 3: VĂN BẢN & LIÊN KẾT */}
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-teal-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Văn Bản & Link</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'text' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {tabCounts.text}
              </span>
            </button>

            {/* TAB 4: ĐÃ LƯU KHO CLOUD */}
            <button
              type="button"
              onClick={() => setActiveTab('saved_cloud')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeTab === 'saved_cloud'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-sky-300 hover:bg-slate-800'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-sky-400" />
              <span>Đã Lưu Cloud</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'saved_cloud' ? 'bg-slate-950/30 text-slate-950' : 'bg-sky-950 text-sky-300 border border-sky-500/30'
              }`}>
                {tabCounts.saved_cloud}
              </span>
            </button>

            {/* TAB 5: CHỜ DUYỆT (NẾU CÓ) */}
            {tabCounts.pending > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'pending'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-amber-400 hover:bg-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Chờ Duyệt</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold bg-amber-500 text-slate-950 animate-pulse">
                  {tabCounts.pending}
                </span>
              </button>
            )}
          </div>

          {/* SEARCH & ACTIONS */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm tệp, người gửi..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* SAVE ALL TO CLOUD BUTTON */}
            {transfers.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleSaveAllToCloudDrive}
                  disabled={isSavingAllToCloud}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-sky-700/60 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all active:scale-95 cursor-pointer"
                  title="Lưu toàn bộ danh sách nhận vào Kho Cloud 24/7"
                >
                  {isSavingAllToCloud ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Lưu Tất Cả Vào Cloud</span>
                    </>
                  )}
                </button>

                {/* EXPORT JSON */}
                <button
                  type="button"
                  onClick={handleExportHistory}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
                  title="Sao lưu dữ liệu lịch sử (.json)"
                >
                  <Database className="w-4 h-4 text-teal-400" />
                </button>

                {/* CLEAR ALL BUTTON */}
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 transition-colors cursor-pointer"
                  title="Xóa tất cả lịch sử nhận"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Confirmation dialog for Clear All */}
        {showClearConfirm && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-200">
                <strong className="text-white block mb-0.5">Xác nhận xóa toàn bộ lịch sử nhận:</strong>
                Hành động này sẽ xóa vĩnh viễn {transfers.length} mục nhận khỏi danh sách. Các tệp đã lưu vào Kho Cloud sẽ không bị ảnh hưởng.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleClearAllTransfers}
                disabled={isClearingAll}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {isClearingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xác Nhận Xóa Hết</span>
              </button>
            </div>
          </div>
        )}

        {/* Transfer Item List */}
        {filteredTransfers.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-10 sm:p-14 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 text-slate-400 mx-auto flex items-center justify-center shadow-inner">
              <Download className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">
                {searchQuery ? 'Không tìm thấy tệp nào phù hợp' : 'Chưa có tệp nào trong danh mục này'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchQuery 
                  ? `Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc để xem toàn bộ danh sách.` 
                  : `Khi ai đó gửi tệp tin hoặc văn bản tới bạn, thông báo và tệp tải về sẽ xuất hiện ở đây ngay lập tức.`}
              </p>
            </div>
            
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-sky-300">
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span>Hỗ trợ lưu dữ liệu & tệp tin trực tiếp vào Kho Cloud an toàn</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredTransfers.map((item) => {
              const isPending = item.status === 'pending';
              const isCompleted = item.status === 'completed';
              const isDeclined = item.status === 'declined';
              const hasFile = !!(item.fileData || item.fileUrl);
              const isImage = (item.fileType?.startsWith('image/') || isImageFile({ name: item.fileName, type: item.fileType })) && hasFile;
              const viewUrl = item.fileUrl ? item.fileUrl.replace('/api/files/download/', '/api/files/view/') : '';
              const imageSrc = item.fileData || viewUrl || item.fileUrl;
              const isSavedInCloud = savedCloudIds[item.id] === 'saved';
              const isSavingInCloud = savedCloudIds[item.id] === 'saving';

              return (
                <div
                  key={item.id}
                  id={`transfer-item-${item.id}`}
                  className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 transition-all shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isPending 
                      ? 'border-emerald-500/50 bg-emerald-500/5' 
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Actual Image Thumbnail or Document Icon */}
                    {isImage ? (
                      <div 
                        onClick={() => imageSrc && setPreviewImage(imageSrc)}
                        className="relative group/thumb cursor-pointer w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shrink-0 shadow-md hover:ring-2 hover:ring-emerald-500 transition-all"
                        title="Nhấn để xem ảnh phóng to"
                      >
                        <img 
                          src={imageSrc} 
                          alt={item.fileName || 'Ảnh'} 
                          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : item.fileName ? (
                      <FileDocIcon fileName={item.fileName} mimeType={item.fileType} size="md" />
                    ) : (
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-800 text-teal-400 flex items-center justify-center shrink-0 border border-slate-700/50">
                        <Copy className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                          {item.fileName || 'Đoạn văn bản / Liên kết'}
                        </span>
                        {item.fileSize && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                            {formatFileSize(item.fileSize)}
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold animate-pulse">
                            Yêu cầu gửi tệp
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Đã nhận
                          </span>
                        )}
                        {isDeclined && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold">
                            Đã từ chối
                          </span>
                        )}
                        {isSavedInCloud && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold flex items-center gap-1">
                            <Cloud className="w-3 h-3 text-sky-400" /> Đã lưu Kho Cloud
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>Từ: <strong className="text-slate-200">{item.senderDevice}</strong> ({item.senderName})</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>

                      {/* Image preview hint if image */}
                      {isImage && imageSrc && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(imageSrc)}
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            Xem ảnh trước khi tải
                          </button>
                        </div>
                      )}

                      {/* Snippet preview if text */}
                      {item.textContent && (
                        <div 
                          className="mt-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed copyable-text select-text cursor-text"
                          data-copyable="true"
                        >
                          {renderClickableText(item.textContent, false)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
                    {isPending ? (
                      <>
                        <button
                          id={`accept-transfer-${item.id}`}
                          type="button"
                          onClick={() => handleAccept(item.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Chấp nhận
                        </button>
                        <button
                          id={`decline-transfer-${item.id}`}
                          type="button"
                          onClick={() => handleDecline(item.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium flex items-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Từ chối
                        </button>
                      </>
                    ) : (
                      <>
                        {/* 1. NÚT LƯU VÀO KHO CLOUD */}
                        <button
                          type="button"
                          onClick={() => handleSaveToCloudDrive(item)}
                          disabled={isSavingInCloud || isSavedInCloud}
                          title="Lưu tệp hoặc văn bản này vào Kho Cloud cá nhân 24/7"
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ${
                            isSavedInCloud
                              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-white'
                          }`}
                        >
                          {isSavingInCloud ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                              <span>Đang lưu...</span>
                            </>
                          ) : isSavedInCloud ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-sky-400 stroke-[3]" />
                              <span>Đã lưu vào Cloud</span>
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3.5 h-3.5 text-sky-400" />
                              <span>Lưu vào Cloud</span>
                            </>
                          )}
                        </button>

                        {/* Văn bản actions */}
                        {item.textContent && (
                          <>
                            {extractUrls(item.textContent).map((url, uIdx) => (
                              <a
                                key={uIdx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                                title={`Mở liên kết: ${url}`}
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Mở link</span>
                              </a>
                            ))}

                            <button
                              type="button"
                              onClick={() => handleCopyText(item.id, item.textContent)}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">Đã sao chép</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Sao chép</span>
                                </>
                              )}
                            </button>
                          </>
                        )}

                        {/* File actions */}
                        {hasFile && (
                          <>
                            {isImage && imageSrc && (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(imageSrc)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Xem
                              </button>
                            )}
                            <button
                              id={`download-file-${item.id}`}
                              type="button"
                              onClick={() => handleDownloadFile(item)}
                              disabled={downloadingIds[item.id] === 'downloading'}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-700/60 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                            >
                              {downloadingIds[item.id] === 'downloading' ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Đang tải...
                                </>
                              ) : downloadingIds[item.id] === 'done' ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-white" />
                                  Đã tải xong
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  Tải về
                                </>
                              )}
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          title="Xóa khỏi lịch sử"
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-850 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewImage} alt="Xem trước" className="max-w-full max-h-[80vh] rounded-xl object-contain mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};
