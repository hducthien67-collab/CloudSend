import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useImperativeHandle, 
  forwardRef 
} from 'react';

export interface RichChatInputHandle {
  applyBold: () => void;
  applyItalic: () => void;
  applyCode?: () => void;
  cleanText: () => void;
  clear: () => void;
  focus: () => void;
  getText: () => string;
  setText: (text: string) => void;
}

interface RichChatInputProps {
  id?: string;
  value: string;
  onChange: (markdown: string, plainText: string) => void;
  onSend: () => void;
  onPasteFiles?: (files: File[]) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  onFormatNotice?: (notice: string) => void;
  placeholder?: string;
  disabled?: boolean;
  enterKeyMode?: 'send' | 'newline';
  className?: string;
}

/**
 * Chuyển đổi Markdown (**đậm**, *nghiêng*, `code`) sang HTML để hiển thị trực tiếp trong ContentEditable
 */
export const markdownToEditableHtml = (markdown: string): string => {
  if (!markdown) return '';

  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code inline: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono text-xs">$1</code>');

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // Italic: *text* (excluding already matched bold)
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');

  // Line breaks to <br>
  html = html.replace(/\n/g, '<br>');

  return html;
};

/**
 * Chuyển đổi DOM cây nội dung từ contentEditable sang Markdown chuẩn (**đậm**, *nghiêng*, `code`)
 */
export const serializeNodeToMarkdown = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      return '\n';
    }

    let inner = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      inner += serializeNodeToMarkdown(el.childNodes[i]);
    }

    if (!inner) {
      if (tag === 'div' || tag === 'p') return '\n';
      return '';
    }

    const isBold = tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight || '400', 10) >= 700;
    const isItalic = tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic';
    const isCode = tag === 'code';

    let formatted = inner;
    if (isCode && !formatted.startsWith('`')) {
      formatted = `\`${formatted}\``;
    }
    if (isItalic && !formatted.startsWith('*')) {
      formatted = `*${formatted}*`;
    }
    if (isBold && !formatted.startsWith('**')) {
      formatted = `**${formatted}**`;
    }

    if (tag === 'div' || tag === 'p') {
      return '\n' + formatted;
    }

    return formatted;
  }
  return '';
};

/**
 * Thanh nhập tin nhắn thông minh tích hợp:
 * 1. Con trỏ xanh lướt chuyển động siêu mượt & nhạy bén (Ultra-Fast Snappy Gliding Caret |)
 * 2. Định dạng WYSIWYG trực tiếp (In đậm chữ thật khi bôi đen + Ctrl+B, In nghiêng chữ thật khi Ctrl+I)
 *    Không để lộ các ký tự sao ** hoặc * trong ô gõ chữ.
 */
export const RichChatInput = forwardRef<RichChatInputHandle, RichChatInputProps>(({
  id = "chat-message-input",
  value,
  onChange,
  onSend,
  onPasteFiles,
  onSelectionChange,
  onFormatNotice,
  placeholder = "Nhập tin nhắn... (Bôi đen & Ctrl+B để in đậm, Ctrl+I để in nghiêng, Enter gửi)",
  disabled = false,
  enterKeyMode = 'send',
  className = ""
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [caretPos, setCaretPos] = useState<{ x: number; y: number }>({ x: 16, y: 12 });
  const [isFocused, setIsFocused] = useState(false);
  const [isCaretMoving, setIsCaretMoving] = useState(false);
  const movingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tính toán vị trí con trỏ tức thì chuẩn theo pixel của text đang gõ
  const updateCaretPosition = useCallback(() => {
    if (!containerRef.current || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0).cloneRange();
    if (!editorRef.current.contains(range.startContainer)) return;

    range.collapse(false);

    const containerRect = containerRef.current.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    const rect = range.getBoundingClientRect();

    let x = 16;
    let y = 12;

    if (rect.height > 0 && rect.top > 0) {
      x = Math.max(14, rect.left - containerRect.left);
      y = Math.max(8, rect.top - containerRect.top);
    } else {
      x = editorRect.left - containerRect.left + 16;
      y = editorRect.top - containerRect.top + 12;
    }

    setCaretPos({ x, y });
    setIsCaretMoving(true);
    if (movingTimerRef.current) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = setTimeout(() => {
      setIsCaretMoving(false);
    }, 100);
  }, []);

  // Đồng bộ nội dung editor sang markdown & plainText
  const syncValue = useCallback(() => {
    if (!editorRef.current) return;
    let md = serializeNodeToMarkdown(editorRef.current);
    md = md.replace(/^\n+/, ''); // Tỉa ngắt dòng đầu nếu có
    const plain = (editorRef.current.innerText || '').replace(/\r\n/g, '\n');
    onChange(md, plain);
  }, [onChange]);

  // Kiểm tra trạng thái bôi đen văn bản
  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    const hasSel = !!sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;
    onSelectionChange?.(hasSel);
  }, [onSelectionChange]);

  // Đồng bộ giá trị bên ngoài vào editor (ví dụ khi reset input sau khi gửi hoặc nạp draft)
  useEffect(() => {
    if (!editorRef.current) return;
    const currentMd = serializeNodeToMarkdown(editorRef.current).replace(/^\n+/, '');
    if (!value) {
      if (editorRef.current.innerHTML !== '') {
        editorRef.current.innerHTML = '';
        updateCaretPosition();
      }
    } else if (value !== currentMd && !editorRef.current.contains(document.activeElement)) {
      editorRef.current.innerHTML = markdownToEditableHtml(value);
      updateCaretPosition();
    }
  }, [value, updateCaretPosition]);

  // Imperative handle cho các nút bấm bên ngoài (Toolbar)
  useImperativeHandle(ref, () => ({
    applyBold: () => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      document.execCommand('bold', false);
      syncValue();
      setTimeout(updateCaretPosition, 10);
      onFormatNotice?.('✨ Đã in đậm văn bản trực tiếp (Ctrl+B)');
    },
    applyItalic: () => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      document.execCommand('italic', false);
      syncValue();
      setTimeout(updateCaretPosition, 10);
      onFormatNotice?.('✨ Đã in nghiêng văn bản trực tiếp (Ctrl+I)');
    },
    applyCode: () => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const codeEl = document.createElement('code');
        codeEl.className = "bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono text-xs";
        try {
          range.surroundContents(codeEl);
        } catch {
          codeEl.textContent = range.toString();
          range.deleteContents();
          range.insertNode(codeEl);
        }
        syncValue();
        setTimeout(updateCaretPosition, 10);
        onFormatNotice?.('✨ Đã định dạng mã (Ctrl+E)');
      }
    },
    cleanText: () => {
      if (!editorRef.current) return;
      const plain = editorRef.current.innerText || '';
      const cleaned = plain
        .split('\n')
        .map(l => l.replace(/[ \t]{2,}/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      editorRef.current.innerText = cleaned;
      syncValue();
      setTimeout(updateCaretPosition, 10);
    },
    clear: () => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        syncValue();
        setTimeout(updateCaretPosition, 10);
      }
    },
    focus: () => {
      editorRef.current?.focus();
    },
    getText: () => {
      if (!editorRef.current) return '';
      return serializeNodeToMarkdown(editorRef.current).replace(/^\n+/, '');
    },
    setText: (text: string) => {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = markdownToEditableHtml(text);
      syncValue();
      setTimeout(updateCaretPosition, 10);
    }
  }));

  // Lắng nghe phím tắt: Enter, Ctrl+B, Ctrl+I, Ctrl+E, Shift+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 1. Phím Enter gửi tin hoặc xuống dòng
    if (e.key === 'Enter') {
      if (enterKeyMode === 'send') {
        if (!e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          onSend();
          return;
        }
        // Shift + Enter: Xuống hàng tự nhiên
        if (e.shiftKey) {
          e.preventDefault();
          document.execCommand('insertLineBreak');
          syncValue();
          setTimeout(updateCaretPosition, 10);
          return;
        }
      } else {
        // Mode 'newline': Enter xuống hàng, Ctrl+Enter gửi
        if (isCtrlOrCmd) {
          e.preventDefault();
          onSend();
          return;
        }
      }
    }

    // 2. Ctrl + B / Cmd + B -> Định dạng IN ĐẬM TRỰC TIẾP
    if (isCtrlOrCmd && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      document.execCommand('bold', false);
      syncValue();
      setTimeout(updateCaretPosition, 10);
      onFormatNotice?.('✨ Đã in đậm văn bản trực tiếp (Ctrl+B)');
      return;
    }

    // 3. Ctrl + I / Cmd + I -> Định dạng IN NGHIÊNG TRỰC TIẾP
    if (isCtrlOrCmd && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      document.execCommand('italic', false);
      syncValue();
      setTimeout(updateCaretPosition, 10);
      onFormatNotice?.('✨ Đã in nghiêng văn bản trực tiếp (Ctrl+I)');
      return;
    }

    // 4. Ctrl + E / Cmd + E or Ctrl + ` -> Inline Code
    if (isCtrlOrCmd && (e.key === 'e' || e.key === 'E' || e.key === '`')) {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const codeEl = document.createElement('code');
        codeEl.className = "bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono text-xs";
        try {
          range.surroundContents(codeEl);
        } catch {
          codeEl.textContent = range.toString();
          range.deleteContents();
          range.insertNode(codeEl);
        }
        syncValue();
        setTimeout(updateCaretPosition, 10);
        onFormatNotice?.('✨ Đã định dạng mã (Ctrl+E)');
      }
      return;
    }

    // Đánh thức tính toán vị trí con trỏ sau khi phím nhả
    setTimeout(updateCaretPosition, 0);
  };

  // Xử lý dán: Nếu có ảnh thì gửi ảnh vào đính kèm, nếu là văn bản thì dán text thuần bảo toàn code/xuống dòng
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        onPasteFiles?.(files);
        return;
      }
    }

    // Dán text thuần, bảo toàn tuyệt đối dòng và thụt lề cho code (C++, Python, etc.)
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      selection.deleteFromDocument();

      const lines = text.split(/\r\n|\r|\n/);
      const frag = document.createDocumentFragment();
      lines.forEach((line, idx) => {
        if (idx > 0) {
          frag.appendChild(document.createElement('br'));
        }
        if (line) {
          frag.appendChild(document.createTextNode(line));
        }
      });
      const range = selection.getRangeAt(0);
      range.insertNode(frag);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      syncValue();
      setTimeout(updateCaretPosition, 10);
    }
  };

  // Cập nhật kích thước khi cửa sổ thay đổi
  useEffect(() => {
    const handleResize = () => updateCaretPosition();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [updateCaretPosition]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl bg-slate-950/80 border border-slate-800 focus-within:border-emerald-500/80 transition-all duration-150 ${className}`}
    >
      {/* Placeholder khi ô nhập đang trống */}
      {!value && (
        <div className="absolute left-4 top-2.5 text-sm text-slate-500 pointer-events-none select-none truncate max-w-[calc(100%-2rem)]">
          {placeholder}
        </div>
      )}

      {/* THANH CON TRỎ XANH NHỎ GỌN & LƯỚT CHUYỂN ĐỘNG SIÊU MƯỢT (Gliding Neon Caret |) */}
      <div
        className="absolute pointer-events-none z-20"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${caretPos.x}px, ${caretPos.y}px, 0)`,
          transition: 'transform 0.055s cubic-bezier(0.1, 0.9, 0.2, 1)',
          opacity: isFocused ? 1 : 0
        }}
      >
        <div
          className={`w-[1.8px] h-[1.18em] bg-emerald-400 rounded-full shadow-[0_0_5px_#10b981,0_0_10px_rgba(16,185,129,0.7)] transition-transform duration-75 ${
            isCaretMoving ? 'scale-y-110 shadow-[0_0_8px_#10b981]' : 'animate-smooth-caret'
          }`}
        />
      </div>

      {/* Ô gõ tin nhắn trực tiếp WYSIWYG: Bôi đen & Ctrl+B ra chữ đậm thật, Ctrl+I ra chữ nghiêng thật */}
      <div
        ref={editorRef}
        id={id}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={() => {
          syncValue();
          checkSelection();
          updateCaretPosition();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={() => {
          checkSelection();
          updateCaretPosition();
        }}
        onMouseUp={() => {
          checkSelection();
          updateCaretPosition();
        }}
        onSelect={() => {
          checkSelection();
          updateCaretPosition();
        }}
        onClick={() => {
          checkSelection();
          updateCaretPosition();
        }}
        onFocus={() => {
          setIsFocused(true);
          updateCaretPosition();
        }}
        onBlur={() => {
          setIsFocused(false);
          checkSelection();
        }}
        onPaste={handlePaste}
        className="relative z-10 w-full px-4 py-2.5 min-h-[44px] max-h-32 overflow-y-auto scrollbar-thin text-sm text-white focus:outline-none font-sans leading-relaxed break-words [overflow-wrap:anywhere] transition-colors selection:bg-emerald-500/30 selection:text-white"
        style={{
          caretColor: 'transparent',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap'
        }}
      />
    </div>
  );
});

RichChatInput.displayName = 'RichChatInput';
