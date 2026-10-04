import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  updateDoc, 
  doc, 
  getDoc,
  getDocs, 
  where, 
  limit, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import { ChatRoom, ChatMessage, ChatAttachment, RoomMember } from '../types';
import { 
  MessagesSquare, 
  Plus, 
  Hash, 
  Send, 
  Paperclip, 
  FileText, 
  Image as ImageIcon, 
  Download, 
  Copy, 
  Check, 
  Users, 
  Laptop, 
  Smartphone, 
  Share2, 
  X, 
  Sparkles, 
  ArrowRight, 
  ChevronLeft, 
  Info, 
  Lock, 
  Globe, 
  Crown, 
  AlertTriangle, 
  ChevronDown, 
  Flame, 
  Clock, 
  ShieldAlert, 
  Trash2,
  Camera,
  Scale,
  Flag,
  Bold,
  Italic,
  Code,
  Wand2
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playSendSound, playReceiveSound, playDestructSound, playShieldAlertSound } from '../utils/sound';
import { censorProfanity, moderateUploadedImage } from '../utils/moderation';
import { downloadFileSafely } from '../utils/fileDownload';
import { isDevUser } from '../utils/devModeration';
import { renderClickableText, cleanAndFormatUserText, sanitizeDisplayText } from '../utils/textFormat';
import { 
  uploadFileToServer, 
  generateImageThumbnail, 
  compressImageForDirectTransfer,
  isImageFile,
  MAX_FILE_SIZE, 
  MAX_FILE_SIZE_LABEL 
} from '../utils/fileUpload';
import { RoomDetailsModal } from './RoomDetailsModal';
import { FileDocIcon, getDocumentTypeInfo } from './FileDocIcon';
import { SelfDestructViewerModal } from './SelfDestructViewerModal';
import { RulesModal } from './RulesModal';
import { ReportMessageModal } from './ReportMessageModal';
import { RichChatInput, RichChatInputHandle } from './RichChatInput';

// Default Earth / Globe SVG Avatar for Global Lounge (Đại Sảnh Toàn Cầu)
const DEFAULT_GLOBAL_LOUNGE_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23064e3b" stroke="%2310b981" stroke-width="3"/><circle cx="50" cy="50" r="38" fill="%23047857"/><ellipse cx="50" cy="50" rx="18" ry="38" fill="none" stroke="%2334d399" stroke-width="2.5"/><line x1="12" y1="50" x2="88" y2="50" stroke="%2334d399" stroke-width="2.5"/><path d="M20 30 Q50 38 80 30" fill="none" stroke="%236ee7b7" stroke-width="2"/><path d="M20 70 Q50 62 80 70" fill="none" stroke="%236ee7b7" stroke-width="2"/></svg>`;

const ROOM_PRESET_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1'];

export const ChatRoomView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('public-relay-lounge');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Create / Join Room state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomMode, setNewRoomMode] = useState<'public' | 'private'>('public');
  const [newRoomAvatar, setNewRoomAvatar] = useState<string>('');
  const [newRoomColor, setNewRoomColor] = useState<string>('#10b981');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Room details & structure modal ("i" button)
  const [showRoomDetails, setShowRoomDetails] = useState(false);
  const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(null);

  // Moderation warning notification
  const [moderationWarning, setModerationWarning] = useState<string | null>(null);

  // Self-destruct image mode ('off' | 'view_once' | '10s' | '30s')
  const [selfDestructMode, setSelfDestructMode] = useState<'off' | 'view_once' | '10s' | '30s'>('off');
  const [showSelfDestructMenu, setShowSelfDestructMenu] = useState(false);
  const [activeDestructMessage, setActiveDestructMessage] = useState<ChatMessage | null>(null);
  const [showRules, setShowRules] = useState(false);

  // Formatting & anti-glitch text toolbar
  const richInputRef = useRef<RichChatInputHandle>(null);
  const [formatNotice, setFormatNotice] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [enterKeyMode, setEnterKeyMode] = useState<'send' | 'newline'>(() => {
    return (localStorage.getItem('chat_enter_key_mode') as 'send' | 'newline') || 'send';
  });

  // Toggle or apply formatting on selection / cursor (WYSIWYG: in đậm / in nghiêng / mã trực tiếp)
  const toggleFormatting = (type: 'bold' | 'italic' | 'code' | 'codeblock') => {
    if (type === 'bold') {
      richInputRef.current?.applyBold();
      setFormatNotice('✨ Đã in đậm văn bản trực tiếp (Ctrl+B)');
      setTimeout(() => setFormatNotice(null), 2500);
    } else if (type === 'italic') {
      richInputRef.current?.applyItalic();
      setFormatNotice('✨ Đã in nghiêng văn bản trực tiếp (Ctrl+I)');
      setTimeout(() => setFormatNotice(null), 2500);
    } else if (type === 'code' || type === 'codeblock') {
      richInputRef.current?.applyCode?.();
      setFormatNotice('✨ Đã định dạng mã (Ctrl+E)');
      setTimeout(() => setFormatNotice(null), 2500);
    }
  };

  // Smart Clean / Format Text (Làm gọn văn bản - chống văn bản rác, khoảng trắng thừa, BiDi rác, layout vỡ)
  const handleCleanInputText = () => {
    richInputRef.current?.cleanText();
    setFormatNotice('✨ Đã tự động làm gọn văn bản & loại bỏ ký tự lỗi!');
    setTimeout(() => setFormatNotice(null), 3500);
  };

  // Multiple file attachments in chat
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const sendTimestampsRef = useRef<number[]>([]);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [mobileTab, setMobileTab] = useState<'rooms' | 'chat'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [hasUnreadNewMessage, setHasUnreadNewMessage] = useState(false);
  const hasUnreadNewMessageRef = useRef(false);
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const latestMessageIdRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  // Reset scroll and unread tracking when switching rooms
  useEffect(() => {
    initialLoadRef.current = true;
    lastSeenMessageIdRef.current = null;
    latestMessageIdRef.current = null;
    hasUnreadNewMessageRef.current = false;
    setHasUnreadNewMessage(false);
    setShowScrollBottomBtn(false);
    isNearBottomRef.current = true;
  }, [activeRoomId]);

  // Optimized scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    if (latestMessageIdRef.current) {
      lastSeenMessageIdRef.current = latestMessageIdRef.current;
    }
    hasUnreadNewMessageRef.current = false;
    setHasUnreadNewMessage(false);
    setShowScrollBottomBtn(false);
    isNearBottomRef.current = true;

    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Track scroll position to handle new unread messages
  const handleScrollChat = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceToBottom < 100;
    isNearBottomRef.current = nearBottom;

    if (nearBottom) {
      // Trường hợp 2: Khi người dùng xem ngay tin nhắn mới nhất hoặc cuộn xuống đáy
      if (latestMessageIdRef.current) {
        lastSeenMessageIdRef.current = latestMessageIdRef.current;
      }
      hasUnreadNewMessageRef.current = false;
      setHasUnreadNewMessage(false);
      setShowScrollBottomBtn(false);
    } else {
      // Người dùng cuộn lên trên:
      // CHỈ HIỆN nút "Tin nhắn mới nhất" NẾU có tin nhắn mới mà người dùng CHƯA XEM!
      // Khi đã xem rồi (lastSeenMessageIdRef.current === latestMessageIdRef.current),
      // thì khi cuộn lên trên sẽ KHÔNG HIỆN nút Tin nhắn mới nhất nữa!
      const hasUnread = Boolean(
        hasUnreadNewMessageRef.current &&
        latestMessageIdRef.current &&
        latestMessageIdRef.current !== lastSeenMessageIdRef.current
      );
      setShowScrollBottomBtn(hasUnread);
    }
  };

  // Listen to available rooms
  useEffect(() => {
    if (!currentUser) return;

    // Ensure Public Lounge room exists without overwriting custom edits
    const ensurePublicRoom = async () => {
      try {
        const publicRoomRef = doc(db, 'rooms', 'public-relay-lounge');
        const snap = await getDoc(publicRoomRef);
        if (!snap.exists()) {
          await setDoc(publicRoomRef, {
            id: 'public-relay-lounge',
            name: 'Đại Sảnh Toàn Cầu (Global Lounge)',
            code: 'PUBLIC',
            isPrivate: false,
            createdBy: 'system',
            createdByName: 'Hệ thống CloudSend',
            ownerId: 'system',
            ownerName: 'Hệ thống CloudSend',
            avatar: '',
            avatarColor: '#10b981',
            createdAt: '2026-01-01T00:00:00.000Z',
            description: 'Sảnh kết nối công khai không giới hạn cho mọi thiết bị trên mạng',
            members: [],
          });
        }
      } catch (err) {
        console.warn('Init public room error:', err);
      }
    };
    ensurePublicRoom();

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
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setRooms(roomList);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Helper to extract a reliable numeric timestamp from a message (prioritizes true atomic server time)
  const getMessageTime = (msg: Partial<ChatMessage>): number => {
    // 1. Authoritative Firestore server timestamp (immune to client clock drifts between school PC and phone)
    if (msg.serverTimestamp && typeof (msg.serverTimestamp as any).toMillis === 'function') {
      return (msg.serverTimestamp as any).toMillis();
    }
    if (msg.serverTimestamp && typeof (msg.serverTimestamp as any).seconds === 'number') {
      return (msg.serverTimestamp as any).seconds * 1000;
    }
    // 2. Client fallback
    if (typeof msg.timestamp === 'number' && msg.timestamp > 0) {
      return msg.timestamp;
    }
    if (msg.createdAt) {
      const parsed = new Date(msg.createdAt).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  // Listen to messages in active room
  useEffect(() => {
    if (!currentUser || !activeRoomId) return;

    const messagesRef = collection(db, 'rooms', activeRoomId, 'messages');
    // Fetch with limit and order by createdAt asc
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(150));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      let hasNewExternalMsg = false;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        const msg = { id: docSnap.id, ...data } as ChatMessage;
        msgs.push(msg);
        if (msg.senderId !== currentUser.uid && !initialLoadRef.current) {
          hasNewExternalMsg = true;
        }
      });

      // CRITICAL FIX: Deterministically sort messages client-side so messages
      // never scramble even if local clocks differ slightly or network responses arrive out of order
      msgs.sort((a, b) => {
        const timeA = getMessageTime(a);
        const timeB = getMessageTime(b);
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        // Tie-breaker 1: ISO string comparison
        const strA = a.createdAt || '';
        const strB = b.createdAt || '';
        if (strA !== strB) {
          return strA.localeCompare(strB);
        }
        // Tie-breaker 2: unique document ID
        return a.id.localeCompare(b.id);
      });

      setMessages(msgs);

      if (hasNewExternalMsg && settings.soundEnabled) {
        playReceiveSound();
      }

      const latestMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      if (latestMsg) {
        latestMessageIdRef.current = latestMsg.id;
      }

      const isFirst = initialLoadRef.current;
      initialLoadRef.current = false;
      
      // Handle the 2 cases requested by user:
      if (isFirst) {
        // Lần đầu vào phòng: Đã xem hết tin hiện có, cuộn xuống dưới, KHÔNG hiện nút
        if (latestMsg) {
          lastSeenMessageIdRef.current = latestMsg.id;
        }
        hasUnreadNewMessageRef.current = false;
        setHasUnreadNewMessage(false);
        setShowScrollBottomBtn(false);
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      } else if (!latestMsg) {
        setShowScrollBottomBtn(false);
      } else if (latestMsg.senderId === currentUser.uid) {
        // Chính người dùng vừa gửi tin nhắn: Tự động cuộn xuống đáy, đánh dấu đã xem, KHÔNG hiện nút
        lastSeenMessageIdRef.current = latestMsg.id;
        hasUnreadNewMessageRef.current = false;
        setHasUnreadNewMessage(false);
        setShowScrollBottomBtn(false);
        requestAnimationFrame(() => {
          scrollToBottom(true);
        });
      } else if (isNearBottomRef.current) {
        // TRƯỜNG HỢP 2: Khi người dùng xem ngay cái tin nhắn mới nhất (đang ở dưới đáy phòng chat)
        // -> Cũng KHÔNG HIỆN nút Tin nhắn mới nhất, tự động xem mượt mà!
        lastSeenMessageIdRef.current = latestMsg.id;
        hasUnreadNewMessageRef.current = false;
        setHasUnreadNewMessage(false);
        setShowScrollBottomBtn(false);
        requestAnimationFrame(() => {
          scrollToBottom(true);
        });
      } else {
        // TRƯỜNG HỢP 1: Khi người dùng đang xem tin nhắn ở trên, có người dùng khác ở dưới nhắn tin mới:
        // -> Hiện nút "Tin nhắn mới nhất" để người dùng bấm vào xem.
        // Khi người dùng bấm vào xem (hoặc cuộn xuống đáy) rồi, nếu họ cuộn ngược lên trên thì KHÔNG HIỆN nút nữa!
        if (latestMsg.id !== lastSeenMessageIdRef.current) {
          hasUnreadNewMessageRef.current = true;
          setHasUnreadNewMessage(true);
          setShowScrollBottomBtn(true);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, activeRoomId, settings.soundEnabled]);

  // Auto-detect and register user as a member when entering any room
  useEffect(() => {
    if (!currentUser || !activeRoomId || rooms.length === 0) return;
    const currentRoom = rooms.find(r => r.id === activeRoomId);
    if (!currentRoom) return;

    const existingMembers = currentRoom.members || [];
    const isAlreadyMember = existingMembers.some(m => m.uid === currentUser.uid);

    if (!isAlreadyMember) {
      const isRoomOwner = currentRoom.ownerId === currentUser.uid || currentRoom.createdBy === currentUser.uid;
      const isDev = isDevUser(currentUser.email);
      const newMember: RoomMember = {
        uid: currentUser.uid,
        displayName: userProfile?.displayName || currentUser.displayName || 'Thành viên',
        deviceName: settings.deviceName,
        avatarColor: settings.avatarColor || '#10b981',
        role: isRoomOwner ? 'owner' : 'member',
        joinedAt: new Date().toISOString(),
        email: currentUser.email || '',
        isDev: isDev
      };

      const updatedMembers = [...existingMembers, newMember];
      updateDoc(doc(db, 'rooms', activeRoomId), {
        members: updatedMembers,
        membersCount: updatedMembers.length
      }).catch(err => {
        console.warn('Auto register member error:', err);
      });
    }
  }, [currentUser, activeRoomId, rooms]);

  // Compress a single image file to a lightweight data URL and upload original for heavy files
  const compressImage = async (file: File): Promise<ChatAttachment> => {
    // Generate lightweight preview thumbnail
    const thumb = await generateImageThumbnail(file, 800, 0.75);

    // If file is > 200KB or if it is HEIC/HEIF (which needs server conversion for browsers), upload to server
    let fileUrl: string | undefined = undefined;
    let serverThumb: string | undefined = undefined;
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

    if (file.size > 200 * 1024 || isHeic || !thumb) {
      try {
        const uploaded = await uploadFileToServer(file, (pct) => {
          setUploadProgressText(`Đang xử lý ảnh "${file.name}" (${pct}%)...`);
        });
        fileUrl = uploaded.url;
        if (uploaded.thumbnail) {
          serverThumb = uploaded.thumbnail;
        }
      } catch (err) {
        console.warn('Could not upload original image to server, fallback to thumbnail:', err);
      }
    }

    let finalData = serverThumb || thumb || '';
    if (!finalData && !fileUrl) {
      // Smart direct fallback for mobile photos when server proxy is unavailable
      finalData = await compressImageForDirectTransfer(file, 1080, 0.8);
    }

    return {
      name: file.name,
      size: file.size,
      type: isHeic ? 'image/heic' : (file.type || 'image/jpeg'),
      data: finalData,
      url: fileUrl
    };
  };

  // Convert and upload heavy non-image file with security extension checks
  const processGeneralFile = async (file: File): Promise<ChatAttachment | null> => {
    // Security check: block dangerous executables, scripts, and installers
    const DANGEROUS_EXTS = ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.msi', '.scr', '.pif', '.com', '.reg', '.jar', '.apk'];
    const lowerName = file.name.toLowerCase();
    if (DANGEROUS_EXTS.some(ext => lowerName.endsWith(ext))) {
      playShieldAlertSound();
      setModerationWarning(`🚫 Tệp "${file.name}" bị chặn vì chứa định dạng thực thi/script có nguy cơ bảo mật.`);
      setTimeout(() => setModerationWarning(null), 7000);
      return null;
    }

    if (file.size > MAX_FILE_SIZE) {
      setModerationWarning(`⚠️ Tệp "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn tối đa ${MAX_FILE_SIZE_LABEL}.`);
      setTimeout(() => setModerationWarning(null), 5000);
      return null;
    }

    try {
      setUploadProgressText(`Đang tải tệp "${file.name}"...`);
      const uploaded = await uploadFileToServer(file, (pct) => {
        setUploadProgressText(`Đang tải tệp "${file.name}" (${pct}%)...`);
      });

      return {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        data: '',
        url: uploaded.url
      };
    } catch (err: any) {
      setModerationWarning(err?.message || 'Lỗi khi tải tệp lên máy chủ.');
      setTimeout(() => setModerationWarning(null), 5000);
      return null;
    }
  };

  // Process multiple incoming files (via file picker, drag drop, or paste)
  const processAndAttachFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Cap at 10 items max at once
    const MAX_FILES = 10;
    const itemsToProcess = files.slice(0, MAX_FILES);

    setIsCompressing(true);
    setUploadProgressText('Đang chuẩn bị tệp tin...');
    try {
      const newAttachments: ChatAttachment[] = [];
      for (const file of itemsToProcess) {
        if (isImageFile(file)) {
          const processed = await compressImage(file);
          // Content Moderation check for 18+ and extreme gore
          if (processed.data) {
            const modResult = await moderateUploadedImage(processed.data, file.name);
            if (!modResult.safe) {
              playShieldAlertSound();
              setModerationWarning(
                modResult.reason || 
                `🚫 Ảnh "${file.name}" đã bị hủy do vi phạm tiêu chuẩn nghiêm cấm.`
              );
              setTimeout(() => setModerationWarning(null), 8000);
              continue; // Skip this file immediately
            }
          }
          newAttachments.push(processed);
        } else {
          const processed = await processGeneralFile(file);
          if (processed) {
            newAttachments.push(processed);
          }
        }
      }

      setAttachments((prev) => {
        // Prevent duplicates by name and size
        const combined = [...prev];
        for (const item of newAttachments) {
          if (!combined.some(c => c.name === item.name && c.size === item.size)) {
            combined.push(item);
          }
        }
        return combined.slice(0, 10);
      });
    } catch (err) {
      console.error('Process files error:', err);
    } finally {
      setIsCompressing(false);
      setUploadProgressText(null);
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Handle drag & drop over chat
  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverChat) {
      setIsDraggingOverChat(true);
    }
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOverChat(false);
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverChat(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processAndAttachFiles(e.dataTransfer.files);
    }
  };

  // Handle pasting images from clipboard directly in input (Ctrl+V / Cmd+V)
  const handleChatPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length > 0) {
      processAndAttachFiles(pastedFiles);
      e.preventDefault();
    }
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || isSubmittingMessage) return;
    if (!inputText.trim() && attachments.length === 0) return;

    // Security & Anti-Flood: Max 4 messages per 3 seconds
    const now = Date.now();
    sendTimestampsRef.current = sendTimestampsRef.current.filter(t => now - t < 3000);
    if (sendTimestampsRef.current.length >= 4) {
      setModerationWarning('⚠️ Bạn đang gửi tin nhắn quá nhanh. Vui lòng chậm lại 2 giây để tránh spam.');
      setTimeout(() => setModerationWarning(null), 4000);
      return;
    }
    sendTimestampsRef.current.push(now);

    // Payload length limit: max 5000 chars
    if (inputText.length > 5000) {
      setModerationWarning('⚠️ Độ dài tin nhắn vượt quá giới hạn 5,000 ký tự cho phép.');
      setTimeout(() => setModerationWarning(null), 4000);
      return;
    }

    setIsSubmittingMessage(true);

    // Anti-glitch / anti-zalgo / anti-BiDi defense: sanitize dangerous text control codes and excessive newlines
    const sanitizedInput = sanitizeDisplayText(inputText);

    // Filter profanity / vulgar language: preserves spaces and replaces straight vulgar words with ***
    const { cleanText, hasProfanity, detectedList } = censorProfanity(sanitizedInput);
    const textToSend = cleanText;

    if (hasProfanity) {
      setModerationWarning(`⚠️ Phát hiện từ ngữ thô tục viết thẳng (${detectedList.slice(0, 3).join(', ')}). Hệ thống đã tự động chuyển đổi thành ***.`);
      setTimeout(() => setModerationWarning(null), 5000);
    }
    
    // Safety check on outgoing attachments: auto-purge any strictly forbidden images
    const safeAttachments: ChatAttachment[] = [];
    const purgedNames: string[] = [];

    for (const att of attachments) {
      if (isImageFile(att) && att.data) {
        const check = await moderateUploadedImage(att.data, att.name);
        if (!check.safe) {
          purgedNames.push(att.name);
          continue; // Automatically purged from payload
        }
      }
      safeAttachments.push(att);
    }

    if (purgedNames.length > 0) {
      playShieldAlertSound();
      setModerationWarning(
        `🚫 Đã hủy ${purgedNames.length} tệp [${purgedNames.join(', ')}] do vi phạm tiêu chuẩn nghiêm cấm.`
      );
      setAttachments(safeAttachments);
      setTimeout(() => setModerationWarning(null), 8000);
      if (safeAttachments.length === 0 && !textToSend) {
        return; // Nothing left to send
      }
    }

    const attachmentsToSend = [...safeAttachments];
    const isSelfDestruct = selfDestructMode !== 'off' && attachmentsToSend.length > 0;
    const selfDestructDuration = selfDestructMode === '10s' ? 10 : selfDestructMode === '30s' ? 30 : 0;

    const rawTextOriginal = inputText;

    // Reset input immediately for responsive feel
    setInputText('');
    richInputRef.current?.clear();
    setAttachments([]);
    setSelfDestructMode('off');
    setShowSelfDestructMenu(false);

    try {
      // FIX ORDERING BUG: Protect against school computer clock skew.
      // If user's school computer clock is lagging behind other computers,
      // enforce that this message's timestamp is strictly newer than any message already received!
      const latestSeenTime = messages.reduce((max, m) => Math.max(max, getMessageTime(m)), 0);
      const effectiveTimeMs = Math.max(Date.now(), latestSeenTime + 1000);
      const effectiveIso = new Date(effectiveTimeMs).toISOString();

      const isDev = isDevUser(currentUser.email);
      const messagePayload: any = {
        roomId: activeRoomId,
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
        senderEmail: currentUser.email || userProfile?.email || '',
        senderDevice: settings.deviceName,
        text: textToSend,
        rawText: rawTextOriginal, // Preserved raw original text with full spaces for Dev Cloud audit
        hasProfanity: hasProfanity,
        detectedProfanity: detectedList,
        createdAt: effectiveIso,
        timestamp: effectiveTimeMs,
        serverTimestamp: serverTimestamp(),
        isDevMessage: isDev,
      };

      // Self-destruct message flags
      if (isSelfDestruct) {
        messagePayload.isSelfDestruct = true;
        messagePayload.selfDestructDuration = selfDestructDuration;
        messagePayload.viewedBy = [];
      }

      // Backwards compatibility with single file fields
      if (attachmentsToSend.length === 1) {
        messagePayload.fileName = attachmentsToSend[0].name;
        messagePayload.fileSize = attachmentsToSend[0].size;
        messagePayload.fileType = attachmentsToSend[0].type;
        messagePayload.fileData = attachmentsToSend[0].data;
        if (attachmentsToSend[0].url) {
          messagePayload.fileUrl = attachmentsToSend[0].url;
        }
      }
      
      // Multiple attachments array
      if (attachmentsToSend.length > 0) {
        messagePayload.attachments = attachmentsToSend;
      }

      const docRef = await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), messagePayload);

      // Permanently archive for Dev Datastore Frame 4 so deleted client messages are NEVER lost!
      try {
        await setDoc(doc(db, 'rooms', activeRoomId, 'audit_messages', docRef.id), {
          ...messagePayload,
          id: docRef.id,
          archivedAt: effectiveIso,
          isDeletedBySender: false
        });
      } catch (err) {
        console.warn('Archiving message for dev error:', err);
      }

      if (settings.soundEnabled) {
        playSendSound();
      }
      scrollToBottom(true);
    } catch (err: any) {
      console.error('Send message error:', err);
      setModerationWarning(err?.message || 'Lỗi khi gửi tin nhắn. Vui lòng thử lại.');
      setTimeout(() => setModerationWarning(null), 4000);
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  // Delete message (destruct manually or upon self-destruct trigger)
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const nowIso = new Date().toISOString();

      // 1. Mark in audit_messages archive so DEV Frame 4 always retains it uncensored
      try {
        await setDoc(doc(db, 'rooms', activeRoomId, 'audit_messages', messageId), {
          deletedBySender: true,
          isDeletedBySender: true,
          deletedAt: nowIso
        }, { merge: true });
      } catch (err) {
        console.warn('Audit update error:', err);
      }

      // 2. Update active room messages with soft-delete flag so client disappears instantly without breaking or losing data
      try {
        await updateDoc(doc(db, 'rooms', activeRoomId, 'messages', messageId), {
          deletedBySender: true,
          isDeletedBySender: true,
          deletedAt: nowIso
        });
      } catch (err) {
        // Fallback hard-delete if update fails
        await deleteDoc(doc(db, 'rooms', activeRoomId, 'messages', messageId));
      }

      playDestructSound();
    } catch (err) {
      console.error('Delete message error:', err);
    }
  };

  // Create new chat room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newRoomName.trim()) return;

    const isPrivate = newRoomMode === 'private';
    const randomCode = isPrivate 
      ? Math.random().toString(36).substring(2, 8).toUpperCase()
      : 'PUBLIC';
    const roomId = `room-${Date.now()}`;

    // Mark creator as Trưởng phòng (Owner)
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
          : 'Phòng cộng đồng (Tự do tham gia không cần ID)',
        members: [creatorMember],
        membersCount: 1
      };

      await setDoc(doc(db, 'rooms', roomId), roomPayload);
      setActiveRoomId(roomId);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomMode('public');
      setNewRoomAvatar('');
      setNewRoomColor('#10b981');
    } catch (err) {
      console.error('Create room error:', err);
    }
  };

  // Join room by ID / Code
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return;

    let found = rooms.find(r => r.code?.toUpperCase() === code || r.id === code);
    
    // Fallback: query Firestore server directly if not yet in local state
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
      // Khi người nào đó nhập trúng ID và vô nhóm thì tự động là thành viên
      const existingMembers = found.members || [];
      const isAlreadyMember = existingMembers.some(m => m.uid === currentUser?.uid);

      if (!isAlreadyMember && currentUser) {
        const isDev = isDevUser(currentUser.email);
        const newMember: RoomMember = {
          uid: currentUser.uid,
          displayName: userProfile?.displayName || currentUser.displayName || 'Thành viên',
          deviceName: settings.deviceName,
          avatarColor: settings.avatarColor || '#3b82f6',
          role: 'member', // Là thành viên
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
      setJoinCodeInput('');
      setMobileTab('chat');
    } else {
      setJoinError('Không tìm thấy phòng với mã ID này. Vui lòng kiểm tra lại!');
    }
  };

  const handleCopyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filter visible rooms: all public rooms, and private rooms where user is member or creator
  const visibleRooms = rooms.filter(room => {
    if (room.id === 'public-relay-lounge' || room.isPrivate === false) return true;
    if (!currentUser) return false;
    const isOwner = room.ownerId === currentUser.uid || room.createdBy === currentUser.uid;
    const isMember = (room.members || []).some(m => m.uid === currentUser.uid);
    return isOwner || isMember;
  });

  const activeRoom = rooms.find(r => r.id === activeRoomId) || rooms[0];

  return (
    <div className="flex-1 h-full min-h-0 w-full px-3 sm:px-6 lg:px-8 py-2 sm:py-4 flex flex-col md:flex-row gap-3 md:gap-6 overflow-hidden">
      {/* Left Sidebar: Room List & Actions */}
      <div className={`${mobileTab === 'rooms' ? 'flex' : 'hidden md:flex'} w-full md:w-80 lg:w-96 bg-slate-900 border border-slate-800 rounded-2xl flex-col shadow-xl overflow-hidden shrink-0`}>
        {/* Sidebar Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Phòng Chat</h3>
          </div>
          <button
            id="create-room-btn"
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tạo phòng
          </button>
        </div>

        {/* Quick Join by Code */}
        <div className="p-3 sm:p-3.5 border-b border-slate-800/80 bg-slate-950/20">
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Mã phòng (VD: AB12CD)"
              className="flex-1 px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold shrink-0 transition-colors"
            >
              Vào
            </button>
          </form>
          {joinError && <p className="text-xs text-rose-400 mt-1.5">{joinError}</p>}
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-1.5">
          {visibleRooms.map((room) => {
            const isActive = room.id === activeRoomId;
            const isOwner = room.ownerId === currentUser?.uid || room.createdBy === currentUser?.uid;
            return (
              <button
                key={room.id}
                id={`room-item-${room.id}`}
                type="button"
                onClick={() => {
                  setActiveRoomId(room.id);
                  setMobileTab('chat');
                }}
                className={`w-full text-left p-2.5 sm:p-3 rounded-xl transition-all flex items-center gap-3 group ${
                  isActive
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {/* Room Avatar thumbnail */}
                <div 
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0 border border-white/10 overflow-hidden"
                  style={{ backgroundColor: room.avatarColor || '#10b981' }}
                >
                  {room.avatar ? (
                    <img src={room.avatar} alt={room.name} className="w-full h-full object-cover" />
                  ) : room.id === 'public-relay-lounge' ? (
                    <img src={DEFAULT_GLOBAL_LOUNGE_AVATAR} alt="Đại Sảnh Toàn Cầu" className="w-full h-full object-cover" />
                  ) : (
                    <span>{(room.name || 'P').charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {room.isPrivate !== false && room.id !== 'public-relay-lounge' && (
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="font-semibold text-sm truncate">
                      {room.name}
                    </span>
                    {room.id === 'public-relay-lounge' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                        Chung
                      </span>
                    ) : isOwner ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-0.5">
                        <Crown className="w-2.5 h-2.5 text-amber-400" />
                        Trưởng phòng
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        Thành viên
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {room.description || (room.isPrivate !== false ? `Mã riêng tư: ${room.code}` : 'Phòng cộng đồng')}
                  </p>
                </div>
                {room.isPrivate !== false && room.id !== 'public-relay-lounge' && (
                  <span className="text-xs font-mono px-2 py-1 rounded-md bg-slate-800 text-amber-400 shrink-0 border border-amber-500/20">
                    {room.code}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div 
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
        className={`${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'} flex-1 bg-slate-900 border rounded-2xl flex-col shadow-xl overflow-hidden min-h-[350px] relative transition-colors ${
          isDraggingOverChat ? 'border-emerald-500 bg-slate-900/90 ring-2 ring-emerald-500/40' : 'border-slate-800'
        }`}
      >
        {/* Full-area Drag Drop Overlay Hint */}
        {isDraggingOverChat && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none p-6 text-center animate-in fade-in duration-150">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20">
              <ImageIcon className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Thả ảnh hoặc tệp vào đây</h3>
            <p className="text-xs text-emerald-300/90 max-w-xs">
              Ảnh sẽ được tự động đính kèm và hiển thị ngay trên thanh chat để bạn xem trước!
            </p>
          </div>
        )}

        {/* Room Header */}
        {activeRoom && (
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileTab('rooms')}
                className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                title="Danh sách phòng"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* Room Avatar in Header - Before the Room Title */}
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-base shadow-md shrink-0 border border-white/10 overflow-hidden relative cursor-pointer group"
                style={{ backgroundColor: activeRoom.avatarColor || '#10b981' }}
                onClick={() => setShowRoomDetails(true)}
                title="Xem & Chỉnh sửa thông tin phòng (nút i)"
              >
                {activeRoom.avatar ? (
                  <img src={activeRoom.avatar} alt={activeRoom.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : activeRoom.id === 'public-relay-lounge' ? (
                  <img src={DEFAULT_GLOBAL_LOUNGE_AVATAR} alt="Đại Sảnh Toàn Cầu" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <span>{(activeRoom.name || 'P').charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    {activeRoom.name}
                  </h2>
                  {activeRoom.isPrivate !== false && activeRoom.id !== 'public-relay-lounge' && (
                    <button
                      type="button"
                      onClick={() => handleCopyRoomCode(activeRoom.code)}
                      title="Sao chép mã phòng"
                      className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 hover:bg-slate-700 transition-colors border border-amber-500/30 shrink-0"
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      <span className="copyable-text select-text cursor-text" data-copyable="true">ID: {activeRoom.code}</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                  {activeRoom.description || (activeRoom.isPrivate !== false ? 'Phòng riêng tư bảo mật' : 'Sảnh kết nối công khai')}
                </p>
              </div>
            </div>

            {/* Action buttons: Rules & Info */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="room-rules-btn"
                type="button"
                onClick={() => setShowRules(true)}
                title="Xem Bảng Nội Quy & Điều Khoản Sử Dụng (Căn cứ xử lý vi phạm trong phòng)"
                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border border-slate-700/80 hover:border-amber-500/40 flex items-center justify-center shadow-sm active:scale-95 transition-all group"
              >
                <Scale className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              </button>

              <button
                id="room-info-i-btn"
                type="button"
                onClick={() => setShowRoomDetails(true)}
                title={activeRoom.isPrivate !== false ? "Cấu trúc & Cài đặt phòng riêng tư" : "Thông tin & Thành viên phòng"}
                className="w-9 h-9 rounded-full bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-400 border border-slate-700/80 hover:border-emerald-500/40 flex items-center justify-center shadow-sm active:scale-95 transition-all group"
              >
                <span className="font-serif italic font-bold text-base text-emerald-400 group-hover:scale-110 transition-transform">
                  i
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Message Feed */}
        <div 
          ref={chatContainerRef}
          onScroll={handleScrollChat}
          className="flex-1 chat-scroll-container p-3 sm:p-4 space-y-3 relative"
        >
          {(() => {
            const visibleMessages = messages.filter(m => !m.deletedBySender && !m.isDeletedBySender);
            if (visibleMessages.length === 0) {
              return (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center">
                    <MessagesSquare className="w-6 h-6" />
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-slate-300">
                    Chưa có tin nhắn nào trong phòng này.
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Hãy là người đầu tiên gửi tin nhắn chào hoặc đính kèm nhiều ảnh để chia sẻ nhé!
                  </p>
                </div>
              );
            }

            return visibleMessages.map((msg) => {
              const isMe = msg.senderId === currentUser?.uid;
              const isDevMsg = !!(msg.isDevMessage || isDevUser(msg.senderEmail) || (msg.senderName && msg.senderName.includes('DEV')));
              const isWarned = !!(msg.hasProfanity || msg.hasWarning || msg.isReported || censorProfanity(msg.text || '').hasProfanity);

              // Collect all attachments from message (supports multiple attachments & legacy single file format)
              const msgAttachments: ChatAttachment[] = [];
              if (msg.attachments && msg.attachments.length > 0) {
                msgAttachments.push(...msg.attachments);
              } else if (msg.fileData || msg.fileUrl) {
                msgAttachments.push({
                  name: msg.fileName || 'file',
                  size: msg.fileSize || 0,
                  type: msg.fileType || 'application/octet-stream',
                  data: msg.fileData || '',
                  url: msg.fileUrl
                });
              }

              const imageAttachments = msgAttachments.filter(a => isImageFile(a));
              const otherAttachments = msgAttachments.filter(a => !isImageFile(a));

              return (
                <div
                  key={msg.id}
                  className={`chat-bubble-item flex flex-col ${isMe ? 'items-end' : 'items-start'} group animate-message-enter`}
                >
                  {/* Sender Name & Device */}
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400">
                    {isDevMsg ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-amber-400 to-emerald-500 p-0.5 flex items-center justify-center shadow-sm">
                          <Crown className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                        </div>
                        <span className="font-extrabold text-xs bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent">
                          {isMe ? `${msg.senderName || 'Bạn'}` : msg.senderName}
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-0.5">
                          👑 DEV CHÍNH CHỦ
                        </span>
                      </div>
                    ) : (
                      <span className="font-semibold text-slate-200">
                        {isMe ? 'Bạn' : msg.senderName}
                      </span>
                    )}
                    <span>•</span>
                    <span className="text-slate-500 truncate max-w-[160px]">
                      {msg.senderDevice}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 font-mono">
                      {(() => {
                        const t = getMessageTime(msg);
                        return t > 0
                          ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';
                      })()}
                    </span>
                    {/* Delete button on hover for sender or owner */}
                    {(isMe || activeRoom?.ownerId === currentUser?.uid) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all ml-1"
                        title="Xóa / tiêu hủy tin nhắn này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Report button for other users to report evasion, 18+ or harassment */}
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => setReportingMessage(msg)}
                        className="opacity-60 sm:opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all ml-1"
                        title="Tố cáo tin nhắn này đến DEV (lách luật, 18+, quấy rối)"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Message Bubble - Compact, neat & balanced */}
                  <div
                    className={`max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl px-3.5 py-2 space-y-1.5 shadow-sm text-xs sm:text-[13px] ${
                      isWarned
                        ? 'border-2 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500/50'
                        : isDevMsg
                        ? 'bg-gradient-to-r from-emerald-950/90 via-slate-900 to-amber-950/50 border-2 border-amber-400/70 shadow-lg shadow-amber-500/10 ring-1 ring-emerald-500/40 text-white'
                        : isMe
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700/60'
                    }`}
                  >
                    {/* DEV Banner inside bubble */}
                    {isDevMsg && (
                      <div className="flex items-center gap-1.5 pb-1 border-b border-amber-500/20 text-[10px] text-amber-300 font-semibold">
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>Thông điệp từ Nhà Phát Triển (DEV)</span>
                      </div>
                    )}
                    {/* Warning Notice if flagged */}
                    {isWarned && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/25 border border-rose-500/40 text-rose-200 text-[10px] font-semibold w-fit">
                        <AlertTriangle className="w-3 h-3 text-rose-300 animate-pulse" />
                        <span>Nội dung bị cảnh cáo vi phạm</span>
                      </div>
                    )}

                    {/* Self-Destruct Notice Badge */}
                    {msg.isSelfDestruct && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-200 text-[10px] font-semibold w-fit">
                        <Flame className="w-3 h-3 text-orange-400 animate-pulse" />
                        <span>{msg.selfDestructDuration ? `Ảnh tự hủy sau ${msg.selfDestructDuration}s` : 'Ảnh bảo mật (Xem 1 lần)'}</span>
                      </div>
                    )}

                    {/* Attached Images Grid OR Protected Self-Destruct Card */}
                    {imageAttachments.length > 0 && (
                      msg.isSelfDestruct ? (
                        <div
                          onClick={() => setActiveDestructMessage(msg)}
                          className="cursor-pointer group/destruct rounded-xl overflow-hidden bg-slate-950/80 border border-orange-500/40 p-3.5 flex flex-col items-center justify-center text-center space-y-2 hover:border-orange-500 transition-all hover:shadow-lg hover:shadow-orange-500/10"
                        >
                          <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 group-hover/destruct:scale-110 transition-transform shadow-md shadow-orange-500/20">
                            <Flame className="w-5 h-5 animate-bounce" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-orange-200">
                              {msg.selfDestructDuration ? `Ảnh tự hủy (${msg.selfDestructDuration} giây)` : 'Ảnh tự hủy (Xem 1 lần)'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Nhấn để mở xem ({imageAttachments.length} ảnh) • Tự động tiêu hủy sau khi xem
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className={`grid gap-1.5 ${
                          imageAttachments.length === 1 
                            ? 'grid-cols-1' 
                            : imageAttachments.length === 2 
                              ? 'grid-cols-2' 
                              : 'grid-cols-2 sm:grid-cols-3'
                        }`}>
                          {imageAttachments.map((img, idx) => {
                            const viewUrl = img.url ? img.url.replace('/api/files/download/', '/api/files/view/') : '';
                            const imgSrc = img.data || viewUrl || img.url;
                            const imgDownload = img.url || img.data;
                            return (
                            <div key={idx} className="relative group rounded-xl overflow-hidden bg-black/40 border border-white/10 shadow-sm">
                              <img
                                src={imgSrc}
                                alt={img.name}
                                loading="lazy"
                                decoding="async"
                                className={`w-full ${imageAttachments.length === 1 ? 'max-h-56 sm:max-h-64' : 'h-32 sm:h-36'} object-cover hover:opacity-95 transition-opacity cursor-pointer`}
                                onClick={() => {
                                  const targetUrl = viewUrl || imgDownload;
                                  if (targetUrl) {
                                    const a = document.createElement('a');
                                    a.href = targetUrl;
                                    a.target = '_blank';
                                    a.rel = 'noreferrer';
                                    a.click();
                                  }
                                }}
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2 flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity">
                                <span className="text-[11px] text-white truncate max-w-[130px] font-medium drop-shadow">
                                  {img.name}
                                </span>
                                <button
                                  type="button"
                                  className="p-1 rounded-md bg-black/40 hover:bg-emerald-600 text-white transition-colors cursor-pointer"
                                  title="Tải ảnh về máy"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadFileSafely(imgDownload, img.name);
                                  }}
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                      )
                    )}

                    {/* Non-image File Attachments */}
                    {otherAttachments.length > 0 && (
                      <div className="space-y-1">
                        {otherAttachments.map((file, idx) => {
                          const fileHref = file.url || file.data;
                          return (
                          <div 
                            key={idx} 
                            className={`rounded-xl p-2.5 flex items-center justify-between gap-3 ${
                              isMe ? 'bg-emerald-700/60 border border-emerald-500/30' : 'bg-slate-900/90 border border-slate-700/80'
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <FileDocIcon fileName={file.name} mimeType={file.type} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate text-white">{file.name}</p>
                                <p className="text-[10px] opacity-80">
                                  {formatFileSize(file.size)} • {getDocumentTypeInfo(file.name, file.type).label}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => downloadFileSafely(fileHref, file.name)}
                              className="p-1.5 rounded-lg bg-black/25 hover:bg-emerald-600 text-white transition-colors shrink-0 shadow-sm cursor-pointer"
                              title="Tải tệp"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                        })}
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.text && (
                      <div 
                        className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full chat-message-text select-text cursor-text"
                        data-chat-message="true"
                      >
                        {renderClickableText(censorProfanity(msg.text).cleanText, isMe)}
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
          <div ref={messagesEndRef} />

          {/* Quick Jump to Bottom Floating Button */}
          {showScrollBottomBtn && (
            <button
              id="scroll-to-bottom-btn"
              type="button"
              onClick={() => scrollToBottom(true)}
              className="sticky bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-800/95 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500 shadow-xl shadow-black/40 text-xs font-semibold backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-150 z-20 cursor-pointer"
              title="Cuộn xuống tin nhắn mới nhất"
            >
              <ChevronDown className="w-4 h-4 text-emerald-400 hover:text-white animate-bounce" />
              <span>Tin nhắn mới nhất</span>
            </button>
          )}
        </div>

        {/* Multiple File/Image Preview Bar directly above input */}
        {attachments.length > 0 && (
          <div className="px-4 py-3 bg-slate-950/95 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                Đã chọn {attachments.length} ảnh/tệp ({formatFileSize(attachments.reduce((acc, cur) => acc + cur.size, 0))})
              </span>
              <button
                type="button"
                onClick={() => setAttachments([])}
                className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
              >
                Xóa tất cả
              </button>
            </div>

            {/* Horizontal Scrollable Thumbnails */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-0.5">
              {attachments.map((att, idx) => {
                const isImg = isImageFile(att);
                const viewUrl = att.url ? att.url.replace('/api/files/download/', '/api/files/view/') : '';
                const displaySrc = att.data || viewUrl;
                return (
                  <div 
                    key={idx} 
                    className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-900 border border-emerald-500/40 shadow-md"
                  >
                    {isImg && displaySrc ? (
                      <img 
                        src={displaySrc} 
                        alt={att.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-900">
                        <FileDocIcon fileName={att.name} mimeType={att.type} size="sm" />
                        <span className="text-[9px] text-slate-300 truncate w-full px-1 mt-1 font-medium">{att.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      title="Xóa tệp này"
                      className="absolute top-1 right-1 p-1 rounded-full bg-slate-950/80 hover:bg-rose-600 text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Moderation Warning Toast/Banner */}
        {moderationWarning && (
          <div className="mx-4 mb-2 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in duration-200 shadow-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-300" />
              </div>
              <span className="font-medium text-rose-100">{moderationWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setModerationWarning(null)}
              className="p-1.5 rounded-lg hover:bg-rose-500/30 text-rose-300 hover:text-white shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Self-Destruct Active Indicator Banner */}
        {selfDestructMode !== 'off' && (
          <div className="mx-4 mb-2 px-3.5 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-200 text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
              <span>
                Chế độ Ảnh tự hủy đang bật:{' '}
                <strong className="text-orange-300">
                  {selfDestructMode === 'view_once' ? 'Xem 1 lần rồi biến mất vĩnh viễn' : `Tự tiêu hủy sau ${selfDestructMode === '10s' ? '10 giây' : '30 giây'}`}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelfDestructMode('off')}
              className="text-orange-400 hover:text-white font-semibold underline text-xs"
            >
              Tắt tự hủy
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t border-slate-800 bg-slate-950/50">
          {isDevUser(currentUser?.email) && (
            <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-amber-300 bg-gradient-to-r from-amber-500/20 via-emerald-500/10 to-transparent border-b border-amber-500/30 font-medium">
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-pulse shrink-0" />
              <span>Gửi tin với tư cách:</span>
              <span className="font-extrabold bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent">
                {(userProfile?.displayName || currentUser?.displayName || settings.deviceName || 'Admin').trim()} (DEV)
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                👑 DEV CHÍNH CHỦ
              </span>
              <span className="text-[10px] text-emerald-400/90 ml-auto hidden sm:inline font-mono">
                ✨ Người khác sẽ thấy bạn trang trí vương miện & viền vàng như DEV Datastore
              </span>
            </div>
          )}

          <div className="p-3 sm:p-4 space-y-2">
            {/* Quick Text Formatting Toolbar & Selection Helper */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap px-1">
              <div className="flex items-center gap-1 flex-wrap">
                {/* Bold */}
                <button
                  type="button"
                  onClick={() => toggleFormatting('bold')}
                  title="In đậm (Bôi đen + Bấm hoặc nhấn Ctrl + B)"
                  className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Bold className="w-3.5 h-3.5" />
                  <span>Đậm <kbd className="hidden sm:inline-block px-1 py-0.2 bg-black/40 border border-white/10 rounded text-[9px] text-slate-400 font-sans">Ctrl+B</kbd></span>
                </button>

                {/* Italic */}
                <button
                  type="button"
                  onClick={() => toggleFormatting('italic')}
                  title="In nghiêng (Bôi đen + Bấm hoặc nhấn Ctrl + I)"
                  className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs italic flex items-center gap-1.5 transition-colors"
                >
                  <Italic className="w-3.5 h-3.5" />
                  <span>Nghiêng <kbd className="hidden sm:inline-block px-1 py-0.2 bg-black/40 border border-white/10 rounded text-[9px] text-slate-400 font-sans">Ctrl+I</kbd></span>
                </button>
              </div>

              {/* Smart Format / Clean Text Button */}
              {inputText.trim().length > 0 && (
                <button
                  type="button"
                  onClick={handleCleanInputText}
                  title="Tự động xóa khoảng trắng rác, dòng trống thừa, ký tự ẩn và căn chỉnh văn bản gọn gàng không bị hiện lung tung"
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ml-auto"
                >
                  <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Làm gọn văn bản</span>
                </button>
              )}
            </div>

            {/* Selection Quick Action Bubble */}
            {hasSelection && (
              <div className="text-xs text-emerald-300 bg-slate-900/95 border border-emerald-500/40 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150">
                <span className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Đang bôi đen chữ: Bấm <strong>Ctrl+B</strong> để Đậm, <strong>Ctrl+I</strong> để Nghiêng</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleFormatting('bold')}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                  >
                    B Đậm
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFormatting('italic')}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white italic text-[11px]"
                  >
                    I Nghiêng
                  </button>
                </div>
              </div>
            )}

            {/* Format Notification Toast */}
            {formatNotice && (
              <div className="text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/80 rounded-xl px-3 py-1.5 flex items-center gap-2 animate-in fade-in duration-150">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{formatNotice}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-end gap-2 sm:gap-3">
              {/* Hidden general file input (multiple enabled) */}
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={(e) => e.target.files && processAndAttachFiles(e.target.files)}
                className="hidden"
              />
              
              {/* Hidden dedicated image input (supports phone photos, iPhone HEIC/HEIF, RAW) */}
              <input
                type="file"
                multiple
                accept="image/*,.heic,.heif,.dng,.raw"
                ref={imageInputRef}
                onChange={(e) => e.target.files && processAndAttachFiles(e.target.files)}
                className="hidden"
              />

              {/* Quick Image Picker Button */}
              <button
                id="attach-image-btn"
                type="button"
                onClick={() => imageInputRef.current?.click()}
                title="Chọn một hoặc nhiều ảnh để gửi (hỗ trợ tới 250MB hoặc kéo thả / dán Ctrl+V)"
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 border border-slate-700 transition-colors shrink-0"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* General File Attachment Button */}
              <button
                id="attach-file-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Đính kèm tệp tin dung lượng lớn lên tới 250MB (tài liệu, video, ZIP, phần mềm...)"
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shrink-0"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Smart Rich Input with WYSIWYG Bold / Italic / Code & Gliding Neon Caret */}
              <div className="flex-1 relative min-w-0">
                <RichChatInput
                  id="chat-message-input"
                  ref={richInputRef}
                  value={inputText}
                  onChange={(md, _plain) => {
                    setInputText(md);
                  }}
                  onSend={() => handleSendMessage()}
                  onPasteFiles={processAndAttachFiles}
                  onSelectionChange={setHasSelection}
                  onFormatNotice={(notice) => {
                    setFormatNotice(notice);
                    setTimeout(() => setFormatNotice(null), 2500);
                  }}
                  enterKeyMode={enterKeyMode}
                  disabled={isCompressing}
                  placeholder={isCompressing ? (uploadProgressText || "Đang tải & xử lý tệp tin...") : "Nhập tin nhắn... (Bôi đen & Ctrl+B để in đậm, Ctrl+I để in nghiêng, Enter gửi)"}
                  className="smooth-input"
                />
              </div>

              {/* Send Button */}
              <button
                id="send-message-btn"
                type="submit"
                disabled={(!inputText.trim() && attachments.length === 0) || isCompressing}
                className="p-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-2 shrink-0 h-[46px]"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Gửi</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Tạo phòng chat mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Ảnh đại diện & Biểu tượng nhóm */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Ảnh đại diện & Biểu tượng nhóm
                </label>
                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0 border border-white/10 overflow-hidden relative"
                    style={{ backgroundColor: newRoomColor }}
                  >
                    {newRoomAvatar ? (
                      <img src={newRoomAvatar} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span>{(newRoomName.trim() || 'R').charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 flex items-center gap-1.5 transition-colors">
                        <Camera className="w-3.5 h-3.5" />
                        Tải ảnh lên
                        <input 
                          type="file" 
                          accept="image/*" 
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
                      {newRoomAvatar && (
                        <button
                          type="button"
                          onClick={() => setNewRoomAvatar('')}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-colors"
                        >
                          Dùng icon mặc định
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 mr-1">Màu nền:</span>
                      {ROOM_PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setNewRoomColor(col)}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            newRoomColor === col ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dòng 1: Tên phòng */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Dòng 1: Tên phòng
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ví dụ: Team Dự Án, Nhóm Bạn Thân, Trao Đổi..."
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Dòng 2: Chế độ Public và Private */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Dòng 2: Chế độ phòng
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Public */}
                  <button
                    type="button"
                    onClick={() => setNewRoomMode('public')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5 ${
                      newRoomMode === 'public'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-sm text-emerald-400">
                        <Globe className="w-4 h-4" />
                        <span>Công cộng</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Public
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Phòng chat cộng đồng. Ai cũng có thể thấy và vào tự do không cần mã ID.
                    </p>
                  </button>

                  {/* Option 2: Private */}
                  <button
                    type="button"
                    onClick={() => setNewRoomMode('private')}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1.5 ${
                      newRoomMode === 'private'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-500'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-sm text-amber-400">
                        <Lock className="w-4 h-4" />
                        <span>Riêng tư</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Private
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Phòng có mã ID bảo mật. Khi người khác nhập trúng ID sẽ tự động là thành viên.
                    </p>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Bạn sẽ tự động là <strong>Trưởng phòng (Owner)</strong> quản lý nhóm này.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                >
                  Tạo phòng ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          }}
          onRoomLeft={() => {
            setActiveRoomId('public-relay-lounge');
          }}
        />
      )}

      {/* Safe Self-Destruct Image Viewer Modal */}
      {activeDestructMessage && (
        <SelfDestructViewerModal
          isOpen={!!activeDestructMessage}
          message={activeDestructMessage}
          onClose={() => setActiveDestructMessage(null)}
          onDestruct={handleDeleteMessage}
        />
      )}

      {/* Community Rules & Conduct Modal */}
      {showRules && (
        <RulesModal
          isOpen={showRules}
          onClose={() => setShowRules(false)}
        />
      )}

      {/* Report Message to DEV Modal */}
      {reportingMessage && activeRoom && currentUser && (
        <ReportMessageModal
          isOpen={!!reportingMessage}
          onClose={() => setReportingMessage(null)}
          message={reportingMessage}
          roomId={activeRoom.id}
          roomName={activeRoom.name}
          currentUserId={currentUser.uid}
          currentUserName={userProfile?.displayName || currentUser.displayName || 'Người dùng'}
        />
      )}
    </div>
  );
};
