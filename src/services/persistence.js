/**
 * @fileoverview Persistence service for saving/loading diagrams
 */

import { store } from '../core/store.js';
import { eventBus, EVENTS } from '../core/eventBus.js';

/**
 * Export diagram to JSON
 * @returns {string} JSON string of the diagram
 */
export function exportDiagram(pretty = true) {
  const state = store.getState();

  // Map internal -> compact v1 schema (2-3 char keys)
  const mapVar = (v) => {
    const out = { i: v.id, n: v.name, dt: v.dataType };
    if (v.sampleValue !== undefined) out.sv = v.sampleValue;
    if (v.description) out.d = v.description;
    if (v.color) out.c = v.color;
    return out;
  };

  const mapNode = (n) => {
    const out = {
      i: n.id,
      t: n.title,
      p: { x: n.position?.x || 0, y: n.position?.y || 0 },
      v: (n.variables || []).map(mapVar)
    };
    if (typeof n.width === 'number') out.w = n.width;
    if (n.showVariableTypes !== null && n.showVariableTypes !== undefined) out.vt = n.showVariableTypes;
    return out;
  };

  const mapEdge = (e) => {
    const f = { n: e.from?.nodeId, p: e.from?.portId };
    if (e.from?.side) f.s = e.from.side;
    const t = { n: e.to?.nodeId, p: e.to?.portId };
    if (e.to?.side) t.s = e.to.side;
    const out = { i: e.id, f, t };
    if (e.transform !== undefined) out.tr = e.transform;
    if (e.status && e.status !== 'ok') out.st = e.status;
    return out;
  };

  const compact = {
    v: 1,
    t: state.diagram.title,
    n: (state.diagram.nodes || []).map(mapNode),
    e: (state.diagram.edges || []).map(mapEdge)
  };

  eventBus.emit(EVENTS.DIAGRAM_EXPORT, { diagram: compact });
  return JSON.stringify(compact, null, pretty ? 2 : 0);
}

/**
 * Import diagram from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {boolean} True if successful
 */
export function importDiagram(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const version = parsed?.version ?? parsed?.v;

    // Helper: strip legacy prefixes in IDs
    const stripId = (id) => (typeof id === 'string' ? id.replace(/^(?:node|var|edge)_/, '') : id);

    // v1 importer (supports both long v1 and compact v1)
    if (version === 1 || version === '1') {

      // Compact v1 (keys: v/t/n/e)
      if (Array.isArray(parsed?.n) && Array.isArray(parsed?.e)) {
        const mapNode = (cn) => ({
          id: cn.i,
          title: cn.t || '',
          position: { x: cn.p?.x || 0, y: cn.p?.y || 0 },
          variables: (cn.v || []).map((cv) => ({
            id: cv.i,
            name: cv.n || '',
            dataType: cv.dt || 'string',
            sampleValue: Object.prototype.hasOwnProperty.call(cv, 'sv') ? cv.sv : undefined,
            description: cv.d,
            color: (cv.c === undefined ? null : cv.c)
          })),
          width: typeof cn.w === 'number' ? cn.w : undefined,
          showVariableTypes: (cn.vt === null || cn.vt === undefined) ? null : cn.vt,
          metadata: {}
        });

        const mapEdge = (ce) => ({
          id: ce.i,
          from: { nodeId: ce.f?.n, portId: ce.f?.p, side: ce.f?.s },
          to: { nodeId: ce.t?.n, portId: ce.t?.p, side: ce.t?.s },
          transform: ce.tr,
          status: ce.st || 'ok'
        });

        const diagramV1Compact = {
          version: '1',
          title: parsed.t || parsed.title || 'Untitled diagram',
          nodes: parsed.n.map(mapNode),
          edges: parsed.e.map(mapEdge)
        };

        store.loadDiagram(diagramV1Compact);
        eventBus.emit(EVENTS.DIAGRAM_IMPORT, { diagram: diagramV1Compact });
        return true;
      }

      throw new Error('Invalid v1 diagram: missing nodes/edges');
    }

    // Legacy (v0) importer: no version field
    if (!Array.isArray(parsed.nodes)) {
      throw new Error('Invalid legacy diagram: missing nodes array');
    }
    if (!Array.isArray(parsed.edges)) {
      throw new Error('Invalid legacy diagram: missing edges array');
    }

    // Normalize IDs by stripping any "node_"/"var_"/"edge_" prefixes
    const nodes = (parsed.nodes || []).map((n) => ({
      ...n,
      id: stripId(n?.id),
      variables: (n?.variables || []).map((v) => ({
        ...v,
        id: stripId(v?.id)
      }))
    }));

    const edges = (parsed.edges || []).map((e) => ({
      ...e,
      id: stripId(e?.id),
      from: {
        ...(e?.from || {}),
        nodeId: stripId(e?.from?.nodeId),
        portId: stripId(e?.from?.portId)
      },
      to: {
        ...(e?.to || {}),
        nodeId: stripId(e?.to?.nodeId),
        portId: stripId(e?.to?.portId)
      }
    }));

    const diagramV0 = {
      version: parsed.version || '0.1',
      title: parsed.title || 'Untitled diagram',
      nodes,
      edges
    };

    store.loadDiagram(diagramV0);
    eventBus.emit(EVENTS.DIAGRAM_IMPORT, { diagram: diagramV0 });
    return true;
  } catch (error) {
    console.error('Failed to import diagram:', error);
    alert('Failed to import diagram: ' + (error?.message || error));
    return false;
  }
}

/**
 * Download diagram as JSON file
 * @param {string} [filename] - Optional filename
 */
export function downloadDiagram(filename = 'data-flow-diagram.json') {
  const jsonString = exportDiagram();
  const blob = new Blob([jsonString], { type: 'application/json' });
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
 * Show file picker and import diagram
 * @returns {Promise<boolean>} True if successful
 */
export function uploadDiagram() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    
    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) {
        resolve(false);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const success = importDiagram(e.target.result);
        resolve(success);
      };
      
      reader.onerror = () => {
        alert('Failed to read file');
        resolve(false);
      };
      
      reader.readAsText(file);
    });
    
    input.click();
  });
}

// LocalStorage persistence
const STORAGE_KEY = 'dataFlowDiagram';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

let autosaveEnabled = true;
let autosaveTimer = null;

/**
 * Save diagram to localStorage
 */
export function saveDiagramToStorage() {
  try {
    const jsonString = exportDiagram();
    localStorage.setItem(STORAGE_KEY, jsonString);
    localStorage.setItem(STORAGE_KEY + '_timestamp', Date.now().toString());
    eventBus.emit(EVENTS.DIAGRAM_SAVE, { storage: 'localStorage' });
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
}

/**
 * Load diagram from localStorage
 * @returns {boolean} True if successful
 */
export function loadDiagramFromStorage() {
  try {
    const jsonString = localStorage.getItem(STORAGE_KEY);
    if (!jsonString) {
      return false;
    }
    
    return importDiagram(jsonString);
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
    return false;
  }
}

/**
 * Check if there's a saved diagram in localStorage
 * @returns {Object|null} Metadata about saved diagram or null
 */
export function getSavedDiagramInfo() {
  try {
    const jsonString = localStorage.getItem(STORAGE_KEY);
    const timestamp = localStorage.getItem(STORAGE_KEY + '_timestamp');

    if (!jsonString) {
      return null;
    }

    const diagram = JSON.parse(jsonString);
    const nodeCount =
      (Array.isArray(diagram.nodes) && diagram.nodes.length) ||
      (Array.isArray(diagram.n) && diagram.n.length) ||
      0;
    const edgeCount =
      (Array.isArray(diagram.edges) && diagram.edges.length) ||
      (Array.isArray(diagram.e) && diagram.e.length) ||
      0;

    return {
      nodeCount,
      edgeCount,
      savedAt: timestamp ? new Date(parseInt(timestamp)) : null,
      exportedAt: diagram.metadata?.exportedAt ? new Date(diagram.metadata.exportedAt) : null
    };
  } catch (error) {
    return null;
  }
}

/**
 * Clear saved diagram from localStorage
 */
export function clearSavedDiagram() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY + '_timestamp');
}

/**
 * Enable or disable autosave
 * @param {boolean} enabled - Whether to enable autosave
 */
export function setAutosaveEnabled(enabled) {
  autosaveEnabled = enabled;
  
  if (enabled) {
    startAutosave();
  } else {
    stopAutosave();
  }
}

/**
 * Start autosave timer
 */
function startAutosave() {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
  }
  
  autosaveTimer = setInterval(() => {
    if (autosaveEnabled) {
      saveDiagramToStorage();
    }
  }, AUTOSAVE_INTERVAL);
}

/**
 * Stop autosave timer
 */
function stopAutosave() {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

/**
 * Check if autosave is enabled
 * @returns {boolean} True if enabled
 */
export function isAutosaveEnabled() {
  return autosaveEnabled;
}

// Initialize autosave
startAutosave();

// Save on page unload
window.addEventListener('beforeunload', () => {
  if (autosaveEnabled) {
    saveDiagramToStorage();
  }
});
