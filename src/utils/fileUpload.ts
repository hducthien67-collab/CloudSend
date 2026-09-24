export interface UploadedFileInfo {
  id: string;
  name: string;
  originalName: string;
  size: number;
  type: string;
  url: string;
  viewUrl: string;
}

// 250 MB limit
export const MAX_FILE_SIZE = 250 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '250 MB';

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
 */
export function generateImageThumbnail(file: File, maxDim: number = 480, quality: number = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawData = e.target?.result as string;
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
          resolve(rawData.slice(0, 100000));
        }
      };
      img.onerror = () => {
        resolve(rawData.slice(0, 100000));
      };
      img.src = rawData;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a file to the Express backend with progress tracking
 */
export function uploadFileToServer(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedFileInfo> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`Tệp "${file.name}" (${formatFileSize(file.size)}) vượt quá giới hạn tối đa ${MAX_FILE_SIZE_LABEL}.`));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.file) {
            if (onProgress) onProgress(100);
            resolve(res.file);
          } else {
            reject(new Error(res.error || 'Tải lên không thành công'));
          }
        } catch (e) {
          reject(new Error('Phản hồi từ máy chủ không hợp lệ'));
        }
      } else {
        let msg = `Máy chủ trả về lỗi ${xhr.status}`;
        try {
          const errRes = JSON.parse(xhr.responseText);
          if (errRes.error) msg = errRes.error;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Mất kết nối mạng khi tải tệp lên máy chủ. Vui lòng thử lại.'));
    };

    xhr.onabort = () => {
      reject(new Error('Quá trình tải tệp đã bị hủy.'));
    };

    xhr.send(formData);
  });
}
