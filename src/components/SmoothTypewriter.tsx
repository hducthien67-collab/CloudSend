import React, { useState, useEffect, useRef, useMemo } from 'react';

interface SmoothTypewriterProps {
  texts: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  className?: string;
  cursorClassName?: string;
}

/**
 * Hiệu ứng gõ chữ xuất hiện trực tiếp từ dấu con trỏ | (Caret Beam Emergence),
 * từng chữ cái trượt ra từ tia sáng của dấu | với vệt sáng dạ quang siêu mượt, không giật lag.
 */
export const SmoothTypewriter: React.FC<SmoothTypewriterProps> = ({
  texts,
  typingSpeed = 38,
  deletingSpeed = 16,
  pauseDuration = 2400,
  className = "text-slate-300",
  cursorClassName = "text-emerald-400"
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastTypedTimestamp, setLastTypedTimestamp] = useState<number>(0);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!texts || texts.length === 0) return;

    const currentFullText = texts[textIndex % texts.length] || '';

    // Dọn dẹp timer cũ
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isPaused) {
      timeoutRef.current = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, pauseDuration);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    if (!isDeleting) {
      if (displayedText.length < currentFullText.length) {
        const nextChar = currentFullText[displayedText.length];
        const isSpace = nextChar === ' ';
        // Tốc độ gõ tự nhiên, tối ưu mượt mà
        const charDelay = isSpace ? typingSpeed + 20 : typingSpeed;

        timeoutRef.current = setTimeout(() => {
          setDisplayedText(currentFullText.slice(0, displayedText.length + 1));
          setLastTypedTimestamp(Date.now());
        }, Math.max(12, charDelay));
      } else {
        // Đã gõ xong toàn bộ dòng chữ -> Tạm dừng đọc
        setIsPaused(true);
      }
    } else {
      if (displayedText.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedText(currentFullText.slice(0, displayedText.length - 1));
        }, deletingSpeed);
      } else {
        // Đã xóa hết -> Chuyển sang câu tiếp theo và bắt đầu gõ
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % texts.length);
      }
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [displayedText, isDeleting, isPaused, textIndex, texts, typingSpeed, deletingSpeed, pauseDuration]);

  // Xử lý khi người dùng đổi tab và quay lại, tự kích hoạt nếu có bất kỳ hiện tượng tạm dừng
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setDisplayedText((prev) => prev);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Tách chuỗi thành: tiền tố ổn định, ký tự đang ổn định dần, và ký tự mới nhất vừa phóng ra từ dấu |
  const { staticPrefix, settlingChar, newestChar, isNewestSpace } = useMemo(() => {
    if (!displayedText) {
      return { staticPrefix: '', settlingChar: '', newestChar: '', isNewestSpace: false };
    }
    if (isDeleting || isPaused) {
      return { staticPrefix: displayedText, settlingChar: '', newestChar: '', isNewestSpace: false };
    }
    if (displayedText.length === 1) {
      const char = displayedText;
      return {
        staticPrefix: '',
        settlingChar: '',
        newestChar: char,
        isNewestSpace: char === ' '
      };
    }
    const newest = displayedText.slice(-1);
    const settling = displayedText.slice(-2, -1);
    const prefix = displayedText.slice(0, -2);
    return {
      staticPrefix: prefix,
      settlingChar: settling,
      newestChar: newest,
      isNewestSpace: newest === ' '
    };
  }, [displayedText, isDeleting, isPaused]);

  return (
    <span className={`inline-flex items-center flex-wrap justify-center font-normal tracking-normal select-none ${className}`}>
      <span className="whitespace-pre-wrap inline-flex items-center">
        {/* 1. Các ký tự đã xuất hiện ổn định hoàn toàn */}
        {staticPrefix && <span>{staticPrefix}</span>}

        {/* 2. Ký tự vừa xuất hiện trước đó đang dần lắng đọng mượt mà */}
        {settlingChar && (
          <span
            key={`settle-${textIndex}-${displayedText.length - 1}-${settlingChar}`}
            className="inline-block animate-char-settle"
          >
            {settlingChar === ' ' ? '\u00A0' : settlingChar}
          </span>
        )}

        {/* 3. Ký tự mới nhất đang xuất hiện & phóng dần ra từ dấu | */}
        {newestChar && (
          isNewestSpace ? (
            <span
              key={`space-${textIndex}-${displayedText.length}`}
              className="inline-block animate-space-emerge mx-[1px]"
            >
              &nbsp;
            </span>
          ) : (
            <span
              key={`char-${textIndex}-${displayedText.length}-${newestChar}`}
              className="inline-block animate-char-emerge-from-caret"
            >
              {newestChar}
            </span>
          )
        )}
      </span>

      {/* Dấu con trỏ | phát sáng & nhấp nháy phát quang dạ quang */}
      <span
        aria-hidden="true"
        key={`caret-${lastTypedTimestamp}`}
        className={`inline-block w-[2.5px] h-[1.2em] ml-0.5 bg-emerald-400 rounded-full align-middle animate-smooth-caret animate-caret-emitter shadow-[0_0_10px_#10b981] ${cursorClassName}`}
      />
    </span>
  );
};
