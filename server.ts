import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  // Support JSON body for image moderation
  app.use(express.json({ limit: '25mb' }));

  // Primary Health Check for Cloud Run Deployment and Load Balancer
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'CloudSend API Server',
      timestamp: new Date().toISOString()
    });
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
