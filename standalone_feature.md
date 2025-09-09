# Standalone Offline HTML Export Feature

Goal
- Generate a single self-contained HTML file that:
  - Works fully offline (file://), no network required.
  - Embeds the current diagram state.
  - Runs the same editor so recipients can view and keep editing.
  - Supports re-exporting another standalone HTML while offline.
  - Keeps existing multi-file app behavior unchanged.

Requirements
- Single .html file, no external dependencies:
  - No Google Fonts, no CDN libraries, no HTTP requests.
- Embedded initial diagram:
  - Load automatically on open.
  - Persist edits via localStorage.
- UI adjustments:
  - Hide/remove “Share Link” in exported file.
  - Optional: Enable “Export PNG” offline by inlining html2canvas.
- Data compatibility:
  - Use existing compact v1 JSON (v/t/n/e) from exportDiagram().
- No build tools required during normal usage:
  - Export happens entirely in the browser from the running app.

Current Architecture Notes
- index.html loads <script type="module" src="./src/app.js">.
- src/app.js initializes UI, loads initial diagram via:
  - importFromUrlIfPresent() then localStorage fallback (loadSavedDiagram()).
- src/services/persistence.js:
  - exportDiagram(pretty) returns compact v1 JSON with minimal keys.
  - downloadDiagram() triggers JSON download.
  - localStorage keys: 'dataFlowDiagram' and 'dataFlowDiagram_timestamp'.
- src/services/exporters.js:
  - exportViewportPng() loads html2canvas from CDN if not present (online-only by default).
- src/services/share.js:
  - Builds share URLs from state (not useful offline).

High-Level Solution
- Add an “Export HTML” action that builds a complete HTML document string in memory, then downloads it as a file.
- Inline everything:
  - CSS: assets/styles.css inside a <style> tag.
  - JavaScript modules: Map each source file to a data: URL via an import map.
  - html2canvas: Inline library code in a <script> tag so PNG export works offline.
- Embed current diagram JSON using a <script type="application/json" id="initial-diagram">.
- Bootstrap logic in the exported file:
  - Seed localStorage from embedded JSON if empty.
  - Hide/remove Share button.
  - Import the app entry module via the import map.

Files Affected / Additions
- New: src/services/selfContained.js
  - exportStandaloneHtml(filename?: string): Builds and downloads the single-file HTML.
- index.html
  - Add a button <button id="btnExportHtml">Export HTML</button> in the topbar (next to Export / Export PNG).
- src/app.js
  - Wire the new button to exportStandaloneHtml() with a safe filename.

No changes required to the rest of the code to keep the app behavior consistent. The exported file adapts itself (hides Share, seeds storage) via inline bootstrapping script.

Export Algorithm (Detailed)

1) Collect current diagram JSON
- Use exportDiagram(false) to get compact JSON as a string without pretty-printing (smaller size).
- Store in initialJson.

2) Gather and inline CSS
- Fetch assets/styles.css as text.
- Include in the exported HTML <style>…</style>.

3) Collect all JavaScript modules
- Known module entry and dependencies (initial set):
  - src/app.js
  - src/core/store.js
  - src/core/eventBus.js
  - src/core/commandStack.js
  - src/core/types.js
  - src/core/id.js
  - src/core/normalizeTypes.js
  - src/ui/CanvasManager.js
  - src/ui/NodeRenderer.js
  - src/ui/EdgeRenderer.js
  - src/ui/ConnectionManager.js
  - src/ui/Inspector.js
  - src/services/persistence.js
  - src/services/exporters.js
  - src/services/share.js
  - src/services/validate.js
- Strategy:
  - Build a dependency graph by recursively scanning each module’s source for imports.
  - Normalize relative specifiers to a virtual absolute namespace like m:/src/... (e.g., import './core/store.js' => import 'm:/src/core/store.js').
  - Only rewrite relative specifiers (./ and ../). Leave bare specifiers (none expected here).
- Create an import map:
  - For each module, produce a mapping:
    "m:/src/path/file.js": "data:text/javascript;base64,..." (with rewritten imports).
  - Entry point is "m:/src/app.js".

4) Inline html2canvas (offline PNG)
- Fetch minified html2canvas code at export time (from CDN when online).
- Inject a plain <script> with the library code to set window.html2canvas for offline use.
- This makes exporters.js’s ensureHtml2Canvas() resolve immediately offline.

5) Offline re-export support
- Embed a JSON map of sources for the exported file:
  - <script id="__SELF_MODULES__" type="application/json">{ "m:/src/app.js": "...", ... }</script>.
- exportStandaloneHtml() first checks if __SELF_MODULES__ exists:
  - If present, use those sources (no network fetch) to build a new standalone HTML, enabling offline re-export.

6) Build the single HTML string
- Document structure:
  - Head:
    - <meta charset="utf-8">
    - <title>{diagram-title} - Data Flow Designer</title>
    - <style>...inlined CSS...</style> (no Google Fonts link for offline)
  - Body:
    - Same app DOM structure as index.html (header/topbar, canvas, inspector, hidden file input).
    - Hide/remove Share Link button in this exported artifact.
  - Scripts:
    - <script id="initial-diagram" type="application/json">{compact JSON}</script>
    - <script id="__SELF_MODULES__" type="application/json">{module source map}</script>
    - <script type="importmap">{ "imports": { "m:/src/app.js": "data:...", ... } }</script>
    - <script>...html2canvas library code...</script> (so window.html2canvas exists)
    - <script type="module">
      (function(){
        try {
          const key = 'dataFlowDiagram';
          if (!localStorage.getItem(key)) {
            const el = document.getElementById('initial-diagram');
            if (el && el.textContent) {
              localStorage.setItem(key, el.textContent);
              localStorage.setItem(key + '_timestamp', Date.now().toString());
            }
          }
        } catch (e) {}
        // Hide Share button if exists
        const shareBtn = document.getElementById('btnShare');
        if (shareBtn) shareBtn.style.display = 'none';
        import('m:/src/app.js');
      })();
      </script>

7) Trigger download
- Create Blob([htmlString], { type: 'text/html' }) and download via an <a download> approach.

Import Rewriting Details
- Rewrite policy: only touch relative import specifiers (start with './' or '../').
- Normalization:
  - Resolve specifiers relative to the current module path.
  - Convert to a POSIX-like path under virtual root m:/.
  - Example: in src/app.js, "import { store } from './core/store.js';" becomes "import { store } from 'm:/src/core/store.js';".
- Code transformation:
  - Minimal regex for static imports and export-from:
    - import ... from '...';
    - import '...';
    - export ... from '...';
  - Also handle dynamic import('...') for relative paths if present.
- Leave code otherwise intact.

HTML Template Skeleton (for reference)
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{TITLE} - Data Flow Designer</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>/* inlined assets/styles.css */</style>
  </head>
  <body>
    <div id="app">
      <header class="topbar">
        <div class="brand">Data Flow Designer</div>
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
          <button id="btnShare" title="Copy link to this diagram" style="display:none">Share Link</button>
          <button id="btnExport" title="Export diagram to JSON">Export</button>
          <button id="btnExportPng" title="Export visible canvas to PNG">Export PNG</button>
          <button id="btnExportHtml" title="Export as Offline HTML">Export HTML</button>
        </div>
      </header>
      <div class="main"> ... canvas and inspector DOM (same as index.html) ... </div>
    </div>

    <input type="file" id="fileInput" accept="application/json" style="display:none" />

    <script id="initial-diagram" type="application/json">{...}</script>
    <script id="__SELF_MODULES__" type="application/json">{...}</script>
    <script type="importmap">{ "imports": { ... } }</script>
    <script>/* inlined html2canvas library */</script>
    <script type="module">(function(){ /* seed storage, hide share, import entry */ })();</script>
  </body>
</html>

Behavior in Exported File
- On first open:
  - localStorage is seeded from the embedded JSON if empty.
- On subsequent opens:
  - The current diagram persists due to autosave; embedded JSON remains as provenance but is not reloaded.
- Export JSON / PNG:
  - JSON export works offline.
  - PNG export works because html2canvas is inlined.
- Re-export HTML:
  - The inlined __SELF_MODULES__ enables offline re-export (uses embedded sources rather than fetching).

Testing Plan
- Online (GitHub Pages or local http server):
  1) Create a diagram with a title, some nodes/edges.
  2) Click Export HTML and download the file.
  3) Open the .html file directly (file://) in a fresh browser window.
  4) Verify UI loads, diagram is present, editing works.
  5) Verify Share button is hidden.
  6) Verify Export PNG works offline (no network).
  7) Make edits, close and reopen the file: confirm localStorage persisted changes.
  8) Use Export HTML inside the exported file: confirm another standalone file is downloaded (offline re-export).
  9) Open DevTools Network tab: ensure no network requests on load or during normal actions.

- Edge cases:
  - Very large diagrams (multi-MB HTML): Ensure it opens and performs adequately.
  - Different browsers: Chrome/Edge/Firefox file:// behavior.
  - Import graph correctness: all modules resolve; no circular import surprises.
  - Autosave toggling: timestamp updates work.

Performance and Size Considerations
- data: URLs base64-encode sources; size increases ~33%.
- Minify module sources in the future to reduce size if necessary.
- Consider compressing JSON (no pretty format) to keep the file smaller.
- Lazy-load heavy features only if needed (not necessary currently).

Security and Compatibility Notes
- Running from file:// forbids network fetch; all code and assets must be embedded.
- No CSP headers in file://; inline scripts are allowed.
- Avoid DOM APIs that require cross-origin permissions (not used here).
- Keep Google Fonts out for offline; system fonts will be used.

Acceptance Criteria
- Export produces a single .html that:
  - Opens and runs offline with the editor UI.
  - Loads the embedded diagram on first open and persists edits.
  - Hides the Share Link feature.
  - Exports PNG offline without network.
  - Allows re-export of another standalone HTML while offline.
  - Makes zero network requests during normal use (verified via DevTools).
- Existing app (multi-file) continues to work unchanged.

Implementation Tasks
- Create src/services/selfContained.js:
  - exportStandaloneHtml(filename?)
  - Helpers:
    - getInitialDiagramJson()
    - getCssText()
    - collectModules() with offline fallback (reads __SELF_MODULES__ if present)
    - rewriteImportsToVirtual(specifierBase = 'm:/')
    - buildImportMap(modules)
    - toDataUrl(base64)
    - buildHtml({ title, cssText, initialJson, importMap, moduleSources, html2canvasCode })
    - downloadBlob(blob, filename)
- index.html:
  - Add Export HTML button in topbar.
- src/app.js:
  - Import exportStandaloneHtml and wire the button click.
- Optional: add a small banner or metadata in exported file indicating it is an offline artifact and version info.

Future Enhancements
- Inline a font (e.g., Roboto Mono) as base64 for consistent typography offline.
- Minify JS/CSS prior to embedding for smaller artifacts.
- Include version metadata (commit hash, export date) in a meta tag.
- Add a “Reset to embedded diagram” action in exported file to restore from initial JSON.

Notes on Robustness
- Ensure no code path in app.js, persistence.js, exporters.js, or UI triggers fetch or external URLs in the exported file.
- exporters.js already supports a pre-initialized window.html2canvas; injected library satisfies it.
- share.js remains included for code completeness; Share button is hidden in exported file.
