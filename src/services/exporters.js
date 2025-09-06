/**
 * @fileoverview Export services: PNG (viewport only, no grid)
 */


/**
 * Ensure html2canvas is available on window.
 * Dynamically loads from CDN if not already present.
 */
function ensureHtml2Canvas() {
  if (typeof window !== 'undefined' && window.html2canvas) {
    return Promise.resolve(window.html2canvas);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lib="html2canvas"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.html2canvas));
      existing.addEventListener('error', () => reject(new Error('Failed to load html2canvas')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async = true;
    script.defer = true;
    script.dataset.lib = 'html2canvas';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(script);
  });
}

/**
 * Download helper from Blob
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export exactly what is visible in the canvas viewport to PNG.
 * - Captures the #canvas element (which shows current pan/zoom)
 * - Temporarily hides the grid background on #content
 * - Forces white background
 * - Uses scale=2 for sharper output
 */
export async function exportViewportPng(filename = 'diagram.png') {
  const canvasViewportEl = document.getElementById('canvas');
  const contentEl = document.getElementById('content');
  if (!canvasViewportEl || !contentEl) {
    alert('Canvas not found.');
    return;
  }

  // Temporarily hide the grid dots (CSS background-image on #content)
  const prevInlineBg = contentEl.style.backgroundImage;
  contentEl.style.backgroundImage = 'none';

  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(canvasViewportEl, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('Failed to export PNG.');
        return;
      }
      downloadBlob(blob, filename);
    });
  } catch (err) {
    console.error('PNG export failed:', err);
    alert('PNG export failed: ' + (err?.message || err));
  } finally {
    // Restore grid
    contentEl.style.backgroundImage = prevInlineBg || '';
  }
}
