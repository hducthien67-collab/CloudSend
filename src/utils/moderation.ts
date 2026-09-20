// Moderation utility for text and image content
// Enforces rules:
// 1. Text: Censors profanity/vulgar words with ***
// 2. Images: Blocks strong 18+ (sex / explicit pornography / heavy nudity) and extreme gore (severe bloodshed/mutilation)
//    while allowing normal fictional horror / dark art / halloween style.

// Vietnamese & English vulgar word lists and patterns
const PROFANITY_PATTERNS = [
  // Vietnamese profanities & variations
  /\b(đ[uụ]\s*m[aá]|du\s*ma|đ[uụ]|đ[iị]t|dit\s*me|đ[iị]t\s*m[eẹ]|d[iị]t\s*c[oụ]|d[iị]t\s*b[aà])\b/gi,
  /\b(đ[iị]t\s*con\s*m[eẹ]|đ[iị]t\s*m[eẹ]\s*m[aà]y|d[iị]t\s*m[eẹ]\s*m[aà]y|ditme|địtme|djtme|djt)\b/gi,
  /\b(đ[oồ]i\s*b[aạ]i|d[aâ]m\s*d[uụ]c|th[uủ]\s*d[aâ]m|n[uứ]ng\s*l[oồ]n|n[uứ]ng\s*c[aặ]c|n[uứ]ng)\b/gi,
  /\b(vcl|vclol|vcc|vkl|vlon|đm|dm|dkm|đkm|dcm|đcm|đmm|dmm|cmm|cmn|cmnr|vlol|vl)\b/gi,
  /\b(l[oồ]n|l[oồ]ng|bu[oồ]i|c[aặ]c|k[aặ]c|c[aặ]t|d[aá]i|b[iì]u|cailon|c[aá]i\s*l[oồ]n)\b/gi,
  /\b(m[eẹ]\s*m[aà]y|m[aá]\s*m[aà]y|b[oố]\s*m[aà]y|ch[oó]\s*đ[eẻ]|ch[oó]\s*ch[eế]t)\b/gi,
  /\b(đ[eé]o|d[eé]o|đ[eéo]n|đel|del)\b/gi,
  /\b(ch[iị]ch|ch[aạ]y\s*l[aà]ng|g[aá]i\s*g[oọ]i|b[aá]n\s*d[aâ]m)\b/gi,
  // Leetspeak / separated dots/underscores
  /\b(d[._\-*]m|đ[._\-*]m|v[._\-*]l|d[._\-*]k[._\-*]m|đ[._\-*]k[._\-*]m|v[._\-*]c[._\-*]l)\b/gi,
  // English profanities
  /\b(fuck|fucking|fucker|motherfucker|bitch|bitches|asshole|bastard|dick|pussy|whore|slut|cunt)\b/gi,
  /\b(porn|porno|pornography|hentai|xx+|xxx|nsfw|sex|erotic|sexx)\b/gi
];

/**
 * Filter text and replace any vulgar words with asterisks (***)
 */
export function censorProfanity(text: string): { cleanText: string; hasProfanity: boolean; matchCount: number } {
  if (!text) return { cleanText: '', hasProfanity: false, matchCount: 0 };

  let clean = text;
  let matchCount = 0;

  for (const pattern of PROFANITY_PATTERNS) {
    clean = clean.replace(pattern, (match) => {
      matchCount++;
      return '*'.repeat(Math.max(3, match.length));
    });
  }

  return {
    cleanText: clean,
    hasProfanity: matchCount > 0,
    matchCount
  };
}

/**
 * Image moderation result
 */
export interface ImageModerationResult {
  safe: boolean;
  reason?: string;
  category?: 'nsfw_sex' | 'extreme_gore' | 'clean';
}

/**
 * Perform rapid client-side computer vision heuristic scanning on image data URL:
 * - Detects strong 18+ nudity/sex via skin-tone density and distribution in YCbCr/RGB
 * - Detects severe gore / arterial bloodshed pools (without blocking normal horror / dark art / halloween)
 */
export async function scanImageHeuristics(dataUrl: string, fileName = ''): Promise<ImageModerationResult> {
  // Check suspicious filenames first
  const lowerName = fileName.toLowerCase();
  const blockedKeywords = [
    'porn', 'hentai', 'nsfw', 'sex', 'xxx', 'nude', 'jav', 'erotic', 'gore_extreme',
    '18+', '18plus', 'nudity', 'boobs', 'vagina', 'penis', 'cleavage', 'lon', 'buoi',
    'cac', 'khoathan', 'khoa_than', 'dam_duc', 'sexy_hot', 'onlyfans', 'strip',
    'bikini_hot', 'adult', 'sex_toy', 'uncensored', 'clit', 'co_be', 'khe_nguc', 'anh_nong'
  ];
  for (const kw of blockedKeywords) {
    if (lowerName.includes(kw)) {
      return {
        safe: false,
        reason: 'Ảnh đã tự động bị hủy và xóa khỏi danh sách gửi do tên tệp chứa từ khóa 18+ hoặc nội dung nhạy cảm.',
        category: 'nsfw_sex'
      };
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const SAMPLE_SIZE = 100; // 100x100 downsampled grid (10,000 pixels) for instant analysis
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          resolve({ safe: true, category: 'clean' });
          return;
        }

        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const data = imageData.data;
        const totalPixels = SAMPLE_SIZE * SAMPLE_SIZE;

        let skinPixelCount = 0;
        let centralSkinCount = 0;
        let extremeBloodCount = 0;

        for (let y = 0; y < SAMPLE_SIZE; y++) {
          for (let x = 0; x < SAMPLE_SIZE; x++) {
            const idx = (y * SAMPLE_SIZE + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];

            if (a < 50) continue; // skip transparent pixels

            // YCbCr skin tone transformation
            const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
            const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

            // Skin color condition (real human skin + bright/anime tones)
            const isStandardSkin = (
              r > 85 && g > 35 && b > 20 &&
              Math.max(r, g, b) - Math.min(r, g, b) > 12 &&
              Math.abs(r - g) > 10 &&
              r > g && r > b &&
              cb >= 75 && cb <= 135 &&
              cr >= 128 && cr <= 185 &&
              yVal > 65
            );

            const isFairSkin = (
              r > 185 && g > 130 && b > 105 &&
              r > g && g >= b &&
              (r - b) > 20 &&
              (r - g) < 80
            );

            const isSkin = isStandardSkin || isFairSkin;

            if (isSkin) {
              skinPixelCount++;
              // Check if inside central 60% of frame (typical focus of explicit photos)
              if (x >= 20 && x <= 80 && y >= 20 && y <= 80) {
                centralSkinCount++;
              }
            }

            // Extreme bloodshed / active arterial gore condition:
            // Very bright vivid arterial red pool (R > 175, G < 45, B < 45)
            // (Normal horror with dark shadows, desaturated zombies, or orange halloween lighting is NOT flagged)
            const isExtremeGoreRed = (
              r > 175 && g < 45 && b < 45 && (r / (g + b + 1) > 2.8)
            );

            if (isExtremeGoreRed) {
              extremeBloodCount++;
            }
          }
        }

        const skinRatio = skinPixelCount / totalPixels;
        const centralRatio = centralSkinCount / (60 * 60);
        const goreRatio = extremeBloodCount / totalPixels;

        // Condition 1: High skin ratio indicating heavy nudity / sex / 18+
        if (skinRatio > 0.38 || (skinRatio > 0.25 && centralRatio > 0.38) || centralRatio > 0.48) {
          resolve({
            safe: false,
            reason: 'Ảnh đã tự động bị hủy và xóa khỏi danh sách gửi vì phát hiện nội dung nhạy cảm 18+ (khỏa thân / khiêu dâm).',
            category: 'nsfw_sex'
          });
          return;
        }

        // Condition 2: Extreme visceral gore / heavy fresh bloodshed (> 28% of entire frame)
        if (goreRatio > 0.28) {
          resolve({
            safe: false,
            reason: 'Ảnh đã tự động bị hủy và xóa khỏi danh sách gửi vì có yếu tố bạo lực máu me kinh dị quá mức.',
            category: 'extreme_gore'
          });
          return;
        }

        resolve({ safe: true, category: 'clean' });
      } catch (err) {
        console.warn('Scan heuristics notice:', err);
        resolve({ safe: true, category: 'clean' });
      }
    };

    img.onerror = () => {
      resolve({ safe: true, category: 'clean' });
    };

    img.src = dataUrl;
  });
}

/**
 * Comprehensive Image Moderation:
 * Combines local heuristic scan + server AI check when available.
 */
export async function moderateUploadedImage(dataUrl: string, fileName = ''): Promise<ImageModerationResult> {
  // 1. Fast local computer-vision scan
  const localScan = await scanImageHeuristics(dataUrl, fileName);
  if (!localScan.safe) {
    return localScan;
  }

  // 2. Try calling server-side moderation if endpoint exists
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/moderate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, fileName }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.safe === false) {
        return {
          safe: false,
          reason: data.reason || 'Ảnh đã tự động bị hủy và xóa khỏi nội dung gửi vì phát hiện vi phạm tiêu chuẩn 18+ / nhạy cảm.',
          category: data.category || 'nsfw_sex'
        };
      }
    }
  } catch {
    // If server is not reachable, timed out or running SPA mode, fall back to local heuristic scan safely
  }

  return { safe: true, category: 'clean' };
}
