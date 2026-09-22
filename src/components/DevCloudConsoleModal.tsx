import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  ShieldAlert, 
  Users, 
  MessagesSquare, 
  Eye, 
  Trash2, 
  Ban, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Search, 
  FileText, 
  Image as ImageIcon, 
  Lock, 
  Unlock,
  Radio,
  Flame,
  UserX,
  RefreshCw,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Filter,
  Monitor,
  Smartphone,
  ExternalLink,
  Database
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { ChatRoom, ChatMessage, UserSanction, UserDevice } from '../types';
import { applyDevSanction, removeDevSanction } from '../utils/devModeration';
import { runDevContentAudit, censorProfanity, ContentAuditReport } from '../utils/moderation';

interface DevCloudConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  isStandalone?: boolean;
  onSwitchToStandalone?: () => void;
}

interface UserAuditProfile {
  uid: string;
  email: string;
  displayName: string;
  deviceName: string;
  avatarColor: string;
  isOnline: boolean;
  lastActive: string;
  messages: (ChatMessage & { roomId: string; roomName: string })[];
  sanction?: UserSanction;
  auditReport: ContentAuditReport;
}

export const DevCloudConsoleModal: React.FC<DevCloudConsoleModalProps> = ({ 
  isOpen, 
  onClose,
  isStandalone = false,
  onSwitchToStandalone
}) => {
  const { currentUser } = useAuth();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'users_audit' | 'rooms_feed' | 'bans_manager'>('users_audit');
  
  // Rooms & Messages state
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [allMessagesByRoom, setAllMessagesByRoom] = useState<Record<string, (ChatMessage & { roomId: string; roomName: string })[]>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Online presence and sanctions list
  const [onlineUsers, setOnlineUsers] = useState<UserDevice[]>([]);
  const [sanctionsList, setSanctionsList] = useState<UserSanction[]>([]);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // User Selection for Deep Audit
  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'danger' | 'banned' | 'online'>('all');

  // Target user discipline modal
  const [targetUserForSanction, setTargetUserForSanction] = useState<{
    uid: string;
    email: string;
    displayName: string;
    currentSanction?: UserSanction;
  } | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [isProcessingSanction, setIsProcessingSanction] = useState(false);

  // Preview full image modal
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 1. Subscribe to all chat rooms, presence, and sanctions in Cloud
  useEffect(() => {
    if (!isOpen) return;

    // Rooms
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      const list: ChatRoom[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));
      setRooms(list);
      if (!selectedRoomId && list.length > 0) {
        setSelectedRoomId(list[0].id);
      }
    });

    // Presence (Online devices)
    const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
      const users: UserDevice[] = snap.docs.map(d => d.data() as UserDevice);
      setOnlineUsers(users);
    });

    // Sanctions / Bans
    const unsubSanctions = onSnapshot(collection(db, 'sanctions'), (snap) => {
      const list: UserSanction[] = [];
      const seen = new Set<string>();
      snap.docs.forEach(d => {
        const item = d.data() as UserSanction;
        const key = (item.email || item.uid).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      });
      setSanctionsList(list);
    });

    return () => {
      unsubRooms();
      unsubPresence();
      unsubSanctions();
    };
  }, [isOpen, selectedRoomId]);

  // 2. Fetch / subscribe to messages across rooms to aggregate cross-room user chats
  useEffect(() => {
    if (!isOpen || rooms.length === 0) return;
    setIsLoadingMessages(true);

    const unsubscribers: (() => void)[] = [];

    rooms.forEach(room => {
      const q = query(
        collection(db, 'rooms', room.id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const unsub = onSnapshot(q, (snap) => {
        const msgs = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          roomId: room.id,
          roomName: room.name
        } as ChatMessage & { roomId: string; roomName: string }));

        setAllMessagesByRoom(prev => ({
          ...prev,
          [room.id]: msgs
        }));
        setIsLoadingMessages(false);
      }, (err) => {
        console.warn(`Error fetching messages for room ${room.id}:`, err);
        setIsLoadingMessages(false);
      });

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach(u => u());
    };
  }, [isOpen, rooms]);

  // Aggregate all messages into a flat array
  const allMessagesFlat = useMemo(() => {
    const list: (ChatMessage & { roomId: string; roomName: string })[] = [];
    Object.values(allMessagesByRoom).forEach(roomMsgs => {
      list.push(...roomMsgs);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allMessagesByRoom]);

  // 3. Build User Audit Profiles Map (aggregates by senderId/email/presence)
  const auditUsersList: UserAuditProfile[] = useMemo(() => {
    const userMap = new Map<string, UserAuditProfile>();

    // A. Add from all messages sent
    allMessagesFlat.forEach(msg => {
      const uid = msg.senderId;
      if (!uid) return;

      const email = (msg as any).senderEmail || `${uid}@user.cloudsend`;
      const displayName = msg.senderName || 'Người dùng';
      const deviceName = msg.senderDevice || 'Thiết bị';

      if (!userMap.has(uid)) {
        userMap.set(uid, {
          uid,
          email,
          displayName,
          deviceName,
          avatarColor: '#10b981',
          isOnline: false,
          lastActive: msg.createdAt,
          messages: [],
          sanction: undefined,
          auditReport: {
            riskLevel: 'clean',
            riskScore: 0,
            summary: '',
            violationsFound: [],
            suggestedAction: ''
          }
        });
      }

      const user = userMap.get(uid)!;
      user.messages.push(msg);
      if (new Date(msg.createdAt).getTime() > new Date(user.lastActive).getTime()) {
        user.lastActive = msg.createdAt;
      }
      if ((msg as any).senderEmail && (!user.email || user.email.includes('@user.cloudsend'))) {
        user.email = (msg as any).senderEmail;
      }
    });

    // B. Merge with presence (online users)
    onlineUsers.forEach(device => {
      const uid = device.uid;
      if (!uid) return;

      if (!userMap.has(uid)) {
        userMap.set(uid, {
          uid,
          email: device.email || `${uid}@user.cloudsend`,
          displayName: device.displayName || 'Người dùng',
          deviceName: device.deviceName || 'Thiết bị',
          avatarColor: device.avatarColor || '#10b981',
          isOnline: true,
          lastActive: device.lastSeen ? new Date(device.lastSeen).toISOString() : new Date().toISOString(),
          messages: [],
          sanction: undefined,
          auditReport: {
            riskLevel: 'clean',
            riskScore: 0,
            summary: '',
            violationsFound: [],
            suggestedAction: ''
          }
        });
      } else {
        const u = userMap.get(uid)!;
        u.isOnline = true;
        if (device.avatarColor) u.avatarColor = device.avatarColor;
        if (device.email && (!u.email || u.email.includes('@user.cloudsend'))) u.email = device.email;
        if (device.deviceName) u.deviceName = device.deviceName;
      }
    });

    // C. Merge with sanctions list (check ban status and violation history)
    sanctionsList.forEach(s => {
      let targetUser: UserAuditProfile | undefined;
      for (const u of userMap.values()) {
        if (u.uid === s.uid || (s.email && u.email && s.email.toLowerCase() === u.email.toLowerCase())) {
          targetUser = u;
          break;
        }
      }

      if (targetUser) {
        targetUser.sanction = s;
        if (s.email) targetUser.email = s.email;
      } else {
        // User is not in messages or presence, but has a sanction record
        userMap.set(s.uid, {
          uid: s.uid,
          email: s.email,
          displayName: s.displayName || s.email,
          deviceName: 'Thiết bị',
          avatarColor: '#f43f5e',
          isOnline: false,
          lastActive: s.bannedAt || new Date().toISOString(),
          messages: [],
          sanction: s,
          auditReport: {
            riskLevel: s.isBanned ? 'danger' : 'warning',
            riskScore: s.isBanned ? 90 : 40,
            summary: `Tài khoản đã có tiền án: ${s.lastSanctionType}.`,
            violationsFound: [],
            suggestedAction: ''
          }
        });
      }
    });

    // D. Run automatic AI / Content scan on each user's messages to determine real-time risk score
    userMap.forEach(u => {
      const report = runDevContentAudit(u.messages);
      // If user is already banned or sanctioned, reflect that
      if (u.sanction?.isBanned) {
        report.riskLevel = 'danger';
        report.riskScore = Math.max(report.riskScore, 90);
        report.summary = `⛔ Đang bị BANNED (${u.sanction.lastSanctionType === 'ban_3d' ? '3 ngày' : u.sanction.lastSanctionType === 'ban_6m' ? '6 tháng' : 'Vĩnh viễn'}). Lý do: "${u.sanction.reason}". ${report.summary}`;
      } else if (u.sanction?.violationCount && u.sanction.violationCount > 0) {
        report.riskScore = Math.max(report.riskScore, 40);
        report.summary = `⚠️ Đã từng bị kỷ luật (${u.sanction.violationCount} lần). ${report.summary}`;
      }
      u.auditReport = report;
    });

    return Array.from(userMap.values()).sort((a, b) => {
      // Prioritize danger/banned users first, then by last active
      if (a.auditReport.riskScore !== b.auditReport.riskScore) {
        return b.auditReport.riskScore - a.auditReport.riskScore;
      }
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });
  }, [allMessagesFlat, onlineUsers, sanctionsList]);

  // Filtered users in the Avatar roster
  const filteredUsers = useMemo(() => {
    return auditUsersList.filter(u => {
      // Search text
      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        const matchName = u.displayName.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchDevice = u.deviceName.toLowerCase().includes(q);
        const matchUid = u.uid.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDevice && !matchUid) return false;
      }

      // Quick filter
      if (riskFilter === 'danger') {
        return u.auditReport.riskLevel === 'danger' || u.auditReport.violationsFound.length > 0;
      }
      if (riskFilter === 'banned') {
        return u.sanction?.isBanned;
      }
      if (riskFilter === 'online') {
        return u.isOnline;
      }

      return true;
    });
  }, [auditUsersList, userSearchQuery, riskFilter]);

  // Selected User for Deep Audit
  const selectedUser = useMemo(() => {
    if (!selectedUserUid) return null;
    return auditUsersList.find(u => u.uid === selectedUserUid) || null;
  }, [auditUsersList, selectedUserUid]);

  if (!isOpen) return null;

  // Execute Dev Sanction (Lần 1 Cảnh cáo, Lần 2 Ban 3 ngày, Lần 3 Ban 6 tháng, Lần 4 Vĩnh viễn)
  const handleApplySanction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserForSanction || !currentUser?.email) return;

    setIsProcessingSanction(true);
    try {
      const result = await applyDevSanction({
        targetUid: targetUserForSanction.uid,
        targetEmail: targetUserForSanction.email,
        targetDisplayName: targetUserForSanction.displayName,
        reason: customReason.trim() || 'Nội dung gửi vi phạm tiêu chuẩn cộng đồng',
        devEmail: currentUser.email
      });

      const banLabel = 
        result.lastSanctionType === 'warn' ? '⚠️ Đã gửi CẢNH CÁO LẦN 1' :
        result.lastSanctionType === 'ban_3d' ? '🚨 Đã BANNED 3 NGÀY (Lần vi phạm 2 - Chặn Gmail)' :
        result.lastSanctionType === 'ban_6m' ? '🚨 Đã BANNED 6 THÁNG (Lần vi phạm 3 - Chặn Gmail)' :
        '⛔ ĐÃ BANNED VĨNH VIỄN (Vi phạm từ 4 lần trở lên)';

      setActionSuccessMsg(`${banLabel} cho [${targetUserForSanction.displayName} - ${targetUserForSanction.email}]`);
      setTimeout(() => setActionSuccessMsg(null), 8000);
      setTargetUserForSanction(null);
      setCustomReason('');
    } catch (err: any) {
      alert('Không thể thực thi xử phạt: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsProcessingSanction(false);
    }
  };

  // Dev Delete any violating message directly from Cloud Firestore
  const handleDeleteViolatingMessage = async (msg: ChatMessage & { roomId: string }) => {
    if (!window.confirm(`Xác nhận XÓA / TIÊU HỦY tin nhắn này của "${msg.senderName}" khỏi Cloud Firestore?`)) return;
    try {
      await deleteDoc(doc(db, 'rooms', msg.roomId, 'messages', msg.id));
      setActionSuccessMsg(`Đã xóa vĩnh viễn tin nhắn [ID: ${msg.id}]`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Lỗi khi xóa tin nhắn: ' + err?.message);
    }
  };

  // Dev Bulk Delete all messages of this user
  const handleBulkDeleteUserMessages = async (u: UserAuditProfile) => {
    if (u.messages.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA TOÀN BỘ ${u.messages.length} tin nhắn và ảnh của "${u.displayName}" khỏi tất cả các phòng Cloud?`)) return;

    try {
      let count = 0;
      for (const m of u.messages) {
        await deleteDoc(doc(db, 'rooms', m.roomId, 'messages', m.id));
        count++;
      }
      setActionSuccessMsg(`Đã xóa sạch ${count} tin nhắn của ${u.displayName}`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Lỗi xóa tin nhắn: ' + err?.message);
    }
  };

  // Dev Unban a user
  const handleUnban = async (sanction: UserSanction) => {
    if (!window.confirm(`Mở khóa (UNBAN) cho tài khoản Gmail: ${sanction.email}?`)) return;
    try {
      await removeDevSanction(sanction.email, sanction.uid);
      setActionSuccessMsg(`Đã gỡ lệnh cấm cho Gmail: ${sanction.email}`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Lỗi gỡ cấm: ' + err?.message);
    }
  };

  if (!isOpen && !isStandalone) return null;

  const consoleInner = (
    <div 
      id={isStandalone ? "dev-cloud-console-page" : "dev-cloud-console-modal"}
      className={isStandalone
        ? "w-full h-full flex flex-col bg-slate-950 overflow-hidden"
        : "bg-slate-950 border-2 border-emerald-500/60 rounded-2xl sm:rounded-3xl w-full max-w-6xl shadow-2xl shadow-emerald-950/50 flex flex-col h-[94vh] overflow-hidden"
      }
    >
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-900 border-b border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span className="text-emerald-400">DEV</span> CLOUD AUDIT & MODERATION CONSOLE
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                MASTER PRIVILEGE
              </span>
              {isStandalone && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-semibold">
                  <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                  TRANG RIÊNG BIỆT (STANDALONE)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Toàn quyền kiểm soát: Bấm Icon người dùng để xem lại toàn bộ tin nhắn & Hệ thống tự động quét từ ngữ lách luật (f.u.c.k, d.i.t...), link lạ, ảnh nhạy cảm.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isStandalone ? (
            <>
              <button
                type="button"
                onClick={() => window.open('/', '_blank')}
                title="Mở thêm CloudSend ở tab khác để làm việc song song (Gửi nhận file, chat)"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở CloudSend (Tab mới)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Quay lại ứng dụng chính CloudSend"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Về CloudSend</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  window.open('/?page=datastore', '_blank');
                  onClose();
                }}
                title="Mở TRANG DATASTORE (Kho dữ liệu Firestore trực tiếp) trong Tab Mới"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Trang DATASTORE</span>
              </button>
              {onSwitchToStandalone && (
                <button
                  type="button"
                  onClick={onSwitchToStandalone}
                  title="Chuyển sang trang riêng toàn màn hình"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
                >
                  <span>Toàn trang</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Đóng bảng điều khiển"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

        {/* Global Action Banner */}
        {actionSuccessMsg && (
          <div className="px-4 py-2 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('users_audit');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'users_audit'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Thành viên & Kiểm toán AI ({auditUsersList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rooms_feed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'rooms_feed'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MessagesSquare className="w-4 h-4" />
            <span>Xem theo Phòng chat ({rooms.length} phòng)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bans_manager')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'bans_manager'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Ban className="w-4 h-4" />
            <span>Danh sách Banned & Kỷ luật ({sanctionsList.length})</span>
          </button>
        </div>

        {/* TAB 1: USERS AVATAR ROSTER & DEEP AI CONTENT AUDIT */}
        {activeTab === 'users_audit' && (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-slate-950">
            {/* View A: When NO user is selected OR on desktop left list */}
            <div className={`flex-1 min-h-0 flex flex-col ${selectedUser ? 'hidden md:flex md:w-80 md:flex-none border-r border-slate-800' : 'w-full'}`}>
              {/* Search & Filter Bar */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/40 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm tên, Gmail, UID, thiết bị..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                  <button
                    type="button"
                    onClick={() => setRiskFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      riskFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Tất cả ({auditUsersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskFilter('danger')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                      riskFilter === 'danger' ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' : 'text-rose-400 hover:bg-rose-500/10'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Có vi phạm
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskFilter('banned')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                      riskFilter === 'banned' ? 'bg-red-600/30 text-red-200 border border-red-500/50' : 'text-red-400 hover:bg-red-500/10'
                    }`}
                  >
                    <Ban className="w-3 h-3" />
                    Banned
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskFilter('online')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                      riskFilter === 'online' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    Online
                  </button>
                </div>
              </div>

              {/* Users Grid / Card List */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    Không tìm thấy người dùng phù hợp bộ lọc.
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const isSelected = selectedUserUid === u.uid;
                    const hasBypass = u.auditReport.violationsFound.some(v => v.type === 'profanity_bypass');
                    const isBanned = u.sanction?.isBanned;

                    return (
                      <div
                        key={u.uid}
                        onClick={() => setSelectedUserUid(u.uid)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected 
                            ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/40' 
                            : isBanned
                            ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/70'
                            : hasBypass
                            ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/70'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        {/* Avatar Icon */}
                        <div className="relative shrink-0">
                          <div 
                            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-md transition-transform hover:scale-105"
                            style={{ backgroundColor: u.avatarColor || '#10b981' }}
                          >
                            {(u.displayName || 'U')[0].toUpperCase()}
                          </div>
                          {/* Online indicator */}
                          {u.isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 ring-1 ring-emerald-400 animate-pulse" />
                          )}
                        </div>

                        {/* Info details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">{u.displayName}</span>
                            {isBanned ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                BANNED
                              </span>
                            ) : hasBypass ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                LÁCH LUẬT
                              </span>
                            ) : null}
                          </div>

                          <div className="text-[11px] text-emerald-400 font-mono truncate font-medium">
                            {u.email}
                          </div>

                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{u.messages.length} tin nhắn</span>
                            <span>•</span>
                            <span className="truncate max-w-[100px]">{u.deviceName}</span>
                          </div>
                        </div>

                        {/* Action arrow */}
                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-emerald-400 translate-x-1' : 'text-slate-600'}`} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* View B: User Deep Audit & AI Content Inspector */}
            <div className={`flex-1 min-h-0 flex flex-col bg-slate-950 ${!selectedUser ? 'hidden md:flex items-center justify-center' : ''}`}>
              {!selectedUser ? (
                <div className="text-center p-8 max-w-md text-slate-500 space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
                    <Users className="w-8 h-8 opacity-70" />
                  </div>
                  <div className="text-sm font-bold text-slate-300">
                    Chọn một Icon Đại diện của người dùng
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Hệ thống sẽ ngay lập tức mở toàn bộ các đoạn chat, hình ảnh đã gửi và kích hoạt hệ thống tự động quét nội dung hỗ trợ Dev (phát hiện từ lách luật như f.u.c.k, d.i.t, link lạ, ảnh nhạy cảm).
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Selected User Header */}
                  <div className="p-3.5 sm:p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedUserUid(null)}
                        className="md:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                        title="Quay lại danh sách"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      {/* Large Avatar Icon */}
                      <div 
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shrink-0 border border-white/10"
                        style={{ backgroundColor: selectedUser.avatarColor || '#10b981' }}
                      >
                        {(selectedUser.displayName || 'U')[0].toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-bold text-white">{selectedUser.displayName}</span>
                          {selectedUser.isOnline && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Đang trực tuyến
                            </span>
                          )}
                          {selectedUser.sanction?.isBanned && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              BANNED ({selectedUser.sanction.lastSanctionType === 'ban_3d' ? '3 NGÀY' : selectedUser.sanction.lastSanctionType === 'ban_6m' ? '6 THÁNG' : 'VĨNH VIỄN'})
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-emerald-400 font-mono flex items-center gap-2 flex-wrap">
                          <span>Gmail: <strong>{selectedUser.email}</strong></span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400 font-sans text-[11px]">Thiết bị: {selectedUser.deviceName}</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-500 text-[10px]">UID: {selectedUser.uid}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons for this user */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Apply Sanction Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setTargetUserForSanction({
                            uid: selectedUser.uid,
                            email: selectedUser.email,
                            displayName: selectedUser.displayName,
                            currentSanction: selectedUser.sanction
                          });
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center gap-1.5 transition-all"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Kỷ luật / Phạt bậc thang</span>
                      </button>

                      {/* Unban button if banned */}
                      {selectedUser.sanction?.isBanned && (
                        <button
                          type="button"
                          onClick={() => handleUnban(selectedUser.sanction!)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Gỡ cấm</span>
                        </button>
                      )}

                      {/* Bulk delete messages */}
                      {selectedUser.messages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleBulkDeleteUserMessages(selectedUser)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                          title="Xóa toàn bộ tin nhắn của người này khỏi Cloud"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* AUTOMATED AI / HEURISTIC SCANNER REPORT BANNER */}
                  <div className="p-3.5 bg-slate-900/60 border-b border-slate-800">
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      selectedUser.auditReport.riskLevel === 'danger'
                        ? 'bg-rose-950/30 border-rose-500/60 text-rose-200'
                        : selectedUser.auditReport.riskLevel === 'warning'
                        ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                        : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          {selectedUser.auditReport.riskLevel === 'danger' ? (
                            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
                          ) : selectedUser.auditReport.riskLevel === 'warning' ? (
                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                          )}

                          <div>
                            <div className="text-xs font-bold flex items-center gap-2">
                              <span>HỆ THỐNG TỰ ĐỘNG QUÉT NỘI DUNG HỖ TRỢ DEV:</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-black ${
                                selectedUser.auditReport.riskLevel === 'danger'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                                  : selectedUser.auditReport.riskLevel === 'warning'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                              }`}>
                                {selectedUser.auditReport.riskLevel === 'danger' ? 'NGUY CƠ CAO' : selectedUser.auditReport.riskLevel === 'warning' ? 'CẦN LƯU Ý' : 'AN TOÀN'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                (Điểm vi phạm: {selectedUser.auditReport.riskScore}/100)
                              </span>
                            </div>

                            <p className="text-xs mt-1 leading-relaxed opacity-95">
                              {selectedUser.auditReport.summary}
                            </p>

                            {/* Detected violations list tags */}
                            {selectedUser.auditReport.violationsFound.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {selectedUser.auditReport.violationsFound.map((v, i) => (
                                  <span 
                                    key={i} 
                                    className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-semibold flex items-center gap-1"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                                    <span>{v.description}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Recommendation */}
                            <div className="mt-2 text-[11px] font-medium opacity-90 text-slate-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>{selectedUser.auditReport.suggestedAction}</span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Trigger Discipline Button from Scanner */}
                        {selectedUser.auditReport.riskLevel !== 'clean' && !selectedUser.sanction?.isBanned && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetUserForSanction({
                                uid: selectedUser.uid,
                                email: selectedUser.email,
                                displayName: selectedUser.displayName,
                                currentSanction: selectedUser.sanction
                              });
                              setCustomReason(selectedUser.auditReport.summary);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 shrink-0"
                          >
                            Xử lý ngay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Messages & Media Feed for Selected User */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>Các đoạn chat và ảnh người này đã gửi ({selectedUser.messages.length} tin nhắn):</span>
                      <span className="text-emerald-400 font-mono text-[11px]">Được sắp xếp mới nhất trước</span>
                    </div>

                    {selectedUser.messages.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        Người dùng này chưa gửi tin nhắn nào trong các phòng chat.
                      </div>
                    ) : (
                      selectedUser.messages.map(msg => {
                        const hasImages = msg.attachments?.filter(a => a.type?.startsWith('image/') || a.data?.startsWith('data:image/')) || [];
                        const otherFiles = msg.attachments?.filter(a => !a.type?.startsWith('image/') && !a.data?.startsWith('data:image/')) || [];
                        
                        // Check if this specific message contains bypass words using raw text
                        const rawContent = (msg as any).rawText || msg.text || '';
                        const isCensoredInChat = Boolean((msg as any).rawText && (msg as any).rawText !== msg.text);
                        const { hasProfanity, detectedList } = censorProfanity(rawContent);

                        return (
                          <div 
                            key={msg.id}
                            className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                              hasProfanity || isCensoredInChat
                                ? 'bg-rose-950/20 border-rose-500/50 hover:border-rose-500/80' 
                                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {/* Message Header */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-semibold">
                                  Phòng: {msg.roomName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(msg.createdAt).toLocaleTimeString('vi-VN')} {new Date(msg.createdAt).toLocaleDateString('vi-VN')}
                                </span>
                                {hasProfanity && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                    Từ ngữ cấm / Lách luật: {detectedList.join(', ')}
                                  </span>
                                )}
                                {isCensoredInChat && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                    Đã tự che **** trên Web
                                  </span>
                                )}
                              </div>

                              {/* Delete message button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteViolatingMessage(msg)}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Xóa tin nhắn này khỏi Cloud"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Text content - Unmasked for Dev Cloud */}
                            {rawContent && (
                              <div className="space-y-1.5">
                                <div className={`text-xs p-2.5 rounded-xl border break-words leading-relaxed ${
                                  isCensoredInChat || hasProfanity
                                    ? 'bg-slate-950 p-2.5 border-rose-500/40 text-rose-100 font-mono font-medium'
                                    : 'bg-slate-950/70 border-slate-800 text-slate-200'
                                }`}>
                                  {isCensoredInChat && (
                                    <div className="text-[11px] font-bold text-rose-400 mb-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>Nội dung gốc (Dev Cloud không che):</span>
                                    </div>
                                  )}
                                  <div>{rawContent}</div>
                                </div>
                                {isCensoredInChat && (
                                  <div className="text-[11px] text-slate-400 px-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-slate-500">Người dùng trong web chỉ thấy (đã che):</span>
                                    <span className="font-mono text-emerald-300 font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                                      {msg.text}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Images Inspection */}
                            {hasImages.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span>Hình ảnh đính kèm ({hasImages.length} ảnh):</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                  {hasImages.map((img, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => setPreviewImage(img.data)}
                                      className="relative group/img rounded-xl overflow-hidden bg-black/60 border border-slate-700 cursor-pointer aspect-video"
                                    >
                                      <img 
                                        src={img.data} 
                                        alt={img.name} 
                                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" 
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
                                        <Eye className="w-4 h-4" />
                                        <span>Xem ảnh gốc</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Other file attachments */}
                            {otherFiles.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {otherFiles.map((f, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200"
                                  >
                                    <FileText className="w-4 h-4 text-emerald-400" />
                                    <span className="font-medium truncate max-w-[180px]">{f.name}</span>
                                    <span className="text-[10px] text-slate-400">({Math.round(f.size / 1024)} KB)</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ROOMS RAW FEED AUDIT (Optional overview of chat rooms) */}
        {activeTab === 'rooms_feed' && (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Left rooms list */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/40 p-3 overflow-y-auto shrink-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Phòng chat Firestore</span>
                <span className="font-mono text-emerald-400">{rooms.length}</span>
              </div>
              <div className="space-y-1">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between text-xs ${
                      selectedRoomId === room.id
                        ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-semibold">{room.name}</div>
                      <div className={`text-[10px] ${selectedRoomId === room.id ? 'text-emerald-100' : 'text-slate-400'} truncate`}>
                        ID: {room.id}
                      </div>
                    </div>
                    {room.isPrivate && <Lock className="w-3 h-3 shrink-0 opacity-70" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Right room messages feed */}
            <div className="flex-1 min-h-0 flex flex-col bg-slate-950">
              <div className="p-3 border-b border-slate-800 bg-slate-900/30 text-xs text-slate-400">
                Hiển thị tin nhắn gần đây trong phòng đã chọn. Bấm vào người gửi để kỷ luật hoặc xóa tin nhắn vi phạm.
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {(allMessagesByRoom[selectedRoomId] || []).length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    Chưa có tin nhắn nào trong phòng này.
                  </div>
                ) : (
                  (allMessagesByRoom[selectedRoomId] || []).map(msg => (
                    <div 
                      key={msg.id}
                      className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{msg.senderName}</span>
                          <span className="text-[10px] text-emerald-400 font-mono">{(msg as any).senderEmail || `${msg.senderId?.substring(0, 8)}...`}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(msg.createdAt).toLocaleTimeString('vi-VN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserUid(msg.senderId);
                              setActiveTab('users_audit');
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold transition-colors"
                          >
                            Xem người này
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteViolatingMessage(msg)}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {(() => {
                        const rawContent = (msg as any).rawText || msg.text || '';
                        const isCensoredInChat = Boolean((msg as any).rawText && (msg as any).rawText !== msg.text);
                        if (!rawContent) return null;
                        return (
                          <div className="space-y-1">
                            <div className={`text-xs p-2.5 rounded-xl border break-words ${
                              isCensoredInChat ? 'bg-slate-950 border-rose-500/50 text-rose-100 font-mono' : 'bg-slate-950/60 border-slate-800/80 text-slate-200'
                            }`}>
                              {isCensoredInChat && (
                                <span className="text-rose-400 font-bold mr-1.5">[Nội dung gốc - Không che]:</span>
                              )}
                              <span>{rawContent}</span>
                            </div>
                            {isCensoredInChat && (
                              <div className="text-[10px] text-slate-400 px-1">
                                Web phòng chat hiển thị: <span className="text-emerald-300 font-mono">{msg.text}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BANNED & SANCTIONS MANAGER */}
        {activeTab === 'bans_manager' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-950">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Quy tắc kỷ luật bậc thang nghiêm ngặt:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-amber-300/90 text-[11px]">
                  <li><strong>Lần 1</strong>: Cảnh cáo thành viên (nhắc nhở nội quy).</li>
                  <li><strong>Lần 2</strong>: Banned tài khoản trong <strong>3 ngày</strong> (Chặn hoàn toàn Gmail đăng nhập).</li>
                  <li><strong>Lần 3</strong>: Banned tài khoản trong <strong>6 tháng</strong> (Chặn hoàn toàn Gmail đăng nhập).</li>
                  <li><strong>Lần 4 trở đi</strong>: Banned <strong>VĨNH VIỄN</strong> tài khoản đó.</li>
                </ul>
              </div>

              {sanctionsList.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Chưa có tài khoản nào bị phạt hoặc cấm.
                </div>
              ) : (
                <div className="space-y-3">
                  {sanctionsList.map(item => {
                    const isBanExpired = item.banExpiresAt && new Date(item.banExpiresAt).getTime() < Date.now();
                    const badgeColor = 
                      item.lastSanctionType === 'warn' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                      item.lastSanctionType === 'ban_3d' ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' :
                      item.lastSanctionType === 'ban_6m' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                      'bg-red-700/30 text-red-200 border-red-500/60 font-black';

                    const sanctionLabel = 
                      item.lastSanctionType === 'warn' ? 'CẢNH CÁO' :
                      item.lastSanctionType === 'ban_3d' ? 'BANNED 3 NGÀY' :
                      item.lastSanctionType === 'ban_6m' ? 'BANNED 6 THÁNG' :
                      'BANNED VĨNH VIỄN';

                    return (
                      <div 
                        key={item.email || item.uid}
                        className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{item.displayName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${badgeColor}`}>
                              {sanctionLabel} (Lần vi phạm: {item.violationCount})
                            </span>
                            {isBanExpired && (
                              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                Đã hết hạn cấm
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-emerald-400 font-mono font-semibold">
                            Gmail: {item.email}
                          </div>
                          <div className="text-xs text-slate-300">
                            Lý do phạt: <span className="italic text-slate-200">"{item.reason}"</span>
                          </div>
                          {item.banExpiresAt && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Hết hạn cấm lúc: {new Date(item.banExpiresAt).toLocaleString('vi-VN')}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserUid(item.uid);
                              setActiveTab('users_audit');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                          >
                            Kiểm toán lại
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUnban(item)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors flex items-center gap-1"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Gỡ cấm (Unban)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Apply Progressive Sanction to Target User */}
        {targetUserForSanction && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border-2 border-rose-500/50 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <UserX className="w-4 h-4" />
                  <span>Kỷ luật tài khoản thành viên</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetUserForSanction(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div>Thành viên: <strong className="text-white">{targetUserForSanction.displayName}</strong></div>
                <div>Gmail bị chặn: <strong className="text-emerald-400 font-mono">{targetUserForSanction.email}</strong></div>
                <div>Tiền án hiện tại: <span className="text-amber-400 font-bold">{targetUserForSanction.currentSanction?.violationCount || 0} lần vi phạm</span></div>
              </div>

              <form onSubmit={handleApplySanction} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Lý do xử phạt (sẽ hiển thị khi họ đăng nhập):
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Ví dụ: Cố tình lách luật ghi từ ngữ thô tục, gửi hình ảnh nhạy cảm..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Progressive Ladder Display */}
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] leading-relaxed">
                  ⚡ <strong>Cấp độ kỷ luật tiếp theo sẽ được áp dụng:</strong>
                  {(() => {
                    const nextCount = (targetUserForSanction.currentSanction?.violationCount || 0) + 1;
                    return (
                      <div className="mt-1 font-bold text-rose-300">
                        {nextCount === 1 && '👉 Lần 1: CẢNH CÁO thành viên (nhắc nhở nội quy)'}
                        {nextCount === 2 && '👉 Lần 2: BANNED 3 NGÀY (Khóa hoàn toàn tài khoản & chặn Gmail)'}
                        {nextCount === 3 && '👉 Lần 3: BANNED 6 THÁNG (Khóa hoàn toàn tài khoản & chặn Gmail)'}
                        {nextCount >= 4 && `👉 Lần ${nextCount}: BANNED VĨNH VIỄN (Thẳng tay xóa quyền truy cập vĩnh viễn)`}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTargetUserForSanction(null)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessingSanction}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isProcessingSanction ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                    <span>Xác nhận Kỷ luật</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Full Image Preview Modal */}
        {previewImage && (
          <div 
            className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/95 animate-in fade-in"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute -top-10 right-0 p-2 text-white hover:text-rose-400"
              >
                <X className="w-6 h-6" />
              </button>
              <img
                src={previewImage}
                alt="Audit preview"
                className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-slate-700 shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>
    );

  if (isStandalone) {
    return (
      <div className="w-full h-screen max-h-screen flex flex-col bg-slate-950 overflow-hidden text-slate-100 select-text">
        {consoleInner}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      {consoleInner}
    </div>
  );
};
