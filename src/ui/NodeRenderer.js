/**
 * @fileoverview Node rendering and interaction management
 */

import { store } from '../core/store.js';
import { generateVariableId } from '../core/id.js';
import { createVariable } from '../core/types.js';

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
    
    const element = document.createElement('div');
    element.className = `node ${node.type} ${isSelected ? 'selected' : ''}`;
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
    titleSpan.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    titleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      store.setSelection('node', node.id);
    });
    element.appendChild(header);
    
    // Body with variables (render in the original insertion order)
    const body = document.createElement('div');
    body.className = 'node-body';
    
    // Single group with variables in array order for consistency with inspector
    const group = document.createElement('div');
    group.className = 'variable-group';
    node.variables.forEach(variable => {
      const varElement = this.createVariableElement(variable, state);
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
    
    // Click handler for selection
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Node clicked, setting selection to:', node.id);
      store.setSelection('node', node.id);
    });
    
    return element;
  }

  createVariableElement(variable, state) {
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
    
    // Type badge
    if (state.ui.showTypes) {
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
      const delta = e.clientX - startX;
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
      resizing = true;
      startX = e.clientX;
      startW = element.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
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
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
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
      
      // Remove event listeners to prevent memory leaks
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    header.addEventListener('mousedown', (e) => {
      // If the user begins interaction on the title text, treat it as edit/select, not drag
      if (e.target.closest('.node-title-text')) {
        return;
      }
      handleMouseDown(e);
      // Add listeners only when dragging starts
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }
}
