import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function moderationPlugin(): Plugin {
  return {
    name: 'image-moderation-middleware',
    configureServer(server) {
      server.middlewares.use('/api/moderate-image', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const { image, fileName } = JSON.parse(body || '{}');
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey || !image) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ safe: true, category: 'clean' }));
              return;
            }

            const { GoogleGenAI } = await import('@google/genai');
            const ai = new GoogleGenAI({ apiKey });

            const match = image.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ safe: true, category: 'clean' }));
              return;
            }
            const mimeType = match[1];
            const base64Data = match[2];

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
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

            const parsed = JSON.parse(response.text || '{}');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(parsed));
          } catch (err) {
            console.warn('AI Moderation fallback:', err);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ safe: true, category: 'clean' }));
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), moderationPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
