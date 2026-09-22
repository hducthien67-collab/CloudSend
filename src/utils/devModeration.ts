import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
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

/**
 * Check if an email or uid has an active ban
 */
export async function checkUserBanStatus(email?: string | null, uid?: string | null): Promise<{
  isBanned: boolean;
  sanction?: UserSanction;
  message?: string;
}> {
  try {
    // Check by email (docId is emailKey or sanitized email)
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const emailDocId = encodeURIComponent(cleanEmail).replace(/\./g, '_');
      const snap = await getDoc(doc(db, 'sanctions', emailDocId));
      if (snap.exists()) {
        const sanction = snap.data() as UserSanction;
        if (sanction.isBanned) {
          // Check expiration
          if (sanction.banExpiresAt) {
            const expTime = new Date(sanction.banExpiresAt).getTime();
            if (Date.now() > expTime) {
              // Ban expired!
              return { isBanned: false, sanction };
            }
          }
          const banDurationLabel = 
            sanction.lastSanctionType === 'ban_3d' ? '3 ngày' :
            sanction.lastSanctionType === 'ban_6m' ? '6 tháng' : 'VĨNH VIỄN';

          return {
            isBanned: true,
            sanction,
            message: `Tài khoản (${cleanEmail}) đã bị DEV CẤM (BANNED ${banDurationLabel}) do vi phạm tiêu chuẩn cộng đồng (Lần ${sanction.violationCount}). Lý do: "${sanction.reason || 'Nội dung vi phạm quy chuẩn'}". Hệ thống từ chối đăng nhập.`
          };
        }
      }
    }

    // Also check by uid if provided
    if (uid) {
      const snap = await getDoc(doc(db, 'sanctions', uid));
      if (snap.exists()) {
        const sanction = snap.data() as UserSanction;
        if (sanction.isBanned) {
          if (sanction.banExpiresAt) {
            const expTime = new Date(sanction.banExpiresAt).getTime();
            if (Date.now() > expTime) {
              return { isBanned: false, sanction };
            }
          }
          const banDurationLabel = 
            sanction.lastSanctionType === 'ban_3d' ? '3 ngày' :
            sanction.lastSanctionType === 'ban_6m' ? '6 tháng' : 'VĨNH VIỄN';

          return {
            isBanned: true,
            sanction,
            message: `Tài khoản này đã bị DEV CẤM (BANNED ${banDurationLabel}). Lý do: "${sanction.reason || 'Vi phạm nội dung'}".`
          };
        }
      }
    }
  } catch (err) {
    console.warn('Error checking ban status:', err);
  }

  return { isBanned: false };
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
    await deleteDoc(doc(db, 'sanctions', emailDocId));
    if (uid) {
      await deleteDoc(doc(db, 'sanctions', uid));
    }
  } catch (err) {
    console.error('Error removing sanction:', err);
  }
}
