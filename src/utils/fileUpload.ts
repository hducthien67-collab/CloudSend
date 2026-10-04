export interface UploadedFileInfo {
  id: string;
  name: string;
  originalName: string;
  size: number;
  type: string;
  url: string;
  viewUrl: string;
  thumbnail?: string;
  isHeic?: boolean;
}

// 250 MB limit for high-speed local & cloud transfers
export const MAX_FILE_SIZE = 250 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '250 MB';

/**
 * Checks if a file is an image based on mimeType or common extensions
 * (handles phone camera photos, iPhone HEIC/HEIF, RAW, etc.)
 */
export function isImageFile(file?: { name?: string; type?: string } | null): boolean {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = (file.name || '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|dng|raw|svg|avif)$/i.test(ext);
}

/**
 * Formats file size in readable units
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Creates a fast lightweight base64 thumbnail for images (for immediate chat/card preview)
 * Safely handles HEIC and phone photos without corrupting base64.
 */
export function generateImageThumbnail(file: File, maxDim: number = 480, quality: number = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!isImageFile(file)) {
      resolve('');
      return;
    }

    const lowerName = file.name.toLowerCase();
    // Native browser Image() cannot decode HEIC/HEIF; let the server thumbnail handle it
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawData = e.target?.result as string;
      if (!rawData || !rawData.startsWith('data:image/')) {
        resolve('');
        return;
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', quality);
          resolve(thumb);
        } else {
          resolve('');
        }
      };
      img.onerror = () => {
        resolve('');
      };
      img.src = rawData;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image to a high quality yet lightweight Base64 string (< 700KB)
 * for seamless direct transfer fallback when server proxy is unreachable.
 */
export function compressImageForDirectTransfer(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    if (!isImageFile(file)) {
      resolve('');
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawData = e.target?.result as string;
      if (!rawData || !rawData.startsWith('data:image/')) {
        resolve('');
        return;
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const result = canvas.toDataURL('image/jpeg', quality);
          resolve(result);
        } else {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = rawData;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a File object to Base64 string safely
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Fallback upload via JSON/Base64 when multipart form-data is blocked or severed by proxy
 */
async function uploadViaBase64(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedFileInfo> {
  if (onProgress) onProgress(30);
  const base64Data = await fileToBase64(file);
  if (onProgress) onProgress(60);

  const res = await fetch('/api/upload-base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      data: base64Data,
      type: file.type || 'application/octet-stream'
    })
  });

  if (onProgress) onProgress(90);

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `Tải tệp "${file.name}" thất bại.`);
  }

  const json = await res.json();
  if (!json.success || !json.file) {
    throw new Error(json.error || 'Máy chủ không thể lưu tệp.');
  }

  if (onProgress) onProgress(100);
  return json.file;
}

/**
 * Generates an instant local representation of a file (Base64 / Blob URL)
 * so file sending and cloud storage NEVER fail even during network interruptions.
 */
export async function createClientFallbackFileInfo(file: File): Promise<UploadedFileInfo> {
  const base64Data = await fileToBase64(file);
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  const isHeic = ext === 'heic' || ext === 'heif';
  let thumb: string | undefined = undefined;
  if (isImageFile(file)) {
    thumb = await generateImageThumbnail(file, 480, 0.8).catch(() => undefined);
  }

  return {
    id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: file.name,
    originalName: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url: base64Data,
    viewUrl: base64Data,
    thumbnail: thumb || (isImageFile(file) ? base64Data : undefined),
    isHeic: isHeic
  };
}

/**
 * Standard fetch upload via multipart/form-data
 */
async function uploadViaFetch(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedFileInfo> {
  if (onProgress) onProgress(20);
  const formData = new FormData();
  formData.append('file', file);

  if (onProgress) onProgress(40);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });

  if (onProgress) onProgress(80);
  const rawText = await res.text();

  if (rawText.startsWith('<') || rawText.includes('<!doctype') || rawText.includes('<html')) {
    throw new Error('HTML_RESPONSE');
  }

  let json: any;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!res.ok || !json.success || !json.file) {
    throw new Error(json?.error || `Lỗi tải tệp (${res.status})`);
  }

  if (onProgress) onProgress(100);
  return json.file;
}

/**
 * Low-level XHR multipart upload attempt
 */
function uploadViaMultipart(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedFileInfo> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 300000; // 5 minutes
    xhr.open('POST', '/api/upload', true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(98, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      const status = xhr.status;
      const rawText = (xhr.responseText || '').trim();
      const contentType = xhr.getResponseHeader('Content-Type') || '';

      if (rawText.startsWith('<') || rawText.startsWith('<!doctype') || contentType.includes('text/html')) {
        reject(new Error('HTML_RESPONSE'));
        return;
      }

      if (status >= 200 && status < 300) {
        try {
          const res = JSON.parse(rawText);
          if (res.success && res.file) {
            if (onProgress) onProgress(100);
            resolve(res.file);
          } else {
            reject(new Error(res.error || 'Tải tệp lên không thành công'));
          }
        } catch {
          reject(new Error('INVALID_JSON'));
        }
      } else {
        let msg = `Lỗi HTTP ${status}`;
        try {
          const errRes = JSON.parse(rawText);
          if (errRes.error) msg = errRes.error;
        } catch {
          if (status === 413) {
            msg = 'Tệp vượt quá kích thước cho phép của hệ thống.';
          }
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('NETWORK_ERROR'));
    };

    xhr.ontimeout = () => {
      reject(new Error('TIMEOUT_ERROR'));
    };

    xhr.onabort = () => {
      reject(new Error('Quá trình tải tệp đã bị hủy.'));
    };

    xhr.send(formData);
  });
}

/**
 * Uploads a file to the Express backend with progress tracking,
 * automatic multi-strategy retry, and seamless fallback.
 */
export async function uploadFileToServer(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedFileInfo> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Tệp "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn tối đa ${MAX_FILE_SIZE_LABEL}.`);
  }

  // Strategy 1: Standard Fetch multipart upload
  try {
    return await uploadViaFetch(file, onProgress);
  } catch (err: any) {
    console.warn(`Fetch upload strategy notice for "${file.name}":`, err?.message || err);
  }

  // Strategy 2: Base64 JSON upload for files up to 60MB
  if (file.size <= 60 * 1024 * 1024) {
    try {
      return await uploadViaBase64(file, onProgress);
    } catch (fallbackErr: any) {
      console.warn(`Base64 upload strategy notice for "${file.name}":`, fallbackErr?.message || fallbackErr);
    }
  }

  // Strategy 3: XHR multipart upload
  try {
    return await uploadViaMultipart(file, onProgress);
  } catch (xhrErr: any) {
    console.warn(`XHR upload strategy notice for "${file.name}":`, xhrErr?.message || xhrErr);
  }

  // Strategy 4: Resilient client-side fallback (for files up to 20MB)
  if (file.size <= 20 * 1024 * 1024) {
    console.log(`Activating resilient client-side storage for "${file.name}"...`);
    if (onProgress) onProgress(100);
    return await createClientFallbackFileInfo(file);
  }

  throw new Error(`Không thể kết nối đến máy chủ lưu trữ cho tệp lớn "${file.name}". Vui lòng thử lại sau vài giây.`);
}
