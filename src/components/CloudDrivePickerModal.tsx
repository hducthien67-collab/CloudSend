import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Search,
  Check,
  X,
  FileCheck,
  FolderOpen,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Star,
  Loader2,
  HardDrive
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { CloudDriveFile } from '../types';
import { useAuth } from '../context/AuthContext';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';
import { formatFileSize, isImageFile } from '../utils/fileUpload';

interface CloudDrivePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFiles: (selectedFiles: CloudDriveFile[]) => void;
  alreadySelectedUrls?: string[];
}

export const CloudDrivePickerModal: React.FC<CloudDrivePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectFiles,
  alreadySelectedUrls = []
}) => {
  const { currentUser } = useAuth();
  const [cloudFiles, setCloudFiles] = useState<CloudDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'image' | 'video' | 'audio' | 'document' | 'favorite'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Listen to user's Cloud files in Firestore
  useEffect(() => {
    if (!isOpen) return;

    if (!currentUser?.uid) {
      setCloudFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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

        // Sort descending by date
        loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCloudFiles(loaded);
        setLoading(false);
      },
      (err) => {
        console.error('Lỗi khi tải tệp từ Cloud Drive:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, currentUser?.uid]);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter files by search & category
  const filteredFiles = cloudFiles.filter((file) => {
    const matchesSearch =
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (file.type && file.type.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'favorite') return Boolean(file.isFavorite);
    return file.category === selectedCategory;
  });

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const handleConfirm = () => {
    const chosen = cloudFiles.filter((f) => selectedIds.has(f.id));
    if (chosen.length > 0) {
      onSelectFiles(chosen);
      onClose();
    }
  };

  const selectedTotalSize = cloudFiles
    .filter((f) => selectedIds.has(f.id))
    .reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Chọn từ kho Cloud</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  {cloudFiles.length} tệp
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Chọn các tệp đã lưu trong kho Cloud cá nhân của bạn để thêm vào danh sách gửi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950/40 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm tệp theo tên hoặc phần mở rộng..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Select All / Deselect button */}
            {filteredFiles.length > 0 && (
              <button
                type="button"
                onClick={selectAll}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shrink-0"
              >
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  {selectedIds.size === filteredFiles.length && filteredFiles.length > 0
                    ? 'Bỏ chọn tất cả'
                    : 'Chọn tất cả'}
                </span>
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Tất cả ({cloudFiles.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('image')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'image'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>Hình ảnh</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('document')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'document'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Tài liệu</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('video')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'video'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-rose-400" />
              <span>Video</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('audio')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'audio'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Music className="w-3.5 h-3.5 text-violet-400" />
              <span>Âm thanh</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('favorite')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'favorite'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              <span>Yêu thích</span>
            </button>
          </div>
        </div>

        {/* Content Body: File list */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 scrollbar-thin min-h-[260px] max-h-[50vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs">Đang tải danh sách tệp từ kho Cloud...</p>
            </div>
          ) : !currentUser ? (
            <div className="text-center py-16 px-4">
              <Cloud className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-semibold mb-1">
                Vui lòng đăng nhập tài khoản
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Bạn cần đăng nhập để truy cập kho Cloud cá nhân và chọn tệp để gửi.
              </p>
            </div>
          ) : cloudFiles.length === 0 ? (
            <div className="text-center py-16 px-4">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-semibold mb-1">
                Kho Cloud của bạn chưa có tệp nào
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                Hãy mở tab "Kho Cloud" ở thanh điều hướng trên cùng để tải các tệp quan trọng lên lưu trữ trước nhé.
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Search className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-medium">Không tìm thấy tệp nào phù hợp</p>
              <p className="text-xs text-slate-500 mt-1">Thử thay đổi từ khóa hoặc bộ lọc danh mục</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredFiles.map((file) => {
                const isSelected = selectedIds.has(file.id);
                const isAlreadyInSendList = alreadySelectedUrls.includes(file.url);
                const isImg = isImageFile(file);
                const fileTypeMeta = getDocumentTypeInfo(file.name, file.type);

                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file.id)}
                    className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/80 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                        : isAlreadyInSendList
                        ? 'bg-slate-900/60 border-slate-800/80 opacity-80'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                          : 'border-slate-600 bg-slate-800/60 group-hover:border-slate-500'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* Preview / Icon */}
                    <div className="shrink-0">
                      {isImg && (file.thumbnail || file.viewUrl || file.url) ? (
                        <div className="w-11 h-11 rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
                          <img
                            src={file.thumbnail || file.viewUrl || file.url}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <FileDocIcon fileName={file.name} mimeType={file.type} size="md" />
                      )}
                    </div>

                    {/* File Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate block" title={file.name}>
                          {file.name}
                        </span>
                        {file.isFavorite && (
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span className="truncate">{fileTypeMeta.label}</span>
                      </div>

                      {isAlreadyInSendList && (
                        <span className="text-[10px] text-emerald-400/90 font-medium block mt-0.5">
                          ✓ Đang có trong danh sách gửi
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-300 flex items-center gap-2">
            <span>Đã chọn:</span>
            <strong className="text-emerald-400 font-bold text-sm">{selectedIds.size} tệp</strong>
            {selectedIds.size > 0 && (
              <span className="text-slate-400">
                ({formatFileSize(selectedTotalSize)})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-all"
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleConfirm}
              className={`flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
                selectedIds.size > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>Thêm vào gửi ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
