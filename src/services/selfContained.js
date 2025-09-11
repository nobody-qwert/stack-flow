/**
 * @fileoverview Build and download a fully self-contained offline HTML with the current diagram embedded.
 * - Inlines CSS
 * - Inlines all JS modules via import map to data: URLs
 * - Embeds initial diagram JSON
 * - Inlines html2canvas so PNG export works offline
 * - Supports offline re-export by embedding raw module sources in base64
 */

import { exportDiagram } from './persistence.js';
import { store } from '../core/store.js';

/** Module list to include in the standalone artifact (relative to project root) */
const MODULE_PATHS = [
  // Entry
  'src/app.js',

  // Core
  'src/core/store.js',
  'src/core/eventBus.js',
  'src/core/commandStack.js',
  'src/core/types.js',
  'src/core/id.js',
  'src/core/normalizeTypes.js',

  // UI
  'src/ui/CanvasManager.js',
  'src/ui/NodeRenderer.js',
  'src/ui/EdgeRenderer.js',
  'src/ui/ConnectionManager.js',
  'src/ui/Inspector.js',

  // Services
  'src/services/persistence.js',
  'src/services/exporters.js',
  'src/services/validate.js',

  // This exporter (for offline re-export)
  'src/services/selfContained.js'
];

const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

/** Basic helpers */
function encodeBase64(str) {
  // Handle UTF-8 properly
  return btoa(unescape(encodeURIComponent(str)));
}
function decodeBase64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function toDataUrlJavascript(code) {
  return 'data:text/javascript;base64,' + encodeBase64(code);
}

function escapeForScriptTag(text) {
  // Prevent closing the containing script tag
  return text.replace(/<\/script/gi, '<\\/script').replace(/<\/script/gi, '<\\/script');
}

/** Path utilities (POSIX-like) */
function dirname(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}
function normalizePath(path) {
  const parts = [];
  path.split('/').forEach((seg) => {
    if (!seg || seg === '.') return;
    if (seg === '..') {
      if (parts.length) parts.pop();
      return;
    }
    parts.push(seg);
  });
  return parts.join('/');
}
function resolveRelative(fromPath, rel) {
  if (rel.startsWith('/')) {
    // Not expected in this project; treat as absolute without leading slash
    return normalizePath(rel.replace(/^\//, ''));
  }
  const baseDir = dirname(fromPath);
  return normalizePath((baseDir ? baseDir + '/' : '') + rel);
}

/**
 * Rewrite relative import/export specifiers to virtual absolute specifiers under "m:/"
 * Handles:
 *  - import ... from './x.js'
 *  - import './x.js'
 *  - export ... from './x.js'
 *  - import('./x.js')
 */
function rewriteImportsToVirtual(spec, code) {
  const srcPath = spec;

  const replaceStaticFrom = (match, prefix, q, path, suffix) => {
    const resolved = resolveRelative(srcPath, path);
    return `${prefix}${q}__m__/${resolved}${q}${suffix || ''}`;
  };

  // import ... from '...';
  code = code.replace(
    /(\bimport\s+[^'"]*?\sfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*;?)/g,
    (m, p1, q, rel, p4) => replaceStaticFrom(m, p1, q, rel, p4)
  );

  // import '...';
  code = code.replace(
    /(\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*;?)/g,
    (m, p1, q, rel, p4) => replaceStaticFrom(m, p1, q, rel, p4)
  );

  // export ... from '...';
  code = code.replace(
    /(\bexport\s+[^'"]*?\sfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*;?)/g,
    (m, p1, q, rel, p4) => replaceStaticFrom(m, p1, q, rel, p4)
  );

  // dynamic import('...')
  code = code.replace(
    /(import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\))/g,
    (m, p1, q, rel, p4) => replaceStaticFrom(m, p1, q, rel, p4)
  );

  return code;
}

/**
 * Try to read embedded module sources (base64) and html2canvas from the current document (for offline re-export).
 * Returns { filesBase64: Record<path, b64>, list: string[], html2canvasBase64?: string } or null
 */
function readEmbeddedSelfModules() {
  const el = document.getElementById('__SELF_MODULES__');
  if (!el) return null;
  try {
    const parsed = JSON.parse(el.textContent || '{}');
    if (parsed && parsed.filesBase64 && parsed.list && Array.isArray(parsed.list)) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

async function getHtml2CanvasCode() {
  // If embedded in current document, reuse for offline re-export
  const embedded = readEmbeddedSelfModules();
  if (embedded?.html2canvasBase64) {
    return decodeBase64(embedded.html2canvasBase64);
  }
  // Otherwise fetch from CDN (online)
  try {
    return await fetchText(HTML2CANVAS_CDN);
  } catch (e) {
    console.warn('Could not fetch html2canvas. PNG export may not work offline in the standalone HTML.', e);
    return '';
  }
}

/**
 * Resolve CSS text without relying on fetch() when opened via file://
 * - Prefer embedded cssBase64 from __SELF_MODULES__ (present in standalone exports)
 * - Then try reading inline style tag with id="__INLINE_CSS__"
 * - Finally, fallback to fetch('./assets/styles.css') for hosted app
 */
async function getCssText() {
  const embedded = readEmbeddedSelfModules();
  if (embedded?.cssBase64) {
    try {
      return decodeBase64(embedded.cssBase64);
    } catch (_) {
      // fall through
    }
  }
  const styleEl = document.getElementById('__INLINE_CSS__');
  if (styleEl && styleEl.textContent) {
    return styleEl.textContent;
  }
  try {
    return await fetchText('./assets/styles.css');
  } catch (e) {
    console.warn('Could not load CSS (offline/blocked). Proceeding with empty CSS.', e);
    return '';
  }
}

/**
 * Collect raw sources for all modules, either from embedded map or via fetch().
 * Returns { rawSources: Record<path, code>, list: string[] }
 */
async function collectModuleRawSources() {
  const embedded = readEmbeddedSelfModules();
  if (embedded) {
    const rawSources = {};
    for (const p of embedded.list) {
      const b64 = embedded.filesBase64[p];
      if (b64 != null) rawSources[p] = decodeBase64(b64);
    }
    return { rawSources, list: embedded.list.slice() };
  }

  // Otherwise fetch all known paths
  const rawSources = {};
  await Promise.all(
    MODULE_PATHS.map(async (p) => {
      rawSources[p] = await fetchText('./' + p);
    })
  );
  return { rawSources, list: MODULE_PATHS.slice() };
}

/**
 * Build import map from rewritten sources
 * Returns { importMap: {imports:{}}, rewrittenSources: Record<virtual, code> }
 */
function buildImportMapFromSources(rawSources) {
  const rewrittenSources = {};
  const imports = {};

  for (const [path, code] of Object.entries(rawSources)) {
    const rewritten = rewriteImportsToVirtual(path, code);
    const virtual = `__m__/${path}`;
    rewrittenSources[virtual] = rewritten;
    imports[virtual] = toDataUrlJavascript(rewritten);
  }

  return { importMap: { imports }, rewrittenSources };
}

function sanitizeTitleForHtml(title) {
  const s = (title == null ? 'diagram' : String(title));
  // Properly escape special characters for HTML context
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c]));
}

/**
 * Build the final standalone HTML
 */
function buildStandaloneHtml({ title, cssText, initialJson, importMap, html2canvasCode, embeddedRawModules }) {
  const safeTitle = sanitizeTitleForHtml(title || 'Untitled diagram');
  const cssSafe = cssText || '';
  const initialJsonSafe = escapeForScriptTag(initialJson || '{}');
  const importMapJson = JSON.stringify(importMap, null, 0);
  // Prepare embedded self-modules payload (base64-encoded sources and list)
  const filesBase64 = {};
  const list = Object.keys(embeddedRawModules || {}).sort();
  for (const p of list) {
    filesBase64[p] = encodeBase64(embeddedRawModules[p]);
  }
  const selfModulesPayload = {
    filesBase64,
    list,
    html2canvasBase64: html2canvasCode ? encodeBase64(html2canvasCode) : '',
    cssBase64: cssSafe ? encodeBase64(cssSafe) : ''
  };
  const selfModulesJsonSafe = escapeForScriptTag(JSON.stringify(selfModulesPayload));

  const html =
`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle} - Data Flow Designer</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style id="__INLINE_CSS__">
${cssSafe}
    </style>
  </head>
  <body>
    <div id="app">
      <header class="topbar">
        <div class="brand">Data Flow Designer</div>
        <button id="btnAbout" title="About" aria-label="About">ⓘ</button>
        <div class="diagram-title-container">
          <input type="text" id="diagramTitle" class="diagram-title" placeholder="Untitled diagram" />
        </div>
        <div class="actions">
          <button id="btnNewApi" title="Add API endpoint">+ API</button>
          <button id="btnNewTable" title="Add Postgres table">+ Table</button>
          <button id="btnNewModule" title="Add Module">+ Module</button>
          <span class="sep"></span>
          <button id="btnNewDiagram" title="Start a new blank diagram">New</button>
          <button id="btnImport" title="Import diagram JSON">Import</button>
          <span class="sep"></span>
          <button id="btnExport" title="Export diagram to JSON">Export</button>
          <button id="btnExportPng" title="Export visible canvas to PNG">Export PNG</button>
          <button id="btnExportHtml" title="Export as Offline HTML">Export HTML</button>
        </div>
      </header>

      <div class="main">
        <div class="canvas-wrap">
          <div id="canvas" class="canvas">
            <!-- Content is transformed by pan/zoom -->
            <div id="content" class="content" data-width="4000" data-height="3000">
              <!-- SVG edges underneath nodes -->
              <svg id="edges" class="edges" width="4000" height="3000" viewBox="0 0 4000 3000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
              <div id="nodes" class="nodes" role="region" aria-label="Nodes"></div>
              <svg id="edgesOverlay" class="edges-overlay" width="4000" height="3000" viewBox="0 0 4000 3000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
            </div>
          </div>
        </div>

        <aside class="inspector" id="inspector">
          <div id="inspectorBody">
            <p>Select a node, variable, or edge to edit details.</p>
          </div>
          <div id="inspectorFooter" class="inspector-footer">
            <label class="inspector-toggle">
              <input type="checkbox" id="toggleShowTypes" checked />
              <span>Show variable types</span>
            </label>
          </div>
        </aside>
      </div>
    </div>

    <input type="file" id="fileInput" accept="application/json" style="display:none" />

    <!-- About Modal -->
    <div id="aboutDialog" class="about-dialog hidden" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="dialog-overlay">
        <div class="dialog-content" role="document">
          <h3 id="aboutTitle">About Data Flow Designer</h3>
          <p style="margin: 0 0 12px 0;">Visual tool for building and sharing data flow diagrams.</p>
          <ul style="margin: 0 0 16px 18px; line-height: 1.6;">
            <li>Author: <a href="https://github.com/nobody-qwert" target="_blank" rel="noopener">nobody-qwert</a></li>
            <li>Repository: <a href="https://github.com/nobody-qwert/stack-flow" target="_blank" rel="noopener">stack-flow</a></li>
            <li>Discussions: <a href="https://github.com/nobody-qwert/stack-flow/discussions" target="_blank" rel="noopener">Open a discussion</a></li>
            <li>License: <a href="./LICENSE" target="_blank" rel="noopener">PolyForm Noncommercial 1.0.0</a></li>
          </ul>
          <div class="dialog-actions">
            <button id="aboutCloseBtn" class="primary">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Embedded initial diagram -->
    <script id="initial-diagram" type="application/json">${initialJsonSafe}</script>

    <!-- Embedded raw module sources (base64) for offline re-export -->
    <script id="__SELF_MODULES__" type="application/json">${selfModulesJsonSafe}</script>

    <!-- Import map with data: URLs -->
    <script type="importmap">
${importMapJson}
    </script>

    <!-- Inline html2canvas for offline PNG export -->
    <script>
${html2canvasCode || ''}
//# sourceURL=html2canvas.inline.js
    </script>

    <!-- Bootstrap: seed localStorage and start app -->
    <script type="module">
      (function() {
        try {
          const key = 'dataFlowDiagram';
          if (!localStorage.getItem(key)) {
            const el = document.getElementById('initial-diagram');
            if (el && el.textContent) {
              localStorage.setItem(key, el.textContent);
              localStorage.setItem(key + '_timestamp', Date.now().toString());
            }
          }
        } catch (e) {
          console.warn('Failed to seed localStorage from embedded diagram:', e);
        }
        // Start app
        import('__m__/src/app.js');
      })();
    </script>
  </body>
</html>`;

  return html;
}

/**
 * Download helper
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'diagram.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Public API: Export current diagram as a fully self-contained HTML file.
 */
export async function exportStandaloneHtml(filename = 'diagram.html') {
  // 1) Collect current diagram JSON (compact, no pretty)
  const initialJson = exportDiagram(false);

  // 2) Gather CSS (file:// safe)
  const cssText = await getCssText();

  // 3) Gather module raw sources (embedded for offline re-export, or fetched)
  const { rawSources, list } = await collectModuleRawSources();

  // 4) Build import map from rewritten sources
  const { importMap } = buildImportMapFromSources(rawSources);

  // 5) Inline html2canvas
  const html2canvasCode = await getHtml2CanvasCode();

  // 6) Build final HTML
  const title = store.getState()?.diagram?.title || 'diagram';
  const html = buildStandaloneHtml({
    title,
    cssText,
    initialJson,
    importMap,
    html2canvasCode,
    embeddedRawModules: rawSources
  });

  // 7) Download
  const blob = new Blob([html], { type: 'text/html' });
  const safeName =
    (filename && filename.trim()) ||
    ((title || 'diagram').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') + '.html') ||
    'diagram.html';
  downloadBlob(blob, safeName);
}
