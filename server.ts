import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

// Uploads directory setup
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

// Multer storage engine - supports files up to 250MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Keep safe unique filename
    const ext = path.extname(file.originalname) || '';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, uniqueId);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB
  }
});

async function startServer() {
  const app = express();

  // Support JSON body for image moderation & base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Primary Health Check for Cloud Run Deployment and Load Balancer
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CloudSend API Server',
      timestamp: new Date().toISOString(),
      maxUploadBytes: 250 * 1024 * 1024
    });
  });

  // Heavy File Upload Endpoint (Up to 250MB)
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Không tìm thấy tệp đính kèm' });
      }

      const originalName = file.originalname;
      const ext = path.extname(originalName).toLowerCase();
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
      console.error('File upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Lỗi khi lưu tệp lên máy chủ' });
    }
  });

  // File Download Endpoint (Forces download with original filename)
  app.get('/api/files/download/:id', (req, res) => {
    try {
      const id = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, id);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Tệp không tồn tại hoặc đã hết hạn.');
      }

      const meta = fileMetaMap[id];
      const customName = (req.query.name as string) || meta?.originalName || id;
      const mimeType = meta?.mimeType || 'application/octet-stream';

      res.setHeader('Content-Type', mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(customName)}"; filename*=UTF-8''${encodeURIComponent(customName)}`
      );

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('Download error:', err);
      return res.status(500).send('Lỗi khi tải tệp.');
    }
  });

  // File Inline View Endpoint (For image/video preview in browser, with instant HEIC -> JPEG conversion)
  app.get('/api/files/view/:id', async (req, res) => {
    try {
      const id = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, id);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Tệp không tồn tại.');
      }

      const meta = fileMetaMap[id];
      const ext = path.extname(meta?.originalName || id).toLowerCase();
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
          return res.send(jpegBuffer);
        } catch (convErr) {
          console.warn('HEIC conversion fallback to raw file:', convErr);
        }
      }

      const mimeType = meta?.mimeType || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');

      return res.sendFile(filePath);
    } catch (err: any) {
      console.error('View file error:', err);
      return res.status(500).send('Lỗi khi xem tệp.');
    }
  });

  // Lazy initialization of Gemini client (never crashes if key is omitted)
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    if (!aiClient) {
      aiClient = new GoogleGenAI({ apiKey });
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
      // These are normal user snapshots and must never be falsely blocked
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

      const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
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
              // If it's a mobile camera photo and was flagged without explicit hardcore confirmation, treat as safe
              if (isMobileCameraPhoto && result.safe === false && result.category !== 'nsfw_sex' && result.category !== 'extreme_gore') {
                parsed = { safe: true, category: 'clean' };
              } else {
                parsed = result;
              }
              break;
            }
          }
        } catch {
          // If Gemini safety refuses or model errors, default to safe: true so normal user files are never lost
          parsed = { safe: true, category: 'clean' };
          break;
        }
      }

      return res.json(parsed);
    } catch {
      return res.json({ safe: true, category: 'clean' });
    }
  });

  // Vite middleware in development vs Static SPA in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
