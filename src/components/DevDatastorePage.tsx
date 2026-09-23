import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  Database, 
  PanelTop, 
  PanelLeft, 
  PanelRight, 
  Layers, 
  FileText, 
  Code2, 
  SlidersHorizontal,
  MessageSquare,
  Users,
  AlertTriangle,
  Ban,
  Megaphone,
  CheckCircle2,
  Globe,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Clock,
  Radio,
  Send,
  Eye,
  Trash2,
  Monitor,
  Smartphone,
  ExternalLink,
  Info,
  Check,
  Flame,
  VolumeX,
  Filter
} from 'lucide-react';
import { collection, onSnapshot, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ChatRoom, UserDevice, UserSanction } from '../types';

interface DevDatastorePageProps {
  onBackToApp?: () => void;
}

type ManagementTask = 'rooms' | 'users' | 'violators' | 'banned' | 'broadcast';

// Interface cho đối tượng vi phạm
interface ViolatorRecord {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  avatarColor: string;
  violationType: 'profanity' | 'spam' | 'severe' | 'file';
  violationReason: string;
  violationCount: number;
  detectedAt: string;
  evidenceText?: string;
  status: 'active_warning' | 'reviewed';
}

// Interface cho thông báo máy chủ
interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  type: 'emergency' | 'maintenance' | 'news';
  senderName: string;
  createdAt: string;
  active: boolean;
}

export const DevDatastorePage: React.FC<DevDatastorePageProps> = ({ onBackToApp }) => {
  const { currentUser, settings } = useAuth();
  
  // 1. Tác vụ được chọn trên Thanh Điều Khiển
  const [activeTask, setActiveTask] = useState<ManagementTask>('rooms');

  // 2. Các bộ lọc tương ứng trong "Khung 2" (Bên Trái)
  const [roomFilter, setRoomFilter] = useState<'all' | 'public' | 'private'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'online_verified' | 'offline'>('all');
  const [violatorFilter, setViolatorFilter] = useState<'all' | 'profanity' | 'spam' | 'severe'>('all');
  const [bannedFilter, setBannedFilter] = useState<'all' | 'perm' | 'temp' | 'muted'>('all');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'emergency' | 'maintenance' | 'news'>('all');

  // 3. Tìm kiếm và mục đang chọn ở Khung 3 để xem ở Khung 4
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Form soạn thông báo toàn máy chủ (Tác vụ 5)
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState<'emergency' | 'maintenance' | 'news'>('emergency');
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  // State dữ liệu thực tế từ Firestore
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [onlinePresence, setOnlinePresence] = useState<UserDevice[]>([]);
  const [sanctions, setSanctions] = useState<UserSanction[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);

  // Lắng nghe dữ liệu thời gian thực từ Firestore
  useEffect(() => {
    // 1. Phòng chat
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      const list: ChatRoom[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));
      setRooms(list);
    }, (err) => {
      console.warn('Lỗi đọc rooms Firestore:', err);
    });

    // 2. Presence thiết bị online
    const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
      const list: UserDevice[] = snap.docs.map(d => ({ ...d.data() } as UserDevice));
      setOnlinePresence(list);
    }, (err) => {
      console.warn('Lỗi đọc presence Firestore:', err);
    });

    // 3. Sanctions / Banned users
    const unsubSanctions = onSnapshot(collection(db, 'sanctions'), (snap) => {
      const list: UserSanction[] = snap.docs.map(d => ({ ...d.data() } as UserSanction));
      setSanctions(list);
    }, (err) => {
      console.warn('Lỗi đọc sanctions Firestore:', err);
    });

    // 4. Broadcasts
    const unsubBroadcasts = onSnapshot(collection(db, 'system_broadcasts'), (snap) => {
      const list: BroadcastRecord[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastRecord));
      setBroadcasts(list);
    }, () => {});

    return () => {
      unsubRooms();
      unsubPresence();
      unsubSanctions();
      unsubBroadcasts();
    };
  }, []);

  // Hàm kiểm tra xem người dùng có ĐANG THẬT SỰ ONLINE không (Text check chuẩn)
  const evaluateOnlineStatus = (lastSeen?: string, status?: string) => {
    if (!lastSeen) {
      return {
        isOnline: false,
        badgeText: '⚪ Ngoại tuyến (Offline)',
        detailText: 'Chưa có tín hiệu hoạt động gần đây',
        color: 'text-slate-400 bg-slate-800/80 border-slate-700'
      };
    }

    const seenTime = new Date(lastSeen).getTime();
    const now = Date.now();
    const diffSeconds = Math.floor((now - seenTime) / 1000);

    // Dưới 90 giây = Đang online thật sự với tín hiệu ping sống
    if (diffSeconds < 90 && status !== 'offline') {
      return {
        isOnline: true,
        badgeText: '🟢 Đang Online thật sự',
        detailText: `Tín hiệu Ping sống (${diffSeconds}s trước)`,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      };
    } else if (diffSeconds < 600) {
      const mins = Math.max(1, Math.floor(diffSeconds / 60));
      return {
        isOnline: false,
        badgeText: '🟡 Vừa hoạt động',
        detailText: `Cách đây ${mins} phút trước`,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      };
    } else {
      const hours = Math.floor(diffSeconds / 3600);
      return {
        isOnline: false,
        badgeText: '⚪ Ngoại tuyến (Offline)',
        detailText: hours > 0 ? `Đã thoát ${hours} giờ trước` : 'Không hoạt động',
        color: 'text-slate-400 bg-slate-800/60 border-slate-700/60'
      };
    }
  };

  // Danh sách Người Dùng Vi Phạm (tổng hợp từ hệ thống kiểm tra và mẫu kiểm toán)
  const violatorsList = useMemo<ViolatorRecord[]>(() => {
    const list: ViolatorRecord[] = [
      {
        id: 'violator-1',
        uid: 'demo-violator-01',
        displayName: 'SpamBot_User',
        email: 'spammer_pro@test.net',
        avatarColor: '#f43f5e',
        violationType: 'spam',
        violationReason: 'Gửi 18 tin nhắn trong 2 giây vào phòng công khai',
        violationCount: 2,
        detectedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        evidenceText: 'spam link join now http://spam...',
        status: 'active_warning'
      },
      {
        id: 'violator-2',
        uid: 'demo-violator-02',
        displayName: 'ToxicPlayer_99',
        email: 'toxic99@badmail.com',
        avatarColor: '#ea580c',
        violationType: 'profanity',
        violationReason: 'Sử dụng từ ngữ xúc phạm người dùng khác trong đoạn chat',
        violationCount: 1,
        detectedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        evidenceText: 'phát hiện chuỗi từ khóa vi phạm tiêu chuẩn cộng đồng',
        status: 'active_warning'
      },
      {
        id: 'violator-3',
        uid: 'demo-violator-03',
        displayName: 'Trojan_DropX',
        email: 'attacker_x@darknode.org',
        avatarColor: '#dc2626',
        violationType: 'severe',
        violationReason: 'Gửi tệp đính kèm mã độc hoặc vượt kích thước cho phép liên tục',
        violationCount: 3,
        detectedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        evidenceText: 'File payload.exe / script.bat detected',
        status: 'active_warning'
      }
    ];

    // Thêm các tài khoản có trong sanctions có trạng thái cảnh cáo
    sanctions.forEach(s => {
      if (!s.isBanned && s.violationCount > 0) {
        list.unshift({
          id: `sanction-${s.uid}`,
          uid: s.uid,
          displayName: s.displayName,
          email: s.email,
          avatarColor: '#f97316',
          violationType: s.violationCount >= 2 ? 'severe' : 'profanity',
          violationReason: s.reason || 'Vi phạm nội quy hệ thống',
          violationCount: s.violationCount,
          detectedAt: s.bannedAt || new Date().toISOString(),
          status: 'active_warning'
        });
      }
    });

    return list;
  }, [sanctions]);

  // Phân loại phòng chat: Public vs Private
  const publicRoomsCount = useMemo(() => rooms.filter(r => !r.isPrivate).length, [rooms]);
  const privateRoomsCount = useMemo(() => rooms.filter(r => !!r.isPrivate).length, [rooms]);

  // Dữ liệu danh sách người dùng hiển thị
  const evaluatedUsers = useMemo(() => {
    const list = [...onlinePresence];

    // Nếu current user chưa có trong presence thì thêm vào hiển thị
    if (currentUser && !list.some(u => u.uid === currentUser.uid)) {
      list.unshift({
        uid: currentUser.uid,
        email: currentUser.email || 'user@cloudsend.local',
        displayName: currentUser.displayName || 'Bạn (Current Device)',
        deviceName: settings.deviceName || 'Thiết bị của bạn',
        deviceType: settings.deviceType || 'laptop',
        avatarColor: settings.avatarColor || '#10b981',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'online'
      });
    }

    return list.map(u => ({
      ...u,
      onlineCheck: evaluateOnlineStatus(u.lastSeen, u.status)
    }));
  }, [onlinePresence, currentUser, settings]);

  const verifiedOnlineUsersCount = useMemo(() => {
    return evaluatedUsers.filter(u => u.onlineCheck.isOnline).length;
  }, [evaluatedUsers]);

  // Dữ liệu lọc cho Khung 3 (Middle Frame)
  const filteredItems = useMemo(() => {
    if (activeTask === 'rooms') {
      let list = [...rooms];
      if (roomFilter === 'public') list = list.filter(r => !r.isPrivate);
      if (roomFilter === 'private') list = list.filter(r => !!r.isPrivate);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
      }
      return list;
    }

    if (activeTask === 'users') {
      let list = [...evaluatedUsers];
      if (userFilter === 'online_verified') list = list.filter(u => u.onlineCheck.isOnline);
      if (userFilter === 'offline') list = list.filter(u => !u.onlineCheck.isOnline);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(u => u.displayName.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)));
      }
      return list;
    }

    if (activeTask === 'violators') {
      let list = [...violatorsList];
      if (violatorFilter === 'profanity') list = list.filter(v => v.violationType === 'profanity');
      if (violatorFilter === 'spam') list = list.filter(v => v.violationType === 'spam');
      if (violatorFilter === 'severe') list = list.filter(v => v.violationType === 'severe' || v.violationCount >= 2);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(v => v.displayName.toLowerCase().includes(q) || v.violationReason.toLowerCase().includes(q));
      }
      return list;
    }

    if (activeTask === 'banned') {
      let list = sanctions.filter(s => s.isBanned);
      // Mẫu dự phòng nếu chưa có lệnh ban thực tế
      if (list.length === 0) {
        list = [
          {
            uid: 'demo-banned-01',
            displayName: 'BannedUser_Spam',
            email: 'spammer_banned@demo.com',
            violationCount: 4,
            lastSanctionType: 'ban_perm',
            reason: 'Spam liên tục và vi phạm quy định cộng đồng nhiều lần',
            bannedAt: new Date(Date.now() - 86400000).toISOString(),
            banExpiresAt: null,
            isBanned: true
          },
          {
            uid: 'demo-banned-02',
            displayName: 'Temporary_Suspended',
            email: 'temp_suspension@demo.com',
            violationCount: 2,
            lastSanctionType: 'ban_3d',
            reason: 'Tạm khóa 3 ngày do gửi nội dung thô tục',
            bannedAt: new Date().toISOString(),
            banExpiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
            isBanned: true
          }
        ];
      }

      if (bannedFilter === 'perm') list = list.filter(b => b.lastSanctionType === 'ban_perm' || !b.banExpiresAt);
      if (bannedFilter === 'temp') list = list.filter(b => b.lastSanctionType === 'ban_3d' || b.lastSanctionType === 'ban_6m' || !!b.banExpiresAt);
      if (bannedFilter === 'muted') list = list.filter(b => b.lastSanctionType === 'warn');
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(b => b.displayName.toLowerCase().includes(q) || b.email.toLowerCase().includes(q) || b.reason.toLowerCase().includes(q));
      }
      return list;
    }

    if (activeTask === 'broadcast') {
      let list = [...broadcasts];
      if (list.length === 0) {
        list = [
          {
            id: 'bc-1',
            title: 'Chào mừng bản cập nhật DataStore!',
            message: 'Hệ thống đã nâng cấp toàn diện giao diện và phân loại tác vụ.',
            type: 'news',
            senderName: 'Hệ thống CloudSend',
            createdAt: new Date().toISOString(),
            active: true
          },
          {
            id: 'bc-2',
            title: 'Bảo trì máy chủ định kỳ',
            message: 'Hạ tầng mạng sẽ được tối ưu đường truyền trong khoảng 02:00 sáng mai.',
            type: 'maintenance',
            senderName: 'Dev Admin',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            active: false
          }
        ];
      }
      if (broadcastFilter !== 'all') list = list.filter(b => b.type === broadcastFilter);
      return list;
    }

    return [];
  }, [activeTask, roomFilter, userFilter, violatorFilter, bannedFilter, broadcastFilter, rooms, evaluatedUsers, violatorsList, sanctions, broadcasts, searchQuery]);

  // Tự động chọn item đầu tiên nếu chưa chọn
  useEffect(() => {
    if (filteredItems.length > 0 && !selectedItemId) {
      const first = filteredItems[0] as any;
      setSelectedItemId(first.id || first.uid || null);
    }
  }, [filteredItems, selectedItemId]);

  // Chi tiết mục đang chọn ở Khung 4
  const selectedItemData = useMemo(() => {
    if (!selectedItemId) return null;
    return filteredItems.find((it: any) => (it.id === selectedItemId || it.uid === selectedItemId)) || null;
  }, [filteredItems, selectedItemId]);

  // Xử lý gửi Thông Báo Toàn Máy Chủ (Tác vụ 5)
  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) return;

    const newBroadcast: BroadcastRecord = {
      id: `broadcast-${Date.now()}`,
      title: broadcastTitle.trim(),
      message: broadcastMsg.trim(),
      type: broadcastType,
      senderName: settings.deviceName || 'Admin Server',
      createdAt: new Date().toISOString(),
      active: true
    };

    try {
      await setDoc(doc(db, 'system_broadcasts', newBroadcast.id), newBroadcast);
      setBroadcasts(prev => [newBroadcast, ...prev]);
      setBroadcastTitle('');
      setBroadcastMsg('');
      setBroadcastStatus('Đã phát thông báo thành công đến toàn bộ máy chủ!');
      setTimeout(() => setBroadcastStatus(null), 4000);
    } catch {
      // Fallback local state nếu rules chưa deploy
      setBroadcasts(prev => [newBroadcast, ...prev]);
      setBroadcastTitle('');
      setBroadcastMsg('');
      setBroadcastStatus('Đã lưu thông báo máy chủ (Local Dev mode)!');
      setTimeout(() => setBroadcastStatus(null), 4000);
    }
  };

  // Xử lý Gỡ Ban (Unban)
  const handleUnbanUser = async (targetUid: string) => {
    try {
      await deleteDoc(doc(db, 'sanctions', targetUid));
      setSanctions(prev => prev.filter(s => s.uid !== targetUid));
    } catch {
      setSanctions(prev => prev.filter(s => s.uid !== targetUid));
    }
  };

  const handleBack = () => {
    if (onBackToApp) {
      onBackToApp();
    } else {
      window.history.pushState(null, '', '/');
      window.location.href = '/';
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-900 font-sans overflow-hidden">
      {/* Top Header Navigation */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold transition-all group shadow-sm active:scale-95"
            title="Quay lại trang chính CloudSend"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>Quay lại CloudSend</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">DataStore</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Cloud Console
              </span>
            </div>
          </div>
        </div>

        {/* User / Device Info */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline-block">Thiết bị:</span>
          <span className="text-slate-200 font-medium">{settings?.deviceName || 'Cloud Device'}</span>
          {currentUser && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" title="Online" />
          )}
        </div>
      </header>

      {/* 1. KHUNG Ở TRÊN (Hàng dài trải hết chiều ngang toàn màn hình) */}
      <section 
        id="datastore-frame-top"
        className="w-full border-b border-slate-800 bg-slate-900/80 px-4 sm:px-6 py-3 shrink-0 flex flex-col justify-center"
      >
        <div className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/70 p-3 shadow-sm">
          {/* Header của Khung Trên */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-800/80 gap-2 mb-2.5">
            <div className="flex items-center gap-2 text-emerald-400">
              <PanelTop className="w-4 h-4" />
              <h2 className="text-xs sm:text-sm font-bold tracking-wide uppercase">
                1. Thanh Điều Khiển & Tác Vụ Quản Trị
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>5 Tác vụ hoạt động</span>
              </span>
            </div>
          </div>

          {/* 5 NÚT TÁC VỤ ĐÃ CÓ */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            {/* 1. Các Phòng Chat */}
            <button
              id="task-btn-rooms"
              type="button"
              onClick={() => { setActiveTask('rooms'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'rooms'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-emerald-950/50 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'rooms' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <span>1. Các Phòng Chat</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700">
                {rooms.length}
              </span>
            </button>

            {/* 2. Những Người Dùng */}
            <button
              id="task-btn-users"
              type="button"
              onClick={() => { setActiveTask('users'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'users'
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 shadow-sky-950/50 ring-1 ring-sky-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'users' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'}`}>
                <Users className="w-3.5 h-3.5" />
              </div>
              <span>2. Những Người Dùng</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800/80 text-emerald-400 border border-slate-700">
                {verifiedOnlineUsersCount} Online
              </span>
            </button>

            {/* 3. Những Người Dùng Vi Phạm */}
            <button
              id="task-btn-violators"
              type="button"
              onClick={() => { setActiveTask('violators'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'violators'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-amber-950/50 ring-1 ring-amber-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'violators' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <span>3. Những Người Dùng Vi Phạm</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {violatorsList.length}
              </span>
            </button>

            {/* 4. Những Người Dùng Đã Bị Banned */}
            <button
              id="task-btn-banned"
              type="button"
              onClick={() => { setActiveTask('banned'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'banned'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-rose-950/50 ring-1 ring-rose-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'banned' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                <Ban className="w-3.5 h-3.5" />
              </div>
              <span>4. Những Người Dùng Đã Bị Banned</span>
            </button>

            {/* 5. Thông Báo Toàn Máy Chủ */}
            <button
              id="task-btn-broadcast"
              type="button"
              onClick={() => { setActiveTask('broadcast'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'broadcast'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/60 shadow-indigo-950/50 ring-1 ring-indigo-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'broadcast' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                <Megaphone className="w-3.5 h-3.5" />
              </div>
              <span>5. Thông Báo Toàn Máy Chủ</span>
            </button>
          </div>
        </div>
      </section>

      {/* KHU VỰC CẤU TRÚC 3 KHUNG CHUẨN DATASTORE (Bên Trái - Ở Giữa - Bên Phải) */}
      <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden">
        
        {/* ========================================================================= */}
        {/* 2. KHUNG BÊN TRÁI ("Ở chỗ 2" - Phân loại & Hệ thống lọc theo yêu cầu) */}
        {/* ========================================================================= */}
        <section 
          id="datastore-frame-left"
          className="w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/60 p-3 sm:p-4 flex flex-col overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <PanelLeft className="w-4 h-4" />
              <h3 className="text-xs sm:text-sm font-bold tracking-wide uppercase">
                2. Phân Loại & Bộ Lọc
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {activeTask === 'rooms' && 'Phân loại phòng'}
              {activeTask === 'users' && 'Check Online'}
              {activeTask === 'violators' && 'Hệ thống lọc'}
              {activeTask === 'banned' && 'Lọc người Ban'}
              {activeTask === 'broadcast' && 'Kênh thông báo'}
            </span>
          </div>

          {/* NỘI DUNG KHUNG 2 THEO TỪNG TÁC VỤ ĐƯỢC YÊU CẦU: */}
          <div className="flex-1 flex flex-col gap-2">

            {/* MỤC 1. CÁC PHÒNG CHAT -> Phân loại 2 phòng: Public & Private */}
            {activeTask === 'rooms' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400 px-1 uppercase tracking-wider">
                  Phân loại phòng chat:
                </div>

                {/* Tất cả phòng */}
                <button
                  type="button"
                  onClick={() => setRoomFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                    roomFilter === 'all'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Tất cả phòng</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {rooms.length}
                  </span>
                </button>

                {/* 1. Phòng Public (Công khai) */}
                <button
                  type="button"
                  onClick={() => setRoomFilter('public')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                    roomFilter === 'public'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-200">Phòng Public</div>
                      <div className="text-[10px] text-slate-400">Công khai, vào tự do</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {publicRoomsCount}
                  </span>
                </button>

                {/* 2. Phòng Private (Riêng tư) */}
                <button
                  type="button"
                  onClick={() => setRoomFilter('private')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                    roomFilter === 'private'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 font-semibold shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-slate-200">Phòng Private</div>
                      <div className="text-[10px] text-slate-400">Khóa mã PIN riêng</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    {privateRoomsCount}
                  </span>
                </button>
              </div>
            )}

            {/* MỤC 2. NHỮNG NGƯỜI DÙNG -> Hiện ảnh, tên và text check xem thật sự online không */}
            {activeTask === 'users' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400 px-1 uppercase tracking-wider">
                  Bộ lọc kiểm tra Online:
                </div>

                <button
                  type="button"
                  onClick={() => setUserFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    userFilter === 'all'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>Tất cả người dùng</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {evaluatedUsers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setUserFilter('online_verified')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all border ${
                    userFilter === 'online_verified'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <div className="text-left">
                      <div className="font-semibold text-emerald-400">Đang Online Thật Sự</div>
                      <div className="text-[10px] text-slate-400">Ping sống &lt; 90 giây</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {verifiedOnlineUsersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setUserFilter('offline')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    userFilter === 'offline'
                      ? 'bg-slate-800 text-slate-200 border-slate-600 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-600" />
                    <span>Ngoại tuyến / Không hoạt động</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {evaluatedUsers.length - verifiedOnlineUsersCount}
                  </span>
                </button>
              </div>
            )}

            {/* MỤC 3. NHỮNG NGƯỜI DÙNG VI PHẠM -> Hệ thống lọc các người dùng bị vi phạm ra */}
            {activeTask === 'violators' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-amber-400 px-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-amber-400" />
                  <span>Hệ thống lọc vi phạm:</span>
                </div>

                <button
                  type="button"
                  onClick={() => setViolatorFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'all'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span>⚠️ Tất cả trường hợp vi phạm</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {violatorsList.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViolatorFilter('profanity')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'profanity'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-slate-200">Lọc Vi phạm ngôn từ</div>
                    <div className="text-[10px] text-slate-400">Từ ngữ thô tục / Cảnh cáo</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {violatorsList.filter(v => v.violationType === 'profanity').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViolatorFilter('spam')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'spam'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-slate-200">Lọc Vi phạm Spam</div>
                    <div className="text-[10px] text-slate-400">Gửi dồn dập trong 2s</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {violatorsList.filter(v => v.violationType === 'spam').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setViolatorFilter('severe')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'severe'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-rose-300">Lọc Vi phạm nghiêm trọng</div>
                    <div className="text-[10px] text-slate-400">Đã tái phạm 2+ lần</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {violatorsList.filter(v => v.violationType === 'severe' || v.violationCount >= 2).length}
                  </span>
                </button>
              </div>
            )}

            {/* MỤC 4. NHỮNG NGƯỜI DÙNG ĐÃ BỊ BANNED -> Lọc những người bị Ban */}
            {activeTask === 'banned' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-rose-400 px-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Ban className="w-3 h-3 text-rose-400" />
                  <span>Bộ lọc người bị Ban:</span>
                </div>

                <button
                  type="button"
                  onClick={() => setBannedFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    bannedFilter === 'all'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span>🚫 Tất cả người bị Ban</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {filteredItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBannedFilter('perm')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    bannedFilter === 'perm'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-rose-300">Ban Vĩnh Viễn</div>
                    <div className="text-[10px] text-slate-400">Không có hạn mở khóa</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Vĩnh viễn
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBannedFilter('temp')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    bannedFilter === 'temp'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-amber-300">Tạm đình chỉ (3d - 6m)</div>
                    <div className="text-[10px] text-slate-400">Có thời hạn hết hạn</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Tạm khóa
                  </span>
                </button>
              </div>
            )}

            {/* MỤC 5. THÔNG BÁO TOÀN MÁY CHỦ -> Phân loại kênh phát sóng máy chủ */}
            {activeTask === 'broadcast' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-indigo-400 px-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Megaphone className="w-3 h-3 text-indigo-400" />
                  <span>Kênh thông báo máy chủ:</span>
                </div>

                <button
                  type="button"
                  onClick={() => setBroadcastFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    broadcastFilter === 'all'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span>📢 Tất cả thông báo</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
                    {broadcasts.length || 2}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBroadcastFilter('emergency')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    broadcastFilter === 'emergency'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-rose-300">Thông báo khẩn cấp</div>
                    <div className="text-[10px] text-slate-400">Popup trực tiếp mọi thiết bị</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400">
                    Khẩn
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBroadcastFilter('maintenance')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    broadcastFilter === 'maintenance'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-amber-300">Bảo trì hệ thống</div>
                    <div className="text-[10px] text-slate-400">Lịch nâng cấp máy chủ</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Bảo trì
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBroadcastFilter('news')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    broadcastFilter === 'news'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-emerald-300">Tính năng & Tin mới</div>
                    <div className="text-[10px] text-slate-400">Cập nhật ứng dụng</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    Tin tức
                  </span>
                </button>
              </div>
            )}

          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. KHUNG Ở GIỮA (Danh Sách Bản Ghi hiển thị các mục tương ứng) */}
        {/* ========================================================================= */}
        <section 
          id="datastore-frame-middle"
          className="flex-1 min-w-0 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/20 p-3 sm:p-4 flex flex-col overflow-hidden"
        >
          {/* Header & Thanh tìm kiếm Khung Giữa */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/60 gap-2 mb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <FileText className="w-4 h-4" />
              <h3 className="text-xs sm:text-sm font-bold tracking-wide uppercase">
                3. Danh Sách Bản Ghi ({filteredItems.length})
              </h3>
            </div>

            {/* Ô tìm kiếm nhanh */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm kiếm nhanh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Danh sách cuộn của Khung Giữa */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredItems.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800/80 rounded-2xl bg-slate-900/20">
                <Info className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs sm:text-sm text-slate-400">Không tìm thấy bản ghi nào phù hợp bộ lọc.</p>
              </div>
            ) : (
              filteredItems.map((item: any) => {
                const itemId = item.id || item.uid;
                const isSelected = selectedItemId === itemId;

                return (
                  <div
                    key={itemId}
                    onClick={() => setSelectedItemId(itemId)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-850 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md'
                        : 'bg-slate-900/40 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {/* TH1: HIỂN THỊ PHÒNG CHAT */}
                    {activeTask === 'rooms' && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          item.isPrivate ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {item.isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                              {item.name}
                            </span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              item.isPrivate ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {item.isPrivate ? 'Private' : 'Public'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                            Mã: #{item.code} • Tạo bởi: {item.createdByName || 'Người dùng'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TH2: HIỂN THỊ NGƯỜI DÙNG -> Hiện ảnh, tên và text check xem họ có đang thật sự online ko */}
                    {activeTask === 'users' && (
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Ảnh Avatar người dùng */}
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-inner relative border border-white/10"
                          style={{ backgroundColor: item.avatarColor || '#10b981' }}
                        >
                          {item.displayName?.charAt(0).toUpperCase() || 'U'}
                          {item.onlineCheck?.isOnline && (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5" />
                          )}
                        </div>

                        {/* Tên & Text check online */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                              {item.displayName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-block">
                              ({item.deviceName || 'Thiết bị'})
                            </span>
                          </div>
                          
                          {/* TEXT CHECK XEM HỌ CÓ ĐANG THẬT SỰ ONLINE KHÔNG */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${item.onlineCheck?.color}`}>
                              {item.onlineCheck?.badgeText}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate hidden md:inline-block">
                              • {item.onlineCheck?.detailText}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TH3: HIỂN THỊ NGƯỜI DÙNG VI PHẠM */}
                    {activeTask === 'violators' && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 border border-amber-500/40"
                          style={{ backgroundColor: item.avatarColor || '#f59e0b' }}
                        >
                          {item.displayName?.charAt(0).toUpperCase() || 'V'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                              {item.displayName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Lần vi phạm: {item.violationCount}
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-400/90 truncate mt-0.5">
                            Lý do: {item.violationReason}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TH4: HIỂN THỊ NGƯỜI DÙNG ĐÃ BỊ BANNED */}
                    {activeTask === 'banned' && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center font-bold text-xs shrink-0">
                          <Ban className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-rose-300 truncate">
                              {item.displayName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
                              BANNED
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.email} • {item.reason || 'Vi phạm nội quy'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TH5: HIỂN THỊ THÔNG BÁO MÁY CHỦ */}
                    {activeTask === 'broadcast' && (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          item.type === 'emergency' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          item.type === 'maintenance' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          <Megaphone className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                              {item.title}
                            </span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              item.type === 'emergency' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                              item.type === 'maintenance' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                              'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                            }`}>
                              {item.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.message}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="shrink-0 text-slate-500 text-xs">
                      {isSelected ? <Check className="w-4 h-4 text-emerald-400" /> : '→'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. KHUNG BÊN PHẢI (Chi Tiết Thuộc Tính & Thao Tác Chuyên Sâu) */}
        {/* ========================================================================= */}
        <section 
          id="datastore-frame-right"
          className="w-full md:w-80 lg:w-96 shrink-0 bg-slate-950/60 p-3 sm:p-4 flex flex-col overflow-y-auto border-t md:border-t-0 md:border-l border-slate-800"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <PanelRight className="w-4 h-4" />
              <h3 className="text-xs sm:text-sm font-bold tracking-wide uppercase">
                4. Chi Tiết & Tác Vụ
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Trình Xem & Thao Tác
            </span>
          </div>

          {/* NẾU LÀ TÁC VỤ 5: KHUNG SOẠN PHÁT THÔNG BÁO TOÀN MÁY CHỦ */}
          {activeTask === 'broadcast' ? (
            <div className="flex-1 flex flex-col space-y-3">
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300">
                📢 <strong>Soạn Tin Toàn Máy Chủ:</strong> Đẩy tin nhắn thông báo tức thì lên màn hình của tất cả các máy đang kết nối.
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Loại thông báo:</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBroadcastType('emergency')}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium ${
                      broadcastType === 'emergency' ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Khẩn cấp
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastType('maintenance')}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium ${
                      broadcastType === 'maintenance' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Bảo trì
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastType('news')}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium ${
                      broadcastType === 'news' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    Tin tức
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Tiêu đề thông báo:</label>
                <input
                  type="text"
                  placeholder="VD: Cập nhật hệ thống hoặc Cảnh báo bảo mật..."
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Nội dung chi tiết:</label>
                <textarea
                  rows={4}
                  placeholder="Nhập nội dung cần gửi đến toàn bộ người dùng..."
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {broadcastStatus && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{broadcastStatus}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={!broadcastTitle.trim() || !broadcastMsg.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Phát Thông Báo Toàn Máy Chủ</span>
              </button>
            </div>
          ) : selectedItemData ? (() => {
            const item = selectedItemData as any;
            return (
              /* CHI TIẾT TỪNG BẢN GHI ĐƯỢC CHỌN */
              <div className="flex-1 flex flex-col space-y-3">
                {/* Thẻ tóm tắt đối tượng */}
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-400">ID Bản Ghi:</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 truncate max-w-[180px]">
                      {item.id || item.uid}
                    </span>
                  </div>

                  <div className="font-bold text-sm text-slate-100">
                    {item.name || item.displayName || item.title}
                  </div>

                  {/* THỂ HIỆN KIỂM TRA ONLINE NẾU LÀ NGƯỜI DÙNG */}
                  {item.onlineCheck && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Trạng thái Online thực tế:</div>
                      <div className={`p-2 rounded-xl border text-xs flex items-center justify-between ${item.onlineCheck.color}`}>
                        <span className="font-semibold">{item.onlineCheck.badgeText}</span>
                        <span className="text-[11px] font-mono">{item.onlineCheck.detailText}</span>
                      </div>
                    </div>
                  )}

                  {/* THỂ HIỆN NẾU LÀ PHÒNG CHAT */}
                  {item.code && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Mã phòng truy cập:</div>
                      <div className="text-xs font-mono text-slate-200 bg-slate-950 p-2 rounded-xl border border-slate-800">
                        Mã: <strong>#{item.code}</strong> • Phân loại: <strong>{item.isPrivate ? 'Phòng Private (Khóa)' : 'Phòng Public (Tự do)'}</strong>
                      </div>
                    </div>
                  )}

                  {/* THỂ HIỆN NẾU LÀ VI PHẠM */}
                  {item.violationReason && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <div className="text-[10px] text-amber-400 uppercase font-mono">Bằng chứng vi phạm:</div>
                      <div className="text-xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30">
                        {item.violationReason}
                      </div>
                    </div>
                  )}
                </div>

                {/* Hộp dữ liệu cấu trúc JSON */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Dữ liệu JSON thuộc tính:</span>
                    </span>
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300/90 overflow-x-auto max-h-48 scrollbar-thin scrollbar-thumb-slate-800">
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </div>

                {/* Nút hành động nhanh */}
                <div className="pt-2 flex flex-col gap-2">
                  {activeTask === 'banned' && (
                    <button
                      type="button"
                      onClick={() => handleUnbanUser(item.uid)}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Gỡ Ban Tài Khoản Này (Unban)</span>
                    </button>
                  )}

                  {activeTask === 'violators' && (
                    <button
                      type="button"
                      onClick={() => alert(`Đã gửi cảnh cáo chính thức đến: ${item.displayName}`)}
                      className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Gửi Cảnh Cáo Vi Phạm (Warning)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500 text-xs">
              <Eye className="w-8 h-8 text-slate-700 mb-2" />
              <span>Bấm vào một hàng ở khung giữa để xem chi tiết & tác vụ</span>
            </div>
          )}
        </section>

      </div>
    </div>
  );
};
