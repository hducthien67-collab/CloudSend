export type DeviceType = 'laptop' | 'desktop' | 'mobile' | 'tablet';

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

export type DpiScaleMode = 'auto' | 'compact' | 'standard' | 'large' | 'xlarge';

export interface AppSettings {
  deviceName: string;
  deviceType: DeviceType;
  avatarColor: string;
  autoAccept: boolean;
  soundEnabled: boolean;
  dpiScaleMode?: DpiScaleMode;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}
