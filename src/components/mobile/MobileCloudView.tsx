import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
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
import { CloudDriveFile } from '../../types';
import { 
  Cloud, 
  Upload, 
  Plus, 
  HardDrive, 
  Image as ImageIcon, 
  Video, 
  Music, 
  FileText, 
  Star, 
  Download, 
  Share2, 
  Trash2, 
  Eye, 
  Search, 
  MoreVertical, 
  X, 
  Loader2, 
  Check, 
  Camera, 
  FolderPlus 
} from 'lucide-react';
import { uploadFileToServer, isImageFile, generateImageThumbnail, createClientFallbackFileInfo } from '../../utils/fileUpload';
import { downloadFileSafely } from '../../utils/fileDownload';
import { formatFileSize } from '../../utils/device';
import { FileDocIcon } from '../FileDocIcon';
import { MobileBottomSheet } from './MobileBottomSheet';

const MAX_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB

export const MobileCloudView: React.FC = () => {
  const { currentUser, settings } = useAuth();
  const [files, setFiles] = useState<CloudDriveFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document' | 'favorite'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileAction, setSelectedFileAction] = useState<CloudDriveFile | null>(null);
  const [previewFile, setPreviewFile] = useState<CloudDriveFile | null>(null);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = (txt: string) => {
    setToastText(txt);
    setTimeout(() => setToastText(null), 3000);
  };

  // Real-time listener for user's Cloud files
  useEffect(() => {
    if (!currentUser) return;

    const cloudRef = collection(db, 'cloud_files');
    const q = query(cloudRef, where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: CloudDriveFile[] = [];
      snapshot.docs.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as CloudDriveFile);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setFiles(list);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const totalUsedBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const usedPercent = Math.min(100, Math.round((totalUsedBytes / MAX_QUOTA_BYTES) * 100));

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !currentUser) return;

    setIsUploading(true);
    setUploadPercent(10);
    setIsUploadSheetOpen(false);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        let fileUrl = '';
        let thumb: string | null = null;

        if (isImageFile(file)) {
          try {
            thumb = await generateImageThumbnail(file, 480, 0.75);
          } catch {}
        }

        try {
          const uploaded = await uploadFileToServer(file, (pct) => {
            setUploadPercent(Math.min(95, Math.round((i * 100 + pct) / fileList.length)));
          });
          fileUrl = uploaded.url;
          if (uploaded.thumbnail) thumb = uploaded.thumbnail;
        } catch {
          const fallback = await createClientFallbackFileInfo(file);
          fileUrl = fallback.url;
          thumb = fallback.thumbnail || null;
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let category: 'image' | 'video' | 'audio' | 'document' | 'other' = 'other';
        if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) category = 'image';
        else if (file.type.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext)) category = 'video';
        else if (file.type.startsWith('audio/') || ['mp3', 'wav', 'm4a'].includes(ext)) category = 'audio';
        else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip'].includes(ext)) category = 'document';

        const safeUrl = (fileUrl && fileUrl.length < 700000) ? fileUrl : '';
        const safeThumb = (thumb && thumb.length < 700000) ? thumb : null;
        const docId = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        await setDoc(doc(db, 'cloud_files', docId), {
          id: docId,
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: currentUser.displayName || settings?.deviceName || 'Người dùng',
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          url: safeUrl,
          thumbnail: safeThumb,
          category: category,
          isFavorite: false,
          createdAt: new Date().toISOString()
        });
      }

      showToast(`Đã lưu ${fileList.length} tệp vào Kho Cloud!`);
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Lỗi khi tải tệp lên Cloud.');
    } finally {
      setIsUploading(false);
      setUploadPercent(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleToggleFavorite = async (file: CloudDriveFile) => {
    try {
      await updateDoc(doc(db, 'cloud_files', file.id), {
        isFavorite: !file.isFavorite
      });
      showToast(file.isFavorite ? 'Đã bỏ yêu thích' : 'Đã thêm vào yêu thích');
    } catch {}
  };

  const handleDeleteFile = async (file: CloudDriveFile) => {
    try {
      await deleteDoc(doc(db, 'cloud_files', file.id));
      setSelectedFileAction(null);
      showToast(`Đã xóa "${file.name}" khỏi Cloud`);
    } catch {
      showToast('Không thể xóa tệp');
    }
  };

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'favorite') return f.isFavorite;
    return f.category === selectedCategory;
  });

  return (
    <div className="w-full flex-1 flex flex-col px-3 py-2.5 space-y-3 overscroll-contain relative pb-20 no-scrollbar">
      {/* Hidden Upload Inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />

      {/* Toast */}
      {toastText && (
        <div className="fixed top-16 left-3.5 right-3.5 z-50 p-3 rounded-2xl bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 truncate">{toastText}</span>
        </div>
      )}

      {/* Top Cloud Storage Header */}
      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Cloud className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-[11px] font-bold text-white">Kho Cloud Cá Nhân</h2>
              <p className="text-[9px] text-slate-400">Đồng bộ không giới hạn thiết bị</p>
            </div>
          </div>

          <span className="text-[10px] font-mono text-emerald-400 font-bold">
            {formatFileSize(totalUsedBytes)} / 1 GB
          </span>
        </div>

        {/* Mini Quota Bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(2, usedPercent)}%` }}
          />
        </div>
      </div>

      {/* Category Filter Pills (Horizontal Scroll) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
        {[
          { id: 'all' as const, label: 'Tất cả', count: files.length },
          { id: 'image' as const, label: 'Hình ảnh', count: files.filter(f => f.category === 'image').length },
          { id: 'video' as const, label: 'Video', count: files.filter(f => f.category === 'video').length },
          { id: 'document' as const, label: 'Tài liệu', count: files.filter(f => f.category === 'document').length },
          { id: 'favorite' as const, label: 'Yêu thích', count: files.filter(f => f.isFavorite).length },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat.label} ({cat.count})
          </button>
        ))}
      </div>

      {/* Uploading progress banner */}
      {isUploading && (
        <div className="p-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang lưu tệp lên Cloud...
            </span>
            <span className="font-mono text-white font-bold text-[11px]">{uploadPercent || 10}%</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${uploadPercent || 10}%` }} />
          </div>
        </div>
      )}

      {/* File Grid (2-columns) */}
      {filteredFiles.length === 0 ? (
        <div className="flex-1 min-h-[160px] rounded-xl border border-dashed border-slate-800 bg-slate-900/30 flex flex-col items-center justify-center p-5 text-center space-y-1.5">
          <HardDrive className="w-7 h-7 text-slate-600" />
          <p className="text-[11px] font-bold text-slate-300">Chưa có tệp tin nào trong mục này</p>
          <p className="text-[10px] text-slate-500">Bấm dấu (+) bên dưới để tải ảnh hoặc tệp lên Cloud.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => setSelectedFileAction(file)}
              className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex flex-col justify-between space-y-1.5 shadow-sm active:scale-98 transition-all cursor-pointer relative group"
            >
              {/* Thumbnail */}
              <div className="w-full h-20 rounded-lg bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-800">
                {file.thumbnail || (file.url && isImageFile({ name: file.name, type: file.type })) ? (
                  <img
                    src={file.thumbnail || file.url}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileDocIcon fileName={file.name} mimeType={file.type} size="sm" />
                )}
              </div>

              {/* Title & Info */}
              <div className="space-y-0.5">
                <h4 className="text-[11px] font-bold text-white truncate" title={file.name}>
                  {file.name}
                </h4>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>{formatFileSize(file.size)}</span>
                  {file.isFavorite && <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Button (FAB +) for Mobile Upload */}
      <button
        type="button"
        onClick={() => setIsUploadSheetOpen(true)}
        className="fixed right-4 bottom-20 z-40 w-13 h-13 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-xl shadow-emerald-500/25 active:scale-90 transition-all cursor-pointer"
        title="Tải tệp lên Cloud"
      >
        <Plus className="w-7 h-7 stroke-[2.5]" />
      </button>

      {/* Upload Bottom Sheet */}
      <MobileBottomSheet
        isOpen={isUploadSheetOpen}
        onClose={() => setIsUploadSheetOpen(false)}
        title="Tải Lên Kho Cloud"
        subtitle="Chọn nguồn tệp bạn muốn lưu trữ:"
        icon={<Upload className="w-5 h-5 text-emerald-400" />}
      >
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setIsUploadSheetOpen(false);
              cameraInputRef.current?.click();
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Chụp ảnh / Quay video</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsUploadSheetOpen(false);
              fileInputRef.current?.click();
            }}
            className="p-3.5 rounded-2xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Chọn tệp từ máy</span>
          </button>
        </div>
      </MobileBottomSheet>

      {/* File Action Bottom Sheet */}
      <MobileBottomSheet
        isOpen={Boolean(selectedFileAction)}
        onClose={() => setSelectedFileAction(null)}
        title={selectedFileAction?.name || 'Chi tiết tệp'}
        subtitle={selectedFileAction ? `${formatFileSize(selectedFileAction.size)} • ${new Date(selectedFileAction.createdAt).toLocaleDateString('vi-VN')}` : ''}
        icon={<FileText className="w-5 h-5 text-emerald-400" />}
      >
        {selectedFileAction && (
          <div className="space-y-2 pt-1">
            {/* Download */}
            <button
              type="button"
              onClick={() => {
                downloadFileSafely(selectedFileAction.url, selectedFileAction.name);
                setSelectedFileAction(null);
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Tải về máy tính / điện thoại</span>
            </button>

            {/* Preview if image */}
            {(selectedFileAction.thumbnail || selectedFileAction.category === 'image') && (
              <button
                type="button"
                onClick={() => {
                  setPreviewFile(selectedFileAction);
                  setSelectedFileAction(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 active:scale-98 transition-all"
              >
                <Eye className="w-4 h-4 text-sky-400" />
                <span>Xem ảnh phóng to</span>
              </button>
            )}

            {/* Favorite */}
            <button
              type="button"
              onClick={() => {
                handleToggleFavorite(selectedFileAction);
                setSelectedFileAction(null);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 active:scale-98 transition-all"
            >
              <Star className={`w-4 h-4 ${selectedFileAction.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-slate-400'}`} />
              <span>{selectedFileAction.isFavorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}</span>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => handleDeleteFile(selectedFileAction)}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold text-xs flex items-center justify-center gap-2 border border-rose-500/30 active:scale-98 transition-all"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Xóa tệp khỏi Cloud</span>
            </button>
          </div>
        )}
      </MobileBottomSheet>

      {/* Fullscreen Image Preview */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-in fade-in"
        >
          <img
            src={previewFile.url || previewFile.thumbnail || ''}
            alt={previewFile.name}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setPreviewFile(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-white font-bold"
          >
            ✕ Đóng
          </button>
        </div>
      )}
    </div>
  );
};
