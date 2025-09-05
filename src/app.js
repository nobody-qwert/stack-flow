/**
 * @fileoverview Main application bootstrap
 */

import { store } from './core/store.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { commandStack, setupKeyboardShortcuts } from './core/commandStack.js';
import { NODE_TYPES, IO_TYPES, createNode, createVariable } from './core/types.js';
import { generateNodeId, generateVariableId, generateEdgeId } from './core/id.js';
import { importApiFromJson, showApiImportDialog } from './services/importApi.js';
import { importTableFromJson, showPgImportDialog, createSampleTableDescriptor } from './services/importPg.js';
import { downloadDiagram, uploadDiagram, loadDiagramFromStorage, getSavedDiagramInfo } from './services/persistence.js';

class DataFlowApp {
  constructor() {
    this.canvas = null;
    this.panzoom = null;
    this.selectedNode = null;
    this.dragState = null;
    this.connectionState = null;
    this.isDraggingNode = false;
    this.isConnecting = false;
    
    this.init();
  }

  init() {
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize canvas
    this.initCanvas();
    
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
    
    // Load saved diagram if available
    this.loadSavedDiagram();
    
    // Initial render
    this.render(store.getState());
    
    console.log('Data Flow Designer initialized');
  }

  initCanvas() {
    this.canvas = document.getElementById('canvas');
    // Always use custom pan/zoom so drag events on nodes/ports never pan the canvas
    this.setupBasicPanZoom();
  }

  setupBasicPanZoom() {
    // Basic pan/zoom implementation as fallback
    let isPanning = false;
    let startX, startY;
    let currentX = 0, currentY = 0;
    let scale = 1;
    
    const content = document.getElementById('content');
    content.style.transformOrigin = '0 0';
    
    // Mouse wheel zoom - zoom relative to mouse position
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      // Get the bounding rect of the canvas
      const rect = this.canvas.getBoundingClientRect();
      
      // Mouse position relative to the canvas
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Compute world coordinates (content space) under the mouse BEFORE zoom
      const worldX = (mouseX - currentX) / scale;
      const worldY = (mouseY - currentY) / scale;
      
      // Compute new scale (clamped)
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, scale * delta));
      
      // Update translation so that the world point under the mouse stays fixed
      currentX = mouseX - worldX * newScale;
      currentY = mouseY - worldY * newScale;
      
      // Apply the new scale
      scale = newScale;
      
      // Apply the transformation
      content.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${currentX}, ${currentY})`;
    }, { passive: false });
    
    // Mouse pan - only if not dragging a node or connecting
    this.canvas.addEventListener('mousedown', (e) => {
      // Only left mouse button should pan
      if (e.button !== 0) return;

      // If a node drag or connection is in progress, do not pan
      if (this.isDraggingNode || this.isConnecting) return;

      // Don't pan if clicking on a node, node header, or variable port
      if (e.target.closest('.node') || e.target.closest('.variable-port')) {
        return;
      }
      
      if (e.target === this.canvas || e.target === content) {
        isPanning = true;
        startX = e.clientX - currentX;
        startY = e.clientY - currentY;
        this.canvas.style.cursor = 'grabbing';
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        currentX = e.clientX - startX;
        currentY = e.clientY - startY;
        content.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${currentX}, ${currentY})`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      isPanning = false;
      this.canvas.style.cursor = 'grab';
    });
  }

  setupEventListeners() {
    // Canvas click for deselection
    this.canvas.addEventListener('click', (e) => {
      if (e.target === this.canvas || e.target.closest('.content')) {
        store.clearSelection();
      }
    });
    
    // Prevent context menu on canvas
    this.canvas.addEventListener('contextmenu', (e) => {
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
    
    document.getElementById('btnNewGui').addEventListener('click', () => {
      this.createNode(NODE_TYPES.GUI);
    });
    
    document.getElementById('btnImportApi').addEventListener('click', () => {
      this.importApi();
    });
    
    document.getElementById('btnImportPg').addEventListener('click', () => {
      this.importPg();
    });
    
    document.getElementById('btnExport').addEventListener('click', () => {
      downloadDiagram();
    });
    
    document.getElementById('btnImport').addEventListener('click', () => {
      uploadDiagram();
    });
    
    // Palette buttons (same as top bar for now)
    document.getElementById('plNewApi').addEventListener('click', () => {
      this.createNode(NODE_TYPES.API);
    });
    
    document.getElementById('plNewTable').addEventListener('click', () => {
      this.createNode(NODE_TYPES.TABLE);
    });
    
    document.getElementById('plNewGui').addEventListener('click', () => {
      this.createNode(NODE_TYPES.GUI);
    });
    
    document.getElementById('plImportApi').addEventListener('click', () => {
      this.importApi();
    });
    
    document.getElementById('plImportPg').addEventListener('click', () => {
      this.importPg();
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
      case NODE_TYPES.GUI:
        title = 'View';
        metadata = { route: '', framework: '' };
        break;
    }
    
    const node = createNode(type, title, position);
    node.id = generateNodeId();
    node.metadata = metadata;
    
    // Add a sample variable
    const variable = createVariable('sample_field');
    variable.id = generateVariableId();
    variable.io = type === NODE_TYPES.API ? IO_TYPES.OUT : IO_TYPES.BOTH;
    node.variables = [variable];
    
    store.addNode(node);
    store.setSelection('node', node.id);
  }

  async importApi() {
    try {
      const input = await showApiImportDialog();
      if (input) {
        input.position = this.getNewNodePosition();
        const node = importApiFromJson(input);
        store.addNode(node);
        store.setSelection('node', node.id);
      }
    } catch (error) {
      console.error('Failed to import API:', error);
      alert('Failed to import API: ' + error.message);
    }
  }

  async importPg() {
    try {
      const input = await showPgImportDialog();
      if (input) {
        input.position = this.getNewNodePosition();
        const node = importTableFromJson(input);
        store.addNode(node);
        store.setSelection('node', node.id);
      }
    } catch (error) {
      console.error('Failed to import table:', error);
      alert('Failed to import table: ' + error.message);
    }
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

  render(state) {
    this.renderNodes(state);
    this.renderEdges(state);
    this.renderInspector(state);
  }

  renderNodes(state) {
    const nodesContainer = document.getElementById('nodes');
    nodesContainer.innerHTML = '';
    
    state.diagram.nodes.forEach(node => {
      const nodeElement = this.createNodeElement(node, state);
      nodesContainer.appendChild(nodeElement);
    });
  }

  renderEdges(state) {
    const svg = document.getElementById('edges');
    // Clear existing edge groups (but not temp connections)
    const existingEdges = svg.querySelectorAll('.edge-group');
    existingEdges.forEach(edge => edge.remove());
    
    state.diagram.edges.forEach(edge => {
      const edgeElement = this.createEdgeElement(edge, state);
      if (edgeElement) {
        svg.appendChild(edgeElement);
      }
    });
  }

  createEdgeElement(edge, state) {
    const fromNode = store.getNodeById(edge.from.nodeId);
    const toNode = store.getNodeById(edge.to.nodeId);
    
    if (!fromNode || !toNode) return null;
    
    // Find the variables to get their positions within the node
    const fromVariable = fromNode.variables.find(v => v.id === edge.from.portId);
    const toVariable = toNode.variables.find(v => v.id === edge.to.portId);
    
    if (!fromVariable || !toVariable) return null;
    
    // Calculate port positions based on node positions and variable indices
    const fromVarIndex = fromNode.variables.indexOf(fromVariable);
    const toVarIndex = toNode.variables.indexOf(toVariable);
    
    // Approximate port positions based on node layout
    // Port is on the right side of the node for outputs, left for inputs
    const nodeWidth = 200; // Approximate node width
    const nodeHeaderHeight = 30; // Approximate header height
    const variableHeight = 25; // Approximate variable row height
    const variableGroupHeaderHeight = 0; // No group header height since titles are hidden
    
    // Calculate Y position based on variable index and groups
    let fromY = fromNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (fromVarIndex * variableHeight) + variableHeight / 2;
    let toY = toNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (toVarIndex * variableHeight) + variableHeight / 2;
    
    // X positions: outputs on right, inputs on left
    const fromX = fromNode.position.x + (fromVariable.io === IO_TYPES.IN ? 0 : nodeWidth);
    const toX = toNode.position.x + (toVariable.io === IO_TYPES.OUT ? nodeWidth : 0);
    
    // Create a group to hold both the visual path and the hit area
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edge-group');
    g.dataset.edgeId = edge.id;
    
    // Create curved path data
    const controlPointOffset = Math.abs(toX - fromX) * 0.5;
    const pathData = `M ${fromX} ${fromY} C ${fromX + controlPointOffset} ${fromY}, ${toX - controlPointOffset} ${toY}, ${toX} ${toY}`;
    
    // Create invisible hit area path (wider stroke for easier clicking)
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', pathData);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '20'); // Wide invisible stroke for easy clicking
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';
    
    // Create visible path
    const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visiblePath.setAttribute('class', `edge ${edge.status || 'ok'}`);
    visiblePath.setAttribute('d', pathData);
    visiblePath.setAttribute('fill', 'none');
    visiblePath.setAttribute('stroke', '#666');
    visiblePath.setAttribute('stroke-width', '2'); // Visual stroke width
    visiblePath.style.pointerEvents = 'none'; // Let hit area handle clicks
    
    // Add arrowhead
    const arrowId = `arrow-${edge.id}`;
    const svg = document.getElementById('edges');
    const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
    
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', arrowId);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    arrowPath.setAttribute('class', 'edge-arrow');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    
    visiblePath.setAttribute('marker-end', `url(#${arrowId})`);
    
    // Add paths to group (hit area first, then visible)
    g.appendChild(hitPath);
    g.appendChild(visiblePath);
    
    // Add click handler to the group
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Edge clicked, setting selection to:', edge.id);
      store.setSelection('edge', edge.id);
    });
    
    // Add selection styling
    if (state.selection.type === 'edge' && state.selection.ids.includes(edge.id)) {
      visiblePath.classList.add('selected');
    }
    
    return g;
  }

  createNodeElement(node, state) {
    const isSelected = state.selection.type === 'node' && state.selection.ids.includes(node.id);
    
    const element = document.createElement('div');
    element.className = `node ${node.type} ${isSelected ? 'selected' : ''}`;
    element.style.left = `${node.position.x}px`;
    element.style.top = `${node.position.y}px`;
    element.dataset.nodeId = node.id;
    
    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    header.textContent = node.title;
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

  createVariableGroup(title, variables, state) {
    const group = document.createElement('div');
    group.className = 'variable-group';
    
    if (title) {
      const titleElement = document.createElement('div');
      titleElement.className = 'variable-group-title';
      titleElement.textContent = title;
      group.appendChild(titleElement);
    }
    
    variables.forEach(variable => {
      const varElement = this.createVariableElement(variable, state);
      group.appendChild(varElement);
    });
    
    return group;
  }

  createVariableElement(variable, state) {
    const element = document.createElement('div');
    element.className = 'variable';
    element.dataset.variableId = variable.id;
    
    // Port
    const port = document.createElement('div');
    port.className = `variable-port ${variable.io}`;
    port.dataset.variableId = variable.id;
    element.appendChild(port);
    
    // Make port draggable for connections
    this.makePortConnectable(port, variable);
    
    // Name
    const name = document.createElement('div');
    name.className = 'variable-name';
    name.textContent = variable.name;
    element.appendChild(name);
    
    // Type badge
    const type = document.createElement('div');
    type.className = 'variable-type';
    type.textContent = variable.dataType;
    element.appendChild(type);
    
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

  makePortConnectable(portElement, variable) {
    let isConnecting = false;
    let connectionLine = null;
    
    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isConnecting = true;
      this.isConnecting = true;
      
      // Create temporary connection line
      const svg = document.getElementById('edges');
      connectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      connectionLine.setAttribute('class', 'temp-connection');
      connectionLine.setAttribute('stroke', '#007acc');
      connectionLine.setAttribute('stroke-width', '2');
      connectionLine.setAttribute('stroke-dasharray', '5,5');
      
      // Get the port position relative to the content container
      const content = document.getElementById('content');
      const contentRect = content.getBoundingClientRect();
      const portRect = portElement.getBoundingClientRect();
      
      const startX = portRect.left + portRect.width / 2 - contentRect.left;
      const startY = portRect.top + portRect.height / 2 - contentRect.top;
      
      connectionLine.setAttribute('x1', startX);
      connectionLine.setAttribute('y1', startY);
      connectionLine.setAttribute('x2', startX);
      connectionLine.setAttribute('y2', startY);
      
      svg.appendChild(connectionLine);
      
      // Store connection state
      this.connectionState = {
        fromVariable: variable,
        fromPort: portElement,
        startX,
        startY
      };
    };
    
    const handleMouseMove = (e) => {
      if (!isConnecting || !connectionLine) return;
      
      // Get mouse position relative to content container
      const content = document.getElementById('content');
      const contentRect = content.getBoundingClientRect();
      const currentX = e.clientX - contentRect.left;
      const currentY = e.clientY - contentRect.top;
      
      connectionLine.setAttribute('x2', currentX);
      connectionLine.setAttribute('y2', currentY);
    };
    
    const handleMouseUp = (e) => {
      if (!isConnecting) return;
      
      isConnecting = false;
      this.isConnecting = false;
      
      // Remove temporary line
      if (connectionLine) {
        connectionLine.remove();
        connectionLine = null;
      }
      
      // Check if we dropped on another port
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetPort = targetElement?.closest('.variable-port');
      
      if (targetPort && targetPort !== portElement) {
        const targetVariableId = targetPort.dataset.variableId;
        const targetNodeElement = targetPort.closest('.node');
        const targetNodeId = targetNodeElement?.dataset.nodeId;
        
        if (targetNodeId && targetVariableId) {
          this.createConnection(this.connectionState.fromVariable, variable, targetNodeId, targetVariableId);
        }
      }
      
      // Clear connection state
      this.connectionState = null;
      
      // Remove global listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    portElement.addEventListener('mousedown', (e) => {
      handleMouseDown(e);
      // Add global listeners only when connecting
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  createConnection(fromVariable, fromVariableObj, toNodeId, toVariableId) {
    // Find the from node
    const state = store.getState();
    const fromNode = state.diagram.nodes.find(node => 
      node.variables.some(v => v.id === fromVariable.id)
    );
    
    if (!fromNode) return;
    
    // Create edge
    const edge = {
      id: generateEdgeId(),
      from: { nodeId: fromNode.id, portId: fromVariable.id },
      to: { nodeId: toNodeId, portId: toVariableId },
      status: 'ok'
    };
    
    store.addEdge(edge);
    console.log('Created connection:', edge);
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
      handleMouseDown(e);
      // Add listeners only when dragging starts
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  renderInspector(state) {
    const inspectorBody = document.getElementById('inspectorBody');
    
    console.log('renderInspector called with selection:', state.selection);
    
    if (state.selection.type === 'node' && state.selection.ids.length === 1) {
      const nodeId = state.selection.ids[0];
      const node = store.getNodeById(nodeId);
      
      console.log('Found node for inspector:', node);
      
      if (node) {
        inspectorBody.innerHTML = this.createNodeInspectorHTML(node);
        this.setupNodeInspectorHandlers(node);
        return;
      }
    }
    
    // Default inspector content
    inspectorBody.innerHTML = '<p>Select a node, variable, or edge to edit details.</p>';
  }

  createNodeInspectorHTML(node) {
    return `
      <div class="form-group">
        <label for="nodeTitle">Title:</label>
        <input type="text" id="nodeTitle" value="${node.title}">
      </div>
      
      <div class="form-group">
        <label>Type:</label>
        <div>${node.type.toUpperCase()}</div>
      </div>
      
      <div class="form-group">
        <label>Variables:</label>
        <div class="variables-list">
          ${node.variables.map(variable => `
            <div class="variable-item" data-variable-id="${variable.id}">
              <div class="variable-edit-row">
                <input type="text" class="var-name-input" value="${variable.name}" placeholder="Variable name">
                <select class="var-type-select">
                  <option value="string" ${variable.dataType === 'string' ? 'selected' : ''}>String</option>
                  <option value="number" ${variable.dataType === 'number' ? 'selected' : ''}>Number</option>
                  <option value="boolean" ${variable.dataType === 'boolean' ? 'selected' : ''}>Boolean</option>
                  <option value="datetime" ${variable.dataType === 'datetime' ? 'selected' : ''}>DateTime</option>
                  <option value="uuid" ${variable.dataType === 'uuid' ? 'selected' : ''}>UUID</option>
                  <option value="json" ${variable.dataType === 'json' ? 'selected' : ''}>JSON</option>
                  <option value="array" ${variable.dataType === 'array' ? 'selected' : ''}>Array</option>
                </select>
                <select class="var-io-select">
                  <option value="in" ${variable.io === 'in' ? 'selected' : ''}>Input</option>
                  <option value="out" ${variable.io === 'out' ? 'selected' : ''}>Output</option>
                  <option value="both" ${variable.io === 'both' ? 'selected' : ''}>Both</option>
                </select>
                <button class="delete-var-btn" title="Delete variable">×</button>
              </div>
              ${variable.description ? `<div class="variable-description"><small>${variable.description}</small></div>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="variable-controls">
          <button id="addVariable">Add Variable</button>
        </div>
      </div>
    `;
  }

  setupNodeInspectorHandlers(node) {
    // Title input
    const titleInput = document.getElementById('nodeTitle');
    titleInput.addEventListener('change', () => {
      store.updateNode(node.id, { title: titleInput.value });
    });
    
    // Add variable button
    const addVariableBtn = document.getElementById('addVariable');
    addVariableBtn.addEventListener('click', () => {
      const variable = createVariable(`field_${node.variables.length + 1}`);
      variable.id = generateVariableId();
      store.addVariable(node.id, variable);
    });
    
    // Variable editing handlers
    const variableItems = document.querySelectorAll('.variable-item');
    variableItems.forEach(item => {
      const variableId = item.dataset.variableId;
      
      // Variable name input
      const nameInput = item.querySelector('.var-name-input');
      nameInput.addEventListener('change', () => {
        store.updateVariable(node.id, variableId, { name: nameInput.value });
      });
      
      // Variable type select
      const typeSelect = item.querySelector('.var-type-select');
      typeSelect.addEventListener('change', () => {
        store.updateVariable(node.id, variableId, { dataType: typeSelect.value });
      });
      
      // Variable IO select
      const ioSelect = item.querySelector('.var-io-select');
      ioSelect.addEventListener('change', () => {
        store.updateVariable(node.id, variableId, { io: ioSelect.value });
      });
      
      // Delete variable button
      const deleteBtn = item.querySelector('.delete-var-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this variable?')) {
          store.deleteVariable(node.id, variableId);
        }
      });
    });
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DataFlowApp();
});
