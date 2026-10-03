export type DeviceType = 'laptop' | 'desktop' | 'mobile' | 'tablet' | 'tv';

export interface UserDevice {
  uid: string;
  email: string;
  username?: string;
  dob?: string;
  gender?: 'Nam' | 'Nữ' | 'Không Muốn Trả Lời' | string;
  displayName: string;
  deviceName: string;
  deviceType: DeviceType;
  avatarColor: string;
  customAvatarUrl?: string;
  customDesignData?: string;
  createdAt: string;
  lastSeen?: string;
  status?: 'online' | 'busy' | 'away';
  currentRoomId?: string;
  isEmailVerified?: boolean;
  linkedEmail?: string;
  emailVerifiedAt?: string;
}

export interface EmailVerificationRecord {
  id: string;
  uid: string;
  email: string;
  code: string; // 6-digit code
  createdAt: string;
  expiresAt: string; // ISO string 15 minutes after creation
  expiresTimestamp: number; // ms timestamp
  isUsed: boolean;
  usedAt?: string;
}

export interface PresenceDevice {
  uid: string;
  deviceId?: string;
  connectCode?: string;
  displayName: string;
  deviceName: string;
  deviceType: DeviceType;
  avatarColor?: string;
  customAvatarUrl?: string;
  status: string;
  lastSeen: string;
  lastSeenMs?: number;
  lastSeenServer?: any;
  currentRoomId?: string;
}

export interface RoomMember {
  uid: string;
  displayName: string;
  deviceName: string;
  avatarColor: string;
  role: 'owner' | 'member';
  joinedAt: string;
  email?: string;
  isDev?: boolean;
}

export interface ChatRoom {
  id: string;
  name: string;
  code: string;
  isPrivate?: boolean;
  avatar?: string;
  avatarColor?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  description?: string;
  ownerId?: string;
  ownerName?: string;
  members?: RoomMember[];
  membersCount?: number;
}

export interface ChatAttachment {
  name: string;
  size: number;
  type: string;
  data: string; // base64 thumbnail or data
  url?: string; // direct download/stream URL for heavy files
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderEmail?: string;
  senderDevice: string;
  text: string;
  rawText?: string; // Original unmasked text preserved for Dev Cloud audit
  isDevMessage?: boolean;
  hasProfanity?: boolean;
  detectedProfanity?: string[];
  fileData?: string;
  fileUrl?: string; // Direct server file URL
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  attachments?: ChatAttachment[];
  createdAt: string;
  timestamp?: number;
  serverTimestamp?: any;
  isSelfDestruct?: boolean;
  selfDestructDuration?: number; // 0 for view-once, > 0 for seconds (e.g. 10, 30)
  viewedBy?: string[];
  destroyed?: boolean;
  deletedBySender?: boolean;
  isDeletedBySender?: boolean;
  deletedAt?: string;
  hasWarning?: boolean;
  isReported?: boolean;
}

export interface DirectTransfer {
  id: string;
  senderId: string;
  senderName: string;
  senderDevice: string;
  receiverId: string;
  receiverName: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileData?: string; // Base64 thumbnail or direct data
  fileUrl?: string; // Server download/streaming URL for heavy files
  textContent?: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: string;
}

export interface CloudDriveFile {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  name: string;
  size: number;
  type: string;
  url: string;
  viewUrl?: string;
  thumbnail?: string;
  category?: 'image' | 'video' | 'audio' | 'document' | 'other';
  isFavorite?: boolean;
  createdAt: string;
}

export type DpiScaleMode = 'auto' | 'compact' | 'standard' | 'large' | 'xlarge' | 'tv_125' | 'tv_150' | 'tv_175' | 'tv_200';

export interface AppSettings {
  deviceName: string;
  deviceType: DeviceType;
  avatarColor: string;
  autoAccept: boolean;
  soundEnabled: boolean;
  dpiScaleMode?: DpiScaleMode;
  tvModeEnabled?: boolean;
  tvDpiScale?: number; // Zoom multiplier: 1.0, 1.25, 1.4, 1.5, 1.75, 2.0
  themeStyle?: string;
  customBadgeText?: string;
  customBio?: string;
  cardStyle?: 'glass' | 'glow' | 'minimal' | 'solid';
  customHexColor?: string;
  customAvatarUrl?: string;
  customDesignData?: string;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

export interface LoginSession {
  id: string;
  uid: string;
  deviceName: string;
  deviceType: DeviceType;
  browser?: string;
  location: string;
  ipMasked?: string;
  loginAt: string;
  lastActive: string;
  isCurrent?: boolean;
}

export type SanctionLevel = 'warn' | 'chat_lock_15m' | 'chat_lock_1h' | 'ban_1d' | 'ban_3d' | 'ban_7d' | 'ban_6m' | 'ban_perm';

export interface UserSanction {
  uid: string;
  email: string;
  displayName: string;
  violationCount: number;
  lastSanctionType: SanctionLevel;
  severityLevel?: 'light' | 'medium' | 'high' | 'critical' | 'permanent';
  reason: string;
  remindText?: string;
  ruleViolated?: string;
  bannedAt?: string;
  banExpiresAt?: string | null; // null for permanent
  isBanned: boolean;
  isChatLocked?: boolean;
  chatLockExpiresAt?: string | null;
  history?: Array<{
    type: SanctionLevel;
    reason: string;
    remindText?: string;
    ruleViolated?: string;
    timestamp: string;
    actedBy: string;
  }>;
}

export interface ContentReport {
  id: string;
  roomId: string;
  roomName?: string;
  messageId: string;
  messageText: string;
  messageRawText?: string;
  senderId: string;
  senderName: string;
  senderDevice?: string;
  reportedByUid: string;
  reportedByName: string;
  reason: string;
  category?: 'profanity_bypass' | 'nsfw_18' | 'harassment' | 'spam' | 'other';
  createdAt: string;
  timestamp?: number;
  status: 'pending' | 'resolved' | 'dismissed';
  resolution?: string;
  resolvedAt?: string;
}
