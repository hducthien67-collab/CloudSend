import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
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
  Globe
} from 'lucide-react';
import { AVATAR_COLORS } from '../utils/device';

interface RoomDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  currentUserUid: string;
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

  // Sync state whenever room or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setRoomName(room.name || '');
      setRoomDesc(room.description || '');
      setSelectedColor(room.avatarColor || '#10b981');
      setCustomAvatar(room.avatar || '');
      setSaveSuccess(false);
    }
  }, [isOpen, room.id, room.name, room.description, room.avatarColor, room.avatar]);

  // Dissolve / Leave state
  const [showDissolveModal, setShowDissolveModal] = useState(false);
  const [finalMessage, setFinalMessage] = useState('Cảm ơn mọi người đã cùng tham gia nhóm. Chúc các bạn luôn may mắn và thành công!');
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const isOwner = room.ownerId === currentUserUid || room.createdBy === currentUserUid;

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
  // Sort so owner is strictly first
  membersList.sort((a, b) => {
    if (a.role === 'owner') return -1;
    if (b.role === 'owner') return 1;
    return new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime();
  });

  // Handle uploading custom room avatar image
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setCustomAvatar(result);
    };
    reader.readAsDataURL(file);
  };

  // Save room info
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        name: roomName.trim(),
        description: roomDesc.trim(),
        avatar: customAvatar,
        avatarColor: selectedColor,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
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
    if (!isOwner) return;
    setIsDeleting(true);

    try {
      const nowIso = new Date().toISOString();
      const messageText = finalMessage.trim() || 'Phòng chat đã được Trưởng phòng giải tán.';

      // Send the parting notification to the Receive tab (transfers) of each member
      const notifyPromises = membersList.map(async (member) => {
        try {
          await addDoc(collection(db, 'transfers'), {
            senderId: currentUserUid,
            senderName: `[Trưởng phòng] ${currentUserName}`,
            senderDevice: currentDeviceName,
            receiverId: member.uid,
            receiverName: member.displayName,
            textContent: `📢 [THÔNG BÁO GIẢI TÁN PHÒNG: "${room.name}"]\n\n"${messageText}"\n\n— Trưởng phòng ${currentUserName} đã chính thức giải tán phòng chat vào lúc ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}.`,
            status: 'completed',
            createdAt: nowIso,
          });
        } catch (err) {
          console.warn('Failed to notify member:', member.uid, err);
        }
      });

      await Promise.all(notifyPromises);

      // Delete the room document from Firestore
      await deleteDoc(doc(db, 'rooms', room.id));

      setShowDissolveModal(false);
      onRoomDeleted();
      onClose();
    } catch (err) {
      console.error('Dissolve room error:', err);
      alert('Không thể giải tán phòng vào lúc này.');
    } finally {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 border border-white/10 overflow-hidden"
                style={{ backgroundColor: selectedColor }}
              >
                {customAvatar ? (
                  <img src={customAvatar} alt="Room" className="w-full h-full object-cover" />
                ) : (
                  room.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white truncate">{room.name}</h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    room.isPrivate !== false 
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {room.isPrivate !== false ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    {room.isPrivate !== false ? 'Riêng tư' : 'Cộng đồng'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    title="Sao chép ID / Mã phòng"
                  >
                    <span>ID: {room.code}</span>
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                  <span className="text-slate-500 text-xs">•</span>
                  <span className="text-xs text-slate-400">{membersList.length} thành viên</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/20 px-4 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              Cấu trúc phòng
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Thành viên ({membersList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gallery')}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'gallery'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Hình ảnh ({allImages.length})
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* TAB 1: Cấu trúc phòng & Ảnh đại diện */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveInfo} className="space-y-5">
                {/* 1. Ảnh đại diện nhóm */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    1. Ảnh đại diện phòng
                  </label>
                  <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-950/50 border border-slate-800">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-md shrink-0 border border-white/10 overflow-hidden relative group"
                      style={{ backgroundColor: selectedColor }}
                    >
                      {customAvatar ? (
                        <img src={customAvatar} alt="Room" className="w-full h-full object-cover" />
                      ) : room.id === 'public-relay-lounge' ? (
                        <Globe className="w-8 h-8 text-emerald-200" />
                      ) : (
                        roomName.charAt(0).toUpperCase() || 'R'
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 flex items-center gap-1.5 transition-colors">
                          <Camera className="w-3.5 h-3.5" />
                          Tải ảnh mới
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleAvatarUpload} 
                            className="hidden" 
                          />
                        </label>
                        {customAvatar && (
                          <button
                            type="button"
                            onClick={() => setCustomAvatar('')}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                          >
                            Xóa ảnh tùy chỉnh
                          </button>
                        )}
                      </div>

                      {/* Color Palette */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 mr-1">Màu nền:</span>
                        {AVATAR_COLORS.map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setSelectedColor(col)}
                            className={`w-6 h-6 rounded-full transition-transform ${
                              selectedColor === col ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Tên của nhóm */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    2. Tên của nhóm
                  </label>
                  <input
                    type="text"
                    required
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Nhập tên phòng..."
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Mô tả phòng */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Mô tả phòng
                  </label>
                  <input
                    type="text"
                    value={roomDesc}
                    onChange={(e) => setRoomDesc(e.target.value)}
                    placeholder="Mô tả mục đích nhóm chat..."
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Save button */}
                <div className="flex items-center justify-between pt-2">
                  {saveSuccess && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-4 h-4" /> Đã lưu thay đổi thành công!
                    </span>
                  )}
                  <div className="ml-auto">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-colors"
                    >
                      {isSaving ? 'Đang lưu...' : 'Lưu cấu trúc phòng'}
                    </button>
                  </div>
                </div>

                {/* 5. Xóa nhóm và Rời nhóm */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    5. Tùy chọn rời & giải tán phòng
                  </label>

                  {isOwner ? (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                          <Trash2 className="w-4 h-4 text-rose-400" />
                          Giải tán & Xóa nhóm
                        </h4>
                        <p className="text-xs text-rose-400/80 mt-0.5">
                          Bạn là Trưởng phòng. Bạn có thể gửi lời nhắn cuối cùng tới tất cả thành viên khi giải tán nhóm.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDissolveModal(true)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shrink-0 shadow-md shadow-rose-600/20 transition-colors"
                      >
                        Xóa nhóm
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                          <LogOut className="w-4 h-4 text-slate-400" />
                          Rời khỏi nhóm
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Bạn sẽ rời khỏi phòng này và có thể tham gia lại bằng mã phòng.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLeaveRoom}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs shrink-0 border border-slate-700 transition-colors"
                      >
                        Rời nhóm
                      </button>
                    </div>
                  )}
                </div>
              </form>
            )}

            {/* TAB 2: Thành viên - Owner luôn ở đầu */}
            {activeTab === 'members' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    3. Danh sách thành viên ({membersList.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Trưởng phòng luôn đứng đầu danh sách
                  </span>
                </div>

                <div className="space-y-2">
                  {membersList.map((m, idx) => {
                    const isRoomOwner = m.role === 'owner' || m.uid === room.ownerId || m.uid === room.createdBy;
                    const isSelf = m.uid === currentUserUid;

                    return (
                      <div
                        key={m.uid || idx}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isRoomOwner
                            ? 'bg-amber-500/10 border-amber-500/30 text-white'
                            : 'bg-slate-950/50 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 border border-white/10"
                            style={{ backgroundColor: m.avatarColor || '#3b82f6' }}
                          >
                            {m.displayName ? m.displayName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate text-white">
                                {m.displayName}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                  Bạn
                                </span>
                              )}
                              {isRoomOwner && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <Crown className="w-3 h-3 text-amber-400" />
                                  Trưởng phòng
                                </span>
                              )}
                              {!isRoomOwner && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                  Thành viên
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              Thiết bị: {m.deviceName || 'Trực tuyến'}
                            </p>
                          </div>
                        </div>

                        {isRoomOwner && (
                          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                            <ShieldCheck className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Thư viện hình ảnh đã gửi trong nhóm */}
            {activeTab === 'gallery' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    4. Hình ảnh đã chia sẻ trong nhóm ({allImages.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Kho lưu trữ ảnh của phòng
                  </span>
                </div>

                {allImages.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-slate-950/40 border border-slate-800 space-y-2">
                    <ImageIcon className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-400">Chưa có hình ảnh nào được gửi trong nhóm</p>
                    <p className="text-xs text-slate-500">Các ảnh bạn và thành viên gửi vào chat sẽ tự động lưu vào đây.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {allImages.map((img, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden bg-black/50 border border-slate-800 aspect-square shadow-sm">
                        <img 
                          src={img.url} 
                          alt={img.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                          onClick={() => window.open(img.url, '_blank')}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[11px] text-white truncate max-w-[90px]">{img.sender}</span>
                          <a
                            href={img.url}
                            download={img.name}
                            className="p-1 rounded bg-black/60 hover:bg-emerald-600 text-white transition-colors"
                            title="Tải ảnh về"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
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

      {/* Modal Lời nhắn cuối cùng khi giải tán nhóm (Owner Dissolve Prompt) */}
      {showDissolveModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Lời nhắn cuối cùng khi giải tán nhóm</h3>
                <p className="text-xs text-rose-300">
                  Lời nhắn này sẽ được chuyển vào mục "Nhận" của tất cả thành viên trong nhóm!
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Nội dung lời nhắn thông báo:
              </label>
              <textarea
                rows={4}
                value={finalMessage}
                onChange={(e) => setFinalMessage(e.target.value)}
                placeholder="Nhập lời chào tạm biệt hoặc lý do giải tán nhóm..."
                className="w-full p-3.5 bg-slate-950/80 border border-slate-700 rounded-2xl text-sm text-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              <p className="text-[11px] text-slate-400">
                Sau khi bấm xác nhận, phòng chat sẽ được xóa vĩnh viễn và các thành viên sẽ nhận được thông báo kèm lời nhắn này trong thẻ Nhận của họ.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDissolveModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDissolveRoom}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 flex items-center gap-2 transition-all active:scale-95"
              >
                {isDeleting ? 'Đang giải tán...' : 'Gửi lời nhắn & Giải tán nhóm'}
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
