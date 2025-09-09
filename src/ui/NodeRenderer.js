/**
 * @fileoverview Node rendering and interaction management
 */

import { store } from '../core/store.js';
import { generateVariableId } from '../core/id.js';
import { createVariable, shouldShowTypesForNode } from '../core/types.js';

export class NodeRenderer {
  constructor(canvasManager, connectionManager) {
    this.canvasManager = canvasManager;
    this.connectionManager = connectionManager;
    this.isDraggingNode = false;
  }

  renderNodes(state) {
    const nodesContainer = document.getElementById('nodes');
    nodesContainer.innerHTML = '';
    
    state.diagram.nodes.forEach(node => {
      const nodeElement = this.createNodeElement(node, state);
      nodesContainer.appendChild(nodeElement);
    });
  }

  createNodeElement(node, state) {
    const isSelected = state.selection.type === 'node' && state.selection.ids.includes(node.id);
    console.log(`Creating node element: id="${node.id}", title="${node.title}", isSelected=${isSelected}`);
    
    const element = document.createElement('div');
    element.className = `node ${isSelected ? 'selected' : ''}`;
    element.style.left = `${node.position.x}px`;
    element.style.top = `${node.position.y}px`;
    element.dataset.nodeId = node.id;
    // Apply saved width if present
    if (typeof node.width === 'number') {
      element.style.width = `${node.width}px`;
    }
    
    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'node-title-text';
    titleSpan.textContent = node.title;
    header.appendChild(titleSpan);
    // Prevent dragging when interacting with the title text and ensure selection for editing
    titleSpan.addEventListener('click', function(e) {
      e.stopPropagation();
      const nodeEl = this.closest('.node');
      const currentNodeId = nodeEl ? nodeEl.dataset.nodeId : null;
      console.log(`Title clicked: nodeId="${currentNodeId}"`);
      if (currentNodeId) {
        store.setSelection('node', currentNodeId);
      }
    });
    // Add click handler to header for selection (including empty areas)
    header.addEventListener('click', function(e) {
      e.stopPropagation();
      const nodeEl = this.closest('.node');
      const currentNodeId = nodeEl ? nodeEl.dataset.nodeId : null;
      console.log(`Header clicked: nodeId="${currentNodeId}"`);
      if (currentNodeId) {
        store.setSelection('node', currentNodeId);
      }
    });
    element.appendChild(header);
    
    // Body with variables (render in the original insertion order)
    const body = document.createElement('div');
    body.className = 'node-body';
    
    // Single group with variables in array order for consistency with inspector
    const group = document.createElement('div');
    group.className = 'variable-group';
    node.variables.forEach(variable => {
      const varElement = this.createVariableElement(node, variable, state);
      group.appendChild(varElement);
    });
    body.appendChild(group);
    
    element.appendChild(body);

    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'node-resize-handle';
    element.appendChild(resizeHandle);

    // Horizontal resize logic (snap to grid)
    this.setupNodeResize(element, resizeHandle, node);

    // Make draggable
    this.makeNodeDraggable(element, node);
    
    // Add click handler to body for selection
    body.addEventListener('click', function(e) {
      e.stopPropagation();
      const nodeEl = this.closest('.node');
      const currentNodeId = nodeEl ? nodeEl.dataset.nodeId : null;
      console.log(`Body clicked: nodeId="${currentNodeId}"`);
      if (currentNodeId) {
        store.setSelection('node', currentNodeId);
      }
    });
    
    // Click handler for selection on the main element
    element.addEventListener('click', function(e) {
      e.stopPropagation();
      const currentNodeId = this.dataset.nodeId;
      console.log(`Node element clicked: nodeId="${currentNodeId}", this.className="${this.className}"`);
      console.log('Element dataset:', this.dataset);
      console.log('Element id attribute:', this.getAttribute('id'));
      if (currentNodeId) {
        store.setSelection('node', currentNodeId);
      }
    });
    
    
    return element;
  }

  createVariableElement(node, variable, state) {
    const element = document.createElement('div');
    element.className = 'variable';
    element.dataset.variableId = variable.id;
    
    // Apply custom background color if set
    if (variable.color) {
      element.style.backgroundColor = variable.color;
      element.classList.add('custom-bg');
    }
    
    // Ports: black dots; always show both sides
    const makePort = (side) => {
      const p = document.createElement('div');
      p.className = `variable-port ${side}`;
      p.dataset.variableId = variable.id;
      p.dataset.portSide = side;
      element.appendChild(p);
      this.connectionManager.makePortConnectable(p, variable);
      return p;
    };
    makePort('in');
    makePort('out');
    
    // Name
    const name = document.createElement('div');
    name.className = 'variable-name';
    name.textContent = variable.name;
    element.appendChild(name);
    
    // Type badge - use per-node logic
    if (shouldShowTypesForNode(node, state.ui.showTypes)) {
      const type = document.createElement('div');
      type.className = 'variable-type';
      type.textContent = variable.dataType;
      element.appendChild(type);
    }
    
    // Sample value toggle
    if (variable.sampleValue !== undefined) {
      const toggle = document.createElement('button');
      toggle.className = 'variable-toggle';
      toggle.textContent = '👁';
      toggle.title = 'Toggle sample value';
      element.appendChild(toggle);
      
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        store.toggleSampleVisibility(variable.id);
      });
      
      // Sample value (if visible)
      if (state.ui.showSamples.has(variable.id)) {
        const sample = document.createElement('div');
        sample.className = 'variable-sample';
        sample.textContent = JSON.stringify(variable.sampleValue);
        element.appendChild(sample);
      }
    }

    // Transient hover highlight: directly connected variables and edges
    const applyRelatedHighlight = (on) => {
      try {
        // Highlight this variable
        if (on) {
          element.classList.add('related');
        } else {
          element.classList.remove('related');
        }

        // Compute directly connected edges and counterpart variable IDs
        const edges = store.getEdgesForVariable(node.id, variable.id) || [];
        const relatedVarIds = new Set();
        const edgeIds = [];

        edges.forEach(e => {
          edgeIds.push(e.id);
          const otherVarId =
            (e.from.nodeId === node.id && e.from.portId === variable.id) ? e.to.portId :
            (e.to.nodeId === node.id && e.to.portId === variable.id) ? e.from.portId :
            null;
          if (otherVarId) relatedVarIds.add(otherVarId);
        });

        // Toggle class on related variables
        relatedVarIds.forEach(vId => {
          const vEl = document.querySelector(`.variable[data-variable-id="${vId}"]`);
          if (vEl) {
            if (on) vEl.classList.add('related');
            else vEl.classList.remove('related');
          }
        });

        // Toggle class on belonging edges
        edgeIds.forEach(eid => {
          const g = document.querySelector(`.edge-group[data-edge-id="${eid}"]`);
          if (g) {
            if (on) g.classList.add('related');
            else g.classList.remove('related');
          }
        });
      } catch (err) {
        // Avoid breaking interactions on any error
        console.error('applyRelatedHighlight error:', err);
      }
    };

    element.addEventListener('mouseenter', () => applyRelatedHighlight(true));
    element.addEventListener('mouseleave', () => applyRelatedHighlight(false));
    
    return element;
  }

  setupNodeResize(element, resizeHandle, node) {
    const GRID_SIZE = 20;
    const snap = (v) => Math.round(v / GRID_SIZE) * GRID_SIZE;
    let startX = 0;
    let startW = 0;
    let resizing = false;

    const onMouseMove = (e) => {
      if (!resizing) return;
      const scale = this.canvasManager?.scale || 1;
      const delta = (e.clientX - startX) / scale;
      let w = startW + delta;
      w = Math.max(200, Math.min(1000, w)); // clamp width
      w = snap(w);
      element.style.width = `${w}px`;
    };

    const onMouseUp = () => {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const w = parseInt(element.style.width, 10);
      if (!Number.isNaN(w)) {
        store.updateNode(node.id, { width: w });
      }
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // avoid starting node drag/select
      // Do not select on resize mousedown to avoid re-render during resize drag
      resizing = true;
      startX = e.clientX;
      const style = getComputedStyle(element);
      startW = parseFloat(style.width) || element.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Add click handler to resize handle for node selection
    resizeHandle.addEventListener('click', function(e) {
      e.stopPropagation();
      const nodeEl = this.closest('.node');
      const currentNodeId = nodeEl ? nodeEl.dataset.nodeId : null;
      console.log(`Resize handle clicked: nodeId="${currentNodeId}"`);
      if (currentNodeId) {
        store.setSelection('node', currentNodeId);
      }
    });
  }

  makeNodeDraggable(element, node) {
    let isDragging = false;
    let startX, startY, startNodeX, startNodeY;
    
    const header = element.querySelector('.node-header');
    const GRID_SIZE = 20; // Match the CSS grid size
    
    // Helper function to snap to grid
    const snapToGrid = (value) => {
      return Math.round(value / GRID_SIZE) * GRID_SIZE;
    };
    
    const handleMouseDown = (e) => {
      isDragging = true;
      this.isDraggingNode = true;
      this.canvasManager.setDragState(true);
      startX = e.clientX;
      startY = e.clientY;
      startNodeX = node.position.x;
      startNodeY = node.position.y;
      
      element.style.cursor = 'grabbing';
      element.style.zIndex = '1000'; // Bring to front while dragging
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const scale = this.canvasManager?.scale || 1;
      const deltaX = (e.clientX - startX) / scale;
      const deltaY = (e.clientY - startY) / scale;
      
      const newX = startNodeX + deltaX;
      const newY = startNodeY + deltaY;
      
      // Update visual position immediately (no snapping during drag)
      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      this.isDraggingNode = false;
      this.canvasManager.setDragState(false);
      element.style.cursor = '';
      element.style.zIndex = ''; // Reset z-index
      
      // Get the final position from the element's style
      let newX = parseInt(element.style.left);
      let newY = parseInt(element.style.top);
      
      // Snap to grid
      newX = snapToGrid(newX);
      newY = snapToGrid(newY);
      
      // Ensure minimum position (don't go negative)
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      
      // Update the element position to the snapped position
      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
      
      // Update store with snapped position
      store.updateNode(node.id, {
        position: { x: newX, y: newY }
      });

      // Persist z-order so the node stays on top after drag
      store.bringNodeToFront(node.id);
      
      // Remove event listeners to prevent memory leaks
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    header.addEventListener('mousedown', (e) => {
      // Do not select on header mousedown to avoid re-render during drag start
      handleMouseDown(e);
      // Add listeners only when dragging starts
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }
}
