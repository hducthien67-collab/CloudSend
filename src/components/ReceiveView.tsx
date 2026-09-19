import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  orderBy 
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
  Sparkles
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playReceiveSound } from '../utils/sound';

export const ReceiveView: React.FC = () => {
  const { currentUser, settings, updateSettings } = useAuth();
  const [transfers, setTransfers] = useState<DirectTransfer[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  const handleAccept = async (id: string) => {
    try {
      await updateDoc(doc(db, 'transfers', id), { status: 'completed' });
      if (settings.soundEnabled) {
        playReceiveSound();
      }
    } catch (err) {
      console.error('Accept transfer error:', err);
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await updateDoc(doc(db, 'transfers', id), { status: 'declined' });
    } catch (err) {
      console.error('Decline transfer error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transfers', id));
    } catch (err) {
      console.error('Delete transfer error:', err);
    }
  };

  const handleCopyText = (id: string, text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadFile = (item: DirectTransfer) => {
    if (!item.fileData) return;
    const a = document.createElement('a');
    a.href = item.fileData;
    a.download = item.fileName || 'cloudsend-file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Ready to Receive Status Card (LocalSend style) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0"
              style={{ backgroundColor: settings.avatarColor }}
            >
              <Download className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white tracking-tight">
                  {settings.deviceName}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Sẵn sàng nhận
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Thiết bị này đang trực tuyến trên mạng Relay. Người khác có thể gửi tệp và tin nhắn đến bạn bất kỳ lúc nào.
              </p>
            </div>
          </div>

          {/* Quick Save toggle button */}
          <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="text-left">
              <span className="text-xs font-semibold text-white block">Tự động nhận tệp</span>
              <span className="text-[11px] text-slate-400 block">Bỏ qua bước duyệt thủ công</span>
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
        </div>
      </div>

      {/* Transfer List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            Lịch sử & Tệp tin gửi đến ({transfers.length})
          </h2>
        </div>

        {transfers.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 text-slate-400 mx-auto flex items-center justify-center">
              <Download className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-white">Chưa có tệp nào được gửi đến</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Khi ai đó gửi tệp tin hoặc văn bản qua máy chủ trung gian tới bạn, thông báo và tệp tải về sẽ xuất hiện ở đây ngay lập tức.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map((item) => {
              const isPending = item.status === 'pending';
              const isCompleted = item.status === 'completed';
              const isDeclined = item.status === 'declined';
              const isImage = item.fileType?.startsWith('image/') && !!item.fileData;

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
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                      {item.fileName ? <FileText className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-teal-400" />}
                    </div>

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
                      </div>

                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>Từ: <strong className="text-slate-200">{item.senderDevice}</strong> ({item.senderName})</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>

                      {/* Snippet preview if text */}
                      {item.textContent && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono text-slate-200 break-all max-h-24 overflow-y-auto">
                          {item.textContent}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {isPending ? (
                      <>
                        <button
                          id={`accept-transfer-${item.id}`}
                          type="button"
                          onClick={() => handleAccept(item.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Chấp nhận
                        </button>
                        <button
                          id={`decline-transfer-${item.id}`}
                          type="button"
                          onClick={() => handleDecline(item.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Từ chối
                        </button>
                      </>
                    ) : (
                      <>
                        {item.textContent && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(item.id, item.textContent)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
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
                        )}

                        {item.fileData && (
                          <>
                            {isImage && (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(item.fileData!)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Xem
                              </button>
                            )}
                            <button
                              id={`download-file-${item.id}`}
                              type="button"
                              onClick={() => handleDownloadFile(item)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Tải về
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          title="Xóa khỏi lịch sử"
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
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
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-850"
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
