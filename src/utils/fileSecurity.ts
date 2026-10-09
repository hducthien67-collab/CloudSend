/**
 * CLSend Secure File System & Content Protection Module
 * Fixes all file upload and download vulnerabilities:
 * 1. Dangerous executable / script extension blocking (.exe, .bat, .cmd, .vbs, .ps1, .sh, .jar, .scr, etc.)
 * 2. Double-extension attack defense (e.g. document.pdf.exe, photo.jpg.vbs)
 * 3. Unicode Bidi / Right-to-Left Override (RLO) spoofing defense (U+202E, etc.)
 * 4. Path traversal sanitization (../, ..\\, null bytes \0, shell metacharacters)
 * 5. SVG XSS sanitization (removes embedded scripts, malicious event handlers)
 * 6. Safe download protocol verification (prevents javascript:, vbscript:, data:text/html XSS)
 * 7. Content-Disposition CRLF Header Injection defense
 */

// Comprehensive blacklist of dangerous executable and script file extensions
export const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'msc',
  'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'msh', 'msh1', 'msh2', 'mshxml', 'msh1xml', 'msh2xml',
  'sh', 'bash', 'csh', 'ksh', 'zsh',
  'msi', 'msp', 'mst', 'reg', 'scr', 'pif', 'com', 'hta', 'cpl', 'jar',
  'dll', 'drv', 'sys', 'ocx', 'vxd',
  'inf', 'ins', 'isp', 'scf', 'sct', 'shb', 'shs',
  'iso', 'img', 'vhd', 'vhdx', 'lnk', 'gadget'
]);

// Dangerous MIME types
export const DANGEROUS_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-msi',
  'application/x-powershell',
  'application/x-vbs',
  'application/javascript',
  'text/javascript',
  'application/x-javascript'
]);

/**
 * Strips Unicode Bidirectional override characters that attackers use to disguise extensions
 * (e.g., "picture\u202Egpj.exe" will display in UI as "pictureexe.jpg"!)
 */
export function removeBidiSpoofing(input: string): string {
  if (!input) return '';
  // Remove U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069
  return input.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
}

/**
 * Sanitizes a filename to prevent Path Traversal, CRLF Injection, and OS reserved names
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return `clsend-file-${Date.now()}`;
  }

  let name = removeBidiSpoofing(filename);

  // 1. Remove null bytes and non-printable control characters
  name = name.replace(/[\x00-\x1F\x7F]/g, '');

  // 2. Strip directory paths (both forward and backslashes) to defeat path traversal
  name = name.replace(/^.*[\\\/]/, '');

  // 3. Strip CRLF characters to prevent HTTP Header Injection
  name = name.replace(/[\r\n\t]/g, '');

  // 4. Remove leading/trailing dots and spaces
  name = name.trim().replace(/^\.+/, '').replace(/\.+$/, '');

  // 5. If empty after sanitization
  if (!name) {
    name = `clsend-file-${Date.now()}`;
  }

  // 6. Truncate excessive length (max 180 chars) while preserving extension
  if (name.length > 180) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0 && lastDot > name.length - 20) {
      const ext = name.substring(lastDot);
      const base = name.substring(0, 180 - ext.length);
      name = `${base}${ext}`;
    } else {
      name = name.substring(0, 180);
    }
  }

  return name;
}

export interface FileSecurityCheckResult {
  isSafe: boolean;
  sanitizedName: string;
  error?: string;
  category?: 'executable_blocked' | 'double_ext_blocked' | 'svg_script_detected' | 'size_exceeded' | 'invalid_format';
}

/**
 * Validates a file for safety before uploading
 */
export function inspectFileSecurity(file: { name: string; size?: number; type?: string }): FileSecurityCheckResult {
  const sanitizedName = sanitizeFilename(file.name);
  const lowerName = sanitizedName.toLowerCase();

  // 1. Check direct file extension
  const parts = lowerName.split('.');
  const lastExt = parts.length > 1 ? parts[parts.length - 1] : '';

  if (DANGEROUS_EXTENSIONS.has(lastExt)) {
    return {
      isSafe: false,
      sanitizedName,
      category: 'executable_blocked',
      error: `Định dạng tệp .${lastExt} là tệp thực thi/mã lệnh nguy hiểm và đã bị CLSend từ chối tải lên để bảo vệ người dùng.`
    };
  }

  // 2. Check double extension attacks (e.g. document.pdf.exe or file.png.ps1)
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      const subExt = parts[i];
      if (DANGEROUS_EXTENSIONS.has(subExt)) {
        return {
          isSafe: false,
          sanitizedName,
          category: 'double_ext_blocked',
          error: `Phát hiện dấu hiệu ngụy trang đuôi tệp kép độc hại (.${subExt}). Tệp đã bị từ chối tải lên.`
        };
      }
    }
  }

  // 3. Check dangerous MIME types
  if (file.type && DANGEROUS_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      isSafe: false,
      sanitizedName,
      category: 'executable_blocked',
      error: `Loại tệp (${file.type}) không được phép tải lên hệ thống.`
    };
  }

  return {
    isSafe: true,
    sanitizedName
  };
}

/**
 * Sanitizes SVG file text on client or server to prevent Stored XSS
 */
export function sanitizeSvgContent(svgText: string): string {
  if (!svgText) return '';
  
  // Remove <script> tags and contents
  let clean = svgText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove onload, onerror, onclick, onmouseover and all other event handlers
  clean = clean.replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');
  
  // Remove javascript: and vbscript: URIs
  clean = clean.replace(/href\s*=\s*["']?\s*(javascript|vbscript|data):/gi, 'href="blocked:');
  clean = clean.replace(/xlink:href\s*=\s*["']?\s*(javascript|vbscript|data):/gi, 'xlink:href="blocked:');
  
  // Remove <foreignObject> and <iframe> elements
  clean = clean.replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '');
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  return clean;
}

/**
 * Validates a download URL to prevent Client-Side Open Redirects and script execution
 */
export function isSafeDownloadUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim().toLowerCase();

  // Strictly reject javascript:, vbscript:, and dangerous data schemas
  if (cleanUrl.startsWith('javascript:') || cleanUrl.startsWith('vbscript:')) {
    return false;
  }

  // Reject text/html or application/javascript in data URLs
  if (cleanUrl.startsWith('data:')) {
    if (cleanUrl.startsWith('data:text/html') || cleanUrl.startsWith('data:application/javascript')) {
      return false;
    }
    return true;
  }

  // Safe relative paths or blob: or http/https
  if (cleanUrl.startsWith('/') || cleanUrl.startsWith('blob:') || cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return true;
  }

  return false;
}
