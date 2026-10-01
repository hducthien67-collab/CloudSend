// Moderation utility for text and image content
// Policy update:
// 1. Text: Only censors straight/direct profanity words (viết thẳng: địt, đụ, cặc, lồn, buồi, vcl, vl, đm, fuck, bitch, etc.).
//    Obfuscations / evasions (lách luật qua dấu chấm, ký tự) are allowed to pass through so normal conversation is never blocked;
//    community members can use the "Tố cáo" (Report) feature to flag bad actors for DEV review.
// 2. Images: Relaxed client-side heuristics so normal photos/selfies are never blocked.
//    Offensive pictures are handled via user reports in Dev DataStore.

// Unicode word boundary for Vietnamese and English
const B_START = '(?<=^|[^a-zA-Z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ])';
const B_END = '(?=$|[^a-zA-Z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ])';

// Whitelist of innocent thinking sounds and chat words
const INNOCENT_SOUNDS_REGEX = /^(?:h+m+|h+a+|h+e+|h+i+|u+h*m*|o+h+|a+l+o+|o+k+a*y*)$/i;

// Whitelist of common innocent phrases that must NEVER be flagged as profanity
export const INNOCENT_PHRASES_LIST = [
  'lon nước', 'lon nuoc', 'lon bia', 'lon sữa', 'lon sua',
  'lon nước ngọt', 'lon nuoc ngot', 'lon coca', 'lon pepsi', 'lon 7up',
  '1 lon', '2 lon', '3 lon', '4 lon', '5 lon', '6 lon', '7 lon', '8 lon', '9 lon', '10 lon',
  'một lon', 'mot lon', 'hai lon', 'ba lon',
  'mấy lon', 'may lon', 'uống lon', 'uong lon', 'mua lon', 'bán lon', 'ban lon',
  'vỏ lon', 'vo lon', 'thu gom lon', 'lon thiếc', 'lon thiec', 'lon nhôm', 'lon nhom',
  'thùng lon', 'thung lon', 'keng lon',
  'các bạn', 'cac ban', 'các anh', 'cac anh', 'các chị', 'cac chi', 'các em', 'cac em',
  'các file', 'cac file', 'các tài liệu', 'cac tai lieu', 'các bác', 'cac bac',
  'các nhóm', 'cac nhom', 'các người', 'cac nguoi', 'các bên', 'cac ben',
  'các cháu', 'cac chau', 'các con', 'các bạn trẻ',
  'buổi sáng', 'buoi sang', 'buổi chiều', 'buoi chieu', 'buổi tối', 'buoi toi',
  'buổi trưa', 'buoi trua', 'buổi học', 'buoi hoc', 'buổi họp', 'buoi hop',
  'buổi lễ', 'buoi le', 'buổi tiệc', 'buoi tiec', 'trái bưởi', 'trai buoi', 'bưởi da xanh',
  'ví dụ', 'vi du', 'mặc dù', 'mac du', 'dù sao', 'du sao', 'dù cho', 'du cho',
  'du lịch', 'du lich', 'du khách', 'du khach', 'du học', 'du hoc', 'chu du',
  'vui lòng', 'vui long', 'hài lòng', 'hai long', 'tấm lòng', 'tam long',
  'hạ long', 'ha long', 'thăng long', 'thang long', 'long lanh', 'cầu lông', 'cau long',
  'edit', 'credit', 'audit', 'reddit', 'condition', 'edition', 'traditional', 'predict',
  'asset', 'assign', 'assist', 'class', 'pass', 'glass', 'grass', 'bass',
  'cm', 'mm', 'dm', 'km', 'kg', 'ml', 'admin', 'welcome', 'đi tới', 'di toi', 'đi tiếp', 'di tiep',
  'đi tắm', 'di tam', 'đi tìm', 'di tim', 'đi thi', 'di thi', 'đi chơi', 'di choi'
];

// Straight/direct profanity regular expressions (catches real vulgar words written directly)
// When users intentionally obfuscate (lách luật như f.u.c.k, d.i.t, v.l), they are ALLOWED to pass,
// and the community can rely on user reporting (Tố cáo).
const STRAIGHT_PROFANITY_PATTERNS: { name: string; regex: RegExp }[] = [
  // English: FUCK (chỉ bắt viết thẳng: fuck, fucking, fucker, motherfucker, fucked)
  {
    name: 'fuck',
    regex: new RegExp(`${B_START}(?:motherfuck(?:er|ing|s)?|fuck(?:ing|er|ed|s)?|fuk)${B_END}`, 'gi')
  },
  // Vietnamese: ĐỊT / DIT (chỉ bắt viết thẳng: địt, địt mẹ, dit me, dit con me, dit cu, ditme)
  {
    name: 'dit',
    regex: new RegExp(`${B_START}(?:địt(?:\\s+(?:mẹ|con\\s+mẹ|cụ|mày|nhà\\s+mày))?|dit(?:\\s+(?:me|con\\s+me|cu|may))?|ditme)${B_END}`, 'gi')
  },
  // Vietnamese: ĐỤ / DU (chỉ bắt viết thẳng: đụ, đụ má, đụ mẹ, duma, dume, du ma)
  {
    name: 'du',
    regex: new RegExp(`${B_START}(?:đụ(?:\\s+(?:má|mẹ|móa|bà|cả\\s+lò))?|duma|dume|du\\s+ma)${B_END}`, 'gi')
  },
  // Vietnamese: ĐM / DKM / DCM / CMM / DMM (chỉ bắt viết thẳng)
  {
    name: 'dm/dkm',
    regex: new RegExp(`${B_START}(?:đm|dkm|đkm|dcm|đcm|đmm|dmm|cmm)${B_END}`, 'gi')
  },
  // Vietnamese: VL / VCL / VKL / VCC / VLON (chỉ bắt viết thẳng)
  {
    name: 'vl/vcl',
    regex: new RegExp(`${B_START}(?:vcl|vkl|vcc|vlon|vl)${B_END}`, 'gi')
  },
  // Vietnamese: LỒN / CAI LON (viết thẳng: lồn, cái lồn, con lồn, ăn lồn, bú lồn, cailon)
  {
    name: 'lon',
    regex: new RegExp(`${B_START}(?:(?:cái\\s+|con\\s+|cai\\s+)?lồn|(?:ăn|bú|hãm|nứng)\\s+lồn|cailon|lồn\\s+(?:mẹ|mày|to|què|buồi|cặc))${B_END}`, 'gi')
  },
  // Vietnamese: CẶC / KẶC (viết thẳng: cặc, kặc, cái cặc, con cặc, ăn cặc, bú cặc, như cặc, đầu cặc)
  {
    name: 'cac',
    regex: new RegExp(`${B_START}(?:(?:cái\\s+|con\\s+|cai\\s+)?(?:cặc|kặc)|(?:ăn|bú|như|đầu)\\s+(?:cặc|kặc)|(?:cặc|kặc)\\s+(?:buồi|lồn|mẹ|mày))${B_END}`, 'gi')
  },
  // Vietnamese: BUỒI / BUOI (viết thẳng: buồi, con buồi, cái buồi, đầu buồi, như buồi, ăn buồi)
  {
    name: 'buoi',
    regex: new RegExp(`${B_START}(?:(?:cái\\s+|con\\s+|đầu\\s+|như\\s+|ăn\\s+)?buồi|buồi\\s+cặc)${B_END}`, 'gi')
  },
  // Vietnamese: CU / BÚ CU (bú cu, liếm cu, bóp cu, sóc cu)
  {
    name: 'bucu',
    regex: new RegExp(`${B_START}(?:(?:bú|liếm|bóp|sóc)\\s+cu)${B_END}`, 'gi')
  },
  // Vietnamese: ĐÉO / DEO (viết thẳng: đéo, đéo mẹ, đéo cần, đéo biết)
  {
    name: 'deo',
    regex: new RegExp(`${B_START}(?:đéo(?:\\s+(?:mẹ|cần|biết|quan\\s+tâm|thích))?)${B_END}`, 'gi')
  },
  // Vietnamese: CHỊCH (chỉ bắt viết thẳng)
  {
    name: 'chich',
    regex: new RegExp(`${B_START}(?:chịch)${B_END}`, 'gi')
  },
  // English: SEX / PORN (chỉ bắt viết thẳng)
  {
    name: 'sex/porn',
    regex: new RegExp(`${B_START}(?:sex|porn(?:o)?)${B_END}`, 'gi')
  },
  // English: BITCH / CUNT / ASSHOLE
  {
    name: 'bitch/asshole',
    regex: new RegExp(`${B_START}(?:bitch(?:es)?|cunt(?:s)?|asshole(?:s)?|dumbass|jackass)${B_END}`, 'gi')
  },
  // English: DICK / PUSSY / HENTAI
  {
    name: 'dick/pussy',
    regex: new RegExp(`${B_START}(?:dick(?:s)?|pussy|hentai)${B_END}`, 'gi')
  },
  // English: WHORE / SLUT / BASTARD
  {
    name: 'whore/slut',
    regex: new RegExp(`${B_START}(?:whore(?:s)?|slut(?:s)?|bastard(?:s)?)${B_END}`, 'gi')
  },
  // Vietnamese sexually explicit & vulgar phrases
  {
    name: 'vulgar_phrases',
    regex: new RegExp(`${B_START}(?:dâm\\s+dục|thủ\\s+dâm|sóc\\s+lọ|nứng\\s+(?:lồn|cặc)|chó\\s+đẻ|chó\\s+chết|mẹ\\s+mày|bán\\s+dâm|gái\\s+gọi)${B_END}`, 'gi')
  }
];

/**
 * Filter text and replace only straight/direct vulgar words with asterisks (***),
 * while safely protecting verified innocent phrases like "lon nước", "lon bia", "ví dụ", "vui lòng", "các bạn", "buổi sáng".
 * Obfuscated bypasses (lách luật) are preserved so natural conversation isn't broken;
 * they are handled via community reporting (Tố cáo).
 */
export function censorProfanity(text: string): { cleanText: string; hasProfanity: boolean; matchCount: number; detectedList: string[] } {
  if (!text) return { cleanText: '', hasProfanity: false, matchCount: 0, detectedList: [] };

  const lowerText = text.toLowerCase();

  // Pre-calculate exact start and end boundaries of all known innocent phrases
  const innocentSpans: { start: number; end: number }[] = [];
  for (const phrase of INNOCENT_PHRASES_LIST) {
    let searchPos = 0;
    while (searchPos < lowerText.length) {
      const idx = lowerText.indexOf(phrase, searchPos);
      if (idx === -1) break;
      innocentSpans.push({ start: idx, end: idx + phrase.length });
      searchPos = idx + phrase.length;
    }
  }

  // Check if a matched range [matchStart, matchEnd] is fully enclosed inside a verified innocent phrase
  const isInsideInnocent = (matchStart: number, matchEnd: number): boolean => {
    return innocentSpans.some(span => matchStart >= span.start && matchEnd <= span.end);
  };

  let clean = text;
  let matchCount = 0;
  const detectedList: string[] = [];

  for (const item of STRAIGHT_PROFANITY_PATTERNS) {
    const rx = new RegExp(item.regex.source, item.regex.flags);
    clean = clean.replace(rx, (match, offset) => {
      const trimmed = match.trim();
      // Guard against false positives on tiny 1-letter accidental matches
      if (trimmed.length < 2) return match;

      // Whitelist check: innocent sounds like "Hmmmm", "hmm", "haha", "uhm", etc.
      if (INNOCENT_SOUNDS_REGEX.test(trimmed)) {
        return match;
      }

      // Check if this match is strictly part of an innocent phrase
      // (e.g. "lon" in "lon nước" is protected, but "cái lồn" is CENSORED!)
      const matchStart = offset;
      const matchEnd = offset + match.length;
      if (isInsideInnocent(matchStart, matchEnd)) {
        return match;
      }

      matchCount++;
      detectedList.push(match);
      return '*'.repeat(Math.max(3, match.length));
    });
  }

  return {
    cleanText: clean,
    hasProfanity: matchCount > 0,
    matchCount,
    detectedList
  };
}

/**
 * Extract external links or URLs from text and identify suspicious links
 */
export function extractAndCheckLinks(text: string): { links: string[]; suspiciousLinks: string[] } {
  if (!text) return { links: [], suspiciousLinks: [] };

  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  const links = Array.from(new Set(matches));

  const suspiciousIndicators = [
    'bit.ly', 'tinyurl', 't.co', 'cutt.ly', 'is.gd', 'free-', 'hack',
    'gift', 'steam-gift', 'robux', 'login-', 'verify-', 'banking', '000webhost',
    '.xyz', '.top', '.ru', '.pw'
  ];

  const suspiciousLinks = links.filter(link => {
    const lower = link.toLowerCase();
    return suspiciousIndicators.some(ind => lower.includes(ind)) || /^(https?:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(lower);
  });

  return { links, suspiciousLinks };
}

/**
 * Comprehensive Automated Audit result for DEV CLOUD Assistant
 */
export interface ContentAuditReport {
  riskLevel: 'clean' | 'warning' | 'danger';
  riskScore: number; // 0 (safe) - 100 (critical violation)
  summary: string;
  violationsFound: {
    type: 'profanity_bypass' | 'suspicious_link' | 'toxic_phrase';
    detectedWord: string;
    description: string;
  }[];
  suggestedAction: string;
}

/**
 * Perform a deep audit on a user's combined messages and contents
 */
export function runDevContentAudit(messages: { text: string; rawText?: string; id?: string; createdAt?: string }[]): ContentAuditReport {
  let riskScore = 0;
  const violationsFound: ContentAuditReport['violationsFound'] = [];
  const bypassKeywords = new Set<string>();
  const suspiciousUrls = new Set<string>();

  for (const msg of messages) {
    const textToCheck = msg.rawText || msg.text;
    if (!textToCheck) continue;

    // Check profanities & bypass attempts
    const { detectedList } = censorProfanity(textToCheck);
    if (detectedList.length > 0) {
      for (const word of detectedList) {
        if (!bypassKeywords.has(word)) {
          bypassKeywords.add(word);
          const isObfuscated = /[._\-*~#\s]/.test(word) && word.length > 3;
          violationsFound.push({
            type: 'profanity_bypass',
            detectedWord: word,
            description: isObfuscated
              ? `Cố tình lách luật (chèn dấu phân cách: "${word}")`
              : `Từ ngữ thô tục vi phạm tiêu chuẩn ("${word}")`
          });
          riskScore += isObfuscated ? 35 : 25;
        }
      }
    }

    // Check links
    const { suspiciousLinks } = extractAndCheckLinks(msg.text);
    for (const sLink of suspiciousLinks) {
      if (!suspiciousUrls.has(sLink)) {
        suspiciousUrls.add(sLink);
        violationsFound.push({
          type: 'suspicious_link',
          detectedWord: sLink,
          description: `Liên kết ngoài đáng ngờ hoặc rút gọn độc hại: ${sLink}`
        });
        riskScore += 40;
      }
    }
  }

  // Cap riskScore
  riskScore = Math.min(100, riskScore);

  let riskLevel: ContentAuditReport['riskLevel'] = 'clean';
  let summary = 'Nội dung tin nhắn người dùng lành mạnh, không phát hiện từ lách luật hay link độc hại.';
  let suggestedAction = 'Không cần xử lý kỷ luật. Người dùng tuân thủ nội quy.';

  if (riskScore >= 60 || violationsFound.length >= 3) {
    riskLevel = 'danger';
    summary = `🔴 Phát hiện ${violationsFound.length} vi phạm nghiêm trọng (từ tục tĩu lách luật / link độc hại). Cần xem xét áp dụng hình thức kỷ luật ngay.`;
    suggestedAction = 'Khuyến nghị: Áp dụng Kỷ luật (Cảnh cáo nếu lần 1, Banned 3 ngày nếu lần 2, Banned 6 tháng nếu lần 3).';
  } else if (riskScore > 0 || violationsFound.length > 0) {
    riskLevel = 'warning';
    summary = `🟡 Phát hiện ${violationsFound.length} dấu hiệu vi phạm nhẹ hoặc từ ngữ nhạy cảm. Cần theo dõi thêm.`;
    suggestedAction = 'Khuyến nghị: Gửi Cảnh cáo hoặc xóa các tin nhắn vi phạm.';
  }

  return {
    riskLevel,
    riskScore,
    summary,
    violationsFound,
    suggestedAction
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
 * Perform rapid client-side check on uploaded images.
 * Avoids aggressive false-positive pixel color purging on normal selfies / portraits.
 * Extreme cases or bad actors are reported by users via the "Tố cáo" (Report) feature.
 */
export async function scanImageHeuristics(dataUrl: string, fileName = ''): Promise<ImageModerationResult> {
  // Check clearly explicit 18+ filenames (e.g. porn.mp4, xxx.png, hentai.jpg)
  const lowerName = fileName.toLowerCase();
  const explicitKeywordRegex = /(?:^|[._\-\s])(?:porn|hentai|xxx|sex_video|khoa_than|nude_photo|dam_duc)(?:[._\-\s]|$)/i;
  
  if (explicitKeywordRegex.test(lowerName)) {
    return {
      safe: false,
      reason: 'Tệp đã bị từ chối do tên tệp chứa từ khóa khiêu dâm 18+ rõ ràng.',
      category: 'nsfw_sex'
    };
  }

  // Allow normal images, portraits, and photos to pass through smoothly without blocking users
  return { safe: true, category: 'clean' };
}

/**
 * Comprehensive Image Moderation:
 * Combines local heuristic scan + server AI check when available.
 */
export async function moderateUploadedImage(dataUrl: string, fileName = ''): Promise<ImageModerationResult> {
  // If no base64 dataUrl (e.g., heavy file awaiting server upload or HEIC), allow pass through
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { safe: true, category: 'clean' };
  }

  // 1. Fast local heuristic scan (catches obvious porn keyword filenames)
  const localScan = await scanImageHeuristics(dataUrl, fileName);
  if (!localScan.safe) {
    return localScan;
  }

  // 2. Try calling server-side moderation if endpoint exists
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

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
          reason: data.reason || 'Ảnh đã tự động bị hủy khỏi nội dung gửi do vi phạm tiêu chuẩn nghiêm cấm.',
          category: data.category || 'nsfw_sex'
        };
      }
    }
  } catch {
    // If server is not reachable, timed out or in offline mode, fall back to safe pass
  }

  return { safe: true, category: 'clean' };
}
