import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { doc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { ChatRoom, ChatMessage, RoomMember } from '../types';
import { 
  X, 
  Users, 
  Image as ImageIcon, 
  Crown, 
  LogOut, 
  Trash2, 
  Edit3, 
  Camera, 
  Download, 
  AlertTriangle, 
  Check, 
  Copy, 
  ShieldCheck,
  Send,
  Lock,
  Globe,
  Eye,
  Info,
  Zap,
  Server,
  Shield
} from 'lucide-react';
import { AVATAR_COLORS } from '../utils/device';
import { isDevUser } from '../utils/devModeration';
import { ZoomableImageViewerModal } from './ZoomableImageViewerModal';
import { ResetServerModal } from './ResetServerModal';
import { cleanFirestoreObject } from '../utils/firestoreClean';

interface RoomDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  currentUserUid: string;
  currentUserEmail?: string;
  currentUserName: string;
  currentDeviceName: string;
  messages: ChatMessage[];
  onRoomDeleted: () => void;
  onRoomLeft: () => void;
}

export const RoomDetailsModal: React.FC<RoomDetailsModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUserUid,
  currentUserEmail,
  currentUserName,
  currentDeviceName,
  messages,
  onRoomDeleted,
  onRoomLeft,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'gallery'>('info');

  // Edit room state
  const [roomName, setRoomName] = useState(room.name);
  const [roomDesc, setRoomDesc] = useState(room.description || '');
  const [selectedColor, setSelectedColor] = useState(room.avatarColor || '#10b981');
  const [customAvatar, setCustomAvatar] = useState(room.avatar || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarSaveSuccess, setAvatarSaveSuccess] = useState(false);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state whenever room or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setRoomName(room.name || '');
      setRoomDesc(room.description || '');
      setSelectedColor(room.avatarColor || '#10b981');
      setCustomAvatar(room.avatar || '');
      setSaveSuccess(false);
      setAvatarSaveSuccess(false);
    }
  }, [isOpen, room.id, room.name, room.description, room.avatarColor, room.avatar]);

  // Dissolve / Leave state
  const isDissolvingRef = useRef(false);
  const [showDissolveModal, setShowDissolveModal] = useState(false);
  const [showResetServerModal, setShowResetServerModal] = useState(false);
  const [finalMessage, setFinalMessage] = useState('Cảm ơn mọi người đã cùng tham gia nhóm. Chúc các bạn luôn may mắn và thành công!');
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [viewingZoomImage, setViewingZoomImage] = useState<{ url: string; name?: string } | null>(null);

  const handleCloseModal = () => {
    setRoomName(room.name || '');
    setRoomDesc(room.description || '');
    setSelectedColor(room.avatarColor || '#10b981');
    setCustomAvatar(room.avatar || '');
    setSaveSuccess(false);
    setAvatarSaveSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  // Quyền kiểm soát phòng: Chỉ đúng Trưởng phòng (Owner ID / Creator UID) hoặc DEV mới được đổi ảnh, màu sắc và chỉnh sửa phòng
  const isOwner = Boolean(
    currentUserUid && (
      (room.ownerId && room.ownerId === currentUserUid) ||
      (room.createdBy && room.createdBy === currentUserUid) ||
      (room.members || []).some(m => m.uid === currentUserUid && m.role === 'owner')
    )
  );
  const isDev = isDevUser(currentUserEmail);
  const canEditRoom = (isOwner || isDev) && room.id !== 'public-relay-lounge';
  const hasUnsavedChanges = canEditRoom && (
    roomName !== (room.name || '') ||
    roomDesc !== (room.description || '') ||
    selectedColor !== (room.avatarColor || '#10b981') ||
    customAvatar !== (room.avatar || '')
  );

  // Extract all images ever sent in this room from messages
  const allImages: { url: string; name: string; sender: string; time: string }[] = [];
  messages.forEach((msg) => {
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach((att) => {
        if (att.type.startsWith('image/')) {
          allImages.push({
            url: att.data,
            name: att.name,
            sender: msg.senderName,
            time: msg.createdAt,
          });
        }
      });
    } else if (msg.fileData && (msg.fileType?.startsWith('image/') || msg.fileName?.match(/\.(jpg|jpeg|png|webp|gif)$/i))) {
      allImages.push({
        url: msg.fileData,
        name: msg.fileName || 'Ảnh',
        sender: msg.senderName,
        time: msg.createdAt,
      });
    }
  });

  // Ensure members list has owner first
  const membersList: RoomMember[] = [...(room.members || [])];
  membersList.sort((a, b) => {
    if (a.role === 'owner') return -1;
    if (b.role === 'owner') return 1;
    return new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime();
  });

  // Nén ảnh gọn nhẹ (dưới 100KB) để Firestore lưu trữ an toàn tuyệt đối không bị lỗi vượt kích thước
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const raw = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(raw);
        img.src = raw;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Tải ảnh đại diện và lưu vào bộ nhớ tạm (chỉ lưu Firestore khi nhấn 'Lưu cấu trúc phòng')
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditRoom) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP, GIF).');
      return;
    }

    try {
      const compressedDataUrl = await compressImage(file);
      setCustomAvatar(compressedDataUrl);
      setAvatarSaveSuccess(true);
      setTimeout(() => setAvatarSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Update avatar error:', err);
      alert('Có lỗi khi xử lý ảnh đại diện nhóm.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // Đổi màu sắc nhóm vào bộ nhớ tạm (chỉ lưu Firestore khi nhấn 'Lưu cấu trúc phòng')
  const handleColorChange = (color: string) => {
    if (!canEditRoom) return;
    setSelectedColor(color);
    setAvatarSaveSuccess(true);
    setTimeout(() => setAvatarSaveSuccess(false), 2000);
  };

  // Xóa ảnh đại diện tùy chỉnh (quay về chữ cái hoặc icon)
  const handleRemoveAvatar = () => {
    if (!canEditRoom) return;
    setCustomAvatar('');
    setAvatarSaveSuccess(true);
    setTimeout(() => setAvatarSaveSuccess(false), 2000);
  };

  // Save room info (name, desc, avatar, color)
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'rooms', room.id), {
        name: roomName.trim(),
        description: roomDesc.trim(),
        avatar: customAvatar,
        avatarColor: selectedColor,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Update room error:', err);
      alert('Có lỗi xảy ra khi cập nhật thông tin phòng.');
    } finally {
      setIsSaving(false);
    }
  };

  // Member leaves the room
  const handleLeaveRoom = async () => {
    if (!confirm(`Bạn có chắc chắn muốn rời khỏi phòng "${room.name}"?`)) return;

    try {
      const updatedMembers = (room.members || []).filter((m) => m.uid !== currentUserUid);
      await updateDoc(doc(db, 'rooms', room.id), {
        members: updatedMembers,
      });
      onRoomLeft();
      onClose();
    } catch (err) {
      console.error('Leave room error:', err);
      alert('Không thể rời phòng vào lúc này.');
    }
  };

  // Owner dissolves the room with final parting message sent to all members' Receive tabs
  const handleDissolveRoom = async () => {
    if (!isOwner || isDissolvingRef.current) return;
    isDissolvingRef.current = true;
    setIsDeleting(true);

    try {
      const nowIso = new Date().toISOString();
      const messageText = finalMessage.trim() || 'Phòng chat đã được Trưởng phòng giải tán.';

      // Send the parting notification to the Receive tab (transfers) of each UNIQUE member (excluding the owner)
      const seenUids = new Set<string>();
      const recipients = membersList.filter((member) => {
        if (!member.uid || member.uid === currentUserUid) return false;
        if (seenUids.has(member.uid)) return false;
        seenUids.add(member.uid);
        return true;
      });

      const notifyPromises = recipients.map(async (member) => {
        try {
          const notifId = `dissolve_${room.id}_${member.uid}`;
          await setDoc(doc(db, 'transfers', notifId), cleanFirestoreObject({
            id: notifId,
            senderId: currentUserUid,
            senderName: `[Trưởng phòng] ${currentUserName}`,
            senderDevice: currentDeviceName,
            receiverId: member.uid,
            receiverName: member.displayName || 'Thành viên',
            textContent: `📢 [THÔNG BÁO GIẢI TÁN PHÒNG: "${room.name}"]\n\n"${messageText}"\n\n— Trưởng phòng ${currentUserName} đã chính thức giải tán phòng chat vào lúc ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}.`,
            status: 'completed',
            createdAt: nowIso,
          }), { merge: true });
        } catch (err) {
          console.warn('Failed to notify member:', member.uid, err);
        }
      });

      await Promise.all(notifyPromises);

      // Delete the room document from Firestore
      await deleteDoc(doc(db, 'rooms', room.id));

      setShowDissolveModal(false);
      onRoomDeleted();
      handleCloseModal();
    } catch (err) {
      console.error('Dissolve room error:', err);
      alert('Không thể giải tán phòng vào lúc này.');
    } finally {
      isDissolvingRef.current = false;
      setIsDeleting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800/90 flex items-center justify-between bg-slate-950/60">
            {/* Hidden File Input for Instant Avatar Upload */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleAvatarUpload} 
              className="hidden" 
            />

            <div className="flex items-center gap-2.5 min-w-0">
              {/* Header Avatar: Only owner/DEV can click to change */}
              <div 
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 border border-white/10 overflow-hidden relative group ${
                  canEditRoom ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{ backgroundColor: selectedColor }}
                onClick={() => {
                  if (canEditRoom) fileInputRef.current?.click();
                }}
                title={canEditRoom ? "Bấm để đổi ảnh đại diện nhóm (Chỉ Trưởng phòng)" : "Ảnh đại diện nhóm"}
              >
                {customAvatar ? (
                  <img src={customAvatar} alt="Room" className="w-full h-full object-cover" />
                ) : room.id === 'public-relay-lounge' ? (
                  <Globe className="w-5 h-5 text-emerald-200" />
                ) : (
                  (roomName || room.name || 'R').charAt(0).toUpperCase()
                )}
                {/* Camera Hover Overlay (Only visible to Owner/DEV) */}
                {canEditRoom && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white">
                    <Camera className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="text-[7.5px] font-bold">Đổi ảnh</span>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[150px] sm:max-w-[200px]">{roomName || room.name}</h3>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full flex items-center gap-0.5 shrink-0 ${
                    room.isPrivate !== false 
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {room.isPrivate !== false ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                    {room.isPrivate !== false ? 'Riêng tư' : 'Cộng đồng'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px]">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 shrink-0"
                    title="Sao chép ID / Mã phòng"
                  >
                    <span className="copyable-text select-text cursor-text" data-copyable="true">ID: {room.code}</span>
                    {copiedCode ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 text-slate-400" />}
                  </button>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400 shrink-0">{membersList.length} thành viên</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseModal}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 px-2 pt-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Cấu trúc & Ảnh nhóm</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Thành viên ({membersList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`flex-1 py-1.5 text-xs font-semibold flex items-center justify-center gap-1 border-b-2 transition-colors ${
                activeTab === 'gallery'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Hình ảnh ({allImages.length})</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-3 sm:p-3.5 space-y-3">
            {/* TAB 1: Cấu trúc phòng & Ảnh đại diện */}
            {activeTab === 'info' && (
              <div className="space-y-3">
                {!canEditRoom ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                      <div 
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0 border border-white/10 overflow-hidden"
                        style={{ backgroundColor: selectedColor }}
                      >
                        {customAvatar ? (
                          <img src={customAvatar} alt="Room" className="w-full h-full object-cover" />
                        ) : room.id === 'public-relay-lounge' ? (
                          <Globe className="w-6 h-6 text-emerald-200" />
                        ) : (
                          (roomName || room.name || 'R').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-white truncate">{room.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {room.description || 'Chưa có mô tả cho nhóm chat này.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Chỉ <strong>Trưởng phòng</strong> mới có quyền chỉnh sửa tên, ảnh đại diện và màu sắc nhóm.</span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveInfo} className="space-y-3">
                    {/* 1. Ảnh đại diện nhóm & Đổi ảnh trực tiếp */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                          1. Ảnh đại diện phòng chat
                        </label>
                        {avatarSaveSuccess && (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
                            <Check className="w-3 h-3" /> Đã chọn ảnh! Nhấn 'Lưu' bên dưới để áp dụng
                          </span>
                        )}
                      </div>

                      <div 
                        className={`flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border transition-all ${
                          isDraggingAvatar ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-950/30' : 'border-slate-800'
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingAvatar(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingAvatar(false);
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDraggingAvatar(false);
                          const files = e.dataTransfer.files;
                          if (files && files.length > 0 && files[0].type.startsWith('image/')) {
                            try {
                              const compressedDataUrl = await compressImage(files[0]);
                              setCustomAvatar(compressedDataUrl);
                              setAvatarSaveSuccess(true);
                              setTimeout(() => setAvatarSaveSuccess(false), 2500);
                            } catch (err) {
                              console.error('Error drop avatar:', err);
                            }
                          }
                        }}
                      >
                        {/* Large Avatar preview with click-to-zoom or click-to-change */}
                        <div 
                          className="w-13 h-13 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 border border-white/10 overflow-hidden relative group cursor-pointer"
                          style={{ backgroundColor: selectedColor }}
                          onClick={() => {
                            if (customAvatar) {
                              setViewingZoomImage({ url: customAvatar, name: `Ảnh đại diện phòng ${roomName}` });
                            } else {
                              fileInputRef.current?.click();
                            }
                          }}
                          title={customAvatar ? 'Bấm để phóng to xem ảnh' : 'Bấm để tải ảnh lên'}
                        >
                          {customAvatar ? (
                            <img src={customAvatar} alt="Room" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : room.id === 'public-relay-lounge' ? (
                            <Globe className="w-6 h-6 text-emerald-200" />
                          ) : (
                            (roomName || room.name || 'R').charAt(0).toUpperCase()
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-4 h-4 text-white" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition-colors cursor-pointer active:scale-95 shadow-xs"
                            >
                              <Camera className="w-3 h-3 text-emerald-400" />
                              <span>{customAvatar ? 'Đổi ảnh khác' : 'Tải ảnh lên'}</span>
                            </button>
                            {customAvatar && (
                              <button
                                type="button"
                                onClick={handleRemoveAvatar}
                                className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                Xóa ảnh
                              </button>
                            )}
                          </div>

                          {/* Color Palette */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] text-slate-400 mr-0.5">Màu nền:</span>
                            {AVATAR_COLORS.map((col) => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => handleColorChange(col)}
                                className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                                  selectedColor === col ? 'scale-110 ring-2 ring-white' : 'hover:scale-105 opacity-80 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: col }}
                                title={`Chọn màu ${col}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        💡 Mẹo: Bạn có thể kéo thả ảnh trực tiếp vào ô trên. Sau khi chọn ảnh, nhấn "Lưu cấu trúc phòng" để cập nhật.
                      </p>
                    </div>

                    {/* 2. Tên của nhóm */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        2. Tên của nhóm
                      </label>
                      <input
                        type="text"
                        required
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        placeholder="Nhập tên phòng..."
                        className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    {/* 3. Mô tả phòng */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        3. Mô tả phòng
                      </label>
                      <input
                        type="text"
                        value={roomDesc}
                        onChange={(e) => setRoomDesc(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        placeholder="Mô tả mục đích nhóm chat..."
                        className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    {/* Save button */}
                    <div className="flex items-center justify-between pt-1">
                      {saveSuccess ? (
                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Đã lưu cấu trúc phòng thành công!
                        </span>
                      ) : hasUnsavedChanges ? (
                        <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                          ⚠️ Có thay đổi chưa lưu
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="ml-auto">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className={`px-4 py-1.5 rounded-lg text-white font-semibold text-xs shadow-md transition-all cursor-pointer ${
                            hasUnsavedChanges
                              ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-400/50 shadow-emerald-600/30 font-bold'
                              : 'bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50'
                          }`}
                        >
                          {isSaving ? 'Đang lưu...' : hasUnsavedChanges ? '💾 Lưu cấu trúc phòng' : 'Lưu cấu trúc phòng'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Hành động rời phòng hoặc giải tán phòng */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  {room.id === 'public-relay-lounge' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Đại Sảnh Toàn Cầu là phòng hệ thống mặc định, được bảo vệ vĩnh viễn và không thể xóa.</span>
                    </div>
                  ) : isOwner || isDev ? (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          Giải tán & Xóa nhóm
                        </h4>
                        <p className="text-[10px] text-rose-400/80 mt-0.5 leading-snug">
                          Trưởng phòng gửi lời nhắn cuối cùng tới các thành viên khi giải tán.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDissolveModal(true)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shrink-0 shadow-md transition-colors cursor-pointer"
                      >
                        Xóa nhóm
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1">
                          <LogOut className="w-3.5 h-3.5 text-slate-400" />
                          Rời khỏi nhóm
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          Bạn sẽ rời khỏi phòng này và có thể tham gia lại bằng mã phòng.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLeaveRoom}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs shrink-0 border border-slate-700 transition-colors cursor-pointer"
                      >
                        Rời nhóm
                      </button>
                    </div>
                  )}

                  {/* Đặc quyền DEV: Quản trị & Reset máy chủ */}
                  {isDevUser(currentUserEmail) && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-slate-950 to-rose-950/40 border border-amber-500/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <h4 className="text-xs font-bold text-white">Reset Máy Chủ (Đặc quyền DEV)</h4>
                        </div>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                          DEV
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 leading-snug">
                        Xóa toàn bộ tin nhắn hoặc tự động dọn dẹp các tin nhắn cũ hơn 1 tuần (7 ngày) để chống máy chủ bị lag.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowResetServerModal(true)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Mở Bảng Điều Khiển Reset Máy Chủ</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Thành viên - Owner luôn ở đầu */}
            {activeTab === 'members' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Danh sách thành viên ({membersList.length})
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    Trưởng phòng đứng đầu
                  </span>
                </div>

                <div className="space-y-1.5">
                  {membersList.map((m, idx) => {
                    const isSelf = m.uid === currentUserUid;
                    const isMemberDev = m.isDev || isDevUser(m.email) || (isSelf && isDevUser(currentUserEmail)) || (m.displayName && m.displayName.includes('DEV'));
                    const isRoomOwner = m.role === 'owner' || m.uid === room.ownerId || m.uid === room.createdBy;

                    return (
                      <div
                        key={m.uid || idx}
                        className={`p-2 sm:p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isMemberDev
                            ? 'bg-gradient-to-r from-emerald-950/60 via-slate-900 to-amber-950/40 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                            : isRoomOwner
                            ? 'bg-amber-500/10 border-amber-500/30 text-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div 
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 border relative ${
                              isMemberDev ? 'border-amber-400 shadow-sm ring-1 ring-amber-400/40 bg-emerald-900' : 'border-white/10'
                            }`}
                            style={isMemberDev ? undefined : { backgroundColor: m.avatarColor || '#3b82f6' }}
                          >
                            {isMemberDev ? (
                              <Crown className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                            ) : (
                              m.displayName ? m.displayName.charAt(0).toUpperCase() : 'U'
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-semibold text-xs truncate max-w-[120px] sm:max-w-[180px] ${
                                isMemberDev 
                                  ? 'font-extrabold bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent' 
                                  : 'text-white'
                              }`}>
                                {m.displayName}
                              </span>
                              {isSelf && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                  Bạn
                                </span>
                              )}
                              {isMemberDev && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm">
                                  <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                                  DEV
                                </span>
                              )}
                              {isRoomOwner && !isMemberDev && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <Crown className="w-2.5 h-2.5 text-amber-400" />
                                  Trưởng phòng
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              {isMemberDev ? 'Quản trị viên tối cao' : `Thiết bị: ${m.deviceName || 'Trực tuyến'}`}
                            </p>
                          </div>
                        </div>

                        {isMemberDev ? (
                          <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0" title="DEV chính chủ">
                            <Crown className="w-3.5 h-3.5 fill-amber-400" />
                          </div>
                        ) : isRoomOwner ? (
                          <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Thư viện hình ảnh đã gửi trong nhóm */}
            {activeTab === 'gallery' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Hình ảnh trong nhóm ({allImages.length})
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    Kho ảnh
                  </span>
                </div>

                {allImages.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-slate-800 space-y-1.5">
                    <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-400">Chưa có hình ảnh nào</p>
                    <p className="text-[10.5px] text-slate-500">Ảnh gửi trong phòng sẽ lưu tự động ở đây.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {allImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden bg-black/50 border border-slate-800 aspect-square shadow-sm">
                        <img 
                          src={img.url} 
                          alt={img.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                          onClick={() => setViewingZoomImage({ url: img.url, name: img.name })}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] text-white truncate max-w-[60px]">{img.sender}</span>
                          <button
                            type="button"
                            onClick={() => setViewingZoomImage({ url: img.url, name: img.name })}
                            className="p-0.5 rounded bg-black/60 hover:bg-emerald-600 text-white transition-colors cursor-pointer"
                            title="Xem phóng to ảnh"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In-App Image Zoom Modal */}
      {/* Reset Server Modal for DEV */}
      <ResetServerModal
        isOpen={showResetServerModal}
        onClose={() => setShowResetServerModal(false)}
        roomId={room.id}
        roomName={room.name}
        totalMessagesCount={messages.length}
        isAutoWeeklyEnabled={Boolean(room.autoWeeklyReset)}
      />

      {viewingZoomImage && (
        <ZoomableImageViewerModal
          isOpen={Boolean(viewingZoomImage)}
          onClose={() => setViewingZoomImage(null)}
          imageUrl={viewingZoomImage.url}
          imageName={viewingZoomImage.name || 'Hình ảnh'}
        />
      )}

      {/* Modal Lời nhắn cuối cùng khi giải tán nhóm (Owner Dissolve Prompt) */}
      {showDissolveModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-4 w-full max-w-sm shadow-2xl space-y-3">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-white">Giải tán nhóm</h3>
                <p className="text-[10px] text-rose-300">
                  Lời nhắn sẽ được gửi tới tất cả thành viên trong phòng!
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300">
                Nội dung lời nhắn thông báo:
              </label>
              <textarea
                rows={3}
                value={finalMessage}
                onChange={(e) => setFinalMessage(e.target.value)}
                placeholder="Nhập lời chào tạm biệt hoặc lý do giải tán nhóm..."
                className="w-full p-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              <p className="text-[10px] text-slate-400 leading-snug">
                Phòng chat sẽ được xóa vĩnh viễn và các thành viên sẽ nhận được thông báo này.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDissolveModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDissolveRoom}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition-all active:scale-95"
              >
                {isDeleting ? 'Đang xóa...' : 'Giải tán nhóm'}
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
