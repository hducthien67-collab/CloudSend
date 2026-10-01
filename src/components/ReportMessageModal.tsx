import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';
import { ChatMessage } from '../types';
import { Flag, X, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ReportMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage | null;
  roomId: string;
  roomName: string;
  currentUserId: string;
  currentUserName: string;
}

export const ReportMessageModal: React.FC<ReportMessageModalProps> = ({
  isOpen,
  onClose,
  message,
  roomId,
  roomName,
  currentUserId,
  currentUserName
}) => {
  const [category, setCategory] = useState<'profanity_bypass' | 'nsfw_18' | 'harassment' | 'spam' | 'other'>('profanity_bypass');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !message) return null;

  const categories = [
    {
      id: 'profanity_bypass',
      title: 'Lách luật chửi bậy / Xúc phạm',
      desc: 'Dùng ký tự đặc biệt, dấu chấm hoặc từ ngữ né tránh để thô tục, lăng mạ'
    },
    {
      id: 'nsfw_18',
      title: 'Nội dung hoặc ảnh 18+ khiêu dâm',
      desc: 'Hình ảnh, video hoặc văn bản gợi dục, đồi trụy không phù hợp'
    },
    {
      id: 'harassment',
      title: 'Quấy rối / Đe dọa / Công kích',
      desc: 'Có hành vi bắt nạt, đe dọa hoặc làm phiền thành viên khác'
    },
    {
      id: 'spam',
      title: 'Spam / Lừa đảo / Quảng cáo',
      desc: 'Gửi dồn dập, chia sẻ liên kết độc hại, quảng cáo rác'
    },
    {
      id: 'other',
      title: 'Hành vi vi phạm khác',
      desc: 'Bất kỳ hành vi không lành mạnh nào ảnh hưởng đến phòng chat'
    }
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const selectedCategoryObj = categories.find(c => c.id === category);
      const categoryTitle = selectedCategoryObj ? selectedCategoryObj.title : 'Vi phạm quy tắc';
      const finalReason = details.trim() 
        ? `${categoryTitle} - ${details.trim()}`
        : categoryTitle;

      await addDoc(collection(db, 'reports'), {
        roomId,
        roomName,
        messageId: message.id,
        messageText: message.text || '',
        messageRawText: message.rawText || message.text || '',
        senderId: message.senderId,
        senderName: message.senderName,
        senderDevice: message.senderDevice || '',
        reportedByUid: currentUserId,
        reportedByName: currentUserName,
        reason: finalReason,
        category,
        status: 'pending',
        createdAt: new Date().toISOString(),
        timestamp: Date.now()
      });

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setDetails('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Submit report error:', err);
      alert('Không thể gửi báo cáo, vui lòng thử lại sau.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5 text-rose-400">
            <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <Flag className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Tố Cáo Vi Phạm Đến DEV</h3>
              <p className="text-xs text-slate-400">Báo cáo tin nhắn lách luật hoặc có nội dung xấu</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">Đã Gửi Báo Cáo Thành Công!</h4>
            <p className="text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Cảm ơn bạn đã tố cáo. Nhà phát triển (DEV) sẽ căn cứ vào báo cáo này trong DataStore để kiểm tra nội dung gốc và xử phạt người vi phạm.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Target message snippet */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Người gửi: {message.senderName}</span>
                <span className="text-[11px] text-slate-500">{message.senderDevice}</span>
              </div>
              <p className="text-sm text-slate-300 italic line-clamp-3 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                "{message.rawText || message.text || '[Tệp tin đính kèm]'}"
              </p>
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Chọn lý do tố cáo:
              </label>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      category === cat.id
                        ? 'bg-rose-500/10 border-rose-500/60 text-white shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-category"
                      value={cat.id}
                      checked={category === cat.id}
                      onChange={() => setCategory(cat.id)}
                      className="mt-0.5 text-rose-500 focus:ring-rose-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-100">{cat.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{cat.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                Ghi chú thêm cho DEV (tùy chọn):
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Ví dụ: Người này liên tục chửi bậy bằng cách chèn dấu chấm để lách lọc..."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-lg shadow-rose-950/50 disabled:opacity-50"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{submitting ? 'Đang gửi...' : 'Gửi Tố Cáo Đến DEV'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
