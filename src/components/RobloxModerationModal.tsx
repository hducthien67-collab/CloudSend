import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { UserSanction } from '../types';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Ban, 
  Clock, 
  Check, 
  LogOut, 
  Scale, 
  ExternalLink,
  MessageSquare,
  FileText,
  AlertOctagon,
  Quote
} from 'lucide-react';

interface RobloxModerationModalProps {
  onOpenRules?: () => void;
}

export const RobloxModerationModal: React.FC<RobloxModerationModalProps> = ({ onOpenRules }) => {
  const { currentUser, logout } = useAuth();
  const [activeSanction, setActiveSanction] = useState<UserSanction | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Subscribe to real-time sanction record for current user
  useEffect(() => {
    if (!currentUser) {
      setActiveSanction(null);
      return;
    }

    const uid = currentUser.uid;
    const cleanEmail = (currentUser.email || '').trim().toLowerCase();
    const emailDocId = cleanEmail ? encodeURIComponent(cleanEmail).replace(/\./g, '_') : '';

    const unsubUid = onSnapshot(doc(db, 'sanctions', uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserSanction;
        handleSanctionUpdate(data);
      } else if (emailDocId) {
        // Fallback to email doc
        onSnapshot(doc(db, 'sanctions', emailDocId), (emailSnap) => {
          if (emailSnap.exists()) {
            handleSanctionUpdate(emailSnap.data() as UserSanction);
          } else {
            setActiveSanction(null);
          }
        });
      } else {
        setActiveSanction(null);
      }
    });

    const handleSanctionUpdate = (data: UserSanction) => {
      const now = Date.now();
      
      // Check if ban is still active
      if (data.isBanned) {
        if (data.banExpiresAt) {
          const exp = new Date(data.banExpiresAt).getTime();
          if (now > exp) {
            setActiveSanction(null);
            return;
          }
        }
        setActiveSanction(data);
        return;
      }

      // Check if chat lock is active and hasn't been acknowledged in this session
      if (data.isChatLocked) {
        if (data.chatLockExpiresAt) {
          const exp = new Date(data.chatLockExpiresAt).getTime();
          if (now > exp) {
            setActiveSanction(null);
            return;
          }
        }
        
        const ackKey = `cloudsend_ack_sanction_${data.uid}_${data.lastSanctionType}_${data.violationCount}`;
        const isAcked = localStorage.getItem(ackKey) === 'true';
        if (!isAcked) {
          setActiveSanction(data);
        } else {
          setActiveSanction(null);
        }
        return;
      }

      setActiveSanction(null);
    };

    return () => unsubUid();
  }, [currentUser]);

  // Lock body & container scroll when moderation modal is open
  useEffect(() => {
    if (activeSanction) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');

      const preventBackgroundScroll = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.closest('#roblox-moderation-modal') || target.closest('.scrollbar-thin'))) {
          return;
        }
        e.preventDefault();
      };

      window.addEventListener('wheel', preventBackgroundScroll, { passive: false });
      window.addEventListener('touchmove', preventBackgroundScroll, { passive: false });

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.classList.remove('modal-open');
        window.removeEventListener('wheel', preventBackgroundScroll);
        window.removeEventListener('touchmove', preventBackgroundScroll);
      };
    }
  }, [activeSanction]);

  // Live countdown timer for temporary bans / chat locks
  useEffect(() => {
    if (!activeSanction) return;

    const targetExpiry = activeSanction.banExpiresAt || activeSanction.chatLockExpiresAt;
    if (!targetExpiry) {
      if (activeSanction.isBanned && !activeSanction.banExpiresAt) {
        setTimeLeft('Vĩnh viễn (Permanent)');
      } else {
        setTimeLeft('');
      }
      return;
    }

    const updateTimer = () => {
      const diff = new Date(targetExpiry).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Đã hết hạn kỷ luật');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      if (days > 0) {
        setTimeLeft(`${days} ngày ${hours} giờ ${minutes} phút`);
      } else if (hours > 0) {
        setTimeLeft(`${hours} giờ ${minutes} phút ${seconds} giây`);
      } else {
        setTimeLeft(`${minutes} phút ${seconds} giây`);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeSanction]);

  if (!activeSanction) return null;

  const isBanned = Boolean(activeSanction.isBanned);
  const tierType = activeSanction.lastSanctionType;

  // Roblox title mapping matching the exact 5 tiers
  const getRobloxHeaderTitle = () => {
    switch (tierType as string) {
      case 'level_1':
      case 'warn':
        return 'Cảnh Báo (Warning)';
      case 'level_2':
      case 'chat_lock_1h':
        return 'Tạm Khóa Chat 1 Tiếng (Chat Suspended for 1 Hour)';
      case 'chat_lock_15m':
        return 'Tạm Khóa Chat 15 Phút (Chat Suspended for 15 Minutes)';
      case 'level_3':
      case 'ban_1d':
        return 'Khóa Tài Khoản 1 Ngày (Banned for 1 Day)';
      case 'ban_3d':
        return 'Khóa Tài Khoản 3 Ngày (Banned for 3 Days)';
      case 'level_4':
      case 'ban_7d':
        return 'Khóa Tài Khoản 7 Ngày (Banned for 7 Days)';
      case 'ban_6m':
        return 'Khóa Tài Khoản 6 Tháng (Banned for 6 Months)';
      case 'level_perm':
      case 'ban_perm':
      default:
        return 'Tài Khoản Đã Bị Xóa Vĩnh Viễn (Account Deleted / Terminated)';
    }
  };

  const handleAcknowledgeAndContinue = () => {
    if (!agreedTerms && !isBanned) return;
    
    if (activeSanction) {
      const ackKey = `cloudsend_ack_sanction_${activeSanction.uid}_${activeSanction.lastSanctionType}_${activeSanction.violationCount}`;
      localStorage.setItem(ackKey, 'true');
    }
    setActiveSanction(null);
  };

  const rawDate = activeSanction.bannedAt || (activeSanction.history && activeSanction.history[0]?.timestamp);
  const formattedReviewedDate = rawDate 
    ? new Date(rawDate).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'medium' })
    : new Date().toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'medium' });

  // Latest offensive items & notes from history or sanction record
  const latestHistory = activeSanction.history?.[0];
  const offensiveReason = activeSanction.reason || latestHistory?.reason || 'Ngôn từ không phù hợp hoặc vi phạm nội quy tiêu chuẩn cộng đồng';
  const moderatorNote = activeSanction.remindText || latestHistory?.remindText || 'Hệ thống an toàn VeloX ghi nhận lời nói của bạn chưa phù hợp với Tiêu chuẩn Cộng đồng. Lần này chỉ nhắc nhở nhẹ thôi nhé, hãy luôn giữ thái độ lịch sự, văn minh và tôn trọng mọi người trong các cuộc trò chuyện nha :))';
  const ruleViolated = activeSanction.ruleViolated || latestHistory?.ruleViolated || 'Tiêu Chuẩn & Nội Quy Cộng Đồng VeloX';
  const offensiveItem = activeSanction.offensiveItem || latestHistory?.offensiveItem || '';
  const offensiveTime = activeSanction.offensiveItemTimestamp || latestHistory?.timestamp || rawDate;
  const offenderName = activeSanction.displayName || activeSanction.senderName || latestHistory?.senderName || activeSanction.email || 'Người dùng';
  const offenderEmail = activeSanction.email || activeSanction.senderEmail || '';
  const actedBy = activeSanction.actedBy || latestHistory?.actedBy || 'Đội Ngũ Kiểm Duyệt & An Toàn VeloX';

  const formattedOffensiveTime = offensiveTime
    ? new Date(offensiveTime).toLocaleString('vi-VN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      })
    : formattedReviewedDate;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-[2px] animate-in fade-in duration-150 select-text overflow-y-auto">
      {/* Main Roblox-Style Notice Box - Compact & Sleek */}
      <div 
        id="roblox-moderation-modal"
        className="w-full max-w-md bg-slate-900 border-2 border-slate-700/90 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col relative z-10 my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Roblox Header Ribbon */}
        <div className={`px-4 py-3 border-b flex items-center justify-between ${
          isBanned ? 'bg-rose-950/80 border-rose-500/50 text-rose-200' : 'bg-amber-950/70 border-amber-500/50 text-amber-200'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${
              isBanned ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-inner' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-inner'
            }`}>
              {isBanned ? <Ban className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-slate-300 font-mono">
                  CLSend Moderation
                </span>
                {activeSanction.violationCount > 1 && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 border border-rose-500 text-rose-200 font-mono">
                    Lần {activeSanction.violationCount}
                  </span>
                )}
              </div>
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white uppercase font-sans mt-0.5 truncate">
                {getRobloxHeaderTitle()}
              </h2>
            </div>
          </div>

          <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-700 text-slate-200 shrink-0">
            {activeSanction.severityLevel?.toUpperCase() || 'VIOLATION'}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-3 text-xs text-slate-200 leading-relaxed overflow-y-auto max-h-[65vh] scrollbar-thin scrollbar-thumb-slate-700 overscroll-contain">
          
          {/* Main Statement */}
          <div className="space-y-1.5 border-b border-slate-800 pb-3">
            <p className="text-slate-300 text-xs">
              Hệ thống an toàn ghi nhận tài khoản trên <strong className="text-white">CLSend</strong> đã vi phạm <strong className="text-emerald-400">Tiêu chuẩn Cộng đồng</strong>.
            </p>
            
            <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between flex-wrap gap-1.5 pt-0.5">
              <span>Reviewed: <strong className="text-slate-200">{formattedReviewedDate}</strong></span>
              {ruleViolated && (
                <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 text-[10px]">
                  {ruleViolated}
                </span>
              )}
            </div>

            {timeLeft && (
              <div className="text-[11px] text-rose-300 font-bold flex items-center gap-1 pt-1">
                <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Thời hạn hiệu lực: <strong className="text-white font-mono bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">{timeLeft}</strong></span>
              </div>
            )}
          </div>

          {/* 3 THÔNG TIN BÊN NGƯỜI NHẬN THEO YÊU CẦU: */}
          {/* 1. THÔNG TIN NGƯỜI GỬI / TÀI KHOẢN & NGƯỜI XỬ LÝ */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-sky-400" />
              <span>2. Người gửi & Tài khoản vi phạm:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[9px] text-slate-400 uppercase font-mono">Tên người gửi / vi phạm:</div>
                <div className="text-white font-bold truncate mt-0.5">{offenderName}</div>
                {offenderEmail && <div className="text-[9px] text-slate-500 truncate font-mono">{offenderEmail}</div>}
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="text-[9px] text-slate-400 uppercase font-mono">Người ban hành kỷ luật:</div>
                <div className="text-amber-300 font-bold truncate mt-0.5">{actedBy}</div>
                <div className="text-[9px] text-emerald-400 font-mono">Hệ Thống An Toàn CLSend</div>
              </div>
            </div>
          </div>

          {/* 2. NỘI DUNG VI PHẠM & THỜI GIAN */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-rose-500/30 space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <Quote className="w-3 h-3 text-rose-400" />
                <span>1. Nội dung vi phạm:</span>
              </div>
              <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                <Clock className="w-2.5 h-2.5 text-amber-400" />
                <span>3. Thời gian: <strong className="text-slate-200">{formattedOffensiveTime}</strong></span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-rose-500/40 text-rose-200 font-mono text-xs break-words whitespace-pre-wrap leading-relaxed shadow-inner">
              {offensiveItem ? offensiveItem : `"${offensiveReason}"`}
            </div>
          </div>

          {/* Moderator Note Section */}
          <div className="p-3 rounded-xl bg-[#030814] border border-cyan-900/50 space-y-1.5 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-cyan-400" />
              <span>Ghi chú của Người Kiểm Duyệt (Moderator Note):</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#020712] border border-[#1e3a5f] text-cyan-300 italic text-xs font-sans tracking-wide shadow-inner break-words whitespace-pre-wrap leading-relaxed">
              {moderatorNote}
            </div>
          </div>

          {/* Reason Section */}
          <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3 text-rose-400" />
              <span>Lý do kỷ luật (Reason):</span>
            </div>
            <div className="text-xs text-white font-semibold break-words">
              {offensiveReason}
            </div>
          </div>

          {/* Interactive acknowledgement checkbox for warning / chat lock */}
          {!isBanned && (
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500 mt-0.5 shrink-0 cursor-pointer"
              />
              <span className="text-[11px] text-slate-300 font-medium select-none">
                Tôi đồng ý tuân thủ Nội quy và Tiêu chuẩn Cộng đồng CLSend (I Agree).
              </span>
            </label>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2">
          {onOpenRules ? (
            <button
              type="button"
              onClick={onOpenRules}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Scale className="w-3 h-3" />
              <span>12 Điều Luật</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {isBanned ? (
              <button
                type="button"
                onClick={logout}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng Xuất</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!agreedTerms}
                onClick={handleAcknowledgeAndContinue}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Tiếp Tục</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
