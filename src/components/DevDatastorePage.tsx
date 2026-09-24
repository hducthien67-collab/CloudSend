import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Filter,
  Crown,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  X,
  Download,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Flag,
  Paperclip,
  Camera
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ChatRoom, UserDevice, UserSanction, ChatMessage, ContentReport, ChatAttachment } from '../types';
import { formatFileSize } from '../utils/device';
import { isDevUser } from '../utils/devModeration';
import { 
  uploadFileToServer, 
  generateImageThumbnail, 
  MAX_FILE_SIZE 
} from '../utils/fileUpload';

interface DevDatastorePageProps {
  onBackToApp?: () => void;
}

type ManagementTask = 'rooms' | 'users' | 'violators' | 'banned' | 'broadcast' | 'reports';

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
  const [roomFilter, setRoomFilter] = useState<'all' | 'public' | 'private' | 'violating'>('all');
  const [roomViolationSeverity, setRoomViolationSeverity] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'offline' | 'violating'>('all');
  const [userViolationSeverity, setUserViolationSeverity] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [violatorFilter, setViolatorFilter] = useState<'all' | 'light' | 'medium' | 'heavy' | 'critical'>('all');
  const [bannedFilter, setBannedFilter] = useState<'all' | 'perm' | 'temp' | 'muted'>('all');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'emergency' | 'maintenance' | 'news'>('all');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');

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
  const [reports, setReports] = useState<ContentReport[]>([]);

  // State chuyên biệt cho Tác vụ 1. Các Phòng Chat (Live Chat & Giám sát)
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [devInputText, setDevInputText] = useState('');
  const [devAttachments, setDevAttachments] = useState<ChatAttachment[]>([]);
  const [isSendingDevMessage, setIsSendingDevMessage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [roomDetailsTab, setRoomDetailsTab] = useState<'chat' | 'users' | 'messages' | 'images'>('chat');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [roomMsgSearchQuery, setRoomMsgSearchQuery] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const devFileInputRef = useRef<HTMLInputElement>(null);
  const devImageInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Lắng nghe tin nhắn phòng chat đang được chọn thời gian thực (Bao gồm lưu trữ vĩnh viễn không bị mất khi Client xóa)
  useEffect(() => {
    if (activeTask !== 'rooms' || !selectedItemId) {
      setRoomMessages([]);
      return;
    }

    const map = new Map<string, ChatMessage>();

    const updateCombined = () => {
      const list = Array.from(map.values());
      list.sort((a, b) => {
        const tA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tA - tB;
      });
      setRoomMessages(list);
    };

    // 1. Lắng nghe subcollection 'messages' thông thường
    const messagesRef = collection(db, 'rooms', selectedItemId, 'messages');
    const qMsgs = query(messagesRef, orderBy('createdAt', 'asc'), limit(300));
    const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
      // Khi client xóa (change.type === 'removed') -> giữ lại trong DEV với cờ isDeletedBySender
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          const existing = map.get(change.doc.id);
          if (existing) {
            map.set(change.doc.id, {
              ...existing,
              deletedBySender: true,
              isDeletedBySender: true,
              deletedAt: new Date().toISOString()
            });
          }
        }
      });

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as ChatMessage;
        const existing = map.get(docSnap.id);
        map.set(docSnap.id, {
          ...existing,
          ...d,
          id: docSnap.id
        });
      });
      updateCombined();
    }, (err) => {
      console.warn('Lỗi đọc tin nhắn phòng trong DataStore:', err);
    });

    // 2. Lắng nghe subcollection 'audit_messages' (Kho lưu trữ kiểm toán vĩnh viễn không bao giờ xóa)
    const auditRef = collection(db, 'rooms', selectedItemId, 'audit_messages');
    const qAudit = query(auditRef, orderBy('createdAt', 'asc'), limit(300));
    const unsubAudit = onSnapshot(qAudit, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as ChatMessage;
        const existing = map.get(docSnap.id);
        map.set(docSnap.id, {
          ...existing,
          ...d,
          id: docSnap.id
        });
      });
      updateCombined();
    }, () => {
      // Bỏ qua nếu audit collection chưa có tài liệu
    });

    return () => {
      unsubMsgs();
      unsubAudit();
    };
  }, [activeTask, selectedItemId]);

  // Tự động cuộn xuống cuối khi có tin nhắn mới trong phòng
  useEffect(() => {
    if (messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
    }
  }, [roomMessages]);

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

    // 5. Reports (Tố cáo vi phạm từ người dùng)
    const unsubReports = onSnapshot(collection(db, 'reports'), (snap) => {
      const list: ContentReport[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentReport));
      list.sort((a, b) => {
        const tA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tB - tA; // Mới nhất lên đầu
      });
      setReports(list);
    }, (err) => {
      console.warn('Lỗi đọc reports Firestore:', err);
    });

    return () => {
      unsubRooms();
      unsubPresence();
      unsubSanctions();
      unsubBroadcasts();
      unsubReports();
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
    const userMap = new Map<string, any>();

    // 1. Nạp từ onlinePresence
    onlinePresence.forEach(u => {
      userMap.set(u.uid, {
        id: u.uid,
        ...u,
        onlineCheck: evaluateOnlineStatus(u.lastSeen, u.status)
      });
    });

    // 2. Thêm current user nếu chưa có
    if (currentUser && !userMap.has(currentUser.uid)) {
      userMap.set(currentUser.uid, {
        id: currentUser.uid,
        uid: currentUser.uid,
        email: currentUser.email || 'user@cloudsend.local',
        displayName: currentUser.displayName || 'Bạn (Current Device)',
        deviceName: settings.deviceName || 'Thiết bị của bạn',
        deviceType: settings.deviceType || 'laptop',
        avatarColor: settings.avatarColor || '#10b981',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'online',
        onlineCheck: evaluateOnlineStatus(new Date().toISOString(), 'online')
      });
    }

    // 3. Nạp tất cả người dùng và chủ phòng từ các phòng chat
    rooms.forEach(r => {
      const ownerId = r.ownerId || r.createdBy;
      if (ownerId && !userMap.has(ownerId)) {
        userMap.set(ownerId, {
          id: ownerId,
          uid: ownerId,
          displayName: r.ownerName || r.createdByName || 'Chủ phòng',
          email: '',
          deviceName: 'Thiết bị tạo phòng',
          avatarColor: '#f59e0b',
          createdAt: r.createdAt,
          lastSeen: r.createdAt,
          status: 'offline',
          onlineCheck: evaluateOnlineStatus(r.createdAt, 'offline')
        });
      }
      if (Array.isArray(r.members)) {
        r.members.forEach(m => {
          if (m.uid && !userMap.has(m.uid)) {
            userMap.set(m.uid, {
              id: m.uid,
              uid: m.uid,
              displayName: m.displayName || 'Thành viên',
              email: '',
              deviceName: m.deviceName || 'Thiết bị',
              avatarColor: m.avatarColor || '#10b981',
              createdAt: m.joinedAt || r.createdAt,
              lastSeen: m.joinedAt || r.createdAt,
              status: 'offline',
              onlineCheck: evaluateOnlineStatus(m.joinedAt || r.createdAt, 'offline')
            });
          }
        });
      }
    });

    return Array.from(userMap.values());
  }, [onlinePresence, currentUser, settings, rooms]);

    // Xử lý và tính toán mức độ vi phạm cho từng phòng chat (Nhẹ, Bình Thường, Nặng, Hết Cứu)
  const roomsWithViolations = useMemo(() => {
    // Dữ liệu mẫu hoàn chỉnh 4 mức độ vi phạm để DEV kiểm thử và phân loại
    const demoViolatingRooms: (ChatRoom & {
      violationSeverity?: 'light' | 'medium' | 'heavy' | 'critical';
      violationReason?: string;
      violationCount?: number;
    })[] = [
      {
        id: 'violation-room-light',
        name: 'Phòng Chat Trẻ Trâu (Spam Nhẹ)',
        code: 'SPAM01',
        isPrivate: false,
        createdBy: 'user-viol-light',
        createdByName: 'User_TrêuĐùa_99',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        violationSeverity: 'light',
        violationReason: 'Có dấu hiệu spam tin nhắn lặp lại (1 cảnh cáo)',
        violationCount: 1
      },
      {
        id: 'violation-room-medium',
        name: 'Hội Bàn Đề & Cá Độ Tự Phát',
        code: 'BADE88',
        isPrivate: true,
        createdBy: 'user-viol-medium',
        createdByName: 'ToxicPlayer_Spammer',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        violationSeverity: 'medium',
        violationReason: 'Bị 2 báo cáo về nội dung cờ bạc và ngôn từ không phù hợp',
        violationCount: 2
      },
      {
        id: 'violation-room-heavy',
        name: 'Phòng Quấy Rối & Ngôn Từ Thù Ghét',
        code: 'HATE99',
        isPrivate: false,
        createdBy: 'user-viol-heavy',
        createdByName: 'TrollMaster_Banned3d',
        createdAt: new Date(Date.now() - 14400000).toISOString(),
        violationSeverity: 'heavy',
        violationReason: 'Bị 4 báo cáo nghiêm trọng về quấy rối & xúc phạm tập thể',
        violationCount: 4
      },
      {
        id: 'violation-room-critical',
        name: 'DarkRoom_Hacker_Exploit (Phát Tán Mã Độc)',
        code: 'DARKX1',
        isPrivate: true,
        createdBy: 'user-viol-critical',
        createdByName: 'Exploit_Attacker_Pro',
        createdAt: new Date(Date.now() - 28800000).toISOString(),
        violationSeverity: 'critical',
        violationReason: 'Phát tán mã độc, link lừa đảo phishing (Khóa vĩnh viễn - Hết cứu)',
        violationCount: 7
      }
    ];

    const mapped = rooms.map(r => {
      const roomReps = reports.filter(rep => rep.roomId === r.id);
      let sev: 'light' | 'medium' | 'heavy' | 'critical' | undefined = undefined;
      let reason: string | undefined = undefined;

      if ((r as any).violationSeverity) {
        sev = (r as any).violationSeverity;
        reason = (r as any).violationReason;
      } else if (roomReps.length >= 5) {
        sev = 'critical';
        reason = `Bị tố cáo ${roomReps.length} lần (Mức độ hết cứu)`;
      } else if (roomReps.length >= 3) {
        sev = 'heavy';
        reason = `Bị tố cáo ${roomReps.length} lần liên tiếp`;
      } else if (roomReps.length >= 2) {
        sev = 'medium';
        reason = `Bị ${roomReps.length} người dùng gửi báo cáo vi phạm`;
      } else if (roomReps.length === 1) {
        sev = 'light';
        reason = `Bị 1 báo cáo: ${roomReps[0].reason || 'Nội quy phòng'}`;
      }

      return {
        ...r,
        violationSeverity: sev,
        violationReason: reason,
        violationCount: roomReps.length
      };
    });

    const hasAnyViolation = mapped.some(r => !!r.violationSeverity);
    if (!hasAnyViolation) {
      return [...mapped, ...demoViolatingRooms];
    }
    const existingLevels = new Set(mapped.map(r => r.violationSeverity).filter(Boolean));
    const toAdd = demoViolatingRooms.filter(d => !existingLevels.has(d.violationSeverity));
    return [...mapped, ...toAdd];
  }, [rooms, reports]);

  // Xử lý và tính toán người dùng vi phạm theo 4 mức độ: Nhẹ, Bình Thường, Nặng, Hết Cứu
  const evaluatedUsersWithViolations = useMemo(() => {
    const demoViolatingUsers = [
      {
        id: 'user-viol-light',
        uid: 'user-viol-light',
        displayName: 'User_TrêuĐùa_99',
        email: 'treudua99@gmail.com',
        deviceName: 'iPhone 14 Pro',
        avatarColor: '#10b981',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        lastSeen: new Date().toISOString(),
        status: 'online',
        onlineCheck: evaluateOnlineStatus(new Date().toISOString(), 'online'),
        violationSeverity: 'light' as const,
        violationReason: 'Cảnh cáo lần 1: Dùng từ ngữ thiếu chuẩn mực trong phòng chat',
        violationCount: 1
      },
      {
        id: 'user-viol-medium',
        uid: 'user-viol-medium',
        displayName: 'ToxicPlayer_Spammer',
        email: 'toxic_player@demo.com',
        deviceName: 'Redmi Note 12',
        avatarColor: '#f59e0b',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        lastSeen: new Date(Date.now() - 120000).toISOString(),
        status: 'offline',
        onlineCheck: evaluateOnlineStatus(new Date(Date.now() - 120000).toISOString(), 'offline'),
        violationSeverity: 'medium' as const,
        violationReason: 'Spam dồn dập 15 tin nhắn / 2s và quấy rối thành viên',
        violationCount: 2
      },
      {
        id: 'user-viol-heavy',
        uid: 'user-viol-heavy',
        displayName: 'TrollMaster_Banned3d',
        email: 'trollmaster@darknet.org',
        deviceName: 'Windows Desktop RTX',
        avatarColor: '#f97316',
        createdAt: new Date(Date.now() - 14400000).toISOString(),
        lastSeen: new Date(Date.now() - 3600000).toISOString(),
        status: 'offline',
        onlineCheck: evaluateOnlineStatus(new Date(Date.now() - 3600000).toISOString(), 'offline'),
        violationSeverity: 'heavy' as const,
        violationReason: 'Tái phạm nhiều lần, đã bị áp dụng tạm khóa tài khoản 3 ngày',
        violationCount: 4
      },
      {
        id: 'user-viol-critical',
        uid: 'user-viol-critical',
        displayName: 'Exploit_Attacker_Pro',
        email: 'attacker_x@exploit.ru',
        deviceName: 'Kali Linux v2024',
        avatarColor: '#dc2626',
        createdAt: new Date(Date.now() - 28800000).toISOString(),
        lastSeen: new Date(Date.now() - 7200000).toISOString(),
        status: 'offline',
        onlineCheck: evaluateOnlineStatus(new Date(Date.now() - 7200000).toISOString(), 'offline'),
        violationSeverity: 'critical' as const,
        violationReason: 'Khóa tài khoản vĩnh viễn: Cố tình tấn công phá hoại, phát tán mã độc',
        violationCount: 7
      }
    ];

    const mapped = evaluatedUsers.map(u => {
      const userReps = reports.filter(r => r.senderId === u.uid);
      const sanction = sanctions.find(s => s.uid === u.uid);
      let sev: 'light' | 'medium' | 'heavy' | 'critical' | undefined = undefined;
      let reason: string | undefined = undefined;
      let count = (sanction?.violationCount || 0) + userReps.length;

      if (sanction?.isBanned || sanction?.lastSanctionType === 'ban_perm') {
        sev = 'critical';
        reason = sanction.reason || 'Bị cấm vĩnh viễn (Hết cứu)';
      } else if (sanction?.lastSanctionType === 'ban_3d' || sanction?.lastSanctionType === 'ban_6m' || count >= 4) {
        sev = 'heavy';
        reason = sanction?.reason || `Tái phạm nhiều lần (${count} vi phạm)`;
      } else if (count >= 2) {
        sev = 'medium';
        reason = `Vi phạm ${count} lần (Spam / Ngôn từ không phù hợp)`;
      } else if (count === 1 || u.hasWarning) {
        sev = 'light';
        reason = 'Nhắc nhở vi phạm lần đầu';
      }

      return {
        ...u,
        violationSeverity: sev,
        violationReason: reason,
        violationCount: count
      };
    });

    const hasAnyViolation = mapped.some(u => !!u.violationSeverity);
    if (!hasAnyViolation) {
      return [...mapped, ...demoViolatingUsers];
    }
    const existingLevels = new Set(mapped.map(u => u.violationSeverity).filter(Boolean));
    const toAdd = demoViolatingUsers.filter(d => !existingLevels.has(d.violationSeverity));
    return [...mapped, ...toAdd];
  }, [evaluatedUsers, reports, sanctions]);

  // Đếm số lượng theo từng mức độ vi phạm của phòng chat
  const countRoomSeverity = useMemo(() => {
    const res: Record<'all' | 'light' | 'medium' | 'heavy' | 'critical', number> = { all: 0, light: 0, medium: 0, heavy: 0, critical: 0 };
    roomsWithViolations.forEach(r => {
      if (r.violationSeverity && r.violationSeverity in res) {
        res.all++;
        res[r.violationSeverity as 'light' | 'medium' | 'heavy' | 'critical']++;
      }
    });
    return res;
  }, [roomsWithViolations]);

  // Đếm số lượng theo từng mức độ vi phạm của người dùng
  const countUserSeverity = useMemo(() => {
    const res: Record<'all' | 'light' | 'medium' | 'heavy' | 'critical', number> = { all: 0, light: 0, medium: 0, heavy: 0, critical: 0 };
    evaluatedUsersWithViolations.forEach(u => {
      if (u.violationSeverity && u.violationSeverity in res) {
        res.all++;
        res[u.violationSeverity as 'light' | 'medium' | 'heavy' | 'critical']++;
      }
    });
    return res;
  }, [evaluatedUsersWithViolations]);

  const verifiedOnlineUsersCount = useMemo(() => {
    return evaluatedUsersWithViolations.filter(u => u.onlineCheck?.isOnline).length;
  }, [evaluatedUsersWithViolations]);

  // Dữ liệu lọc cho Khung 3 (Middle Frame)
  const filteredItems = useMemo(() => {
    if (activeTask === 'rooms') {
      let list = [...roomsWithViolations];
      if (roomFilter === 'public') list = list.filter(r => !r.isPrivate);
      if (roomFilter === 'private') list = list.filter(r => !!r.isPrivate);
      if (roomFilter === 'violating') {
        list = list.filter(r => !!r.violationSeverity);
        if (roomViolationSeverity !== 'all') {
          list = list.filter(r => r.violationSeverity === roomViolationSeverity);
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
      }
      return list;
    }

    if (activeTask === 'users') {
      let list = [...evaluatedUsersWithViolations];
      if (userFilter === 'online') list = list.filter(u => u.onlineCheck?.isOnline);
      if (userFilter === 'offline') list = list.filter(u => !u.onlineCheck?.isOnline);
      if (userFilter === 'violating') {
        list = list.filter(u => !!u.violationSeverity);
        if (userViolationSeverity !== 'all') {
          list = list.filter(u => u.violationSeverity === userViolationSeverity);
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(u => u.displayName.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)));
      }
      return list;
    }

    if (activeTask === 'violators') {
      let list = evaluatedUsersWithViolations.filter(u => !!u.violationSeverity);
      if (violatorFilter !== 'all') {
        list = list.filter(v => v.violationSeverity === violatorFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(v => v.displayName.toLowerCase().includes(q) || (v.violationReason && v.violationReason.toLowerCase().includes(q)));
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

    if (activeTask === 'reports') {
      let list = [...reports];
      if (reportFilter === 'pending') list = list.filter(r => r.status === 'pending');
      if (reportFilter === 'resolved') list = list.filter(r => r.status === 'resolved');
      if (reportFilter === 'dismissed') list = list.filter(r => r.status === 'dismissed');
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(r => 
          (r.senderName && r.senderName.toLowerCase().includes(q)) ||
          (r.reportedByName && r.reportedByName.toLowerCase().includes(q)) ||
          (r.reason && r.reason.toLowerCase().includes(q)) ||
          (r.messageText && r.messageText.toLowerCase().includes(q)) ||
          (r.messageRawText && r.messageRawText.toLowerCase().includes(q)) ||
          (r.roomName && r.roomName.toLowerCase().includes(q))
        );
      }
      return list;
    }

    return [];
  }, [activeTask, roomFilter, roomViolationSeverity, userFilter, userViolationSeverity, violatorFilter, bannedFilter, broadcastFilter, reportFilter, roomsWithViolations, evaluatedUsersWithViolations, sanctions, broadcasts, reports, searchQuery]);

  // Chi tiết mục đang chọn ở Khung 3 / Modal
  const selectedItemData = useMemo(() => {
    if (!selectedItemId) return null;
    if (activeTask === 'rooms') {
      return roomsWithViolations.find((r: any) => r.id === selectedItemId) || null;
    }
    return filteredItems.find((it: any) => (it.id === selectedItemId || it.uid === selectedItemId)) || null;
  }, [filteredItems, selectedItemId, activeTask, roomsWithViolations]);

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

  // Xử lý giải quyết đơn tố cáo
  const handleResolveReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Resolve report error:', err);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'dismissed',
        resolvedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Dismiss report error:', err);
    }
  };

  const handleDeleteReportedMessage = async (roomId: string, messageId: string, reportId: string) => {
    try {
      if (roomId && messageId) {
        await deleteDoc(doc(db, 'rooms', roomId, 'messages', messageId));
      }
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'resolved',
        actionTaken: 'deleted_message',
        resolvedAt: new Date().toISOString()
      });
      alert('Đã xóa tin nhắn vi phạm khỏi phòng và cập nhật trạng thái tố cáo thành Đã xử lý!');
    } catch (err) {
      console.error('Delete reported message error:', err);
      alert('Đã xử lý xóa tin nhắn vi phạm.');
    }
  };

  const handleBanUserFromReport = async (targetUid: string, targetName: string, durationDays: number | 'perm', reason: string, reportId?: string) => {
    try {
      const now = new Date();
      const expiresAt = durationDays === 'perm' ? null : new Date(now.getTime() + durationDays * 86400000).toISOString();
      const sanctionPayload: UserSanction = {
        uid: targetUid,
        displayName: targetName,
        email: '',
        violationCount: 1,
        lastSanctionType: durationDays === 'perm' ? 'ban_perm' : durationDays === 3 ? 'ban_3d' : 'ban_6m',
        reason: reason || 'Vi phạm nội quy từ báo cáo tố cáo của người dùng',
        bannedAt: now.toISOString(),
        banExpiresAt: expiresAt,
        isBanned: true
      };

      await setDoc(doc(db, 'sanctions', targetUid), sanctionPayload);
      if (reportId) {
        await updateDoc(doc(db, 'reports', reportId), {
          status: 'resolved',
          actionTaken: `banned_${durationDays}`,
          resolvedAt: now.toISOString()
        });
      }
      alert(`Đã áp dụng hình phạt khóa tài khoản với [${targetName}] thành công (${durationDays === 'perm' ? 'Vĩnh viễn' : durationDays + ' ngày'})!`);
    } catch (err) {
      console.error('Ban user error:', err);
    }
  };

  // Điều hướng từ phòng chat sang đúng người dùng trong Tác vụ 2: Những Người Dùng
  const handleNavigateToUser = (targetUid: string, userData?: any) => {
    if (!targetUid) return;
    setActiveTask('users');
    setUserFilter('all');
    setSearchQuery('');
    setSelectedItemId(targetUid);

    setTimeout(() => {
      const el = document.getElementById(`record-item-${targetUid}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  // Định dạng thời gian gửi tin nhắn (Tên hiển thị + Giờ gửi bên cạnh)
  const formatMessageTime = (createdAt?: string, timestamp?: number) => {
    try {
      const d = timestamp ? new Date(timestamp) : (createdAt ? new Date(createdAt) : new Date());
      if (isNaN(d.getTime())) return '';
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${hours}:${minutes}:${seconds} • ${day}/${month}`;
    } catch {
      return '';
    }
  };

  // 1. Danh sách người dùng của phòng chat (Dành cho Tab 1 ở Khung 4)
  const roomUsersList = useMemo(() => {
    if (activeTask !== 'rooms' || !selectedItemId) return [];
    const currentRoom = rooms.find(r => r.id === selectedItemId);
    const userMap = new Map<string, {
      uid: string;
      displayName: string;
      email: string;
      deviceName: string;
      avatarColor?: string;
      role: 'owner' | 'dev' | 'member';
      messageCount: number;
      lastActive?: string;
      onlineStatus?: { isOnline: boolean; badgeText: string; color: string };
    }>();

    // Thêm chủ phòng
    if (currentRoom) {
      const ownerId = currentRoom.ownerId || currentRoom.createdBy;
      const ownerName = currentRoom.ownerName || currentRoom.createdByName || 'Chủ phòng';
      if (ownerId) {
        userMap.set(ownerId, {
          uid: ownerId,
          displayName: ownerName,
          email: '',
          deviceName: 'Thiết bị tạo phòng',
          role: 'owner',
          messageCount: 0
        });
      }
      // Thêm các thành viên trong room.members
      if (Array.isArray(currentRoom.members)) {
        currentRoom.members.forEach(m => {
          if (!userMap.has(m.uid)) {
            userMap.set(m.uid, {
              uid: m.uid,
              displayName: m.displayName || 'Thành viên',
              email: '',
              deviceName: m.deviceName || '',
              avatarColor: m.avatarColor,
              role: m.role || 'member',
              messageCount: 0
            });
          }
        });
      }
    }

    // Tổng hợp những người đã nhắn tin trong phòng
    roomMessages.forEach(msg => {
      const uid = msg.senderId || 'unknown';
      const isMsgDev = msg.isDevMessage || isDevUser(msg.senderEmail) || (msg.senderName && msg.senderName.includes('DEV'));
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          uid,
          displayName: msg.senderName || 'Người dùng',
          email: msg.senderEmail || '',
          deviceName: msg.senderDevice || '',
          role: isMsgDev ? 'dev' : 'member',
          messageCount: 1,
          lastActive: msg.createdAt
        });
      } else {
        const u = userMap.get(uid)!;
        u.messageCount += 1;
        if (msg.senderEmail && !u.email) u.email = msg.senderEmail;
        if (msg.senderDevice && !u.deviceName) u.deviceName = msg.senderDevice;
        if (msg.createdAt) u.lastActive = msg.createdAt;
      }
    });

    // Gắn trạng thái online từ onlinePresence
    const list = Array.from(userMap.values());
    list.forEach(u => {
      const device = onlinePresence.find(p => p.uid === u.uid || (u.email && p.email && p.email.toLowerCase() === u.email.toLowerCase()));
      if (device) {
        const evaluated = evaluateOnlineStatus(device.lastSeen, device.status);
        u.onlineStatus = {
          isOnline: evaluated.isOnline,
          badgeText: evaluated.badgeText,
          color: evaluated.color
        };
        if (!u.avatarColor && device.avatarColor) u.avatarColor = device.avatarColor;
      } else {
        u.onlineStatus = {
          isOnline: false,
          badgeText: '⚪ Ngoại tuyến',
          color: 'text-slate-400 bg-slate-800/80 border-slate-700'
        };
      }
    });

    return list;
  }, [activeTask, selectedItemId, rooms, roomMessages, onlinePresence]);

  // 2. Danh sách hình ảnh đã gửi trong phòng chat (Dành cho Tab 3 ở Khung 4 - Lưu giữ vĩnh viễn cả ảnh đã xóa và ảnh 18+)
  const roomImagesList = useMemo(() => {
    if (activeTask !== 'rooms' || !selectedItemId) return [];
    const images: Array<{
      id: string;
      url: string;
      name: string;
      senderName: string;
      createdAt: string;
      size?: number;
      isDeleted?: boolean;
      isWarned?: boolean;
    }> = [];

    roomMessages.forEach(msg => {
      const isDel = !!(msg.deletedBySender || msg.isDeletedBySender);
      const isWarn = !!(msg.hasProfanity || msg.hasWarning || msg.isReported);

      if (Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att, idx) => {
          if (att.type?.startsWith('image/') || (att.data && att.data.startsWith('data:image'))) {
            images.push({
              id: `${msg.id}_att_${idx}`,
              url: att.data,
              name: att.name || `Ảnh-${idx + 1}`,
              senderName: msg.senderName,
              createdAt: msg.createdAt,
              size: att.size,
              isDeleted: isDel,
              isWarned: isWarn
            });
          }
        });
      }
      if (msg.fileData && (msg.fileType?.startsWith('image/') || msg.fileData.startsWith('data:image'))) {
        images.push({
          id: `${msg.id}_file`,
          url: msg.fileData,
          name: msg.fileName || 'Ảnh đính kèm',
          senderName: msg.senderName,
          createdAt: msg.createdAt,
          size: msg.fileSize,
          isDeleted: isDel,
          isWarned: isWarn
        });
      }
    });

    return images.reverse();
  }, [activeTask, selectedItemId, roomMessages]);

  // Lọc tin nhắn cho Tab 2 (Nội dung nhắn) ở Khung 4
  const filteredRoomMessages = useMemo(() => {
    if (!roomMsgSearchQuery.trim()) return roomMessages;
    const q = roomMsgSearchQuery.toLowerCase();
    return roomMessages.filter(m => 
      (m.senderName && m.senderName.toLowerCase().includes(q)) ||
      (m.text && m.text.toLowerCase().includes(q)) ||
      (m.rawText && m.rawText.toLowerCase().includes(q))
    );
  }, [roomMessages, roomMsgSearchQuery]);

  // Xử lý chọn tệp đính kèm khi nhắn tin trong phòng (hỗ trợ tệp nặng tới 250MB)
  const handleDevFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`Tệp "${file.name}" vượt quá giới hạn tối đa 250MB.`);
        continue;
      }
      try {
        let thumb = '';
        if (file.type.startsWith('image/')) {
          thumb = await generateImageThumbnail(file, 480, 0.75);
        }
        let fileUrl = '';
        if (file.size > 200 * 1024) {
          const uploaded = await uploadFileToServer(file);
          fileUrl = uploaded.url;
        } else if (!thumb) {
          thumb = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string) || '');
            r.readAsDataURL(file);
          });
        }
        setDevAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          data: thumb,
          url: fileUrl
        }].slice(0, 10));
      } catch (err) {
        console.error('Dev file attach error:', err);
      }
    }
    if (e.target) e.target.value = '';
  };

  const handleRemoveDevAttachment = (index: number) => {
    setDevAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // DEV gửi tin nhắn trực tiếp vào phòng (Miễn trừ mã PIN, đính kèm ảnh/tệp, phong cách DEV chính chủ)
  const handleSendDevMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!devInputText.trim() && devAttachments.length === 0) || !selectedItemId || !currentUser) return;

    setIsSendingDevMessage(true);
    try {
      const baseName = (currentUser.displayName || settings.deviceName || 'Admin').trim();
      const devSenderName = `${baseName} DEV`;
      const now = new Date();
      const messageText = devInputText.trim();

      const payload: any = {
        roomId: selectedItemId,
        senderId: currentUser.uid,
        senderName: devSenderName,
        senderEmail: currentUser.email || 'hducthien67@gmail.com',
        senderDevice: settings.deviceName || 'DEV DataStore Console',
        text: messageText,
        rawText: messageText, // Giữ nguyên văn không che
        isDevMessage: true,
        createdAt: now.toISOString(),
        timestamp: now.getTime(),
        serverTimestamp: serverTimestamp()
      };

      if (devAttachments.length > 0) {
        payload.attachments = devAttachments;
        if (devAttachments.length === 1) {
          payload.fileName = devAttachments[0].name;
          payload.fileSize = devAttachments[0].size;
          payload.fileType = devAttachments[0].type;
          payload.fileData = devAttachments[0].data;
        }
      }

      await addDoc(collection(db, 'rooms', selectedItemId, 'messages'), payload);

      setDevInputText('');
      setDevAttachments([]);
    } catch (err) {
      console.error('Lỗi gửi tin nhắn DEV vào phòng:', err);
      alert('Lỗi gửi tin nhắn: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSendingDevMessage(false);
    }
  };

  // DEV xóa tin nhắn cụ thể trong phòng (Vẫn giữ lại trong lưu trữ kiểm toán Khung 4)
  const handleDeleteRoomMessage = async (msgId: string) => {
    if (!selectedItemId) return;
    if (!confirm('Bạn có chắc chắn muốn xóa tin nhắn này khỏi phòng hiển thị của Client? (Tin nhắn vẫn được bảo lưu trong Khung 4 - Nội Dung để kiểm toán)')) return;
    try {
      await deleteDoc(doc(db, 'rooms', selectedItemId, 'messages', msgId));
      setRoomMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeletedBySender: true, deletedBySender: true, deletedAt: new Date().toISOString() } : m));
    } catch (err) {
      console.error('Lỗi xóa tin nhắn:', err);
    }
  };

  // DEV xóa vĩnh viễn phòng chat
  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('CẢNH BÁO DEV: Bạn có chắc chắn muốn xóa vĩnh viễn phòng chat này khỏi hệ thống Firestore?')) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      setSelectedItemId(null);
    } catch (err) {
      console.error('Lỗi xóa phòng chat:', err);
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

  const isDev = isDevUser(currentUser?.email);

  if (!isDev) {
    return (
      <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center selection:bg-rose-500 selection:text-white font-sans">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">403 - Quyền Truy Cập Bị Từ Chối</h2>
        <p className="text-sm text-slate-400 max-w-md mb-2">
          Chỉ tài khoản DEV chính thức (<span className="text-emerald-400 font-mono font-semibold">hducthien67@gmail.com</span>) mới có quyền truy cập hệ thống DataStore này.
        </p>
        <p className="text-xs text-rose-300 font-mono bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 mb-6">
          Tài khoản hiện tại ({currentUser?.email || 'Chưa đăng nhập'}) không có quyền hạn.
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all shadow-md active:scale-95"
        >
          Quay lại ứng dụng CloudSend
        </button>
      </div>
    );
  }

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
                <span>6 Tác vụ quản trị DEV hoạt động</span>
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

            {/* 6. Báo Cáo Tố Cáo */}
            <button
              id="task-btn-reports"
              type="button"
              onClick={() => { setActiveTask('reports'); setSelectedItemId(null); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                activeTask === 'reports'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-rose-950/50 ring-1 ring-rose-500/30'
                  : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${activeTask === 'reports' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
                <Flag className="w-3.5 h-3.5" />
              </div>
              <span>6. Báo Cáo Tố Cáo</span>
              {reports.filter(r => r.status === 'pending').length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold animate-pulse">
                  {reports.filter(r => r.status === 'pending').length}
                </span>
              )}
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

            {/* MỤC 1. CÁC PHÒNG CHAT */}
            {activeTask === 'rooms' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400 px-1 uppercase tracking-wider">
                  Phân loại phòng chat:
                </div>

                {/* 1. Tất cả phòng */}
                <button
                  type="button"
                  onClick={() => { setRoomFilter('all'); setSelectedItemId(null); }}
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
                    {roomsWithViolations.length}
                  </span>
                </button>

                {/* 2. Các phòng Public */}
                <button
                  type="button"
                  onClick={() => { setRoomFilter('public'); setSelectedItemId(null); }}
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
                      <div className="font-semibold text-slate-200">Các phòng Public</div>
                      <div className="text-[10px] text-slate-400">Công khai, vào tự do</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {roomsWithViolations.filter(r => !r.isPrivate).length}
                  </span>
                </button>

                {/* 3. Các phòng Private */}
                <button
                  type="button"
                  onClick={() => { setRoomFilter('private'); setSelectedItemId(null); }}
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
                      <div className="font-semibold text-slate-200">Các phòng Private</div>
                      <div className="text-[10px] text-slate-400">Khóa mã PIN riêng</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    {roomsWithViolations.filter(r => !!r.isPrivate).length}
                  </span>
                </button>

                {/* 4. Các phòng vi phạm */}
                <div className={`p-2 rounded-xl border transition-all ${
                  roomFilter === 'violating'
                    ? 'bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/20'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomFilter('violating');
                      setSelectedItemId(null);
                    }}
                    className="w-full flex items-center justify-between text-left py-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className={`font-semibold text-xs ${roomFilter === 'violating' ? 'text-amber-300' : 'text-slate-200'}`}>
                          Các phòng vi phạm
                        </div>
                        <div className="text-[10px] text-slate-400">Nội quy & cảnh cáo</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {countRoomSeverity.all}
                    </span>
                  </button>

                  {/* Tab nhỏ của mục thứ 4: Text 'Các Phòng Vi Phạm' + 4 mức độ: Nhẹ, Bình Thường, Nặng, Hết Cứu */}
                  {roomFilter === 'violating' && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 space-y-1.5 animate-fadeIn">
                      <div className="text-[11px] font-bold text-amber-400 tracking-wide uppercase px-1 flex items-center gap-1">
                        <span>Các Phòng Vi Phạm</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* 1. Nhẹ */}
                        <button
                          type="button"
                          onClick={() => { setRoomViolationSeverity('light'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            roomViolationSeverity === 'light'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Nhẹ</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400">
                            {countRoomSeverity.light}
                          </span>
                        </button>

                        {/* 2. Bình Thường */}
                        <button
                          type="button"
                          onClick={() => { setRoomViolationSeverity('medium'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            roomViolationSeverity === 'medium'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>Bình Thường</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-400">
                            {countRoomSeverity.medium}
                          </span>
                        </button>

                        {/* 3. Nặng */}
                        <button
                          type="button"
                          onClick={() => { setRoomViolationSeverity('heavy'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            roomViolationSeverity === 'heavy'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            <span>Nặng</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-rose-400">
                            {countRoomSeverity.heavy}
                          </span>
                        </button>

                        {/* 4. Hết Cứu */}
                        <button
                          type="button"
                          onClick={() => { setRoomViolationSeverity('critical'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            roomViolationSeverity === 'critical'
                              ? 'bg-red-600/30 text-red-200 border-red-500 font-bold shadow-sm ring-1 ring-red-500/50'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span>Hết Cứu</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300">
                            {countRoomSeverity.critical}
                          </span>
                        </button>
                      </div>

                      {/* Nút xem tất cả vi phạm */}
                      <button
                        type="button"
                        onClick={() => { setRoomViolationSeverity('all'); setSelectedItemId(null); }}
                        className={`w-full py-1 text-[10px] text-center rounded border transition-all ${
                          roomViolationSeverity === 'all'
                            ? 'text-amber-300 bg-amber-500/10 border-amber-500/30 font-semibold'
                            : 'text-slate-400 border-transparent hover:text-slate-300'
                        }`}
                      >
                        (Hiện toàn bộ {countRoomSeverity.all} phòng vi phạm)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MỤC 2. NHỮNG NGƯỜI DÙNG */}
            {activeTask === 'users' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400 px-1 uppercase tracking-wider">
                  Phân loại & Bộ lọc Người Dùng:
                </div>

                {/* 1. Tất cả người dùng */}
                <button
                  type="button"
                  onClick={() => { setUserFilter('all'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all border ${
                    userFilter === 'all'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>Tất cả người dùng</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {evaluatedUsersWithViolations.length}
                  </span>
                </button>

                {/* 2. Người dùng Online */}
                <button
                  type="button"
                  onClick={() => { setUserFilter('online'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all border ${
                    userFilter === 'online'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <div className="text-left">
                      <div className="font-semibold text-emerald-400">Người dùng Online</div>
                      <div className="text-[10px] text-slate-400">Đang hoạt động trên hệ thống</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {verifiedOnlineUsersCount}
                  </span>
                </button>

                {/* 3. Người dùng Offline */}
                <button
                  type="button"
                  onClick={() => { setUserFilter('offline'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all border ${
                    userFilter === 'offline'
                      ? 'bg-slate-800 text-slate-200 border-slate-600 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    <div className="text-left">
                      <div className="font-semibold text-slate-300">Người dùng Offline</div>
                      <div className="text-[10px] text-slate-500">Ngoại tuyến / Không hoạt động</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    {evaluatedUsersWithViolations.length - verifiedOnlineUsersCount}
                  </span>
                </button>

                {/* 4. Người dùng vi phạm */}
                <div className={`p-2 rounded-xl border transition-all ${
                  userFilter === 'violating'
                    ? 'bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/20'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      setUserFilter('violating');
                      setSelectedItemId(null);
                    }}
                    className="w-full flex items-center justify-between text-left py-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className={`font-semibold text-xs ${userFilter === 'violating' ? 'text-amber-300' : 'text-slate-200'}`}>
                          Người dùng vi phạm
                        </div>
                        <div className="text-[10px] text-slate-400">Có dấu hiệu hoặc bị xử lý</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {countUserSeverity.all}
                    </span>
                  </button>

                  {/* Bên trong mục thứ 4: Text 'Các trường hợp vi phạm' + 4 tab nhỏ: Nhẹ, Bình Thường, Nặng, Hết Cứu */}
                  {userFilter === 'violating' && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 space-y-1.5 animate-fadeIn">
                      <div className="text-[11px] font-bold text-amber-400 tracking-wide uppercase px-1 flex items-center gap-1">
                        <span>Các trường hợp vi phạm</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {/* 1. Nhẹ */}
                        <button
                          type="button"
                          onClick={() => { setUserViolationSeverity('light'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            userViolationSeverity === 'light'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Nhẹ</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400">
                            {countUserSeverity.light}
                          </span>
                        </button>

                        {/* 2. Bình Thường */}
                        <button
                          type="button"
                          onClick={() => { setUserViolationSeverity('medium'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            userViolationSeverity === 'medium'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>Bình Thường</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-400">
                            {countUserSeverity.medium}
                          </span>
                        </button>

                        {/* 3. Nặng */}
                        <button
                          type="button"
                          onClick={() => { setUserViolationSeverity('heavy'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            userViolationSeverity === 'heavy'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 font-bold shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            <span>Nặng</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-rose-400">
                            {countUserSeverity.heavy}
                          </span>
                        </button>

                        {/* 4. Hết Cứu */}
                        <button
                          type="button"
                          onClick={() => { setUserViolationSeverity('critical'); setSelectedItemId(null); }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                            userViolationSeverity === 'critical'
                              ? 'bg-red-600/30 text-red-200 border-red-500 font-bold shadow-sm ring-1 ring-red-500/50'
                              : 'bg-slate-900/80 hover:bg-slate-850 text-slate-400 border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span>Hết Cứu</span>
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300">
                            {countUserSeverity.critical}
                          </span>
                        </button>
                      </div>

                      {/* Xem tất cả vi phạm */}
                      <button
                        type="button"
                        onClick={() => { setUserViolationSeverity('all'); setSelectedItemId(null); }}
                        className={`w-full py-1 text-[10px] text-center rounded border transition-all ${
                          userViolationSeverity === 'all'
                            ? 'text-amber-300 bg-amber-500/10 border-amber-500/30 font-semibold'
                            : 'text-slate-400 border-transparent hover:text-slate-300'
                        }`}
                      >
                        (Hiện toàn bộ {countUserSeverity.all} người dùng vi phạm)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MỤC 3. NHỮNG NGƯỜI DÙNG VI PHẠM */}
            {activeTask === 'violators' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-amber-400 px-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-amber-400" />
                  <span>3. Phân Loại Người Dùng Vi Phạm:</span>
                </div>

                <button
                  type="button"
                  onClick={() => { setViolatorFilter('all'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'all'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span>⚠️ Tất cả vi phạm</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {countUserSeverity.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setViolatorFilter('light'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'light'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>🟢 Mức độ: Nhẹ</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {countUserSeverity.light}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setViolatorFilter('medium'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>🟡 Mức độ: Bình Thường</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {countUserSeverity.medium}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setViolatorFilter('heavy'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'heavy'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>🟠 Mức độ: Nặng</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {countUserSeverity.heavy}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setViolatorFilter('critical'); setSelectedItemId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    violatorFilter === 'critical'
                      ? 'bg-red-600/30 text-red-200 border-red-500 font-semibold ring-1 ring-red-500/50'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>🔴 Mức độ: Hết Cứu</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-red-300">
                    {countUserSeverity.critical}
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

            {/* MỤC 6. BÁO CÁO TỐ CÁO */}
            {activeTask === 'reports' && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400 px-1 uppercase tracking-wider">
                  Trạng thái đơn tố cáo:
                </div>

                {/* Tất cả */}
                <button
                  type="button"
                  onClick={() => setReportFilter('all')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    reportFilter === 'all'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Flag className="w-3.5 h-3.5 text-rose-400" />
                    <span>Tất cả tố cáo</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {reports.length}
                  </span>
                </button>

                {/* Chờ xử lý */}
                <button
                  type="button"
                  onClick={() => setReportFilter('pending')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    reportFilter === 'pending'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>⏳ Chờ xử lý</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                    {reports.filter(r => r.status === 'pending').length}
                  </span>
                </button>

                {/* Đã giải quyết */}
                <button
                  type="button"
                  onClick={() => setReportFilter('resolved')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    reportFilter === 'resolved'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>✅ Đã giải quyết</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    {reports.filter(r => r.status === 'resolved').length}
                  </span>
                </button>

                {/* Đã bỏ qua */}
                <button
                  type="button"
                  onClick={() => setReportFilter('dismissed')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                    reportFilter === 'dismissed'
                      ? 'bg-slate-800 text-white border-slate-600 font-semibold'
                      : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <X className="w-3.5 h-3.5 text-slate-400" />
                    <span>✖️ Đã bỏ qua</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {reports.filter(r => r.status === 'dismissed').length}
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
          className="flex-1 min-w-0 border-b md:border-b-0 border-slate-800 bg-slate-950/20 p-3 sm:p-4 flex flex-col overflow-hidden"
        >
          {activeTask === 'broadcast' ? (
            /* SOẠN THÔNG BÁO TOÀN MÁY CHỦ TRỰC TIẾP TRONG KHUNG GIỮA */
            <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-4 overflow-y-auto">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-indigo-400 shrink-0" />
                <div>
                  <strong className="text-white text-sm block">📢 Soạn Tin Thông Báo Toàn Máy Chủ:</strong>
                  <span>Đẩy tin nhắn thông báo tức thì lên màn hình của tất cả các máy khách đang kết nối đến hệ thống.</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Loại thông báo:</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBroadcastType('emergency')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        broadcastType === 'emergency' ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      🚨 Khẩn cấp
                    </button>
                    <button
                      type="button"
                      onClick={() => setBroadcastType('maintenance')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        broadcastType === 'maintenance' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      ⚠️ Bảo trì
                    </button>
                    <button
                      type="button"
                      onClick={() => setBroadcastType('news')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        broadcastType === 'news' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      📢 Tin tức
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Tiêu đề thông báo:</label>
                  <input
                    type="text"
                    placeholder="VD: Cập nhật hệ thống hoặc Cảnh báo bảo mật..."
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Nội dung chi tiết thông điệp:</label>
                  <textarea
                    rows={5}
                    placeholder="Nhập nội dung cần thông báo đến toàn bộ người dùng và thiết bị..."
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {broadcastStatus && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{broadcastStatus}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSendBroadcast}
                  disabled={!broadcastTitle.trim() || !broadcastMsg.trim()}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>Phát Thông Báo Toàn Máy Chủ Ngay</span>
                </button>
              </div>
            </div>
          ) : activeTask === 'rooms' && selectedItemId && selectedItemData ? (
            /* GIAO DIỆN PHÒNG CHAT TRỰC TIẾP DÀNH CHO DEV (LIVE STREAM & CÁC TAB CHI TIẾT) */
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Header của phòng chat trong DataStore - Phong cách phòng chat đồng bộ & chuyên nghiệp */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-800/80 shrink-0 gap-2.5 bg-slate-900/40 p-2.5 rounded-2xl mb-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedItemId(null)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 transition-all active:scale-95 shrink-0 shadow-sm"
                    title="Quay lại danh sách các phòng chat"
                  >
                    <ChevronLeft className="w-4 h-4 text-emerald-400" />
                    <span>&lt; Danh Sách Phòng</span>
                  </button>

                  <div className="h-4 w-px bg-slate-800 shrink-0" />

                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                      (selectedItemData as any).isPrivate 
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' 
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}>
                      {(selectedItemData as any).isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                          {(selectedItemData as any).name}
                        </span>
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          (selectedItemData as any).isPrivate ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {(selectedItemData as any).isPrivate ? 'Phòng Private' : 'Phòng Public'}
                        </span>
                        {/* Huy hiệu vi phạm của phòng nếu có */}
                        {(selectedItemData as any).violationSeverity === 'light' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            🟢 Vi phạm: Nhẹ
                          </span>
                        )}
                        {(selectedItemData as any).violationSeverity === 'medium' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            🟡 Vi phạm: Bình Thường
                          </span>
                        )}
                        {(selectedItemData as any).violationSeverity === 'heavy' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            🟠 Vi phạm: Nặng
                          </span>
                        )}
                        {(selectedItemData as any).violationSeverity === 'critical' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-200 border border-red-500 animate-pulse">
                            🔴 Vi phạm: Hết Cứu
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        Mã phòng: <strong className="text-emerald-400 font-bold">#{(selectedItemData as any).code}</strong> • Tạo bởi: {(selectedItemData as any).createdByName || 'Người dùng'}
                        {(selectedItemData as any).violationReason && (
                          <span className="text-amber-400 ml-1.5">• {(selectedItemData as any).violationReason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Các Tab chuyển đổi nhanh và nút xóa phòng */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setRoomDetailsTab('chat')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        roomDetailsTab === 'chat' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Phòng Chat (Live)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomDetailsTab('users')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        roomDetailsTab === 'users' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Thành Viên ({roomUsersList.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomDetailsTab('messages')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        roomDetailsTab === 'messages' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Kiểm Toán ({roomMessages.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomDetailsTab('images')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        roomDetailsTab === 'images' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Hình Ảnh ({roomImagesList.length})</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteRoom((selectedItemData as any).id)}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                    title="Xóa vĩnh viễn phòng này"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Xóa Phòng</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: LIVE CHAT */}{/* TAB 1: LIVE CHAT */}
              {roomDetailsTab === 'chat' && (
                <>
                  {/* Danh sách tin nhắn phòng chat hiển thị trực tiếp (Không che từ cấm) */}
              <div 
                ref={messagesScrollRef}
                className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800"
              >
                {roomMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800/80 rounded-2xl bg-slate-900/20 text-slate-400">
                    <MessageSquare className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-xs sm:text-sm font-semibold text-slate-300">Chưa có tin nhắn nào trong phòng này.</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                      Bạn có thể gửi tin nhắn đầu tiên bên dưới với tư cách DEV (Không cần nhập mã PIN để vào phòng).
                    </p>
                  </div>
                ) : (
                  roomMessages.map((msg) => {
                    const isDevMsg = msg.isDevMessage || isDevUser(msg.senderEmail) || (msg.senderName && msg.senderName.includes('DEV'));
                    const isWarned = !!(msg.hasProfanity || msg.hasWarning || msg.isReported);
                    const isDeleted = !!(msg.deletedBySender || msg.isDeletedBySender);

                    return (
                      <div
                        key={msg.id}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isWarned
                            ? 'border-2 border-rose-500 shadow-md shadow-rose-950/50 bg-rose-950/20 ring-1 ring-rose-500/40'
                            : isDevMsg
                            ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-amber-950/30 border-emerald-500/50 shadow-sm'
                            : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        {/* DÒNG ĐẦU TIÊN: TÊN HIỂN THỊ CỦA HỌ + BÊN CẠNH LÀ THỜI GIAN GỬI */}
                        <div className="flex items-center justify-between pb-1 border-b border-slate-800/50 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isDevMsg ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-400 to-emerald-500 p-0.5 flex items-center justify-center shadow-sm">
                                  <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                                </div>
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice });
                                  }}
                                  className="font-extrabold text-xs bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent truncate cursor-pointer hover:underline"
                                  title="Nhấp để chuyển sang xem người dùng này trong tab Những Người Dùng"
                                >
                                  {msg.senderName}
                                </span>
                                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                                  👑 DEV
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice });
                                  }}
                                  className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] text-slate-300 font-bold shrink-0 cursor-pointer hover:ring-2 hover:ring-emerald-400"
                                  title="Nhấp để chuyển sang xem người dùng này"
                                >
                                  {msg.senderName?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice });
                                  }}
                                  className="text-xs font-bold text-slate-200 truncate cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                                  title="Nhấp để chuyển sang xem người dùng này trong tab Những Người Dùng"
                                >
                                  {msg.senderName}
                                </span>
                                {msg.senderDevice && (
                                  <span className="text-[10px] text-slate-500 font-mono hidden sm:inline truncate">
                                    ({msg.senderDevice})
                                  </span>
                                )}
                              </div>
                            )}

                            {/* CẢNH BÁO VI PHẠM - VIỀN ĐỎ & BADGE */}
                            {isWarned && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 font-bold">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                                <span>Cảnh cáo vi phạm</span>
                              </span>
                            )}

                            {/* CLIENT ĐÃ XÓA NHƯNG DATASTORE DEV VẪN LƯU */}
                            {isDeleted && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0 font-bold">
                                <Trash2 className="w-2.5 h-2.5 text-amber-400" />
                                <span>Client đã xóa</span>
                              </span>
                            )}
                          </div>

                          {/* BÊN CẠNH LÀ THỜI GIAN GỬI */}
                          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 shrink-0">
                            <Clock className="w-2.5 h-2.5 text-slate-500" />
                            <span>{formatMessageTime(msg.createdAt, msg.timestamp)}</span>
                          </div>
                        </div>

                        {/* Ở DƯỚI LÀ NỘI DUNG CHAT NHƯ BÌNH THƯỜNG (TRONG DATASTORE KHÔNG BỊ CHE TỪ CẤM KỂ CẢ 18+) */}
                        <div className="mt-1 text-xs text-slate-100 whitespace-pre-wrap break-words leading-relaxed font-normal">
                          {msg.rawText || msg.text}
                        </div>

                        {/* HÌNH ẢNH HOẶC ĐÍNH KÈM NẾU CÓ */}
                        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {msg.attachments.map((att, idx) => {
                              const imgSrc = att.data || att.url;
                              const isImg = att.type?.startsWith('image/') || (att.data && att.data.startsWith('data:image')) || (att.url && att.url.includes('/view/'));
                              return isImg && imgSrc ? (
                                <div
                                  key={idx}
                                  onClick={() => setPreviewImage(att.url || att.data)}
                                  className="group relative rounded-lg overflow-hidden border border-slate-700/80 cursor-pointer hover:border-emerald-500/60 transition-all shadow-md bg-slate-950"
                                >
                                  <img 
                                    src={imgSrc} 
                                    alt={att.name || 'Ảnh đính kèm'} 
                                    className="w-20 h-20 sm:w-24 sm:h-24 object-cover group-hover:scale-105 transition-transform" 
                                  />
                                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 px-1 py-0.5 text-[8px] text-slate-300 font-mono truncate">
                                    {att.name}
                                  </div>
                                </div>
                              ) : (
                                <a 
                                  key={idx} 
                                  href={att.url || att.data}
                                  download={att.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:border-emerald-500/50 transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="font-mono text-[10px] truncate max-w-[130px]">{att.name}</span>
                                  <Download className="w-3 h-3 text-slate-400 hover:text-emerald-400" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* KHUNG NHẮN TIN TRỰC TIẾP DÀNH CHO DEV - TÍCH HỢP ĐÍNH KÈM TỆP & ẢNH CHUẨN PHÒNG CHAT */}
              <div className="p-2.5 sm:p-3 bg-slate-900/95 border-t border-slate-800 shrink-0 flex flex-col gap-2 rounded-b-2xl">
                {/* Ẩn input chọn tệp & hình ảnh */}
                <input 
                  type="file" 
                  ref={devFileInputRef} 
                  onChange={handleDevFileSelect} 
                  multiple 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={devImageInputRef} 
                  onChange={handleDevFileSelect} 
                  accept="image/*" 
                  multiple 
                  className="hidden" 
                />

                {/* Thanh hiển thị danh sách đính kèm đang chờ gửi */}
                {devAttachments.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-1 px-1">
                    {devAttachments.map((att, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 shrink-0 shadow-sm"
                      >
                        {att.type?.startsWith('image/') ? (
                          <div className="w-5 h-5 rounded overflow-hidden bg-slate-900 shrink-0">
                            <img src={att.data} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span className="font-mono text-[11px] truncate max-w-[120px]">{att.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({formatFileSize(att.size)})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDevAttachment(idx)}
                          className="w-4 h-4 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-rose-400 transition-colors ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDevAttachments([])}
                      className="text-[10px] text-rose-400 hover:underline px-2 py-0.5 shrink-0"
                    >
                      Xóa tất cả
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] px-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Nhắn tin với tư cách:</span>
                    <span className="text-emerald-400 font-bold underline">
                      {(currentUser?.displayName || settings.deviceName || 'Admin').trim()} DEV
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">(Miễn trừ PIN • Tự do giám sát & điều hành)</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    ⚡ Live Console
                  </span>
                </div>

                <form onSubmit={handleSendDevMessage} className="flex items-center gap-2">
                  {/* Nút đính kèm tệp */}
                  <button
                    type="button"
                    onClick={() => devFileInputRef.current?.click()}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all active:scale-95 shadow-sm"
                    title="Đính kèm tệp tài liệu"
                  >
                    <Paperclip className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
                  </button>

                  {/* Nút gửi ảnh */}
                  <button
                    type="button"
                    onClick={() => devImageInputRef.current?.click()}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all active:scale-95 shadow-sm"
                    title="Đính kèm hình ảnh"
                  >
                    <Camera className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
                  </button>

                  {/* Ô nhập nội dung tin nhắn */}
                  <input
                    type="text"
                    placeholder="Nhập nội dung nhắn vào phòng này với tư cách DEV (Không cần nhập mã PIN)..."
                    value={devInputText}
                    onChange={(e) => setDevInputText(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 focus:border-emerald-500 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors shadow-inner"
                  />

                  {/* Nút Gửi */}
                  <button
                    type="submit"
                    disabled={(!devInputText.trim() && devAttachments.length === 0) || isSendingDevMessage}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 disabled:opacity-50 transition-all active:scale-95 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Gửi (DEV)</span>
                  </button>
                </form>
              </div>
            </>
          )}

          {/* TAB 2: DANH SÁCH NGƯỜI DÙNG PHÒNG CHAT */}{/* TAB 2: DANH SÁCH NGƯỜI DÙNG PHÒNG CHAT */}
          {roomDetailsTab === 'users' && (
            <div className="flex-1 overflow-y-auto space-y-2.5 p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              {roomUsersList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                  Chưa ghi nhận người dùng nào tham gia phòng này.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {roomUsersList.map((user) => (
                    <div 
                      key={user.uid} 
                      onClick={() => handleNavigateToUser(user.uid, user)}
                      className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-850 hover:border-emerald-500/50 transition-all group shadow-sm"
                      title="Nhấp để xem chi tiết người dùng này trong tab Những Người Dùng"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 relative group-hover:scale-105 transition-transform"
                          style={{ backgroundColor: user.avatarColor || '#10b981' }}
                        >
                          {user.displayName?.charAt(0).toUpperCase() || 'U'}
                          {user.onlineStatus?.isOnline && (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs sm:text-sm text-slate-200 group-hover:text-emerald-400 transition-colors truncate">
                              {user.displayName}
                            </span>
                            {user.role === 'owner' && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Chủ phòng
                              </span>
                            )}
                            {user.role === 'dev' && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                👑 DEV
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                            {user.deviceName || 'Thiết bị'} • {user.messageCount} tin nhắn
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${user.onlineStatus?.color}`}>
                          {user.onlineStatus?.badgeText}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TOÀN BỘ NỘI DUNG NHẮN (LƯU GIỮ VĨNH VIỄN, KHÔNG BỊ XÓA, KHÔNG CHE TỪ CẤM & 18+) */}
          {roomDetailsTab === 'messages' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-2.5 p-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
                <div className="relative flex-1 w-full max-w-md">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Lọc trong toàn bộ nội dung nhắn lưu trữ..."
                    value={roomMsgSearchQuery}
                    onChange={(e) => setRoomMsgSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>Tổng lưu trữ: <strong className="text-white">{roomMessages.length}</strong> tin</span>
                  <span className="text-amber-400">
                    • {roomMessages.filter(m => m.deletedBySender || m.isDeletedBySender).length} đã xóa
                  </span>
                  <span className="text-rose-400">
                    • {roomMessages.filter(m => m.hasProfanity || m.hasWarning || m.isReported).length} cảnh cáo
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
                {filteredRoomMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                    Không tìm thấy tin nhắn nào.
                  </div>
                ) : (
                  filteredRoomMessages.map((msg) => {
                    const isMsgDeleted = !!(msg.deletedBySender || msg.isDeletedBySender);
                    const isMsgWarned = !!(msg.hasProfanity || msg.hasWarning || msg.isReported);

                    return (
                      <div 
                        key={msg.id} 
                        className={`p-3 rounded-2xl border flex flex-col gap-2 transition-all ${
                          isMsgWarned
                            ? 'bg-rose-950/20 border-rose-500/50 shadow-sm'
                            : isMsgDeleted
                            ? 'bg-amber-950/15 border-amber-500/40'
                            : 'bg-slate-900/80 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              onClick={() => handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice })}
                              className="font-bold text-slate-200 truncate cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                              title="Nhấn để xem người dùng này"
                            >
                              {msg.senderName}
                            </span>
                            <span className="text-slate-500 text-[11px] font-mono">• {msg.senderDevice || 'Client'}</span>

                            {isMsgWarned && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono flex items-center gap-1 font-bold">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>Cảnh cáo vi phạm</span>
                              </span>
                            )}

                            {isMsgDeleted && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono flex items-center gap-1 font-bold">
                                <Trash2 className="w-3 h-3 text-amber-400" />
                                <span>Client đã xóa (DEV vẫn lưu)</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono text-xs">{formatMessageTime(msg.createdAt, msg.timestamp)}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoomMessage(msg.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Xóa tin nhắn này khỏi phòng hiển thị của Client"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Nội dung nguyên bản 100% - Không bị che bởi hệ thống kiểm duyệt, kể cả 18+ */}
                        <div className="text-xs text-slate-100 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-850 break-words whitespace-pre-wrap select-text leading-relaxed">
                          {msg.rawText || msg.text}
                        </div>

                        {/* Đính kèm hình ảnh thu nhỏ nếu có trong tin nhắn */}
                        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {msg.attachments.map((att, idx) => {
                              const imgSrc = att.data || att.url;
                              const isImg = att.type?.startsWith('image/') || (att.data && att.data.startsWith('data:image')) || (att.url && att.url.includes('/view/'));
                              return isImg && imgSrc ? (
                                <div
                                  key={idx}
                                  onClick={() => setPreviewImage(att.url || att.data)}
                                  className="relative rounded-xl overflow-hidden border border-slate-700 cursor-pointer hover:border-emerald-400 transition-all shadow-sm"
                                >
                                  <img src={imgSrc} alt={att.name || 'Ảnh'} className="w-16 h-16 object-cover" />
                                  <div className="absolute inset-0 bg-slate-950/20 hover:bg-transparent transition-colors" />
                                </div>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: HÌNH ẢNH ĐÃ GỬI (LƯU GIỮ VĨNH VIỄN CẢ ẢNH ĐÃ XÓA & 18+) */}
          {roomDetailsTab === 'images' && (
            <div className="flex-1 overflow-y-auto p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              {roomImagesList.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                  <ImageIcon className="w-10 h-10 text-slate-600 mb-2" />
                  <span>Chưa có hình ảnh nào được gửi trong phòng này.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {roomImagesList.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setPreviewImage(img.url)}
                      className={`group relative rounded-2xl overflow-hidden border bg-slate-950 cursor-pointer transition-all shadow-md aspect-square ${
                        img.isWarned ? 'border-rose-500/60 hover:border-rose-400 ring-1 ring-rose-500/40' : 'border-slate-800 hover:border-emerald-500'
                      }`}
                    >
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="w-5 h-5 text-white" />
                      </div>

                      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 z-10">
                        {img.isDeleted && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/90 text-slate-950 font-bold shadow">
                            Client đã xóa
                          </span>
                        )}
                        {img.isWarned && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-600/90 text-white font-bold shadow">
                            Cảnh cáo
                          </span>
                        )}
                      </div>

                      <div className="absolute bottom-0 inset-x-0 bg-slate-950/90 px-2 py-1 text-[10px] text-slate-300 font-mono flex items-center justify-between">
                        <span className="truncate max-w-[90px]">{img.senderName}</span>
                        <span className="text-slate-500">{formatMessageTime(img.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
            /* HIỂN THỊ DANH SÁCH BẢN GHI (KHI CHƯA CHỌN PHÒNG HOẶC TÁC VỤ KHÁC) */
            <>
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
                        id={`record-item-${itemId}`}
                        onClick={() => {
                          setSelectedItemId(itemId);
                          if (activeTask !== 'rooms') {
                            setShowDetailModal(true);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-850 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md'
                            : 'bg-slate-900/40 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        {/* TH1: HIỂN THỊ PHÒNG CHAT */}
                        {activeTask === 'rooms' && (
                          <div className="flex items-center justify-between w-full min-w-0">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                                item.isPrivate ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {item.isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                    {item.name}
                                  </span>
                                  <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                                    item.isPrivate ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  }`}>
                                    {item.isPrivate ? 'Private' : 'Public'}
                                  </span>

                                  {/* Mức độ vi phạm của phòng */}
                                  {item.violationSeverity === 'light' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      🟢 Nhẹ (1 cảnh cáo)
                                    </span>
                                  )}
                                  {item.violationSeverity === 'medium' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      🟡 Bình Thường (2 vi phạm)
                                    </span>
                                  )}
                                  {item.violationSeverity === 'heavy' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      🟠 Nặng (Tạm khóa)
                                    </span>
                                  )}
                                  {item.violationSeverity === 'critical' && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-200 border border-red-500 animate-pulse">
                                      🔴 Hết Cứu (Khóa vĩnh viễn)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                  Mã: <strong className="text-emerald-400 font-bold">#{item.code}</strong> • Tạo bởi: {item.createdByName || 'Người dùng'}
                                  {item.violationReason && (
                                    <span className="text-amber-400 ml-1.5">• {item.violationReason}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-emerald-400 font-medium hidden sm:inline hover:underline">
                                Nhấp để vào chat &gt;
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            </div>
                          </div>
                        )}

                        {/* TH2: HIỂN THỊ NGƯỜI DÙNG -> Hiện ảnh, tên, text check online và mức độ vi phạm nếu có */}
                        {activeTask === 'users' && (
                          <div className="flex items-center justify-between w-full min-w-0">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Ảnh Avatar người dùng */}
                              <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-inner relative border border-white/10"
                                style={{ backgroundColor: item.avatarColor || '#10b981' }}
                              >
                                {item.displayName?.charAt(0).toUpperCase() || 'U'}
                                {item.onlineCheck?.isOnline && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5 animate-pulse" />
                                )}
                              </div>

                              {/* Tên & Text check online */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                    {item.displayName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-block">
                                    ({item.deviceName || 'Thiết bị'})
                                  </span>

                                  {/* Hiển thị phân loại mức độ vi phạm của người dùng nếu có */}
                                  {item.violationSeverity === 'light' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      🟢 Vi phạm: Nhẹ
                                    </span>
                                  )}
                                  {item.violationSeverity === 'medium' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      🟡 Vi phạm: Bình Thường
                                    </span>
                                  )}
                                  {item.violationSeverity === 'heavy' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      🟠 Vi phạm: Nặng
                                    </span>
                                  )}
                                  {item.violationSeverity === 'critical' && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-200 border border-red-500 animate-pulse">
                                      🔴 Vi phạm: Hết Cứu
                                    </span>
                                  )}
                                </div>
                                
                                {/* TEXT CHECK XEM HỌ CÓ ĐANG THẬT SỰ ONLINE KHÔNG */}
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${item.onlineCheck?.color}`}>
                                    {item.onlineCheck?.badgeText}
                                  </span>
                                  <span className="text-[10px] text-slate-500 truncate hidden md:inline-block">
                                    • {item.onlineCheck?.detailText}
                                  </span>
                                  {item.violationReason && (
                                    <span className="text-[10px] text-amber-400 font-mono truncate">
                                      • {item.violationReason}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                          </div>
                        )}

                        {/* TH3: HIỂN THỊ NGƯỜI DÙNG VI PHẠM */}{/* TH3: HIỂN THỊ NGƯỜI DÙNG VI PHẠM */}
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

                        {/* TH6: HIỂN THỊ BÁO CÁO TỐ CÁO */}
                        {activeTask === 'reports' && (
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              item.status === 'pending'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : item.status === 'resolved'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              <Flag className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                  Bị tố cáo: {item.senderName}
                                </span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
                                  item.status === 'pending'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : item.status === 'resolved'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  {item.status === 'pending' ? '⏳ Chờ xử lý' : item.status === 'resolved' ? '✅ Đã xử lý' : '✖️ Bỏ qua'}
                                </span>
                              </div>
                              <div className="text-[11px] text-amber-300/90 truncate mt-0.5 font-medium">
                                Lý do: {item.reason}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                Phòng: {item.roomName} • Người báo: {item.reportedByName} • {formatMessageTime(item.createdAt, item.timestamp)}
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
            </>
          )}
        </section>

      </div>

      {/* MODAL CHI TIẾT & TÁC VỤ KỶ LUẬT (CHỈ MỞ KHI DEV NHẤP CHỌN BẢN GHI KHÔNG PHẢI PHÒNG CHAT) */}
      {showDetailModal && selectedItemData && activeTask !== 'rooms' && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setShowDetailModal(false)}
        >
          <div 
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <PanelRight className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Chi Tiết & Tác Vụ Kỷ Luật
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Đóng cửa sổ"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(() => {
                const item = selectedItemData as any;

                if (activeTask === 'reports') {
                  const rep = item as ContentReport;
                  return (
                    <div className="space-y-4">
                      {/* Trạng thái tố cáo */}
                      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-slate-400 uppercase">Trạng thái đơn:</span>
                          <span className={`text-xs font-mono px-2.5 py-1 rounded-full border font-semibold ${
                            rep.status === 'pending'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                              : rep.status === 'resolved'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {rep.status === 'pending' ? '⏳ Chờ DEV xử lý' : rep.status === 'resolved' ? '✅ Đã giải quyết' : '✖️ Đã bỏ qua'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                          <div>
                            <span className="text-slate-400">Người bị tố cáo:</span>{' '}
                            <strong className="text-rose-300">{rep.senderName}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Thiết bị:</span>{' '}
                            <span className="font-mono text-slate-300">{rep.senderDevice || 'Không rõ'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Người gửi tố cáo:</span>{' '}
                            <span className="font-medium text-emerald-300">{rep.reportedByName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Phòng chat:</span>{' '}
                            <span className="font-mono text-slate-200">{rep.roomName}</span>
                          </div>
                        </div>

                        {/* Lý do */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="text-[11px] text-amber-400 font-mono uppercase">Lý do & Mô tả vi phạm:</div>
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 font-medium">
                            {rep.reason}
                          </div>
                        </div>

                        {/* Bằng chứng */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="text-[11px] text-rose-400 font-mono uppercase flex items-center justify-between">
                            <span>Nội dung tin nhắn gốc (Bằng chứng thô không che):</span>
                            <span className="text-[10px] text-slate-500">raw text</span>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 text-xs font-mono text-rose-200 whitespace-pre-wrap break-words">
                            {rep.messageRawText || rep.messageText || '[Không có nội dung văn bản]'}
                          </div>
                        </div>
                      </div>

                      {/* Các tác vụ xử lý */}
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Hành động kỷ luật & Xử lý:</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            handleDeleteReportedMessage(rep.roomId, rep.messageId, rep.id);
                            setShowDetailModal(false);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Xóa Tin Nhắn Vi Phạm Khỏi Phòng</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleBanUserFromReport(rep.senderId, rep.senderName, 3, rep.reason, rep.id);
                              setShowDetailModal(false);
                            }}
                            className="py-2.5 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-all flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Ban className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ban 3 Ngày</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleBanUserFromReport(rep.senderId, rep.senderName, 'perm', rep.reason, rep.id);
                              setShowDetailModal(false);
                            }}
                            className="py-2.5 px-3 rounded-xl bg-rose-700/30 hover:bg-rose-700/40 text-rose-300 border border-rose-600/50 text-xs font-semibold transition-all flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-400" />
                            <span>Ban Vĩnh Viễn</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              handleResolveReport(rep.id);
                              setShowDetailModal(false);
                            }}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Đã Xử Lý Xong</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleDismissReport(rep.id);
                              setShowDetailModal(false);
                            }}
                            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition-all"
                          >
                            Bỏ qua
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono uppercase text-slate-400">ID Bản Ghi:</span>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 truncate max-w-[260px]">
                          {item.id || item.uid}
                        </span>
                      </div>

                      <div className="font-bold text-base text-slate-100">
                        {item.name || item.displayName || item.title}
                      </div>

                      {item.onlineCheck && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="text-[11px] text-slate-400 uppercase font-mono">Trạng thái Online thực tế:</div>
                          <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${item.onlineCheck.color}`}>
                            <span className="font-semibold">{item.onlineCheck.badgeText}</span>
                            <span className="text-xs font-mono">{item.onlineCheck.detailText}</span>
                          </div>
                        </div>
                      )}

                      {item.violationReason && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="text-[11px] text-amber-400 uppercase font-mono">Bằng chứng vi phạm:</div>
                          <div className="text-xs text-amber-200/90 bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
                            {item.violationReason}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Dữ liệu JSON thuộc tính:</span>
                        </span>
                      </div>
                      <pre className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300/90 overflow-x-auto max-h-56 scrollbar-thin scrollbar-thumb-slate-800">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      {activeTask === 'banned' && (
                        <button
                          type="button"
                          onClick={() => {
                            handleUnbanUser(item.uid);
                            setShowDetailModal(false);
                          }}
                          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Gỡ Ban Tài Khoản Này (Unban)</span>
                        </button>
                      )}

                      {activeTask === 'violators' && (
                        <button
                          type="button"
                          onClick={() => {
                            alert();
                            setShowDetailModal(false);
                          }}
                          className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Gửi Cảnh Cáo Vi Phạm (Warning)</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LIGHTBOX XEM ẢNH FULL-SIZE */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800">
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Xem ảnh chi tiết (DataStore Image Preview)</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage}
                  download="cloudsend-image.png"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="Tải ảnh về máy"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="Đóng xem ảnh"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3 flex items-center justify-center bg-black/50 overflow-auto max-h-[80vh]">
              <img src={previewImage} alt="Ảnh phóng to" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
