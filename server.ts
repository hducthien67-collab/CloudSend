import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
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
let fileMetaMap: Record<string, { originalName: string; size: number; mimeType: string; createdAt: string }> = {};

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
  app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Không tìm thấy tệp đính kèm' });
      }

      // Record metadata
      fileMetaMap[file.filename] = {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        createdAt: new Date().toISOString()
      };
      saveMetaFile();

      const downloadUrl = `/api/files/download/${file.filename}`;
      const viewUrl = `/api/files/view/${file.filename}`;

      return res.json({
        success: true,
        file: {
          id: file.filename,
          name: file.originalname,
          originalName: file.originalname,
          size: file.size,
          type: file.mimetype || 'application/octet-stream',
          mimeType: file.mimetype || 'application/octet-stream',
          url: downloadUrl,
          viewUrl: viewUrl
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

  // File Inline View Endpoint (For image/video preview in browser)
  app.get('/api/files/view/:id', (req, res) => {
    try {
      const id = path.basename(req.params.id);
      const filePath = path.join(UPLOADS_DIR, id);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Tệp không tồn tại.');
      }

      const meta = fileMetaMap[id];
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
                    text: `Evaluate this image (filename: "${fileName || 'image'}") strictly for safety:
1. Is it 18+ content (nudity, pornography, sex acts, genital exposure, sexually explicit poses, underwear/erotic shots)?
2. Is it extreme visceral gore (severe mutilation, excessive arterial bloodshed)?
Note: Normal horror/halloween/dark art without extreme bloodshed is SAFE.

Return strictly valid JSON:
{
  "safe": boolean,
  "category": "nsfw_sex" | "extreme_gore" | "clean",
  "reason": "Giải thích ngắn bằng tiếng Việt nếu không an toàn, ví dụ: 'Ảnh đã tự động bị hủy và xóa vì phát hiện nội dung 18+/nhạy cảm.'"
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
              parsed = result;
              break;
            }
          }
        } catch {
          continue;
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
