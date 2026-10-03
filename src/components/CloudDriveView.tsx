import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { CloudDriveFile } from '../types';
import {
  Cloud,
  Upload,
  HardDrive,
  File,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Trash2,
  Download,
  Share2,
  Star,
  Search,
  ExternalLink,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Edit2,
  Filter,
  X
} from 'lucide-react';
import { uploadFileToServer, isImageFile, generateImageThumbnail } from '../utils/fileUpload';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';

const MAX_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB (1024 MB) personal storage quota

export const CloudDriveView: React.FC = () => {
  const { currentUser, settings } = useAuth();
  const [files, setFiles] = useState<CloudDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document' | 'other' | 'favorite'>('all');
  const [previewFile, setPreviewFile] = useState<CloudDriveFile | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time synchronization of personal Cloud files via Firestore
  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'cloud_files'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: CloudDriveFile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            id: docSnap.id,
            userId: data.userId || currentUser.uid,
            userEmail: data.userEmail,
            userName: data.userName,
            name: data.name || 'Không tên',
            size: Number(data.size) || 0,
            type: data.type || 'application/octet-stream',
            url: data.url,
            viewUrl: data.viewUrl || data.url,
            thumbnail: data.thumbnail,
            category: data.category || 'other',
            isFavorite: Boolean(data.isFavorite),
            createdAt: data.createdAt || new Date().toISOString()
          });
        });

        // Sort descending by creation date
        loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setFiles(loaded);
        setLoading(false);
      },
      (err) => {
        console.error('Lỗi khi tải danh sách tệp đám mây:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Compute storage quota
  const totalSizeBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const quotaUsedPercent = Math.min(100, Math.round((totalSizeBytes / MAX_QUOTA_BYTES) * 100));

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileCategory = (mime: string, name: string): 'image' | 'video' | 'audio' | 'document' | 'other' => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg'].includes(ext)) {
      return 'image';
    }
    if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
      return 'video';
    }
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
      return 'audio';
    }
    if (
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.includes('document') ||
      mime.includes('sheet') ||
      mime.includes('presentation') ||
      ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'csv', 'md'].includes(ext)
    ) {
      return 'document';
    }
    return 'other';
  };

  const getFileIcon = (category: string, name?: string, mime?: string) => {
    if (name || mime) {
      return <FileDocIcon fileName={name} mimeType={mime} size="sm" />;
    }
    switch (category) {
      case 'image':
        return <ImageIcon className="w-5 h-5 text-sky-400" />;
      case 'video':
        return <Video className="w-5 h-5 text-rose-400" />;
      case 'audio':
        return <Music className="w-5 h-5 text-violet-400" />;
      case 'document':
        return <FileText className="w-5 h-5 text-amber-400" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
    }
  };

  // Upload file to personal Cloud
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !currentUser) return;

    setUploading(true);
    setUploadProgress(5);
    setStatusMessage(null);

    try {
      const totalFiles = fileList.length;
      for (let i = 0; i < totalFiles; i++) {
        const file = fileList[i];
        
        // Quota check
        if (totalSizeBytes + file.size > MAX_QUOTA_BYTES) {
          setStatusMessage({
            type: 'error',
            text: `Kho lưu trữ không đủ dung lượng để chứa "${file.name}" (Giới hạn: 1 GB).`
          });
          break;
        }

        // Generate client thumbnail for images if possible
        let clientThumb: string | undefined = undefined;
        if (isImageFile(file)) {
          try {
            const t = await generateImageThumbnail(file, 480, 0.8);
            if (t) clientThumb = t;
          } catch {
            // ignore thumbnail failure
          }
        }

        // Upload using robust uploadFileToServer with smooth percentage tracking and resilient fallback
        let fileUrl = '';
        let fileViewUrl = '';
        let fileThumbnail = clientThumb || null;

        try {
          const uploadedFile = await uploadFileToServer(file, (pct) => {
            const fileShare = 100 / totalFiles;
            const overall = Math.min(99, Math.round(i * fileShare + (pct / 100) * fileShare));
            setUploadProgress(overall);
          });
          fileUrl = uploadedFile.url;
          fileViewUrl = uploadedFile.viewUrl || uploadedFile.url;
          if (uploadedFile.thumbnail) {
            fileThumbnail = uploadedFile.thumbnail;
          }
        } catch (uploadErr: any) {
          // If server proxy is sleeping or unavailable, but file is under 750KB,
          // store directly as Base64 Data URL so user is NEVER blocked!
          if (file.size <= 750 * 1024) {
            console.warn(`Server proxy busy, using resilient direct storage for "${file.name}"...`);
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            fileUrl = base64Data;
            fileViewUrl = base64Data;
            if (!fileThumbnail && isImageFile(file)) {
              fileThumbnail = base64Data;
            }
          } else {
            throw uploadErr;
          }
        }

        const category = getFileCategory(file.type, file.name);

        // Save metadata into Firestore
        const docId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        await setDoc(doc(db, 'cloud_files', docId), {
          id: docId,
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: currentUser.displayName || settings.deviceName || 'Người dùng',
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          url: fileUrl,
          viewUrl: fileViewUrl,
          thumbnail: fileThumbnail,
          category: category,
          isFavorite: false,
          createdAt: new Date().toISOString()
        });

        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      setStatusMessage({
        type: 'success',
        text: `Đã lưu ${fileList.length} tệp thành công vào Kho Cloud!`
      });
    } catch (err: any) {
      console.error('Upload to Cloud error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Đã có lỗi xảy ra trong quá trình tải tệp lên Cloud.'
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (file: CloudDriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'cloud_files', file.id), {
        isFavorite: !file.isFavorite
      });
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  // Rename file
  const handleSaveRename = async (file: CloudDriveFile, e: React.FormEvent) => {
    e.preventDefault();
    if (!editFileName.trim()) return;
    try {
      await updateDoc(doc(db, 'cloud_files', file.id), {
        name: editFileName.trim()
      });
      setEditingFileId(null);
    } catch (err) {
      console.error('Error renaming file:', err);
    }
  };

  // Delete file from Cloud & server
  const handleDeleteFile = async (file: CloudDriveFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Bạn có chắc muốn xóa vĩnh viễn tệp "${file.name}" khỏi Cloud?`)) {
      return;
    }

    try {
      // 1. Delete Firestore record
      await deleteDoc(doc(db, 'cloud_files', file.id));

      // 2. Extract server filename to delete from disk
      const serverFilename = file.url.split('/').pop()?.split('?')[0];
      if (serverFilename) {
        await fetch(`/api/files/${serverFilename}`, { method: 'DELETE' }).catch(() => {});
      }

      if (previewFile?.id === file.id) {
        setPreviewFile(null);
      }

      setStatusMessage({
        type: 'success',
        text: `Đã xóa tệp "${file.name}".`
      });
    } catch (err) {
      console.error('Error deleting file:', err);
      setStatusMessage({
        type: 'error',
        text: 'Không thể xóa tệp. Vui lòng thử lại.'
      });
    }
  };

  // Delete files in Cloud (Images, Videos, Audios, Documents)
  const handleDeleteFiles = async (scope: 'all' | 'category' = 'all') => {
    const targetFiles = scope === 'category' && selectedCategory !== 'all'
      ? files.filter(f => selectedCategory === 'favorite' ? f.isFavorite : f.category === selectedCategory)
      : files;

    if (targetFiles.length === 0) return;
    const count = targetFiles.length;
    const catLabel = scope === 'category'
      ? (selectedCategory === 'image' ? 'hình ảnh'
        : selectedCategory === 'video' ? 'video'
        : selectedCategory === 'audio' ? 'âm thanh'
        : selectedCategory === 'document' ? 'tài liệu'
        : selectedCategory === 'favorite' ? 'tệp yêu thích'
        : 'tệp')
      : 'tệp (Hình ảnh, Video, Âm thanh, Tài liệu...)';

    if (!confirm(`Bạn có chắc chắn muốn XÓA TẤT CẢ ${count} ${catLabel} khỏi Kho Cloud vĩnh viễn không? Hành động này sẽ giải phóng dung lượng và không thể hoàn tác!`)) {
      return;
    }

    try {
      const batchPromises = targetFiles.map(async (file) => {
        await deleteDoc(doc(db, 'cloud_files', file.id));
        const serverFilename = file.url.split('/').pop()?.split('?')[0];
        if (serverFilename) {
          await fetch(`/api/files/${serverFilename}`, { method: 'DELETE' }).catch(() => {});
        }
      });
      await Promise.all(batchPromises);
      setStatusMessage({
        type: 'success',
        text: `Đã xóa toàn bộ ${count} ${catLabel} khỏi Kho Cloud thành công.`
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error('Error deleting files:', err);
      setStatusMessage({
        type: 'error',
        text: 'Có lỗi xảy ra khi xóa tệp.'
      });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // Copy shareable link
  const handleCopyLink = (file: CloudDriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${file.url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopyToast(`Đã sao chép link tải: ${file.name}`);
      setTimeout(() => setCopyToast(null), 3000);
    });
  };

  // Filtering files
  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'favorite') return f.isFavorite;
    return f.category === selectedCategory;
  });

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner & Storage Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  Kho Cloud Cá Nhân
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30">
                    Live Sync
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Lưu trữ lâu dài, đồng bộ tức thì giữa Điện thoại & Máy tính mà không cần cáp nối
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={(e) => handleUploadFiles(e.target.files)}
              className="hidden"
            />
            <button
              id="upload-to-cloud-btn"
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Đang tải lên {uploadProgress !== null ? `(${uploadProgress}%)` : '...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-slate-950" />
                  <span>Tải tệp lên Cloud</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-medium">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Dung lượng đã sử dụng:</span>
              <span className="text-white font-semibold">{formatFileSize(totalSizeBytes)}</span>
              <span>/ 1 GB</span>
            </div>
            <span className="font-mono text-emerald-400">{quotaUsedPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                quotaUsedPercent > 90
                  ? 'bg-rose-500'
                  : quotaUsedPercent > 70
                  ? 'bg-amber-400'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${quotaUsedPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Copy Toast */}
      {copyToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) {
            handleUploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
          dragOver
            ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
        }`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-2 transition-transform ${dragOver ? 'text-emerald-400 scale-125' : 'text-slate-400'}`} />
        <p className="text-sm font-semibold text-slate-200">
          Kéo thả tệp hoặc bấm vào đây để tải lên Cloud của bạn
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Hỗ trợ ảnh, video, âm thanh, tài liệu PDF/Word (lên đến 250 MB/tệp)
        </p>
      </div>

      {/* Filter Categories, Actions and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills with Icons matching Image 1 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {[
            { id: 'all', label: 'Tất cả', icon: HardDrive, iconClass: 'text-emerald-400', count: files.length },
            { id: 'image', label: 'Hình ảnh', icon: ImageIcon, iconClass: 'text-sky-400', count: files.filter((f) => f.category === 'image').length },
            { id: 'document', label: 'Tài liệu', icon: FileText, iconClass: 'text-amber-400', count: files.filter((f) => f.category === 'document').length },
            { id: 'video', label: 'Video', icon: Video, iconClass: 'text-rose-400', count: files.filter((f) => f.category === 'video').length },
            { id: 'audio', label: 'Âm thanh', icon: Music, iconClass: 'text-purple-400', count: files.filter((f) => f.category === 'audio').length },
            { id: 'favorite', label: 'Yêu thích', icon: Star, iconClass: 'text-yellow-400 fill-yellow-400', count: files.filter((f) => f.isFavorite).length },
          ].map((cat) => {
            const IconComp = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800/80 border-slate-800'
                }`}
              >
                <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : cat.iconClass}`} />
                <span>
                  {cat.label}
                  {cat.count > 0 ? ` (${cat.count})` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right tools: Delete All & Search Input */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {files.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {selectedCategory !== 'all' && filteredFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDeleteFiles('category')}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm whitespace-nowrap"
                  title={`Xóa tất cả ${selectedCategory === 'image' ? 'hình ảnh' : selectedCategory === 'video' ? 'video' : selectedCategory === 'audio' ? 'âm thanh' : selectedCategory === 'document' ? 'tài liệu' : 'mục'} trong danh mục này`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Xóa mục này ({filteredFiles.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDeleteFiles('all')}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 shadow-sm whitespace-nowrap"
                title="Xóa tất cả các tệp (Hình ảnh, Video, Âm thanh, Tài liệu) khỏi Kho Cloud"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Xóa tất cả ({files.length})</span>
              </button>
            </div>
          )}

          {/* Search Input */}
          <div className="relative min-w-[180px] sm:min-w-[220px] flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm tệp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="smooth-input w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none transition-all duration-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Files Grid / List */}
      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Đang đồng bộ tệp đám mây của bạn...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl py-16 px-6 text-center">
          <Cloud className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300 mb-1">
            {searchQuery
              ? 'Không tìm thấy tệp nào phù hợp'
              : selectedCategory !== 'all'
              ? 'Chưa có tệp nào trong danh mục này'
              : 'Kho lưu trữ Cloud của bạn đang trống'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
            Tải lên ảnh chụp từ điện thoại, video kỷ niệm hoặc tài liệu làm việc để truy cập mọi lúc, mọi nơi.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-emerald-400 transition-colors inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>Tải lên ngay</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => setPreviewFile(file)}
              className="group bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 hover:bg-slate-850/80 rounded-2xl p-4 transition-all shadow-md hover:shadow-xl cursor-pointer flex flex-col justify-between"
            >
              {/* Card Header & Preview Thumbnail */}
              <div>
                <div className="relative aspect-video w-full rounded-xl bg-slate-950/80 border border-slate-800/60 overflow-hidden mb-3 flex items-center justify-center group-hover:border-emerald-500/40 transition-colors">
                  {file.category === 'image' ? (
                    <img
                      src={file.thumbnail || file.viewUrl || file.url}
                      alt={file.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : file.category === 'video' ? (
                    <div className="flex flex-col items-center gap-1.5 text-slate-400">
                      <FileDocIcon fileName={file.name} mimeType={file.type} size="md" />
                      <span className="text-[10px] text-slate-400">Xem video</span>
                    </div>
                  ) : file.category === 'audio' ? (
                    <div className="flex flex-col items-center gap-1.5 text-slate-400">
                      <FileDocIcon fileName={file.name} mimeType={file.type} size="md" />
                      <span className="text-[10px] text-slate-400">Nghe nhạc</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <FileDocIcon fileName={file.name} mimeType={file.type} size="md" />
                      <span className="text-[10px] text-slate-400">
                        {getDocumentTypeInfo(file.name, file.type).label}
                      </span>
                    </div>
                  )}

                  {/* Favorite star badge */}
                  <button
                    type="button"
                    title={file.isFavorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}
                    onClick={(e) => handleToggleFavorite(file, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-slate-400 hover:text-amber-400 transition-colors backdrop-blur-sm"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        file.isFavorite ? 'text-amber-400 fill-amber-400' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* File Name & Rename Form */}
                {editingFileId === file.id ? (
                  <form
                    onSubmit={(e) => handleSaveRename(file, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 mb-1"
                  >
                    <input
                      type="text"
                      value={editFileName}
                      autoFocus
                      onChange={(e) => setEditFileName(e.target.value)}
                      className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-0.5 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold"
                    >
                      Lưu
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4
                      title={file.name}
                      className="text-xs font-semibold text-slate-200 truncate group-hover:text-white"
                    >
                      {file.name}
                    </h4>
                    <button
                      type="button"
                      title="Đổi tên"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFileId(file.id);
                        setEditFileName(file.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition-opacity p-0.5"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* File Meta */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                  <span>{formatFileSize(file.size)}</span>
                  <span>{new Date(file.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-400"
              >
                <div className="flex items-center gap-1">
                  {/* Download */}
                  <a
                    href={file.url}
                    download={file.name}
                    title="Tải về máy tính / điện thoại"
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-emerald-400 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>

                  {/* Copy Share Link */}
                  <button
                    type="button"
                    title="Sao chép liên kết chia sẻ cho bạn bè"
                    onClick={(e) => handleCopyLink(file, e)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-sky-400 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {/* Preview */}
                  <button
                    type="button"
                    title="Xem trước"
                    onClick={() => setPreviewFile(file)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-teal-400 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  title="Xóa khỏi Cloud"
                  onClick={(e) => handleDeleteFile(file, e)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                {getFileIcon(previewFile.category || 'other', previewFile.name, previewFile.type)}
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{previewFile.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    {formatFileSize(previewFile.size)} • {new Date(previewFile.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải về</span>
                </a>
                <button
                  type="button"
                  title="Xóa tệp này khỏi Cloud"
                  onClick={() => handleDeleteFile(previewFile)}
                  className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body / Media Viewer */}
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950/60 min-h-[300px]">
              {previewFile.category === 'image' ? (
                <img
                  src={previewFile.viewUrl || previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : previewFile.category === 'video' ? (
                <video
                  src={previewFile.viewUrl || previewFile.url}
                  controls
                  autoPlay
                  className="max-h-[65vh] max-w-full rounded-lg shadow-lg"
                />
              ) : previewFile.category === 'audio' ? (
                <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center">
                  <Music className="w-12 h-12 text-violet-400 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white mb-4">{previewFile.name}</p>
                  <audio
                    src={previewFile.viewUrl || previewFile.url}
                    controls
                    autoPlay
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="text-center p-8 flex flex-col items-center">
                  <div className="mb-4">
                    <FileDocIcon fileName={previewFile.name} mimeType={previewFile.type} size="hero" />
                  </div>
                  <p className="text-base text-white font-bold mb-1">{previewFile.name}</p>
                  <p className="text-xs text-slate-400 mb-5">
                    {getDocumentTypeInfo(previewFile.name, previewFile.type).label} • {formatFileSize(previewFile.size)}
                  </p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:shadow-emerald-600/20 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải tệp về máy để xem</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
