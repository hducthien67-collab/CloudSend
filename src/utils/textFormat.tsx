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
 * Loại bỏ ký tự điều khiển nguy hiểm, ký tự đảo chiều BiDi Override (khiến chữ nhảy lung tung hoặc đảo ngược),
 * chặn spam ký tự vô hình và giới hạn Zalgo combining marks (chống văn bản tràn đè lên các tin nhắn khác).
 */
export const sanitizeDisplayText = (rawText: string): string => {
  if (!rawText) return '';

  let text = rawText;

  // 1. Xóa ký tự điều khiển BiDi overrides (Right-to-Left / Left-to-Right overrides gây hiển thị văn bản lung tung)
  text = text.replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '');

  // 2. Xóa các mã điều khiển vô hình ASCII (trừ \n và \t)
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // 3. Giảm bớt ký tự vô hình / zero-width spaces nếu bị spam liên tiếp
  text = text.replace(/[\u200B-\u200D\uFEFF]{2,}/g, '');

  // 4. Giới hạn Zalgo combining marks (chống chữ vỡ tung tóe kéo dài hàng chục dòng lên xuống)
  // Chỉ cho phép tối đa 2 dấu combining liên tiếp trên 1 ký tự
  text = text.replace(/([\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]{2})[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+/g, '$1');

  // 5. Giới hạn số dòng trống liên tiếp (tối đa 2 dòng ngắt \n\n để khung chat không bị kéo dài vô tận)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
};

/**
 * Công cụ làm sạch và làm gọn văn bản người dùng (Format Cleaner):
 * - Xóa ký tự rác, ký tự ẩn, BiDi spoofing
 * - Chuẩn hóa khoảng trắng và dòng trống
 * - Đảm bảo văn bản gọn gàng, rõ ràng, không bị hiện lung tung
 */
export const cleanAndFormatUserText = (rawText: string): string => {
  if (!rawText) return '';
  
  let cleaned = sanitizeDisplayText(rawText);

  // Tách từng dòng để tỉa khoảng trắng thừa đầu và cuối mỗi dòng
  const lines = cleaned.split('\n').map(line => {
    // Thay thế nhiều khoảng trắng liên tiếp bằng 1 khoảng trắng (nếu không phải code block)
    return line.replace(/[ \t]{2,}/g, ' ').trim();
  });

  // Gộp lại và giới hạn tối đa 2 dòng ngắt
  cleaned = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
};

/**
 * Chuẩn hóa URL an toàn để mở bằng href (chặn javascript:, data:, vbscript: và thêm https:// nếu thiếu)
 */
export const normalizeUrl = (rawUrl: string): string => {
  let url = rawUrl.trim();
  // Chặn các giao thức nguy hiểm
  if (/^(javascript|vbscript|data):/i.test(url)) {
    return '#';
  }
  // Xóa dấu chấm hoặc dấu câu ở cuối nếu do gõ câu kết thúc
  url = url.replace(/[.,!?:;)]+$/, '');
  
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
    return url;
  }
  return `https://${url}`;
};

/**
 * Trích xuất tất cả liên kết từ một chuỗi văn bản
 */
export const extractUrls = (text: string): string[] => {
  if (!text) return [];
  const sanitized = sanitizeDisplayText(text);
  const matches = sanitized.match(URL_REGEX);
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
 * Format plain text fragments:
 * - Preserves multiple consecutive spaces (whitespace-pre-wrap)
 * - Supports bold: **bold text**
 * - Supports italic: *italic text*
 * - Supports inline code: `code text`
 */
const formatInlineText = (text: string, keyPrefix: string): React.ReactNode => {
  if (!text) return null;

  // Regex to detect inline code (`...`), bold (**...**), or italic (*...*)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const raw = match[0];
    const idx = match.index;

    if (idx > lastIdx) {
      nodes.push(
        <span key={`${keyPrefix}-t-${lastIdx}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {text.substring(lastIdx, idx)}
        </span>
      );
    }

    if (raw.startsWith('`') && raw.endsWith('`')) {
      // Inline code / monospace: perfectly preserves every single space and tab
      nodes.push(
        <code
          key={`${keyPrefix}-c-${idx}`}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-black/40 border border-white/10 font-mono text-[11px] sm:text-xs text-emerald-300 whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      // Bold
      nodes.push(
        <strong key={`${keyPrefix}-b-${idx}`} className="font-bold whitespace-pre-wrap [overflow-wrap:anywhere] text-white">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      // Italic
      nodes.push(
        <em key={`${keyPrefix}-i-${idx}`} className="italic whitespace-pre-wrap [overflow-wrap:anywhere]">
          {raw.slice(1, -1)}
        </em>
      );
    }

    lastIdx = idx + raw.length;
  }

  if (lastIdx < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-t-${lastIdx}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {text.substring(lastIdx)}
      </span>
    );
  }

  return <>{nodes}</>;
};

/**
 * Chuyển đổi văn bản chứa link và định dạng thành các thành phần React:
 * - Tự động dọn dẹp ký tự phá hoại layout (BiDi, Zalgo, spam newline)
 * - Bảo tồn mọi dấu cách và xuống dòng ngăn nắp
 * - Hỗ trợ khối mã ```code block``` và mã nội dòng `code`
 * - Hỗ trợ in đậm **chữ**, in nghiêng *chữ*
 * - Nhận diện và biến liên kết web thành link có thể nhấp trực tiếp
 */
export const renderClickableText = (
  rawText: string, 
  isMe: boolean = false, 
  customLinkClass?: string
): React.ReactNode => {
  if (!rawText) return null;

  // Tự động làm sạch và chuẩn hóa an toàn trước khi render
  const text = sanitizeDisplayText(rawText);

  // 1. Kiểm tra nếu có khối mã nhiều dòng (```...```)
  if (text.includes('```')) {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    const blockParts: React.ReactNode[] = [];
    let lastBlockIndex = 0;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = codeBlockRegex.exec(text)) !== null) {
      const blockIndex = blockMatch.index;
      if (blockIndex > lastBlockIndex) {
        blockParts.push(
          <React.Fragment key={`pre-block-${lastBlockIndex}`}>
            {renderClickableText(text.substring(lastBlockIndex, blockIndex), isMe, customLinkClass)}
          </React.Fragment>
        );
      }

      const codeContent = blockMatch[2] || '';
      blockParts.push(
        <div 
          key={`code-block-${blockIndex}`}
          className="my-1.5 p-2.5 sm:p-3 rounded-xl bg-slate-950/90 border border-slate-700/80 font-mono text-[11px] sm:text-xs text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed select-text"
        >
          {codeContent}
        </div>
      );

      lastBlockIndex = blockIndex + blockMatch[0].length;
    }

    if (lastBlockIndex < text.length) {
      blockParts.push(
        <React.Fragment key={`post-block-${lastBlockIndex}`}>
          {renderClickableText(text.substring(lastBlockIndex), isMe, customLinkClass)}
        </React.Fragment>
      );
    }

    return <>{blockParts}</>;
  }

  // 2. Tách văn bản theo URL
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
      const segment = text.substring(lastIndex, matchIndex);
      parts.push(
        <React.Fragment key={`seg-${matchIndex}`}>
          {formatInlineText(segment, `seg-${matchIndex}`)}
        </React.Fragment>
      );
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
    const remaining = text.substring(lastIndex);
    parts.push(
      <React.Fragment key={`seg-rem-${lastIndex}`}>
        {formatInlineText(remaining, `seg-rem-${lastIndex}`)}
      </React.Fragment>
    );
  }

  return <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{parts}</span>;
};
