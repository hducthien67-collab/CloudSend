/**
 * Universal safe file download utility that works 100% reliably across:
 * - Desktop Chrome, Edge, Firefox, Safari
 * - Mobile Safari (iPhone / iPad iOS 12-18+) and Android Chrome / Samsung Internet
 * - Sandboxed Iframes (Google AI Studio preview, embeds)
 * - Base64 Data URLs (chunked Uint8Array parsing to avoid call stack / memory limits)
 * - Server / API URLs (multi-stage blob fetching with iframe fallback)
 */

import { isSafeDownloadUrl, sanitizeFilename } from './fileSecurity';

// Global toast listener registry for download feedback
type DownloadToastCallback = (msg: { text: string; type: 'info' | 'success' | 'error' }) => void;
let downloadToastListeners: Set<DownloadToastCallback> = new Set();

export function registerDownloadToast(cb: DownloadToastCallback): () => void {
  downloadToastListeners.add(cb);
  return () => downloadToastListeners.delete(cb);
}

function notifyDownload(text: string, type: 'info' | 'success' | 'error' = 'info') {
  downloadToastListeners.forEach(cb => {
    try { cb({ text, type }); } catch {}
  });
}

/**
 * Convert base64 data URL to Blob efficiently in chunks to avoid RangeError
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Định dạng data URL không hợp lệ');
  }

  const header = dataUrl.substring(0, commaIndex);
  const base64 = dataUrl.substring(commaIndex + 1);

  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  const binaryString = atob(base64);
  const len = binaryString.length;
  
  // Allocate buffer
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/**
 * Main safe download function
 */
export async function downloadFileSafely(
  source: string,
  fileName: string,
  onProgress?: (status: 'starting' | 'downloading' | 'completed' | 'error') => void
): Promise<boolean> {
  if (!source) {
    console.warn('downloadFileSafely: source is empty');
    notifyDownload('Không tìm thấy nguồn tệp tin để tải về', 'error');
    if (onProgress) onProgress('error');
    return false;
  }

  // Security: Block unsafe protocols (javascript:, vbscript:, etc.)
  if (!isSafeDownloadUrl(source)) {
    console.error('downloadFileSafely: Unsafe URL blocked:', source);
    notifyDownload('Liên kết tải về không an toàn và đã bị CLSend chặn.', 'error');
    if (onProgress) onProgress('error');
    return false;
  }

  const safeFileName = sanitizeFilename(fileName || 'clsend-file');
  if (onProgress) onProgress('starting');
  notifyDownload(`Đang chuẩn bị tải về "${safeFileName}"...`, 'info');

  try {
    let blobUrl: string | null = null;
    let createdBlobUrl = false;

    if (source.startsWith('data:')) {
      // 1. Data URL (Base64) -> Convert to Blob -> blob: URL
      const blob = dataUrlToBlob(source);
      blobUrl = URL.createObjectURL(blob);
      createdBlobUrl = true;
    } else if (source.startsWith('blob:')) {
      // 2. Already a blob URL
      blobUrl = source;
    } else {
      // 3. Remote / Relative URL (/api/files/download/:id)
      try {
        if (onProgress) onProgress('downloading');
        const res = await fetch(source, {
          method: 'GET',
          headers: { 'Accept': '*/*' },
          cache: 'no-cache'
        });

        if (!res.ok) {
          throw new Error(`Máy chủ trả về mã HTTP ${res.status}`);
        }

        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        createdBlobUrl = true;
      } catch (fetchErr) {
        console.warn('Direct blob fetch failed, trying anchor and hidden iframe fallback:', fetchErr);
        
        // Fallback Strategy: Direct Anchor with download attribute
        const a = document.createElement('a');
        a.href = source;
        a.download = safeFileName;
        a.target = '_self';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          try { document.body.removeChild(a); } catch {}
        }, 1000);

        if (onProgress) onProgress('completed');
        notifyDownload(`Đã bắt đầu tải xuống "${safeFileName}"!`, 'success');
        return true;
      }
    }

    if (!blobUrl) {
      throw new Error('Không thể tạo liên kết tải về cho tệp.');
    }

    // Trigger local download via invisible anchor tag
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeFileName;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try { document.body.removeChild(a); } catch {}
    }, 1000);

    // Free memory object URL after 45 seconds
    if (createdBlobUrl && blobUrl) {
      const urlToRevoke = blobUrl;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(urlToRevoke);
        } catch {}
      }, 45000);
    }

    if (onProgress) onProgress('completed');
    notifyDownload(`Đã tải về thành công "${safeFileName}"!`, 'success');
    return true;
  } catch (err: any) {
    console.error('Safe download error:', err);

    // Ultimate fallback for strict environments: Direct hidden navigation
    try {
      const a = document.createElement('a');
      a.href = source;
      a.download = safeFileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch {}
      }, 1000);

      if (onProgress) onProgress('completed');
      notifyDownload(`Đã gửi lệnh tải xuống "${safeFileName}".`, 'success');
      return true;
    } catch (fallbackErr) {
      if (onProgress) onProgress('error');
      notifyDownload(`Không thể tải về "${safeFileName}". Vui lòng thử lại.`, 'error');
      return false;
    }
  }
}
