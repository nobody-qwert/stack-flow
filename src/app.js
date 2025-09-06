/**
 * @fileoverview Main application bootstrap
 */

import { store } from './core/store.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { commandStack, setupKeyboardShortcuts } from './core/commandStack.js';
import { NODE_TYPES, IO_TYPES, createNode, createVariable, createDiagram } from './core/types.js';
import { generateNodeId, generateVariableId, generateEdgeId } from './core/id.js';
import { importApiFromJson, showApiImportDialog } from './services/importApi.js';
import { importTableFromJson, showPgImportDialog, createSampleTableDescriptor } from './services/importPg.js';
import { downloadDiagram, uploadDiagram, loadDiagramFromStorage, getSavedDiagramInfo, clearSavedDiagram } from './services/persistence.js';

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
    
    document.getElementById('btnNewDiagram').addEventListener('click', () => {
      this.newDiagram();
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
    
    // Compute anchors using actual DOM variable rows when available
    const content = document.getElementById('content');
    const contentRect = content.getBoundingClientRect();
    const transform = getComputedStyle(content).transform;
    let contentScale = 1;
    if (transform && transform !== 'none') {
      try {
        const m = new DOMMatrixReadOnly(transform);
        contentScale = m.a || 1;
      } catch (err) {
        contentScale = 1;
      }
    }
    const fromVarEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"]`);
    const toVarEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"]`);
    
    let fromX, fromY, toX, toY;
    
    if (fromVarEl && toVarEl) {
      const fromRect = fromVarEl.getBoundingClientRect();
      const toRect = toVarEl.getBoundingClientRect();
      
      // Decide flow direction primarily left-to-right
      const fromNodeEl = document.querySelector(`.node[data-node-id="${fromNode.id}"]`);
      const toNodeEl = document.querySelector(`.node[data-node-id="${toNode.id}"]`);
      const preferRight = !fromNodeEl || !toNodeEl
        ? (fromRect.left <= toRect.left)
        : (fromNodeEl.getBoundingClientRect().left <= toNodeEl.getBoundingClientRect().left);
      
      // Keep Y at the variable row center
      fromY = (fromRect.top + fromRect.height / 2 - contentRect.top) / contentScale;
      toY = (toRect.top + toRect.height / 2 - contentRect.top) / contentScale;

      // Anchor X to node outer edges with a small pad so tips are fully outside the border
      const fromNodeRect = fromNodeEl ? fromNodeEl.getBoundingClientRect() : fromRect;
      const toNodeRect = toNodeEl ? toNodeEl.getBoundingClientRect() : toRect;
      const edgePad = 0;

      fromX = ((preferRight ? fromNodeRect.right + edgePad : fromNodeRect.left - edgePad) - contentRect.left) / contentScale;
      toX = ((preferRight ? toNodeRect.left - edgePad : toNodeRect.right + edgePad) - contentRect.left) / contentScale;
    } else {
      // Fallback to approximate positions
      const fromNodeEl = document.querySelector(`.node[data-node-id="${fromNode.id}"]`);
      const toNodeEl = document.querySelector(`.node[data-node-id="${toNode.id}"]`);
      const fromNodeWidth = fromNodeEl ? fromNodeEl.getBoundingClientRect().width : (fromNode.width || 200);
      const toNodeWidth = toNodeEl ? toNodeEl.getBoundingClientRect().width : (toNode.width || 200);
      const nodeHeaderHeight = 30;
      const variableHeight = 25;
      const variableGroupHeaderHeight = 0;
      
      const fromVarIndex = fromNode.variables.indexOf(fromVariable);
      const toVarIndex = toNode.variables.indexOf(toVariable);
      
      fromY = fromNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (fromVarIndex * variableHeight) + variableHeight / 2;
      toY = toNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (toVarIndex * variableHeight) + variableHeight / 2;
      
      fromX = fromNode.position.x + (fromVariable.io === IO_TYPES.IN ? 0 : fromNodeWidth);
      toX = toNode.position.x + (toVariable.io === IO_TYPES.OUT ? toNodeWidth : 0);
    }
    
    // Endpoints already placed outside node border by edgePad; no extra nudge needed.
    
    // Create a group to hold both the visual path and the hit area
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edge-group');
    g.dataset.edgeId = edge.id;
    
    // Create curved path data
    const controlPointOffset = Math.max(40, Math.abs(toX - fromX) * 0.5);
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
    (function() {
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
    })();

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
    
    // Apply custom background color if set
    if (variable.color) {
      element.style.backgroundColor = variable.color;
      element.classList.add('custom-bg');
    }
    
    // Ports: black dots; show both sides when io === 'both'
    const makePort = (side) => {
      const p = document.createElement('div');
      p.className = `variable-port ${side}`;
      p.dataset.variableId = variable.id;
      p.dataset.portSide = side;
      element.appendChild(p);
      this.makePortConnectable(p, variable);
    };
    if (variable.io === IO_TYPES.BOTH || variable.io === 'both') {
      makePort('in');
      makePort('out');
    } else if (variable.io === IO_TYPES.IN || variable.io === 'in') {
      makePort('in');
    } else {
      makePort('out');
    }
    
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
    let hotPortEl = null; // preview target port while connecting
    
    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isConnecting = true;
      this.isConnecting = true;
      
      // Create temporary connection line (overlay, red dashed, above nodes)
      const svg = document.getElementById('edgesOverlay') || document.getElementById('edges');
      connectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      connectionLine.setAttribute('class', 'temp-connection');
      connectionLine.setAttribute('stroke', '#dc3545');
      connectionLine.setAttribute('stroke-width', '2');
      connectionLine.setAttribute('stroke-dasharray', '6,6');
      
      // Get the variable row edge position relative to the content container
      const content = document.getElementById('content');
      content.classList.add('connecting');
      const contentRect = content.getBoundingClientRect();
      const transform = getComputedStyle(content).transform;
      let contentScale = 1;
      if (transform && transform !== 'none') {
        try { const m = new DOMMatrixReadOnly(transform); contentScale = m.a || 1; } catch (err) { contentScale = 1; }
      }
      const portRect = portElement.getBoundingClientRect();
      const varRow = portElement.closest('.variable');
      const varRect = varRow ? varRow.getBoundingClientRect() : portRect;
      
      // Determine port side and anchor to node outer edge with small pad so line is visible
      const useLeft = (portRect.left - varRect.left) < (varRect.width / 2);
      const nodeEl = portElement.closest('.node');
      const nodeRect = nodeEl ? nodeEl.getBoundingClientRect() : varRect;
      const edgePad = 0;
      
      const startX = (((useLeft ? nodeRect.left : nodeRect.right) - contentRect.left) / contentScale) + (useLeft ? -edgePad : edgePad);
      const startY = ((varRect.top + varRect.height / 2) - contentRect.top) / contentScale;
      
      connectionLine.setAttribute('x1', startX);
      connectionLine.setAttribute('y1', startY);
      connectionLine.setAttribute('x2', startX);
      connectionLine.setAttribute('y2', startY);
      
      svg.appendChild(connectionLine);
      // Visual: origin port filled while mouse is held down
      portElement.classList.add('port-active');
      
      // Store connection state
      const fromSide = portElement.dataset.portSide || (useLeft ? 'in' : 'out');
      this.connectionState = {
        fromVariable: variable,
        fromPort: portElement,
        fromSide,
        startX,
        startY
      };
      
      // Mark eligible/ineligible ports during connect
      const allPorts = document.querySelectorAll('.variable-port');
      const originNodeEl = portElement.closest('.node');
      allPorts.forEach(p => {
        const side = p.dataset.portSide || (p.classList.contains('in') ? 'in' : (p.classList.contains('out') ? 'out' : ''));
        if (!side) return;
        const pNode = p.closest('.node');
        // Disable all ports within the same node as the origin (including opposite side)
        if (pNode === originNodeEl) {
          p.classList.add('ineligible');
          p.classList.remove('eligible');
          return;
        }
        if (side === fromSide) {
          p.classList.add('ineligible');
        } else {
          p.classList.add('eligible');
          p.closest('.variable')?.classList.add('eligible-target');
        }
      });
    };
    
    const handleMouseMove = (e) => {
      if (!isConnecting || !connectionLine) return;
      
      // Get mouse position relative to content container
      const content = document.getElementById('content');
      const contentRect = content.getBoundingClientRect();
      const transform = getComputedStyle(content).transform;
      let contentScale = 1;
      if (transform && transform !== 'none') {
        try { const m = new DOMMatrixReadOnly(transform); contentScale = m.a || 1; } catch (err) { contentScale = 1; }
      }
      const currentX = (e.clientX - contentRect.left) / contentScale;
      const currentY = (e.clientY - contentRect.top) / contentScale;
      
      connectionLine.setAttribute('x2', currentX);
      connectionLine.setAttribute('y2', currentY);

      // Highlight a valid target port under cursor while dragging
      const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest('.variable-port');
      const fromSide = this.connectionState?.fromSide;
      const originNodeEl = portElement.closest('.node');

      const isValidTarget = (el) => {
        if (!el) return false;
        const side = el.dataset.portSide || (el.classList.contains('in') ? 'in' : (el.classList.contains('out') ? 'out' : ''));
        if (!side || !fromSide || side === fromSide) return false;
        const nodeEl = el.closest('.node');
        if (!nodeEl || nodeEl === originNodeEl) return false;
        return true;
      };

      // Update hot target highlight
      if (hotPortEl && hotPortEl !== hovered) {
        hotPortEl.classList.remove('port-hot');
        hotPortEl = null;
      }
      if (isValidTarget(hovered)) {
        if (hotPortEl !== hovered) {
          hotPortEl = hovered;
          hotPortEl.classList.add('port-hot');
        }
      }
    };
    
    const handleMouseUp = (e) => {
      if (!isConnecting) return;
      
      isConnecting = false;
      this.isConnecting = false;
      
      // Clear connecting UI state
      const content = document.getElementById('content');
      content.classList.remove('connecting');
      
      // Remove temporary line
      if (connectionLine) {
        connectionLine.remove();
        connectionLine = null;
      }

      // Clear port fill feedback (origin + hot target)
      portElement.classList.remove('port-active');
      if (hotPortEl) {
        hotPortEl.classList.remove('port-hot');
        hotPortEl = null;
      }
      
      // Check if we dropped on another port
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetPort = targetElement?.closest('.variable-port');

      // Clear guidance classes
      document.querySelectorAll('.variable-port.eligible, .variable-port.ineligible').forEach(p => p.classList.remove('eligible','ineligible'));
      document.querySelectorAll('.variable.eligible-target').forEach(el => el.classList.remove('eligible-target'));
      
      if (targetPort && targetPort !== portElement) {
        const targetVariableId = targetPort.dataset.variableId;
        const targetNodeElement = targetPort.closest('.node');
        const targetNodeId = targetNodeElement?.dataset.nodeId;
        const targetSide = targetPort.dataset.portSide || (targetPort.classList.contains('in') ? 'in' : (targetPort.classList.contains('out') ? 'out' : ''));
        const fromSide = this.connectionState?.fromSide || (portElement.classList.contains('in') ? 'in' : (portElement.classList.contains('out') ? 'out' : ''));
        const currentNodeElement = portElement.closest('.node');
        const currentNodeId = currentNodeElement?.dataset.nodeId;
        
        if (targetNodeId && targetVariableId && fromSide && targetSide && fromSide !== targetSide && targetNodeId !== currentNodeId) {
          if (fromSide === 'out' && targetSide === 'in') {
            this.createConnection(this.connectionState.fromVariable, variable, targetNodeId, targetVariableId);
          } else if (fromSide === 'in' && targetSide === 'out') {
            // Edge should be from OUT (target) to IN (current)
            this.createConnection({ id: targetVariableId }, variable, currentNodeId, variable.id);
          }
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
        <div class="type-row">
          <div class="type-label">${node.type.toUpperCase()}</div>
          <button id="deleteNode" class="danger-light" title="Delete this node">Delete</button>
        </div>
      </div>
      
      <div class="form-group">
        <label>Variables:</label>
        <div class="variables-list">
          ${node.variables.map(variable => `
            <div class="variable-item" data-variable-id="${variable.id}">
              <button type="button" class="var-drag-handle" title="Drag to reorder" tabindex="0" aria-label="Reorder" style="width:10px;height:18px;min-width:10px;display:flex;align-items:center;justify-content:center;color:#777;border:1px dashed #ccc;border-radius:2px;background:#fff;user-select:none;padding:0;margin-right:2px;font-size:10px;line-height:1;opacity:0.7">⋮</button>
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
                <button class="var-color-btn" data-variable-id="${variable.id}" title="Change color" style="background: ${variable.color || '#f8f9fa'}; width: 20px; height: 20px; border: 1px solid #ccc; border-radius: 3px; padding: 0; margin: 0 2px;"></button>
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
    console.log('setupNodeInspectorHandlers: start for node', node?.id, 'type=', node?.type);
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
      
      // Color button handler
      const colorBtn = item.querySelector('.var-color-btn');
      if (colorBtn) {
        colorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showColorPalette(colorBtn, node.id, variableId);
        });
      }
      
      // Delete variable button
      const deleteBtn = item.querySelector('.delete-var-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this variable?')) {
          store.deleteVariable(node.id, variableId);
        }
      });
    });

    // Delete node button
    const deleteNodeBtn = document.getElementById('deleteNode');
    if (deleteNodeBtn) {
      deleteNodeBtn.addEventListener('click', () => {
        if (confirm('Delete this node and its connections?')) {
          store.deleteNode(node.id);
          const inspectorBody = document.getElementById('inspectorBody');
          if (inspectorBody) {
            inspectorBody.innerHTML = '<p>Select a node, variable, or edge to edit details.</p>';
          }
        }
      });
    }

    // Reordering: pointer-based drag using the grab handle + keyboard support
    const list = document.querySelector('.variables-list');
    if (list) {
      const getItems = () => Array.from(list.querySelectorAll('.variable-item'));

      let drag = null;

      // Delegated Alt+ArrowUp/Down keyboard reordering for any focused control within a row
      list.addEventListener('keydown', (e) => {
        const modOk = e.altKey || e.ctrlKey;
        if (!modOk) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const row = e.target.closest('.variable-item');
        if (!row) return;
        e.preventDefault();
        const items = getItems();
        const index = items.indexOf(row);
        if (index === -1) return;
        const delta = e.key === 'ArrowUp' ? -1 : 1;
        store.moveVariable(node.id, row.dataset.variableId, index + delta);
      });

      const onMouseMove = (e) => {
        if (!drag) return;
        // Move ghost with cursor
        drag.ghost.style.top = (e.clientY - drag.ghostOffsetY) + 'px';
        drag.ghost.style.left = (e.clientX - drag.ghostOffsetX) + 'px';

        // Decide placeholder position by comparing cursor Y to item midpoints
        const items = getItems().filter(el => el !== drag.item);
        let insertBefore = null;
        for (const el of items) {
          const r = el.getBoundingClientRect();
          const midY = r.top + r.height / 2;
          if (e.clientY < midY) {
            insertBefore = el;
            break;
          }
        }
        if (insertBefore) {
          list.insertBefore(drag.placeholder, insertBefore);
        } else {
          list.appendChild(drag.placeholder);
        }
      };

      const endDrag = () => {
        if (!drag) return;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', endDrag);

        // Compute final target index as the placeholder's index among items
        const siblings = Array.from(list.querySelectorAll('.variable-item, .drag-placeholder'));
        const toIndex = siblings.indexOf(drag.placeholder);

        // Cleanup visuals
        drag.ghost.remove();
        drag.item.classList.remove('dragging');
        drag.item.style.visibility = '';

        // Place the real item at the placeholder, then remove placeholder
        drag.placeholder.replaceWith(drag.item);

        // Commit to store
        const variableId = drag.item.dataset.variableId;
        if (variableId) {
          store.moveVariable(node.id, variableId, toIndex);
        }

        drag = null;
      };

      // Attach handlers to each grab handle
      const handles = list.querySelectorAll('.var-drag-handle');
      console.log('Inspector: found var-drag-handles =', handles.length);
      handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const item = handle.closest('.variable-item');
          if (!item) return;

          const rect = item.getBoundingClientRect();

          // Floating ghost element following the cursor
          const ghost = item.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.top = rect.top + 'px';
          ghost.style.left = rect.left + 'px';
          ghost.style.width = rect.width + 'px';
          ghost.style.height = rect.height + 'px';
          ghost.style.pointerEvents = 'none';
          ghost.style.opacity = '0.85';
          ghost.style.zIndex = '9999';
          ghost.classList.add('drag-ghost');
          document.body.appendChild(ghost);

          // Placeholder occupying space in the list
          const placeholder = document.createElement('div');
          placeholder.className = 'drag-placeholder';
          placeholder.style.height = rect.height + 'px';
          item.after(placeholder);

          // Hide the actual item but keep its position for replacement later
          item.classList.add('dragging');
          item.style.visibility = 'hidden';

          drag = {
            item,
            ghost,
            placeholder,
            ghostOffsetX: e.clientX - rect.left,
            ghostOffsetY: e.clientY - rect.top
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', endDrag);
        });

        // Keyboard reordering: Alt+ArrowUp / Alt+ArrowDown on handle
        handle.addEventListener('keydown', (e) => {
          if (!e.altKey) return;
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const items = getItems();
          const item = handle.closest('.variable-item');
          const index = items.indexOf(item);
          if (index === -1) return;
          const delta = e.key === 'ArrowUp' ? -1 : 1;
          store.moveVariable(node.id, item.dataset.variableId, index + delta);
        });
      });

      // Also allow Alt+ArrowUp/Down when editing fields within the row
      list.querySelectorAll('.variable-item .var-name-input, .variable-item .var-type-select, .variable-item .var-io-select').forEach(el => {
        el.addEventListener('keydown', (e) => {
          if (!e.altKey) return;
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const item = e.target.closest('.variable-item');
          const items = getItems();
          const index = items.indexOf(item);
          const delta = e.key === 'ArrowUp' ? -1 : 1;
          store.moveVariable(node.id, item.dataset.variableId, index + delta);
        });
      });
    }
  }

  showColorPalette(colorBtn, nodeId, variableId) {
    // 16 preset colors (light pastels for good text contrast)
    const colors = [
      '#fde68a', '#fca5a5', '#f9a8d4', '#c7d2fe',
      '#a7f3d0', '#99f6e4', '#93c5fd', '#fcd34d',
      '#fca4b6', '#d8b4fe', '#fbcfe8', '#bfdbfe',
      '#bbf7d0', '#bae6fd', '#fecaca', '#fdecc8'
    ];
    
    // Remove any existing palette
    const existingPalette = document.querySelector('.color-palette');
    if (existingPalette) {
      existingPalette.remove();
    }
    
    // Create palette popup
    const palette = document.createElement('div');
    palette.className = 'color-palette';
    palette.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      width: 120px;
    `;
    
    // Position near the color button with viewport boundary checks
    const rect = colorBtn.getBoundingClientRect();
    const paletteWidth = 120;
    const paletteHeight = 120; // Approximate height for 4x4 grid + padding
    
    // Calculate initial position
    let left = rect.left;
    let top = rect.bottom + 4;
    
    // Check right boundary
    if (left + paletteWidth > window.innerWidth) {
      left = rect.right - paletteWidth;
    }
    
    // Check bottom boundary
    if (top + paletteHeight > window.innerHeight) {
      top = rect.top - paletteHeight - 4;
    }
    
    // Ensure it doesn't go off the left edge
    left = Math.max(4, left);
    
    // Ensure it doesn't go off the top edge
    top = Math.max(4, top);
    
    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
    
    // Add "None" option
    const noneBtn = document.createElement('button');
    noneBtn.style.cssText = `
      width: 24px; height: 24px; border: 1px solid #ccc; border-radius: 3px;
      background: white; cursor: pointer; font-size: 10px; padding: 0;
    `;
    noneBtn.textContent = '×';
    noneBtn.title = 'No color';
    noneBtn.addEventListener('click', () => {
      store.updateVariable(nodeId, variableId, { color: null });
      palette.remove();
    });
    palette.appendChild(noneBtn);
    
    // Add color swatches
    colors.forEach(color => {
      const swatch = document.createElement('button');
      swatch.style.cssText = `
        width: 24px; height: 24px; border: 1px solid #ccc; border-radius: 3px;
        background: ${color}; cursor: pointer; padding: 0;
      `;
      swatch.addEventListener('click', () => {
        store.updateVariable(nodeId, variableId, { color });
        palette.remove();
      });
      palette.appendChild(swatch);
    });
    
    // Close on outside click
    const closeHandler = (e) => {
      if (!palette.contains(e.target) && e.target !== colorBtn) {
        palette.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    
    document.body.appendChild(palette);
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DataFlowApp();
});
