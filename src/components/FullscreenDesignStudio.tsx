import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Download, 
  Check, 
  Palette, 
  Wand2, 
  Upload, 
  Image as ImageIcon, 
  RotateCcw, 
  Trash2, 
  Type, 
  Sparkles, 
  Square, 
  Circle, 
  Smile, 
  Layers, 
  Sliders, 
  Maximize2, 
  Eye, 
  User, 
  Camera, 
  Flame, 
  Crown, 
  Shield, 
  Zap, 
  Star,
  Paintbrush,
  Eraser,
  Undo2,
  RefreshCw,
  Plus
} from 'lucide-react';
import { UserDevice, AppSettings, AppUser } from '../types';

interface FullscreenDesignStudioProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  userProfile: UserDevice | null;
  settings: AppSettings;
  onSaveDesign: (updatedSettings: Partial<AppSettings>) => Promise<void>;
}

// Preset Themes for quick application
const DESIGN_TEMPLATES = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    tag: 'Tương lai',
    bgGradient: 'from-cyan-950 via-slate-900 to-purple-950',
    borderColor: '#06B6D4',
    accentColor: '#06B6D4',
    avatarColor: '#06B6D4',
    badgeText: 'Cyberpunk Runner',
    bio: '⚡ Kết nối mạng lượng tử tốc độ ánh sáng.',
    cardStyle: 'glow' as const,
  },
  {
    id: 'emerald',
    name: 'Emerald Luxury',
    tag: 'Quý phái',
    bgGradient: 'from-emerald-950 via-slate-900 to-teal-950',
    borderColor: '#10B981',
    accentColor: '#10B981',
    avatarColor: '#10B981',
    badgeText: 'Emerald Master',
    bio: '🛡️ Truyền nhận dữ liệu an toàn tuyệt đối.',
    cardStyle: 'glow' as const,
  },
  {
    id: 'royal_purple',
    name: 'Royal Amethyst',
    tag: 'Hoàng gia',
    bgGradient: 'from-purple-950 via-slate-900 to-pink-950',
    borderColor: '#8B5CF6',
    accentColor: '#8B5CF6',
    avatarColor: '#8B5CF6',
    badgeText: 'VIP Supreme',
    bio: '👑 Tinh hoa công nghệ truyền tải thế hệ mới.',
    cardStyle: 'glass' as const,
  },
  {
    id: 'sunset_gold',
    name: 'Sunset Amber',
    tag: 'Hoàng hôn',
    bgGradient: 'from-amber-950 via-slate-900 to-rose-950',
    borderColor: '#F59E0B',
    accentColor: '#F59E0B',
    avatarColor: '#F59E0B',
    badgeText: 'Sunset Pioneer',
    bio: '🌅 Tốc độ không giới hạn mọi khoảng cách.',
    cardStyle: 'glow' as const,
  },
  {
    id: 'sakura',
    name: 'Sakura Blossom',
    tag: 'Nhẹ nhàng',
    bgGradient: 'from-pink-950 via-slate-900 to-rose-950',
    borderColor: '#EC4899',
    accentColor: '#EC4899',
    avatarColor: '#EC4899',
    badgeText: 'Sakura Spirit',
    bio: '🌸 Tinh tế trong từng gói dữ liệu truyền đi.',
    cardStyle: 'glass' as const,
  },
  {
    id: 'dark_oled',
    name: 'Midnight OLED',
    tag: 'Huyền bí',
    bgGradient: 'from-black via-slate-950 to-zinc-950',
    borderColor: '#475569',
    accentColor: '#94A3B8',
    avatarColor: '#64748B',
    badgeText: 'Stealth Operator',
    bio: '🕶️ Chế độ ẩn danh tốc độ cao trong bóng tối.',
    cardStyle: 'solid' as const,
  },
  {
    id: 'galaxy',
    name: 'Galaxy Cosmic',
    tag: 'Vũ trụ',
    bgGradient: 'from-indigo-950 via-purple-950 to-slate-950',
    borderColor: '#6366F1',
    accentColor: '#818CF8',
    avatarColor: '#6366F1',
    badgeText: 'Cosmic Voyager',
    bio: '🌌 Vươn tới các vì sao với CloudSend Relay.',
    cardStyle: 'glow' as const,
  },
  {
    id: 'golden_prestige',
    name: 'Golden Prestige',
    tag: 'Đẳng cấp',
    bgGradient: 'from-yellow-950 via-slate-900 to-amber-950',
    borderColor: '#EAB308',
    accentColor: '#FACC15',
    avatarColor: '#EAB308',
    badgeText: 'Gold Vanguard',
    bio: '💎 Đẳng cấp chất lượng truyền file hàng đầu.',
    cardStyle: 'glow' as const,
  },
];

const STICKER_LIST = ['⚡', '👑', '🛡️', '💎', '🔥', '🚀', '🌟', '💻', '🎧', '🎮', '🌸', '✨', '🛸', '🎯', '🍀', '🛰️'];

type ToolMode = 'brush' | 'glow_brush' | 'eraser' | 'text' | 'rect' | 'circle' | 'star' | 'sticker';

export const FullscreenDesignStudio: React.FC<FullscreenDesignStudioProps> = ({
  isOpen,
  onClose,
  currentUser,
  userProfile,
  settings,
  onSaveDesign,
}) => {
  // Canvas references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Design state
  const [themeStyle, setThemeStyle] = useState<string>(settings.themeStyle || 'emerald');
  const [avatarColor, setAvatarColor] = useState<string>(settings.avatarColor || '#10B981');
  const [customBadgeText, setCustomBadgeText] = useState<string>(settings.customBadgeText || 'Thành viên CloudSend');
  const [customBio, setCustomBio] = useState<string>(settings.customBio || 'Sẵn sàng truyền nhận dữ liệu tốc độ cao.');
  const [cardStyle, setCardStyle] = useState<'glass' | 'glow' | 'minimal' | 'solid'>(settings.cardStyle || 'glow');
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | undefined>(settings.customAvatarUrl);

  // Drawing Tools State
  const [currentTool, setCurrentTool] = useState<ToolMode>('brush');
  const [brushColor, setBrushColor] = useState<string>(settings.avatarColor || '#10B981');
  const [brushSize, setBrushSize] = useState<number>(8);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  // UI Panels
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);
  const [showAvatarModal, setShowAvatarModal] = useState<boolean>(false);
  const [showStickerPicker, setShowStickerPicker] = useState<boolean>(false);
  const [textInputVal, setTextInputVal] = useState<string>('CloudSend VIP');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Initialize Canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high-res canvas dimensions
    canvas.width = 1000;
    canvas.height = 600;

    // Draw initial background gradient
    drawCanvasBackground(ctx, themeStyle);

    // Save initial history
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
    setHistoryStep(0);
  }, [isOpen]);

  const drawCanvasBackground = (ctx: CanvasRenderingContext2D, themeId: string) => {
    const canvas = ctx.canvas;
    const foundTheme = DESIGN_TEMPLATES.find(t => t.id === themeId) || DESIGN_TEMPLATES[1];

    ctx.save();
    // Dark deep tech gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (foundTheme.id === 'cyberpunk') {
      grad.addColorStop(0, '#082f49');
      grad.addColorStop(0.5, '#020617');
      grad.addColorStop(1, '#3b0764');
    } else if (foundTheme.id === 'emerald') {
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(0.5, '#020617');
      grad.addColorStop(1, '#134e4a');
    } else if (foundTheme.id === 'royal_purple') {
      grad.addColorStop(0, '#2e1065');
      grad.addColorStop(0.5, '#020617');
      grad.addColorStop(1, '#581c87');
    } else if (foundTheme.id === 'sunset_gold') {
      grad.addColorStop(0, '#451a03');
      grad.addColorStop(0.5, '#020617');
      grad.addColorStop(1, '#701a75');
    } else {
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.5, '#020617');
      grad.addColorStop(1, '#0f172a');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Outer glow neon border
    ctx.strokeStyle = foundTheme.borderColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = foundTheme.borderColor;
    ctx.shadowBlur = 15;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.restore();
  };

  const saveHistoryState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(data);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const prevStep = historyStep - 1;
      ctx.putImageData(history[prevStep], 0, 0);
      setHistoryStep(prevStep);
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawCanvasBackground(ctx, themeStyle);
    saveHistoryState();
  };

  // Drawing mouse handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    setIsDrawing(true);

    if (currentTool === 'text') {
      ctx.save();
      ctx.font = `bold ${brushSize * 3}px 'Segoe UI', Roboto, sans-serif`;
      ctx.fillStyle = brushColor;
      ctx.shadowColor = brushColor;
      ctx.shadowBlur = 12;
      ctx.fillText(textInputVal || 'CloudSend', x, y);
      ctx.restore();
      saveHistoryState();
      setIsDrawing(false);
      return;
    }

    if (currentTool === 'sticker') {
      ctx.save();
      ctx.font = `${brushSize * 4}px 'Segoe UI Emoji', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textInputVal || '⚡', x, y);
      ctx.restore();
      saveHistoryState();
      setIsDrawing(false);
      return;
    }

    if (currentTool === 'rect') {
      ctx.save();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.shadowColor = brushColor;
      ctx.shadowBlur = 10;
      ctx.strokeRect(x - 50, y - 35, 100, 70);
      ctx.restore();
      saveHistoryState();
      setIsDrawing(false);
      return;
    }

    if (currentTool === 'circle') {
      ctx.save();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.shadowColor = brushColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      saveHistoryState();
      setIsDrawing(false);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);

    ctx.save();
    if (currentTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize * 2;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (currentTool === 'glow_brush') {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = brushColor;
      ctx.shadowBlur = 18;
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistoryState();
    }
  };

  // Handle Image File Loading onto Canvas
  const handleLoadImageToCanvas = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw image scaled nicely in center of canvas
        const maxWidth = 400;
        const scale = Math.min(maxWidth / img.width, 300 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 15;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();

        saveHistoryState();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle Drag & Drop of Images from computer/desktop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleLoadImageToCanvas(e.dataTransfer.files[0]);
    }
  };

  // Handle Avatar Image Upload
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setCustomAvatarUrl(dataUrl);
        setShowAvatarModal(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Apply Theme Template
  const handleSelectTemplate = (template: typeof DESIGN_TEMPLATES[0]) => {
    setThemeStyle(template.id);
    setAvatarColor(template.avatarColor);
    setBrushColor(template.accentColor);
    setCustomBadgeText(template.badgeText);
    setCustomBio(template.bio);
    setCardStyle(template.cardStyle);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawCanvasBackground(ctx, template.id);
        saveHistoryState();
      }
    }
    setShowThemeModal(false);
  };

  // Save Full Design to User Profile
  const handleSaveAndApply = async () => {
    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      const designDataUrl = canvas ? canvas.toDataURL('image/png') : undefined;

      await onSaveDesign({
        themeStyle,
        avatarColor,
        customBadgeText,
        customBio,
        cardStyle,
        customHexColor: brushColor,
        customAvatarUrl,
        customDesignData: designDataUrl,
      });

      setSaveSuccessNotice(true);
      setTimeout(() => {
        setSaveSuccessNotice(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save design:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Download Canvas as PNG Image
  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `CloudSend-Design-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-hidden select-none"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* ============================================================ */}
      {/* 1. TOP HEADER: STUDIO CONTROL BAR */}
      {/* ============================================================ */}
      <div className="h-16 px-4 sm:px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 z-20">
        {/* Left: Studio Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-white tracking-tight">
                Studio Tự Thiết Kế Toàn Màn Hình
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                PRO CANVAS
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Vẽ, kéo thả ảnh từ máy tính, đổi avatar và tạo khung thẻ danh tính độc bản
            </p>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* NÚT CHỦ ĐỀ MẪU */}
          <button
            type="button"
            onClick={() => setShowThemeModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white text-xs font-bold border border-purple-500/30 shadow-sm transition-all active:scale-95"
            title="Xem danh sách chủ đề mẫu có sẵn"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Chủ Đề Mẫu</span>
          </button>

          {/* NÚT ĐỔI ẢNH ĐẠI DIỆN */}
          <button
            type="button"
            onClick={() => setShowAvatarModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white text-xs font-bold border border-emerald-500/30 shadow-sm transition-all active:scale-95"
            title="Thay đổi ảnh đại diện cá nhân"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Đổi Avatar</span>
          </button>

          {/* NÚT TẢI ẢNH VỀ MÁY */}
          <button
            type="button"
            onClick={handleDownloadPNG}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all active:scale-95"
            title="Tải ảnh thiết kế về máy (PNG)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Tải PNG</span>
          </button>

          {/* NÚT LƯU & ÁP DỤNG */}
          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saveSuccessNotice ? (
              <Check className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{saveSuccessNotice ? 'Đã Lưu!' : 'Lưu & Áp Dụng'}</span>
          </button>

          {/* NÚT THOÁT FULLSCREEN */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1"
            title="Đóng Studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. MAIN WORKSPACE: CANVAS + COMPACT FLOATING TOOLS */}
      {/* ============================================================ */}
      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-6 bg-slate-950 overflow-hidden">
        
        {/* DRAG & DROP OVERLAY NOTICE */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-purple-950/80 backdrop-blur-sm z-30 border-4 border-dashed border-purple-400 flex flex-col items-center justify-center gap-3 animate-pulse">
            <Upload className="w-16 h-16 text-purple-300" />
            <div className="text-xl font-black text-white">Thả ảnh vào đây để chèn lên khung thiết kế</div>
          </div>
        )}

        {/* THE MAIN DESIGN CANVAS */}
        <div className="relative shadow-2xl rounded-2xl overflow-hidden border border-slate-800/80 max-w-full max-h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="cursor-crosshair bg-slate-900 rounded-2xl max-w-full max-h-[75vh] object-contain shadow-2xl"
          />

          {/* LIVE IDENTITY BADGE OVERLAY PREVIEW */}
          <div className="absolute top-6 left-6 pointer-events-none flex items-center gap-3 p-3 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-xl max-w-[280px]">
            <div 
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-base ring-2 ring-white/20 shrink-0 overflow-hidden shadow-md"
              style={{ backgroundColor: avatarColor }}
            >
              {(customAvatarUrl || currentUser?.photoURL) ? (
                <img 
                  src={customAvatarUrl || currentUser?.photoURL || ''} 
                  alt="Avatar" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              ) : (
                (currentUser?.displayName || 'U')[0].toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {currentUser?.displayName || 'Người dùng'}
              </div>
              <div className="text-[10px] text-emerald-400 truncate font-mono">
                {customBadgeText || 'CloudSend'}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. GỌN GÀNG: FLOATING LEFT TOOLBAR (KHÔNG CHEN LẤN CANVAS) */}
        {/* ============================================================ */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 p-2 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 shadow-2xl">
          {/* Bút vẽ thường */}
          <button
            type="button"
            onClick={() => setCurrentTool('brush')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'brush' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Bút vẽ tự do"
          >
            <Paintbrush className="w-4 h-4" />
          </button>

          {/* Bút Neon Dạ Quang */}
          <button
            type="button"
            onClick={() => setCurrentTool('glow_brush')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'glow_brush' ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/30' : 'text-cyan-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Bút Neon phát sáng"
          >
            <Zap className="w-4 h-4" />
          </button>

          {/* Cục tẩy */}
          <button
            type="button"
            onClick={() => setCurrentTool('eraser')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'eraser' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Cục tẩy xóa"
          >
            <Eraser className="w-4 h-4" />
          </button>

          <div className="w-full h-px bg-slate-800 my-1" />

          {/* Thêm Chữ */}
          <button
            type="button"
            onClick={() => setCurrentTool('text')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'text' ? 'bg-amber-500 text-slate-950 font-bold shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Chèn văn bản nghệ thuật"
          >
            <Type className="w-4 h-4" />
          </button>

          {/* Hình vuông */}
          <button
            type="button"
            onClick={() => setCurrentTool('rect')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'rect' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Vẽ khung chữ nhật"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Hình tròn */}
          <button
            type="button"
            onClick={() => setCurrentTool('circle')}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'circle' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Vẽ hình tròn"
          >
            <Circle className="w-4 h-4" />
          </button>

          {/* Sticker */}
          <button
            type="button"
            onClick={() => {
              setCurrentTool('sticker');
              setShowStickerPicker(!showStickerPicker);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              currentTool === 'sticker' ? 'bg-yellow-500 text-slate-950 font-bold' : 'text-yellow-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Chèn Sticker / Biểu tượng"
          >
            <Smile className="w-4 h-4" />
          </button>

          <div className="w-full h-px bg-slate-800 my-1" />

          {/* Tải ảnh từ máy lên Canvas */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
            title="Tải ảnh từ máy tính chèn vào canvas"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleLoadImageToCanvas(e.target.files[0]);
              }
            }}
          />

          {/* Undo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyStep <= 0}
            className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
            title="Hoàn tác nét vẽ (Undo)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Xóa toàn bộ */}
          <button
            type="button"
            onClick={handleClearCanvas}
            className="p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
            title="Xóa trắng canvas làm lại"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* 4. GỌN GÀNG: FLOATING BOTTOM PALETTE & SLIDER (ĐẶT Ở ĐÁY) */}
        {/* ============================================================ */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 p-2.5 px-4 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 shadow-2xl max-w-full overflow-x-auto no-scrollbar">
          
          {/* Quick Color Picker */}
          <div className="flex items-center gap-1.5 pr-3 border-r border-slate-800 shrink-0">
            {['#10B981', '#06B6D4', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#FFFFFF', '#EAB308'].map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => {
                  setBrushColor(col);
                  setAvatarColor(col);
                }}
                className={`w-6 h-6 rounded-full transition-transform ${
                  brushColor === col ? 'scale-125 ring-2 ring-white shadow-lg' : 'hover:scale-110 opacity-80'
                }`}
                style={{ backgroundColor: col }}
              />
            ))}
            
            {/* Custom Color Input */}
            <input
              type="color"
              value={brushColor}
              onChange={(e) => {
                setBrushColor(e.target.value);
                setAvatarColor(e.target.value);
              }}
              className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0"
              title="Chọn màu bất kỳ"
            />
          </div>

          {/* Brush Size Slider */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 font-mono">Cỡ: {brushSize}px</span>
            <input
              type="range"
              min="2"
              max="40"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Text/Sticker input helper */}
          {(currentTool === 'text' || currentTool === 'sticker') && (
            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800 shrink-0">
              <input
                type="text"
                value={textInputVal}
                onChange={(e) => setTextInputVal(e.target.value)}
                placeholder="Nhập chữ/biểu tượng..."
                className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 w-32"
              />
              <span className="text-[10px] text-purple-400 font-mono">Bấm lên Canvas để dán</span>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. MODAL CHỦ ĐỀ MẪU (THEME TEMPLATES MODAL) */}
      {/* ============================================================ */}
      {showThemeModal && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Thư Viện Chủ Đề Mẫu (Theme Templates)</h3>
                  <p className="text-xs text-slate-400">Chọn một chủ đề thiết kế sẵn để bắt đầu sáng tạo nhanh</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 max-h-[60vh] overflow-y-auto pr-1">
              {DESIGN_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`p-4 rounded-2xl border text-left transition-all hover:scale-105 ${
                    themeStyle === tmpl.id
                      ? 'bg-slate-950 border-purple-400 ring-2 ring-purple-500/40 shadow-xl'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="w-4 h-4 rounded-full shadow-md" style={{ backgroundColor: tmpl.accentColor }} />
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {tmpl.tag}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white">{tmpl.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate font-mono">{tmpl.badgeText}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL ĐỔI ẢNH ĐẠI DIỆN (AVATAR CUSTOMIZER MODAL) */}
      {/* ============================================================ */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Thay Đổi Ảnh Đại Diện</h3>
                  <p className="text-xs text-slate-400">Tải ảnh đại diện từ máy tính hoặc chọn màu sắc</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar Preview */}
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              <div 
                className="w-24 h-24 rounded-3xl shadow-2xl ring-4 ring-white/20 flex items-center justify-center text-white text-3xl font-black overflow-hidden relative group cursor-pointer"
                style={{ backgroundColor: avatarColor }}
                onClick={() => avatarInputRef.current?.click()}
              >
                {customAvatarUrl ? (
                  <img src={customAvatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                ) : (
                  (currentUser?.displayName || 'U')[0].toUpperCase()
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold">
                  Đổi ảnh
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">Bấm vào ảnh đại diện hoặc nút bên dưới để chọn ảnh từ máy</p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>Tải ảnh từ máy tính</span>
              </button>

              {currentUser?.photoURL && (
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser.photoURL) {
                      setCustomAvatarUrl(currentUser.photoURL);
                      setShowAvatarModal(false);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Dùng Ảnh Đại Diện Google</span>
                </button>
              )}

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />

              {customAvatarUrl && (
                <button
                  type="button"
                  onClick={() => setCustomAvatarUrl(undefined)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-semibold transition-colors"
                >
                  Xóa ảnh đại diện tùy chỉnh (Dùng chữ cái mặc định)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
