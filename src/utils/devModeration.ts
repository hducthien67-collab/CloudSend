import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, onSnapshot, writeBatch, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserSanction, SanctionLevel } from '../types';

// The authorized Developer Email who owns the app and Cloud administration
export const DEV_EMAIL = 'hducthien67@gmail.com';

/**
 * Check if a user is the authorized DEV
 */
export function isDevUser(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === DEV_EMAIL.toLowerCase();
}

// Sanction configurations with polished, authoritative Roblox safety community wording
export const SANCTION_TIERS = {
  level_1: {
    type: 'chat_lock_15m' as SanctionLevel,
    durationMs: 15 * 60 * 1000, // 15 mins
    label: 'Mức 1 (Nhẹ): Cảnh báo & Khóa chat 15 phút',
    remind: 'Hệ thống an toàn CLSend ghi nhận lời nói của bạn chưa phù hợp với Tiêu chuẩn Cộng đồng. Lần này chỉ nhắc nhở nhẹ thôi nhé, hãy luôn giữ thái độ lịch sự, văn minh và tôn trọng mọi người trong các cuộc trò chuyện nha :))',
    severity: 'light' as const,
  },
  level_2: {
    type: 'chat_lock_1h' as SanctionLevel,
    durationMs: 60 * 60 * 1000, // 1 hour
    label: 'Mức 2 (Trung bình): Cấm chat 1 tiếng',
    remind: 'Bạn đã được hệ thống nhắc nhở trước đó nhưng vẫn tiếp tục tái phạm. Tính năng trò chuyện của bạn tạm thời bị khóa 1 giờ để suy ngẫm và đọc lại Nội quy trước khi tiếp tục :((',
    severity: 'medium' as const,
  },
  level_3: {
    type: 'ban_1d' as SanctionLevel,
    durationMs: 24 * 60 * 60 * 1000, // 1 day
    label: 'Mức 3 (Cao): Khóa tài khoản 1 ngày (24 Giờ)',
    remind: 'Cảnh cáo nhiều lần rồi vẫn chưa chịu nghiêm túc tuân thủ sao? Toàn bộ tài khoản của bạn bị đình chỉ truy cập trong 24 giờ để tự chấn chỉnh hành vi >:(',
    severity: 'high' as const,
  },
  level_4: {
    type: 'ban_7d' as SanctionLevel,
    durationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    label: 'Mức 4 (Nặng): Khóa 7 ngày (Cảnh báo cuối cùng)',
    remind: 'ĐÂY LÀ LẦN CẢNH BÁO CUỐI CÙNG! Tài khoản của bạn bị khóa 7 ngày. Nếu còn vi phạm thêm bất kỳ 1 lần nào nữa, tài khoản và thiết bị sẽ bị CẤM VĨNH VIỄN khỏi hệ thống!',
    severity: 'critical' as const,
  },
  level_perm: {
    type: 'ban_perm' as SanctionLevel,
    durationMs: null,
    label: 'Mức Tối Cao: Cấm tài khoản vĩnh viễn',
    remind: 'Tài khoản và thiết bị của bạn đã bị CẤM TRUY CẬP VĨNH VIỄN do tái phạm nhiều lần hoặc vi phạm tội phạm đặc biệt nghiêm trọng. Mọi quyền truy cập bị hủy bỏ vô thời hạn.',
    severity: 'permanent' as const,
  }
};

/**
 * Check if an email or uid has an active ban or chat lock
 */
export async function checkUserBanStatus(email?: string | null, uid?: string | null): Promise<{
  isBanned: boolean;
  isChatLocked?: boolean;
  sanction?: UserSanction;
  message?: string;
}> {
  try {
    const checkDoc = (sanction: UserSanction) => {
      const now = Date.now();
      // Check ban expiration
      if (sanction.isBanned) {
        if (sanction.banExpiresAt) {
          const expTime = new Date(sanction.banExpiresAt).getTime();
          if (now > expTime) {
            return { isBanned: false, isChatLocked: false, sanction };
          }
        }
        const banDurationLabel = 
          sanction.lastSanctionType === 'ban_1d' ? '1 NGÀY' :
          sanction.lastSanctionType === 'ban_3d' ? '3 NGÀY' :
          sanction.lastSanctionType === 'ban_7d' ? '7 NGÀY' :
          sanction.lastSanctionType === 'ban_6m' ? '6 THÁNG' : 'VĨNH VIỄN';

        return {
          isBanned: true,
          isChatLocked: true,
          sanction,
          message: `Tài khoản đã bị DEV CẤM (${banDurationLabel}). Nhắc nhở: "${sanction.remindText || sanction.reason || 'Vi phạm tiêu chuẩn cộng đồng'}". Hệ thống từ chối đăng nhập.`
        };
      }

      // Check chat lock expiration
      if (sanction.isChatLocked) {
        if (sanction.chatLockExpiresAt) {
          const expTime = new Date(sanction.chatLockExpiresAt).getTime();
          if (now > expTime) {
            return { isBanned: false, isChatLocked: false, sanction };
          }
        }
        return {
          isBanned: false,
          isChatLocked: true,
          sanction,
          message: `Tài khoản đang bị tạm khóa chat. Nhắc nhở từ DEV: "${sanction.remindText || sanction.reason}".`
        };
      }

      return null;
    };

    // Check by email
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const emailDocId = encodeURIComponent(cleanEmail).replace(/\./g, '_');
      const snap = await getDoc(doc(db, 'sanctions', emailDocId));
      if (snap.exists()) {
        const res = checkDoc(snap.data() as UserSanction);
        if (res) return res;
      }
    }

    // Check by uid
    if (uid) {
      const snap = await getDoc(doc(db, 'sanctions', uid));
      if (snap.exists()) {
        const res = checkDoc(snap.data() as UserSanction);
        if (res) return res;
      }
    }
  } catch (err) {
    console.warn('Error checking ban status:', err);
  }

  return { isBanned: false, isChatLocked: false };
}

/**
 * Apply Dev Sanction with specific tier & custom Roblox payload
 */
export async function applyTierSanction(params: {
  targetUid: string;
  targetEmail: string;
  targetDisplayName: string;
  tier: 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_perm';
  customReason?: string;
  customRemindText?: string;
  ruleViolated?: string;
  offensiveItem?: string;
  offensiveItemTimestamp?: string;
  devEmail: string;
}): Promise<UserSanction> {
  const { 
    targetUid, 
    targetEmail, 
    targetDisplayName, 
    tier, 
    customReason, 
    customRemindText,
    ruleViolated, 
    offensiveItem,
    offensiveItemTimestamp,
    devEmail 
  } = params;
  const cleanEmail = (targetEmail || '').trim().toLowerCase();
  const config = SANCTION_TIERS[tier];
  const now = new Date();

  // Fetch current history
  let currentCount = 0;
  let prevHistory: any[] = [];
  try {
    const snap = await getDoc(doc(db, 'sanctions', targetUid));
    if (snap.exists()) {
      const data = snap.data() as UserSanction;
      currentCount = data.violationCount || 0;
      prevHistory = data.history || [];
    }
  } catch (err) {
    console.warn('Notice reading sanction history:', err);
  }

  const newCount = currentCount + 1;
  const isBanTier = tier === 'level_3' || tier === 'level_4' || tier === 'level_perm';
  const expiresAt = config.durationMs ? new Date(now.getTime() + config.durationMs).toISOString() : null;
  const remindMessage = customRemindText?.trim() || config.remind;

  const historyItem = {
    type: config.type,
    reason: customReason || config.label,
    remindText: remindMessage,
    ruleViolated: ruleViolated || '',
    offensiveItem: offensiveItem || '',
    timestamp: now.toISOString(),
    actedBy: devEmail,
    senderName: targetDisplayName || cleanEmail || 'Người dùng'
  };

  const sanctionData: UserSanction = {
    uid: targetUid,
    email: cleanEmail,
    displayName: targetDisplayName,
    senderName: targetDisplayName || cleanEmail || 'Người dùng',
    senderEmail: cleanEmail,
    actedBy: devEmail,
    violationCount: newCount,
    lastSanctionType: config.type,
    severityLevel: config.severity,
    reason: customReason || config.label,
    remindText: remindMessage,
    ruleViolated: ruleViolated || '',
    offensiveItem: offensiveItem || '',
    offensiveItemTimestamp: offensiveItemTimestamp || now.toISOString(),
    bannedAt: isBanTier ? now.toISOString() : undefined,
    banExpiresAt: isBanTier ? expiresAt : null,
    isBanned: isBanTier,
    isChatLocked: true,
    chatLockExpiresAt: expiresAt,
    history: [historyItem, ...prevHistory]
  };

  // Save under UID
  await setDoc(doc(db, 'sanctions', targetUid), sanctionData);

  // If email is present, save under emailDocId too
  if (cleanEmail) {
    const emailDocId = encodeURIComponent(cleanEmail).replace(/\./g, '_');
    await setDoc(doc(db, 'sanctions', emailDocId), sanctionData);
  }

  // Send direct system notification to user
  try {
    const notifId = `dev-alert-${Date.now()}`;
    await setDoc(doc(db, 'user_notifications', notifId), {
      id: notifId,
      targetUid,
      targetEmail: cleanEmail,
      title: isBanTier ? `🚨 KỶ LUẬT DEV: ${config.label.toUpperCase()}` : `⚠️ CẢNH BÁO DEV: ${config.label.toUpperCase()}`,
      message: remindMessage,
      reason: customReason || config.label,
      ruleViolated: ruleViolated || '',
      offensiveItem: offensiveItem || '',
      createdAt: now.toISOString(),
      timestamp: now.getTime(),
      level: config.type,
      read: false
    });
  } catch (err) {
    console.warn('Could not post user notification:', err);
  }

  return sanctionData;
}

/**
 * Apply Dev Sanction to a user according to the rule:
 * - Lần 1: Cảnh cáo (Warn)
 * - Lần 2: Banned trong 3 ngày
 * - Lần 3: Banned trong 6 tháng
 * - Lần 4+: Banned VĨNH VIỄN
 */
export async function applyDevSanction(params: {
  targetUid: string;
  targetEmail: string;
  targetDisplayName: string;
  reason: string;
  devEmail: string;
}): Promise<UserSanction> {
  const { targetUid, targetEmail, targetDisplayName, reason, devEmail } = params;
  const cleanEmail = targetEmail.trim().toLowerCase();
  const emailDocId = encodeURIComponent(cleanEmail).replace(/\./g, '_');

  // 1. Fetch current sanction status from Firestore
  let currentCount = 0;
  let prevHistory: any[] = [];

  try {
    const snap = await getDoc(doc(db, 'sanctions', emailDocId));
    if (snap.exists()) {
      const data = snap.data() as UserSanction;
      currentCount = data.violationCount || 0;
      prevHistory = data.history || [];
    }
  } catch (err) {
    console.warn('Fetch previous sanction notice:', err);
  }

  const newCount = currentCount + 1;
  let sanctionLevel: SanctionLevel = 'warn';
  let isBanned = false;
  let banExpiresAt: string | null = null;
  const now = new Date();

  if (newCount === 1) {
    // Lần 1: Cảnh cáo
    sanctionLevel = 'warn';
    isBanned = false;
  } else if (newCount === 2) {
    // Lần 2: Banned 3 ngày
    sanctionLevel = 'ban_3d';
    isBanned = true;
    const exp = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    banExpiresAt = exp.toISOString();
  } else if (newCount === 3) {
    // Lần 3: Banned 6 tháng (~180 ngày)
    sanctionLevel = 'ban_6m';
    isBanned = true;
    const exp = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    banExpiresAt = exp.toISOString();
  } else {
    // Lần 4+: Banned VĨNH VIỄN
    sanctionLevel = 'ban_perm';
    isBanned = true;
    banExpiresAt = null; // forever
  }

  const historyItem = {
    type: sanctionLevel,
    reason: reason.trim() || 'Nội dung không hợp lệ / vi phạm tiêu chuẩn cộng đồng',
    timestamp: now.toISOString(),
    actedBy: devEmail
  };

  const sanctionData: UserSanction = {
    uid: targetUid,
    email: cleanEmail,
    displayName: targetDisplayName,
    violationCount: newCount,
    lastSanctionType: sanctionLevel,
    reason: reason.trim() || 'Vi phạm tiêu chuẩn cộng đồng',
    bannedAt: isBanned ? now.toISOString() : undefined,
    banExpiresAt,
    isBanned,
    history: [historyItem, ...prevHistory]
  };

  // Save both under email doc ID and uid doc ID so any query catches it
  await setDoc(doc(db, 'sanctions', emailDocId), sanctionData);
  if (targetUid && targetUid !== emailDocId) {
    await setDoc(doc(db, 'sanctions', targetUid), sanctionData);
  }

  // Also post an immediate system warning notification to the user's incoming transfers/notifications
  try {
    const notifId = `dev-alert-${Date.now()}`;
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      targetUid,
      targetEmail: cleanEmail,
      title: isBanned 
        ? `🚨 TÀI KHOẢN ĐÃ BỊ DEV KHÓA (${sanctionLevel === 'ban_3d' ? '3 NGÀY' : sanctionLevel === 'ban_6m' ? '6 THÁNG' : 'VĨNH VIỄN'})`
        : `⚠️ CẢNH CÁO TỪ DEV (LẦN 1)`,
      message: `DEV gửi cảnh báo/kỷ luật: "${reason}". Vi phạm lần ${newCount}. ${
        isBanned ? 'Bạn bị cấm đăng nhập và chat.' : 'Nếu vi phạm lần 2 bạn sẽ bị Banned 3 ngày!'
      }`,
      createdAt: now.toISOString(),
      level: sanctionLevel
    });
  } catch (err) {
    console.warn('Could not post dev notification:', err);
  }

  return sanctionData;
}

/**
 * Remove or reset a user's sanction (Dev Unban)
 */
export async function removeDevSanction(email: string, uid?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const emailDocId = encodeURIComponent(cleanEmail).replace(/\./g, '_');
  try {
    if (cleanEmail) {
      await deleteDoc(doc(db, 'sanctions', emailDocId));
    }
    if (uid) {
      await deleteDoc(doc(db, 'sanctions', uid));
    }
  } catch (err) {
    console.error('Error removing sanction:', err);
  }
}

export interface RuleViolationFinding {
  ruleNumber: string;
  ruleTitle: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string;
  explanation: string;
}

export interface AiEvaluationResult {
  hasViolation: boolean;
  score: number; // 0 - 100
  recommendedTier: 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_perm' | null;
  recommendedLabel: string;
  remindMessage: string;
  findings: RuleViolationFinding[];
  summary: string;
  analyzedMessagesCount: number;
}

/**
 * AI Audit Engine evaluating user behavior and messages against the 12 Community Rules
 */
export function evaluateUserWith12Rules(
  messages: Array<{ text?: string; rawText?: string; hasProfanity?: boolean; attachments?: any[] }>,
  reports: Array<{ reason?: string; category?: string }>,
  currentSanction?: UserSanction | null
): AiEvaluationResult {
  const findings: RuleViolationFinding[] = [];
  let score = 0;
  const analyzedCount = messages.length;

  // Patterns for 12 rules
  const rulePatterns = [
    // Luật 1: Xúc phạm danh dự & Lăng mạ cá nhân
    {
      ruleNumber: 'Luật 1',
      ruleTitle: 'Xúc phạm danh dự & Lăng mạ cá nhân',
      severity: 'medium' as const,
      regex: /\b(ngu|chó|súc vật|óc chó|đần|khùng|thằng chó|con đĩ|mẹ mày|bố mày)\b/i,
      score: 25,
      explanation: 'Sử dụng từ ngữ xúc phạm danh dự, hạ nhục người khác.'
    },
    // Luật 2: Cố tình lách luật & Ngụy trang từ ngữ tục tĩu
    {
      ruleNumber: 'Luật 2',
      ruleTitle: 'Cố tình lách luật & Ngụy trang từ ngữ tục tĩu',
      severity: 'low' as const,
      regex: /(d[._ -]i[._ -]t|f[._ -]u[._ -]c[._ -]k|c[._ -]a[._ -]c|l[._ -]o[._ -]n|s[._ -]e[._ -]x|d[j1]t|vcl|dkm|cailon|daubuoi|d3o)/i,
      score: 20,
      explanation: 'Cố ý ngắt âm dấu chấm/gạch hoặc teencode để lách bộ lọc.'
    },
    // Luật 3: Kỳ thị vùng miền, tôn giáo & Kích động thù hận
    {
      ruleNumber: 'Luật 3',
      ruleTitle: 'Kỳ thị vùng miền, tôn giáo & Kích động thù hận',
      severity: 'high' as const,
      regex: /(bắc kỳ|nam kỳ|trung kỳ|phân biệt vùng miền|bắc cầy|nam cầy|dân bắc|dân nam)/i,
      score: 50,
      explanation: 'Phát ngôn kỳ thị vùng miền, tôn giáo hoặc chia rẽ cộng đồng.'
    },
    // Luật 4: Quấy rối tình dục & Gạ gẫm thô thiển
    {
      ruleNumber: 'Luật 4',
      ruleTitle: 'Quấy rối tình dục & Gạ gẫm thô thiển',
      severity: 'high' as const,
      regex: /(gạ|show hàng|cho xem ảnh nude|gạ tình|bú|chịch|nude|chat sex)/i,
      score: 50,
      explanation: 'Có hành vi gạ tình, đòi ảnh nhạy cảm hoặc quấy rối tình dục.'
    },
    // Luật 5: Phát tán văn hóa phẩm đồi trụy, 18+ & Khiêu dâm
    {
      ruleNumber: 'Luật 5',
      ruleTitle: 'Phát tán văn hóa phẩm 18+ & Khiêu dâm',
      severity: 'critical' as const,
      regex: /(hentai|porn|jav|phim sex|clip nóng|lộ clip|khiêu dâm|loanchuan)/i,
      score: 80,
      explanation: 'Phát tán hình ảnh, liên kết hoặc video đồi trụy 18+.'
    },
    // Luật 6: Hình ảnh bạo lực cực đoan, kinh dị & Tự hại
    {
      ruleNumber: 'Luật 6',
      ruleTitle: 'Bạo lực cực đoan, kinh dị & Tự hại',
      severity: 'critical' as const,
      regex: /(tự tử|chém chết|giết người|máu me|xác chết|cắt cổ|đâm chết|chế tạo bom)/i,
      score: 80,
      explanation: 'Nội dung đe dọa tước đoạt tính mạng, cổ súy bạo lực hoặc tự sát.'
    },
    // Luật 7: Phát tán virus, mã độc & Đường dẫn lừa đảo (Phishing)
    {
      ruleNumber: 'Luật 7',
      ruleTitle: 'Phát tán virus, mã độc & Phishing',
      severity: 'critical' as const,
      regex: /(\.exe|\.bat|\.vbs|\.scr|trojan|hack acc|nhận kim cương miễn phí|nhan-qua-free|free-robux)/i,
      score: 85,
      explanation: 'Phát tán tệp độc hại hoặc liên kết giả mạo lừa đảo tài khoản.'
    },
    // Luật 8: Xâm phạm dữ liệu cá nhân & Bí mật đời tư (Doxxing)
    {
      ruleNumber: 'Luật 8',
      ruleTitle: 'Xâm phạm dữ liệu cá nhân & Doxxing',
      severity: 'high' as const,
      regex: /(số cccd|số cmnd|lộ cccd|lộ thông tin nhà|doxx|địa chỉ nhà nó ở)/i,
      score: 45,
      explanation: 'Đăng tải thông tin cá nhân hoặc đe dọa doxxing người khác.'
    },
    // Luật 9: Spam tin nhắn & Phá hoại băng thông hệ thống
    {
      ruleNumber: 'Luật 9',
      ruleTitle: 'Spam tin nhắn & Phá hoại hệ thống',
      severity: 'medium' as const,
      regex: /(spam|muhahaha|ha+ha+ha+|he+he+he+|[a-z0-9]{30,})/i,
      score: 30,
      explanation: 'Gửi tin nhắn lặp lại vô nghĩa hoặc spam liên tiếp.'
    },
    // Luật 10: Mạo danh Quản trị viên (Admin/Dev) & Lừa đảo
    {
      ruleNumber: 'Luật 10',
      ruleTitle: 'Mạo danh Admin / Quản trị viên',
      severity: 'high' as const,
      regex: /(tôi là dev|tôi là admin|ban quản trị yêu cầu|cung cấp mã pin|gửi mật khẩu cho dev)/i,
      score: 60,
      explanation: 'Tự xưng là Admin/DEV để lừa đảo hoặc ép buộc người dùng.'
    }
  ];

  // 1. Quét tin nhắn
  const textSample = messages.map(m => (m.rawText || m.text || '')).join(' \n ');
  for (const pattern of rulePatterns) {
    const match = textSample.match(pattern.regex);
    if (match) {
      score += pattern.score;
      findings.push({
        ruleNumber: pattern.ruleNumber,
        ruleTitle: pattern.ruleTitle,
        severity: pattern.severity,
        evidence: `Trích xuất: "${match[0]}"`,
        explanation: pattern.explanation
      });
    }
  }

  // Quét báo cáo từ người dùng khác
  if (reports && reports.length > 0) {
    score += reports.length * 15;
    findings.push({
      ruleNumber: 'Báo cáo',
      ruleTitle: 'Bị thành viên khác tố cáo',
      severity: reports.length >= 3 ? 'high' : 'medium',
      evidence: `${reports.length} lượt tố cáo`,
      explanation: `Nhận được ${reports.length} báo cáo vi phạm nội quy từ cộng đồng.`
    });
  }

  // Tái phạm từ lịch sử phạt
  const prevViolations = currentSanction?.violationCount || 0;
  if (prevViolations > 0) {
    score += prevViolations * 20;
    findings.push({
      ruleNumber: 'Luật 12',
      ruleTitle: 'Tiền sử vi phạm & Tái phạm',
      severity: prevViolations >= 3 ? 'critical' : 'medium',
      evidence: `Đã có ${prevViolations} lần kỷ luật trước đó`,
      explanation: 'Có lịch sử từng bị DEV xử lý hoặc cảnh cáo.'
    });
  }

  // 2. Suy luận mức độ phạt
  let recommendedTier: 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_perm' | null = null;
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasHigh = findings.some(f => f.severity === 'high');

  if (prevViolations >= 4 || (prevViolations >= 2 && hasCritical)) {
    // Tái phạm lần nữa ở mức độ nghiêm trọng -> BANNED VĨNH VIỄN
    recommendedTier = 'level_perm';
  } else if (hasCritical || prevViolations >= 3 || score >= 80) {
    // Mức 4: Khóa 7 ngày
    recommendedTier = 'level_4';
  } else if (hasHigh || prevViolations >= 2 || score >= 50) {
    // Mức 3: Banned 1 ngày
    recommendedTier = 'level_3';
  } else if (findings.length >= 2 || prevViolations >= 1 || score >= 25) {
    // Mức 2: Cấm chat 1 tiếng
    recommendedTier = 'level_2';
  } else if (findings.length > 0 || score > 0) {
    // Mức 1: Khóa chat 15 phút
    recommendedTier = 'level_1';
  }

  const tierConfig = recommendedTier ? SANCTION_TIERS[recommendedTier] : null;

  return {
    hasViolation: findings.length > 0,
    score: Math.min(score, 100),
    recommendedTier,
    recommendedLabel: tierConfig?.label || 'Chưa phát hiện vi phạm',
    remindMessage: tierConfig?.remind || '',
    findings,
    summary: findings.length > 0
      ? `AI phát hiện ${findings.length} dấu hiệu vi phạm (${findings.map(f => f.ruleNumber).join(', ')}). Khuyên dùng: ${tierConfig?.label}.`
      : 'AI không tìm thấy từ ngữ hoặc hành vi vi phạm 12 điều luật.',
    analyzedMessagesCount: analyzedCount
  };
}

/**
 * Send private message / notification from DEV to a specific user
 */
export async function sendPrivateDevNotification(params: {
  targetUid: string;
  targetEmail?: string;
  targetName?: string;
  message: string;
  devEmail: string;
}) {
  const { targetUid, targetEmail, targetName, message, devEmail } = params;
  const now = new Date();
  const notifId = `priv-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const payload = {
    id: notifId,
    targetUid,
    targetEmail: (targetEmail || '').trim().toLowerCase(),
    targetName: targetName || 'Người dùng',
    senderUid: 'dev-master',
    senderEmail: devEmail,
    senderName: 'Quản Trị Viên (DEV)',
    title: '📩 Thông báo riêng từ Quản Trị Viên (DEV)',
    message: message.trim(),
    createdAt: now.toISOString(),
    timestamp: now.getTime(),
    type: 'private_dev_message',
    read: false
  };

  try {
    // Write to both notifications and user_notifications for full compatibility
    await setDoc(doc(db, 'notifications', notifId), payload);
    await setDoc(doc(db, 'user_notifications', notifId), payload);
  } catch (err) {
    console.warn('Notice writing private notification:', err);
  }

  return payload;
}

/**
 * Call server-side AI audit proxy or fallback to local rule-engine
 */
export async function callAiAuditUser(params: {
  userId: string;
  userName?: string;
  userEmail?: string;
  messages: Array<{ text?: string; rawText?: string; fileName?: string; createdAt?: string }>;
  reports: Array<{ reason?: string; category?: string }>;
  violationHistoryCount?: number;
  currentSanction?: UserSanction | null;
}): Promise<AiEvaluationResult> {
  const { userId, userName, userEmail, messages, reports, violationHistoryCount, currentSanction } = params;

  try {
    const res = await fetch('/api/ai-audit-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        userName,
        userEmail,
        messages,
        reports,
        violationHistoryCount: violationHistoryCount || (currentSanction?.violationCount || 0)
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return {
          hasViolation: !!data.hasViolation,
          score: data.hasViolation ? (data.severity === 'critical' ? 95 : data.severity === 'high' ? 70 : data.severity === 'medium' ? 45 : 25) : 0,
          recommendedTier: data.recommendedTier,
          recommendedLabel: data.recommendedAction || data.matchedRule || 'Chưa phát hiện vi phạm',
          remindMessage: data.remindText || '',
          findings: data.hasViolation ? [{
            ruleNumber: data.ruleNumber || '12 Luật',
            ruleTitle: data.matchedRule || 'Nội quy cộng đồng',
            severity: data.severity === 'critical' ? 'critical' : data.severity === 'high' ? 'high' : 'medium',
            evidence: data.evidenceSummary || 'Phát hiện bởi AI',
            explanation: data.reasoning || 'Vi phạm điều luật cộng đồng'
          }] : [],
          summary: data.reasoning || data.recommendedAction || 'Đã kiểm tra qua AI',
          analyzedMessagesCount: messages.length
        };
      }
    }
  } catch (err) {
    console.warn('Server AI audit proxy unavailable, running in-browser evaluation:', err);
  }

  // Fallback to client-side rule engine
  return evaluateUserWith12Rules(messages, reports, currentSanction);
}

/**
 * Format chat timeline date header in Vietnamese (e.g. "Hôm nay, Thứ Hai • 27/02/2026")
 */
export function formatGroupDateHeader(dateInput: string | number | Date | any): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayOfWeek = daysOfWeek[d.getDay()];
  const dateFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  if (isToday) {
    return `Hôm nay, ${dayOfWeek} • ${dateFormatted}`;
  }
  if (isYesterday) {
    return `Hôm qua, ${dayOfWeek} • ${dateFormatted}`;
  }
  return `${dayOfWeek} • ${dateFormatted}`;
}

/**
 * Returns date grouping key "YYYY-MM-DD"
 */
export function getGroupDateKey(dateInput: string | number | Date | any): string {
  if (!dateInput) return 'unknown';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Checks if message timestamp is from today (since 00:00:00 today)
 */
export function isMessageFromToday(dateInput: string | number | Date | any): boolean {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

/**
 * Returns ISO string for the start of yesterday (00:00:00.000 local time)
 */
export function getYesterdayStartIso(): string {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
  return yesterday.toISOString();
}

/**
 * Checks if a message timestamp is from today or yesterday
 */
export function isMessageFromTodayOrYesterday(dateInput: string | number | Date | any): boolean {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
  return d.getTime() >= yesterday.getTime();
}

/**
 * Server Reset for DEV:
 * Deletes all messages or messages older than 7 days in the specified room to prevent server lag.
 */
export async function resetRoomMessagesServer(
  roomId: string,
  mode: 'all' | 'older_than_7_days',
  operatorName = 'Quản trị viên DEV'
): Promise<{ deletedCount: number; success: boolean; message: string }> {
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const snap = await getDocs(messagesRef);
    if (snap.empty) {
      return { deletedCount: 0, success: true, message: 'Phòng hiện không có tin nhắn nào để reset.' };
    }

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    
    const docsToDelete = snap.docs.filter(docSnap => {
      if (mode === 'all') return true;
      const data = docSnap.data();
      const msgTime = new Date(data.createdAt || 0).getTime();
      return (now - msgTime) > SEVEN_DAYS_MS;
    });

    if (docsToDelete.length === 0) {
      return { 
        deletedCount: 0, 
        success: true, 
        message: mode === 'older_than_7_days' 
          ? 'Không có tin nhắn nào cũ hơn 1 tuần (7 ngày) trong phòng này.' 
          : 'Không có tin nhắn để xóa.' 
      };
    }

    // Batch delete in chunks of 400
    const chunkSize = 400;
    for (let i = 0; i < docsToDelete.length; i += chunkSize) {
      const chunk = docsToDelete.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Send server reset announcement
    try {
      const cleanModeText = mode === 'all' 
        ? 'toàn bộ tin nhắn phòng trò chuyện' 
        : 'các tin nhắn cũ hơn 1 tuần (7 ngày)';
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderId: 'system-server-reset',
        senderName: '👑 MÁY CHỦ CLOUDSEND (DEV)',
        senderDevice: 'Máy chủ Hệ thống',
        text: `⚡ ${operatorName} đã hoàn tất RESET MÁY CHỦ: Đã xóa sạch ${docsToDelete.length} tin nhắn (${cleanModeText}) để tối ưu hóa hiệu năng, giải phóng bộ nhớ và chống giật lag.`,
        createdAt: new Date().toISOString(),
        isDevMessage: true,
        isSystemMessage: true
      });
    } catch (annError) {
      console.warn('Could not post system reset announcement:', annError);
    }

    return {
      deletedCount: docsToDelete.length,
      success: true,
      message: `Đã reset máy chủ thành công! Đã xóa ${docsToDelete.length} tin nhắn để giải phóng lag.`
    };
  } catch (err: any) {
    console.error('Reset server error:', err);
    return {
      deletedCount: 0,
      success: false,
      message: err.message || 'Lỗi khi reset máy chủ.'
    };
  }
}

/**
 * Automatically prunes messages older than 7 days if weekly auto-clean is enabled
 */
export async function autoPruneWeeklyMessages(roomId: string): Promise<number> {
  try {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const snap = await getDocs(messagesRef);
    if (snap.empty) return 0;

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const oldDocs = snap.docs.filter(docSnap => {
      const data = docSnap.data();
      const msgTime = new Date(data.createdAt || 0).getTime();
      return (now - msgTime) > SEVEN_DAYS_MS;
    });

    if (oldDocs.length === 0) return 0;

    const chunkSize = 400;
    for (let i = 0; i < oldDocs.length; i += chunkSize) {
      const chunk = oldDocs.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    return oldDocs.length;
  } catch (e) {
    console.warn('Auto prune weekly messages failed:', e);
    return 0;
  }
}

