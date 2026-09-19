import { DeviceType } from '../types';

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
    return 'mobile';
  }
  if (/macintosh|mac os x/i.test(ua)) {
    return 'laptop';
  }
  return 'desktop';
}

export function generateDefaultDeviceName(type: DeviceType): string {
  const adjectives = ['Bạc Hà', 'Biển Xanh', 'Hổ Phách', 'Ngọc Bích', 'Sao Băng', 'Tia Chớp', 'Bình Minh', 'Đêm Trăng'];
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const typeMap: Record<DeviceType, string> = {
    laptop: 'Laptop',
    desktop: 'PC',
    mobile: 'Điện Thoại',
    tablet: 'Tablet'
  };
  return `${typeMap[type]} ${randomAdj}`;
}

export const AVATAR_COLORS = [
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#14B8A6', // Teal
];

export function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
