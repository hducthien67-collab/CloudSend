import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Maximize2, 
  Minimize2,
  RefreshCw
} from 'lucide-react';
import { downloadFileSafely } from '../utils/fileDownload';

interface ZoomableImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  fileSize?: number;
}

export const ZoomableImageViewerModal: React.FC<ZoomableImageViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageName = 'Hình ảnh',
  fileSize
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transform whenever a new image opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, imageUrl]);

  // Keyboard shortcut listener (ESC to close, +/- to zoom, R to rotate)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') handleZoomIn();
      else if (e.key === '-' || e.key === '_') handleZoomOut();
      else if (e.key === 'r' || e.key === 'R') handleRotate();
      else if (e.key === '0') handleReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scale, rotation]);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = () => {
    setScale((prev) => Math.min(5, Number((prev + 0.35).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(0.4, Number((prev - 0.35).toFixed(2)));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200 select-none touch-none overscroll-none"
      onClick={onClose}
    >
      {/* Top Controls Bar */}
      <div 
        className="w-full bg-slate-900/80 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md" title={imageName}>
              {imageName}
            </h3>
            {fileSize && fileSize > 0 && (
              <p className="text-[11px] text-slate-400 font-mono">
                {(fileSize / 1024 > 1024 ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : `${(fileSize / 1024).toFixed(1)} KB`)}
              </p>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="text-xs font-mono text-emerald-400 font-semibold px-2 py-1 bg-slate-800 rounded-lg hidden sm:inline-block">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
            title="Thu nhỏ (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
            title="Phóng to (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
            title="Xoay 90 độ (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
            title="Đặt lại kích thước (0)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => downloadFileSafely(imageUrl, imageName)}
            className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all active:scale-95 shadow-md flex items-center gap-1.5 px-3 text-xs"
            title="Tải ảnh về máy"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Tải về</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 text-slate-300 hover:text-white transition-all active:scale-95 ml-1"
            title="Đóng (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div 
        ref={containerRef}
        className="flex-1 w-full flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing p-4"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={imageUrl}
          alt={imageName}
          draggable={false}
          onDoubleClick={handleDoubleClick}
          onClick={(e) => e.stopPropagation()}
          className="max-w-[92vw] max-h-[82vh] object-contain transition-transform duration-75 ease-out shadow-2xl rounded-lg"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
          }}
        />
      </div>

      {/* Bottom Hint */}
      <div 
        className="w-full text-center py-2 bg-slate-950/60 text-[11px] text-slate-400 pointer-events-none"
      >
        Nhấn đúp chuột để phóng to / thu nhỏ • Dùng con lăn chuột hoặc phím (+ / -) để Zoom ảnh
      </div>
    </div>
  );
};
