// Moderation utility for text and image content
// Enforces rules:
// 1. Text: Censors profanity/vulgar words even when obfuscated with dots, spaces, dashes, symbols (e.g. f.u.c.k, d.i.t, v.l)
// 2. Images: Blocks strong 18+ (sex / explicit pornography / heavy nudity) and extreme gore (severe bloodshed/mutilation)
//    while allowing normal fictional horror / dark art / halloween style.

// Common separator character set used for obfuscation (dots, spaces, dashes, underscores, symbols)
const S = '[\\s._\\-*~#%^&@=,:/|\\\\()"\'>+<`!$?\\[\\]{}]*';

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
  'cm', 'mm', 'dm', 'km', 'kg', 'ml', 'admin', 'welcome', 'đi tới', 'di toi', 'đi tiếp', 'di tiep'
];

// Anti-obfuscation profanity regular expressions (catches real vulgar words, bypasses, leetspeak, dots, dashes)
// Covers both with diacritics and without diacritics (cai lon, cailon, cac, buoi, dit, du, etc.)
const ANTI_OBFUSCATION_PATTERNS: { name: string; regex: RegExp }[] = [
  // English: FUCK (fuck, f.u.c.k, f u c k, f_u_c_k, f*u*c*k, fuk, f.u.k, phuck, f.u.c.k.i.n.g, motherfucker)
  {
    name: 'fuck/f.u.c.k',
    regex: new RegExp(`${B_START}(?:m[o0]ther${S})?(?:f+|ph)${S}[uưúùụủũûü0v@]+h?${S}[ck]+h?(?:${S}[ck]+)?(?:${S}(?:ing|er|ed|in|s))?${B_END}`, 'gi')
  },
  // Vietnamese: ĐỊT / DIT (địt, dit, d.i.t, đ.ị.t, d i t, d_i_t, djt, dyt, ditme, d.i.t.m.e, dit con me, dit cu)
  // Strictly bounded to avoid matching "edit", "credit", "audit", "đi tới", "đi tiếp"
  {
    name: 'dit/d.i.t',
    regex: new RegExp(`${B_START}(?:[đd]${S}[ịiíìĩỉjyy1!]+${S}[tct7]+(?:${S}(?:m[eẹ]|c[oụ]|b[aà]|con${S}m[eẹ]|m[aà]y|c[uụ]|nh[aà]))?|[đd]\\.[iị]\\.[tct]|djt|dyt|ditme|d\\.i\\.t\\.m\\.e)${B_END}`, 'gi')
  },
  // Vietnamese: ĐỤ / DU (đụ, đ.ụ, đ ụ, đụ má, đụ mẹ, du ma, duma, dume, đ.ụ.m.á)
  // Protected against innocent words like "du lịch", "dù sao", "ví dụ", "mặc dù" via exact span checking
  {
    name: 'du/đ.ụ',
    regex: new RegExp(`${B_START}(?:đ${S}ụ|[đd]${S}[uụúùủũ]+${S}(?:m[aáàạảã]+|m[eẹ]|m[oóò]a|b[aà]|c[oụ])|[đd]\\.[uụ]\\.m\\.[aá]|[đd]\\.[uụ])${B_END}`, 'gi')
  },
  // Vietnamese: ĐM / DKM / DCM / CMM / DMM (đm, dm, đ.m, d.m, dkm, đkm, d.k.m, dcm, đcm, đmm, dmm)
  {
    name: 'dm/d.m/dkm',
    regex: new RegExp(`${B_START}(?:[đd]${S}[kKcChH]${S}[mM]|[đd]${S}[mM]{1,3}|[đd]\\.[mM]|d\\.[kK]\\.[mM]|[cC]${S}[mM]{2,3}|[cC]${S}[mM]${S}[nN](?:${S}[rR])?)${B_END}`, 'gi')
  },
  // Vietnamese: VL / VCL / VKL / VCC / VLON (vl, v.l, vcl, v.c.l, vkl, v.k.l, vcc, vlon)
  {
    name: 'vl/v.l/vcl',
    regex: new RegExp(`${B_START}(?:v${S}[ck]${S}[lL]|v${S}[ck]${S}[ck]|v${S}l(?:${S}[oồô0]${S}n)|v\\.[ck]\\.[lL]|v\\.[lL])${B_END}`, 'gi')
  },
  // Vietnamese: LỒN / LON / CAI LON (lồn, l.o.n, l.ồ.n, l o n, cailon, cái lồn, cái lon, cai lon, con lon, con lồn, ăn lồn, bú lồn, hãm lồn, nứng lồn)
  // Catches all profanity while protecting legitimate beverage cans (lon nước, lon bia, 1 lon, etc.) via exact innocent span checking!
  {
    name: 'lon/l.o.n',
    regex: new RegExp(`${B_START}(?:(?:c[aáàạảã]i${S}|con${S})l${S}[oồốổỗộ0]+${S}n|(?:[aăắằẳẵặáàảãạ]n|b[uúùủũụ]|h[aáàạảã]m|m[aăặắằẳẵạáà]t|x[aáàạảã]m|r[aáàạảã]ch|n[uứừửữựúùủũụ]ng|đ[uụúùủũ]|du)${S}l${S}[oồốổỗộ0]+${S}n|l${S}[oồốổỗộ0]+${S}n${S}(?:m[eẹ]|m[aà]y|t[oọóò]|qu[eéèẹẻẽ]|bu[ồo]i|[ck][aặ]c)|l\\.o\\.n|l\\.ồ\\.n|l[ồốổỗộ0]+n|lon)${B_END}`, 'gi')
  },
  // Vietnamese: CẶC / CAC / KẶC (cặc, kặc, c.ặ.c, c.a.c, cái cặc, cái cac, con cặc, con cac, ăn cặc, bú cặc, như cặc, đầu cặc)
  // Protected against innocent words like "các bạn", "các anh", "các file" via exact innocent span checking
  {
    name: 'cac/c.a.c',
    regex: new RegExp(`${B_START}(?:(?:c[aáàạảã]i${S}|con${S})[ck]${S}[aăặậ4@]+${S}[ckct]+|(?:[aăắằẳẵặáàảãạ]n|b[uúùủũụ]|nh[uưúùủũụ]|đ[aâầấẩẫậ]u)${S}[ck]${S}[aăặậ4@]+${S}[ckct]+|[ck]${S}[aăặ]+${S}[ck]+${S}(?:bu[ồo]i|l[oồ]n|m[eẹ]|m[aà]y)|c\\.ặ\\.c|c\\.a\\.c|[ck][ặậ]c)${B_END}`, 'gi')
  },
  // Vietnamese: BUỒI / BUOI (buồi, buoi, b.u.ồ.i, b.u.o.i, con buồi, con buoi, cái buồi, cái buoi, đầu buồi, dau buoi, như buồi, nhu buoi, ăn buồi)
  // Protected against innocent words like "buổi sáng", "buổi trưa", "trái bưởi" via exact innocent span checking
  {
    name: 'buoi/b.u.o.i',
    regex: new RegExp(`${B_START}(?:(?:c[aáàạảã]i${S}|con${S}|đ[aâầấẩẫậ]u|nh[uưúùủũụ]|[aăắằẳẵặáàảãạ]n)${S}b${S}[uưúùủũ]+${S}[oồốộ0]+${S}[iịíìĩỉy]+|b${S}[uưúùủũ]+${S}[ồốộ]+${S}[iịíìĩỉy]+|b\\.u\\.ồ\\.i|b\\.u\\.o\\.i|bu[ồo]i${S}[ck][aặ]c)${B_END}`, 'gi')
  },
  // Vietnamese: CU / BÚ CU / CON CU (bú cu, bu cu, con cu, cái cu, liếm cu, bóp cu, sóc cu)
  {
    name: 'cu/bucu',
    regex: new RegExp(`${B_START}(?:(?:b[uúùủũụ]|li[eêéèẹẻẽ]m|b[oóòỏõọ]p|s[oóòỏõọ]c)${S}(?:con${S}|c[aáàạảã]i${S})?c${S}[uưúùủũ]+|(?:con|c[aáàạảã]i)${S}c${S}[uưúùủũ]+|c\\.u)${B_END}`, 'gi')
  },
  // Vietnamese: ĐÉO / DEO (đéo, đ.é.o, đ e o, del, đel, đ.e.o)
  {
    name: 'deo/đ.é.o',
    regex: new RegExp(`${B_START}(?:[đd]${S}[éẹ3]+${S}[oóòỏõọ0]+|[đd]${S}[eéèẻẽẹ3]+${S}l+|đ\\.[ée]\\.[oó]|d\\.e\\.o)${B_END}`, 'gi')
  },
  // Vietnamese: CHỊCH (chịch, c.h.i.c.h, chich)
  {
    name: 'chich/c.h.i.c.h',
    regex: new RegExp(`${B_START}(?:ch${S}[iịíìĩỉj]+${S}ch|c\\.h\\.i\\.c\\.h)${B_END}`, 'gi')
  },
  // English: SEX / SEXX (sex, s.e.x, s e x, s_e_x, s*e*x, s3x)
  {
    name: 'sex/s.e.x',
    regex: new RegExp(`${B_START}[s$]${S}[eéèẻẽẹ3]+${S}x+${B_END}`, 'gi')
  },
  // English: PORN / PORNO (porn, p.o.r.n, p o r n, p0rn, p_o_r_n, porno)
  {
    name: 'porn/p.o.r.n',
    regex: new RegExp(`${B_START}p${S}[oóòỏõọôồố0]+${S}r+${S}n+(?:${S}[o0])?${B_END}`, 'gi')
  },
  // English: BITCH (bitch, b.i.t.c.h, b i t c h, b!tch, bitches)
  {
    name: 'bitch/b.i.t.c.h',
    regex: new RegExp(`${B_START}b${S}[iịíìĩỉ1!]+${S}t+${S}c+${S}h+(?:${S}es)?${B_END}`, 'gi')
  },
  // English: ASSHOLE / ASS (asshole, a.s.s.h.o.l.e, a$$hole)
  // Strictly bounded so it never matches "pass", "class", "glass", "asset", "assign"
  {
    name: 'asshole/a.s.s',
    regex: new RegExp(`${B_START}(?:a${S}[s$]{2}${S}h${S}[o0]${S}l${S}e|a\\.[s$]\\.[s$]|dumbass|jackass)${B_END}`, 'gi')
  },
  // English: DICK / PUSSY / HENTAI
  {
    name: 'dick/d.i.c.k',
    regex: new RegExp(`${B_START}d${S}[i1!]+${S}[ck]+h?(?:${S}[kc])?${B_END}`, 'gi')
  },
  {
    name: 'pussy/p.u.s.s.y',
    regex: new RegExp(`${B_START}p${S}[u0v]+${S}[s$]{2,4}${S}y${B_END}`, 'gi')
  },
  {
    name: 'hentai/h.e.n.t.a.i',
    regex: new RegExp(`${B_START}h${S}[e3]+${S}n+${S}t+${S}[a4@]+${S}[i1!y]+${B_END}`, 'gi')
  },
  // English: WHORE / SLUT / CUNT / BASTARD
  {
    name: 'whore/slut/cunt',
    regex: new RegExp(`${B_START}(?:wh${S}[o0]+${S}r+${S}[e3]+|sl${S}[u0v]+${S}t+|c${S}[u0v]+${S}n+${S}t+|b${S}[a4@]+${S}s+${S}t+${S}[a4@]+${S}r+${S}d+)${B_END}`, 'gi')
  },
  // Vietnamese sexually explicit & vulgar phrases
  {
    name: 'damduc/thudam/nung',
    regex: new RegExp(`${B_START}(?:d[aâ]m${S}d[uụ]c|th[uủ]${S}d[aâ]m|s[oóòỏõọ]c${S}l[oọóò]|n[uứ]ng${S}(?:l[oồ]n|c[aặ]c)|ch[oó]${S}[đd][eẻ]|ch[oó]${S}ch[eế]t|m[eẹ]${S}m[aà]y|b[aá]n${S}d[aâ]m|g[aá]i${S}g[oọ]i)${B_END}`, 'gi')
  }
];

/**
 * Filter text and replace any vulgar words with asterisks (***),
 * completely defeating bypass attempts like f.u.c.k, d.i.t, v.l, s.e.x, cai lon,
 * while safely protecting verified innocent phrases like "lon nước", "lon bia", "ví dụ", "vui lòng", "các bạn", "buổi sáng".
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

  for (const item of ANTI_OBFUSCATION_PATTERNS) {
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
      // (e.g. "lon" in "lon nước" is protected, but "cai lon" or "đụ má" in "ví dụ cai lon" is NOT, and is CENSORED!)
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
