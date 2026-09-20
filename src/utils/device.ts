import { DeviceType } from '../types';

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const screenW = typeof window.screen !== 'undefined' ? window.screen.width : window.innerWidth;
  const screenH = typeof window.screen !== 'undefined' ? window.screen.height : window.innerHeight;
  const minDim = Math.min(screenW, screenH);
  const maxDim = Math.max(screenW, screenH);

  // 1. Tablet Detection (iPad, Android Tablet, Kindle, etc.)
  const isTabletUA = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua);
  const isIPadOS = /macintosh|mac os x/i.test(ua) && maxTouchPoints > 1;
  const isTabletDimensions = maxTouchPoints > 0 && minDim >= 600 && maxDim <= 1366;
  
  if (isTabletUA || isIPadOS || isTabletDimensions) {
    return 'tablet';
  }

  // 2. Mobile Smartphone Detection
  const isMobileUA = /mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|android.*mobile/i.test(ua);
  const isMobileDimensions = (maxTouchPoints > 0 && minDim < 600) || window.innerWidth < 640;
  
  if (isMobileUA || isMobileDimensions) {
    return 'mobile';
  }

  // 3. Laptop vs Desktop
  // MacBooks / MacOS (since iPads are already caught above)
  if (/macintosh|mac os x/i.test(ua)) {
    return 'laptop';
  }

  // Laptops running Windows / Linux / ChromeOS:
  // Laptops usually have screens <= 1536px (13" to 15.6") or devicePixelRatio >= 1.25 (typical 125%-150% scaling)
  // or battery API present
  const isLikelyLaptopScreen = (maxDim <= 1600 && window.devicePixelRatio >= 1.2) || 
                               (window.innerWidth <= 1536 && maxTouchPoints <= 1);
  if (isLikelyLaptopScreen) {
    return 'laptop';
  }

  return 'desktop';
}

export function getDeviceTypeInfo(type: DeviceType): {
  type: DeviceType;
  label: string;
  subLabel: string;
  description: string;
} {
  switch (type) {
    case 'mobile':
      return {
        type: 'mobile',
        label: 'Điện thoại (Mobile)',
        subLabel: 'Thiết bị di động thông minh',
        description: 'Được tự động nhận diện theo phần cứng điện thoại'
      };
    case 'tablet':
      return {
        type: 'tablet',
        label: 'Máy tính bảng (Tablet)',
        subLabel: 'Thiết bị màn hình phẳng',
        description: 'Được tự động nhận diện theo phần cứng iPad / Máy tính bảng'
      };
    case 'laptop':
      return {
        type: 'laptop',
        label: 'Laptop (Máy tính xách tay)',
        subLabel: 'Máy tính xách tay',
        description: 'Được tự động nhận diện theo màn hình & phần cứng Laptop'
      };
    case 'desktop':
    default:
      return {
        type: 'desktop',
        label: 'PC (Máy tính để bàn)',
        subLabel: 'Máy tính bàn cố định',
        description: 'Được tự động nhận diện theo cấu hình máy tính để bàn'
      };
  }
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
