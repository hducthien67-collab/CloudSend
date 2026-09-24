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
  Sparkles,
  Tv,
  Sliders
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playReceiveSound } from '../utils/sound';
import { isImageFile } from '../utils/fileUpload';

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
    const fileSource = item.fileUrl || item.fileData;
    if (!fileSource) return;
    const a = document.createElement('a');
    a.href = fileSource;
    a.download = item.fileName || 'cloudsend-file';
    if (item.fileUrl) {
      a.target = '_blank';
      a.rel = 'noreferrer';
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isTv = settings.deviceType === 'tv' || settings.tvModeEnabled;

  return (
    <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* Smart TV Leanback Banner (Specially designed for 10-foot TV viewing) */}
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

      {/* Ready to Receive Status Card (LocalSend style) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0"
              style={{ backgroundColor: settings.avatarColor }}
            >
              <Download className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                  {settings.deviceName}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
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
              const hasFile = !!(item.fileData || item.fileUrl);
              const isImage = (item.fileType?.startsWith('image/') || isImageFile({ name: item.fileName, type: item.fileType })) && hasFile;
              const viewUrl = item.fileUrl ? item.fileUrl.replace('/api/files/download/', '/api/files/view/') : '';
              const imageSrc = item.fileData || viewUrl || item.fileUrl;

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
                    ) : (
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                        {item.fileName ? <FileText className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-teal-400" />}
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
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <Eye className="w-3 h-3" />
                            Xem ảnh trước khi tải
                          </button>
                        </div>
                      )}

                      {/* Snippet preview if text */}
                      {item.textContent && (
                        <div className="mt-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
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

                        {hasFile && (
                          <>
                            {isImage && imageSrc && (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(imageSrc)}
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
