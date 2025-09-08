/**
 * @fileoverview Main application bootstrap
 */

import { store } from './core/store.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { commandStack, setupKeyboardShortcuts } from './core/commandStack.js';
import { NODE_TYPES, createNode, createVariable, createDiagram } from './core/types.js';
import { generateNodeId, generateVariableId, generateEdgeId } from './core/id.js';
import { downloadDiagram, uploadDiagram, loadDiagramFromStorage, getSavedDiagramInfo, clearSavedDiagram } from './services/persistence.js';
import { exportViewportPng } from './services/exporters.js';
import { buildShareUrlFromState, importFromUrlIfPresent, copyToClipboard } from './services/share.js';

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
  }

  setupUIHandlers() {
    // Top bar buttons
    document.getElementById('btnNewApi').addEventListener('click', () => {
      this.createNode(NODE_TYPES.API);
    });
    
    document.getElementById('btnNewTable').addEventListener('click', () => {
      this.createNode(NODE_TYPES.TABLE);
    });
    
    document.getElementById('btnNewModule').addEventListener('click', () => {
      this.createNode(NODE_TYPES.MODULE);
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

    document.getElementById('btnShare').addEventListener('click', async () => {
      try {
        const url = await buildShareUrlFromState();
        await copyToClipboard(url);
        alert('Share link copied to clipboard');
      } catch (err) {
        alert('Failed to build share link: ' + (err?.message || err));
      }
    });
    
    
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

  createNode(type) {
    const position = this.getNewNodePosition();
    let title = 'New Node';
    let metadata = {};
    
    switch (type) {
      case NODE_TYPES.API:
        title = 'GET /api/endpoint';
        metadata = { method: 'GET', url: '/api/endpoint' };
        break;
      case NODE_TYPES.TABLE:
        title = 'public.table';
        metadata = { schema: 'public', table: 'table', pk: [] };
        break;
      case NODE_TYPES.MODULE:
      case NODE_TYPES.GUI: // back-compat alias
        title = 'Module';
        metadata = { route: '', framework: '' };
        break;
    }
    
    const node = createNode(type, title, position);
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
    try {
      const imported = await importFromUrlIfPresent();
      if (!imported) {
        this.loadSavedDiagram();
      }
    } catch (e) {
      // On error, fall back to saved diagram flow
      this.loadSavedDiagram();
    }
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DataFlowApp();
});
