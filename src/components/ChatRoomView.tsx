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
  doc, 
  getDocs,
  where,
  limit
} from 'firebase/firestore';
import { ChatRoom, ChatMessage } from '../types';
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
  ArrowRight
} from 'lucide-react';
import { formatFileSize } from '../utils/device';
import { playSendSound, playReceiveSound } from '../utils/sound';

export const ChatRoomView: React.FC = () => {
  const { currentUser, userProfile, settings } = useAuth();
  
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>('public-relay-lounge');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Create / Join Room state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // File attachment in chat
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedBase64, setAttachedBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedCode, setCopiedCode] = useState(false);
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
          name: 'Phòng Chung (Relay Lounge)',
          code: 'PUBLIC',
          createdBy: 'system',
          createdByName: 'Hệ thống CloudSend',
          createdAt: '2026-01-01T00:00:00.000Z',
          description: 'Phòng chat kết nối công khai cho tất cả thiết bị trên mạng Relay',
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

  // Listen to messages in active room
  useEffect(() => {
    if (!currentUser || !activeRoomId) return;

    const messagesRef = collection(db, 'rooms', activeRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      let hasNewExternalMsg = false;

      snapshot.forEach((docSnap) => {
        const msg = { id: docSnap.id, ...docSnap.data() } as ChatMessage;
        msgs.push(msg);
        if (msg.senderId !== currentUser.uid && !initialLoadRef.current) {
          hasNewExternalMsg = true;
        }
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

  // Handle file selection for chat
  const handleSelectFile = (file: File) => {
    const MAX_SIZE = 750 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`Tệp "${file.name}" vượt quá giới hạn 750KB truyền tức thì trong phòng chat.`);
      return;
    }
    setAttachedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachedBase64(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser) return;
    if (!inputText.trim() && !attachedFile) return;

    const textToSend = inputText.trim();
    const fileToSend = attachedFile;
    const base64ToSend = attachedBase64;

    // Reset input immediately for responsive feel
    setInputText('');
    setAttachedFile(null);
    setAttachedBase64(null);

    try {
      const messagePayload: any = {
        roomId: activeRoomId,
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || 'Người dùng',
        senderDevice: settings.deviceName,
        text: textToSend,
        createdAt: new Date().toISOString(),
      };

      if (fileToSend && base64ToSend) {
        messagePayload.fileName = fileToSend.name;
        messagePayload.fileSize = fileToSend.size;
        messagePayload.fileType = fileToSend.type || 'application/octet-stream';
        messagePayload.fileData = base64ToSend;
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

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const roomId = `room-${Date.now()}`;

    try {
      const roomPayload: ChatRoom = {
        id: roomId,
        name: newRoomName.trim(),
        code: randomCode,
        createdBy: currentUser.uid,
        createdByName: userProfile?.displayName || 'Người dùng',
        createdAt: new Date().toISOString(),
        description: newRoomDesc.trim() || 'Phòng kết nối riêng',
      };

      await setDoc(doc(db, 'rooms', roomId), roomPayload);
      setActiveRoomId(roomId);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
    } catch (err) {
      console.error('Create room error:', err);
    }
  };

  // Join room by 6-char code
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;

    const found = rooms.find(r => r.code.toUpperCase() === code);
    if (found) {
      setActiveRoomId(found.id);
      setJoinCodeInput('');
    } else {
      setJoinError('Không tìm thấy phòng với mã này.');
    }
  };

  const handleCopyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId) || rooms[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 h-[calc(100vh-5rem)] flex flex-col md:flex-row gap-6">
      {/* Left Sidebar: Room List & Actions */}
      <div className="w-full md:w-80 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessagesSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Phòng Chat</h3>
          </div>
          <button
            id="create-room-btn"
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo phòng
          </button>
        </div>

        {/* Quick Join by Code */}
        <div className="p-3 border-b border-slate-800/80 bg-slate-950/20">
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Mã phòng (VD: AB12CD)"
              className="flex-1 px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium shrink-0"
            >
              Vào
            </button>
          </form>
          {joinError && <p className="text-[11px] text-rose-400 mt-1">{joinError}</p>}
        </div>

        {/* Room List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {rooms.map((room) => {
            const isActive = room.id === activeRoomId;
            return (
              <button
                key={room.id}
                id={`room-item-${room.id}`}
                type="button"
                onClick={() => setActiveRoomId(room.id)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                  isActive
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs truncate">
                      {room.name}
                    </span>
                    {room.id === 'public-relay-lounge' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                        Chung
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {room.description || `Mã: ${room.code}`}
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                  {room.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden min-h-[500px]">
        {/* Room Header */}
        {activeRoom && (
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white truncate">
                  {activeRoom.name}
                </h2>
                <button
                  type="button"
                  onClick={() => handleCopyRoomCode(activeRoom.code)}
                  title="Sao chép mã phòng"
                  className="inline-flex items-center gap-1 text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 hover:bg-slate-700 transition-colors border border-slate-700"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  <span>{activeRoom.code}</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {activeRoom.description || 'Truyền tin nhắn & tệp tức thời qua máy chủ trung gian'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Relay Trực Tuyến
              </span>
            </div>
          </div>
        )}

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center">
                <MessagesSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-300">
                Chưa có tin nhắn nào trong phòng này.
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                Hãy là người đầu tiên gửi tin nhắn chào hoặc đính kèm tệp tin để chia sẻ nhé!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser?.uid;
              const isImage = msg.fileType?.startsWith('image/') && !!msg.fileData;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                >
                  {/* Sender Name & Device */}
                  <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {isMe ? 'Bạn' : msg.senderName}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 truncate max-w-[150px]">
                      {msg.senderDevice}
                    </span>
                    <span>•</span>
                    <span className="text-slate-500">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] sm:max-w-md rounded-2xl p-3.5 space-y-2 shadow-sm ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700/60'
                    }`}
                  >
                    {/* Attached File in Chat */}
                    {msg.fileData && (
                      <div className={`rounded-xl p-2.5 flex flex-col gap-2 ${isMe ? 'bg-emerald-700/60' : 'bg-slate-900/80 border border-slate-700/80'}`}>
                        {isImage && (
                          <img
                            src={msg.fileData}
                            alt={msg.fileName}
                            className="max-h-48 rounded-lg object-contain mx-auto"
                          />
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <FileText className="w-4 h-4 shrink-0 opacity-80" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">{msg.fileName}</p>
                              {msg.fileSize && (
                                <p className="text-[10px] opacity-75">{formatFileSize(msg.fileSize)}</p>
                              )}
                            </div>
                          </div>
                          <a
                            href={msg.fileData}
                            download={msg.fileName || 'file'}
                            className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
                            title="Tải tệp"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.text && (
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
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

        {/* File preview before sending */}
        {attachedFile && (
          <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate font-medium">{attachedFile.name}</span>
              <span className="text-slate-500 font-mono">({formatFileSize(attachedFile.size)})</span>
            </div>
            <button
              type="button"
              onClick={() => { setAttachedFile(null); setAttachedBase64(null); }}
              className="p-1 text-slate-400 hover:text-rose-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleSelectFile(e.target.files[0])}
              className="hidden"
            />
            
            {/* Attachment Button */}
            <button
              id="attach-file-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm tệp tin"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Text Input */}
            <input
              id="chat-message-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nhập tin nhắn để gửi qua phòng chat..."
              className="flex-1 px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />

            {/* Send Button */}
            <button
              id="send-message-btn"
              type="submit"
              disabled={!inputText.trim() && !attachedFile}
              className="p-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Tạo phòng chat mới</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tên phòng
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Ví dụ: Trao Đổi Dự Án, Phòng Bạn Thân..."
                  className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mô tả phòng (tùy chọn)
                </label>
                <input
                  type="text"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  placeholder="Ví dụ: Chia sẻ tài liệu và hình ảnh"
                  className="w-full px-3.5 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                >
                  Tạo phòng ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
