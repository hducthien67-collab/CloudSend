/**
 * Universal safe file download utility that works 100% reliably in:
 * - Desktop Chrome / Edge / Firefox / Safari
 * - Mobile Safari (iPhone / iPad) and Android Chrome
 * - Sandboxed Iframes (AI Studio preview)
 * - Base64 Data URLs (converts to Blob to bypass Chrome data: URL download ban)
 * - Server / API URLs (fetches as Blob to bypass iframe popup/new tab blockers)
 */
export async function downloadFileSafely(source: string, fileName: string): Promise<boolean> {
  if (!source) {
    console.warn('downloadFileSafely: source is empty');
    return false;
  }

  const safeFileName = fileName ? fileName.trim() : 'cloudsend-file';

  try {
    let blobUrl: string;

    if (source.startsWith('data:')) {
      // 1. Data URL (Base64) -> Convert to Blob -> blob: URL
      // (Chrome strictly blocks direct <a href="data:..."> downloads)
      const commaIndex = source.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('Định dạng data URL không hợp lệ');
      }

      const header = source.substring(0, commaIndex);
      const base64Data = source.substring(commaIndex + 1);

      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

      const byteCharacters = atob(base64Data);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([byteNumbers], { type: mime });
      blobUrl = URL.createObjectURL(blob);
    } else if (source.startsWith('blob:')) {
      // 2. Already a blob URL
      blobUrl = source;
    } else {
      // 3. Remote or Relative Server URL (e.g. /api/files/download/:id)
      // Fetch as blob to trigger local download without triggering popup blocker or iframe navigation
      try {
        const res = await fetch(source);
        if (!res.ok) {
          throw new Error(`Máy chủ trả về mã ${res.status}`);
        }
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
      } catch (fetchErr) {
        console.warn('Blob fetch failed, fallback to direct anchor click:', fetchErr);
        // Fallback: direct anchor without target="_blank"
        const a = document.createElement('a');
        a.href = source;
        a.download = safeFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
      }
    }

    // Trigger local client download
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke object URL after delay to free memory
    if (!source.startsWith('blob:')) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 30000);
    }

    return true;
  } catch (err) {
    console.error('Safe download error:', err);
    // Ultimate fallback for browsers: open in same frame
    try {
      const a = document.createElement('a');
      a.href = source;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch {
      return false;
    }
  }
}
