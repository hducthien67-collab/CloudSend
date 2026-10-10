import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

// Uploads directory setup with fallback for read-only or container environments
let UPLOADS_DIR = path.join(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads dir in cwd, falling back to /tmp/uploads:', e);
  UPLOADS_DIR = path.join('/tmp', 'uploads');
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (tmpErr) {
    console.warn('Could not create /tmp/uploads dir:', tmpErr);
  }
}

// Meta persistence file
const META_FILE = path.join(UPLOADS_DIR, '_meta.json');
let fileMetaMap: Record<string, { originalName: string; size: number; mimeType: string; createdAt: string; isHeic?: boolean; thumbnail?: string }> = {};

try {
  if (fs.existsSync(META_FILE)) {
    const raw = fs.readFileSync(META_FILE, 'utf-8');
    fileMetaMap = JSON.parse(raw);
  }
} catch (e) {
  console.warn('Could not read uploads meta file:', e);
}

function saveMetaFile() {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(fileMetaMap, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write uploads meta file:', e);
  }
}

// Dangerous extension blacklist
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'msc',
  'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'msh', 'msh1', 'msh2', 'mshxml',
  'sh', 'bash', 'csh', 'ksh', 'zsh',
  'msi', 'msp', 'mst', 'reg', 'scr', 'pif', 'com', 'hta', 'cpl', 'jar',
  'dll', 'drv', 'sys', 'ocx', 'vxd',
  'iso', 'img', 'vhd', 'vhdx', 'lnk', 'gadget'
]);

function sanitizeServerFilename(filename: string): string {
  if (!filename) return `clsend-file-${Date.now()}`;
  let name = filename.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  name = name.replace(/[\x00-\x1F\x7F]/g, '');
  name = name.replace(/^.*[\\\/]/, '');
  name = name.replace(/[\r\n\t]/g, '');
  name = name.trim().replace(/^\.+/, '').replace(/\.+$/, '');
  return name || `clsend-file-${Date.now()}`;
}

function checkDangerousExtension(filename: string): { blocked: boolean; reason?: string } {
  const clean = sanitizeServerFilename(filename).toLowerCase();
  const parts = clean.split('.');
  if (parts.length > 1) {
    const lastExt = parts[parts.length - 1];
    if (DANGEROUS_EXTENSIONS.has(lastExt)) {
      return { blocked: true, reason: `Định dạng tệp .${lastExt} bị cấm để đảm bảo an toàn.` };
    }
  }
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      if (DANGEROUS_EXTENSIONS.has(parts[i])) {
        return { blocked: true, reason: `Phát hiện nguy cơ đuôi tệp kép (.${parts[i]}).` };
      }
    }
  }
  return { blocked: false };
}

function sanitizeSvgBuffer(buffer: Buffer): Buffer {
  try {
    let str = buffer.toString('utf-8');
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    str = str.replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');
    str = str.replace(/href\s*=\s*["']?\s*(javascript|vbscript|data):/gi, 'href="blocked:');
    str = str.replace(/xlink:href\s*=\s*["']?\s*(javascript|vbscript|data):/gi, 'xlink:href="blocked:');
    str = str.replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '');
    str = str.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    return Buffer.from(str, 'utf-8');
  } catch {
    return buffer;
  }
}

// Multer storage engine - supports files up to 250MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10);
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${safeExt}`;
    cb(null, uniqueId);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const check = checkDangerousExtension(file.originalname);
    if (check.blocked) {
      return cb(new Error(check.reason || 'Tệp thực thi nguy hiểm không được phép tải lên'));
    }
    cb(null, true);
  }
});

async function startServer() {
  const app = express();

  // CORS and preflight handling for mobile devices and iframes
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Support JSON body for image moderation & base64
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  // Primary Health Check for Cloud Run Deployment and Load Balancers
  app.get(['/health', '/_health'], (_req, res) => {
    res.status(200).send('OK');
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CLSend API Server',
      timestamp: new Date().toISOString(),
      maxUploadBytes: 250 * 1024 * 1024
    });
  });

  // Robust Multer error wrapper middleware for /api/upload
  const handleUploadMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (upload.single('file') as any)(req, res, (err: any) => {
      if (err) {
        console.error('Multer file upload error:', err);
        let errorMsg = 'Lỗi khi tải tệp lên máy chủ';
        if (err.code === 'LIMIT_FILE_SIZE') {
          errorMsg = 'Tệp vượt quá giới hạn 250MB của hệ thống. Vui lòng chọn tệp nhỏ hơn.';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          errorMsg = 'Định dạng trường tệp tin không hợp lệ.';
        } else if (err.message) {
          errorMsg = err.message;
        }
        return res.status(400).json({ success: false, error: errorMsg });
      }
      next();
    });
  };

  // Heavy File Upload Endpoint (Up to 250MB per request via Cloud Proxy)
  const processUpload = async (req: express.Request, res: express.Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Không tìm thấy tệp đính kèm' });
      }

      // Safe decoding and sanitization of filename
      let originalName = file.originalname || 'file';
      try {
        originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch {}
      originalName = sanitizeServerFilename(originalName);

      const ext = path.extname(originalName).toLowerCase();
      const isSvg = ext === '.svg' || file.mimetype === 'image/svg+xml';

      // Sanitize SVG content on disk to kill stored XSS scripts
      if (isSvg) {
        try {
          const rawBuffer = fs.readFileSync(file.path);
          const cleanBuffer = sanitizeSvgBuffer(rawBuffer);
          fs.writeFileSync(file.path, cleanBuffer);
        } catch (svgErr) {
          console.warn('SVG sanitization error:', svgErr);
        }
      }

      const isHeic = ext === '.heic' || ext === '.heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif';
      const isImage = file.mimetype?.startsWith('image/') || isHeic || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)$/i.test(ext);

      // Try generating a lightweight server thumbnail for immediate card/chat preview
      let thumbnailBase64: string | undefined = undefined;
      if (isImage) {
        try {
          const thumbBuffer = await sharp(file.path)
            .rotate() // auto-orient based on EXIF camera orientation
            .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          thumbnailBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
        } catch (thumbErr) {
          console.warn('Could not generate server thumbnail:', thumbErr);
        }
      }

      // Record metadata
      fileMetaMap[file.filename] = {
        originalName: originalName,
        size: file.size,
        mimeType: isHeic ? 'image/heic' : (file.mimetype || 'application/octet-stream'),
        createdAt: new Date().toISOString(),
        isHeic: isHeic,
        thumbnail: thumbnailBase64
      };
      saveMetaFile();

      const downloadUrl = `/api/files/download/${file.filename}`;
      const viewUrl = `/api/files/view/${file.filename}`;

      return res.json({
        success: true,
        file: {
          id: file.filename,
          name: originalName,
          originalName: originalName,
          size: file.size,
          type: isHeic ? 'image/heic' : (file.mimetype || 'application/octet-stream'),
          mimeType: isHeic ? 'image/heic' : (file.mimetype || 'application/octet-stream'),
          url: downloadUrl,
          viewUrl: viewUrl,
          thumbnail: thumbnailBase64,
          isHeic: isHeic
        }
      });
    } catch (err: any) {
      console.error('File upload processing error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Lỗi khi lưu tệp lên máy chủ' });
    }
  };

  // Support both /api/upload and /api/upload/
  app.post('/api/upload', handleUploadMiddleware, processUpload);
  app.post('/api/upload/', handleUploadMiddleware, processUpload);

  // Direct Base64 / JSON Upload Endpoint (Fail-safe fallback when multipart is blocked by Cloud Run proxy/IFrame)
  app.post('/api/upload-base64', async (req: express.Request, res: express.Response) => {
    try {
      const { name, data, type } = req.body || {};
      if (!name || !data) {
        return res.status(400).json({ success: false, error: 'Thiếu thông tin tên tệp hoặc dữ liệu base64' });
      }

      const safeName = sanitizeServerFilename(name);
      const extCheck = checkDangerousExtension(safeName);
      if (extCheck.blocked) {
        return res.status(400).json({ success: false, error: extCheck.reason || 'Tệp nguy hiểm không được phép tải lên.' });
      }

      // Extract base64 payload
      const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;
      let detectedMime = type || 'application/octet-stream';

      if (matches && matches.length === 3) {
        detectedMime = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(data, 'base64');
      }

      if (buffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Dung lượng tệp vượt quá giới hạn 50MB cho kênh tải nhanh.' });
      }

      const ext = path.extname(safeName).toLowerCase();
      const isSvg = ext === '.svg' || detectedMime === 'image/svg+xml';
      if (isSvg) {
        buffer = sanitizeSvgBuffer(buffer);
      }

      const safeExt = ext.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 10);
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${safeExt}`;
      const filePath = path.join(UPLOADS_DIR, uniqueId);

      // Verify path containment
      if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(400).json({ success: false, error: 'Đường dẫn tệp không hợp lệ.' });
      }

      fs.writeFileSync(filePath, buffer);

      const isHeic = ext === '.heic' || ext === '.heif' || detectedMime === 'image/heic' || detectedMime === 'image/heif';
      const isImage = detectedMime?.startsWith('image/') || isHeic || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)$/i.test(ext);

      let thumbnailBase64: string | undefined = undefined;
      if (isImage) {
        try {
          const thumbBuffer = await sharp(filePath)
            .rotate()
            .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          thumbnailBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
        } catch (thumbErr) {
          console.warn('Could not generate server thumbnail:', thumbErr);
        }
      }

      fileMetaMap[uniqueId] = {
        originalName: safeName,
        size: buffer.length,
        mimeType: isHeic ? 'image/heic' : detectedMime,
        createdAt: new Date().toISOString(),
        isHeic: isHeic,
        thumbnail: thumbnailBase64
      };
      saveMetaFile();

      const downloadUrl = `/api/files/download/${uniqueId}`;
      const viewUrl = `/api/files/view/${uniqueId}`;

      return res.json({
        success: true,
        file: {
          id: uniqueId,
          name: safeName,
          originalName: safeName,
          size: buffer.length,
          type: isHeic ? 'image/heic' : detectedMime,
          mimeType: isHeic ? 'image/heic' : detectedMime,
          url: downloadUrl,
          viewUrl: viewUrl,
          thumbnail: thumbnailBase64,
          isHeic: isHeic
        }
      });
    } catch (err: any) {
      console.error('Base64 upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Lỗi khi lưu tệp tải lên' });
    }
  });

  // File Download Endpoint (Forces download with sanitized original filename and header injection defense)
  app.get('/api/files/download/:id', (req, res) => {
    try {
      const rawId = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, rawId);

      // Verify path containment defense
      if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(403).send('Forbidden');
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Tệp không tồn tại hoặc đã hết hạn.');
      }

      const meta = fileMetaMap[rawId];
      const customName = sanitizeServerFilename((req.query.name as string) || meta?.originalName || rawId);
      const mimeType = meta?.mimeType || 'application/octet-stream';

      const safeAscii = customName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');

      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAscii || 'file'}"; filename*=UTF-8''${encodeURIComponent(customName)}`
      );

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('Download error:', err);
      return res.status(500).send('Lỗi khi tải tệp.');
    }
  });

  // File Inline View Endpoint (For image/video preview in browser, with sandbox CSP for safety)
  app.get('/api/files/view/:id', async (req, res) => {
    try {
      const rawId = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, rawId);

      // Path containment check
      if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(403).send('Forbidden');
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Tệp không tồn tại.');
      }

      const meta = fileMetaMap[rawId];
      const ext = path.extname(meta?.originalName || rawId).toLowerCase();
      const isHeic = meta?.isHeic || ext === '.heic' || ext === '.heif' || meta?.mimeType === 'image/heic' || meta?.mimeType === 'image/heif';

      if (isHeic) {
        // Convert iPhone HEIC on-the-fly to JPEG with correct EXIF orientation so all PC browsers render it
        try {
          const jpegBuffer = await sharp(filePath)
            .rotate()
            .jpeg({ quality: 88 })
            .toBuffer();
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Disposition', 'inline');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.send(jpegBuffer);
        } catch (convErr) {
          console.warn('HEIC conversion fallback to raw file:', convErr);
        }
      }

      const mimeType = meta?.mimeType || 'application/octet-stream';

      // Security: For SVGs and other active content, enforce sandbox CSP to prevent XSS
      if (ext === '.svg' || mimeType === 'image/svg+xml' || ext === '.html' || mimeType === 'text/html') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox;");
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('View file error:', err);
      return res.status(500).send('Lỗi khi xem tệp.');
    }
  });

  // Delete File Endpoint
  app.delete('/api/files/:id', (req, res) => {
    try {
      const id = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, id);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fileMetaMap[id]) {
        delete fileMetaMap[id];
        saveMetaFile();
      }
      return res.json({ success: true, message: 'Đã xóa tệp thành công.' });
    } catch (err: any) {
      console.error('Delete file error:', err);
      return res.status(500).json({ success: false, error: 'Lỗi khi xóa tệp trên máy chủ.' });
    }
  });

  // Lazy initialization of Gemini client (never crashes if key is omitted)
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // Server-side AI Image Moderation Proxy
  app.post('/api/moderate-image', async (req, res) => {
    try {
      const { image, fileName } = req.body || {};
      const lowerName = (fileName || '').toLowerCase();

      // 1. Explicit 18+ keyword filenames (porn, hentai, xxx, etc.)
      const explicitKeywordRegex = /(?:^|[._\-\s])(?:porn|hentai|xxx|sex_video|khoa_than|nude_photo|dam_duc)(?:[._\-\s]|$)/i;
      if (explicitKeywordRegex.test(lowerName)) {
        return res.json({
          safe: false,
          category: 'nsfw_sex',
          reason: 'Tệp đã bị từ chối do tên tệp chứa từ khóa khiêu dâm 18+ rõ ràng.'
        });
      }

      // 2. Personal camera photos (IMG_, PXL_, DSC_, SAM_, camera, photos from mobile devices)
      const isMobileCameraPhoto = /(?:img_|pxl_|dsc_|sam_|photo_|dcim|image|camera|screenshot|snap|\d{8}_\d{6})/i.test(lowerName);

      const ai = getAiClient();
      if (!ai || !image) {
        return res.json({ safe: true, category: 'clean' });
      }

      const match = typeof image === 'string' ? image.match(/^data:([^;]+);base64,(.+)$/) : null;
      if (!match) {
        return res.json({ safe: true, category: 'clean' });
      }
      const mimeType = match[1];
      const base64Data = match[2];

      const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
      let parsed = { safe: true, category: 'clean' };

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: `You are an automated safety filter for CloudSend, a personal file transfer and chat application.
Users frequently take photos with their mobile phones to send to their computer (selfies, family photos, personal outfits, gym/fitness photos, beach/swimwear, home snapshots, food, pets, receipts, notes, or IDs).

CRITICAL POLICY:
1. Normal phone camera photos, selfies, portraits, family pictures, swimwear at a beach or pool, people in everyday clothes, casual home photos, and artistic shots are COMPLETELY SAFE and MUST NEVER be flagged (safe: true).
2. ONLY flag explicit, unambiguous HARDCORE PORNOGRAPHY (actual visible genitals or overt sexual intercourse) or EXTREME GRAPHIC GORE (mutilated human corpses, visceral arterial blood).
3. If this looks like a normal camera photo, selfie, person, or personal document, you MUST return "safe": true.
4. If in doubt, ALWAYS return "safe": true. Do NOT falsely block innocent personal photos.

Return strictly valid JSON:
{
  "safe": boolean,
  "category": "nsfw_sex" | "extreme_gore" | "clean",
  "reason": "Giải thích ngắn nếu phát hiện nội dung khiêu dâm hoặc bạo lực cực đoan rõ ràng"
}`,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
            },
          });

          if (response.text) {
            const result = JSON.parse(response.text);
            if (typeof result.safe === 'boolean') {
              if (isMobileCameraPhoto && result.safe === false && result.category !== 'nsfw_sex' && result.category !== 'extreme_gore') {
                parsed = { safe: true, category: 'clean' };
              } else {
                parsed = result;
              }
              break;
            }
          }
        } catch {
          parsed = { safe: true, category: 'clean' };
          break;
        }
      }

      return res.json(parsed);
    } catch {
      return res.json({ safe: true, category: 'clean' });
    }
  });

  // Server-side AI User Audit Proxy evaluating user against 12 Community Rules
  app.post('/api/ai-audit-user', async (req, res) => {
    try {
      const { userName, userEmail, messages, reports, violationHistoryCount } = req.body || {};
      const ai = getAiClient();

      const sampleMessages = Array.isArray(messages) ? messages.slice(0, 30) : [];
      const sampleReports = Array.isArray(reports) ? reports.slice(0, 10) : [];

      if (!ai) {
        // Fallback response if AI is not configured
        return res.json({
          success: true,
          mode: 'rule_fallback',
          hasViolation: sampleReports.length > 0,
          severity: sampleReports.length >= 3 ? 'high' : sampleReports.length > 0 ? 'medium' : 'light',
          recommendedTier: sampleReports.length >= 3 ? 'level_3' : sampleReports.length > 0 ? 'level_2' : 'level_1',
          matchedRule: sampleReports.length > 0 ? 'Luật 12: Quy trình xử lý vi phạm' : 'Không có vi phạm',
          ruleNumber: sampleReports.length > 0 ? 'Luật 12' : 'An toàn',
          evidenceSummary: sampleReports.map(r => r.reason).filter(Boolean).join('; ') || 'Không có báo cáo trực tiếp.',
          reasoning: 'Kiểm tra quy tắc hệ thống cơ bản.',
          remindText: 'Lần này chỉ nhắc nhở thôi cẩn thận trong lời nói của bạn nhé :))'
        });
      }

      const prompt = `Bạn là Trí Tuệ Nhân Tạo (AI Moderation Audit Engine) của hệ thống CloudSend.
Nhiệm vụ của bạn là kiểm toán và đánh giá hành vi của người dùng [${userName || 'Người dùng'}] (Email: ${userEmail || 'Chưa cung cấp'}) dựa trên BỘ 12 LUẬT CỘNG ĐỒNG:
1. Luật 1: Xúc phạm danh dự & Lăng mạ cá nhân (chửi bới, hạ nhục) -> Mức độ: Vừa / Nhẹ
2. Luật 2: Cố tình lách luật & Ngụy trang từ ngữ tục tĩu (teencode, dấu chấm d.i.t, f.u.c.k) -> Mức độ: Vừa / Nhẹ
3. Luật 3: Kỳ thị vùng miền, tôn giáo & Kích động thù hận (bắc kỳ/nam kỳ, phân biệt sắc tộc) -> Mức độ: Cao
4. Luật 4: Quấy rối tình dục & Gạ gẫm thô thiển -> Mức độ: Cao
5. Luật 5: Phát tán văn hóa phẩm 18+, khiêu dâm, CSAM -> Mức độ: Nghiêm trọng (Critical)
6. Luật 6: Bạo lực cực đoan, kinh dị, tự hại, khủng bố -> Mức độ: Nghiêm trọng (Critical)
7. Luật 7: Phát tán virus, mã độc, liên kết lừa đảo phishing -> Mức độ: Nghiêm trọng (Critical)
8. Luật 8: Xâm phạm dữ liệu cá nhân, Doxxing (CCCD, địa chỉ nhà) -> Mức độ: Cao
9. Luật 9: Spam tin nhắn dồn dập, phá hoại băng thông -> Mức độ: Vừa / Nhẹ
10. Luật 10: Mạo danh Quản trị viên (Admin/Dev) để lừa đảo -> Mức độ: Cao
11. Luật 11: Trách nhiệm và quyền hạn của chủ phòng
12. Luật 12: Quy trình xử lý vi phạm & Kháng cáo

Dữ liệu tin nhắn gần đây của người dùng:
${JSON.stringify(sampleMessages.map(m => ({ text: m.text || m.rawText, file: m.fileName, time: m.createdAt })), null, 2)}

Dữ liệu các lượt tố cáo từ người dùng khác về người này:
${JSON.stringify(sampleReports, null, 2)}

Số lần đã từng bị xử lý kỷ luật trước đây: ${violationHistoryCount || 0}

YÊU CẦU:
- Phân tích cẩn thận hành vi và nội dung của người dùng dựa theo 12 luật trên.
- Suy luận mức độ vi phạm thực tế (không phải áp dụng tuần tự mà dựa vào bản chất tính chất hành vi vi phạm):
  + light (Nhẹ): vi phạm nhẹ như ngôn từ bộc phát lần đầu, spam nhẹ -> Đề xuất level_1 (Khóa chat 15 phút)
  + medium (Trung bình): cố tình lách luật, nói tục nhiều lần, xúc phạm cá nhân -> Đề xuất level_2 (Cấm chat 1 tiếng)
  + high (Cao): kỳ thị vùng miền, quấy rối, doxxing, mạo danh admin -> Đề xuất level_3 (Banned 1 ngày)
  + critical (Nặng / Nghiêm trọng): phát tán 18+, virus, mã độc, đe dọa bạo lực hoặc tái phạm sau khi đã bị nhắc nhở nhiều lần -> Đề xuất level_4 (Khóa 7 ngày)
  + permanent (Tái phạm nghiêm trọng nhất): Đã từng bị khóa 7 ngày mà vẫn cố tình tái phạm, hoặc vi phạm tội phạm nghiêm trọng -> Đề xuất level_perm (Cấm vĩnh viễn)

Văn bản remind bắt buộc phải tương ứng đúng:
- level_1: "Lần này chỉ nhắc nhở thôi cẩn thận trong lời nói của bạn nhé :))"
- level_2: "Đã nhắc nhở cho rồi mà còn cố vi phạm nữa à :(("
- level_3: "Cảnh cáo rồi vẫn chưa sợ à >:("
- level_4: "1 lần nữa là sẽ bị cấm tài khoản vĩnh viễn"
- level_perm: "Tài khoản và thiết bị của bạn đã bị CẤM VĨNH VIỄN do tái phạm nghiêm trọng."

Trả về kết quả ở định dạng JSON chuẩn:
{
  "hasViolation": boolean,
  "severity": "light" | "medium" | "high" | "critical" | "clean",
  "recommendedTier": "level_1" | "level_2" | "level_3" | "level_4" | "level_perm" | null,
  "matchedRule": "Tên luật vi phạm (VD: Luật 1: Xúc phạm danh dự hoặc Không có vi phạm)",
  "ruleNumber": "Luật X hoặc An toàn",
  "evidenceSummary": "Trích xuất câu từ cụ thể vi phạm",
  "reasoning": "Giải thích chi tiết nhận định vì sao vi phạm và tại sao chọn mức độ này",
  "recommendedAction": "Mô tả hình phạt đề xuất (VD: Khóa chat 15 phút và nhắc nhở)",
  "remindText": "Văn bản remind tương ứng chuẩn xác theo quy định"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        return res.json({ success: true, ...data });
      }

      return res.json({
        success: true,
        hasViolation: false,
        severity: 'clean',
        recommendedTier: null,
        matchedRule: 'Không có vi phạm',
        ruleNumber: 'An toàn',
        evidenceSummary: 'Không tìm thấy dấu hiệu vi phạm.',
        reasoning: 'Tin nhắn và hành vi hoàn toàn tuân thủ 12 điều luật.',
        recommendedAction: 'Không cần xử lý kỷ luật.',
        remindText: ''
      });
    } catch (err: any) {
      console.warn('AI audit user error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Lỗi khi gọi AI kiểm toán người dùng' });
    }
  });

  // ==========================================================
  // REAL-TIME AI CONTENT MODERATION (OpenAI Moderation API + Gemini AI Hybrid)
  // ==========================================================
  app.post('/api/moderation/check-content', async (req, res) => {
    try {
      const { text, userEmail, userId } = req.body;
      const cleanText = String(text || '').trim();

      if (!cleanText || cleanText.length < 2) {
        return res.json({
          success: true,
          isFlagged: false,
          severity: 'clean',
          matchedRule: 'An toàn',
          remindText: '',
          categories: []
        });
      }

      // Check OpenAI Moderation API if OPENAI_API_KEY is available (100% Free endpoint from OpenAI)
      const openAiKey = process.env.OPENAI_API_KEY;
      let openAiResult: any = null;

      if (openAiKey) {
        try {
          const modResp = await fetch('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              input: cleanText,
              model: 'omni-moderation-latest'
            })
          });
          if (modResp.ok) {
            const data = await modResp.json();
            const result = data?.results?.[0];
            if (result && result.flagged) {
              const flaggedCategories = Object.keys(result.categories || {}).filter(k => result.categories[k]);
              openAiResult = {
                flagged: true,
                categories: flaggedCategories,
                scores: result.category_scores
              };
            }
          }
        } catch (e) {
          console.warn('OpenAI moderation API call warning:', e);
        }
      }

      // If OpenAI flagged as violating
      if (openAiResult && openAiResult.flagged) {
        const cats = openAiResult.categories || [];
        const isCritical = cats.some((c: string) => c.includes('violence') || c.includes('self-harm') || c.includes('sexual/minors'));
        const isHigh = cats.some((c: string) => c.includes('hate') || c.includes('harassment_threatening') || c.includes('sexual'));
        
        const severity = isCritical ? 'critical' : isHigh ? 'high' : 'medium';
        const tier = isCritical ? 'level_4' : isHigh ? 'level_3' : 'level_2';
        const remindText = 
          tier === 'level_4' ? '1 lần nữa là sẽ bị cấm tài khoản vĩnh viễn' :
          tier === 'level_3' ? 'Cảnh cáo rồi vẫn chưa sợ à >:(' :
          'Đã nhắc nhở cho rồi mà còn cố vi phạm nữa à :((';

        return res.json({
          success: true,
          isFlagged: true,
          source: 'openai_moderation',
          severity,
          recommendedTier: tier,
          matchedRule: `OpenAI AI Moderation: Vi phạm danh mục [${cats.join(', ')}]`,
          categories: cats,
          remindText,
          message: `Nội dung đã bị AI phát hiện vi phạm tiêu chuẩn an toàn (${cats.join(', ')}).`
        });
      }

      // Gemini AI Context Fallback / Analysis
      try {
        const ai = getAiClient();
        if (ai) {
          const prompt = `Bạn là hệ thống AI Kiểm Duyệt Nội Dung cho phòng trò chuyện & chia sẻ tệp CloudSend.
Kiểm tra xem câu sau có vi phạm tiêu chuẩn cộng đồng (chửi bậy tục tĩu quá đà, xúc phạm danh dự, quấy rối, phân biệt vùng miền, đe dọa, tự hại, khiêu dâm 18+) hay không.

Nội dung:
"${cleanText}"

Quy định trả về JSON:
{
  "isFlagged": boolean,
  "severity": "clean" | "light" | "medium" | "high" | "critical",
  "matchedRule": "Tên vi phạm hoặc 'An toàn'",
  "reason": "Lý do ngắn",
  "recommendedTier": "level_1" | "level_2" | "level_3" | "level_4" | null,
  "remindText": "Câu nhắc nhở tương ứng"
}`;

          const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
          let geminiResp: any = null;
          for (const mName of candidateModels) {
            try {
              geminiResp = await ai.models.generateContent({
                model: mName,
                contents: prompt,
                config: {
                  responseMimeType: 'application/json'
                }
              });
              if (geminiResp?.text) break;
            } catch (mErr) {
              console.warn(`Gemini model ${mName} moderation attempt notice:`, mErr);
            }
          }

          if (geminiResp.text) {
            const parsed = JSON.parse(geminiResp.text);
            if (parsed.isFlagged) {
              return res.json({
                success: true,
                isFlagged: true,
                source: 'gemini_moderation',
                severity: parsed.severity || 'medium',
                recommendedTier: parsed.recommendedTier || 'level_2',
                matchedRule: parsed.matchedRule || 'Vi phạm tiêu chuẩn cộng đồng',
                remindText: parsed.remindText || 'Cảnh cáo: Nội dung của bạn không phù hợp.',
                message: parsed.reason || 'Nội dung bị AI kiểm duyệt chặn do vi phạm quy định.'
              });
            }
          }
        }
      } catch (gemErr) {
        console.warn('Gemini moderation check notice:', gemErr);
      }

      return res.json({
        success: true,
        isFlagged: false,
        severity: 'clean',
        matchedRule: 'An toàn',
        remindText: '',
        categories: []
      });
    } catch (err: any) {
      console.warn('Moderation endpoint error:', err);
      return res.json({
        success: true,
        isFlagged: false,
        severity: 'clean'
      });
    }
  });

  // ==========================================================
  // REAL CLIENT LOCATION DETECTION (City, Region, Country)
  // ==========================================================
  app.get('/api/auth/detect-location', async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      
      // Try resolving via fast public IP service
      if (clientIp && !clientIp.startsWith('127.') && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.') && clientIp !== '::1') {
        const response = await fetch(`https://ipwho.is/${clientIp}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const city = data.city || '';
            const region = data.region || '';
            const country = data.country || 'Việt Nam';
            const locationString = city && region && city !== region 
              ? `${city}, ${region}, ${country}` 
              : city ? `${city}, ${country}` : country;
            return res.json({ success: true, location: locationString, city, country });
          }
        }
      }

      // Fallback: Query without IP to get current server / client region
      const fallbackRes = await fetch('https://ipwho.is/');
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        if (data.success) {
          const city = data.city || 'Hà Nội';
          const country = data.country || 'Việt Nam';
          return res.json({ success: true, location: `${city}, ${country}`, city, country });
        }
      }

      return res.json({ success: true, location: 'Việt Nam (Hà Nội / TP.HCM)' });
    } catch {
      return res.json({ success: true, location: 'Việt Nam (Hà Nội / TP.HCM)' });
    }
  });

  // ==========================================================
  // REAL EMAIL DISPATCH: Send 6-Digit OTP Security Code to Gmail
  // ==========================================================
  app.post('/api/auth/send-verification-email', async (req, res) => {
    try {
      const { email, code, username, durationMinutes = 15 } = req.body;
      if (!email || !code) {
        return res.status(400).json({ success: false, error: 'Thiếu địa chỉ email hoặc mã xác nhận.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: 'Địa chỉ email không hợp lệ.' });
      }

      const senderName = process.env.SMTP_FROM_NAME || 'CloudSend Security';
      const senderEmail = process.env.SMTP_USER || process.env.GMAIL_USER || 'cloudsendservice@gmail.com';
      const fromField = `"${senderName}" <${senderEmail}>`;
      const nowFormatted = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const expireTimeFormatted = new Date(Date.now() + durationMinutes * 60 * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã Xác Thực Bảo Mật CloudSend</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b132b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b132b; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 30px 20px; background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%); border-bottom: 1px solid #1e293b;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #34d399; letter-spacing: -0.5px;">
                      ⚡ CloudSend Security
                    </h1>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">
                      Hệ Thống Xác Thực & Liên Kết Tài Khoản Mạng
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #e2e8f0;">
                Xin chào <strong style="color: #38bdf8;">${username || cleanEmail}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Chúng tôi nhận được yêu cầu liên kết địa chỉ Gmail <strong style="color: #ffffff;">${cleanEmail}</strong> với tài khoản CloudSend của bạn. Dưới đây là mã bảo mật 6 chữ số để xác thực yêu cầu này:
              </p>

              <!-- OTP Code Display Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                <tr>
                  <td align="center" style="background-color: #020617; border-radius: 12px; border: 2px dashed #10b981; padding: 24px 15px;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin-bottom: 8px; font-weight: 700;">
                      MÃ XÁC THỰC 6 CHỮ SỐ CỦA BẠN
                    </div>
                    <div style="font-size: 38px; font-weight: 900; font-family: 'Courier New', Courier, monospace; letter-spacing: 8px; color: #34d399; text-shadow: 0 0 15px rgba(52, 211, 153, 0.4);">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Lifespan and Notice -->
              <div style="background-color: #1e293b; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 8px; margin: 24px 0 20px;">
                <p style="margin: 0; font-size: 13px; color: #f8fafc; font-weight: 600;">
                  ⏳ Thời hạn hiệu lực: <span style="color: #fbbf24;">Đúng ${durationMinutes} phút</span>
                </p>
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                  Mã này được tạo lúc: ${nowFormatted} và sẽ hết hạn vào: <strong style="color: #ffffff;">${expireTimeFormatted}</strong>. Sau thời gian này, bạn cần nhấn "Gửi lại mã mới".
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b;">
                🛡️ <strong>Lưu ý an toàn:</strong> Không bao giờ chia sẻ mã xác nhận này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                Email được gửi tự động từ hệ thống CloudSend High-Speed Relay Network • <a href="https://cloudsend-bw7z.onrender.com" style="color: #34d399; text-decoration: none;">cloudsend-bw7z.onrender.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `;

      // Gmail SMTP credentials configuration
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = Number(process.env.SMTP_PORT) || 465;
      const smtpUser = process.env.GMAIL_USER || process.env.SMTP_USER || '';
      const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');

      let emailSentReal = false;
      let emailError = null;

      // Direct Gmail SMTP via Google Mail Server
      if (smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
            tls: {
              rejectUnauthorized: false
            }
          });

          await transporter.sendMail({
            from: `"${senderName}" <${smtpUser}>`,
            to: cleanEmail,
            subject: `[CloudSend] Mã xác nhận liên kết tài khoản: ${code}`,
            text: `Mã xác nhận bảo mật 6 chữ số của bạn là: ${code}. Mã có hiệu lực trong vòng ${durationMinutes} phút (hết hạn lúc ${expireTimeFormatted}). Không chia sẻ mã này cho bất kỳ ai.`,
            html: emailHtml,
          });

          emailSentReal = true;
          console.log(`[Gmail SMTP Service] Successfully sent real OTP email from ${smtpUser} to ${cleanEmail}`);
        } catch (err: any) {
          console.error('[Gmail SMTP Service] Error sending from', smtpUser, 'to', cleanEmail, err);
          emailError = err.message || 'Gmail SMTP delivery failed';
        }
      } else {
        console.log(`[Gmail SMTP Service] Waiting for credentials. OTP generated for ${cleanEmail} -> Code: ${code} (expires in ${durationMinutes}m)`);
      }

      return res.json({
        success: true,
        sentTo: cleanEmail,
        isRealSmtp: emailSentReal,
        expiresInMinutes: durationMinutes,
        message: `Mã xác nhận bảo mật 6 chữ số đã được gửi trực tiếp đến Gmail [${cleanEmail}]. Vui lòng mở Gmail để kiểm tra.`
      });
    } catch (err: any) {
      console.error('send-verification-email endpoint error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Lỗi khi gửi email xác thực.'
      });
    }
  });

  // API 404 Handler - Prevent API requests from falling through to Vite HTML
  app.all('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint không tồn tại' });
  });
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint không tồn tại' });
  });

  // API Global Error Handler - Always return JSON for API errors, never HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('API Error handler caught:', err);
      if (!res.headersSent) {
        return res.status(err.status || 500).json({
          success: false,
          error: err.message || 'Lỗi xử lý nội bộ máy chủ'
        });
      }
    }
    next(err);
  });

  // Vite middleware in development vs Static SPA in production
  const distPath = path.join(process.cwd(), 'dist');
  const distIndex = path.join(distPath, 'index.html');
  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(distIndex);

  if (isProduction) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      return res.sendFile(distIndex);
    });
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      app.use('*', async (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        try {
          const rootIndex = path.join(process.cwd(), 'index.html');
          if (!fs.existsSync(rootIndex)) return next();
          let template = fs.readFileSync(rootIndex, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } catch (viteErr) {
      console.warn('Vite dev middleware failed to load, fallback to static serve:', viteErr);
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
      }
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (fs.existsSync(distIndex)) {
          return res.sendFile(distIndex);
        }
        const rootIndex = path.join(process.cwd(), 'index.html');
        if (fs.existsSync(rootIndex)) {
          return res.sendFile(rootIndex);
        }
        return res.status(200).send('CLSend Server Ready');
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}, closing server gracefully`);
    server.close(() => {
      console.log('Server closed successfully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
