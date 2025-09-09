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
  // v1 export schema: minimal + explicit version
  const diagram = {
    version: 1,
    title: state.diagram.title,
    nodes: state.diagram.nodes,
    edges: state.diagram.edges
  };

  eventBus.emit(EVENTS.DIAGRAM_EXPORT, { diagram });
  return JSON.stringify(diagram, null, pretty ? 2 : 0);
}

/**
 * Import diagram from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {boolean} True if successful
 */
export function importDiagram(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const version = parsed?.version;

    // Helper: strip legacy prefixes in IDs
    const stripId = (id) => (typeof id === 'string' ? id.replace(/^(?:node|var|edge)_/, '') : id);

    if (version === 1 || version === '1') {
      // v1 importer: minimal schema with explicit version
      if (!Array.isArray(parsed.nodes)) {
        throw new Error('Invalid v1 diagram: nodes must be an array');
      }
      if (!Array.isArray(parsed.edges)) {
        throw new Error('Invalid v1 diagram: edges must be an array');
      }

      const diagramV1 = {
        version: '1',
        title: parsed.title || 'Untitled diagram',
        nodes: parsed.nodes,
        edges: parsed.edges
      };

      store.loadDiagram(diagramV1);
      eventBus.emit(EVENTS.DIAGRAM_IMPORT, { diagram: diagramV1 });
      return true;
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
    return {
      nodeCount: diagram.nodes?.length || 0,
      edgeCount: diagram.edges?.length || 0,
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
