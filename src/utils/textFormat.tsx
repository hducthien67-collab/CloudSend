import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';

/**
 * Biểu thức chính quy phát hiện liên kết URL thông minh:
 * - https://... hoặc http://...
 * - www.domain.com...
 * - Tên miền phổ biến (.com, .vn, .net, .org, .io, .dev, .app, .edu, .gov, .co, .me, v.v.)
 */
export const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|vn|net|org|io|dev|app|edu|gov|co|me|ai|xyz|info|online|store|tech|live|tv|cc)(?:\/[^\s]*)?)/gi;

/**
 * Chuẩn hóa URL để luôn mở được bằng href (thêm https:// nếu thiếu)
 */
export const normalizeUrl = (rawUrl: string): string => {
  let url = rawUrl.trim();
  // Xóa dấu chấm hoặc dấu câu ở cuối nếu do gõ câu kết thúc
  url = url.replace(/[.,!?:;)]+$/, '');
  
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
};

/**
 * Trích xuất tất cả liên kết từ một chuỗi văn bản
 */
export const extractUrls = (text: string): string[] => {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  
  return Array.from(new Set(matches.map(m => normalizeUrl(m))));
};

/**
 * Kiểm tra xem chuỗi văn bản có chứa liên kết web hay không
 */
export const hasUrls = (text: string): boolean => {
  if (!text) return false;
  return URL_REGEX.test(text);
};

/**
 * Chuyển đổi văn bản chứa link thành các thành phần React với liên kết có thể nhấp trực tiếp
 * Dành cho cả người gửi và người nhận
 */
export const renderClickableText = (
  text: string, 
  isMe: boolean = false, 
  customLinkClass?: string
): React.ReactNode => {
  if (!text) return null;

  // Tách văn bản theo URL
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex index
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const rawMatch = match[0];
    const matchIndex = match.index;

    // Đoạn text thông thường trước link
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    const cleanLink = normalizeUrl(rawMatch);
    const defaultLinkClass = isMe
      ? 'text-white underline font-bold hover:text-emerald-100 bg-white/10 px-1.5 py-0.5 rounded transition-colors inline-flex items-center gap-1 mx-0.5'
      : 'text-emerald-400 underline font-bold hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded transition-colors inline-flex items-center gap-1 mx-0.5';

    parts.push(
      <a
        key={`link-${matchIndex}-${cleanLink}`}
        href={cleanLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
        }}
        className={customLinkClass || defaultLinkClass}
        title={`Mở liên kết: ${cleanLink}`}
      >
        <span className="break-all">{rawMatch}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
      </a>
    );

    lastIndex = matchIndex + rawMatch.length;
  }

  // Đoạn text còn lại sau link cuối cùng
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts}</>;
};
