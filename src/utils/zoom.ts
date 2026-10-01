// Utility for managing Web and Taskbar Zoom / Scale
// Integrates with "Ctrl + Mouse Wheel" zoom and provides UI controls

// Reset any synthetic CSS zoom so the browser performs 100% native Google zoom (Ctrl + Mouse Wheel)
if (typeof document !== 'undefined') {
  try {
    (document.documentElement as any).style.zoom = '';
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--app-scale');
    localStorage.removeItem('cloudsend_ui_zoom_scale');
  } catch {
    // ignore
  }
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getDefaultZoom(): number {
  return 1.0;
}

export function getSavedZoom(): number {
  return 1.0;
}

export function applyZoom(scale: number): number {
  return 1.0;
}

export function changeZoomBy(delta: number): number {
  return 1.0;
}

export function resetZoom(): number {
  return 1.0;
}

