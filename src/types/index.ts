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

export interface ChatRoom {
  id: string;
  name: string;
  code: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  description?: string;
  membersCount?: number;
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
  createdAt: string;
  timestamp?: number;
  serverTimestamp?: any;
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

export interface AppSettings {
  deviceName: string;
  deviceType: DeviceType;
  avatarColor: string;
  autoAccept: boolean;
  soundEnabled: boolean;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}
