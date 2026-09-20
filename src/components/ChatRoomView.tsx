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
  getDocs,
  where,
  limit,
  serverTimestamp
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
  AlertTriangle
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playSendSound, playReceiveSound } from '../utils/sound';
import { censorProfanity, moderateUploadedImage } from '../utils/moderation';
import { RoomDetailsModal } from './RoomDetailsModal';

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
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Room details & structure modal ("i" button)
  const [showRoomDetails, setShowRoomDetails] = useState(false);

  // Moderation warning notification
  const [moderationWarning, setModerationWarning] = useState<string | null>(null);

  // Multiple file attachments in chat
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [mobileTab, setMobileTab] = useState<'rooms' | 'chat'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);

  // Auto-scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Listen to available rooms
  useEffect(() => {
    if (!currentUser) return;

    // Ensure Public Lounge room exists
    const ensurePublicRoom = async () => {
      try {
        const publicRoomRef = doc(db, 'rooms', 'public-relay-lounge');
        await setDoc(publicRoomRef, {
          id: 'public-relay-lounge',
          name: 'Đại Sảnh Toàn Cầu (Global Lounge)',
          code: 'PUBLIC',
          isPrivate: false,
          createdBy: 'system',
          createdByName: 'Hệ thống CloudSend',
          ownerId: 'system',
          ownerName: 'Hệ thống CloudSend',
          avatarColor: '#10b981',
          createdAt: '2026-01-01T00:00:00.000Z',
          description: 'Sảnh kết nối công khai không giới hạn cho mọi thiết bị trên mạng',
          members: [],
        }, { merge: true });
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

  // Helper to extract a reliable numeric timestamp from a message
  const getMessageTime = (msg: Partial<ChatMessage>): number => {
    if (typeof msg.timestamp === 'number' && msg.timestamp > 0) {
      return msg.timestamp;
    }
    if (msg.serverTimestamp && typeof msg.serverTimestamp.toMillis === 'function') {
      return msg.serverTimestamp.toMillis();
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
        const data = docSnap.data();
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

      initialLoadRef.current = false;
      setTimeout(() => scrollToBottom(false), 80);
    });

    return () => unsubscribe();
  }, [currentUser, activeRoomId, settings.soundEnabled]);

  // Compress a single image file to a lightweight data URL
  const compressImage = (file: File): Promise<ChatAttachment> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawData = e.target?.result as string;
        // If file is already small (<= 250KB), keep directly
        if (file.size <= 250 * 1024) {
          resolve({
            name: file.name,
            size: file.size,
            type: file.type || 'image/jpeg',
            data: rawData
          });
          return;
        }

        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedData = canvas.toDataURL('image/jpeg', 0.80);
            const approxSize = Math.round((compressedData.length * 3) / 4);
            resolve({
              name: file.name.replace(/\.[^/.]+$/, "") + ".jpg",
              size: approxSize,
              type: 'image/jpeg',
              data: compressedData
            });
          } else {
            resolve({
              name: file.name,
              size: file.size,
              type: file.type || 'image/jpeg',
              data: rawData
            });
          }
        };
        img.onerror = () => {
          resolve({
            name: file.name,
            size: file.size,
            type: file.type || 'image/jpeg',
            data: rawData
          });
        };
        img.src = rawData;
      };
      reader.readAsDataURL(file);
    });
  };

  // Convert non-image file
  const processGeneralFile = (file: File): Promise<ChatAttachment | null> => {
    return new Promise((resolve) => {
      const MAX_SIZE = 750 * 1024;
      if (file.size > MAX_SIZE) {
        alert(`Tệp "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn 750KB truyền tức thì trong phòng chat.`);
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          data: e.target?.result as string
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // Process multiple incoming files (via file picker, drag drop, or paste)
  const processAndAttachFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Cap at 10 items max at once
    const MAX_FILES = 10;
    const itemsToProcess = files.slice(0, MAX_FILES);

    setIsCompressing(true);
    try {
      const newAttachments: ChatAttachment[] = [];
      for (const file of itemsToProcess) {
        if (file.type.startsWith('image/')) {
          const processed = await compressImage(file);
          // Content Moderation check for 18+ and extreme gore
          const modResult = await moderateUploadedImage(processed.data, file.name);
          if (!modResult.safe) {
            setModerationWarning(
              modResult.reason || 
              `Ảnh "${file.name}" đã bị từ chối do vi phạm quy chuẩn nội dung (Chứa yếu tố 18+ nhạy cảm hoặc bạo lực máu me quá mức).`
            );
            setTimeout(() => setModerationWarning(null), 7000);
            continue; // Skip this file immediately!
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
    } finally {
      setIsCompressing(false);
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
    if (!currentUser) return;
    if (!inputText.trim() && attachments.length === 0) return;

    // Filter profanity / vulgar language: replace with ***
    const { cleanText } = censorProfanity(inputText.trim());
    const textToSend = cleanText;
    const attachmentsToSend = [...attachments];

    // Reset input immediately for responsive feel
    setInputText('');
    setAttachments([]);

    try {
      const now = new Date();
      const messagePayload: any = {
        roomId: activeRoomId,
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
        senderDevice: settings.deviceName,
        text: textToSend,
        createdAt: now.toISOString(),
        timestamp: now.getTime(),
        serverTimestamp: serverTimestamp(),
      };

      // Backwards compatibility with single file fields
      if (attachmentsToSend.length === 1) {
        messagePayload.fileName = attachmentsToSend[0].name;
        messagePayload.fileSize = attachmentsToSend[0].size;
        messagePayload.fileType = attachmentsToSend[0].type;
        messagePayload.fileData = attachmentsToSend[0].data;
      }
      
      // Multiple attachments array
      if (attachmentsToSend.length > 0) {
        messagePayload.attachments = attachmentsToSend;
      }

      await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), messagePayload);

      if (settings.soundEnabled) {
        playSendSound();
      }
      scrollToBottom(true);
    } catch (err) {
      console.error('Send message error:', err);
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
    const creatorMember: RoomMember = {
      uid: currentUser.uid,
      displayName: userProfile?.displayName || currentUser.displayName || 'Trưởng phòng',
      deviceName: settings.deviceName,
      avatarColor: settings.avatarColor || '#10b981',
      role: 'owner',
      joinedAt: new Date().toISOString()
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
        avatarColor: settings.avatarColor || '#10b981',
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
    } catch (err) {
      console.error('Create room error:', err);
    }
  };

  // Join room by ID / Code
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;

    const found = rooms.find(r => r.code?.toUpperCase() === code || r.id === code);
    if (found) {
      // Khi người nào đó nhập trúng ID và vô nhóm thì tự động là thành viên
      const existingMembers = found.members || [];
      const isAlreadyMember = existingMembers.some(m => m.uid === currentUser?.uid);

      if (!isAlreadyMember && currentUser) {
        const newMember: RoomMember = {
          uid: currentUser.uid,
          displayName: userProfile?.displayName || currentUser.displayName || 'Thành viên',
          deviceName: settings.deviceName,
          avatarColor: settings.avatarColor || '#3b82f6',
          role: 'member', // Là thành viên
          joinedAt: new Date().toISOString()
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
                className={`w-full text-left p-3 sm:p-3.5 rounded-xl transition-all flex items-center justify-between group ${
                  isActive
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    {room.isPrivate !== false && room.id !== 'public-relay-lounge' ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
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
            <div className="min-w-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileTab('rooms')}
                className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                title="Danh sách phòng"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
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
                      <span>ID: {activeRoom.code}</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                  {activeRoom.description || (activeRoom.isPrivate !== false ? 'Phòng riêng tư bảo mật' : 'Sảnh kết nối công khai')}
                </p>
              </div>
            </div>

            {/* "i" Icon button replacing "Relay Trực Tuyến" */}
            <div className="flex items-center gap-2 shrink-0">
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center">
                <MessagesSquare className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-slate-300">
                Chưa có tin nhắn nào trong phòng này.
              </p>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
                Hãy là người đầu tiên gửi tin nhắn chào hoặc đính kèm nhiều ảnh để chia sẻ nhé!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser?.uid;

              // Collect all attachments from message (supports multiple attachments & legacy single file format)
              const msgAttachments: ChatAttachment[] = [];
              if (msg.attachments && msg.attachments.length > 0) {
                msgAttachments.push(...msg.attachments);
              } else if (msg.fileData) {
                msgAttachments.push({
                  name: msg.fileName || 'file',
                  size: msg.fileSize || 0,
                  type: msg.fileType || 'application/octet-stream',
                  data: msg.fileData
                });
              }

              const imageAttachments = msgAttachments.filter(a => a.type.startsWith('image/'));
              const otherAttachments = msgAttachments.filter(a => !a.type.startsWith('image/'));

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                >
                  {/* Sender Name & Device */}
                  <div className="flex items-center gap-2 mb-1.5 px-1 text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">
                      {isMe ? 'Bạn' : msg.senderName}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 truncate max-w-[200px]">
                      {msg.senderDevice}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">
                      {(() => {
                        const t = getMessageTime(msg);
                        return t > 0
                          ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '';
                      })()}
                    </span>
                  </div>

                  {/* Message Bubble - Enriched & Enlarge */}
                  <div
                    className={`max-w-[94%] sm:max-w-xl md:max-w-2xl rounded-2xl p-4 space-y-3 shadow-md ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700/60'
                    }`}
                  >
                    {/* Attached Images Grid (One or Multiple Images, Larger display) */}
                    {imageAttachments.length > 0 && (
                      <div className={`grid gap-2.5 ${
                        imageAttachments.length === 1 
                          ? 'grid-cols-1' 
                          : imageAttachments.length === 2 
                            ? 'grid-cols-2' 
                            : 'grid-cols-2 sm:grid-cols-3'
                      }`}>
                        {imageAttachments.map((img, idx) => (
                          <div key={idx} className="relative group rounded-xl overflow-hidden bg-black/40 border border-white/10 shadow-sm">
                            <img
                              src={img.data}
                              alt={img.name}
                              className={`w-full ${imageAttachments.length === 1 ? 'max-h-96 sm:max-h-[480px]' : 'h-48 sm:h-60'} object-cover hover:scale-105 transition-transform duration-200 cursor-pointer`}
                              onClick={() => window.open(img.data, '_blank')}
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2.5 flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity">
                              <span className="text-xs text-white truncate max-w-[150px] font-medium drop-shadow">
                                {img.name}
                              </span>
                              <a
                                href={img.data}
                                download={img.name}
                                className="p-1.5 rounded-lg bg-black/40 hover:bg-emerald-600 text-white transition-colors"
                                title="Tải ảnh về máy"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Non-image File Attachments */}
                    {otherAttachments.length > 0 && (
                      <div className="space-y-1.5">
                        {otherAttachments.map((file, idx) => (
                          <div 
                            key={idx} 
                            className={`rounded-xl p-3 flex items-center justify-between gap-3 ${
                              isMe ? 'bg-emerald-700/60' : 'bg-slate-900/80 border border-slate-700/80'
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <FileText className="w-5 h-5 shrink-0 opacity-80" />
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-bold truncate">{file.name}</p>
                                <p className="text-[11px] opacity-75">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <a
                              href={file.data}
                              download={file.name}
                              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
                              title="Tải tệp"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.text && (
                      <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
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
                const isImg = att.type.startsWith('image/');
                return (
                  <div 
                    key={idx} 
                    className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-900 border border-emerald-500/40 shadow-md"
                  >
                    {isImg ? (
                      <img 
                        src={att.data} 
                        alt={att.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-800 text-emerald-400">
                        <FileText className="w-6 h-6 mb-0.5" />
                        <span className="text-[9px] text-slate-300 truncate w-full px-1">{att.name}</span>
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

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
            {/* Hidden general file input (multiple enabled) */}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e) => e.target.files && processAndAttachFiles(e.target.files)}
              className="hidden"
            />
            
            {/* Hidden dedicated image input (multiple enabled) */}
            <input
              type="file"
              multiple
              accept="image/*"
              ref={imageInputRef}
              onChange={(e) => e.target.files && processAndAttachFiles(e.target.files)}
              className="hidden"
            />

            {/* Quick Image Picker Button */}
            <button
              id="attach-image-btn"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Chọn một hoặc nhiều ảnh để gửi (hoặc kéo thả / dán Ctrl+V)"
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 border border-slate-700 transition-colors shrink-0"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* General File Attachment Button */}
            <button
              id="attach-file-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm tệp tin tài liệu"
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text Input with Paste listener */}
            <input
              id="chat-message-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handleChatPaste}
              placeholder={isCompressing ? "Đang kiểm tra an toàn & xử lý ảnh..." : "Nhập tin nhắn... (hoặc dán Ctrl+V / kéo thả nhiều ảnh vào đây)"}
              disabled={isCompressing}
              className="flex-1 px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />

            {/* Send Button */}
            <button
              id="send-message-btn"
              type="submit"
              disabled={(!inputText.trim() && attachments.length === 0) || isCompressing}
              className="p-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-2 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
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
    </div>
  );
};
