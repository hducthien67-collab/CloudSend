export type DpiScaleMode = 'auto' | 'compact' | 'standard' | 'large' | 'xlarge';

export interface DeviceDpiInfo {
  pixelRatio: number;
  estimatedDpi: number;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  effectiveScale: number;
}

export function getDeviceDpiInfo(mode: DpiScaleMode = 'auto'): DeviceDpiInfo {
  if (typeof window === 'undefined') {
    return {
      pixelRatio: 1,
      estimatedDpi: 96,
      screenWidth: 1920,
      screenHeight: 1080,
      windowWidth: 1920,
      windowHeight: 1080,
      effectiveScale: 1,
    };
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const estimatedDpi = Math.round(pixelRatio * 96);
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  let effectiveScale = 1.0;
  switch (mode) {
    case 'compact':
      effectiveScale = 0.90;
      break;
    case 'standard':
      effectiveScale = 1.0;
      break;
    case 'large':
      effectiveScale = 1.10;
      break;
    case 'xlarge':
      effectiveScale = 1.25;
      break;
    case 'auto':
    default:
      // Calibrate auto scale based on DPI and viewport size
      // High density phones (dpr >= 2.6 and narrow screen <= 380px)
      if (windowWidth <= 380 && pixelRatio >= 2.5) {
        effectiveScale = 0.95;
      } else if (windowWidth >= 1920 && pixelRatio === 1) {
        effectiveScale = 1.05;
      } else {
        effectiveScale = 1.0;
      }
      break;
  }

  return {
    pixelRatio,
    estimatedDpi,
    screenWidth,
    screenHeight,
    windowWidth,
    windowHeight,
    effectiveScale,
  };
}

export function applyDpiScale(mode: DpiScaleMode = 'auto') {
  if (typeof document === 'undefined') return;

  const info = getDeviceDpiInfo(mode);
  const baseFontSize = 16 * info.effectiveScale;
  
  // Set root font-size so standard Tailwind rem calculations scale proportionally
  document.documentElement.style.fontSize = `${baseFontSize}px`;
  document.documentElement.style.setProperty('--app-scale', info.effectiveScale.toString());
  document.documentElement.style.setProperty('--device-pixel-ratio', info.pixelRatio.toString());
}
