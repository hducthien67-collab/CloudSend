import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { DirectTransfer } from '../../types';
import { 
  Download, 
  FileText, 
  Check, 
  Copy, 
  CheckCheck, 
  Eye, 
  Trash2,
  X, 
  Smartphone, 
  Clock, 
  Sparkles, 
  Inbox,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import { downloadFileSafely } from '../../utils/fileDownload';
import { formatFileSize } from '../../utils/device';
import { FileDocIcon } from '../FileDocIcon';
import { renderClickableText } from '../../utils/textFormat';

export const MobileReceiveView: React.FC = () => {
  const { currentUser, settings, updateSettings } = useAuth();
  const [transfers, setTransfers] = useState<DirectTransfer[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Real-time listener for transfers directed to this user/device
  useEffect(() => {
    if (!currentUser) return;

    const transfersRef = collection(db, 'transfers');
    const q = query(
      transfersRef,
      where('receiverId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DirectTransfer[] = [];
      snapshot.docs.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DirectTransfer);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransfers(list);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const handleDownload = async (transfer: DirectTransfer) => {
    const source = transfer.fileUrl || transfer.fileData;
    if (!source || !transfer.fileName) return;

    try {
      await updateDoc(doc(db, 'transfers', transfer.id), { status: 'completed' });
    } catch {}

    downloadFileSafely(source, transfer.fileName);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Đã sao chép nội dung văn bản!');
    setTimeout(() => setCopiedId(null), 2500);

    try {
      updateDoc(doc(db, 'transfers', id), { status: 'completed' }).catch(() => {});
    } catch {}
  };

  const handleDeleteTransfer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transfers', id));
      showToast('Đã xóa mục khỏi danh sách');
    } catch {
      showToast('Không thể xóa mục');
    }
  };

  const handleClearAll = async () => {
    try {
      const promises = transfers.map((t) => deleteDoc(doc(db, 'transfers', t.id)));
      await Promise.all(promises);
      showToast('Đã xóa toàn bộ lịch sử nhận');
    } catch {
      showToast('Không thể xóa lịch sử');
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col px-3 py-2.5 space-y-2.5 overscroll-contain no-scrollbar">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-3.5 right-3.5 z-50 p-2.5 rounded-2xl bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 truncate">{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2.5 shadow-md">
        <div>
          <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <span>Hộp Nhận Tệp Tin</span>
            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
              {transfers.length} mục
            </span>
          </h2>
          <p className="text-[10.5px] text-slate-400">Tự động nhận tệp gửi qua điện thoại</p>
        </div>

        {transfers.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="px-2 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10.5px] font-semibold flex items-center gap-1 active:scale-95 transition-all"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xóa hết</span>
          </button>
        )}
      </div>

      {/* Transfers List */}
      {transfers.length === 0 ? (
        <div className="flex-1 min-h-[220px] rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 flex flex-col items-center justify-center p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <Inbox className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-300">Chưa có tệp tin nào được gửi tới</p>
          <p className="text-[11px] text-slate-500 max-w-[240px]">
            Khi có máy tính hoặc điện thoại khác gửi ảnh, video hoặc tệp, chúng sẽ xuất hiện tại đây ngay lập tức.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map((item) => {
            const isText = Boolean(item.textContent);
            const isCompleted = item.status === 'completed';

            return (
              <div
                key={item.id}
                className={`p-2.5 rounded-xl border transition-all shadow-sm space-y-2 ${
                  isCompleted
                    ? 'bg-slate-900/70 border-slate-800/80'
                    : 'bg-gradient-to-b from-slate-850 to-slate-900 border-emerald-500/40 ring-1 ring-emerald-500/20'
                }`}
              >
                {/* Card Header: Sender Info & Time */}
                <div className="flex items-center justify-between gap-1.5 border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {item.senderName ? item.senderName.charAt(0).toUpperCase() : 'G'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-bold text-white truncate">{item.senderName}</h4>
                      <p className="text-[9px] text-slate-400 truncate">
                        Từ: {item.senderDevice || 'Thiết bị'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-500">
                      {new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTransfer(item.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded-md"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Content Payload */}
                {isText ? (
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <div className="text-[11px] text-slate-200 break-words whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                      {renderClickableText(item.textContent || '')}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleCopyText(item.textContent || '', item.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                      >
                        {copiedId === item.id ? (
                          <>
                            <CheckCheck className="w-3 h-3" />
                            <span>Đã sao chép!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Sao chép văn bản</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    {/* Thumbnail / Icon */}
                    {item.fileData && item.fileData.startsWith('data:image') ? (
                      <img
                        src={item.fileData}
                        alt={item.fileName}
                        onClick={() => setPreviewImage(item.fileData || null)}
                        className="w-11 h-11 rounded-lg object-cover border border-slate-700 shrink-0 cursor-pointer"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <FileDocIcon fileName={item.fileName} mimeType={item.fileType} size="sm" />
                      </div>
                    )}

                    {/* File Meta & Download Button */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div>
                        <h4 className="text-[11px] font-bold text-white truncate" title={item.fileName}>
                          {item.fileName}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {formatFileSize(item.fileSize)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          className="flex-1 py-1 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                        >
                          <Download className="w-3 h-3" />
                          <span>Tải về máy</span>
                        </button>

                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTransfer(item.id)}
                            className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 font-semibold text-[10.5px] flex items-center justify-center gap-1 active:scale-95 transition-all"
                            title="Từ chối và xóa tệp"
                          >
                            <X className="w-3 h-3 text-rose-400" />
                            <span>Từ chối</span>
                          </button>
                        )}

                        {item.fileData?.startsWith('data:image') && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(item.fileData || null)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 active:scale-95 transition-all"
                            title="Xem ảnh"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-in fade-in"
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white font-bold"
          >
            Đóng ✕
          </button>
        </div>
      )}
    </div>
  );
};
