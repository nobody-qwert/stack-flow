/**
 * @fileoverview Simple event bus for decoupled communication between modules
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Subscribe to an event only once
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  once(event, callback) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      callback(...args);
    });
    return unsubscribe;
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...*} args - Arguments to pass to callbacks
   */
  emit(event, ...args) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  off(event) {
    this.listeners.delete(event);
  }

  /**
   * Remove all listeners
   */
  clear() {
    this.listeners.clear();
  }

  /**
   * Get list of events with listeners
   * @returns {string[]} Array of event names
   */
  getEvents() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get number of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  getListenerCount(event) {
    const callbacks = this.listeners.get(event);
    return callbacks ? callbacks.size : 0;
  }
}

// Create singleton instance
export const eventBus = new EventBus();

// Event constants for type safety and documentation
export const EVENTS = {
  // Node events
  NODE_ADD: 'node:add',
  NODE_UPDATE: 'node:update',
  NODE_DELETE: 'node:delete',
  NODE_MOVE: 'node:move',
  NODE_SELECT: 'node:select',
  
  // Variable events
  VARIABLE_ADD: 'variable:add',
  VARIABLE_UPDATE: 'variable:update',
  VARIABLE_DELETE: 'variable:delete',
  VARIABLE_SELECT: 'variable:select',
  VARIABLE_TOGGLE_SAMPLE: 'variable:toggle_sample',
  
  // Edge events
  EDGE_ADD: 'edge:add',
  EDGE_UPDATE: 'edge:update',
  EDGE_DELETE: 'edge:delete',
  EDGE_SELECT: 'edge:select',
  EDGE_REATTACH: 'edge:reattach',
  
  // Selection events
  SELECTION_CHANGE: 'selection:change',
  SELECTION_CLEAR: 'selection:clear',
  
  // Canvas events
  CANVAS_PAN: 'canvas:pan',
  CANVAS_ZOOM: 'canvas:zoom',
  CANVAS_CLICK: 'canvas:click',
  
  // Persistence events
  DIAGRAM_LOAD: 'diagram:load',
  DIAGRAM_SAVE: 'diagram:save',
  DIAGRAM_EXPORT: 'diagram:export',
  DIAGRAM_IMPORT: 'diagram:import',
  
  // Import events
  IMPORT_API: 'import:api',
  IMPORT_TABLE: 'import:table',
  IMPORT_GUI: 'import:gui',
  
  // Validation events
  VALIDATION_ERROR: 'validation:error',
  VALIDATION_WARNING: 'validation:warning',
  
  // Lineage events
  LINEAGE_HIGHLIGHT: 'lineage:highlight',
  LINEAGE_CLEAR: 'lineage:clear',
  
  // UI events
  UI_INSPECTOR_UPDATE: 'ui:inspector_update',
  UI_PALETTE_UPDATE: 'ui:palette_update',
  UI_TOPBAR_UPDATE: 'ui:topbar_update'
};

// Helper functions for common event patterns
export const emitNodeEvent = (type, node, extra = {}) => {
  eventBus.emit(type, { node, ...extra });
};

export const emitVariableEvent = (type, variable, nodeId, extra = {}) => {
  eventBus.emit(type, { variable, nodeId, ...extra });
};

export const emitEdgeEvent = (type, edge, extra = {}) => {
  eventBus.emit(type, { edge, ...extra });
};

export const emitSelectionEvent = (type, selection) => {
  eventBus.emit(type, { selection });
};
