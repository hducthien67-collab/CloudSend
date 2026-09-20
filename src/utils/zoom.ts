// Utility for managing Web and Taskbar Zoom / Scale
// Integrates with "Ctrl + Mouse Wheel" zoom and provides UI controls

const ZOOM_STORAGE_KEY = 'cloudsend_ui_zoom_scale';
// Default to 1.0 (100%) standard scale
const DEFAULT_DESKTOP_ZOOM = 1.00;
const DEFAULT_MOBILE_ZOOM = 1.00;

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getDefaultZoom(): number {
  return isMobileDevice() ? DEFAULT_MOBILE_ZOOM : DEFAULT_DESKTOP_ZOOM;
}

export function getSavedZoom(): number {
  if (typeof window === 'undefined') return 1.0;

  const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
  if (saved) {
    const val = parseFloat(saved);
    if (!isNaN(val) && val >= 0.50 && val <= 2.00) {
      return Math.round(val * 100) / 100;
    }
  }

  return getDefaultZoom();
}

export function applyZoom(scale: number): number {
  if (typeof document === 'undefined') return scale;

  // Clamp scale between 50% (0.50) and 200% (2.00)
  const clamped = Math.min(2.00, Math.max(0.50, Math.round(scale * 100) / 100));

  try {
    // Apply CSS zoom to documentElement so entire page and sticky taskbar scale synchronously
    (document.documentElement as any).style.zoom = clamped.toString();
  } catch (err) {
    console.warn('CSS zoom not supported:', err);
    const baseSize = 16 * clamped;
    document.documentElement.style.fontSize = `${baseSize}px`;
  }

  document.documentElement.style.setProperty('--app-scale', clamped.toString());

  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, clamped.toString());
  } catch (err) {
    // Ignore storage errors in private mode
  }

  // Broadcast event for Navbar and other UI components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cloudsend-zoom-change', { detail: { zoom: clamped } }));
  }

  return clamped;
}

export function changeZoomBy(delta: number): number {
  const current = getSavedZoom();
  const next = Math.round((current + delta) * 100) / 100;
  return applyZoom(next);
}

export function resetZoom(): number {
  const def = getDefaultZoom();
  return applyZoom(def);
}
