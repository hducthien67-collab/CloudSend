import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { ChatMessage, ChatRoom, RoomMember } from '../../types';
import { 
  Send, 
  Image as ImageIcon, 
  Camera, 
  Paperclip, 
  Trash2, 
  Flag, 
  Download, 
  Eye, 
  ShieldAlert, 
  Loader2, 
  Sparkles,
  ArrowDown,
  X,
  ChevronLeft,
  Info,
  Globe,
  Lock,
  Plus,
  Key,
  MessagesSquare,
  Users,
  Crown,
  Search,
  Check,
  Calendar,
  Zap,
  History
} from 'lucide-react';
import { uploadFileToServer, isImageFile, generateImageThumbnail, createClientFallbackFileInfo } from '../../utils/fileUpload';
import { downloadFileSafely } from '../../utils/fileDownload';
import { formatFileSize } from '../../utils/device';
import { renderClickableText } from '../../utils/textFormat';
import { ReportMessageModal } from '../ReportMessageModal';
import { RoomDetailsModal } from '../RoomDetailsModal';
import { ZoomableImageViewerModal } from '../ZoomableImageViewerModal';
import { ResetServerModal } from '../ResetServerModal';
import { playSendSound, playReceiveSound } from '../../utils/sound';
import { cleanFirestoreObject } from '../../utils/firestoreClean';
import { 
  isDevUser, 
  formatGroupDateHeader, 
  getGroupDateKey, 
  getYesterdayStartIso,
  autoPruneWeeklyMessages 
} from '../../utils/devModeration';

const ROOM_PRESET_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1'];

export const MobileChatView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  
  // Room navigation state: 'rooms_list' | 'chat_feed'
  const [viewMode, setViewMode] = useState<'rooms_list' | 'chat_feed'>('chat_feed');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('public-relay-lounge');
  // Message state: today & yesterday loaded by default, older messages loaded when scrolling up
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [memberMetaMap, setMemberMetaMap] = useState<Record<string, { displayName: string; avatarUrl?: string; avatarColor?: string; isDev?: boolean }>>({});

  const messages = React.useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of olderMessages) map.set(m.id, m);
    for (const m of recentMessages) map.set(m.id, m);
    const arr = Array.from(map.values());
    arr.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    return arr;
  }, [olderMessages, recentMessages]);
  
  // Input & Upload state
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  
  // Modals & Viewers
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [showResetServerModal, setShowResetServerModal] = useState(false);
  // Discord / Zalo pagination: load latest 35 messages by default, infinite scroll up to load older
  const [messageLimit, setMessageLimit] = useState(35);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const previousScrollHeightRef = useRef<number>(0);
  const previousScrollTopRef = useRef<number>(0);

  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [viewingZoomImage, setViewingZoomImage] = useState<{ url: string; name?: string; size?: number } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [memberNamesMap, setMemberNamesMap] = useState<Record<string, string>>({});

  // Room Create & Join state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomMode, setNewRoomMode] = useState<'public' | 'private'>('public');
  const [newRoomAvatar, setNewRoomAvatar] = useState('');
  const [newRoomColor, setNewRoomColor] = useState('#10b981');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const isFirstLoadRef = useRef(true);

  const activeRoom = rooms.find(r => r.id === activeRoomId) || rooms[0] || {
    id: 'public-relay-lounge',
    name: 'Đại Sảnh Toàn Cầu',
    code: 'PUBLIC',
    isPrivate: false,
    avatarColor: '#10b981',
    membersCount: 1,
    members: []
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Real-time member display names & avatars synchronization from presence and users collection
  useEffect(() => {
    const presenceRef = collection(db, 'presence');
    const unsubPresence = onSnapshot(presenceRef, (snapshot) => {
      const names: Record<string, string> = {};
      const meta: Record<string, { displayName: string; avatarUrl?: string; avatarColor?: string; isDev?: boolean }> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const displayName = data.displayName || data.deviceName;
        const avatarUrl = data.customAvatarUrl || data.photoURL || undefined;
        const avatarColor = data.avatarColor || '#10b981';
        const isDev = Boolean(data.isDev || isDevUser(data.email));

        if (displayName) {
          const item = { displayName, avatarUrl, avatarColor, isDev };
          if (data.uid) {
            names[data.uid] = displayName;
            meta[data.uid] = item;
          }
          if (data.deviceName) {
            names[data.deviceName] = displayName;
            meta[data.deviceName] = item;
          }
          meta[docSnap.id] = item;
        }
      });
      setMemberNamesMap((prev) => ({ ...prev, ...names }));
      setMemberMetaMap((prev) => ({ ...prev, ...meta }));
    });

    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const names: Record<string, string> = {};
      const meta: Record<string, { displayName: string; avatarUrl?: string; avatarColor?: string; isDev?: boolean }> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const displayName = data.displayName || data.deviceName;
        const avatarUrl = data.customAvatarUrl || data.photoURL || undefined;
        const avatarColor = data.avatarColor || '#10b981';
        const isDev = Boolean(data.isDev || isDevUser(data.email));

        if (displayName) {
          const item = { displayName, avatarUrl, avatarColor, isDev };
          names[docSnap.id] = displayName;
          meta[docSnap.id] = item;
          if (data.uid) {
            names[data.uid] = displayName;
            meta[data.uid] = item;
          }
        }
      });
      setMemberNamesMap((prev) => ({ ...prev, ...names }));
      setMemberMetaMap((prev) => ({ ...prev, ...meta }));
    });

    return () => {
      unsubPresence();
      unsubUsers();
    };
  }, []);

  // Listen to available chat rooms
  useEffect(() => {
    if (!currentUser) return;

    const roomsRef = collection(db, 'rooms');
    const unsubscribe = onSnapshot(roomsRef, (snapshot) => {
      const roomList: ChatRoom[] = [];
      snapshot.forEach((docSnap) => {
        roomList.push({ id: docSnap.id, ...docSnap.data() } as ChatRoom);
      });

      // Sort so public room is first, then newest
      roomList.sort((a, b) => {
        if (a.id === 'public-relay-lounge') return -1;
        if (b.id === 'public-relay-lounge') return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      setRooms(roomList);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Watch for active room deletion by owner (Auto-redirect to lounge)
  useEffect(() => {
    if (activeRoomId && activeRoomId !== 'public-relay-lounge' && rooms.length > 0) {
      const roomStillExists = rooms.some((r) => r.id === activeRoomId);
      if (!roomStillExists) {
        setActiveRoomId('public-relay-lounge');
        setRecentMessages([]);
        setOlderMessages([]);
      }
    }
  }, [rooms, activeRoomId]);

  // Discord / Zalo: Tải các đoạn chat cũ hơn trước ngày hôm qua (hoặc trước tin nhắn cũ nhất)
  const handleLoadOlderMessages = async () => {
    if (isLoadingOlder || !hasMoreOlder || !activeRoomId) return;
    setIsLoadingOlder(true);

    const el = messagesContainerRef.current;
    const oldScrollHeight = el ? el.scrollHeight : 0;
    const oldScrollTop = el ? el.scrollTop : 0;

    try {
      const oldestMsg = olderMessages.length > 0 
        ? olderMessages[0] 
        : (recentMessages.length > 0 ? recentMessages[0] : null);

      const oldestCursor = oldestMsg?.createdAt || getYesterdayStartIso();
      const messagesRef = collection(db, 'rooms', activeRoomId, 'messages');
      const olderQuery = query(
        messagesRef,
        where('createdAt', '<', oldestCursor),
        orderBy('createdAt', 'desc'),
        limit(30)
      );

      const snap = await getDocs(olderQuery);
      if (snap.empty) {
        setHasMoreOlder(false);
        setIsLoadingOlder(false);
        return;
      }

      const fetched: ChatMessage[] = [];
      snap.forEach((docSnap) => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as ChatMessage);
      });

      fetched.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

      if (snap.docs.length < 30) {
        setHasMoreOlder(false);
      }

      setOlderMessages((prev) => {
        const existingIds = new Set(prev.map(m => m.id));
        const newUnique = fetched.filter(m => !existingIds.has(m.id));
        return [...newUnique, ...prev];
      });

      // Preserve scroll position (chống giật màn hình)
      requestAnimationFrame(() => {
        if (el) {
          const heightDiff = el.scrollHeight - oldScrollHeight;
          el.scrollTop = oldScrollTop + heightDiff;
        }
        setIsLoadingOlder(false);
      });
    } catch (err) {
      console.warn('Error loading older messages:', err);
      setIsLoadingOlder(false);
    }
  };

  // Listen to messages in active room (Chỉ tải tin nhắn hôm nay và hôm qua khi vào phòng; các tin nhắn cũ tải khi cuộn lên)
  useEffect(() => {
    if (!currentUser || !activeRoomId) return;

    isFirstLoadRef.current = true;
    setRecentMessages([]);
    setOlderMessages([]);
    setIsLoadingOlder(false);

    const yesterdayIso = getYesterdayStartIso();
    const messagesRef = collection(db, 'rooms', activeRoomId, 'messages');
    
    // 1. Chỉ tải tin nhắn từ 00:00 hôm qua đến hôm nay
    const q = query(
      messagesRef, 
      where('createdAt', '>=', yesterdayIso), 
      orderBy('createdAt', 'asc')
    );

    // 2. Kiểm tra xem có tin nhắn cũ hơn trước ngày hôm qua hay không
    getDocs(query(messagesRef, where('createdAt', '<', yesterdayIso), orderBy('createdAt', 'desc'), limit(1)))
      .then((snap) => {
        setHasMoreOlder(!snap.empty);
      })
      .catch(() => {});

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ChatMessage[] = [];
      let hasExternal = false;

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const msg = { id: docSnap.id, ...data } as ChatMessage;
        list.push(msg);
        if (msg.senderId !== currentUser?.uid && !isFirstLoadRef.current) {
          hasExternal = true;
        }
      });

      // Sort messages ascending chronologically for display
      list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

      setRecentMessages(list);

      if (hasExternal && settings?.soundEnabled) {
        playReceiveSound();
      }

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        setTimeout(() => scrollToBottom(false), 50);
      } else {
        const el = messagesContainerRef.current;
        if (el) {
          const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
          if (isNearBottom) {
            setTimeout(() => scrollToBottom(true), 80);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [activeRoomId, currentUser?.uid, settings?.soundEnabled]);

  // Auto-scroll and reset when entering room or switching mode
  useEffect(() => {
    if (viewMode === 'chat_feed') {
      setIsLoadingOlder(false);
      const timer = setTimeout(() => {
        scrollToBottom(false);
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [viewMode, activeRoomId]);

  // Auto maintenance for DEV / rooms with weekly auto-reset
  useEffect(() => {
    if (!currentUser || !activeRoomId || !isDevUser(currentUser.email)) return;
    if (activeRoom && (activeRoom as any).autoWeeklyReset) {
      autoPruneWeeklyMessages(activeRoomId).catch(() => {});
    }
  }, [activeRoomId, currentUser?.email, (activeRoom as any)?.autoWeeklyReset]);

  // Auto register current user into active room members with DEV role if applicable
  useEffect(() => {
    if (!currentUser || !activeRoomId || !activeRoom) return;
    const members = activeRoom.members || [];
    const isMember = members.some(m => m.uid === currentUser.uid);
    if (!isMember) {
      const isDev = isDevUser(currentUser.email);
      const isRoomOwner = activeRoom.ownerId === currentUser.uid || activeRoom.createdBy === currentUser.uid;
      const newMember: RoomMember = {
        uid: currentUser.uid,
        displayName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Người dùng',
        deviceName: settings?.deviceName || 'Điện thoại',
        avatarColor: settings?.avatarColor || '#10b981',
        role: isRoomOwner ? 'owner' : 'member',
        joinedAt: new Date().toISOString(),
        email: currentUser.email || '',
        isDev: isDev
      };
      updateDoc(doc(db, 'rooms', activeRoomId), {
        members: [...members, newMember],
        membersCount: members.length + 1
      }).catch(err => {
        console.warn('Auto register member error:', err);
      });
    }
  }, [currentUser?.uid, activeRoomId, activeRoom?.id]);

  const handleSendMessage = async (textOverride?: string) => {
    const rawText = typeof textOverride === 'string' ? textOverride : inputText;
    if (!rawText.trim() || !currentUser || isUploading) return;

    const textToSend = rawText.trim();
    // 1. Instant 0ms clear
    setInputText('');

    const isDev = isDevUser(currentUser.email);
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const nowIso = new Date().toISOString();

    const optimisticPayload: ChatMessage = {
      id: tempId,
      roomId: activeRoomId,
      senderId: currentUser.uid,
      senderName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Người dùng di động',
      senderEmail: currentUser.email || '',
      senderDevice: settings?.deviceName || 'Điện thoại',
      senderAvatar: userProfile?.customAvatarUrl || settings?.customAvatarUrl || currentUser?.photoURL || '',
      senderAvatarColor: userProfile?.avatarColor || settings?.avatarColor || '#10b981',
      text: textToSend,
      isDevMessage: isDev,
      createdAt: nowIso,
    };

    // 2. Play sound immediately & optimistic render (0ms response)
    if (settings?.soundEnabled) playSendSound();
    setRecentMessages(prev => [...prev.filter(m => m.id !== tempId), optimisticPayload]);
    requestAnimationFrame(() => scrollToBottom(true));

    // 3. Send to Firestore in background
    try {
      const payload = cleanFirestoreObject({
        ...optimisticPayload,
        serverTimestamp: serverTimestamp()
      });

      await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), payload);
    } catch (err) {
      console.error('Send message error:', err);
      // Remove optimistic message if failed & restore text
      setRecentMessages(prev => prev.filter(m => m.id !== tempId));
      setInputText(textToSend);
    }
  };

  const handleSendMedia = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !currentUser) return;

    setIsUploading(true);
    setUploadPercent(10);

    try {
      const file = fileList[0];
      let fileUrl = '';
      let thumb: string | null = null;

      if (isImageFile(file)) {
        try {
          thumb = await generateImageThumbnail(file, 480, 0.75);
        } catch {}
      }

      try {
        const uploaded = await uploadFileToServer(file, (pct) => {
          setUploadPercent(pct);
        });
        fileUrl = uploaded.url;
        if (uploaded.thumbnail) thumb = uploaded.thumbnail;
      } catch {
        const fallback = await createClientFallbackFileInfo(file);
        fileUrl = fallback.url;
        thumb = fallback.thumbnail || null;
      }

      const safeUrl = (fileUrl && fileUrl.length < 700000) ? fileUrl : '';
      const safeThumb = (thumb && thumb.length < 700000) ? thumb : '';
      const isDev = isDevUser(currentUser.email);

      const payload = cleanFirestoreObject({
        roomId: activeRoomId,
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || settings?.deviceName || 'Người dùng di động',
        senderEmail: currentUser.email || '',
        senderDevice: settings?.deviceName || 'Điện thoại',
        senderAvatar: userProfile?.customAvatarUrl || settings?.customAvatarUrl || currentUser?.photoURL || '',
        senderAvatarColor: userProfile?.avatarColor || settings?.avatarColor || '#10b981',
        text: isImageFile(file) ? 'Đã gửi một hình ảnh' : `Đã gửi tệp: ${file.name}`,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        fileUrl: safeUrl,
        fileData: safeThumb,
        isDevMessage: isDev,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });

      await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), payload);

      if (settings?.soundEnabled) playSendSound();
      scrollToBottom(true);
    } catch (err) {
      console.error('Send media error:', err);
    } finally {
      setIsUploading(false);
      setUploadPercent(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setRecentMessages(prev => prev.filter(m => m.id !== msgId));
    setOlderMessages(prev => prev.filter(m => m.id !== msgId));

    try {
      await deleteDoc(doc(db, 'rooms', activeRoomId, 'messages', msgId));
    } catch (err) {
      console.error('Delete message error:', err);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newRoomName.trim()) return;

    const isPrivate = newRoomMode === 'private';
    const randomCode = isPrivate 
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : 'PUBLIC';
    const roomId = `room-${Date.now()}`;

    const isCreatorDev = isDevUser(currentUser.email);
    const creatorMember: RoomMember = {
      uid: currentUser.uid,
      displayName: userProfile?.displayName || currentUser.displayName || 'Trưởng phòng',
      deviceName: settings.deviceName,
      avatarColor: settings.avatarColor || '#10b981',
      role: 'owner',
      joinedAt: new Date().toISOString(),
      email: currentUser.email || '',
      isDev: isCreatorDev
    };

    try {
      const roomPayload: ChatRoom = {
        id: roomId,
        name: newRoomName.trim(),
        code: randomCode,
        isPrivate: isPrivate,
        createdBy: currentUser.uid,
        createdByName: userProfile?.displayName || 'Người dùng',
        ownerId: currentUser.uid,
        ownerName: userProfile?.displayName || currentUser.displayName || 'Trưởng phòng',
        avatar: newRoomAvatar || '',
        avatarColor: newRoomColor || '#10b981',
        createdAt: new Date().toISOString(),
        description: isPrivate 
          ? 'Phòng riêng tư (Nhập mã ID để vào)' 
          : 'Phòng cộng đồng (Tự do tham gia)',
        members: [creatorMember],
        membersCount: 1
      };

      await setDoc(doc(db, 'rooms', roomId), cleanFirestoreObject(roomPayload));
      setActiveRoomId(roomId);
      setViewMode('chat_feed');
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomAvatar('');
      setNewRoomColor('#10b981');
    } catch (err) {
      console.error('Create room error:', err);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return;

    let found = rooms.find(r => r.code?.toUpperCase() === code || r.id === code);

    if (!found) {
      try {
        const qCode = query(collection(db, 'rooms'), where('code', '==', code));
        const snap = await getDocs(qCode);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          found = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
        }
      } catch (e) {
        console.warn('Room code direct query error:', e);
      }
    }

    if (found) {
      const existingMembers = found.members || [];
      const isAlreadyMember = existingMembers.some(m => m.uid === currentUser?.uid);

      if (!isAlreadyMember && currentUser) {
        const isDev = isDevUser(currentUser.email);
        const newMember: RoomMember = {
          uid: currentUser.uid,
          displayName: userProfile?.displayName || currentUser.displayName || 'Thành viên',
          deviceName: settings.deviceName,
          avatarColor: settings.avatarColor || '#3b82f6',
          role: 'member',
          joinedAt: new Date().toISOString(),
          email: currentUser.email || '',
          isDev: isDev
        };

        try {
          await updateDoc(doc(db, 'rooms', found.id), {
            members: [...existingMembers, newMember],
            membersCount: existingMembers.length + 1
          });
        } catch (err) {
          console.warn('Update room members error:', err);
        }
      }

      setActiveRoomId(found.id);
      setViewMode('chat_feed');
      setShowJoinModal(false);
      setJoinCodeInput('');
    } else {
      setJoinError('Không tìm thấy phòng với mã ID này. Vui lòng kiểm tra lại!');
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    // Discord / Zalo infinite scroll up: Load older messages when scrolling near top
    if (el.scrollTop <= 80 && hasMoreOlder && !isLoadingOlder) {
      handleLoadOlderMessages();
    }

    const isFarFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight > 280;
    setShowScrollBottom(isFarFromBottom);
  };

  const visibleRooms = rooms.filter(room => {
    if (room.id === 'public-relay-lounge' || room.isPrivate === false) return true;
    if (!currentUser) return false;
    const isOwner = room.ownerId === currentUser.uid || room.createdBy === currentUser.uid;
    const isMember = (room.members || []).some(m => m.uid === currentUser.uid);
    const isDev = isDevUser(currentUser.email);
    return isOwner || isMember || isDev;
  }).filter(r => {
    if (!roomSearchQuery.trim()) return true;
    const q = roomSearchQuery.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q);
  });

  // ================= VIEW 1: ROOMS LIST / BROWSER =================
  if (viewMode === 'rooms_list') {
    return (
      <div className="flex flex-col h-full w-full bg-[#0b0f19] overflow-hidden">
        {/* Top Header of Room List - Compact single horizontal row */}
        <div className="px-3 py-2 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-1.5 min-w-0 pr-1">
            <MessagesSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate whitespace-nowrap">
              Phòng Chat Trực Tuyến
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 border border-slate-700 active:scale-95 transition-all"
              title="Nhập mã phòng"
            >
              <Key className="w-3 h-3 text-amber-400" />
              <span>Nhập mã</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
              title="Tạo phòng mới"
            >
              <Plus className="w-3 h-3" />
              <span>Tạo phòng</span>
            </button>
          </div>
        </div>

        {/* Search Bar - Slim & Compact */}
        <div className="px-3 py-1.5 bg-slate-900/40 border-b border-slate-800/80">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={roomSearchQuery}
              onChange={(e) => setRoomSearchQuery(e.target.value)}
              placeholder="Tìm kiếm phòng chat theo tên hoặc mã ID..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Rooms Scroll List - Compact cards with full readable text */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1.5">
          {visibleRooms.map((room) => {
            const isSelected = room.id === activeRoomId;
            const isOwner = currentUser && (room.ownerId === currentUser.uid || room.createdBy === currentUser.uid);

            return (
              <div
                key={room.id}
                onClick={() => {
                  setActiveRoomId(room.id);
                  setViewMode('chat_feed');
                }}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2 active:scale-[0.99] ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/70 hover:bg-slate-900 border-slate-800/70'
                }`}
              >
                {/* Room Avatar */}
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0 border border-white/10 overflow-hidden relative"
                  style={{ backgroundColor: room.avatarColor || '#10b981' }}
                >
                  {room.avatar ? (
                    <img src={room.avatar} alt="Room" className="w-full h-full object-cover" />
                  ) : room.id === 'public-relay-lounge' ? (
                    <Globe className="w-3.5 h-3.5 text-emerald-200" />
                  ) : (
                    <span>{(room.name || 'R').charAt(0).toUpperCase()}</span>
                  )}
                </div>

                {/* Room Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  {/* Line 1: Room Name + Privacy Badge */}
                  <div className="flex items-center justify-between gap-1.5">
                    <h3 className="text-xs font-bold text-white truncate" title={room.name}>
                      {room.name}
                    </h3>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full flex items-center gap-0.5 shrink-0 ${
                      room.isPrivate !== false 
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {room.isPrivate !== false ? <Lock className="w-2 h-2" /> : <Globe className="w-2 h-2" />}
                      {room.isPrivate !== false ? 'Riêng tư' : 'Công cộng'}
                    </span>
                  </div>

                  {/* Line 2: Full continuous description */}
                  <p className="text-[10.5px] text-slate-400 truncate leading-tight">
                    {room.description || (room.id === 'public-relay-lounge' ? 'Sảnh trò chuyện công khai toàn cầu' : 'Phòng chat kết nối trực tuyến')}
                  </p>

                  {/* Line 3: Meta details */}
                  <div className="flex items-center gap-2 text-[9.5px] text-slate-500">
                    <span className="flex items-center gap-0.5 whitespace-nowrap">
                      <Users className="w-2.5 h-2.5" />
                      {room.members?.length || room.membersCount || 1} thành viên
                    </span>
                    {room.code && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-emerald-400/90 font-medium whitespace-nowrap">
                          ID: {room.code}
                        </span>
                      </>
                    )}
                    {isOwner && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 flex items-center gap-0.5 font-semibold whitespace-nowrap">
                          <Crown className="w-2.5 h-2.5" /> Trưởng phòng
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Tạo phòng mới */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessagesSquare className="w-5 h-5 text-emerald-400" />
                  Tạo phòng chat mới
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                {/* Avatar Preview */}
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0 border border-white/10 overflow-hidden"
                    style={{ backgroundColor: newRoomColor }}
                  >
                    {newRoomAvatar ? (
                      <img src={newRoomAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span>{(newRoomName.trim() || 'R').charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      Tải ảnh đại diện
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={avatarInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setNewRoomAvatar(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }} 
                        className="hidden" 
                      />
                    </label>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Màu nền:</span>
                      {ROOM_PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setNewRoomColor(col)}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            newRoomColor === col ? 'scale-125 ring-2 ring-white' : ''
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tên phòng
                  </label>
                  <input
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Nhập tên phòng..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Chế độ phòng
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRoomMode('public')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        newRoomMode === 'public'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Công cộng
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRoomMode('private')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        newRoomMode === 'private'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Riêng tư (Mã ID)
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newRoomName.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-md"
                >
                  Tạo phòng ngay
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal Nhập mã phòng */}
        {showJoinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  Nhập mã ID phòng
                </h3>
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleJoinByCode} className="space-y-4">
                <div>
                  <input
                    type="text"
                    required
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="Nhập mã 6 ký tự (VD: ABCD12)..."
                    className="w-full px-3.5 py-3 text-center font-mono uppercase tracking-widest text-base font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                  {joinError && (
                    <p className="text-xs text-rose-400 mt-1.5 font-medium">{joinError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!joinCodeInput.trim()}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md"
                >
                  Tham gia phòng
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= VIEW 2: ACTIVE ROOM CHAT FEED =================
  return (
    <div className="flex flex-col h-full w-full bg-[#0b0f19] overflow-hidden relative">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleSendMedia(e.target.files)}
        className="hidden"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={(e) => handleSendMedia(e.target.files)}
        className="hidden"
      />

      {/* Modern Room Header Bar with Back Button, Avatar, Title, and (i) Info Button */}
      <div className="px-2 py-1 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-sm z-20">
        {/* Left: Back to Rooms List button */}
        <button
          type="button"
          onClick={() => setViewMode('rooms_list')}
          className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] font-semibold shrink-0 border border-slate-700/60 active:scale-95 transition-all mr-1.5"
          title="Chọn phòng khác"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden xs:inline">Phòng</span>
        </button>

        {/* Center: Room Avatar + Title + Status */}
        <div 
          className="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer"
          onClick={() => setShowRoomDetails(true)}
        >
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0 border border-white/10 overflow-hidden"
            style={{ backgroundColor: activeRoom.avatarColor || '#10b981' }}
          >
            {activeRoom.avatar ? (
              <img src={activeRoom.avatar} alt="Room" className="w-full h-full object-cover" />
            ) : activeRoom.id === 'public-relay-lounge' ? (
              <Globe className="w-3.5 h-3.5 text-emerald-200" />
            ) : (
              <span>{(activeRoom.name || 'R').charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white truncate flex items-center gap-1 leading-tight">
              <span>{activeRoom.name}</span>
              {activeRoom.isPrivate !== false && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
            </h2>
            <p className="text-[9px] text-slate-400 truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>{activeRoom.members?.length || activeRoom.membersCount || 1} thành viên</span>
              <span>•</span>
              <span className="font-mono text-emerald-400/90">{messages.length} tin</span>
            </p>
          </div>
        </div>

        {/* Right: Info (i) button & DEV Reset button */}
        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          {isDevUser(currentUser?.email) && (
            <button
              type="button"
              onClick={() => setShowResetServerModal(true)}
              className="w-7 h-7 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center justify-center shrink-0 active:scale-95 transition-all"
              title="Quyền DEV: Reset máy chủ trò chuyện để chống lag"
            >
              <Zap className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowRoomDetails(true)}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 flex items-center justify-center shrink-0 border border-slate-700/60 active:scale-95 transition-all"
            title="Xem thông tin và cấu trúc phòng"
          >
            <Info className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area - Clean inner scroll without outer scrollbar */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1.5 overscroll-contain"
      >
        {(() => {
          const visibleMessages = messages.filter(m => !m.deletedBySender && !m.isDeletedBySender);

          return (
            <>
              {/* Discord / Zalo Infinite Scroll Up Header */}
              {isLoadingOlder ? (
                <div className="py-2.5 flex items-center justify-center text-xs text-slate-400 gap-2 select-none animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Đang tải các đoạn chat trước ngày hôm qua...</span>
                </div>
              ) : hasMoreOlder ? (
                <div className="py-2 flex items-center justify-center select-none">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    className="px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-[10px] font-semibold text-slate-300 hover:text-emerald-300 shadow-sm flex items-center gap-1.5 transition-all active:scale-95 group"
                  >
                    <History className="w-3 h-3 text-emerald-400 group-hover:-rotate-45 transition-transform" />
                    <span>Lăn chuột lên hoặc bấm để tải tin nhắn trước ngày hôm qua</span>
                  </button>
                </div>
              ) : visibleMessages.length > 0 ? (
                <div className="py-2.5 text-center text-[11px] text-slate-500 font-medium select-none border-b border-slate-800/60 mb-2 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Đã hiển thị toàn bộ lịch sử cuộc trò chuyện</span>
                </div>
              ) : null}

              {/* Empty State for today and yesterday */}
              {visibleMessages.length === 0 && (
                <div className="h-44 flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-500">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center shadow-inner">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-300">Chưa có tin nhắn nào trong hôm nay và hôm qua</p>
                    <p className="text-[10px] text-slate-500 max-w-xs mt-0.5">
                      Hệ thống chỉ tải sẵn tin nhắn hôm nay và hôm qua để tối ưu tốc độ và chống lag.
                    </p>
                  </div>
                  {hasMoreOlder && (
                    <button
                      type="button"
                      onClick={handleLoadOlderMessages}
                      disabled={isLoadingOlder}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                    >
                      {isLoadingOlder ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                          <span>Đang tải tin nhắn cũ...</span>
                        </>
                      ) : (
                        <>
                          <History className="w-3 h-3 text-emerald-400" />
                          <span>Tải tin nhắn trước ngày hôm qua</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Messages with Group Date Dividers */}
              {visibleMessages.map((msg, index) => {
                const isMe = msg.senderId === currentUser?.uid;
                const isDevMsg = !!(msg.isDevMessage || isDevUser(msg.senderEmail) || (msg.senderName && msg.senderName.includes('DEV')));
                const senderLiveName = isMe 
                  ? (userProfile?.displayName || currentUser?.displayName || settings?.deviceName || 'Bạn')
                  : (memberNamesMap[msg.senderId] || memberNamesMap[msg.senderDevice] || msg.senderName);

                const isImage = Boolean(
                  (msg.fileData && msg.fileData.startsWith('data:image')) ||
                  (msg.fileType && msg.fileType.startsWith('image/')) ||
                  (msg.fileName && msg.fileName.match(/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i))
                );
                const imgSrc = msg.fileData || msg.fileUrl || '';
                const canDelete = isMe || activeRoom?.ownerId === currentUser?.uid || activeRoom?.createdBy === currentUser?.uid || isDevUser(currentUser?.email);

                // Date separator logic
                const currentDateKey = getGroupDateKey(msg.createdAt);
                const prevDateKey = index > 0 ? getGroupDateKey(visibleMessages[index - 1].createdAt) : null;
                const showDateHeader = index === 0 || currentDateKey !== prevDateKey;

                return (
                  <React.Fragment key={msg.id}>
                    {/* Group Date Timeline Divider */}
                    {showDateHeader && (
                      <div className="flex items-center justify-center my-2 select-none">
                        <div className="px-2.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700/80 text-[10px] font-semibold text-slate-300 shadow-sm flex items-center gap-1 backdrop-blur-sm">
                          <Calendar className="w-3 h-3 text-emerald-400" />
                          <span>{formatGroupDateHeader(msg.createdAt)}</span>
                        </div>
                      </div>
                    )}

                    <div
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[88%] ${isMe ? 'ml-auto' : 'mr-auto'}`}
                    >
                      {/* Sender Header with Avatar on top of chat frame like Discord & Zalo */}
                      {(() => {
                        const senderMeta = memberMetaMap[msg.senderId] || memberMetaMap[msg.senderDevice];
                        const effectiveAvatarUrl = msg.senderAvatar || (isMe ? (userProfile?.customAvatarUrl || settings?.customAvatarUrl || currentUser?.photoURL) : senderMeta?.avatarUrl);
                        const effectiveAvatarColor = msg.senderAvatarColor || (isMe ? (userProfile?.avatarColor || settings?.avatarColor || '#10b981') : (senderMeta?.avatarColor || '#10b981'));
                        const initialChar = (senderLiveName.trim().charAt(0) || 'U').toUpperCase();

                        return (
                          <div className={`flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 flex-wrap ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Avatar on top of chat frame */}
                            <div className="relative shrink-0 select-none">
                              {effectiveAvatarUrl ? (
                                <img
                                  src={effectiveAvatarUrl}
                                  alt={senderLiveName}
                                  className="w-5 h-5 rounded-full object-cover ring-1 ring-slate-700/80 shadow-xs"
                                />
                              ) : (
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-[9px] shadow-xs ring-1 ring-white/10"
                                  style={{ backgroundColor: effectiveAvatarColor }}
                                >
                                  {initialChar}
                                </div>
                              )}
                              {isDevMsg && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-xs ring-1 ring-slate-900">
                                  <Crown className="w-1.5 h-1.5 text-slate-950 fill-slate-950" />
                                </span>
                              )}
                            </div>

                            {isDevMsg ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-extrabold text-[11px] bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent truncate max-w-[120px]">
                                  {senderLiveName}
                                </span>
                                <span className="text-[8px] font-mono font-bold px-1 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs inline-flex items-center gap-0.5 shrink-0">
                                  👑 DEV
                                </span>
                              </div>
                            ) : (
                              <span className={`font-semibold truncate max-w-[120px] ${isMe ? 'text-slate-300' : 'text-emerald-400'}`}>
                                {isMe ? 'Bạn' : senderLiveName}
                              </span>
                            )}

                            <span className="text-slate-500 text-[9px]">• {msg.senderDevice || 'Điện thoại'}</span>
                            <span className="text-slate-500 font-mono text-[9px]">
                              • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Message Bubble */}
                      <div
                        className={`px-2.5 py-1.5 rounded-xl shadow-sm text-xs relative group break-words space-y-1 ${
                          isDevMsg
                            ? 'bg-gradient-to-r from-emerald-950/95 via-slate-900 to-amber-950/70 border border-amber-400/80 shadow-md shadow-amber-500/10 ring-1 ring-emerald-500/40 text-white rounded-br-xl'
                            : isMe
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-none'
                            : 'bg-slate-800 border border-slate-700/80 text-slate-100 rounded-bl-none'
                        }`}
                      >
                        {/* DEV Banner inside bubble */}
                        {isDevMsg && (
                          <div className="flex items-center gap-1 pb-0.5 border-b border-amber-500/30 text-[8.5px] text-amber-300 font-bold">
                            <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
                            <span>DEV Chính Chủ</span>
                          </div>
                        )}

                        {/* Image Preview with in-app zoom modal */}
                        {isImage && imgSrc && (
                          <div className="rounded-xl overflow-hidden mb-1.5 border border-black/20 relative group/img cursor-pointer">
                            <img
                              src={imgSrc}
                              alt={msg.fileName || 'Attached photo'}
                              className="w-full max-h-64 object-cover active:opacity-90"
                              onClick={() => setViewingZoomImage({ url: imgSrc, name: msg.fileName || 'Hình ảnh', size: msg.fileSize })}
                            />
                            <div 
                              className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                              onClick={() => setViewingZoomImage({ url: imgSrc, name: msg.fileName || 'Hình ảnh', size: msg.fileSize })}
                            >
                              <span className="px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] font-semibold flex items-center gap-1">
                                <Eye className="w-3 h-3" /> Phóng to
                              </span>
                            </div>
                          </div>
                        )}

                        {/* File Download Action for non-images */}
                        {msg.fileName && !isImage && (
                          <div className="p-2.5 rounded-xl bg-black/20 border border-white/10 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold truncate">{msg.fileName}</p>
                              <p className="text-[10px] opacity-75">{formatFileSize(msg.fileSize)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => downloadFileSafely(msg.fileUrl || msg.fileData || '', msg.fileName || 'file')}
                              className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Text Content */}
                        {msg.text && (
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {renderClickableText(msg.text)}
                          </div>
                        )}

                        {/* Message Meta: Time & Actions */}
                        <div className="flex items-center justify-end gap-2 text-[9px] opacity-75 pt-0.5">
                          <span className="font-mono">
                            {new Date(msg.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>

                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="opacity-70 hover:opacity-100 text-rose-300 hover:text-white transition-opacity p-0.5 flex items-center gap-0.5"
                              title={isDevUser(currentUser?.email) && !isMe ? "Quyền DEV: Tiêu hủy tin nhắn vi phạm" : "Xóa tin nhắn"}
                            >
                              <Trash2 className="w-3 h-3" />
                              {isDevUser(currentUser?.email) && !isMe && (
                                <span className="text-[8px] font-mono text-amber-300 font-bold">DEV</span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReportTarget(msg)}
                              className="opacity-60 hover:opacity-100 text-slate-400 hover:text-amber-300 transition-opacity p-0.5"
                              title="Báo cáo"
                            >
                              <Flag className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute right-4 bottom-16 p-2 rounded-full bg-emerald-500 text-slate-950 shadow-xl active:scale-95 transition-all z-30"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Uploading indicator */}
      {isUploading && (
        <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-emerald-400">
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Đang tải ảnh/tệp đính kèm...
          </span>
          <span className="font-mono">{uploadPercent || 10}%</span>
        </div>
      )}

      {/* DEV Identity Badge Bar above input on Mobile - Slim & Compact with Server Reset Button */}
      {isDevUser(currentUser?.email) && (
        <div className="flex items-center justify-between gap-1 px-2.5 py-0.5 text-[8.5px] text-amber-300/90 bg-amber-500/10 border-t border-amber-500/20 shrink-0">
          <div className="flex items-center gap-1 min-w-0 truncate">
            <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
            <span className="text-slate-400 font-sans">Gửi tin tư cách:</span>
            <span className="font-bold text-amber-200 truncate">
              {(userProfile?.displayName || currentUser?.displayName || settings?.deviceName || 'Admin').trim()} (DEV)
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowResetServerModal(true)}
              className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[7.5px] font-bold flex items-center gap-0.5 transition-all active:scale-95"
              title="Quyền DEV: Reset máy chủ trò chuyện để dọn dẹp tin nhắn và chống lag"
            >
              <Zap className="w-2 h-2 text-rose-400 fill-rose-400" />
              <span>Reset Server</span>
            </button>
            <span className="text-[7.5px] font-mono font-bold px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
              👑 DEV
            </span>
          </div>
        </div>
      )}

      {/* Sticky Bottom Input Bar - Ultra-compact */}
      <div
        className="p-1.5 bg-slate-900/95 border-t border-slate-800 flex items-center gap-1.5 shrink-0 z-20"
        style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 4px))' }}
      >
        {/* Camera Quick Button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all shrink-0"
          title="Chụp ảnh gửi ngay"
        >
          <Camera className="w-3.5 h-3.5 text-emerald-400" />
        </button>

        {/* Gallery / File Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all shrink-0"
          title="Chọn tệp đính kèm"
        >
          <Paperclip className="w-3.5 h-3.5 text-sky-400" />
        </button>

        {/* Text Input Field */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if ((e.nativeEvent as any).isComposing) return;
              e.preventDefault();
              handleSendMessage(e.currentTarget.value);
            }
          }}
          placeholder="Nhập tin nhắn... (Enter gửi ngay)"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim()}
          className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold active:scale-95 transition-all shrink-0 shadow-sm cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Room Details & Management Modal ("i" button) */}
      {showRoomDetails && activeRoom && (
        <RoomDetailsModal
          isOpen={showRoomDetails}
          onClose={() => setShowRoomDetails(false)}
          room={activeRoom}
          currentUserUid={currentUser?.uid || ''}
          currentUserEmail={currentUser?.email || ''}
          currentUserName={userProfile?.displayName || currentUser?.displayName || 'Người dùng'}
          currentDeviceName={settings.deviceName}
          messages={messages}
          onRoomDeleted={() => {
            setActiveRoomId('public-relay-lounge');
            setViewMode('rooms_list');
          }}
          onRoomLeft={() => {
            setActiveRoomId('public-relay-lounge');
            setViewMode('rooms_list');
          }}
        />
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportMessageModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          message={reportTarget}
          roomId={activeRoomId}
          roomName={activeRoom.name}
          currentUserId={currentUser?.uid || ''}
          currentUserName={userProfile?.displayName || currentUser?.displayName || settings?.deviceName || 'Người dùng'}
        />
      )}

      {/* Zoomable Image Lightbox Modal */}
      {viewingZoomImage && (
        <ZoomableImageViewerModal
          isOpen={Boolean(viewingZoomImage)}
          onClose={() => setViewingZoomImage(null)}
          imageUrl={viewingZoomImage.url}
          imageName={viewingZoomImage.name || 'Hình ảnh'}
          fileSize={viewingZoomImage.size}
        />
      )}

      {/* DEV Server Reset Modal */}
      <ResetServerModal
        isOpen={showResetServerModal}
        onClose={() => setShowResetServerModal(false)}
        roomId={activeRoomId}
        roomName={activeRoom.name}
        totalMessagesCount={messages.length}
        isAutoWeeklyEnabled={Boolean((activeRoom as any)?.autoWeeklyReset)}
      />
    </div>
  );
};
