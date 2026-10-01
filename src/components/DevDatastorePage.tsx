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
  Camera,
  Copy,
  Bot,
  Laptop,
  Tv,
  Tablet,
  Bell
} from 'lucide-react';
import { 
  collection, 
  collectionGroup,
  where,
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
import { ChatRoom, UserDevice, UserSanction, ChatMessage, ContentReport, ChatAttachment, DeviceType } from '../types';
import { formatFileSize } from '../utils/device';
import { 
  isDevUser, 
  DEV_EMAIL, 
  SANCTION_TIERS, 
  applyTierSanction, 
  sendPrivateDevNotification, 
  callAiAuditUser, 
  AiEvaluationResult 
} from '../utils/devModeration';
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
  const [violatorTarget, setViolatorTarget] = useState<'users' | 'rooms'>('users');
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
  const [auditFilter, setAuditFilter] = useState<'all' | 'deleted' | 'warned'>('all');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [roomMsgSearchQuery, setRoomMsgSearchQuery] = useState('');
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const devFileInputRef = useRef<HTMLInputElement>(null);
  const devImageInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // State chuyên biệt cho Tác vụ 2. Những Người Dùng (Quản trị, Thiết bị, Thông báo riêng, Kỷ luật AI)
  const [firestoreUsers, setFirestoreUsers] = useState<any[]>([]);
  const [userDetailsTab, setUserDetailsTab] = useState<'info' | 'notify' | 'moderation' | 'messages'>('info');
  const [privateMsgText, setPrivateMsgText] = useState('');
  const consecutiveEnterCountRef = useRef<number>(0);
  const [privateNotifStatus, setPrivateNotifStatus] = useState<string | null>(null);
  const [isSendingPrivateNotif, setIsSendingPrivateNotif] = useState(false);
  const [sentPrivateNotifs, setSentPrivateNotifs] = useState<any[]>([]);
  const [aiAuditResult, setAiAuditResult] = useState<AiEvaluationResult | null>(null);
  const [isAiAuditing, setIsAiAuditing] = useState(false);
  const [userMessages, setUserMessages] = useState<ChatMessage[]>([]);
  const [copiedUid, setCopiedUid] = useState(false);

  // Lắng nghe thông báo riêng và tin nhắn của người dùng đang được chọn thời gian thực
  useEffect(() => {
    if (activeTask !== 'users' || !selectedItemId) {
      setUserMessages([]);
      setSentPrivateNotifs([]);
      setAiAuditResult(null);
      setPrivateMsgText('');
      consecutiveEnterCountRef.current = 0;
      return;
    }

    // 1. Lắng nghe thông báo riêng đã gửi cho người này
    const qNotifs = query(
      collection(db, 'user_notifications'),
      where('targetUid', '==', selectedItemId),
      limit(50)
    );
    const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setSentPrivateNotifs(list);
    }, (err) => {
      console.warn('Lỗi đọc user_notifications:', err);
    });

    // 2. Lắng nghe/truy vấn tin nhắn của người dùng này qua collection group
    const qUserMsgs = query(
      collectionGroup(db, 'messages'),
      where('senderId', '==', selectedItemId),
      limit(100)
    );
    const unsubUserMsgs = onSnapshot(qUserMsgs, (snapshot) => {
      const list: ChatMessage[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      list.sort((a, b) => {
        const tA = a.timestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tB = b.timestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tA - tB;
      });
      setUserMessages(list);
    }, (err) => {
      console.warn('Lỗi đọc user messages collection group:', err);
    });

    return () => {
      unsubNotifs();
      unsubUserMsgs();
    };
  }, [activeTask, selectedItemId]);

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

    // 6. Users profiles (Người dùng thực tế trong hệ thống)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFirestoreUsers(list);
    }, (err) => {
      console.warn('Lỗi đọc users Firestore:', err);
    });

    return () => {
      unsubRooms();
      unsubPresence();
      unsubSanctions();
      unsubBroadcasts();
      unsubReports();
      unsubUsers();
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

    // 0. Nạp từ Firestore Users
    firestoreUsers.forEach(fu => {
      const uid = fu.uid || fu.id;
      if (uid) {
        userMap.set(uid, {
          id: uid,
          uid: uid,
          displayName: fu.displayName || fu.name || 'Người dùng',
          email: fu.email || '',
          deviceName: fu.deviceName || 'Thiết bị',
          deviceType: fu.deviceType || 'laptop',
          avatarColor: fu.avatarColor || '#10b981',
          createdAt: fu.createdAt || new Date().toISOString(),
          lastSeen: fu.lastSeen || fu.createdAt || new Date().toISOString(),
          status: fu.status || 'offline',
          onlineCheck: evaluateOnlineStatus(fu.lastSeen, fu.status),
          loggedDevices: fu.loggedDevices || fu.devices || [],
          ...fu
        });
      }
    });

    // 1. Nạp và đồng bộ từ onlinePresence
    onlinePresence.forEach(u => {
      const existing = userMap.get(u.uid);
      userMap.set(u.uid, {
        ...(existing || {}),
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
  }, [firestoreUsers, onlinePresence, currentUser, settings, rooms]);

    // Xử lý và tính toán mức độ vi phạm cho từng phòng chat thực tế (Nhẹ, Bình Thường, Nặng, Hết Cứu)
  const roomsWithViolations = useMemo(() => {
    return rooms.map(r => {
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
  }, [rooms, reports]);

  // Xử lý và tính toán người dùng vi phạm thực tế - Sắp xếp người dùng vi phạm nặng nhất lên ĐẦU danh sách
  const evaluatedUsersWithViolations = useMemo(() => {
    const mapped = evaluatedUsers.map(u => {
      const userReps = reports.filter(r => r.senderId === u.uid);
      const sanction = sanctions.find(s => s.uid === u.uid);
      let sev: 'light' | 'medium' | 'heavy' | 'critical' | undefined = undefined;
      let reason: string | undefined = undefined;
      let count = (sanction?.violationCount || 0) + userReps.length;

      if (sanction?.isBanned || sanction?.lastSanctionType === 'ban_perm') {
        sev = 'critical';
        reason = sanction.reason || 'Bị cấm vĩnh viễn (Hết cứu)';
      } else if (sanction?.lastSanctionType === 'ban_6m' || sanction?.lastSanctionType === 'ban_7d' || count >= 4) {
        sev = 'heavy';
        reason = sanction?.reason || `Tái phạm nặng (${count} lần vi phạm)`;
      } else if (sanction?.lastSanctionType === 'ban_3d' || sanction?.lastSanctionType === 'ban_1d' || count >= 3) {
        sev = 'heavy';
        reason = sanction?.reason || `Bị tạm khóa (${count} lần vi phạm)`;
      } else if (sanction?.lastSanctionType === 'chat_lock_1h' || count >= 2) {
        sev = 'medium';
        reason = sanction?.reason || `Cấm chat 1 tiếng (Tái phạm ${count} lần)`;
      } else if (sanction?.lastSanctionType === 'chat_lock_15m' || sanction?.lastSanctionType === 'warn' || count === 1 || u.hasWarning) {
        sev = 'light';
        reason = sanction?.reason || 'Cảnh cáo / Khóa chat ngắn (Vi phạm lần 1)';
      }

      // Xác định người dùng tái phạm nghiêm trọng nhất (Đã từng bị khóa 7 ngày hoặc vi phạm tới hạn cần cấm vĩnh viễn)
      const isWorstViolator = !!(
        sanction?.lastSanctionType === 'ban_perm' ||
        (sanction?.lastSanctionType === 'ban_7d' && count > 1) ||
        (sanction?.isBanned && count >= 3) ||
        sev === 'critical' ||
        count >= 4
      );

      return {
        ...u,
        sanction,
        violationSeverity: sev,
        violationReason: reason,
        violationCount: count,
        isWorstViolator
      };
    });

    // Sắp xếp ưu tiên: Người dùng tái phạm nặng nhất lên đầu -> tiếp theo theo trọng số vi phạm (critical > heavy > medium > light)
    const severityWeight: Record<string, number> = {
      critical: 4,
      heavy: 3,
      medium: 2,
      light: 1
    };

    mapped.sort((a, b) => {
      // 1. Tái phạm nặng nhất lên đỉnh tuyệt đối
      if (a.isWorstViolator !== b.isWorstViolator) {
        return a.isWorstViolator ? -1 : 1;
      }
      // 2. Theo trọng số mức độ vi phạm
      const weightA = a.violationSeverity ? severityWeight[a.violationSeverity] || 0 : 0;
      const weightB = b.violationSeverity ? severityWeight[b.violationSeverity] || 0 : 0;
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      // 3. Số lần vi phạm
      return (b.violationCount || 0) - (a.violationCount || 0);
    });

    return mapped;
  }, [evaluatedUsers, reports, sanctions]);

  // Danh sách người dùng tái phạm mức độ nặng nhất (cần xử lý cấm vĩnh viễn)
  const worstViolators = useMemo(() => {
    return evaluatedUsersWithViolations.filter(u => u.isWorstViolator && !isDevUser(u.email));
  }, [evaluatedUsersWithViolations]);

  const worstViolatorUser = useMemo(() => {
    return worstViolators[0] || evaluatedUsersWithViolations.find(u => (u.violationSeverity === 'heavy' || u.violationSeverity === 'critical') && !isDevUser(u.email)) || null;
  }, [worstViolators, evaluatedUsersWithViolations]);

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
      if (violatorTarget === 'rooms') {
        let list = roomsWithViolations.filter(r => !!r.violationSeverity);
        if (violatorFilter !== 'all') {
          list = list.filter(r => r.violationSeverity === violatorFilter);
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          list = list.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || (r.violationReason && r.violationReason.toLowerCase().includes(q)));
        }
        return list;
      } else {
        let list = evaluatedUsersWithViolations.filter(u => !!u.violationSeverity);
        if (violatorFilter !== 'all') {
          list = list.filter(v => v.violationSeverity === violatorFilter);
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          list = list.filter(v => v.displayName.toLowerCase().includes(q) || (v.violationReason && v.violationReason.toLowerCase().includes(q)) || (v.email && v.email.toLowerCase().includes(q)));
        }
        return list;
      }
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
  }, [activeTask, roomFilter, roomViolationSeverity, userFilter, userViolationSeverity, violatorFilter, violatorTarget, bannedFilter, broadcastFilter, reportFilter, roomsWithViolations, evaluatedUsersWithViolations, sanctions, broadcasts, reports, searchQuery]);

  // Chi tiết mục đang chọn ở Khung 3 / Modal
  const selectedItemData = useMemo(() => {
    if (!selectedItemId) return null;
    if (activeTask === 'rooms' || (activeTask === 'violators' && violatorTarget === 'rooms')) {
      return roomsWithViolations.find((r: any) => r.id === selectedItemId) || null;
    }
    if (activeTask === 'users' || (activeTask === 'violators' && violatorTarget === 'users')) {
      return evaluatedUsersWithViolations.find((u: any) => (u.uid === selectedItemId || u.id === selectedItemId)) || null;
    }
    return filteredItems.find((it: any) => (it.id === selectedItemId || it.uid === selectedItemId)) || null;
  }, [filteredItems, selectedItemId, activeTask, violatorTarget, roomsWithViolations, evaluatedUsersWithViolations]);

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

  // Tổng hợp danh sách tất cả các thiết bị đã đăng nhập bằng tài khoản người dùng đang chọn
  const userDevicesList = useMemo(() => {
    if (activeTask !== 'users' || !selectedItemData) return [];
    const u = selectedItemData as any;
    const devMap = new Map<string, {
      id: string;
      name: string;
      type: DeviceType;
      status: 'online' | 'offline';
      lastSeen?: string;
      isCurrent?: boolean;
      ip?: string;
    }>();

    // 1. Thiết bị chính trong hồ sơ
    if (u.deviceName) {
      const isOnline = u.onlineCheck?.isOnline;
      devMap.set(u.deviceName.toLowerCase(), {
        id: `dev-${u.uid}-main`,
        name: u.deviceName,
        type: (u.deviceType as DeviceType) || 'laptop',
        status: isOnline ? 'online' : 'offline',
        lastSeen: u.lastSeen || u.createdAt,
        isCurrent: u.uid === currentUser?.uid
      });
    }

    // 2. Từ presence các phiên trực tuyến
    onlinePresence.forEach(p => {
      if (p.uid === u.uid || (u.email && p.email && p.email.toLowerCase() === u.email.toLowerCase())) {
        const evaluated = evaluateOnlineStatus(p.lastSeen, p.status);
        const key = (p.deviceName || 'Thiết bị').toLowerCase();
        devMap.set(key, {
          id: `pres-${p.uid}-${p.deviceName}`,
          name: p.deviceName || 'Thiết bị',
          type: (p.deviceType as DeviceType) || 'laptop',
          status: evaluated.isOnline ? 'online' : 'offline',
          lastSeen: p.lastSeen,
          isCurrent: p.uid === currentUser?.uid
        });
      }
    });

    // 3. Từ danh sách loggedDevices nếu có trong doc users
    if (Array.isArray(u.loggedDevices)) {
      u.loggedDevices.forEach((ld: any, idx: number) => {
        const key = (ld.name || ld.deviceName || `device-${idx}`).toLowerCase();
        if (!devMap.has(key)) {
          devMap.set(key, {
            id: ld.id || `ld-${idx}`,
            name: ld.name || ld.deviceName || 'Thiết bị đăng nhập',
            type: ld.type || ld.deviceType || 'laptop',
            status: ld.isOnline ? 'online' : 'offline',
            lastSeen: ld.lastSeen || ld.lastLogin || u.lastSeen,
            isCurrent: ld.isCurrent || false,
            ip: ld.ip
          });
        }
      });
    }

    // 4. Từ các tin nhắn người này từng gửi (senderDevice)
    userMessages.forEach((msg, idx) => {
      if (msg.senderDevice) {
        const key = msg.senderDevice.toLowerCase();
        if (!devMap.has(key)) {
          devMap.set(key, {
            id: `msg-dev-${idx}`,
            name: msg.senderDevice,
            type: 'laptop',
            status: 'offline',
            lastSeen: msg.createdAt
          });
        }
      }
    });

    // Mẫu mặc định nếu chưa lưu thiết bị
    if (devMap.size === 0) {
      devMap.set('default', {
        id: `dev-${u.uid}-default`,
        name: u.deviceName || 'Trình duyệt Web (Mặc định)',
        type: 'laptop',
        status: u.onlineCheck?.isOnline ? 'online' : 'offline',
        lastSeen: u.lastSeen || u.createdAt
      });
    }

    return Array.from(devMap.values());
  }, [activeTask, selectedItemData, onlinePresence, userMessages, currentUser]);

  // Xử lý gửi thông báo riêng cho người dùng
  const handleSendPrivateNotification = async () => {
    if (!privateMsgText.trim() || !selectedItemData || isSendingPrivateNotif) return;
    const target = selectedItemData as any;
    setIsSendingPrivateNotif(true);

    try {
      const sent = await sendPrivateDevNotification({
        targetUid: target.uid || target.id,
        targetEmail: target.email,
        targetName: target.displayName,
        message: privateMsgText.trim(),
        devEmail: currentUser?.email || DEV_EMAIL
      });

      setSentPrivateNotifs(prev => [sent, ...prev]);
      setPrivateMsgText('');
      consecutiveEnterCountRef.current = 0;
      setPrivateNotifStatus(`✅ Đã gửi thông báo riêng tới [${target.displayName}] thành công!`);
      setTimeout(() => setPrivateNotifStatus(null), 4000);
    } catch (err: any) {
      console.error('Send private notification error:', err);
      setPrivateNotifStatus('❌ Gặp sự cố khi gửi thông báo riêng.');
      setTimeout(() => setPrivateNotifStatus(null), 4000);
    } finally {
      setIsSendingPrivateNotif(false);
    }
  };

  // Xử lý phím Enter 2 lần / Backspace cho thông báo riêng theo đúng yêu cầu:
  // - Nếu lần một thì sẽ xuống dòng,
  // - Nếu viết tiếp thì sẽ reset cái Enter từ 1 thành 0,
  // - Nếu nhấn Enter lần một rồi nhấn thêm lần nữa thì sẽ được gửi đi,
  // - Nếu có nhấn nút Backspace thì cũng không sao vẫn nhấn Enter lần 2 được!
  const handlePrivateMsgKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (consecutiveEnterCountRef.current === 1) {
        e.preventDefault();
        consecutiveEnterCountRef.current = 0;
        handleSendPrivateNotification();
      } else {
        consecutiveEnterCountRef.current = 1;
      }
    } else if (e.key === 'Backspace') {
      // Nhấn Backspace: không reset consecutiveEnterCountRef để vẫn nhấn Enter lần 2 được
    } else {
      // Viết tiếp: reset bộ đếm về 0
      consecutiveEnterCountRef.current = 0;
    }
  };

  // AI điều kiểm tra vi phạm đối chiếu 12 luật cộng đồng
  const handleRunAiAudit = async () => {
    if (!selectedItemData || isAiAuditing) return;
    const target = selectedItemData as any;
    setIsAiAuditing(true);

    try {
      const res = await callAiAuditUser({
        userId: target.uid || target.id,
        userName: target.displayName,
        userEmail: target.email,
        messages: userMessages.map(m => ({
          text: m.text,
          rawText: m.rawText,
          fileName: m.fileName,
          createdAt: m.createdAt
        })),
        reports: reports.filter(r => r.senderId === target.uid || r.reportedByUid === target.uid),
        violationHistoryCount: target.violationCount || (target.sanction?.violationCount || 0),
        currentSanction: target.sanction || sanctions.find(s => s.uid === target.uid)
      });

      setAiAuditResult(res);
    } catch (err) {
      console.error('AI Audit error:', err);
    } finally {
      setIsAiAuditing(false);
    }
  };

  // Áp dụng hình phạt theo 4 nút và nút cấm vĩnh viễn
  const handleApplyTierSanction = async (
    tier: 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_perm',
    customReason?: string,
    ruleViolated?: string
  ) => {
    if (!selectedItemData) return;
    const target = selectedItemData as any;
    const targetUid = target.uid || target.id;
    const targetEmail = target.email || '';
    const targetName = target.displayName || 'Người dùng';

    if (isDevUser(targetEmail)) {
      alert('Không thể áp dụng hình phạt kỷ luật cho Quản Trị Viên (DEV)!');
      return;
    }

    const tierConf = SANCTION_TIERS[tier];
    const confirmMsg = tier === 'level_perm'
      ? `⚠️ BẠN CÓ CHẮC CHẮN MUỐN CẤM TÀI KHOẢN [${targetName}] VĨNH VIỄN KHÔNG?\n\nNgười này sẽ bị thu hồi toàn bộ quyền truy cập và cấm đăng nhập vĩnh viễn.`
      : `Xác nhận áp dụng hình phạt:\n\n• ${tierConf.label}\n• Nhắc nhở gửi tới người dùng: "${tierConf.remind}"\n\nBạn có muốn thực hiện không?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const updated = await applyTierSanction({
        targetUid,
        targetEmail,
        targetDisplayName: targetName,
        tier,
        customReason: customReason || (aiAuditResult?.summary || tierConf.label),
        ruleViolated: ruleViolated || (aiAuditResult?.findings?.[0]?.ruleNumber || ''),
        devEmail: currentUser?.email || DEV_EMAIL
      });

      setSanctions(prev => {
        const filtered = prev.filter(s => s.uid !== targetUid);
        return [updated, ...filtered];
      });

      alert(`✅ Đã áp dụng thành công ${tierConf.label} cho [${targetName}]!\n\nNhắc nhở: "${tierConf.remind}"`);
    } catch (err) {
      console.error('Apply tier sanction error:', err);
      alert('Gặp lỗi khi lưu kỷ luật vào Firestore.');
    }
  };

  // Xóa một người dùng test / ảo khỏi Firestore
  const handleDeleteUser = async (targetUid: string, targetName: string, targetEmail?: string) => {
    if (isDevUser(targetEmail)) {
      alert('Không thể xóa tài khoản của Quản Trị Viên DEV chính thức!');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản [${targetName}] khỏi Firestore không?\n\nThao tác này sẽ xóa hồ sơ người dùng, trạng thái presence và các bản ghi kỷ luật liên quan.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', targetUid));
      await deleteDoc(doc(db, 'presence', targetUid));
      await deleteDoc(doc(db, 'sanctions', targetUid));

      setFirestoreUsers(prev => prev.filter(u => (u.uid || u.id) !== targetUid));
      setOnlinePresence(prev => prev.filter(p => p.uid !== targetUid));
      setSanctions(prev => prev.filter(s => s.uid !== targetUid));

      if (selectedItemId === targetUid) {
        setSelectedItemId(null);
      }

      alert(`✅ Đã xóa tài khoản [${targetName}] thành công khỏi hệ thống!`);
    } catch (err) {
      console.error('Delete user error:', err);
      alert('Lỗi khi xóa người dùng khỏi Firestore.');
    }
  };

  // Dọn dẹp hàng loạt các tài khoản test / không thật
  const handlePurgeTestUsers = async () => {
    const testUsers = evaluatedUsersWithViolations.filter(u => {
      if (isDevUser(u.email)) return false;
      if (currentUser && u.uid === currentUser.uid) return false;
      const name = (u.displayName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return (
        name.includes('test') ||
        name.includes('fake') ||
        name.includes('ảo') ||
        name.includes('bot') ||
        email.includes('test') ||
        email.includes('example.com') ||
        email.includes('fake') ||
        !email
      );
    });

    if (testUsers.length === 0) {
      alert('Hiện tại không có tài khoản test hoặc tài khoản ảo nào cần dọn dẹp.');
      return;
    }

    if (!window.confirm(`Tìm thấy ${testUsers.length} tài khoản thử nghiệm / không thật:\n\n${testUsers.map(u => `• ${u.displayName} (${u.email || 'Khách'})`).slice(0, 8).join('\n')}${testUsers.length > 8 ? `\n... và ${testUsers.length - 8} tài khoản khác` : ''}\n\nBạn có muốn xóa toàn bộ các tài khoản này khỏi Firestore không? (Tài khoản DEV của bạn sẽ được bảo vệ tuyệt đối).`)) {
      return;
    }

    let deletedCount = 0;
    for (const u of testUsers) {
      try {
        await deleteDoc(doc(db, 'users', u.uid));
        await deleteDoc(doc(db, 'presence', u.uid));
        await deleteDoc(doc(db, 'sanctions', u.uid));
        deletedCount++;
      } catch (err) {
        console.warn('Purge test user error for:', u.uid, err);
      }
    }

    const testUids = new Set(testUsers.map(u => u.uid));
    setFirestoreUsers(prev => prev.filter(u => !testUids.has(u.uid || u.id)));
    setOnlinePresence(prev => prev.filter(p => !testUids.has(p.uid)));
    setSanctions(prev => prev.filter(s => !testUids.has(s.uid)));

    if (selectedItemId && testUids.has(selectedItemId)) {
      setSelectedItemId(null);
    }

    alert(`✅ Đã dọn dẹp thành công ${deletedCount} tài khoản test khỏi Firestore!`);
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

  // Thống kê tin nhắn phục vụ 3 Tab Kiểm Toán
  const roomMessagesDeletedCount = useMemo(() => {
    return roomMessages.filter(m => m.deletedBySender || m.isDeletedBySender).length;
  }, [roomMessages]);

  const roomMessagesWarnedCount = useMemo(() => {
    return roomMessages.filter(m => m.hasProfanity || m.hasWarning || m.isReported).length;
  }, [roomMessages]);

  // Lọc tin nhắn cho Tab Kiểm toán ở Khung 4 theo 3 Tab (Tổng tin nhắn, Số tin nhắn đã xóa, Cảnh cáo)
  const filteredRoomMessages = useMemo(() => {
    let list = roomMessages;
    if (auditFilter === 'deleted') {
      list = list.filter(m => m.deletedBySender || m.isDeletedBySender);
    } else if (auditFilter === 'warned') {
      list = list.filter(m => m.hasProfanity || m.hasWarning || m.isReported);
    }

    if (!roomMsgSearchQuery.trim()) return list;
    const q = roomMsgSearchQuery.toLowerCase();
    return list.filter(m => 
      (m.senderName && m.senderName.toLowerCase().includes(q)) ||
      (m.text && m.text.toLowerCase().includes(q)) ||
      (m.rawText && m.rawText.toLowerCase().includes(q))
    );
  }, [roomMessages, roomMsgSearchQuery, auditFilter]);

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

  // DEV xóa vĩnh viễn phòng chat (bảo vệ Đại Sảnh Toàn Cầu)
  const handleDeleteRoom = async (roomId: string) => {
    if (roomId === 'public-relay-lounge') {
      alert('Không thể xóa Đại Sảnh Toàn Cầu (Global Lounge)! Đây là phòng công khai mặc định của hệ thống.');
      return;
    }
    if (!confirm('CẢNH BÁO DEV: Bạn có chắc chắn muốn xóa vĩnh viễn phòng chat này khỏi hệ thống Firestore?')) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      if (selectedItemId === roomId) {
        setSelectedItemId(null);
      }
    } catch (err) {
      console.error('Lỗi xóa phòng chat:', err);
    }
  };

  // DEV dọn dẹp tất cả các phòng ảo / phòng thử nghiệm (Chỉ giữ lại Đại Sảnh Toàn Cầu)
  const handlePurgeTestRooms = async () => {
    const testRooms = rooms.filter(r => r.id !== 'public-relay-lounge');
    if (testRooms.length === 0) {
      alert('Hệ thống hiện tại chỉ có duy nhất Đại Sảnh Toàn Cầu (Global Lounge), không có phòng test nào khác!');
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn XÓA TẤT CẢ ${testRooms.length} phòng thử nghiệm / phòng không thật không? Chỉ duy nhất Đại Sảnh Toàn Cầu sẽ được giữ lại!`)) {
      return;
    }
    try {
      await Promise.all(testRooms.map(r => deleteDoc(doc(db, 'rooms', r.id))));
      alert(`Đã xóa thành công ${testRooms.length} phòng test. Hiện chỉ còn duy nhất Đại Sảnh Toàn Cầu!`);
      if (selectedItemId && selectedItemId !== 'public-relay-lounge') {
        setSelectedItemId(null);
      }
    } catch (err) {
      console.error('Lỗi khi xóa các phòng test:', err);
      alert('Có lỗi xảy ra khi xóa phòng test.');
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

            {/* 3. Các Vi Phạm */}
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
              <span>3. Các Vi Phạm</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {countUserSeverity.all + countRoomSeverity.all}
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
              </div>
            )}

            {/* MỤC 3. CÁC VI PHẠM (NGƯỜI DÙNG & PHÒNG CHAT VI PHẠM TẬP TRUNG) */}
            {activeTask === 'violators' && (
              <div className="space-y-3">
                <div className="text-[11px] font-medium text-amber-400 px-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-amber-400" />
                  <span>3. Phân Loại Các Vi Phạm:</span>
                </div>

                {/* Chuyển đổi giữa Người Dùng Vi Phạm & Phòng Chat Vi Phạm */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setViolatorTarget('users');
                      setViolatorFilter('all');
                      setSelectedItemId(null);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex flex-col items-center justify-center gap-1 border ${
                      violatorTarget === 'users'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      <span>Người Dùng</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-slate-950/80 text-amber-400 border border-amber-500/30">
                      {countUserSeverity.all}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setViolatorTarget('rooms');
                      setViolatorFilter('all');
                      setSelectedItemId(null);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex flex-col items-center justify-center gap-1 border ${
                      violatorTarget === 'rooms'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Phòng Chat</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-slate-950/80 text-emerald-400 border border-emerald-500/30">
                      {countRoomSeverity.all}
                    </span>
                  </button>
                </div>

                {/* Danh sách các mức độ vi phạm tương ứng */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => { setViolatorFilter('all'); setSelectedItemId(null); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                      violatorFilter === 'all'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold shadow-sm'
                        : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-800/80'
                    }`}
                  >
                    <span>⚠️ Tất cả {violatorTarget === 'users' ? 'người dùng' : 'phòng'} vi phạm</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {violatorTarget === 'users' ? countUserSeverity.all : countRoomSeverity.all}
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
                      {violatorTarget === 'users' ? countUserSeverity.light : countRoomSeverity.light}
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
                      {violatorTarget === 'users' ? countUserSeverity.medium : countRoomSeverity.medium}
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
                      {violatorTarget === 'users' ? countUserSeverity.heavy : countRoomSeverity.heavy}
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
                      {violatorTarget === 'users' ? countUserSeverity.critical : countRoomSeverity.critical}
                    </span>
                  </button>
                </div>
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
              {/* Header của phòng chat trong DataStore - Thiết kế 2 tầng chuẩn mực không bị đè chữ */}
              <div className="flex flex-col gap-2.5 pb-2.5 border-b border-slate-800/80 shrink-0 bg-slate-900/40 p-2.5 rounded-2xl mb-2">
                {/* HÀNG 1: Nút Danh Sách Phòng ở góc trái + Tên phòng & Thông tin + Nút Xóa Phòng ở góc phải */}
                <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    {/* Nút Danh Sách Phòng nhỏ gọn ở góc trái */}
                    <button
                      type="button"
                      onClick={() => setSelectedItemId(null)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 transition-all active:scale-95 shrink-0 shadow-sm"
                      title="Quay lại danh sách các phòng chat"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Danh Sách Phòng</span>
                    </button>

                    <div className="h-4 w-px bg-slate-800 shrink-0" />

                    {/* Tên phòng & các huy hiệu chi tiết */}
                    <div className="min-w-0 flex items-center gap-2.5 flex-1">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                        (selectedItemData as any).isPrivate 
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {(selectedItemData as any).isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                      </div>
                      <div className="truncate min-w-0">
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

                  {/* Nút Xóa Phòng ở góc phải */}
                  {(selectedItemData as any).id !== 'public-relay-lounge' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom((selectedItemData as any).id)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all flex items-center gap-1 shadow-sm active:scale-95 shrink-0"
                      title="Xóa vĩnh viễn phòng này"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden sm:inline">Xóa Phòng</span>
                    </button>
                  )}
                </div>

                {/* HÀNG 2: THANH TÁC VỤ (CÁC TAB CHUYỂN ĐỔI Ở DƯỚI) */}
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800/60 overflow-x-auto scrollbar-none shrink-0">
                  <button
                    type="button"
                    onClick={() => setRoomDetailsTab('chat')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'chat'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border-slate-800'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Phòng Chat (Live)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoomDetailsTab('users')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'users'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Thành Viên ({roomUsersList.length})</span>
                  </button>

                  {/* 3 Tab Kiểm Toán theo yêu cầu */}
                  <button
                    type="button"
                    onClick={() => {
                      setRoomDetailsTab('messages');
                      setAuditFilter('all');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'messages' && auditFilter === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border-slate-800'
                    }`}
                    title="Xem toàn bộ tổng số tin nhắn lưu trữ kiểm toán"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Tổng tin nhắn ({roomMessages.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRoomDetailsTab('messages');
                      setAuditFilter('deleted');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'messages' && auditFilter === 'deleted'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-amber-300 border-slate-800'
                    }`}
                    title="Xem danh sách tin nhắn mà Client đã xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Số tin nhắn đã xóa ({roomMessagesDeletedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRoomDetailsTab('messages');
                      setAuditFilter('warned');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'messages' && auditFilter === 'warned'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-rose-300 border-slate-800'
                    }`}
                    title="Xem danh sách tin nhắn bị cảnh cáo vi phạm"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Cảnh cáo ({roomMessagesWarnedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoomDetailsTab('images')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                      roomDetailsTab === 'images'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border-slate-800'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Hình Ảnh ({roomImagesList.length})</span>
                  </button>
                </div>
              </div>

              {/* TAB 1: LIVE CHAT */}
              {roomDetailsTab === 'chat' && (
                <>
                  {/* Danh sách tin nhắn phòng chat hiển thị dạng Bong Bóng Khí Chuẩn Hình 2 (Không che từ cấm) */}
              <div 
                ref={messagesScrollRef}
                className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800"
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
                        className={`chat-bubble-item flex flex-col ${isDevMsg ? 'items-end' : 'items-start'} group w-full`}
                      >
                        {/* THÔNG TIN NGƯỜI GỬI PHÍA TRÊN BONG BÓNG (KHỚP 100% CẤU TRÚC HÌNH 2) */}
                        {isDevMsg ? (
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400 justify-end flex-wrap">
                            <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-400 to-emerald-500 p-0.5 flex items-center justify-center shadow-sm">
                              <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                            </div>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice });
                              }}
                              className="font-extrabold text-xs bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent truncate cursor-pointer hover:underline"
                            >
                              {msg.senderName}
                            </span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-0.5">
                              👑 DEV CHÍNH CHỦ
                            </span>
                            {msg.senderDevice && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-mono truncate max-w-[140px]">{msg.senderDevice}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500 font-mono">
                              {formatMessageTime(msg.createdAt, msg.timestamp)}
                            </span>

                            {isWarned && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                                <span>Cảnh cáo</span>
                              </span>
                            )}

                            {isDeleted && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <Trash2 className="w-2.5 h-2.5 text-amber-400" />
                                <span>Client đã xóa</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400 flex-wrap">
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
                              className="font-semibold text-slate-200 cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                            >
                              {msg.senderName}
                            </span>
                            {msg.senderDevice && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-mono truncate max-w-[140px]">{msg.senderDevice}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500 font-mono">
                              {formatMessageTime(msg.createdAt, msg.timestamp)}
                            </span>

                            {isWarned && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                                <span>Cảnh cáo vi phạm</span>
                              </span>
                            )}

                            {isDeleted && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <Trash2 className="w-2.5 h-2.5 text-amber-400" />
                                <span>Client đã xóa</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* BONG BÓNG TIN NHẮN THEO ĐÚNG CẤU TRÚC HÌNH 2 */}
                        <div
                          className={`max-w-[85%] sm:max-w-md md:max-w-xl rounded-2xl px-4 py-2.5 space-y-1.5 shadow-sm text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                            isDevMsg
                              ? 'rounded-tr-sm bg-gradient-to-r from-emerald-950/90 via-slate-900 to-amber-950/50 border-2 border-amber-400/70 shadow-lg shadow-amber-500/10 ring-1 ring-emerald-500/40 text-white'
                              : isWarned
                              ? 'rounded-tl-sm bg-rose-950/30 border-2 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500/50 text-rose-100'
                              : isDeleted
                              ? 'rounded-tl-sm bg-slate-850 text-slate-200 border border-amber-500/40 shadow-sm'
                              : 'rounded-tl-sm bg-slate-800 text-slate-100 border border-slate-700/60 shadow-sm'
                          }`}
                        >
                          {/* Banner Thông điệp từ Nhà Phát Triển (DEV) màu vàng hổ phách khớp chuẩn Hình 2 */}
                          {isDevMsg && (
                            <div className="flex items-center gap-1.5 pb-1 border-b border-amber-500/20 text-[10px] text-amber-300 font-semibold">
                              <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span>Thông điệp từ Nhà Phát Triển (DEV)</span>
                            </div>
                          )}

                          {/* Nội dung tin nhắn (Trong DataStore hiển thị 100% nội dung gốc rawText không che) */}
                          <div className="select-text font-normal">
                            {msg.rawText || msg.text}
                          </div>

                          {/* Đính kèm hình ảnh hoặc tệp tin chuẩn Hình 2 */}
                          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map((att, idx) => {
                                const imgSrc = att.data || att.url;
                                const isImg = att.type?.startsWith('image/') || (att.data && att.data.startsWith('data:image')) || (att.url && att.url.includes('/view/'));
                                return isImg && imgSrc ? (
                                  <div
                                    key={idx}
                                    onClick={() => setPreviewImage(att.url || att.data)}
                                    className="group relative rounded-xl overflow-hidden border border-slate-700/80 cursor-pointer hover:border-emerald-500/60 transition-all shadow-md bg-slate-950"
                                  >
                                    <img 
                                      src={imgSrc} 
                                      alt={att.name || 'Ảnh đính kèm'} 
                                      className="w-24 h-24 sm:w-28 sm:h-28 object-cover group-hover:scale-105 transition-transform" 
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
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-slate-200 hover:border-emerald-500 transition-all group/file shadow-sm"
                                  >
                                    <FileText className="w-4 h-4 text-emerald-400 group-hover/file:scale-110 transition-transform" />
                                    <span className="font-mono text-xs truncate max-w-[180px] font-semibold">{att.name}</span>
                                    <Download className="w-3.5 h-3.5 text-slate-400 group-hover/file:text-emerald-400 ml-auto" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
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

          {/* TAB 3: TOÀN BỘ NỘI DUNG NHẮN / KIỂM TOÁN VỚI 3 TAB (TỔNG TIN NHẮN, SỐ TIN NHẮN ĐÃ XÓA, CẢNH CÁO) */}
          {roomDetailsTab === 'messages' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-2.5 p-3">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0 bg-slate-900/60 p-2 rounded-2xl border border-slate-800/80">
                {/* 3 Tab Kiểm Toán: Tab 1: Tổng tin nhắn, Tab 2: Số tin nhắn đã xóa, Tab 3: Cảnh cáo */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setAuditFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      auditFilter === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tổng tin nhắn ({roomMessages.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilter('deleted')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      auditFilter === 'deleted'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-amber-300'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Số tin nhắn đã xóa ({roomMessagesDeletedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditFilter('warned')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      auditFilter === 'warned'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-rose-300'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Cảnh cáo ({roomMessagesWarnedCount})</span>
                  </button>
                </div>

                <div className="relative flex-1 w-full max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Lọc nội dung kiểm toán..."
                    value={roomMsgSearchQuery}
                    onChange={(e) => setRoomMsgSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3.5 p-2 sm:p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
                {filteredRoomMessages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                    Không tìm thấy tin nhắn nào phù hợp với bộ lọc kiểm toán.
                  </div>
                ) : (
                  filteredRoomMessages.map((msg) => {
                    const isDevMsg = msg.isDevMessage || isDevUser(msg.senderEmail) || (msg.senderName && msg.senderName.includes('DEV'));
                    const isMsgDeleted = !!(msg.deletedBySender || msg.isDeletedBySender);
                    const isMsgWarned = !!(msg.hasProfanity || msg.hasWarning || msg.isReported);

                    return (
                      <div 
                        key={msg.id} 
                        className={`chat-bubble-item flex flex-col ${isDevMsg ? 'items-end' : 'items-start'} group w-full`}
                      >
                        {/* THÔNG TIN NGƯỜI GỬI PHÍA TRÊN BONG BÓNG */}
                        {isDevMsg ? (
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400 justify-end flex-wrap">
                            <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-400 to-emerald-500 p-0.5 flex items-center justify-center shadow-sm">
                              <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                            </div>
                            <span 
                              onClick={() => handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice })}
                              className="font-extrabold text-xs bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent truncate cursor-pointer hover:underline"
                            >
                              {msg.senderName}
                            </span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                              👑 DEV CHÍNH CHỦ
                            </span>
                            {msg.senderDevice && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-mono truncate max-w-[140px]">{msg.senderDevice}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500 font-mono">
                              {formatMessageTime(msg.createdAt, msg.timestamp)}
                            </span>

                            {isMsgWarned && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                                <span>Cảnh cáo</span>
                              </span>
                            )}

                            {isMsgDeleted && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <Trash2 className="w-2.5 h-2.5 text-amber-400" />
                                <span>Client đã xóa</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteRoomMessage(msg.id)}
                              className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors ml-1"
                              title="Xóa tin nhắn này khỏi phòng hiển thị của Client"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400 flex-wrap">
                            <div 
                              onClick={() => handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice })}
                              className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] text-slate-300 font-bold shrink-0 cursor-pointer hover:ring-2 hover:ring-emerald-400"
                              title="Nhấp để chuyển sang xem người dùng này"
                            >
                              {msg.senderName?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span 
                              onClick={() => handleNavigateToUser(msg.senderId, { displayName: msg.senderName, email: msg.senderEmail, deviceName: msg.senderDevice })}
                              className="font-semibold text-slate-200 cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                            >
                              {msg.senderName}
                            </span>
                            {msg.senderDevice && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-mono truncate max-w-[140px]">{msg.senderDevice}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-slate-500 font-mono">
                              {formatMessageTime(msg.createdAt, msg.timestamp)}
                            </span>

                            {isMsgWarned && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                                <span>Cảnh cáo</span>
                              </span>
                            )}

                            {isMsgDeleted && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0 font-bold ml-1">
                                <Trash2 className="w-2.5 h-2.5 text-amber-400" />
                                <span>Client đã xóa</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteRoomMessage(msg.id)}
                              className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors ml-1"
                              title="Xóa tin nhắn này khỏi phòng hiển thị của Client"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* BONG BÓNG TIN NHẮN (KHỚP 100% CẤU TRÚC HÌNH 2) */}
                        <div
                          className={`max-w-[85%] sm:max-w-md md:max-w-xl rounded-2xl px-4 py-2.5 space-y-1.5 shadow-sm text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                            isDevMsg
                              ? 'rounded-tr-sm bg-gradient-to-r from-emerald-950/90 via-slate-900 to-amber-950/50 border-2 border-amber-400/70 shadow-lg shadow-amber-500/10 ring-1 ring-emerald-500/40 text-white'
                              : isMsgWarned
                              ? 'rounded-tl-sm bg-rose-950/30 border-2 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500/50 text-rose-100'
                              : isMsgDeleted
                              ? 'rounded-tl-sm bg-slate-850 text-slate-200 border border-amber-500/40 shadow-sm'
                              : 'rounded-tl-sm bg-slate-800 text-slate-100 border border-slate-700/60 shadow-sm'
                          }`}
                        >
                          {isDevMsg && (
                            <div className="flex items-center gap-1.5 pb-1 border-b border-amber-500/20 text-[10px] text-amber-300 font-semibold">
                              <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span>Thông điệp từ Nhà Phát Triển (DEV)</span>
                            </div>
                          )}

                          {/* Nội dung nguyên bản 100% không che */}
                          <div className="select-text font-normal">
                            {msg.rawText || msg.text}
                          </div>

                          {/* Đính kèm hình ảnh hoặc tệp tin */}
                          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map((att, idx) => {
                                const imgSrc = att.data || att.url;
                                const isImg = att.type?.startsWith('image/') || (att.data && att.data.startsWith('data:image')) || (att.url && att.url.includes('/view/'));
                                return isImg && imgSrc ? (
                                  <div
                                    key={idx}
                                    onClick={() => setPreviewImage(att.url || att.data)}
                                    className="group relative rounded-xl overflow-hidden border border-slate-700/80 cursor-pointer hover:border-emerald-500/60 transition-all shadow-md bg-slate-950"
                                  >
                                    <img 
                                      src={imgSrc} 
                                      alt={att.name || 'Ảnh đính kèm'} 
                                      className="w-24 h-24 sm:w-28 sm:h-28 object-cover group-hover:scale-105 transition-transform" 
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
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs text-slate-200 hover:border-emerald-500 transition-all group/file shadow-sm"
                                  >
                                    <FileText className="w-4 h-4 text-emerald-400 group-hover/file:scale-110 transition-transform" />
                                    <span className="font-mono text-xs truncate max-w-[180px] font-semibold">{att.name}</span>
                                    <Download className="w-3.5 h-3.5 text-slate-400 group-hover/file:text-emerald-400 ml-auto" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
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
      ) : activeTask === 'users' && selectedItemId && selectedItemData ? (
        /* GIAO DIỆN QUẢN TRỊ NGƯỜI DÙNG TOÀN DIỆN CHO DEV (ĐỒNG BỘ WORKSPACE PHÒNG CHAT) */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header người dùng */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-2.5 border-b border-slate-800/80 shrink-0 gap-2.5 bg-slate-900/40 p-2.5 rounded-2xl mb-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 transition-all active:scale-95 shrink-0 shadow-sm"
                title="Quay lại danh sách người dùng"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-sky-400" />
                <span>Danh Sách Người Dùng</span>
              </button>

              <div className="h-4 w-px bg-slate-800 shrink-0" />

              <div className="min-w-0 flex items-center gap-2.5 flex-1">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm relative border border-white/10"
                  style={{ backgroundColor: (selectedItemData as any).avatarColor || '#0284c7' }}
                >
                  {(selectedItemData as any).displayName?.charAt(0).toUpperCase() || 'U'}
                  {(selectedItemData as any).onlineCheck?.isOnline && (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5 animate-pulse" />
                  )}
                </div>

                <div className="truncate min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                      {(selectedItemData as any).displayName}
                    </span>
                    {isDevUser((selectedItemData as any).email) && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>DEV Quản Trị</span>
                      </span>
                    )}
                    <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border shrink-0 ${(selectedItemData as any).onlineCheck?.color}`}>
                      {(selectedItemData as any).onlineCheck?.badgeText || 'Offline'}
                    </span>
                    {/* Vi phạm nếu có */}
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
                        🔴 Hết Cứu
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5 flex-wrap">
                    <span className="text-slate-300">{(selectedItemData as any).email || 'Khách vãng lai'}</span>
                    <span className="text-slate-600">•</span>
                    <div className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                      <span className="text-slate-500 text-[10px]">UID:</span>
                      <span className="text-sky-300 text-[10px] font-mono truncate max-w-[140px] sm:max-w-[200px]">
                        {(selectedItemData as any).uid || (selectedItemData as any).id}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText((selectedItemData as any).uid || (selectedItemData as any).id);
                          setCopiedUid(true);
                          setTimeout(() => setCopiedUid(false), 2000);
                        }}
                        className="text-slate-400 hover:text-white ml-0.5"
                        title="Sao chép UUID người dùng"
                      >
                        {copiedUid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Nút hành động nhanh */}
            <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-center">
              {!isDevUser((selectedItemData as any).email) && (
                <button
                  type="button"
                  onClick={() => handleDeleteUser((selectedItemData as any).uid || (selectedItemData as any).id, (selectedItemData as any).displayName, (selectedItemData as any).email)}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  title="Xóa tài khoản này khỏi Firestore"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Xóa tài khoản</span>
                </button>
              )}
            </div>
          </div>

          {/* Thanh 4 Tab Người Dùng: Thông Tin & Thiết Bị, Thông Báo Riêng, Kỷ Luật & 12 Luật AI, Nhật Ký Tin Nhắn */}
          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 px-1 mb-2 overflow-x-auto scrollbar-none shrink-0">
            <button
              type="button"
              onClick={() => setUserDetailsTab('info')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                userDetailsTab === 'info'
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>1. Thông Tin & Thiết Bị</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-sky-400">
                {userDevicesList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setUserDetailsTab('notify')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                userDetailsTab === 'notify'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>2. Thông Báo Riêng (DEV)</span>
              {sentPrivateNotifs.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-indigo-300">
                  {sentPrivateNotifs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setUserDetailsTab('moderation')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                userDetailsTab === 'moderation'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-amber-400" />
              <span>3. Kỷ Luật & 12 Luật AI</span>
              {(selectedItemData as any).violationSeverity && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 animate-pulse">
                  Vi phạm
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setUserDetailsTab('messages')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                userDetailsTab === 'messages'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>4. Nhật Ký Tin Nhắn</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                {userMessages.length}
              </span>
            </button>
          </div>

          {/* TAB 1: THÔNG TIN VÀ THIẾT BỊ ĐĂNG NHẬP */}
          {userDetailsTab === 'info' && (
            <div className="flex-1 overflow-y-auto space-y-4 p-2 sm:p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              {/* Thẻ tóm tắt thông tin hồ sơ */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">Họ Tên / Biệt Danh</div>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>{(selectedItemData as any).displayName}</span>
                    {(selectedItemData as any).isAnonymous && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">Ẩn danh</span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">Email Tài Khoản</div>
                  <div className="text-sm font-semibold text-slate-200 truncate">
                    {(selectedItemData as any).email || <span className="text-slate-500 italic">Chưa liên kết</span>}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium">Tổng Tin Nhắn Đã Gửi</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    {userMessages.length} tin nhắn (qua các phòng)
                  </div>
                </div>
              </div>

              {/* Bảng danh sách thiết bị đã đăng nhập của người dùng */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-400">
                    <Laptop className="w-4 h-4" />
                    <h4 className="text-xs sm:text-sm font-bold">Danh Sách Thiết Bị Đã Đăng Nhập ({userDevicesList.length})</h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Real-time Device Sync</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {userDevicesList.map((dev: any) => (
                    <div 
                      key={dev.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-sky-500/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                          {dev.type === 'mobile' ? <Smartphone className="w-4 h-4" /> : dev.type === 'tablet' ? <Tablet className="w-4 h-4" /> : dev.type === 'tv' ? <Tv className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                            <span>{dev.name}</span>
                            {dev.isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">
                                Đang dùng
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                            Hoạt động: {dev.lastSeen ? formatMessageTime(dev.lastSeen) : 'Vừa xong'} {dev.ip ? `• IP: ${dev.ip}` : ''}
                          </div>
                        </div>
                      </div>

                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
                        dev.status === 'online' 
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}>
                        {dev.status === 'online' ? '🟢 Online' : '⚪ Offline'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GỬI THÔNG BÁO RIÊNG CHO NGƯỜI DÙNG */}
          {userDetailsTab === 'notify' && (
            <div className="flex-1 overflow-y-auto space-y-4 p-2 sm:p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-3">
                <Bell className="w-5 h-5 text-indigo-400 shrink-0" />
                <div>
                  <strong className="text-white text-xs sm:text-sm block">Kênh Thông Báo Riêng DEV ➔ Người Dùng:</strong>
                  <span>Gửi lời nhắn riêng tư, nhắc nhở hoặc chỉ dẫn trực tiếp tới tài khoản [{(selectedItemData as any).displayName}]. Thông báo sẽ hiện nổi bật trên ứng dụng của họ.</span>
                </div>
              </div>

              {privateNotifStatus && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{privateNotifStatus}</span>
                </div>
              )}

              {/* Form soạn thông báo */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Nội dung tin thông báo riêng:</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    💡 Nhấn <strong>Enter 2 lần</strong> hoặc nút Gửi để phát thông báo (Hỗ trợ Backspace)
                  </span>
                </div>

                <textarea
                  rows={4}
                  placeholder={`Nhập nội dung gửi riêng cho ${(selectedItemData as any).displayName}...\n\n(Ví dụ: Bạn đang có dấu hiệu vi phạm điều luật cộng đồng số 4, vui lòng chú ý phát ngôn hoặc tài khoản sẽ bị tạm khóa).`}
                  value={privateMsgText}
                  onChange={(e) => setPrivateMsgText(e.target.value)}
                  onKeyDown={handlePrivateMsgKeyDown}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                />

                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Gửi từ: <strong className="text-emerald-400">{currentUser?.displayName || 'Quản Trị Viên'} (DEV)</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendPrivateNotification}
                    disabled={!privateMsgText.trim() || isSendingPrivateNotif}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gửi Thông Báo Riêng</span>
                  </button>
                </div>
              </div>

              {/* Danh sách các thông báo riêng đã gửi */}
              {sentPrivateNotifs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Lịch sử thông báo đã gửi ({sentPrivateNotifs.length}):</h4>
                  <div className="space-y-2">
                    {sentPrivateNotifs.map((n) => (
                      <div key={n.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                          <span>{formatMessageTime(n.createdAt)}</span>
                          <span className="text-indigo-400">Đã gửi thành công</span>
                        </div>
                        <div className="text-slate-200 whitespace-pre-wrap">{n.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ĐIỀU KIỂM VI PHẠM & 12 LUẬT CỘNG ĐỒNG AI */}
          {userDetailsTab === 'moderation' && (
            <div className="flex-1 overflow-y-auto space-y-4 p-2 sm:p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              {/* Nút kích hoạt quét AI */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <strong className="text-white text-xs sm:text-sm">Trí Tuệ Nhân Tạo AI Quét 12 Điều Luật Cộng Đồng:</strong>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    AI sẽ tự động đọc phân tích toàn bộ tin nhắn, báo cáo, và lịch sử của người dùng này để phát hiện vi phạm và gợi ý mức phạt chuẩn xác.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunAiAudit}
                  disabled={isAiAuditing}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 active:scale-95 shrink-0 transition-all"
                >
                  <Bot className={`w-4 h-4 ${isAiAuditing ? 'animate-spin' : ''}`} />
                  <span>{isAiAuditing ? 'Đang Quét 12 Luật...' : 'Quét Tự Động 12 Luật AI'}</span>
                </button>
              </div>

              {/* Kết quả phân tích từ AI nếu có */}
              {aiAuditResult && (
                <div className={`p-4 rounded-2xl border space-y-3 ${
                  aiAuditResult.hasViolation 
                    ? 'bg-rose-950/20 border-rose-500/40 text-rose-200' 
                    : 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {aiAuditResult.hasViolation ? <ShieldAlert className="w-5 h-5 text-rose-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                      <span>{aiAuditResult.hasViolation ? `⚠️ Phát Hiện Vi Phạm (Điểm: ${aiAuditResult.score}/100)` : '✅ Người Dùng Trong Sạch'}</span>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                      Gợi ý: {aiAuditResult.recommendedLabel}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">{aiAuditResult.summary}</p>

                  {/* Danh sách các điều luật bị vi phạm */}
                  {aiAuditResult.findings && aiAuditResult.findings.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Chi tiết điều luật vi phạm:</div>
                      {aiAuditResult.findings.map((f, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                          <div className="flex items-center justify-between text-amber-400 font-semibold">
                            <span>{f.ruleNumber}: {f.ruleTitle}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">{f.severity}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 italic">Bằng chứng: "{f.evidence}"</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAuditResult.hasViolation && aiAuditResult.recommendedTier && (
                    <button
                      type="button"
                      onClick={() => handleApplyTierSanction(aiAuditResult.recommendedTier as any, aiAuditResult.summary)}
                      className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Áp Dụng Hình Phạt Được Khuyến Nghị ({aiAuditResult.recommendedLabel})</span>
                    </button>
                  )}
                </div>
              )}

              {/* 4 NÚT HÌNH PHẠT CỐ ĐỊNH & NÚT CẤM VĨNH VIỄN */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 px-1">
                  <Ban className="w-4 h-4 text-rose-400" />
                  <span>Bảng Điều Khiển Xử Lý Kỷ Luật (4 Cấp Độ & Cấm Vĩnh Viễn):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Cấp 1 */}
                  <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-emerald-400 font-bold text-xs">
                        <span>🟢 Cấp 1: Nhắc Nhở Nhẹ</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20">Khóa chat 15 phút</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 italic">
                        "{SANCTION_TIERS.level_1.remind}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyTierSanction('level_1')}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95"
                    >
                      Áp Dụng Cấp 1 (15 Phút)
                    </button>
                  </div>

                  {/* Cấp 2 */}
                  <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-amber-400 font-bold text-xs">
                        <span>🟡 Cấp 2: Cảnh Báo Vừa</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20">Khóa chat 1 giờ</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 italic">
                        "{SANCTION_TIERS.level_2.remind}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyTierSanction('level_2')}
                      className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-all active:scale-95"
                    >
                      Áp Dụng Cấp 2 (1 Giờ)
                    </button>
                  </div>

                  {/* Cấp 3 */}
                  <div className="p-3.5 rounded-2xl bg-orange-950/20 border border-orange-500/30 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-orange-400 font-bold text-xs">
                        <span>🟠 Cấp 3: Kỷ Luật Nghiêm Khắc</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-500/20">Khóa chat 24 giờ</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 italic">
                        "{SANCTION_TIERS.level_3.remind}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyTierSanction('level_3')}
                      className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-all active:scale-95"
                    >
                      Áp Dụng Cấp 3 (1 Ngày)
                    </button>
                  </div>

                  {/* Cấp 4 */}
                  <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-rose-400 font-bold text-xs">
                        <span>🔴 Cấp 4: Tạm Đình Chỉ</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20">Khóa 7 ngày</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 italic">
                        "{SANCTION_TIERS.level_4.remind}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyTierSanction('level_4')}
                      className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all active:scale-95"
                    >
                      Áp Dụng Cấp 4 (7 Ngày)
                    </button>
                  </div>
                </div>

                {/* Nút Cấm Vĩnh Viễn & Nút Mở Khóa / Ân Xá */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApplyTierSanction('level_perm')}
                    className="py-3 px-4 rounded-2xl bg-gradient-to-r from-red-700 via-rose-700 to-red-800 hover:from-red-600 hover:to-rose-600 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-950/60 border border-red-500/50 active:scale-95 transition-all"
                  >
                    <Ban className="w-4 h-4" />
                    <span>⛔ CẤM TÀI KHOẢN VĨNH VIỄN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUnbanUser((selectedItemData as any).uid || (selectedItemData as any).id)}
                    className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-850 text-emerald-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-emerald-500/40 active:scale-95 transition-all"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>🟢 Mở Khóa / Ân Xá Toàn Bộ</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: NHẬT KÝ TOÀN BỘ TIN NHẮN CỦA NGƯỜI DÙNG */}
          {userDetailsTab === 'messages' && (
            <div className="flex-1 overflow-y-auto space-y-2.5 p-2 sm:p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800">
              {userMessages.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                  Người dùng này chưa gửi tin nhắn nào trên toàn bộ hệ thống.
                </div>
              ) : (
                userMessages.map((msg) => {
                  const isMsgWarned = msg.hasWarning || (msg as any).isWarned;
                  const isMsgDeleted = msg.deletedBySender || msg.isDeletedBySender || (msg as any).isDeleted;

                  return (
                    <div 
                      key={msg.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        isMsgWarned 
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-200' 
                          : isMsgDeleted
                          ? 'bg-amber-950/15 border-amber-500/30 text-amber-200'
                          : 'bg-slate-900/70 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1.5 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">Phòng: #{msg.roomId}</span>
                          <span>•</span>
                          <span>{formatMessageTime(msg.createdAt, msg.timestamp)}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isMsgDeleted && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Client đã xóa
                            </span>
                          )}
                          {isMsgWarned && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Đã cảnh cáo
                            </span>
                          )}
                        </div>
                      </div>

                    <div className="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {msg.text || msg.rawText || (msg.fileUrl ? '📁 Đính kèm tập tin/hình ảnh' : 'Tin nhắn trống')}
                    </div>

                    {msg.fileUrl && (
                      <div className="mt-2">
                        {msg.fileType?.startsWith('image/') || msg.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={msg.fileUrl} alt={msg.fileName || 'Ảnh đính kèm'} className="max-h-40 rounded-xl border border-slate-800 object-cover" />
                        ) : (
                          <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline flex items-center gap-1">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{msg.fileName || 'Xem tệp đính kèm'}</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
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

                {/* Ô tìm kiếm nhanh & nút dọn dẹp phòng / user test */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {activeTask === 'rooms' && rooms.some(r => r.id !== 'public-relay-lounge') && (
                    <button
                      type="button"
                      onClick={handlePurgeTestRooms}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 active:scale-95 whitespace-nowrap"
                      title="Xóa tất cả phòng thử nghiệm / phòng không thật, chỉ giữ lại Đại Sảnh Toàn Cầu"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Dọn phòng test</span>
                    </button>
                  )}

                  {activeTask === 'users' && (
                    <button
                      type="button"
                      onClick={handlePurgeTestUsers}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 active:scale-95 whitespace-nowrap"
                      title="Dọn dẹp và xóa các tài khoản thử nghiệm / tài khoản không thật khỏi Firestore"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Dọn tài khoản test</span>
                    </button>
                  )}

                  <div className="relative min-w-[180px] max-w-xs">
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
              </div>

              {/* Banner cảnh báo người dùng vi phạm nghiêm trọng nhất - Hiển thị tập trung tại Tab 3 Các Vi Phạm */}
              {activeTask === 'violators' && worstViolatorUser && (
                <div className="mb-3 p-3 rounded-2xl bg-gradient-to-r from-red-950/50 via-rose-950/40 to-slate-900 border border-red-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
                      <AlertTriangle className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-red-300 flex items-center gap-2">
                        <span>⚠️ Người Vi Phạm Nghiêm Trọng Cần Xử Lý:</span>
                        <span className="text-white underline">{worstViolatorUser.displayName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {worstViolatorUser.violationReason || 'Có hành vi vi phạm điều luật cộng đồng mức độ cao'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItemId(worstViolatorUser.uid || worstViolatorUser.id);
                      setActiveTask('users');
                      setUserDetailsTab('moderation');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <span>Kiểm Tra & Xử Lý Kỷ Luật &gt;</span>
                  </button>
                </div>
              )}

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
                          if (activeTask === 'violators') {
                            if (violatorTarget === 'users') {
                              setActiveTask('users');
                              setUserDetailsTab('moderation');
                            } else {
                              setActiveTask('rooms');
                              setRoomDetailsTab('chat');
                            }
                            return;
                          }
                          if (activeTask !== 'rooms' && activeTask !== 'users') {
                            setShowDetailModal(true);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-850 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md'
                            : 'bg-slate-900/40 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        {/* TH1: HIỂN THỊ PHÒNG CHAT (CÁC PHÒNG CHAT - TAB 1) */}
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
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                  Mã: <strong className="text-emerald-400 font-bold">#{item.code}</strong> • Tạo bởi: {item.createdByName || 'Người dùng'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.id === 'public-relay-lounge' ? (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                                  🏛️ Mặc định
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRoom(item.id);
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
                                  title="Xóa vĩnh viễn phòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <span className="text-[11px] text-emerald-400 font-medium hidden sm:inline hover:underline">
                                Nhấp để vào chat &gt;
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            </div>
                          </div>
                        )}

                        {/* TH2: HIỂN THỊ NGƯỜI DÙNG (NHỮNG NGƯỜI DÙNG - TAB 2) */}
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

                              {/* Tên, thiết bị & check online thực tế */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                    {item.displayName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-block">
                                    ({item.deviceName || 'Thiết bị'})
                                  </span>
                                  {item.email && (
                                    <span className="text-[10px] text-slate-500 font-mono hidden md:inline-block">
                                      {item.email}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${item.onlineCheck?.color}`}>
                                    {item.onlineCheck?.badgeText}
                                  </span>
                                  <span className="text-[10px] text-slate-500 truncate hidden md:inline-block">
                                    • {item.onlineCheck?.detailText}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-sky-400 font-medium hidden sm:inline hover:underline">
                                Quản lý & Kỷ luật &gt;
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            </div>
                          </div>
                        )}

                        {/* TH3: HIỂN THỊ CÁC VI PHẠM (CÁC VI PHẠM - TAB 3 TẬP TRUNG) */}
                        {activeTask === 'violators' && (
                          <div className="flex items-center justify-between w-full min-w-0">
                            {violatorTarget === 'users' ? (
                              /* 1. Bản ghi Người Dùng Vi Phạm */
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 border border-amber-500/40 relative shadow-inner"
                                  style={{ backgroundColor: item.avatarColor || '#f59e0b' }}
                                >
                                  {item.displayName?.charAt(0).toUpperCase() || 'V'}
                                  {item.isWorstViolator && (
                                    <span className="w-3.5 h-3.5 rounded-full bg-red-600 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5 flex items-center justify-center text-[9px] text-white font-bold animate-pulse">
                                      !
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                      {item.displayName}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                                      Lần vi phạm: {item.violationCount || 1}
                                    </span>

                                    {/* Mức độ vi phạm của người dùng */}
                                    {item.violationSeverity === 'light' && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        🟢 Mức độ: Nhẹ
                                      </span>
                                    )}
                                    {item.violationSeverity === 'medium' && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                        🟡 Mức độ: Bình Thường
                                      </span>
                                    )}
                                    {item.violationSeverity === 'heavy' && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                        🟠 Mức độ: Nặng
                                      </span>
                                    )}
                                    {item.violationSeverity === 'critical' && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-200 border border-red-500 animate-pulse">
                                        🔴 Hết Cứu (Tái phạm nghiêm trọng)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-amber-400 font-mono truncate mt-0.5">
                                    Lý do: {item.violationReason || 'Có hành vi vi phạm quy chuẩn cộng đồng'}
                                  </div>
                                  {item.email && (
                                    <div className="text-[10px] text-slate-500 font-mono truncate">
                                      {item.email} {item.deviceName && `• ${item.deviceName}`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              /* 2. Bản ghi Phòng Chat Vi Phạm */
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                                  item.isPrivate ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}>
                                  {item.isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate">
                                      {item.name}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                      #{item.code}
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
                                  <div className="text-[11px] text-amber-400 font-mono mt-0.5 truncate">
                                    {item.violationReason || 'Phòng chat có tin nhắn vi phạm hoặc bị người dùng tố cáo'}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono truncate">
                                    Tạo bởi: {item.createdByName || 'Người dùng'} {item.isPrivate ? '• Phòng Riêng' : '• Phòng Công Khai'}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-amber-400 font-medium hidden sm:inline hover:underline">
                                {violatorTarget === 'users' ? 'Xử lý kỷ luật >' : 'Kiểm tra phòng >'}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-500" />
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

      {/* MODAL CHI TIẾT & TÁC VỤ KỶ LUẬT (CHỈ MỞ KHI DEV NHẤP CHỌN BẢN GHI KHÔNG PHẢI PHÒNG CHAT HOẶC NGƯỜI DÙNG) */}
      {showDetailModal && selectedItemData && activeTask !== 'rooms' && activeTask !== 'users' && (
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
