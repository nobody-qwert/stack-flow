/**
 * @fileoverview Share-link services: encode/decode diagram state into URL hash
 *
 * Uses LZ-String to compress the JSON and store it in the hash as #d=...
 * - No backend required, works on GitHub Pages.
 * - Keeps URLs reasonably short via compression.
 */

import { exportDiagramForShare, importDiagram } from './persistence.js';

function getShareBaseUrl() {
  try {
    const meta = document.querySelector('meta[name="app-canonical-base"]');
    const content = meta?.getAttribute('content');
    if (content) {
      return content;
    }
  } catch {}
  return window.location.origin + window.location.pathname + window.location.search;
}

/**
 * Ensure LZ-String is available on window.
 * Dynamically loads from CDN if not already present.
 * @returns {Promise<typeof window.LZString>}
 */
function ensureLZString() {
  if (typeof window !== 'undefined' && window.LZString) {
    return Promise.resolve(window.LZString);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-lib="lz-string"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.LZString));
      existing.addEventListener('error', () => reject(new Error('Failed to load LZ-String')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js';
    script.async = true;
    script.defer = true;
    script.dataset.lib = 'lz-string';
    script.onload = () => resolve(window.LZString);
    script.onerror = () => reject(new Error('Failed to load LZ-String'));
    document.head.appendChild(script);
  });
}

/**
 * Parse hash params into an object.
 * Example: "#d=abc&x=1" -> { d: "abc", x: "1" }
 */
function parseHashParams() {
  const hash = window.location.hash || '';
  const s = hash.startsWith('#') ? hash.slice(1) : hash;
  const out = {};
  if (!s) return out;
  s.split('&').forEach(pair => {
    const [k, v = ''] = pair.split('=');
    if (!k) return;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

/**
 * Build a shareable URL containing the compressed diagram JSON in the hash.
 * @param {number} [maxUrlLength=15000] - Safety guard to avoid overly long URLs
 * @returns {Promise<string>} - The full URL to copy/share
 */
export async function buildShareUrlFromState(maxUrlLength = 15000) {
  const LZ = await ensureLZString();
  // Use share payload that includes BOTH compact (v/t/n/e) and long (version/title/nodes/edges)
  const json = exportDiagramForShare(false);
  const token = LZ.compressToEncodedURIComponent(json);
  const base = getShareBaseUrl();
  const url = `${base}#d=${token}`;

  if (url.length > maxUrlLength) {
    throw new Error('Diagram is too large to share via URL. Use Export JSON instead.');
  }
  return url;
}

/**
 * Attempt to import diagram from URL hash if present.
 * If successful, it clears the hash to prevent repeat imports.
 * @returns {Promise<boolean>} True if imported from URL, else false
 */
export async function importFromUrlIfPresent() {
  try {
    const params = parseHashParams();
    const token = params.d;
    if (!token) {
      return false;
    }
    const LZ = await ensureLZString();
    const json = LZ.decompressFromEncodedURIComponent(token);
    if (!json) {
      alert('Failed to decode shared diagram link.');
      return false;
    }
    const ok = importDiagram(json);
    if (ok) {
      // Remove the hash so refresh doesn't re-import
      try {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      } catch {}
    }
    return ok;
  } catch (err) {
    console.error('importFromUrlIfPresent error:', err);
    alert('Failed to import from shared link: ' + (err?.message || err));
    return false;
  }
}

/**
 * Copy text to clipboard with fallbacks.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }

  // Fallback: temporary textarea
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) {
        throw new Error('execCommand copy failed');
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}
