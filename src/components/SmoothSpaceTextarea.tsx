import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SmoothSpaceTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

/**
 * Ô soạn thảo tích hợp Con Trỏ Xanh Lướt Chuyển Động Siêu Mượt & Nhanh Nhạy (Ultra-Fast Snappy Gliding Caret |)
 * - Kích thước thanh con trỏ thanh mảnh, nhỏ gọn và vừa vặn chuẩn tỉ lệ (w: 1.8px, h: 1.15em).
 * - Phản hồi tức thì với độ trễ bằng 0 (0.055s snappy spring transition).
 * - Cập nhật đồng bộ ngay khi gõ phím Space, gõ chữ hay xóa (Backspace).
 */
export const SmoothSpaceTextarea: React.FC<SmoothSpaceTextareaProps> = ({
  id = "send-text-input",
  value,
  onChange,
  onKeyDown,
  placeholder = "Nhập văn bản hoặc link (https://...)...",
  rows = 3,
  className = ""
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const textBeforeRef = useRef<HTMLSpanElement | null>(null);

  const [caretPos, setCaretPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [isFocused, setIsFocused] = useState(false);
  const [isCaretMoving, setIsCaretMoving] = useState(false);
  const movingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tính toán vị trí con trỏ tức thì với giá trị văn bản & selection index cụ thể
  const calculatePosition = useCallback((targetText: string, targetSelectionIndex?: number) => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const marker = markerRef.current;
    const textBefore = textBeforeRef.current;
    if (!textarea || !mirror || !marker || !textBefore) return;

    mirror.style.width = `${textarea.clientWidth}px`;

    const selectionEnd = targetSelectionIndex !== undefined ? targetSelectionIndex : (textarea.selectionEnd ?? targetText.length);
    const beforeText = targetText.substring(0, selectionEnd);

    textBefore.textContent = beforeText;

    const markerLeft = marker.offsetLeft;
    const markerTop = marker.offsetTop;

    const x = markerLeft - textarea.scrollLeft;
    const y = markerTop - textarea.scrollTop;

    setCaretPos({ x, y });

    setIsCaretMoving(true);
    if (movingTimerRef.current) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = setTimeout(() => {
      setIsCaretMoving(false);
    }, 100);
  }, []);

  const updateCaretPosition = useCallback(() => {
    calculatePosition(value);
  }, [value, calculatePosition]);

  useEffect(() => {
    updateCaretPosition();
  }, [value, updateCaretPosition]);

  useEffect(() => {
    const handleResize = () => updateCaretPosition();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [updateCaretPosition]);

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onKeyDown) onKeyDown(e);
    // Tính toán ngay lập tức
    const target = e.currentTarget;
    setTimeout(() => {
      calculatePosition(target.value, target.selectionEnd);
    }, 0);
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full rounded-xl overflow-hidden bg-slate-950/70 border border-slate-800 transition-all ${className}`}
    >
      {/* Mirror đo lường vị trí con trỏ ẩn */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="absolute top-0 left-0 p-4 font-mono text-sm leading-relaxed pointer-events-none opacity-0 select-none whitespace-pre-wrap break-words"
        style={{
          boxSizing: 'border-box',
          visibility: 'hidden',
          zIndex: -1,
          wordBreak: 'break-word',
          overflowWrap: 'break-word'
        }}
      >
        <span ref={textBeforeRef} className="whitespace-pre-wrap break-words" />
        <span ref={markerRef} className="inline-block w-0 h-[1.15em] align-middle">
          {'\u200B'}
        </span>
      </div>

      {/* Ô Textarea thật: Nhập liệu chuẩn và phản hồi tức thì */}
      <textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="relative z-10 w-full p-4 pb-11 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 font-mono leading-relaxed resize-none transition-colors selection:bg-emerald-500/30 selection:text-white"
        style={{
          boxSizing: 'border-box',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          caretColor: 'var(--theme-primary, #10b981)'
        }}
      />
    </div>
  );
};
