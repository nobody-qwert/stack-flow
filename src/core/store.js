/**
 * @fileoverview Central state store with immutable-style updates and selectors
 */

import { createDiagram } from './types.js';
import { eventBus, EVENTS } from './eventBus.js';

class Store {
  constructor() {
    this.state = {
      diagram: createDiagram(),
      selection: {
        type: null,
        ids: []
      },
      ui: {
        showSamples: new Set(), // Variable IDs with visible samples
        highlightedLineage: new Set(), // Node/Edge IDs in lineage highlight
        canvasTransform: { x: 0, y: 0, scale: 1 }
      }
    };
    
    this.subscribers = new Set();
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Called when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get current state (read-only)
   * @returns {Object} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Update state and notify subscribers
   * @param {Function} updater - Function that returns new state
   */
  setState(updater) {
    const newState = updater(this.state);
    if (newState !== this.state) {
      this.state = newState;
      this.notifySubscribers();
    }
  }

  /**
   * Notify all subscribers of state change
   */
  notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in store subscriber:', error);
      }
    });
  }

  // Node operations
  addNode(node) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: [...state.diagram.nodes, node]
      }
    }));
    eventBus.emit(EVENTS.NODE_ADD, { node });
  }

  updateNode(nodeId, updates) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.map(node =>
          node.id === nodeId ? { ...node, ...updates } : node
        )
      }
    }));
    
    const node = this.getNodeById(nodeId);
    if (node) {
      eventBus.emit(EVENTS.NODE_UPDATE, { node, updates });
    }
  }

  deleteNode(nodeId) {
    const node = this.getNodeById(nodeId);
    if (!node) return;

    // Remove connected edges
    const connectedEdges = this.getEdgesForNode(nodeId);
    
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.filter(n => n.id !== nodeId),
        edges: state.diagram.edges.filter(edge =>
          edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId
        )
      },
      selection: state.selection.ids.includes(nodeId)
        ? { type: null, ids: [] }
        : state.selection
    }));

    eventBus.emit(EVENTS.NODE_DELETE, { node, connectedEdges });
  }

  // Variable operations
  addVariable(nodeId, variable) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.map(node =>
          node.id === nodeId
            ? { ...node, variables: [...node.variables, variable] }
            : node
        )
      }
    }));
    eventBus.emit(EVENTS.VARIABLE_ADD, { variable, nodeId });
  }

  updateVariable(nodeId, variableId, updates) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.map(node =>
          node.id === nodeId
            ? {
                ...node,
                variables: node.variables.map(variable =>
                  variable.id === variableId ? { ...variable, ...updates } : variable
                )
              }
            : node
        )
      }
    }));

    const variable = this.getVariableById(nodeId, variableId);
    if (variable) {
      eventBus.emit(EVENTS.VARIABLE_UPDATE, { variable, nodeId, updates });
    }
  }

  deleteVariable(nodeId, variableId) {
    const variable = this.getVariableById(nodeId, variableId);
    if (!variable) return;

    // Remove connected edges
    const connectedEdges = this.getEdgesForVariable(nodeId, variableId);

    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.map(node =>
          node.id === nodeId
            ? { ...node, variables: node.variables.filter(v => v.id !== variableId) }
            : node
        ),
        edges: state.diagram.edges.filter(edge =>
          !(edge.from.nodeId === nodeId && edge.from.portId === variableId) &&
          !(edge.to.nodeId === nodeId && edge.to.portId === variableId)
        )
      },
      ui: {
        ...state.ui,
        showSamples: new Set([...state.ui.showSamples].filter(id => id !== variableId))
      }
    }));

    eventBus.emit(EVENTS.VARIABLE_DELETE, { variable, nodeId, connectedEdges });
  }

  // Variable reorder operation
  moveVariable(nodeId, variableId, toIndex) {
    const node = this.getNodeById(nodeId);
    if (!node) return;

    const fromIndex = node.variables.findIndex(v => v.id === variableId);
    if (fromIndex === -1) return;

    const maxIndex = node.variables.length - 1;
    let target = Math.max(0, Math.min(maxIndex, toIndex));
    if (target === fromIndex) return;

    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        nodes: state.diagram.nodes.map(n => {
          if (n.id !== nodeId) return n;
          const vars = [...n.variables];
          const [moved] = vars.splice(fromIndex, 1);
          vars.splice(target, 0, moved);
          return { ...n, variables: vars };
        })
      }
    }));

    eventBus.emit(EVENTS.VARIABLE_REORDER, { nodeId, variableId, fromIndex, toIndex: target });
  }

  // Edge operations
  addEdge(edge) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        edges: [...state.diagram.edges, edge]
      }
    }));
    eventBus.emit(EVENTS.EDGE_ADD, { edge });
  }

  updateEdge(edgeId, updates) {
    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        edges: state.diagram.edges.map(edge =>
          edge.id === edgeId ? { ...edge, ...updates } : edge
        )
      }
    }));

    const edge = this.getEdgeById(edgeId);
    if (edge) {
      eventBus.emit(EVENTS.EDGE_UPDATE, { edge, updates });
    }
  }

  deleteEdge(edgeId) {
    const edge = this.getEdgeById(edgeId);
    if (!edge) return;

    this.setState(state => ({
      ...state,
      diagram: {
        ...state.diagram,
        edges: state.diagram.edges.filter(e => e.id !== edgeId)
      },
      selection: state.selection.ids.includes(edgeId)
        ? { type: null, ids: [] }
        : state.selection
    }));

    eventBus.emit(EVENTS.EDGE_DELETE, { edge });
  }

  // Selection operations
  setSelection(type, ids) {
    this.setState(state => ({
      ...state,
      selection: { type, ids: Array.isArray(ids) ? ids : [ids] }
    }));
    eventBus.emit(EVENTS.SELECTION_CHANGE, { selection: this.state.selection });
  }

  clearSelection() {
    this.setState(state => ({
      ...state,
      selection: { type: null, ids: [] }
    }));
    eventBus.emit(EVENTS.SELECTION_CLEAR);
  }

  // UI operations
  toggleSampleVisibility(variableId) {
    this.setState(state => {
      const newShowSamples = new Set(state.ui.showSamples);
      if (newShowSamples.has(variableId)) {
        newShowSamples.delete(variableId);
      } else {
        newShowSamples.add(variableId);
      }
      return {
        ...state,
        ui: { ...state.ui, showSamples: newShowSamples }
      };
    });
    eventBus.emit(EVENTS.VARIABLE_TOGGLE_SAMPLE, { variableId });
  }

  setCanvasTransform(transform) {
    this.setState(state => ({
      ...state,
      ui: { ...state.ui, canvasTransform: { ...state.ui.canvasTransform, ...transform } }
    }));
  }

  setLineageHighlight(ids) {
    this.setState(state => ({
      ...state,
      ui: { ...state.ui, highlightedLineage: new Set(ids) }
    }));
    eventBus.emit(EVENTS.LINEAGE_HIGHLIGHT, { ids });
  }

  clearLineageHighlight() {
    this.setState(state => ({
      ...state,
      ui: { ...state.ui, highlightedLineage: new Set() }
    }));
    eventBus.emit(EVENTS.LINEAGE_CLEAR);
  }

  // Diagram operations
  loadDiagram(diagram) {
    this.setState(state => ({
      ...state,
      diagram,
      selection: { type: null, ids: [] },
      ui: {
        ...state.ui,
        showSamples: new Set(),
        highlightedLineage: new Set()
      }
    }));
    eventBus.emit(EVENTS.DIAGRAM_LOAD, { diagram });
  }

  // Selectors (read-only access to state)
  getNodeById(nodeId) {
    return this.state.diagram.nodes.find(node => node.id === nodeId);
  }

  getVariableById(nodeId, variableId) {
    const node = this.getNodeById(nodeId);
    return node?.variables.find(variable => variable.id === variableId);
  }

  getEdgeById(edgeId) {
    return this.state.diagram.edges.find(edge => edge.id === edgeId);
  }

  getEdgesForNode(nodeId) {
    return this.state.diagram.edges.filter(edge =>
      edge.from.nodeId === nodeId || edge.to.nodeId === nodeId
    );
  }

  getEdgesForVariable(nodeId, variableId) {
    return this.state.diagram.edges.filter(edge =>
      (edge.from.nodeId === nodeId && edge.from.portId === variableId) ||
      (edge.to.nodeId === nodeId && edge.to.portId === variableId)
    );
  }

  getSelectedNodes() {
    if (this.state.selection.type !== 'node') return [];
    return this.state.selection.ids
      .map(id => this.getNodeById(id))
      .filter(Boolean);
  }

  getSelectedEdges() {
    if (this.state.selection.type !== 'edge') return [];
    return this.state.selection.ids
      .map(id => this.getEdgeById(id))
      .filter(Boolean);
  }

  isVariableSampleVisible(variableId) {
    return this.state.ui.showSamples.has(variableId);
  }

  isInLineageHighlight(id) {
    return this.state.ui.highlightedLineage.has(id);
  }
}

// Create singleton instance
export const store = new Store();
