/**
 * @fileoverview Main application bootstrap
 */

import { store } from './core/store.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { commandStack, setupKeyboardShortcuts, createAddNodeCommand } from './core/commandStack.js';
import { createNode, createVariable, createDiagram } from './core/types.js';
import { generateNodeId, generateVariableId, generateEdgeId } from './core/id.js';
import { downloadDiagram, uploadDiagram, loadDiagramFromStorage, getSavedDiagramInfo, clearSavedDiagram } from './services/persistence.js';
import { exportViewportPng } from './services/exporters.js';
import { exportStandaloneHtml } from './services/selfContained.js';

// Import modular UI components
import { CanvasManager } from './ui/CanvasManager.js';
import { NodeRenderer } from './ui/NodeRenderer.js';
import { EdgeRenderer } from './ui/EdgeRenderer.js';
import { ConnectionManager } from './ui/ConnectionManager.js';
import { Inspector } from './ui/Inspector.js';

class DataFlowApp {
  constructor() {
    // Initialize modular components
    this.canvasManager = new CanvasManager();
    this.connectionManager = new ConnectionManager(this.canvasManager);
    this.nodeRenderer = new NodeRenderer(this.canvasManager, this.connectionManager);
    this.edgeRenderer = new EdgeRenderer();
    this.inspector = new Inspector();
    
    this.init();
  }

  init() {
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize canvas
    this.canvasManager.initCanvas();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup UI event handlers
    this.setupUIHandlers();
    
    // Setup global keyboard handlers
    this.setupGlobalKeyboardHandlers();

    // Setup save-status indicator and dirty tracking
    this.setupSaveStatus();
    this.setupDirtyTracking();
    
    // Subscribe to store changes
    store.subscribe((state) => {
      this.render(state);
    });
    
    // Load from shared link if present; else saved diagram
    this.loadInitialDiagram();
    
    // Initial render
    this.render(store.getState());
    
    console.log('Data Flow Designer initialized');
  }

  setupEventListeners() {
    // Canvas click handling - removed selection clearing to keep inspector persistent
    const canvas = document.getElementById('canvas');
    
    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  setupGlobalKeyboardHandlers() {
    // Global keyboard handler for deleting selected edges
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = store.getState();
        if (state.selection.type === 'edge' && state.selection.ids.length > 0) {
          e.preventDefault();
          const edgeId = state.selection.ids[0];
          if (confirm('Delete this connection?')) {
            console.log('Deleting edge:', edgeId);
            store.deleteEdge(edgeId);
          }
        }
      }
    });

    // Copy/Paste node handlers
    document.addEventListener('keydown', async (e) => {
      const isModifier = e.ctrlKey || e.metaKey;
      const key = e.key && e.key.toLowerCase();
      const active = document.activeElement;
      const inEditable =
        active &&
        ((active.tagName === 'INPUT') ||
         (active.tagName === 'TEXTAREA') ||
         active.isContentEditable);

      if (!isModifier) return;

      // Copy selected node
      if (key === 'c') {
        if (inEditable) return; // allow normal copy in fields
        const ok = await this.copySelectedNodeToClipboard();
        if (ok) e.preventDefault();
      }

      // Paste node
      if (key === 'v') {
        if (inEditable) return; // allow normal paste in fields
        const ok = await this.pasteNodeFromClipboard();
        if (ok) e.preventDefault();
      }
    });
  }

  setupUIHandlers() {
    // Top bar buttons
    
    
    document.getElementById('btnNewModule').addEventListener('click', () => {
      this.createNode();
    });
    
    
    document.getElementById('btnExport').addEventListener('click', () => {
      const state = store.getState();
      const filename = this.getSafeFilename(state.diagram.title) + '.json';
      downloadDiagram(filename);
    });
    
    document.getElementById('btnExportPng').addEventListener('click', () => {
      const state = store.getState();
      const filename = this.getSafeFilename(state.diagram.title) + '.png';
      exportViewportPng(filename);
    });

    const btnExportHtml = document.getElementById('btnExportHtml');
    if (btnExportHtml) {
      btnExportHtml.addEventListener('click', async () => {
        const state = store.getState();
        const filename = this.getSafeFilename(state.diagram.title) + '.html';
        try {
          await exportStandaloneHtml(filename);
        } catch (err) {
          alert('Export HTML failed: ' + (err?.message || err));
        }
      });
    }

    // About dialog handlers
    const btnAbout = document.getElementById('btnAbout');
    const aboutDialog = document.getElementById('aboutDialog');
    const aboutCloseBtn = document.getElementById('aboutCloseBtn');
    
    if (btnAbout && aboutDialog && aboutCloseBtn) {
      const openAbout = () => {
        aboutDialog.classList.remove('hidden');
        aboutCloseBtn.focus();
      };
      
      const closeAbout = () => {
        aboutDialog.classList.add('hidden');
        btnAbout.focus();
      };
      
      btnAbout.addEventListener('click', openAbout);
      aboutCloseBtn.addEventListener('click', closeAbout);
      
      // Close on overlay click
      aboutDialog.addEventListener('click', (e) => {
        if (e.target === aboutDialog || e.target.classList.contains('dialog-overlay')) {
          closeAbout();
        }
      });
      
      // Close on ESC key
      const handleAboutEsc = (e) => {
        if (e.key === 'Escape' && !aboutDialog.classList.contains('hidden')) {
          closeAbout();
        }
      };
      document.addEventListener('keydown', handleAboutEsc);
    }

    
    
    document.getElementById('btnImport').addEventListener('click', () => {
      uploadDiagram();
    });
    
    document.getElementById('btnNewDiagram').addEventListener('click', () => {
      this.newDiagram();
    });

    // Inspector footer: Show/Hide variable types
    const chkShowTypes = document.getElementById('toggleShowTypes');
    if (chkShowTypes) {
      chkShowTypes.addEventListener('change', () => {
        store.setShowTypes(chkShowTypes.checked);
      });
    }

    // Diagram title input
    const titleInput = document.getElementById('diagramTitle');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        store.setDiagramTitle(titleInput.value);
      });
      titleInput.addEventListener('blur', () => {
        store.setDiagramTitle(titleInput.value);
      });
      titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          titleInput.blur();
        }
      });
    }

    // Inspector toggle handle (slide in/out)
    const inspector = document.getElementById('inspector');
    let handle = document.getElementById('inspectorToggle');
    if (!handle) {
      handle = document.createElement('button');
      handle.id = 'inspectorToggle';
      handle.className = 'inspector-handle';
      handle.type = 'button';
      handle.setAttribute('aria-label', 'Toggle inspector');
      handle.setAttribute('aria-controls', 'inspector');
      // Place as child of .main so it's positioned relative to the layout
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.appendChild(handle);
    }

    const applyInspectorCollapsed = (collapsed) => {
      if (!inspector || !handle) return;
      inspector.classList.toggle('collapsed', collapsed);
      handle.setAttribute('aria-expanded', String(!collapsed));
      // Chevron shows the action direction
      handle.textContent = collapsed ? '◀' : '▶';
      // Keep the handle anchored to the inspector edge
      handle.style.right = collapsed ? '0px' : 'var(--inspector-width)';
    };

    // Initialize (expanded by default)
    applyInspectorCollapsed(false);

    handle.addEventListener('click', () => {
      const collapsed = !inspector.classList.contains('collapsed');
      applyInspectorCollapsed(collapsed);
    });
  }

  // Copy selected node to clipboard (and localStorage fallback)
  async copySelectedNodeToClipboard() {
    try {
      const state = store.getState();
      if (state.selection.type !== 'node' || state.selection.ids.length !== 1) {
        return false;
      }
      const nodeId = state.selection.ids[0];
      const node = store.getNodeById(nodeId);
      if (!node) return false;

      // Serialize a node fragment
      const payload = {
        __stackflow: 'node-fragment',
        version: 1,
        node: JSON.parse(JSON.stringify(node))
      };
      const text = JSON.stringify(payload);

      let wroteClipboard = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          wroteClipboard = true;
        }
      } catch (err) {
        // Clipboard write may be blocked in file:// or without user gesture
      }

      // Always store fallback so cross-tab paste works even without clipboard
      try {
        localStorage.setItem('stackflowClipboard', text);
      } catch (_) {}

      return wroteClipboard || true;
    } catch (err) {
      console.warn('Copy failed:', err);
      return false;
    }
  }

  // Paste node from clipboard (or localStorage fallback)
  async pasteNodeFromClipboard() {
    let text = null;
    try {
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (err) {
      // Clipboard read may be blocked; fallback below
    }
    if (!text) {
      try {
        text = localStorage.getItem('stackflowClipboard');
      } catch (_) {}
    }
    if (!text) return false;

    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      return false;
    }
    if (!(payload && payload.__stackflow === 'node-fragment' && payload.node)) {
      return false;
    }

    const src = payload.node;
    if (!src || !src.position) return false;

    // Deep clone and regenerate IDs
    const newNode = JSON.parse(JSON.stringify(src));
    newNode.id = generateNodeId();
    // Offset placement to avoid overlap
    newNode.position = {
      x: Math.max(0, (src.position?.x || 0) + 40),
      y: Math.max(0, (src.position?.y || 0) + 40)
    };
    if (Array.isArray(newNode.variables)) {
      newNode.variables = newNode.variables.map(v => ({
        ...v,
        id: generateVariableId()
      }));
    } else {
      newNode.variables = [];
    }

    // Ensure optional fields are preserved sensibly
    if (newNode.showVariableTypes === undefined) {
      newNode.showVariableTypes = src.showVariableTypes ?? null;
    }

    try {
      // Add as undoable command and select it
      commandStack.execute(createAddNodeCommand(store, newNode));
      store.setSelection('node', newNode.id);
      return true;
    } catch (err) {
      console.error('Paste failed:', err);
      return false;
    }
  }

  // Save-status UI
  setupSaveStatus() {
    const container = document.querySelector('.diagram-title-container');
    if (!container) return;
    let el = document.getElementById('saveStatus');
    if (!el) {
      el = document.createElement('span');
      el.id = 'saveStatus';
      el.className = 'save-status';
      el.setAttribute('role', 'status');
      el.title = 'Your work is kept in this browser (localStorage). Use Export to save a file you can share.';
      const titleInput = container.querySelector('#diagramTitle');
      if (titleInput && titleInput.nextSibling) {
        container.insertBefore(el, titleInput.nextSibling);
      } else if (titleInput) {
        container.appendChild(el);
      } else {
        container.appendChild(el);
      }
    }
    this.saveStatusEl = el;
    this.setDirty(false);
  }

  setDirty(d) {
    this.dirty = !!d;
    const el = this.saveStatusEl;
    if (!el) return;
    if (this.dirty) {
      el.textContent = 'Edited — stored locally; Export to save/share';
      el.classList.add('dirty');
    } else {
      el.textContent = 'Stored locally — Export to save/share';
      el.classList.remove('dirty');
    }
  }

  setupDirtyTracking() {
    const markDirty = () => this.setDirty(true);
    const markClean = () => this.setDirty(false);
    const on = (e, cb) => eventBus.on(e, cb);
    const E = EVENTS;

    // Content-modifying events
    on(E.NODE_ADD, markDirty);
    on(E.NODE_UPDATE, markDirty);
    on(E.NODE_DELETE, markDirty);
    on(E.VARIABLE_ADD, markDirty);
    on(E.VARIABLE_UPDATE, markDirty);
    on(E.VARIABLE_DELETE, markDirty);
    on(E.VARIABLE_REORDER, markDirty);
    on(E.EDGE_ADD, markDirty);
    on(E.EDGE_UPDATE, markDirty);
    on(E.EDGE_DELETE, markDirty);

    // Clean states (new import/load/export)
    on(E.DIAGRAM_IMPORT, markClean);
    on(E.DIAGRAM_LOAD, markClean);
    on(E.DIAGRAM_EXPORT, markClean);
  }

  createNode() {
    const position = this.getNewNodePosition();
    let title = 'New Node';
    let metadata = {};
    
    // Always create a Module node
    title = 'Module';
    metadata = { route: '', framework: '' };
    
    const node = createNode(title, position);
    node.id = generateNodeId();
    node.metadata = metadata;
    
    // Add a sample variable
    const variable = createVariable('sample_field');
    variable.id = generateVariableId();
    node.variables = [variable];
    
    store.addNode(node);
    store.setSelection('node', node.id);
  }

 
  newDiagram() {
    const state = store.getState();
    const hasContent = state.diagram.nodes.length > 0 || state.diagram.edges.length > 0;
    if (hasContent) {
      const proceed = confirm('Start a new diagram? If you want to keep your work, click Cancel and use Export first.');
      if (!proceed) return;
    }
    try { clearSavedDiagram(); } catch (e) {}
    store.loadDiagram(createDiagram());
  }
 
  getNewNodePosition() {
    const state = store.getState();
    const existingNodes = state.diagram.nodes;
    
    // Simple positioning: offset from existing nodes
    let x = 100;
    let y = 100;
    
    if (existingNodes.length > 0) {
      const lastNode = existingNodes[existingNodes.length - 1];
      x = lastNode.position.x + 250;
      y = lastNode.position.y;
      
      // Wrap to next row if too far right
      if (x > 800) {
        x = 100;
        y = lastNode.position.y + 200;
      }
    }
    
    return { x, y };
  }

  loadSavedDiagram() {
    const savedInfo = getSavedDiagramInfo();
    if (savedInfo && savedInfo.nodeCount > 0) {
      const shouldLoad = confirm(
        `Found saved diagram with ${savedInfo.nodeCount} nodes and ${savedInfo.edgeCount} connections. Load it?`
      );
      
      if (shouldLoad) {
        loadDiagramFromStorage();
      }
    }
  }

  async loadInitialDiagram() {
    this.loadSavedDiagram();
  }

  render(state) {
    this.nodeRenderer.renderNodes(state);
    this.edgeRenderer.renderEdges(state);
    this.inspector.renderInspector(state);

    // Sync inspector toggle from state
    const chk = document.getElementById('toggleShowTypes');
    if (chk) chk.checked = !!state.ui.showTypes;

    // Sync diagram title from state
    const titleInput = document.getElementById('diagramTitle');
    if (titleInput && titleInput.value !== state.diagram.title) {
      titleInput.value = state.diagram.title || '';
    }

    // Update document title
    document.title = `${state.diagram.title || 'Untitled diagram'} - Data Flow Designer`;
  }

  // Helper function to create safe filename from title
  getSafeFilename(title) {
    return (title || 'diagram')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'diagram';
  }
}

/**
 * Initialize app immediately if DOM is already parsed (supports dynamic import in standalone HTML),
 * otherwise wait for DOMContentLoaded (original behavior).
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new DataFlowApp();
  });
} else {
  new DataFlowApp();
}
