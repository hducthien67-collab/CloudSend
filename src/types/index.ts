export type DeviceType = 'laptop' | 'desktop' | 'mobile' | 'tablet' | 'tv';

export interface UserDevice {
  uid: string;
  email: string;
  displayName: string;
  deviceName: string;
  deviceType: DeviceType;
  avatarColor: string;
  createdAt: string;
  lastSeen?: string;
  status?: 'online' | 'busy' | 'away';
  currentRoomId?: string;
}

export interface PresenceDevice {
  uid: string;
  displayName: string;
  deviceName: string;
  deviceType: DeviceType;
  avatarColor?: string;
  status: string;
  lastSeen: string;
  currentRoomId?: string;
}

export interface RoomMember {
  uid: string;
  displayName: string;
  deviceName: string;
  avatarColor: string;
  role: 'owner' | 'member';
  joinedAt: string;
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
  data: string; // base64
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderDevice: string;
  text: string;
  rawText?: string; // Original unmasked text preserved for Dev Cloud audit
  hasProfanity?: boolean;
  detectedProfanity?: string[];
  fileData?: string;
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
  fileData?: string;
  textContent?: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
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
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

export type SanctionLevel = 'warn' | 'ban_3d' | 'ban_6m' | 'ban_perm';

export interface UserSanction {
  uid: string;
  email: string;
  displayName: string;
  violationCount: number; // 1 = warned, 2 = 3 days ban, 3 = 6 months ban, 4+ = permanent ban
  lastSanctionType: SanctionLevel;
  reason: string;
  bannedAt?: string;
  banExpiresAt?: string | null; // null for permanent
  isBanned: boolean;
  history?: Array<{
    type: SanctionLevel;
    reason: string;
    timestamp: string;
    actedBy: string;
  }>;
}
